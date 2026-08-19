import { randomUUID } from 'node:crypto';
import { mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  MCPConnectionInfo,
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
  CuaDriverTargetClientFactoryPort,
} from '@neko/automation-node';

export interface DesktopCuaDriverRuntimeLayout {
  readonly appBundlePath: string;
  readonly executablePath: string;
}

export type DesktopCuaDriverMcpClientFactory = AutomationMcpClientFactoryPort &
  CuaDriverTargetClientFactoryPort & {
    inspectProvider(signal?: AbortSignal): Promise<{
      readonly server: MCPConnectionInfo['server'];
      readonly tools: readonly AutomationMcpToolDefinition[];
    }>;
  };

interface DesktopCuaDriverMcpClient {
  connect(options?: MCPRequestOptions): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionInfo(): MCPConnectionInfo | undefined;
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
  readonly validateRelease?: (runtime: DesktopCuaDriverRuntimeLayout) => Promise<void>;
}): DesktopCuaDriverMcpClientFactory {
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') {
    throw new Error(`Cua Driver Computer Use is unavailable on '${platform}'.`);
  }
  validateLayout(options.runtime, options.storageRoot);
  const createClient = options.createClient ?? ((config) => createMCPClient(config));
  const validateRelease = options.validateRelease ?? validateDesktopCuaDriverRelease;
  const createInspectionClient = () =>
    createPreparedClient({
      id: `inspection-${randomUUID()}`,
      timeoutMs: 30_000,
      removeDataOnDisconnect: true,
      runtime: options.runtime,
      storageRoot: options.storageRoot,
      createClient,
      validateRelease,
      policy: { kind: 'application', applicationId: 'invalid.openneko.inspection' },
    });

  const factory: DesktopCuaDriverMcpClientFactory = {
    createInspectionClient,
    createSessionClient: (input) => {
      if (input.target.kind !== 'computer') {
        throw new Error('Cua Driver requires a Computer Automation target.');
      }
      if (input.mode !== 'observe') {
        throw new Error(`Cua Driver mode '${input.mode}' is unavailable.`);
      }
      return createPreparedClient({
        id: input.sessionId,
        timeoutMs: input.timeoutMs,
        removeDataOnDisconnect: true,
        runtime: options.runtime,
        storageRoot: options.storageRoot,
        createClient,
        validateRelease,
        policy: { kind: 'application', applicationId: input.target.applicationId },
      });
    },
    createTargetDiscoveryClient: () =>
      createPreparedClient({
        id: `target-discovery-${randomUUID()}`,
        timeoutMs: 10_000,
        removeDataOnDisconnect: true,
        runtime: options.runtime,
        storageRoot: options.storageRoot,
        createClient,
        validateRelease,
        policy: { kind: 'target-discovery' },
      }),
    async inspectProvider(signal) {
      const client = createInspectionClient();
      try {
        await client.connect({ ...(signal === undefined ? {} : { signal }) });
        const connection = client.getConnectionInfo();
        if (!connection) throw new Error('Cua Driver returned no negotiated MCP identity.');
        const tools = await client.listTools({ ...(signal === undefined ? {} : { signal }) });
        return Object.freeze({
          server: Object.freeze({ ...connection.server }),
          tools: Object.freeze(tools),
        });
      } finally {
        await client.disconnect();
      }
    },
  };
  return Object.freeze(factory);
}

