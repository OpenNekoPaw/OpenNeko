/**
 * MCP Types - Model Context Protocol (shared)
 *
 * Note: MCPServerConfig is defined in config.ts to avoid duplication.
 * This file defines runtime types for MCP protocol implementation.
 */

import type { MCPServerConfig } from './config';

// Re-export for convenience
export type { MCPServerConfig } from './config';

/**
 * MCP transport type
 */
export type MCPTransportType = 'stdio' | 'http';

/**
 * Stdio transport configuration (runtime)
 */
export interface MCPStdioConfig {
  /** Command to run */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Whether to inherit the complete host process environment. Defaults to a safe allowlist. */
  inheritProcessEnv?: boolean;
  /** Working directory */
  cwd?: string;
  /** Request timeout in ms (default: 30000) */
  requestTimeout?: number;
}

/**
 * HTTP transport configuration (runtime)
 */
export interface MCPHttpConfig {
  /** Server URL */
  url: string;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Request timeout */
  timeout?: number;
}

/**
 * MCP tool definition (from server)
 */
export interface MCPToolDefinition {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema?: Readonly<Record<string, unknown>>;
  readonly annotations?: MCPToolAnnotations;
  readonly execution?: {
    readonly taskSupport?: 'optional' | 'required' | 'forbidden';
  };
}

/** Untrusted standard MCP Tool hints. Product policy may only make these more restrictive. */
export interface MCPToolAnnotations {
  readonly title?: string;
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

/**
 * MCP resource definition
 */
export interface MCPResource {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name: string;
  /** Resource description */
  description?: string;
  /** MIME type */
  mimeType?: string;
}

/**
 * MCP prompt definition
 */
export interface MCPPrompt {
  /** Prompt name */
  name: string;
  /** Prompt description */
  description?: string;
  /** Prompt arguments */
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPContentAnnotations {
  readonly audience?: readonly ('user' | 'assistant')[];
  readonly priority?: number;
  readonly lastModified?: string;
}

export interface MCPTextContent {
  readonly type: 'text';
  readonly text: string;
  readonly annotations?: MCPContentAnnotations;
}

export interface MCPBinaryContent {
  readonly type: 'image' | 'audio';
  readonly data: string;
  readonly mimeType: string;
  readonly annotations?: MCPContentAnnotations;
}

export interface MCPEmbeddedResourceContent {
  readonly type: 'resource';
  readonly resource:
    | {
        readonly uri: string;
        readonly text: string;
        readonly mimeType?: string;
      }
    | {
        readonly uri: string;
        readonly blob: string;
        readonly mimeType?: string;
      };
  readonly annotations?: MCPContentAnnotations;
}

export interface MCPResourceLinkContent {
  readonly type: 'resource_link';
  readonly uri: string;
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly mimeType?: string;
  readonly size?: number;
  readonly annotations?: MCPContentAnnotations;
}

export type MCPToolResultContent =
  MCPTextContent | MCPBinaryContent | MCPEmbeddedResourceContent | MCPResourceLinkContent;

/**
 * MCP tool call result
 */
export interface MCPToolResult {
  readonly content: readonly MCPToolResultContent[];
  readonly structuredContent?: Readonly<Record<string, unknown>>;
  readonly isError?: boolean;
}

export interface MCPConnectionInfo {
  readonly protocolVersion: string;
  readonly server: {
    readonly name: string;
    readonly version: string;
  };
  readonly capabilities: Readonly<Record<string, unknown>>;
}

export interface MCPRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface MCPToolCallResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly content?: readonly MCPToolResultContent[];
  readonly structuredContent?: Readonly<Record<string, unknown>>;
  readonly error?: string;
}

/**
 * MCP client interface
 */
export interface IMCPClient {
  /** Server ID */
  readonly serverId: string;

  /** Connect to server */
  connect(options?: MCPRequestOptions): Promise<void>;

  /** Disconnect from server */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /** Negotiated external protocol and server facts for diagnostics. */
  getConnectionInfo(): MCPConnectionInfo | undefined;

  /** List available tools */
  listTools(options?: MCPRequestOptions): Promise<MCPToolDefinition[]>;

  /** Call a tool */
  callTool(
    name: string,
    args: Record<string, unknown>,
    options?: MCPRequestOptions,
  ): Promise<MCPToolResult>;

  /** List available resources */
  listResources(): Promise<MCPResource[]>;

  /** Read a resource */
  readResource(uri: string): Promise<string>;

  /** List available prompts */
  listPrompts(): Promise<MCPPrompt[]>;

  /** Get a prompt */
  getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<{ messages: Array<{ role: string; content: string }> }>;
}

/**
 * MCP manager interface
 */
export interface IMCPManager {
  /** Register a server */
  register(config: MCPServerConfig): void;

  /** Unregister a server */
  unregister(serverId: string): void;

  /** Get client for server */
  getClient(serverId: string): IMCPClient | undefined;

  /** List all servers */
  listServers(): MCPServerConfig[];

  /** Connect to a server */
  connect(serverId: string): Promise<IMCPClient>;

  /** Disconnect from a server */
  disconnect(serverId: string): Promise<void>;

  /** Get all tools from all connected servers */
  getAllTools(): Promise<Array<MCPToolDefinition & { serverId: string }>>;

  /** Dispose all connections */
  dispose(): Promise<void>;
}
