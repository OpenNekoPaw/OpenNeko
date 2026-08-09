import { createHash, randomUUID } from 'node:crypto';
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

export interface DesktopBrowserUseRuntimeLayout {
  readonly runtimeRoot: string;
  readonly executablePath: string;
  readonly browserExecutablePath: string;
  readonly binaryPath: string;
}

export interface DesktopBrowserUseMcpClientFactoryOptions {
  readonly runtime: DesktopBrowserUseRuntimeLayout;
  readonly storageRoot: string;
  readonly createClient?: (config: MCPServerConfig) => DesktopBrowserUseMcpClient;
}

interface DesktopBrowserUseMcpClient {
  connect(options?: MCPRequestOptions): Promise<void>;
  disconnect(): Promise<void>;
  listTools(options?: MCPRequestOptions): Promise<MCPToolDefinition[]>;
  callTool(
    name: string,
    args: Record<string, unknown>,
    options?: MCPRequestOptions,
  ): Promise<MCPToolResult>;
}

interface PreparedBrowserUseLaunch {
  readonly id: string;
  readonly allowedDomains: readonly string[];
  readonly directory: string;
  readonly requestTimeout: number;
  readonly removeDataOnDisconnect: boolean;
}

interface PreparedBrowserUseConfiguration {
  readonly config: MCPServerConfig;
  readonly sessionRoot: string;
}

const BROWSER_USE_MCP_ARGUMENTS = Object.freeze(['--mcp'] as const);
const QUALIFICATION_DOMAIN = 'qualification.invalid';

export function createDesktopBrowserUseMcpClientFactory(
  options: DesktopBrowserUseMcpClientFactoryOptions,
): AutomationMcpClientFactoryPort {
  const runtime = Object.freeze({ ...options.runtime });
  const storageRoot = options.storageRoot;
  validateLayout(runtime, storageRoot);
  const createClient = options.createClient ?? ((config) => createMCPClient(config));

  return Object.freeze({
    createQualificationClient: () =>
      createPreparedClient({
        launch: {
          id: `qualification-${randomUUID()}`,
          allowedDomains: [QUALIFICATION_DOMAIN],
          directory: 'qualification',
          requestTimeout: 30_000,
          removeDataOnDisconnect: true,
        },
        runtime,
        storageRoot,
        createClient,
      }),
    createSessionClient: (
      input: Parameters<AutomationMcpClientFactoryPort['createSessionClient']>[0],
    ) => {
      if (input.target.kind !== 'browser') {
        throw new Error('Browser Use requires a browser Automation target.');
      }
      return createPreparedClient({
        launch: {
          id: input.sessionId,
          allowedDomains: Object.freeze([...input.target.allowedDomains]),
          directory: 'sessions',
          requestTimeout: input.timeoutMs,
          removeDataOnDisconnect: false,
        },
        runtime,
        storageRoot,
        createClient,
      });
    },
  });
}