function createPreparedClient(input: {
  readonly id: string;
  readonly timeoutMs: number;
  readonly removeDataOnDisconnect: boolean;
  readonly runtime: DesktopCuaDriverRuntimeLayout;
  readonly storageRoot: string;
  readonly createClient: (config: MCPServerConfig) => DesktopCuaDriverMcpClient;
  readonly validateRelease: (runtime: DesktopCuaDriverRuntimeLayout) => Promise<void>;
  readonly policy:
    | { readonly kind: 'application'; readonly applicationId: string }
    | { readonly kind: 'target-discovery' };
}): AutomationMcpClientPort & { getConnectionInfo(): MCPConnectionInfo | undefined } {
  let client: DesktopCuaDriverMcpClient | undefined;
  let sessionRoot: string | undefined;
  return {
    async connect({ signal } = {}) {
      if (client) throw new Error(`Cua Driver MCP client '${input.id}' is already connected.`);
      if (signal?.aborted) throw signal.reason;
      await validateInstalledRuntime(input.runtime);
      await input.validateRelease(input.runtime);
      const prepared = await prepareConfiguration(input);
      sessionRoot = prepared.sessionRoot;
      if (signal?.aborted) throw signal.reason;
      const created = input.createClient(prepared.config);
      client = created;
      try {
        await created.connect({ ...(signal === undefined ? {} : { signal }) });
        requireReviewedConnection(created);
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
    getConnectionInfo() {
      return client?.getConnectionInfo();
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

export async function validateDesktopCuaDriverRelease(
  runtime: DesktopCuaDriverRuntimeLayout,
  runCommand: (command: string, args: readonly string[]) => Promise<string> = runHostCommand,
): Promise<void> {
  const infoPlist = path.join(runtime.appBundlePath, 'Contents', 'Info.plist');
  const [bundleId, signature, assessment] = await Promise.all([
    runCommand('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', infoPlist]),
    runCommand('/usr/bin/codesign', ['-d', '--verbose=4', runtime.appBundlePath]),
    runCommand('/usr/sbin/spctl', [
      '--assess',
      '--type',
      'execute',
      '--verbose=4',
      runtime.appBundlePath,
    ]),
    runCommand('/usr/bin/codesign', [
      '--verify',
      '--deep',
      '--strict',
      '--verbose=2',
      runtime.appBundlePath,
    ]),
  ]);
  if (bundleId.trim() !== 'com.trycua.driver') {
    throw new Error('Cua Driver bundle identity is incompatible.');
  }
  if (
    !signature.includes('Identifier=com.trycua.driver') ||
    !signature.includes('TeamIdentifier=YCK386LBJ7') ||
    !signature.includes('Authority=Developer ID Application: Cua AI, Inc. (YCK386LBJ7)') ||
    !signature.includes('Notarization Ticket=stapled')
  ) {
    throw new Error('Cua Driver signing identity does not match the reviewed publisher.');
  }
  if (!assessment.includes('accepted') || !assessment.includes('source=Notarized Developer ID')) {
    throw new Error('Cua Driver is not accepted as a notarized Developer ID application.');
  }
}

async function runHostCommand(command: string, args: readonly string[]): Promise<string> {
  const { execFile } = await import('node:child_process');
  return await new Promise<string>((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        env: {},
        timeout: 15_000,
        maxBuffer: 64 * 1024,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => (error ? reject(error) : resolve(`${stdout}${stderr}`)),
    );
  });
}

function requireReviewedConnection(client: DesktopCuaDriverMcpClient): MCPConnectionInfo {
  const connection = client.getConnectionInfo();
  if (!connection || connection.server.name !== 'cua-driver') {
    throw new Error('Cua Driver MCP server identity is incompatible.');
  }
  return connection;
}

async function prepareConfiguration(input: {
  readonly id: string;
  readonly timeoutMs: number;
  readonly runtime: DesktopCuaDriverRuntimeLayout;
  readonly storageRoot: string;
  readonly policy:
    | { readonly kind: 'application'; readonly applicationId: string }
    | { readonly kind: 'target-discovery' };
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
      ...(input.policy.kind === 'target-discovery'
        ? {
            allow: { tools: ['list_apps', 'list_windows'] },
            resources: { desktop: { display: true } },
          }
        : {
            allow: { tools: ['verify_state'] },
            resources: {
              apps: [{ bundle_id: requireBundleId(input.policy.applicationId), windows: 'all' }],
              desktop: { display: false },
            },
          }),
    }),
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );
  return {
    sessionRoot,
    config: {
      id: `cua-driver:${input.id}`,
      name: 'Cua Driver',
      description: 'Reviewed user-managed Cua Driver Computer Use runtime',
      category: 'productivity',
      transport: 'stdio',
      command: input.runtime.executablePath,
      args: ['mcp'],
      cwd: sessionRoot,
      inheritProcessEnv: false,
      env: {
        HOME: home,
        TMPDIR: temporary,
        TMP: temporary,
        TEMP: temporary,
        PATH: path.dirname(input.runtime.executablePath),
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
  const [appBundle, executable, executableInfo] = await Promise.all([
    realpath(runtime.appBundlePath),
    realpath(runtime.executablePath),
    stat(runtime.executablePath),
  ]);
  if (appBundle !== runtime.appBundlePath || executable !== runtime.executablePath) {
    throw new Error('Cua Driver local runtime authorization changed before launch.');
  }
  if (!isInside(appBundle, executable) || !executableInfo.isFile()) {
    throw new Error('Cua Driver executable escapes the authorized application bundle.');
  }
}

function validateLayout(runtime: DesktopCuaDriverRuntimeLayout, storageRoot: string): void {
  for (const [label, value] of [
    ['application bundle', runtime.appBundlePath],
    ['executable', runtime.executablePath],
    ['storage root', storageRoot],
  ] as const) {
    if (!path.isAbsolute(value)) throw new Error(`Cua Driver ${label} must be absolute.`);
  }
  if (path.basename(runtime.appBundlePath) !== 'CuaDriver.app') {
    throw new Error('Cua Driver local runtime must be the authorized CuaDriver.app bundle.');
  }
  if (!isInside(runtime.appBundlePath, runtime.executablePath)) {
    throw new Error(
      'Cua Driver executable must be contained by its authorized application bundle.',
    );
  }
  if (
    isInside(runtime.appBundlePath, storageRoot) ||
    isInside(storageRoot, runtime.appBundlePath)
  ) {
    throw new Error('Cua Driver application bundle and session storage roots must be separate.');
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
