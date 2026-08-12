import { randomUUID } from 'node:crypto';
import {
  parseAutomationTarget,
  type AutomationTarget,
  type ComputerAutomationTarget,
} from '@neko/automation-contracts';
import type {
  AutomationMcpClientPort,
  AutomationTargetRevalidationPort,
} from './session-owned-mcp-runtime';
const REQUIRED_TARGET_TOOL_PROPERTIES = new Map<string, readonly string[]>([
  ['list_apps', Object.freeze([])],
  ['list_windows', Object.freeze(['pid', 'on_screen_only'])],
]);

export interface CuaDriverTargetClientFactoryPort {
  createTargetDiscoveryClient(): AutomationMcpClientPort;
}

export interface ComputerTargetDiscoveryPort extends AutomationTargetRevalidationPort {
  listCandidates(input: {
    readonly sessionId: string;
    readonly targetHint?: unknown;
    readonly signal?: AbortSignal;
  }): Promise<readonly ComputerAutomationTarget[]>;
}

export function createCuaDriverComputerTargetDiscovery(options: {
  readonly clients: CuaDriverTargetClientFactoryPort;
  readonly createTargetKey?: () => string;
}): ComputerTargetDiscoveryPort {
  const createTargetKey = options.createTargetKey ?? (() => `computer-target:${randomUUID()}`);
  return Object.freeze({
    async listCandidates(input: {
      readonly sessionId: string;
      readonly targetHint?: unknown;
      readonly signal?: AbortSignal;
    }) {
      return await withDiscoveryClient(options.clients, input.signal, async (client) => {
        await requireReviewedTargetTools(client, input.signal);
        const [appsResult, windowsResult] = await Promise.all([
          client.callTool({
            name: 'list_apps',
            arguments: {},
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          }),
          client.callTool({
            name: 'list_windows',
            arguments: { on_screen_only: true },
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          }),
        ]);
        const applications = parseRunningApplications(appsResult);
        const windows = parseVisibleWindows(windowsResult);
        const issuedTargetKeys = new Set<string>();
        const targets = windows.flatMap((window) => {
          const application = applications.get(window.processId);
          if (!application) return [];
          const targetKey = requireIssuedTargetKey(createTargetKey());
          if (issuedTargetKeys.has(targetKey)) {
            throw new Error(`Computer target issuer repeated opaque identity '${targetKey}'.`);
          }
          issuedTargetKeys.add(targetKey);
          const target = parseAutomationTarget({
            kind: 'computer',
            targetKey,
            applicationId: application.applicationId,
            processId: window.processId,
            windowId: String(window.windowId),
            label: window.title ? `${application.name} — ${window.title}` : application.name,
            region: window.region,
          });
          if (target.kind !== 'computer') {
            throw new Error('Cua Driver target projection produced a non-Computer target.');
          }
          return [target];
        });
        return Object.freeze(targets);
      });
    },

    async revalidate(input: { readonly target: AutomationTarget; readonly signal?: AbortSignal }) {
      if (input.target.kind !== 'computer') {
        throw new Error('Cua Driver target discovery requires a Computer Automation target.');
      }
      const expected = input.target;
      return await withDiscoveryClient(options.clients, input.signal, async (client) => {
        await requireReviewedTargetTools(client, input.signal);
        const [appsResult, windowsResult] = await Promise.all([
          client.callTool({
            name: 'list_apps',
            arguments: {},
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          }),
          client.callTool({
            name: 'list_windows',
            arguments: { pid: expected.processId, on_screen_only: true },
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          }),
        ]);
        const application = parseRunningApplications(appsResult).get(expected.processId);
        if (!application || application.applicationId !== expected.applicationId) {
          throw new Error('Cua Driver target application identity is no longer available.');
        }
        const window = parseVisibleWindows(windowsResult).find(
          (candidate) =>
            candidate.processId === expected.processId &&
            String(candidate.windowId) === expected.windowId,
        );
        if (!window) throw new Error('Cua Driver target window is no longer visible.');
        return parseAutomationTarget({
          ...expected,
          label: window.title ? `${application.name} — ${window.title}` : application.name,
          region: window.region,
        });
      });
    },
  });
}

async function withDiscoveryClient<T>(
  clients: CuaDriverTargetClientFactoryPort,
  signal: AbortSignal | undefined,
  operation: (client: AutomationMcpClientPort) => Promise<T>,
): Promise<T> {
  const client = clients.createTargetDiscoveryClient();
  let result: T;
  try {
    await client.connect({ ...(signal === undefined ? {} : { signal }) });
    result = await operation(client);
  } catch (operationError) {
    try {
      await client.disconnect();
    } catch (disconnectError) {
      throw new AggregateError(
        [operationError, disconnectError],
        'Cua Driver target discovery and cleanup both failed.',
      );
    }
    throw operationError;
  }
  await client.disconnect();
  return result;
}

