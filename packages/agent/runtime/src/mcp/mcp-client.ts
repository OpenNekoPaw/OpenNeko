import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type {
  IMCPClient,
  MCPConnectionInfo,
  MCPContentAnnotations,
  MCPHttpConfig,
  MCPPrompt,
  MCPRequestOptions,
  MCPResource,
  MCPServerConfig,
  MCPStdioConfig,
  MCPToolAnnotations,
  MCPToolDefinition,
  MCPToolResult,
  MCPToolResultContent,
} from '@neko/agent-contracts';
import { AgentError } from '../errors';
import { getLogger } from '../utils/logger';

const logger = getLogger('MCPClient');
const CLIENT_INFO = Object.freeze({ name: 'openneko', version: '0.1.0' });
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

abstract class SdkMCPClient implements IMCPClient {
  private client: Client | undefined;
  private transport: ProtocolTrackingTransport | undefined;
  private connected = false;
  private connectionInfo: MCPConnectionInfo | undefined;

  constructor(
    readonly serverId: string,
    private readonly requestTimeoutMs: number,
  ) {}

  protected abstract createTransport(): Transport;

  async connect(options: MCPRequestOptions = {}): Promise<void> {
    if (this.connected) return;
    const client = new Client(CLIENT_INFO, { capabilities: {} });
    const transport = new ProtocolTrackingTransport(this.createTransport(), () => {
      this.connected = false;
    });
    try {
      await client.connect(transport, this.requestOptions(options));
      const protocolVersion = transport.protocolVersion;
      const server = client.getServerVersion();
      const capabilities = client.getServerCapabilities();
      if (!protocolVersion || !server || !capabilities) {
        throw new Error('MCP SDK completed connection without negotiated server facts.');
      }
      this.client = client;
      this.transport = transport;
      this.connectionInfo = Object.freeze({
        protocolVersion,
        server: Object.freeze({ name: server.name, version: server.version }),
        capabilities: Object.freeze({ ...capabilities }),
      });
      this.connected = true;
    } catch (error) {
      await closeAfterFailedConnection(client);
      throw connectionError(error);
    }
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.transport = undefined;
    this.connectionInfo = undefined;
    this.connected = false;
    if (client) await client.close();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectionInfo(): MCPConnectionInfo | undefined {
    return this.connectionInfo;
  }

  async listTools(options: MCPRequestOptions = {}): Promise<MCPToolDefinition[]> {
    const client = this.requireClient();
    const tools: MCPToolDefinition[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listTools(
        cursor === undefined ? undefined : { cursor },
        this.requestOptions(options),
      );
      tools.push(...result.tools.map(normalizeToolDefinition));
      cursor = result.nextCursor;
    } while (cursor !== undefined);
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options: MCPRequestOptions = {},
  ): Promise<MCPToolResult> {
    const result = await this.requireClient().callTool(
      { name, arguments: args },
      undefined,
      this.requestOptions(options),
    );
    if ('toolResult' in result) {
      throw new AgentError({
        category: 'mcp',
        code: 'MCP_TASK_RESULT_UNSUPPORTED',
        message: `MCP Tool ${name} returned unsupported task-based output.`,
        retryable: false,
      });
    }
    return Object.freeze({
      content: Object.freeze(result.content.map(normalizeResultContent)),
      ...(result.structuredContent === undefined
        ? {}
        : { structuredContent: Object.freeze({ ...result.structuredContent }) }),
      ...(result.isError === undefined ? {} : { isError: result.isError }),
    });
  }

  async listResources(): Promise<MCPResource[]> {
    const client = this.requireClient();
    const resources: MCPResource[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listResources(
        cursor === undefined ? undefined : { cursor },
        this.requestOptions(),
      );
      resources.push(
        ...result.resources.map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          ...(resource.description === undefined ? {} : { description: resource.description }),
          ...(resource.mimeType === undefined ? {} : { mimeType: resource.mimeType }),
        })),
      );
      cursor = result.nextCursor;
    } while (cursor !== undefined);
    return resources;
  }

  async readResource(uri: string): Promise<string> {
    const result = await this.requireClient().readResource({ uri }, this.requestOptions());
    if (result.contents.length === 0) {
      throw new AgentError({
        category: 'mcp',
        code: 'MCP_RESOURCE_EMPTY',
        message: `MCP resource ${uri} returned no content.`,
        retryable: false,
      });
    }
    return result.contents
      .map((content) => ('text' in content ? content.text : content.blob))
      .join('\n');
  }

  async listPrompts(): Promise<MCPPrompt[]> {
    const client = this.requireClient();
    const prompts: MCPPrompt[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listPrompts(
        cursor === undefined ? undefined : { cursor },
        this.requestOptions(),
      );
      prompts.push(
        ...result.prompts.map((prompt) => ({
          name: prompt.name,
          ...(prompt.description === undefined ? {} : { description: prompt.description }),
          ...(prompt.arguments === undefined
            ? {}
            : {
                arguments: prompt.arguments.map((argument) => ({
                  name: argument.name,
                  ...(argument.description === undefined
                    ? {}
                    : { description: argument.description }),
                  ...(argument.required === undefined ? {} : { required: argument.required }),
                })),
              }),
        })),
      );
      cursor = result.nextCursor;
    } while (cursor !== undefined);
    return prompts;
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<{ messages: Array<{ role: string; content: string }> }> {
    const result = await this.requireClient().getPrompt(
      { name, ...(args === undefined ? {} : { arguments: args }) },
      this.requestOptions(),
    );
    return {
      messages: result.messages.map((message) => {
        if (message.content.type !== 'text') {
          throw new AgentError({
            category: 'mcp',
            code: 'MCP_PROMPT_CONTENT_UNSUPPORTED',
            message: `MCP prompt ${name} returned unsupported ${message.content.type} content.`,
            retryable: false,
          });
        }
        return { role: message.role, content: message.content.text };
      }),
    };
  }

  private requireClient(): Client {
    if (!this.connected || !this.client) {
      throw new AgentError({
        category: 'network',
        code: 'MCP_NOT_CONNECTED',
        message: `MCP client ${this.serverId} is not connected`,
        retryable: true,
      });
    }
    return this.client;
  }

  private requestOptions(options: MCPRequestOptions = {}): {
    readonly signal?: AbortSignal;
    readonly timeout: number;
  } {
    return {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      timeout: options.timeoutMs ?? this.requestTimeoutMs,
    };
  }
}

