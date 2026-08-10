import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { createAllMCPTools, MCPManager } from '@neko/agent-runtime';
import { createNodePiSkillHost, type SkillSourceRoot } from '@neko/agent-runtime/pi';
import type { MCPServerConfig } from '@neko/agent-contracts';
import type { Tool } from '@neko/agent-contracts';

import type {
  AgentExtensionCandidateQualificationPort,
  AgentExtensionSupportPort,
  AgentExtensionCatalogSnapshot,
  AgentExtensionRuntimeDescriptor,
  AgentExtensionRuntimeReadiness,
} from './extension-manager';
import {
  createPluginRuntimeContributionFingerprint,
  createPluginRuntimeSourceFingerprint,
} from './plugin-runtime-source-fingerprint';

export { createPluginRuntimeSourceFingerprint } from './plugin-runtime-source-fingerprint';

const MAX_MCP_DOCUMENT_BYTES = 1_000_000;
const DEFAULT_MCP_TIMEOUT_MS = 30_000;

export function createAgentExtensionSupport(
  options: {
    readonly processEnv?: Readonly<NodeJS.ProcessEnv>;
  } = {},
): AgentExtensionSupportPort {
  const processEnv = options.processEnv ?? process.env;
  return {
    async isSupported(descriptor) {
      if (descriptor.skillRoot && (await validatePluginSkillRoot(descriptor))) {
        return true;
      }
      const mcp = await parsePluginMcpDocument(descriptor, processEnv);
      return mcp.servers.length > 0;
    },
  };
}

export function createAgentExtensionCandidateQualification(
  options: {
    readonly processEnv?: Readonly<NodeJS.ProcessEnv>;
  } = {},
): AgentExtensionCandidateQualificationPort {
  return {
    async qualify({ operationId, descriptor, signal }) {
      signal.throwIfAborted();
      const runtime = await buildAgentPluginRuntime(
        {
          records: [],
          runtimeDescriptors: [descriptor],
          diagnostics: [],
        },
        options,
      );
      try {
        signal.throwIfAborted();
        const readiness = runtime.readiness.get(descriptor.pluginId);
        if (!readiness || readiness.status !== 'ready') {
          throw new Error(
            `OpenNeko extension '${descriptor.pluginId}' update candidate is not qualified: ${readiness?.diagnosticCode ?? 'runtime-unavailable'}.`,
          );
        }
      } catch (error) {
        try {
          await runtime.dispose();
        } catch (disposeError) {
          throw new AggregateError(
            [error, disposeError],
            `OpenNeko extension '${descriptor.pluginId}' candidate qualification and cleanup failed.`,
          );
        }
        throw error;
      }
      let open = true;
      return Object.freeze({
        async close() {
          if (!open) {
            throw new Error(
              `Extension update candidate qualification '${operationId}' is already closed.`,
            );
          }
          open = false;
          await runtime.dispose();
        },
      });
    },
  };
}

export interface AgentPluginRuntime {
  readonly sourceFingerprint: string;
  readonly contributions: ReadonlyMap<string, AgentPluginRuntimeContribution>;
  readonly skillRoots: readonly SkillSourceRoot[];
  readonly tools: readonly Tool[];
  readonly readiness: ReadonlyMap<string, AgentExtensionRuntimeReadiness>;
  dispose(): Promise<void>;
}

export interface AgentPluginRuntimeContribution {
  readonly pluginId: string;
  readonly sourceFingerprint: string;
  readonly mcpServerConflict: boolean;
  readonly mcpServerIds: readonly string[];
  readonly skillRoots: readonly SkillSourceRoot[];
  readonly tools: readonly Tool[];
  readonly readiness: AgentExtensionRuntimeReadiness;
  dispose(): Promise<void>;
}

export async function buildAgentPluginRuntime(
  snapshot: AgentExtensionCatalogSnapshot,
  options: {
    readonly processEnv?: Readonly<NodeJS.ProcessEnv>;
  } = {},
): Promise<AgentPluginRuntime> {
  return reconcileAgentPluginRuntime(undefined, snapshot, options);
}

