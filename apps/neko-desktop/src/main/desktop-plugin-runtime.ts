import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { createAllMCPTools, MCPManager } from '@neko/agent-runtime';
import { createNodePiSkillHost, type SkillSourceRoot } from '@neko/agent-runtime/pi';
import type { MCPServerConfig } from '@neko/agent-contracts';
import type { Tool } from '@neko/agent-contracts';

import type {
  DesktopExtensionAgentSupportPort,
  DesktopExtensionCatalogSnapshot,
  DesktopExtensionRuntimeDescriptor,
  DesktopExtensionRuntimeReadiness,
} from './desktop-extension-manager';

const MAX_MCP_DOCUMENT_BYTES = 1_000_000;
const DEFAULT_MCP_TIMEOUT_MS = 30_000;

export function createDesktopExtensionAgentSupport(
  options: {
    readonly processEnv?: Readonly<NodeJS.ProcessEnv>;
  } = {},
): DesktopExtensionAgentSupportPort {
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

export interface DesktopPluginRuntimeGeneration {
  readonly revision: string;
  readonly skillRoots: readonly SkillSourceRoot[];
  readonly tools: readonly Tool[];
  readonly readiness: ReadonlyMap<string, DesktopExtensionRuntimeReadiness>;
  dispose(): Promise<void>;
}

export async function buildDesktopPluginRuntimeGeneration(
  snapshot: DesktopExtensionCatalogSnapshot,
  options: {
    readonly processEnv?: Readonly<NodeJS.ProcessEnv>;
  } = {},
): Promise<DesktopPluginRuntimeGeneration> {
  const processEnv = options.processEnv ?? process.env;
  const mcpManager = new MCPManager();
  try {
    const skillRoots: SkillSourceRoot[] = [];
    const readiness = new Map<string, DesktopExtensionRuntimeReadiness>();
    const contributionStates = new Map<string, PluginContributionState>();
    const serverOwners = new Map<string, string>();
    const conflictedServerIds = new Set<string>();

    for (const descriptor of snapshot.runtimeDescriptors) {
      const state: PluginContributionState = {
        descriptor,
        skillReady: false,
        mcpServerIds: [],
        connectedServerIds: [],
        unsupported: [],
        failures: [],
      };
      contributionStates.set(descriptor.pluginId, state);

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
      if (descriptor.mcpDocumentPath) {
        const parsed = await parsePluginMcpDocument(descriptor, processEnv);
        state.unsupported.push(...parsed.unsupported);
        state.failures.push(...parsed.failures);
        for (const server of parsed.servers) {
          if (conflictedServerIds.has(server.id)) {
            state.failures.push('mcp-server-conflict');
            continue;
          }
          const existingOwner = serverOwners.get(server.id);
          if (existingOwner) {
            state.failures.push('mcp-server-conflict');
            const existingState = contributionStates.get(existingOwner);
            existingState?.failures.push('mcp-server-conflict');
            if (existingState) {
              const index = existingState.mcpServerIds.indexOf(server.id);
              if (index >= 0) existingState.mcpServerIds.splice(index, 1);
            }
            mcpManager.unregister(server.id);
            serverOwners.delete(server.id);
            conflictedServerIds.add(server.id);
            continue;
          }
          serverOwners.set(server.id, descriptor.pluginId);
          state.mcpServerIds.push(server.id);
          mcpManager.register(server);
        }
      }
    }

    for (const server of mcpManager.listServers()) {
      const owner = serverOwners.get(server.id);
      if (!owner) throw new Error(`Plugin MCP Server '${server.id}' has no owner.`);
      const state = contributionStates.get(owner);
      if (!state) throw new Error(`Plugin '${owner}' runtime state is unavailable.`);
      try {
        await mcpManager.connect(server.id);
        state.connectedServerIds.push(server.id);
      } catch {
        state.failures.push('mcp-connect-failed');
      }
    }

    const tools = await createAllMCPTools(mcpManager);
    assertUniqueToolNames(tools);
    for (const state of contributionStates.values()) {
      readiness.set(state.descriptor.pluginId, projectReadiness(state));
    }

    return Object.freeze({
      revision: snapshot.revision,
      skillRoots: Object.freeze(skillRoots),
      tools: Object.freeze(tools),
      readiness,
      dispose: () => mcpManager.dispose(),
    });
  } catch (error) {
    try {
      await mcpManager.dispose();
    } catch (disposeError) {
      throw new AggregateError(
        [error, disposeError],
        'Failed to build and dispose a Desktop plugin runtime generation.',
      );
    }
    throw error;
  }
}

interface PluginContributionState {
  readonly descriptor: DesktopExtensionRuntimeDescriptor;
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
  descriptor: DesktopExtensionRuntimeDescriptor,
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
  descriptor: DesktopExtensionRuntimeDescriptor,
): Promise<SkillSourceRoot | undefined> {
  if (!descriptor.skillRoot) return undefined;
  const root: SkillSourceRoot = {
    path: descriptor.skillRoot,
    source: { kind: 'plugin', pluginId: descriptor.pluginId },
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
  descriptor: DesktopExtensionRuntimeDescriptor,
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

function projectReadiness(state: PluginContributionState): DesktopExtensionRuntimeReadiness {
  const mcpReady =
    state.mcpServerIds.length > 0 && state.mcpServerIds.length === state.connectedServerIds.length;
  const anyReady = state.skillReady || state.connectedServerIds.length > 0;
  if (state.failures.length > 0) {
    return {
      status: anyReady ? 'partial' : 'error',
      diagnosticCode: state.failures[0] ?? 'runtime-failed',
    };
  }
  if (state.unsupported.length > 0) {
    return {
      status: anyReady ? 'partial' : 'unsupported',
      diagnosticCode: state.unsupported[0] ?? 'runtime-unsupported',
    };
  }
  if (state.skillReady || mcpReady) return { status: 'ready', diagnosticCode: '' };
  return { status: 'unsupported', diagnosticCode: 'no-agent-contribution' };
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
