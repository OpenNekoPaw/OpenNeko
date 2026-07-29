/**
 * MCP Client - Model Context Protocol client implementation
 */

import type {
  IMCPClient,
  MCPServerConfig,
  MCPStdioConfig,
  MCPHttpConfig,
  MCPToolDefinition,
  MCPToolResult,
  MCPResource,
  MCPPrompt,
} from '@neko/shared';
import { AgentError } from '../errors';
import { getLogger } from '../utils/logger';

const logger = getLogger('MCPClient');

/**
 * JSON-RPC request
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC response
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Base MCP client abstract class
 */
abstract class BaseMCPClient implements IMCPClient {
  protected _connected = false;
  protected requestId = 0;

  constructor(public readonly serverId: string) {}

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  protected abstract sendRequest(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown>;

  isConnected(): boolean {
    return this._connected;
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    this.ensureConnected();
    const result = (await this.sendRequest('tools/list')) as {
      tools: MCPToolDefinition[];
    };
    return result.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensureConnected();
    const result = (await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })) as MCPToolResult;
    return result;
  }

  async listResources(): Promise<MCPResource[]> {
    this.ensureConnected();
    const result = (await this.sendRequest('resources/list')) as {
      resources: MCPResource[];
    };
    return result.resources || [];
  }

  async readResource(uri: string): Promise<string> {
    this.ensureConnected();
    const result = (await this.sendRequest('resources/read', { uri })) as {
      contents: Array<{ text?: string; blob?: string }>;
    };
    const content = result.contents?.[0];
    return content?.text || content?.blob || '';
  }

  async listPrompts(): Promise<MCPPrompt[]> {
    this.ensureConnected();
    const result = (await this.sendRequest('prompts/list')) as {
      prompts: MCPPrompt[];
    };
    return result.prompts || [];
  }

  async getPrompt(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ messages: Array<{ role: string; content: string }> }> {
    this.ensureConnected();
    const result = (await this.sendRequest('prompts/get', {
      name,
      arguments: args,
    })) as { messages: Array<{ role: string; content: { text: string } }> };

    return {
      messages: result.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content.text,
      })),
    };
  }

  protected ensureConnected(): void {
    if (!this._connected) {
      throw new AgentError({
        category: 'network',
        code: 'MCP_NOT_CONNECTED',
        message: `MCP client ${this.serverId} is not connected`,
        retryable: true,
      });
    }
  }

  protected nextRequestId(): number {
    return ++this.requestId;
  }

  protected createRequest(method: string, params?: Record<string, unknown>): JsonRpcRequest {
    return {
      jsonrpc: '2.0',
      id: this.nextRequestId(),
      method,
      params,
    };
  }

  protected parseResponse(response: JsonRpcResponse): unknown {
    if (response.error) {
      throw new AgentError({
        category: 'server',
        code: 'MCP_ERROR',
        message: response.error.message,
        retryable: false,
        context: { code: response.error.code, data: response.error.data },
      });
    }
    return response.result;
  }
}

/**
 * Stdio MCP client - communicates via stdin/stdout
 */
export class StdioMCPClient extends BaseMCPClient {
  private config: MCPStdioConfig;
  private process: {
    stdin: { write: (data: string) => void };
    stdout: { on: (event: string, handler: (data: Buffer) => void) => void };
    stderr: { on: (event: string, handler: (data: Buffer) => void) => void };
    kill: () => void;
    on: (event: string, handler: (code: number) => void) => void;
  } | null = null;
  private pendingRequests: Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();
  private buffer = '';

  constructor(serverId: string, config: MCPStdioConfig) {
    super(serverId);
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this._connected) return;