export async function reconcileAgentPluginRuntime(
  previous: AgentPluginRuntime | undefined,
  snapshot: AgentExtensionCatalogSnapshot,
  options: {
    readonly processEnv?: Readonly<NodeJS.ProcessEnv>;
  } = {},
): Promise<AgentPluginRuntime> {
  const processEnv = options.processEnv ?? process.env;
  const contributions = new Map<string, AgentPluginRuntimeContribution>();
  const created: AgentPluginRuntimeContribution[] = [];
  try {
    const descriptors = [...snapshot.runtimeDescriptors].sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId),
    );
    const conflictedPluginIds = findConflictedMcpServerPluginIds(descriptors);
    assertNoChangedContributionConflictsWithRetainedRuntime(
      previous,
      snapshot,
      descriptors,
      conflictedPluginIds,
    );
    for (const descriptor of descriptors) {
      if (contributions.has(descriptor.pluginId)) {
        throw new Error(`Plugin runtime contribution '${descriptor.pluginId}' is duplicated.`);
      }
      const sourceFingerprint = createPluginRuntimeContributionFingerprint(snapshot, descriptor);
      const existing = previous?.contributions.get(descriptor.pluginId);
      const mcpServerConflict = conflictedPluginIds.has(descriptor.pluginId);
      if (
        existing?.sourceFingerprint === sourceFingerprint &&
        existing.mcpServerConflict === mcpServerConflict
      ) {
        contributions.set(descriptor.pluginId, existing);
        continue;
      }
      const contribution = await buildAgentPluginRuntimeContribution(
        descriptor,
        sourceFingerprint,
        processEnv,
        mcpServerConflict,
      );
      contributions.set(descriptor.pluginId, contribution);
      created.push(contribution);
    }
    return createAgentPluginRuntime(snapshot, contributions);
  } catch (error) {
    const cleanup = await Promise.allSettled(created.map((contribution) => contribution.dispose()));
    const cleanupErrors = cleanup.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Failed to build and dispose a Desktop plugin runtime.',
      );
    }
    throw error;
  }
}

export function listChangedAgentPluginRuntimeIds(
  previous: AgentPluginRuntime | undefined,
  next: AgentPluginRuntime,
): readonly string[] {
  const pluginIds = new Set([
    ...(previous?.contributions.keys() ?? []),
    ...next.contributions.keys(),
  ]);
  return Object.freeze(
    [...pluginIds]
      .filter(
        (pluginId) => previous?.contributions.get(pluginId) !== next.contributions.get(pluginId),
      )
      .sort(),
  );
}

export function listChangedPluginRuntimeSourceIds(
  previous: AgentPluginRuntime | undefined,
  snapshot: AgentExtensionCatalogSnapshot,
): readonly string[] {
  const descriptors = new Map(
    snapshot.runtimeDescriptors.map((descriptor) => [descriptor.pluginId, descriptor] as const),
  );
  const pluginIds = new Set([...(previous?.contributions.keys() ?? []), ...descriptors.keys()]);
  return Object.freeze(
    [...pluginIds]
      .filter((pluginId) => {
        const descriptor = descriptors.get(pluginId);
        if (!descriptor) return previous?.contributions.has(pluginId) === true;
        return (
          previous?.contributions.get(pluginId)?.sourceFingerprint !==
          createPluginRuntimeContributionFingerprint(snapshot, descriptor)
        );
      })
      .sort(),
  );
}

export async function disposeAgentPluginRuntimeChanges(
  runtime: AgentPluginRuntime | undefined,
  retained: AgentPluginRuntime | undefined,
): Promise<void> {
  if (!runtime) return;
  const retainedContributions = new Set(retained?.contributions.values() ?? []);
  const results = await Promise.allSettled(
    [...runtime.contributions.values()]
      .filter((contribution) => !retainedContributions.has(contribution))
      .map((contribution) => contribution.dispose()),
  );
  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to dispose replaced Desktop plugin contributions.');
  }
}