function createPreparedClient(input: {
  readonly launch: PreparedBrowserUseLaunch;
  readonly runtime: DesktopBrowserUseRuntimeLayout;
  readonly storageRoot: string;
  readonly createClient: (config: MCPServerConfig) => DesktopBrowserUseMcpClient;
}): AutomationMcpClientPort {
  let client: DesktopBrowserUseMcpClient | undefined;
  let preparedDirectory: string | undefined;

  return {
    async connect({ signal } = {}) {
      if (client)
        throw new Error(`Browser Use MCP client '${input.launch.id}' is already connected.`);
      if (signal?.aborted) throw abortReason(signal);
      await validateInstalledRuntime(input.runtime);
      const prepared = await prepareLaunchConfiguration(input);
      preparedDirectory = prepared.sessionRoot;
      if (signal?.aborted) throw abortReason(signal);
      const created = input.createClient(prepared.config);
      client = created;
      try {
        await created.connect({ ...(signal === undefined ? {} : { signal }) });
      } catch (error) {
        client = undefined;
        await closeAfterFailedConnection(created);
        throw error;
      }
    },
    async disconnect() {
      const connected = client;
      client = undefined;
      let disconnectError: unknown;
      try {
        if (connected) await connected.disconnect();
      } catch (error) {
        disconnectError = error;
      }
      if (input.launch.removeDataOnDisconnect && preparedDirectory) {
        const owned = preparedDirectory;
        preparedDirectory = undefined;
        try {
          await rm(owned, { recursive: true, force: false });
        } catch (error) {
          if (disconnectError === undefined) throw error;
        }
      }
      if (disconnectError !== undefined) throw disconnectError;
    },
    async listTools({ signal } = {}) {
      const tools = await requireClient(client, input.launch.id).listTools({
        ...(signal === undefined ? {} : { signal }),
      });
      return Object.freeze(tools.map(projectToolDefinition));
    },
    async callTool({ name, arguments: args, signal }) {
      const result = await requireClient(client, input.launch.id).callTool(
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

async function prepareLaunchConfiguration(input: {
  readonly launch: PreparedBrowserUseLaunch;
  readonly runtime: DesktopBrowserUseRuntimeLayout;
  readonly storageRoot: string;
}): Promise<PreparedBrowserUseConfiguration> {
  const ownerRoot = path.join(input.storageRoot, input.launch.directory);
  await mkdir(ownerRoot, { recursive: true, mode: 0o700 });
  const sessionRoot = path.join(ownerRoot, sessionDirectoryName(input.launch.id));
  await mkdir(sessionRoot, { recursive: false, mode: 0o700 });

  const home = path.join(sessionRoot, 'home');
  const temporary = path.join(sessionRoot, 'temporary');
  const configDirectory = path.join(sessionRoot, 'config');
  const cacheDirectory = path.join(sessionRoot, 'cache');
  const browserDataDirectory = path.join(sessionRoot, 'browser-data');
  const downloadsDirectory = path.join(sessionRoot, 'downloads');
  await Promise.all(
    [
      home,
      temporary,
      configDirectory,
      cacheDirectory,
      browserDataDirectory,
      downloadsDirectory,
    ].map((directory) => mkdir(directory, { recursive: false, mode: 0o700 })),
  );

  const configPath = path.join(configDirectory, 'config.json');
  await writeFile(
    configPath,
    JSON.stringify(
      createBrowserUseConfig({
        browserExecutablePath: input.runtime.browserExecutablePath,
        browserDataDirectory,
        downloadsDirectory,
        allowedDomains: input.launch.allowedDomains,
      }),
    ),
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );

  return {
    sessionRoot,
    config: {
      id: `browser-use:${input.launch.id}`,
      name: 'Browser Use',
      description: 'Contained reviewed Browser Use MCP runtime',
      category: 'productivity',
      transport: 'stdio',
      command: input.runtime.executablePath,
      args: [...BROWSER_USE_MCP_ARGUMENTS],
      cwd: sessionRoot,
      inheritProcessEnv: false,
      env: {
        HOME: home,
        TMPDIR: temporary,
        TMP: temporary,
        TEMP: temporary,
        PATH: input.runtime.binaryPath,
        XDG_CONFIG_HOME: configDirectory,
        XDG_CACHE_HOME: cacheDirectory,
        BROWSER_USE_CONFIG_DIR: configDirectory,
        BROWSER_USE_CONFIG_PATH: configPath,
        BROWSER_USE_ALLOWED_DOMAINS: input.launch.allowedDomains.join(','),
        BROWSER_USE_DISABLE_EXTENSIONS: 'true',
        BROWSER_USE_LOGGING_LEVEL: 'warning',
        BROWSER_USE_SETUP_LOGGING: 'false',
        BROWSER_USE_CLOUD_SYNC: 'false',
        BROWSER_USE_VERSION_CHECK: 'false',
        ANONYMIZED_TELEMETRY: 'false',
        PYTHONNOUSERSITE: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      },
      enabled: true,
      requestTimeout: input.launch.requestTimeout,
    },
  };
}

function createBrowserUseConfig(input: {
  readonly browserExecutablePath: string;
  readonly browserDataDirectory: string;
  readonly downloadsDirectory: string;
  readonly allowedDomains: readonly string[];
}): Readonly<Record<string, unknown>> {
  return Object.freeze({
    browser_profile: Object.freeze({
      openneko: Object.freeze({
        id: 'openneko',
        default: true,
        headless: false,
        executable_path: input.browserExecutablePath,
        user_data_dir: input.browserDataDirectory,
        downloads_path: input.downloadsDirectory,
        allowed_domains: Object.freeze([...input.allowedDomains]),
        enable_default_extensions: false,
      }),
    }),
    llm: Object.freeze({}),
    agent: Object.freeze({}),
  });
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
            return Object.freeze({
              type: item.type,
              data: item.data,
              mimeType: item.mimeType,
            });
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

async function validateInstalledRuntime(runtime: DesktopBrowserUseRuntimeLayout): Promise<void> {
  const installedRoot = await realpath(runtime.runtimeRoot);
  const [executablePath, browserExecutablePath, binaryPath] = await Promise.all([
    realpath(runtime.executablePath),
    realpath(runtime.browserExecutablePath),
    realpath(runtime.binaryPath),
  ]);
  for (const candidate of [executablePath, browserExecutablePath, binaryPath]) {
    requireContainedPath(installedRoot, candidate, 'Browser Use runtime path');
  }
  const [rootStats, executableStats, browserStats, binaryStats] = await Promise.all([
    stat(installedRoot),
    stat(executablePath),
    stat(browserExecutablePath),
    stat(binaryPath),
  ]);
  if (!rootStats.isDirectory() || !binaryStats.isDirectory()) {
    throw new Error('Browser Use runtime and binary paths must be directories.');
  }
  if (!executableStats.isFile() || !browserStats.isFile()) {
    throw new Error('Browser Use launcher and browser paths must be files.');
  }
}

function validateLayout(runtime: DesktopBrowserUseRuntimeLayout, storageRoot: string): void {
  for (const [label, value] of Object.entries({ ...runtime, storageRoot })) {
    if (!path.isAbsolute(value)) throw new Error(`Browser Use ${label} must be an absolute path.`);
  }
  for (const candidate of [
    runtime.executablePath,
    runtime.browserExecutablePath,
    runtime.binaryPath,
  ]) {
    requireContainedPath(runtime.runtimeRoot, candidate, 'Browser Use runtime path');
  }
}

function requireContainedPath(root: string, candidate: string, label: string): void {
  const relative = path.relative(root, candidate);
  if (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  ) {
    return;
  }
  throw new Error(`${label} escapes the installed extension runtime.`);
}

function sessionDirectoryName(identity: string): string {
  return createHash('sha256').update(identity).digest('hex');
}

function requireClient(
  client: DesktopBrowserUseMcpClient | undefined,
  identity: string,
): DesktopBrowserUseMcpClient {
  if (!client) throw new Error(`Browser Use MCP client '${identity}' is not connected.`);
  return client;
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Browser Use launch was cancelled.');
}

async function closeAfterFailedConnection(client: DesktopBrowserUseMcpClient): Promise<void> {
  try {
    await client.disconnect();
  } catch {
    // Preserve the launch failure as the owning diagnostic.
  }
}
