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
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema */
  inputSchema: Record<string, unknown>;
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

/**
 * MCP tool call result
 */
export interface MCPToolResult {
  /** Content array */
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  /** Whether call errored */
  isError?: boolean;
}

/**
 * MCP client interface
 */
export interface IMCPClient {
  /** Server ID */
  readonly serverId: string;

  /** Connect to server */
  connect(): Promise<void>;

  /** Disconnect from server */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /** List available tools */
  listTools(): Promise<MCPToolDefinition[]>;

  /** Call a tool */
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult>;

  /** List available resources */
  listResources(): Promise<MCPResource[]>;

  /** Read a resource */
  readResource(uri: string): Promise<string>;

  /** List available prompts */
  listPrompts(): Promise<MCPPrompt[]>;

  /** Get a prompt */
  getPrompt(
    name: string,
    args?: Record<string, unknown>,
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