async function buildAgentPluginRuntimeContribution(
  descriptor: AgentExtensionRuntimeDescriptor,
  sourceFingerprint: string,
  processEnv: Readonly<NodeJS.ProcessEnv>,
  mcpServerConflict: boolean,
): Promise<AgentPluginRuntimeContribution> {
  const mcpManager = new MCPManager();
  try {
    const skillRoots: SkillSourceRoot[] = [];
    const state: PluginContributionState = {
      descriptor,
      skillReady: false,
      mcpServerIds: [],
      connectedServerIds: [],
      unsupported: [],
      failures: [],
    };
    if (descriptor.skillRoot) {
      const skillResult = await validatePluginSkillRoot(descriptor);
      if (skillResult) {
        skillRoots.push(skillResult);
        state.skillReady = true;
      } else {
        state.failures.push('skill-invalid');
      }
    }
    if (descriptor.appIds.length > 0) state.unsupported.push('app-unsupported');
    if (mcpServerConflict) {
      state.failures.push('mcp-server-conflict');
    } else if (descriptor.mcpDocumentPath) {
      const parsed = await parsePluginMcpDocument(descriptor, processEnv);
      state.unsupported.push(...parsed.unsupported);
      state.failures.push(...parsed.failures);
      state.mcpServerIds.push(...parsed.servers.map((server) => server.id));
      if (descriptor.mcpToolExposure !== 'adapter-only') {
        for (const server of parsed.servers) mcpManager.register(server);
      }
    }
    for (const server of mcpManager.listServers()) {
      try {
        await mcpManager.connect(server.id);
        state.connectedServerIds.push(server.id);
      } catch {
        state.failures.push('mcp-connect-failed');
      }
    }
    const tools = await createAllMCPTools(mcpManager);
    assertUniqueToolNames(tools);
    let disposal: Promise<void> | undefined;
    return Object.freeze({
      pluginId: descriptor.pluginId,
      sourceFingerprint,
      mcpServerConflict,
      mcpServerIds: Object.freeze(
        descriptor.mcpToolExposure === 'adapter-only' ? [] : [...state.mcpServerIds],
      ),
      skillRoots: Object.freeze(skillRoots),
      tools: Object.freeze(tools),
      readiness: projectReadiness(state),
      async dispose() {
        disposal ??= mcpManager.dispose().catch((error: unknown) => {
          disposal = undefined;
          throw error;
        });
        await disposal;
      },
    });
  } catch (error) {
    try {
      await mcpManager.dispose();
    } catch (disposeError) {
      throw new AggregateError(
        [error, disposeError],
        `Failed to build and dispose plugin contribution '${descriptor.pluginId}'.`,
      );
    }
    throw error;
  }
}

function findConflictedMcpServerPluginIds(
  descriptors: readonly AgentExtensionRuntimeDescriptor[],
): ReadonlySet<string> {
  const owners = new Map<string, string>();
  const conflicted = new Set<string>();
  for (const descriptor of descriptors) {
    if (descriptor.mcpToolExposure === 'adapter-only') continue;
    for (const serverId of new Set(descriptor.mcpServerIds)) {
      const owner = owners.get(serverId);
      if (owner) {
        conflicted.add(owner);
        conflicted.add(descriptor.pluginId);
      } else {
        owners.set(serverId, descriptor.pluginId);
      }
    }
  }
  return conflicted;
}

function assertNoChangedContributionConflictsWithRetainedRuntime(
  previous: AgentPluginRuntime | undefined,
  snapshot: AgentExtensionCatalogSnapshot,
  descriptors: readonly AgentExtensionRuntimeDescriptor[],
  conflictedPluginIds: ReadonlySet<string>,
): void {
  if (!previous || conflictedPluginIds.size === 0) return;
  const descriptorByPluginId = new Map(
    descriptors.map((descriptor) => [descriptor.pluginId, descriptor] as const),
  );
  const retainedConflictedPluginId = [...conflictedPluginIds].find((pluginId) => {
    const descriptor = descriptorByPluginId.get(pluginId);
    const contribution = previous.contributions.get(pluginId);
    return (
      descriptor !== undefined &&
      contribution !== undefined &&
      !contribution.mcpServerConflict &&
      contribution.sourceFingerprint ===
        createPluginRuntimeContributionFingerprint(snapshot, descriptor)
    );
  });
  if (retainedConflictedPluginId) {
    throw new Error(
      `Plugin MCP Server conflict would replace authoritative contribution '${retainedConflictedPluginId}'.`,
    );
  }
}