async function requireReviewedTargetTools(
  client: AutomationMcpClientPort,
  signal?: AbortSignal,
): Promise<void> {
  const tools = await client.listTools({ ...(signal === undefined ? {} : { signal }) });
  const discovered = new Map(tools.map((tool) => [tool.name, tool]));
  for (const [name, requiredProperties] of REQUIRED_TARGET_TOOL_PROPERTIES) {
    const tool = discovered.get(name);
    if (!tool) throw new Error(`Cua Driver target Tool '${name}' is unavailable.`);
    if (!hasCompatibleInputSchema(tool.inputSchema, requiredProperties)) {
      throw new Error(`Cua Driver target Tool '${name}' structure is incompatible.`);
    }
    if (tool.annotations?.readOnlyHint === false || tool.annotations?.destructiveHint === true) {
      throw new Error(`Cua Driver target Tool '${name}' annotations are contradictory.`);
    }
  }
}

function hasCompatibleInputSchema(
  schema: Readonly<Record<string, unknown>>,
  requiredProperties: readonly string[],
): boolean {
  if (schema['type'] !== 'object') return false;
  const properties = schema['properties'];
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
    return requiredProperties.length === 0;
  }
  return requiredProperties.every((property) => Object.hasOwn(properties, property));
}

function parseRunningApplications(
  result: Awaited<ReturnType<AutomationMcpClientPort['callTool']>>,
): ReadonlyMap<number, { readonly applicationId: string; readonly name: string }> {
  requireSuccessfulResult(result, 'list_apps');
  const content = record(result.structuredContent, 'Cua Driver list_apps result');
  exactKeys(content, ['apps'], 'Cua Driver list_apps result');
  if (!Array.isArray(content['apps'])) throw new Error('Cua Driver applications are invalid.');
  const applications = new Map<number, { readonly applicationId: string; readonly name: string }>();
  for (const value of content['apps']) {
    const app = record(value, 'Cua Driver application');
    exactKeys(
      app,
      [
        'pid',
        'name',
        'bundle_id',
        'active',
        'running',
        'launch_path',
        'kind',
        'last_used',
        'windows',
      ],
      'Cua Driver application',
    );
    if (app['running'] !== true) continue;
    const processId = positiveSafeInteger(app['pid'], 'Cua Driver application pid');
    const applicationId = identity(app['bundle_id'], 'Cua Driver application bundle identity');
    const name = nonEmptyString(app['name'], 'Cua Driver application name');
    if (applications.has(processId)) {
      throw new Error(`Cua Driver returned duplicate running application pid '${processId}'.`);
    }
    applications.set(processId, Object.freeze({ applicationId, name }));
  }
  return applications;
}

function parseVisibleWindows(
  result: Awaited<ReturnType<AutomationMcpClientPort['callTool']>>,
): readonly {
  readonly processId: number;
  readonly windowId: number;
  readonly title: string;
  readonly region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}[] {
  requireSuccessfulResult(result, 'list_windows');
  const content = record(result.structuredContent, 'Cua Driver list_windows result');
  exactKeys(content, ['windows', 'current_space_id'], 'Cua Driver list_windows result');
  if (!Array.isArray(content['windows'])) throw new Error('Cua Driver windows are invalid.');
  const identities = new Set<string>();
  const windows = content['windows'].flatMap((value) => {
    const window = record(value, 'Cua Driver window');
    exactKeys(
      window,
      [
        'window_id',
        'pid',
        'app_name',
        'title',
        'bounds',
        'layer',
        'z_index',
        'is_on_screen',
        'current_space_id',
        'on_current_space',
        'space_ids',
      ],
      'Cua Driver window',
    );
    if (window['is_on_screen'] !== true || window['on_current_space'] !== true) return [];
    const processId = positiveSafeInteger(window['pid'], 'Cua Driver window pid');
    const windowId = positiveSafeInteger(window['window_id'], 'Cua Driver window identity');
    const bounds = record(window['bounds'], 'Cua Driver window bounds');
    exactKeys(bounds, ['x', 'y', 'width', 'height'], 'Cua Driver window bounds');
    const x = finiteNumber(bounds['x'], 'Cua Driver window x');
    const y = finiteNumber(bounds['y'], 'Cua Driver window y');
    const width = finiteNumber(bounds['width'], 'Cua Driver window width');
    const height = finiteNumber(bounds['height'], 'Cua Driver window height');
    if (width <= 0 || height <= 0) return [];
    const region = Object.freeze({ x, y, width, height });
    const key = `${processId}:${windowId}`;
    if (identities.has(key)) throw new Error(`Cua Driver returned duplicate window '${key}'.`);
    identities.add(key);
    return [
      Object.freeze({
        processId,
        windowId,
        title: stringValue(window['title'], 'Cua Driver window title'),
        region,
      }),
    ];
  });
  return Object.freeze(windows);
}

function requireSuccessfulResult(
  result: Awaited<ReturnType<AutomationMcpClientPort['callTool']>>,
  operation: string,
): void {
  if (result.isError === true || result.structuredContent === undefined) {
    throw new Error(`Cua Driver target operation '${operation}' failed.`);
  }
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} shape changed.`);
  }
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} is invalid.`);
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  const text = stringValue(value, label);
  if (text.trim().length === 0) throw new Error(`${label} is invalid.`);
  return text;
}

function identity(value: unknown, label: string): string {
  const text = nonEmptyString(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireIssuedTargetKey(value: string): string {
  if (!value || value.trim() !== value || /\s/u.test(value)) {
    throw new Error('Computer target issuer returned an invalid opaque identity.');
  }
  return value;
}
