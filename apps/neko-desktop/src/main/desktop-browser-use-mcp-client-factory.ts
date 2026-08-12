import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  MCPConnectionInfo,
  MCPRequestOptions,
  MCPServerConfig,
  MCPToolDefinition,
  MCPToolResult,
} from '@neko/agent-contracts';
import { createMCPClient } from '@neko/agent-runtime';
import {
  parseAutomationTarget,
  sameAutomationTarget,
  type AutomationTarget,
  type BrowserAutomationTarget,
} from '@neko/automation-contracts';
import type {
  AutomationMcpCallResult,
  AutomationMcpClientFactoryPort,
  AutomationMcpClientPort,
  AutomationMcpToolDefinition,
} from '@neko/automation-node';

export interface DesktopBrowserUseRuntimeLayout {
  readonly executablePath: string;
  readonly browserExecutablePath: string;
}

export interface DesktopBrowserUseRuntimeValidation {
  readonly interpreterPath: string;
}

export interface DesktopBrowserUseMcpClientFactoryOptions {
  readonly runtime: DesktopBrowserUseRuntimeLayout;
  readonly storageRoot: string;
  readonly createClient?: (config: MCPServerConfig) => DesktopBrowserUseMcpClient;
  readonly validateRuntime?: (
    runtime: DesktopBrowserUseRuntimeLayout,
  ) => Promise<DesktopBrowserUseRuntimeValidation>;
}

interface DesktopAutomationMcpInspection {
  readonly server: MCPConnectionInfo['server'];
  readonly tools: readonly AutomationMcpToolDefinition[];
}

export interface DesktopBrowserUseMcpClientFactory extends AutomationMcpClientFactoryPort {
  inspectProvider(signal?: AbortSignal): Promise<DesktopAutomationMcpInspection>;
  revalidateSessionTarget(input: {
    readonly target: AutomationTarget;
    readonly signal?: AbortSignal;
  }): Promise<AutomationTarget>;
}