function createAgentPluginRuntime(
  snapshot: AgentExtensionCatalogSnapshot,
  contributions: ReadonlyMap<string, AgentPluginRuntimeContribution>,
): AgentPluginRuntime {
  const serverOwners = new Map<string, string>();
  const toolOwners = new Map<string, string>();
  for (const contribution of contributions.values()) {
    for (const serverId of contribution.mcpServerIds) {
      const owner = serverOwners.get(serverId);
      if (owner) {
        throw new Error(
          `Plugin MCP Server '${serverId}' is declared by both '${owner}' and '${contribution.pluginId}'.`,
        );
      }
      serverOwners.set(serverId, contribution.pluginId);
    }
    for (const tool of contribution.tools) {
      const owner = toolOwners.get(tool.name);
      if (owner) {
        throw new Error(
          `Plugin Tool '${tool.name}' is declared by both '${owner}' and '${contribution.pluginId}'.`,
        );
      }
      toolOwners.set(tool.name, contribution.pluginId);
    }
  }
  const ordered = [...contributions.values()].sort((left, right) =>
    left.pluginId.localeCompare(right.pluginId),
  );
  const runtime: AgentPluginRuntime = {
    sourceFingerprint: createPluginRuntimeSourceFingerprint(snapshot),
    contributions: new Map(ordered.map((contribution) => [contribution.pluginId, contribution])),
    skillRoots: Object.freeze(ordered.flatMap((contribution) => contribution.skillRoots)),
    tools: Object.freeze(ordered.flatMap((contribution) => contribution.tools)),
    readiness: new Map(
      ordered.map((contribution) => [contribution.pluginId, contribution.readiness]),
    ),
    dispose: () => disposeAgentPluginRuntimeChanges(runtime, undefined),
  };
  return Object.freeze(runtime);
}

interface PluginContributionState {
  readonly descriptor: AgentExtensionRuntimeDescriptor;
  skillReady: boolean;
  readonly mcpServerIds: string[];
  readonly connectedServerIds: string[];
  readonly unsupported: string[];
  readonly failures: string[];
}

interface ParsedPluginMcpDocument {
  readonly servers: readonly MCPServerConfig[];
  readonly unsupported: readonly string[];
  readonly failures: readonly string[];
}

export async function parsePluginMcpDocument(
  descriptor: AgentExtensionRuntimeDescriptor,
  processEnv: Readonly<NodeJS.ProcessEnv>,
): Promise<ParsedPluginMcpDocument> {
  if (!descriptor.mcpDocumentPath) return { servers: [], unsupported: [], failures: [] };
  const document = await readMcpDocument(descriptor);
  if (!document) return { servers: [], unsupported: [], failures: ['mcp-invalid'] };
  const servers: MCPServerConfig[] = [];
  const unsupported: string[] = [];
  const failures: string[] = [];
  for (const [serverId, value] of Object.entries(document)) {
    if (!descriptor.mcpServerIds.includes(serverId) || !isRecord(value)) {
      failures.push('mcp-invalid');
      continue;
    }
    if (value['oauth_resource'] !== undefined) {
      unsupported.push('oauth-unsupported');
      continue;
    }
    const type = value['type'];
    if (type === 'http' || (type === undefined && typeof value['url'] === 'string')) {
      const parsed = parseHttpServer(serverId, value, processEnv);
      if (parsed.status === 'ok') servers.push(parsed.server);
      else if (parsed.status === 'unsupported') unsupported.push(parsed.code);
      else failures.push(parsed.code);
      continue;
    }
    if (type !== undefined && type !== 'stdio') {
      unsupported.push('transport-unsupported');
      continue;
    }
    const parsed = await parseStdioServer(serverId, value, descriptor.pluginRoot, processEnv);
    if (parsed) servers.push(parsed);
    else failures.push('mcp-invalid');
  }
  return {
    servers: Object.freeze(servers),
    unsupported: Object.freeze(unsupported),
    failures: Object.freeze(failures),
  };
}

async function validatePluginSkillRoot(
  descriptor: AgentExtensionRuntimeDescriptor,
): Promise<SkillSourceRoot | undefined> {
  if (!descriptor.skillRoot) return undefined;
  const root: SkillSourceRoot = {
    path: descriptor.skillRoot,
    source: { kind: 'plugin', pluginId: descriptor.pluginId },
    entryPointKind: 'skill',
  };
  const snapshot = await createNodePiSkillHost({
    cwd: descriptor.pluginRoot,
    policy: {
      isTrusted: () => true,
      isEnabled: () => true,
    },
  }).discover([root]);
  return snapshot.records.length > 0 &&
    snapshot.diagnostics.length === 0 &&
    snapshot.warnings.length === 0
    ? root
    : undefined;
}