    try {
      // Dynamic import for Node.js child_process
      const { spawn } = await import('child_process');

      this.process = spawn(this.config.command, this.config.args || [], {
        cwd: this.config.cwd,
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      }) as unknown as typeof this.process;

      // Handle stdout data
      this.process!.stdout.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      // Handle stderr
      this.process!.stderr.on('data', (data: Buffer) => {
        logger.error('MCP stderr', { serverId: this.serverId, data: data.toString() });
      });

      // Handle process exit
      this.process!.on('exit', (code: number) => {
        this._connected = false;
        // Reject all pending requests
        for (const [, { reject }] of this.pendingRequests) {
          reject(
            new AgentError({
              category: 'network',
              code: 'MCP_PROCESS_EXIT',
              message: `MCP process exited with code ${code}`,
              retryable: false,
            }),
          );
        }
        this.pendingRequests.clear();
      });

      // Initialize connection
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'neko-agent', version: '1.0.0' },
      });

      // Send initialized notification
      this.sendNotification('notifications/initialized');

      this._connected = true;
    } catch (error) {
      // Kill orphan process on initialization failure
      if (this.process) {
        this.process.kill();
        this.process = null;
      }
      this.pendingRequests.clear();

      throw new AgentError({
        category: 'network',
        code: 'MCP_CONNECT_FAILED',
        message: `Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
      });
    }
  }

  async disconnect(): Promise<void> {
    if (!this._connected || !this.process) return;

    this.process.kill();
    this.process = null;
    this._connected = false;
    this.pendingRequests.clear();
  }

  protected async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process) {
      throw new AgentError({
        category: 'network',
        code: 'MCP_NOT_CONNECTED',
        message: 'MCP process not started',
        retryable: true,
      });
    }

    const request = this.createRequest(method, params);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request.id, { resolve, reject });

      const message = JSON.stringify(request) + '\n';
      this.process!.stdin.write(message);

      // Timeout — use configured value or default 30s
      const timeoutMs = this.config.requestTimeout ?? 30000;
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(
            new AgentError({
              category: 'timeout',
              code: 'MCP_TIMEOUT',
              message: `MCP request ${method} timed out after ${timeoutMs}ms`,
              retryable: true,
            }),
          );
        }
      }, timeoutMs);

      // Wrap resolve/reject to clear timeout on completion
      const originalEntry = this.pendingRequests.get(request.id)!;
      this.pendingRequests.set(request.id, {
        resolve: (value: unknown) => {
          clearTimeout(timeoutId);
          originalEntry.resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          originalEntry.reject(error);
        },
      });
    });
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.process) return;

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  private handleData(data: string): void {
    this.buffer += data;

    // Process complete JSON messages
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        if (response.id !== undefined) {
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            try {
              pending.resolve(this.parseResponse(response));
            } catch (error) {
              pending.reject(error as Error);
            }
          }
        }
      } catch {
        // Ignore parse errors for incomplete messages
      }
    }
  }
}

/**
 * HTTP MCP client - communicates via HTTP/SSE
 */
export class HttpMCPClient extends BaseMCPClient {
  private config: MCPHttpConfig;
  private sessionId: string | null = null;

  constructor(serverId: string, config: MCPHttpConfig) {
    super(serverId);
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this._connected) return;

    try {
      // Initialize connection
      const result = (await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'neko-agent', version: '1.0.0' },
      })) as { sessionId?: string };

      this.sessionId = result.sessionId || null;
      this._connected = true;

      // Send initialized notification
      await this.sendNotification('notifications/initialized');
    } catch (error) {
      throw new AgentError({
        category: 'network',
        code: 'MCP_CONNECT_FAILED',
        message: `Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
      });
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.sessionId = null;
  }

  protected async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const request = this.createRequest(method, params);
    const timeout = this.config.timeout || 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
          ...(this.sessionId ? { 'X-Session-ID': this.sessionId } : {}),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new AgentError({
          category: 'server',
          code: 'MCP_HTTP_ERROR',
          message: `HTTP error: ${response.status} ${response.statusText}`,
          retryable: response.status >= 500,
        });
      }

      const jsonResponse = (await response.json()) as JsonRpcResponse;
      return this.parseResponse(jsonResponse);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof AgentError) throw error;

      if ((error as Error).name === 'AbortError') {
        throw new AgentError({
          category: 'timeout',
          code: 'MCP_TIMEOUT',
          message: `MCP request ${method} timed out after ${timeout}ms`,
          retryable: true,
        });
      }

      throw new AgentError({
        category: 'network',
        code: 'MCP_REQUEST_FAILED',
        message: `MCP request failed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
      });
    }
  }

  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    try {
      await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
          ...(this.sessionId ? { 'X-Session-ID': this.sessionId } : {}),
        },
        body: JSON.stringify(notification),
      });
    } catch {
      // Ignore notification errors
    }
  }
}

/**
 * Create MCP client based on config
 */
export function createMCPClient(config: MCPServerConfig): IMCPClient {
  if (config.transport === 'stdio') {
    // Extract stdio config from flat MCPServerConfig
    const stdioConfig: MCPStdioConfig = {
      command: config.command || '',
      args: config.args,
      env: config.env,
      requestTimeout: config.requestTimeout,
    };
    return new StdioMCPClient(config.id, stdioConfig);
  } else {
    // Extract http config from flat MCPServerConfig
    const httpConfig: MCPHttpConfig = {
      url: config.url || '',
      timeout: config.requestTimeout,
    };
    return new HttpMCPClient(config.id, httpConfig);
  }
}