interface DesktopBrowserUseMcpClient {
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

interface PreparedBrowserUseLaunch {
  readonly id: string;
  readonly allowedDomains: readonly string[];
  readonly directory: string;
  readonly requestTimeout: number;
  readonly removeDataOnDisconnect: boolean;
  readonly target?: BrowserAutomationTarget;
}

interface PreparedBrowserUseConfiguration {
  readonly config: MCPServerConfig;
  readonly sessionRoot: string;
}

const BROWSER_USE_MCP_ARGUMENTS = Object.freeze(['--mcp'] as const);
const INSPECTION_DOMAIN = 'inspection.invalid';
const BROWSER_USE_MCP_SERVER_NAME = 'browser-use';
const BROWSER_NAVIGATE_TOOL_NAME = 'browser_navigate';
const BROWSER_LIST_TABS_TOOL_NAME = 'browser_list_tabs';

export function createDesktopBrowserUseMcpClientFactory(
  options: DesktopBrowserUseMcpClientFactoryOptions,
): DesktopBrowserUseMcpClientFactory {
  const runtime = Object.freeze({ ...options.runtime });
  const storageRoot = options.storageRoot;
  validateLayout(runtime, storageRoot);
  const createClient = options.createClient ?? ((config) => createMCPClient(config));
  const inspectRuntime = options.validateRuntime ?? validateDesktopBrowserUseRuntime;
  let interpreterAuthority: string | undefined;
  const sessionClients = new Map<string, PreparedBrowserUseClient>();
  const validateRuntime = async (
    candidate: DesktopBrowserUseRuntimeLayout,
  ): Promise<DesktopBrowserUseRuntimeValidation> => {
    const validation = await inspectRuntime(candidate);
    if (interpreterAuthority !== undefined && validation.interpreterPath !== interpreterAuthority) {
      throw new Error('Browser Use Python interpreter authorization changed before launch.');
    }
    interpreterAuthority ??= validation.interpreterPath;
    return validation;
  };

  const createInspectionClient = () =>
    createPreparedClient({
      launch: {
        id: `inspection-${randomUUID()}`,
        allowedDomains: [INSPECTION_DOMAIN],
        directory: 'inspection',
        requestTimeout: 30_000,
        removeDataOnDisconnect: true,
      },
      runtime,
      storageRoot,
      createClient,
      validateRuntime,
    });
  return Object.freeze({
    createInspectionClient: () => createInspectionClient(),
    createSessionClient: (
      input: Parameters<AutomationMcpClientFactoryPort['createSessionClient']>[0],
    ) => {
      if (input.target.kind !== 'browser') {
        throw new Error('Browser Use requires a browser Automation target.');
      }
      if (input.mode !== 'observe') {
        throw new Error('Browser Use local runtime only supports reviewed observe sessions.');
      }
      if (input.target.browserSessionId !== input.sessionId) {
        throw new Error('Browser Use session and isolated browser target identities do not match.');
      }
      if (sessionClients.has(input.sessionId)) {
        throw new Error(`Browser Use session '${input.sessionId}' already owns a client.`);
      }
      const prepared = createPreparedClient({
        launch: {
          id: input.sessionId,
          allowedDomains: Object.freeze([...input.target.allowedDomains]),
          directory: 'sessions',
          requestTimeout: input.timeoutMs,
          removeDataOnDisconnect: true,
          target: input.target,
        },
        runtime,
        storageRoot,
        createClient,
        validateRuntime,
        onRelease: () => {
          if (sessionClients.get(input.sessionId) === prepared) {
            sessionClients.delete(input.sessionId);
          }
        },
      });
      sessionClients.set(input.sessionId, prepared);
      return prepared;
    },
    async revalidateSessionTarget(input: {
      readonly target: AutomationTarget;
      readonly signal?: AbortSignal;
    }) {
      const target = parseAutomationTarget(input.target);
      if (target.kind !== 'browser') {
        throw new Error('Browser Use target revalidation requires a browser target.');
      }
      const client = sessionClients.get(target.browserSessionId);
      if (!client) {
        throw new Error(`Browser Use session '${target.browserSessionId}' has no owned client.`);
      }
      return await client.revalidateTarget(target, input.signal);
    },
    async inspectProvider(signal?: AbortSignal) {
      const client = createInspectionClient();
      try {
        await client.connect({ ...(signal === undefined ? {} : { signal }) });
        const connection = client.getConnectionInfo();
        if (!connection) throw new Error('Browser Use returned no negotiated MCP identity.');
        const tools = await client.listTools({ ...(signal === undefined ? {} : { signal }) });
        return Object.freeze({
          server: Object.freeze({ ...connection.server }),
          tools: Object.freeze(tools),
        });
      } finally {
        await client.disconnect();
      }
    },
  });
}

type PreparedBrowserUseClient = AutomationMcpClientPort & {
  getConnectionInfo(): MCPConnectionInfo | undefined;
  revalidateTarget(
    target: BrowserAutomationTarget,
    signal?: AbortSignal,
  ): Promise<BrowserAutomationTarget>;
};

function createPreparedClient(input: {
  readonly launch: PreparedBrowserUseLaunch;
  readonly runtime: DesktopBrowserUseRuntimeLayout;
  readonly storageRoot: string;
  readonly createClient: (config: MCPServerConfig) => DesktopBrowserUseMcpClient;
  readonly validateRuntime: (
    runtime: DesktopBrowserUseRuntimeLayout,
  ) => Promise<DesktopBrowserUseRuntimeValidation>;
  readonly onRelease?: () => void;
}): PreparedBrowserUseClient {
  let client: DesktopBrowserUseMcpClient | undefined;
  let preparedDirectory: string | undefined;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    input.onRelease?.();
  };