async function readMcpDocument(
  descriptor: AgentExtensionRuntimeDescriptor,
): Promise<Record<string, unknown> | undefined> {
  const filePath = descriptor.mcpDocumentPath;
  if (!filePath) return undefined;
  try {
    const [canonicalRoot, canonicalFile, info] = await Promise.all([
      realpath(descriptor.pluginRoot),
      realpath(filePath),
      lstat(filePath),
    ]);
    if (
      !isInside(canonicalRoot, canonicalFile) ||
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > MAX_MCP_DOCUMENT_BYTES
    ) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(await readFile(canonicalFile, 'utf8'));
    if (!isRecord(parsed) || !isRecord(parsed['mcpServers'])) return undefined;
    return parsed['mcpServers'];
  } catch {
    return undefined;
  }
}

async function parseStdioServer(
  serverId: string,
  value: Record<string, unknown>,
  pluginRoot: string,
  processEnv: Readonly<NodeJS.ProcessEnv>,
): Promise<MCPServerConfig | undefined> {
  if (typeof value['command'] !== 'string' || value['command'].trim().length === 0) {
    return undefined;
  }
  const command = resolveContainedPath(pluginRoot, value['command']);
  if (!command) return undefined;
  try {
    const [canonicalRoot, canonicalCommand, info] = await Promise.all([
      realpath(pluginRoot),
      realpath(command),
      lstat(command),
    ]);
    if (!isInside(canonicalRoot, canonicalCommand) || !info.isFile() || info.isSymbolicLink()) {
      return undefined;
    }
    await access(canonicalCommand, constants.X_OK);
  } catch {
    return undefined;
  }
  const cwdValue = value['cwd'] ?? '.';
  if (typeof cwdValue !== 'string') return undefined;
  const cwd = resolveContainedPath(pluginRoot, cwdValue);
  if (!cwd || !(await isRegularDirectoryInside(pluginRoot, cwd))) return undefined;
  const args = parseStringArray(value['args']);
  if (args === undefined) return undefined;
  const env = parseEnvironment(value['env'], value['env_vars'], processEnv);
  if (!env) return undefined;
  return {
    id: serverId,
    name: serverId,
    description: `Plugin MCP Server ${serverId}`,
    category: 'other',
    transport: 'stdio',
    command,
    args,
    env,
    cwd,
    inheritProcessEnv: false,
    enabled: true,
    requestTimeout: DEFAULT_MCP_TIMEOUT_MS,
  };
}

function parseHttpServer(
  serverId: string,
  value: Record<string, unknown>,
  processEnv: Readonly<NodeJS.ProcessEnv>,
):
  | { readonly status: 'ok'; readonly server: MCPServerConfig }
  | { readonly status: 'unsupported'; readonly code: string }
  | { readonly status: 'error'; readonly code: string } {
  if (typeof value['url'] !== 'string') return { status: 'error', code: 'mcp-invalid' };
  let url: URL;
  try {
    url = new URL(value['url']);
  } catch {
    return { status: 'error', code: 'mcp-invalid' };
  }
  if (url.protocol !== 'https:') return { status: 'error', code: 'mcp-invalid' };
  const bearerName = value['bearer_token_env_var'];
  let headers: Record<string, string> | undefined;
  if (bearerName !== undefined) {
    if (!isEnvironmentName(bearerName)) return { status: 'error', code: 'mcp-invalid' };
    const token = processEnv[bearerName];
    if (!token) return { status: 'error', code: 'mcp-auth-missing' };
    headers = { Authorization: `Bearer ${token}` };
  }
  return {
    status: 'ok',
    server: {
      id: serverId,
      name: serverId,
      description: `Plugin MCP Server ${serverId}`,
      category: 'other',
      transport: 'http',
      url: url.toString(),
      ...(headers === undefined ? {} : { headers }),
      enabled: true,
      requestTimeout: DEFAULT_MCP_TIMEOUT_MS,
    },
  };
}

