import { mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  MCPRequestOptions,
  MCPServerConfig,
  MCPToolDefinition,
  MCPToolResult,
} from '@neko/agent-contracts';
import { createMCPClient } from '@neko/agent-runtime';
import type {
  AutomationMcpCallResult,
  AutomationMcpClientFactoryPort,
  AutomationMcpClientPort,
  AutomationMcpToolDefinition,
} from '@neko/automation-node';

export interface DesktopCuaDriverRuntimeLayout {
  readonly runtimeRoot: string;
  readonly executablePath: string;
  readonly binaryPath: string;
}

interface DesktopCuaDriverMcpClient {
  connect(options?: MCPRequestOptions): Promise<void>;
  disconnect(): Promise<void>;
  listTools(options?: MCPRequestOptions): Promise<MCPToolDefinition[]>;
  callTool(
    name: string,
    args: Record<string, unknown>,
    options?: MCPRequestOptions,
  ): Promise<MCPToolResult>;
}

export function createDesktopCuaDriverMcpClientFactory(options: {
  readonly runtime: DesktopCuaDriverRuntimeLayout;
  readonly storageRoot: string;
  readonly platform?: NodeJS.Platform;
  readonly createClient?: (config: MCPServerConfig) => DesktopCuaDriverMcpClient;
}): AutomationMcpClientFactoryPort {
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') {
    throw new Error(`Cua Driver Computer Use is unavailable on '${platform}'.`);
  }
  validateLayout(options.runtime, options.storageRoot);
  const createClient = options.createClient ?? ((config) => createMCPClient(config));

  const factory: AutomationMcpClientFactoryPort = {
    createQualificationClient: () =>
      createPreparedClient({
        id: 'qualification',
        applicationId: 'invalid.openneko.qualification',
        timeoutMs: 30_000,
        removeDataOnDisconnect: true,
        runtime: options.runtime,
        storageRoot: options.storageRoot,
        createClient,
      }),
    createSessionClient: (input) => {
      if (input.target.kind !== 'computer') {
        throw new Error('Cua Driver requires a Computer Automation target.');
      }
      if (input.mode !== 'observe') {
        throw new Error(`Cua Driver mode '${input.mode}' is not qualified.`);
      }
      return createPreparedClient({
        id: input.sessionId,
        applicationId: input.target.applicationId,
        timeoutMs: input.timeoutMs,
        removeDataOnDisconnect: true,
        runtime: options.runtime,
        storageRoot: options.storageRoot,
        createClient,
      });
    },
  };
  return Object.freeze(factory);
}

function createPreparedClient(input: {
  readonly id: string;
  readonly applicationId: string;
  readonly timeoutMs: number;
  readonly removeDataOnDisconnect: boolean;
  readonly runtime: DesktopCuaDriverRuntimeLayout;
  readonly storageRoot: string;
  readonly createClient: (config: MCPServerConfig) => DesktopCuaDriverMcpClient;
}): AutomationMcpClientPort {
  let client: DesktopCuaDriverMcpClient | undefined;
  let sessionRoot: string | undefined;
  return {
    async connect({ signal } = {}) {
      if (client) throw new Error(`Cua Driver MCP client '${input.id}' is already connected.`);
      if (signal?.aborted) throw signal.reason;
      await validateInstalledRuntime(input.runtime);
      const prepared = await prepareConfiguration(input);
      sessionRoot = prepared.sessionRoot;
      if (signal?.aborted) throw signal.reason;
      const created = input.createClient(prepared.config);
      client = created;
      try {
        await created.connect({ ...(signal === undefined ? {} : { signal }) });
      } catch (error) {
        client = undefined;
        try {
          await created.disconnect();
        } catch {
          // The connection failure remains authoritative.
        }
        throw error;
      }
    },
    async disconnect() {
      const connected = client;
      client = undefined;
      let disconnectError: unknown;
      try {
        await connected?.disconnect();
      } catch (error) {
        disconnectError = error;
      }
      if (input.removeDataOnDisconnect && sessionRoot) {
        try {
          await rm(sessionRoot, { recursive: true, force: false });
        } catch (error) {
          if (disconnectError === undefined) throw error;
        }
      }
      if (disconnectError !== undefined) throw disconnectError;
    },
    async listTools({ signal } = {}) {
      const tools = await requireClient(client, input.id).listTools({
        ...(signal === undefined ? {} : { signal }),
      });
      return Object.freeze(tools.map(projectToolDefinition));
    },
    async callTool({ name, arguments: args, signal }) {
      const result = await requireClient(client, input.id).callTool(
        name,
        { ...args },
        {
          ...(signal === undefined ? {} : { signal }),
        },
      );
      return projectToolResult(result);
    },
  };
}