  return {
    async connect({ signal } = {}) {
      if (released) throw new Error(`Browser Use MCP client '${input.launch.id}' was released.`);
      if (client)
        throw new Error(`Browser Use MCP client '${input.launch.id}' is already connected.`);
      if (signal?.aborted) throw abortReason(signal);
      await validateInstalledRuntime(input.runtime);
      const validation = await input.validateRuntime(input.runtime);
      const prepared = await prepareLaunchConfiguration(input, validation);
      preparedDirectory = prepared.sessionRoot;
      if (signal?.aborted) throw abortReason(signal);
      const created = input.createClient(prepared.config);
      client = created;
      try {
        await created.connect({ ...(signal === undefined ? {} : { signal }) });
        requireReviewedConnection(created);
        if (input.launch.target) {
          await bootstrapSinglePage(created, input.launch.target, signal);
        }
      } catch (error) {
        client = undefined;
        await closeAfterFailedConnection(created);
        release();
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
          if (disconnectError === undefined) disconnectError = error;
        }
      }
      release();
      if (disconnectError !== undefined) throw disconnectError;
    },
    async listTools({ signal } = {}) {
      const tools = await requireClient(client, input.launch.id).listTools({
        ...(signal === undefined ? {} : { signal }),
      });
      return Object.freeze(tools.map(projectToolDefinition));
    },
    async callTool({ name, arguments: args, signal }) {
      const connected = requireClient(client, input.launch.id);
      if (input.launch.target) {
        await assertSinglePage(connected, input.launch.target, signal);
      }
      const result = await connected.callTool(
        name,
        { ...args },
        {
          ...(signal === undefined ? {} : { signal }),
        },
      );
      if (input.launch.target) {
        await assertSinglePage(connected, input.launch.target, signal);
      }
      return projectToolResult(result);
    },
    async revalidateTarget(target, signal) {
      if (!input.launch.target || !sameAutomationTarget(input.launch.target, target)) {
        throw new Error('Browser Use session target identity changed.');
      }
      await assertSinglePage(requireClient(client, input.launch.id), target, signal);
      return target;
    },
  };
}

async function bootstrapSinglePage(
  client: DesktopBrowserUseMcpClient,
  target: BrowserAutomationTarget,
  signal?: AbortSignal,
): Promise<void> {
  const tools = await client.listTools({ ...(signal === undefined ? {} : { signal }) });
  const definitions = new Map(tools.map((tool) => [tool.name, tool]));
  const navigate = definitions.get(BROWSER_NAVIGATE_TOOL_NAME);
  if (!navigate || !hasObjectProperties(navigate.inputSchema, ['url', 'new_tab'])) {
    throw new Error('Browser Use internal navigation Tool is unavailable or incompatible.');
  }
  const listTabs = definitions.get(BROWSER_LIST_TABS_TOOL_NAME);
  if (!listTabs || !hasObjectProperties(listTabs.inputSchema, [])) {
    throw new Error('Browser Use internal tab inspection Tool is unavailable or incompatible.');
  }
  const result = await client.callTool(
    BROWSER_NAVIGATE_TOOL_NAME,
    { url: target.origin, new_tab: false },
    { ...(signal === undefined ? {} : { signal }) },
  );
  requireSuccessfulInternalResult(result, BROWSER_NAVIGATE_TOOL_NAME);
  await assertSinglePage(client, target, signal);
}

async function assertSinglePage(
  client: DesktopBrowserUseMcpClient,
  target: BrowserAutomationTarget,
  signal?: AbortSignal,
): Promise<void> {
  const result = await client.callTool(
    BROWSER_LIST_TABS_TOOL_NAME,
    {},
    { ...(signal === undefined ? {} : { signal }) },
  );
  const text = requireSuccessfulInternalResult(result, BROWSER_LIST_TABS_TOOL_NAME);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Browser Use returned an invalid tab inventory.');
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error('Browser Use session must contain exactly one page.');
  }
  const page = parsed[0];
  if (
    !isRecord(page) ||
    typeof page['tab_id'] !== 'string' ||
    typeof page['url'] !== 'string' ||
    typeof page['title'] !== 'string'
  ) {
    throw new Error('Browser Use returned an invalid page identity.');
  }
  let pageUrl: URL;
  try {
    pageUrl = new URL(page['url']);
  } catch {
    throw new Error('Browser Use returned an invalid page URL.');
  }
  if (pageUrl.origin !== target.origin || !target.allowedDomains.includes(pageUrl.hostname)) {
    throw new Error('Browser Use page left the user-authorized origin.');
  }
}

function requireSuccessfulInternalResult(result: MCPToolResult, operation: string): string {
  const textItems = result.content.filter(
    (item): item is Extract<(typeof result.content)[number], { type: 'text' }> =>
      item.type === 'text',
  );
  const text = textItems.map((item) => item.text).join('\n');
  if (result.isError === true || text.startsWith('Error:')) {
    throw new Error(`Browser Use internal Tool '${operation}' failed: ${text || 'unknown error'}`);
  }
  return text;
}