export class StdioMCPClient extends SdkMCPClient {
  constructor(
    serverId: string,
    private readonly config: MCPStdioConfig,
  ) {
    super(serverId, config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT_MS);
  }

  protected createTransport(): Transport {
    const transport = new StdioClientTransport({
      command: this.config.command,
      ...(this.config.args === undefined ? {} : { args: this.config.args }),
      ...(this.config.cwd === undefined ? {} : { cwd: this.config.cwd }),
      env: createStdioEnvironment(this.config),
      stderr: 'pipe',
    });
    transport.stderr?.on('data', (data: Buffer) => {
      logger.error('MCP server emitted stderr output', {
        serverId: this.serverId,
        byteLength: data.byteLength,
      });
    });
    return transport;
  }
}

export class HttpMCPClient extends SdkMCPClient {
  constructor(
    serverId: string,
    private readonly config: MCPHttpConfig,
  ) {
    super(serverId, config.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS);
  }

  protected createTransport(): Transport {
    return new StreamableHTTPClientTransport(new URL(this.config.url), {
      ...(this.config.headers === undefined
        ? {}
        : { requestInit: { headers: this.config.headers } }),
    });
  }
}

class ProtocolTrackingTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];
  protocolVersion: string | undefined;

  constructor(
    private readonly delegate: Transport,
    private readonly onClosed: () => void,
  ) {}

  get sessionId(): string | undefined {
    return this.delegate.sessionId;
  }

  async start(): Promise<void> {
    this.delegate.onclose = () => {
      this.onClosed();
      this.onclose?.();
    };
    this.delegate.onerror = (error) => this.onerror?.(error);
    this.delegate.onmessage = (message, extra) => this.onmessage?.(message, extra);
    await this.delegate.start();
  }

  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    return this.delegate.send(message, options);
  }

  close(): Promise<void> {
    return this.delegate.close();
  }

  setProtocolVersion(version: string): void {
    this.protocolVersion = version;
    this.delegate.setProtocolVersion?.(version);
  }
}

function createStdioEnvironment(config: MCPStdioConfig): Record<string, string> {
  const inherited =
    config.inheritProcessEnv === true
      ? definedEnvironment(process.env)
      : config.inheritProcessEnv === false
        ? {}
        : safeDefaultEnvironment();
  return { ...inherited, ...config.env };
}

function safeDefaultEnvironment(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'] as const) {
    const value = process.env[name];
    if (value !== undefined) result[name] = value;
  }
  return result;
}

function definedEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function normalizeToolDefinition(tool: {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
  readonly annotations?: MCPToolAnnotations;
  readonly execution?: { readonly taskSupport?: 'optional' | 'required' | 'forbidden' };
}): MCPToolDefinition {
  return Object.freeze({
    name: tool.name,
    ...(tool.title === undefined ? {} : { title: tool.title }),
    description: tool.description ?? '',
    inputSchema: Object.freeze({ ...tool.inputSchema }),
    ...(tool.outputSchema === undefined
      ? {}
      : { outputSchema: Object.freeze({ ...tool.outputSchema }) }),
    ...(tool.annotations === undefined
      ? {}
      : { annotations: Object.freeze({ ...tool.annotations }) }),
    ...(tool.execution === undefined ? {} : { execution: Object.freeze({ ...tool.execution }) }),
  });
}