function parseEnvironment(
  staticValue: unknown,
  inheritedValue: unknown,
  processEnv: Readonly<NodeJS.ProcessEnv>,
): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  for (const name of ['HOME', 'PATH', 'TMPDIR'] as const) {
    const value = processEnv[name];
    if (value) env[name] = value;
  }
  if (staticValue !== undefined) {
    if (!isRecord(staticValue)) return undefined;
    for (const [name, value] of Object.entries(staticValue)) {
      if (!isEnvironmentName(name) || typeof value !== 'string') return undefined;
      env[name] = value;
    }
  }
  if (inheritedValue !== undefined) {
    const names = parseStringArray(inheritedValue);
    if (!names || names.some((name) => !isEnvironmentName(name))) return undefined;
    for (const name of names) {
      const value = processEnv[name];
      if (value !== undefined) env[name] = value;
    }
  }
  return env;
}

function projectReadiness(state: PluginContributionState): AgentExtensionRuntimeReadiness {
  const mcpReady =
    state.mcpServerIds.length > 0 && state.mcpServerIds.length === state.connectedServerIds.length;
  const anyReady = state.skillReady || state.connectedServerIds.length > 0;
  const adapterOnly = state.descriptor.mcpToolExposure === 'adapter-only';
  if (state.failures.length > 0) {
    return {
      status: anyReady ? 'partial' : 'error',
      diagnosticCode: state.failures[0] ?? 'runtime-failed',
      dependencyStatus: 'error',
      hostPermissionStatus: adapterOnly ? 'unknown' : 'not-applicable',
      qualificationStatus: anyReady ? 'partial' : 'failed',
    };
  }
  if (state.unsupported.length > 0) {
    return {
      status: anyReady ? 'partial' : 'unsupported',
      diagnosticCode: state.unsupported[0] ?? 'runtime-unsupported',
      dependencyStatus: anyReady ? 'ready' : 'error',
      hostPermissionStatus: adapterOnly ? 'unknown' : 'not-applicable',
      qualificationStatus: anyReady ? 'partial' : 'failed',
    };
  }
  if (adapterOnly) {
    return {
      status: state.skillReady ? 'partial' : 'unsupported',
      diagnosticCode: 'automation-adapter-unavailable',
      dependencyStatus: 'unchecked',
      hostPermissionStatus: 'unknown',
      qualificationStatus: state.skillReady ? 'partial' : 'unqualified',
    };
  }
  if (state.skillReady || mcpReady) {
    return {
      status: 'ready',
      diagnosticCode: '',
      dependencyStatus: 'ready',
      hostPermissionStatus: 'not-applicable',
      qualificationStatus: 'qualified',
    };
  }
  return {
    status: 'unsupported',
    diagnosticCode: 'no-agent-contribution',
    dependencyStatus: 'error',
    hostPermissionStatus: 'not-applicable',
    qualificationStatus: 'failed',
  };
}

function assertUniqueToolNames(tools: readonly Tool[]): void {
  const names = new Set<string>();
  for (const tool of tools) {
    if (names.has(tool.name)) throw new Error(`Plugin Tool '${tool.name}' is duplicated.`);
    names.add(tool.name);
  }
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return undefined;
  return [...value];
}

function resolveContainedPath(pluginRoot: string, path: string): string | undefined {
  if (isAbsolute(path)) return undefined;
  const resolved = resolve(pluginRoot, path);
  return isInsideOrEqual(pluginRoot, resolved) ? resolved : undefined;
}

async function isRegularDirectoryInside(root: string, target: string): Promise<boolean> {
  try {
    const [canonicalRoot, canonicalTarget, info] = await Promise.all([
      realpath(root),
      realpath(target),
      lstat(target),
    ]);
    return (
      isInsideOrEqual(canonicalRoot, canonicalTarget) &&
      info.isDirectory() &&
      !info.isSymbolicLink()
    );
  } catch {
    return false;
  }
}

function isEnvironmentName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z_][A-Z0-9_]*$/u.test(value);
}

function isInside(root: string, target: string): boolean {
  const fromRoot = relative(resolve(root), resolve(target));
  return fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot);
}

function isInsideOrEqual(root: string, target: string): boolean {
  const fromRoot = relative(resolve(root), resolve(target));
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