async function prepareConfiguration(input: {
  readonly id: string;
  readonly applicationId: string;
  readonly timeoutMs: number;
  readonly runtime: DesktopCuaDriverRuntimeLayout;
  readonly storageRoot: string;
}): Promise<{ readonly config: MCPServerConfig; readonly sessionRoot: string }> {
  const ownerRoot = path.join(input.storageRoot, 'sessions');
  await mkdir(ownerRoot, { recursive: true, mode: 0o700 });
  const sessionRoot = path.join(ownerRoot, safeSegment(input.id));
  await mkdir(sessionRoot, { recursive: false, mode: 0o700 });
  const home = path.join(sessionRoot, 'home');
  const temporary = path.join(sessionRoot, 'temporary');
  await Promise.all([
    mkdir(home, { recursive: false, mode: 0o700 }),
    mkdir(temporary, { recursive: false, mode: 0o700 }),
  ]);
  const policyPath = path.join(sessionRoot, 'bounded-policy.json');
  await writeFile(
    policyPath,
    JSON.stringify({
      version: 2,
      mode: 'bounded',
      allow: { tools: ['verify_state'] },
      resources: {
        apps: [{ bundle_id: requireBundleId(input.applicationId), windows: 'all' }],
        desktop: { display: false },
      },
    }),
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );
  return {
    sessionRoot,
    config: {
      id: `cua-driver:${input.id}`,
      name: 'Cua Driver',
      description: 'Contained reviewed Cua Driver Computer Use runtime',
      category: 'productivity',
      transport: 'stdio',
      command: input.runtime.executablePath,
      args: ['mcp', '--direct'],
      cwd: sessionRoot,
      inheritProcessEnv: false,
      env: {
        HOME: home,
        TMPDIR: temporary,
        TMP: temporary,
        TEMP: temporary,
        PATH: input.runtime.binaryPath,
        CUA_DRIVER_PERMISSION_MODE: 'bounded',
        CUA_DRIVER_SESSION_POLICY_FILE: policyPath,
        CUA_DRIVER_SESSION_POLICY_APPROVED: '1',
        CUA_DRIVER_TELEMETRY_DISABLED: '1',
      },
      enabled: true,
      requestTimeout: input.timeoutMs,
    },
  };
}

function projectToolDefinition(tool: MCPToolDefinition): AutomationMcpToolDefinition {
  return Object.freeze({
    name: tool.name,
    inputSchema: tool.inputSchema,
    ...(tool.annotations === undefined
      ? {}
      : {
          annotations: Object.freeze({
            ...(tool.annotations.readOnlyHint === undefined
              ? {}
              : { readOnlyHint: tool.annotations.readOnlyHint }),
            ...(tool.annotations.destructiveHint === undefined
              ? {}
              : { destructiveHint: tool.annotations.destructiveHint }),
          }),
        }),
  });
}

function projectToolResult(result: MCPToolResult): AutomationMcpCallResult {
  return Object.freeze({
    content: Object.freeze(
      result.content.map((item) => {
        switch (item.type) {
          case 'text':
            return Object.freeze({ type: 'text' as const, text: item.text });
          case 'image':
          case 'audio':
            return Object.freeze({ type: item.type, data: item.data, mimeType: item.mimeType });
          case 'resource':
          case 'resource_link':
            return Object.freeze({ type: item.type });
        }
      }),
    ),
    ...(result.structuredContent === undefined
      ? {}
      : { structuredContent: result.structuredContent }),
    ...(result.isError === undefined ? {} : { isError: result.isError }),
  });
}

async function validateInstalledRuntime(runtime: DesktopCuaDriverRuntimeLayout): Promise<void> {
  const [root, executable, executableInfo] = await Promise.all([
    realpath(runtime.runtimeRoot),
    realpath(runtime.executablePath),
    stat(runtime.executablePath),
  ]);
  if (!isInside(root, executable) || !executableInfo.isFile()) {
    throw new Error('Cua Driver executable escapes the installed extension runtime.');
  }
}

function validateLayout(runtime: DesktopCuaDriverRuntimeLayout, storageRoot: string): void {
  for (const [label, value] of [
    ['runtime root', runtime.runtimeRoot],
    ['executable', runtime.executablePath],
    ['binary path', runtime.binaryPath],
    ['storage root', storageRoot],
  ] as const) {
    if (!path.isAbsolute(value)) throw new Error(`Cua Driver ${label} must be absolute.`);
  }
  if (!isInside(runtime.runtimeRoot, runtime.executablePath)) {
    throw new Error('Cua Driver executable must be contained by its runtime root.');
  }
  if (isInside(runtime.runtimeRoot, storageRoot) || isInside(storageRoot, runtime.runtimeRoot)) {
    throw new Error('Cua Driver runtime and session storage roots must be separate.');
  }
}

function requireClient(
  client: DesktopCuaDriverMcpClient | undefined,
  id: string,
): DesktopCuaDriverMcpClient {
  if (!client) throw new Error(`Cua Driver MCP client '${id}' is not connected.`);
  return client;
}

function requireBundleId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/u.test(value)) {
    throw new Error('Cua Driver target application bundle identity is invalid.');
  }
  return value;
}

function safeSegment(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) {
    throw new Error('Cua Driver session identity is invalid.');
  }
  return value;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