function normalizeResultContent(content: {
  readonly type: string;
  readonly annotations?: MCPContentAnnotations;
  readonly [key: string]: unknown;
}): MCPToolResultContent {
  const annotations = normalizeContentAnnotations(content.annotations);
  switch (content.type) {
    case 'text':
      return Object.freeze({
        type: 'text',
        text: requireString(content['text'], 'MCP text content'),
        ...annotations,
      });
    case 'image':
    case 'audio':
      return Object.freeze({
        type: content.type,
        data: requireString(content['data'], `MCP ${content.type} content`),
        mimeType: requireString(content['mimeType'], `MCP ${content.type} MIME type`),
        ...annotations,
      });
    case 'resource':
      return Object.freeze({
        type: 'resource',
        resource: normalizeEmbeddedResource(content['resource']),
        ...annotations,
      });
    case 'resource_link':
      return Object.freeze({
        type: 'resource_link',
        uri: requireString(content['uri'], 'MCP resource link URI'),
        name: requireString(content['name'], 'MCP resource link name'),
        ...(typeof content['title'] === 'string' ? { title: content['title'] } : {}),
        ...(typeof content['description'] === 'string'
          ? { description: content['description'] }
          : {}),
        ...(typeof content['mimeType'] === 'string' ? { mimeType: content['mimeType'] } : {}),
        ...(typeof content['size'] === 'number' ? { size: content['size'] } : {}),
        ...annotations,
      });
    default:
      throw new AgentError({
        category: 'mcp',
        code: 'MCP_CONTENT_UNSUPPORTED',
        message: `MCP Tool result contains unsupported ${content.type} content.`,
        retryable: false,
      });
  }
}

function normalizeEmbeddedResource(
  value: unknown,
):
  | { readonly uri: string; readonly text: string; readonly mimeType?: string }
  | { readonly uri: string; readonly blob: string; readonly mimeType?: string } {
  if (!isRecord(value)) {
    throw invalidResult('MCP embedded resource must be an object.');
  }
  const base = {
    uri: requireString(value['uri'], 'MCP embedded resource URI'),
    ...(typeof value['mimeType'] === 'string' ? { mimeType: value['mimeType'] } : {}),
  };
  if (typeof value['text'] === 'string') return Object.freeze({ ...base, text: value['text'] });
  if (typeof value['blob'] === 'string') return Object.freeze({ ...base, blob: value['blob'] });
  throw invalidResult('MCP embedded resource requires text or blob content.');
}

function normalizeContentAnnotations(value: MCPContentAnnotations | undefined): {
  readonly annotations?: MCPContentAnnotations;
} {
  if (value === undefined) return {};
  return {
    annotations: Object.freeze({
      ...(value.audience === undefined ? {} : { audience: Object.freeze([...value.audience]) }),
      ...(value.priority === undefined ? {} : { priority: value.priority }),
      ...(value.lastModified === undefined ? {} : { lastModified: value.lastModified }),
    }),
  };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw invalidResult(`${label} must be a string.`);
  return value;
}

function invalidResult(message: string): AgentError {
  return new AgentError({
    category: 'mcp',
    code: 'MCP_RESULT_INVALID',
    message,
    retryable: false,
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function closeAfterFailedConnection(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    // Preserve the initialization failure as the owning diagnostic.
  }
}

function connectionError(error: unknown): AgentError {
  return new AgentError({
    category: 'network',
    code: 'MCP_CONNECT_FAILED',
    message: `Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`,
    retryable: true,
  });
}

export function createMCPClient(config: MCPServerConfig): IMCPClient {
  if (config.transport === 'stdio') {
    if (!config.command) {
      throw new AgentError({
        category: 'validation',
        code: 'MCP_STDIO_COMMAND_REQUIRED',
        message: `MCP stdio server ${config.id} requires a command.`,
        retryable: false,
      });
    }
    return new StdioMCPClient(config.id, {
      command: config.command,
      ...(config.args === undefined ? {} : { args: config.args }),
      ...(config.env === undefined ? {} : { env: config.env }),
      ...(config.cwd === undefined ? {} : { cwd: config.cwd }),
      ...(config.inheritProcessEnv === undefined
        ? {}
        : { inheritProcessEnv: config.inheritProcessEnv }),
      ...(config.requestTimeout === undefined ? {} : { requestTimeout: config.requestTimeout }),
    });
  }
  if (!config.url) {
    throw new AgentError({
      category: 'validation',
      code: 'MCP_HTTP_URL_REQUIRED',
      message: `MCP HTTP server ${config.id} requires a URL.`,
      retryable: false,
    });
  }
  return new HttpMCPClient(config.id, {
    url: config.url,
    ...(config.headers === undefined ? {} : { headers: config.headers }),
    ...(config.requestTimeout === undefined ? {} : { timeout: config.requestTimeout }),
  });
}