function hasObjectProperties(
  schema: Readonly<Record<string, unknown>>,
  properties: readonly string[],
): boolean {
  const declared = schema['properties'];
  if (schema['type'] !== 'object' || !isRecord(declared)) return false;
  return properties.every((property) => property in declared);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function validateDesktopBrowserUseRuntime(
  runtime: DesktopBrowserUseRuntimeLayout,
): Promise<DesktopBrowserUseRuntimeValidation> {
  const firstLine = await readEntrypointFirstLine(runtime.executablePath);
  const interpreterPath = firstLine.startsWith('#!') ? firstLine.slice(2).trim() : '';
  if (!path.isAbsolute(interpreterPath) || /\s/u.test(interpreterPath)) {
    throw new Error('Browser Use runtime must be a Python entrypoint with an exact interpreter.');
  }
  const interpreter = await realpath(interpreterPath);
  const details = await stat(interpreter);
  if (!details.isFile()) {
    throw new Error('Browser Use Python interpreter must resolve to a file.');
  }
  return Object.freeze({ interpreterPath: interpreter });
}

async function readEntrypointFirstLine(executablePath: string): Promise<string> {
  const handle = await open(executablePath, 'r');
  try {
    const buffer = Buffer.alloc(4_096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const contents = buffer.subarray(0, bytesRead).toString('utf8');
    const newline = contents.indexOf('\n');
    if (newline < 0 && bytesRead === buffer.length) {
      throw new Error('Browser Use runtime entrypoint header is too large.');
    }
    return contents.slice(0, newline < 0 ? contents.length : newline);
  } finally {
    await handle.close();
  }
}

function requireReviewedConnection(client: DesktopBrowserUseMcpClient): MCPConnectionInfo {
  const connection = client.getConnectionInfo();
  if (!connection || connection.server.name !== BROWSER_USE_MCP_SERVER_NAME) {
    throw new Error('Browser Use MCP server identity is incompatible.');
  }
  return connection;
}

async function prepareLaunchConfiguration(
  input: {
    readonly launch: PreparedBrowserUseLaunch;
    readonly runtime: DesktopBrowserUseRuntimeLayout;
    readonly storageRoot: string;
  },
  validation: DesktopBrowserUseRuntimeValidation,
): Promise<PreparedBrowserUseConfiguration> {
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
      description: 'Reviewed user-managed Browser Use MCP runtime',
      category: 'productivity',
      transport: 'stdio',
      command: validation.interpreterPath,
      args: [input.runtime.executablePath, ...BROWSER_USE_MCP_ARGUMENTS],
      cwd: sessionRoot,
      inheritProcessEnv: false,
      env: {
        HOME: home,
        TMPDIR: temporary,
        TMP: temporary,
        TEMP: temporary,
        PATH: path.dirname(input.runtime.executablePath),
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
  const [executablePath, browserExecutablePath] = await Promise.all([
    realpath(runtime.executablePath),
    realpath(runtime.browserExecutablePath),
  ]);
  if (
    executablePath !== runtime.executablePath ||
    browserExecutablePath !== runtime.browserExecutablePath
  ) {
    throw new Error('Browser Use local runtime authorization changed before launch.');
  }
  const [executableStats, browserStats] = await Promise.all([
    stat(executablePath),
    stat(browserExecutablePath),
  ]);
  if (!executableStats.isFile() || !browserStats.isFile()) {
    throw new Error('Browser Use launcher and browser paths must be files.');
  }
}

function validateLayout(runtime: DesktopBrowserUseRuntimeLayout, storageRoot: string): void {
  for (const [label, value] of Object.entries({ ...runtime, storageRoot })) {
    if (!path.isAbsolute(value)) throw new Error(`Browser Use ${label} must be an absolute path.`);
  }
  if (runtime.executablePath === runtime.browserExecutablePath) {
    throw new Error('Browser Use runtime and browser executable must be independent authorities.');
  }
  if (
    pathsOverlap(storageRoot, runtime.executablePath) ||
    pathsOverlap(storageRoot, runtime.browserExecutablePath)
  ) {
    throw new Error('Browser Use local runtime and session storage must be separate.');
  }
}

function pathsOverlap(left: string, right: string): boolean {
  const relative = path.relative(path.resolve(left), path.resolve(right));
  const rightInsideLeft =
    relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  const reverse = path.relative(path.resolve(right), path.resolve(left));
  const leftInsideRight =
    reverse === '' || (!reverse.startsWith('..') && !path.isAbsolute(reverse));
  return rightInsideLeft || leftInsideRight;
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
