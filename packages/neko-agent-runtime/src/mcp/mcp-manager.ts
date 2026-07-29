/**
 * MCP Manager - Manages multiple MCP servers
 */

import type { IMCPManager, IMCPClient, MCPServerConfig, MCPToolDefinition } from '@neko/shared';
import { createMCPClient } from './mcp-client';
import { AgentError } from '../errors';
import { getLogger } from '../utils/logger';

const logger = getLogger('MCPManager');

/**
 * MCP manager implementation
 */
export class MCPManager implements IMCPManager {
  private servers: Map<string, MCPServerConfig> = new Map();
  private clients: Map<string, IMCPClient> = new Map();

  /**
   * Register a server
   */
  register(config: MCPServerConfig): void {
    this.servers.set(config.id, config);
  }

  /**
   * Unregister a server
   */
  unregister(serverId: string): void {
    const client = this.clients.get(serverId);
    if (client) {
      client.disconnect().catch(() => {});
      this.clients.delete(serverId);
    }
    this.servers.delete(serverId);
  }

  /**
   * Get client for server
   */
  getClient(serverId: string): IMCPClient | undefined {
    return this.clients.get(serverId);
  }

  /**
   * List all servers
   */
  listServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * Connect to a server
   */
  async connect(serverId: string): Promise<IMCPClient> {
    // Return existing connected client
    const existingClient = this.clients.get(serverId);
    if (existingClient?.isConnected()) {
      return existingClient;
    }

    // Get server config
    const config = this.servers.get(serverId);
    if (!config) {
      throw new AgentError({
        category: 'mcp',
        code: 'MCP_SERVER_NOT_FOUND',
        message: `MCP server ${serverId} not found`,
        retryable: false,
      });
    }

    if (!config.enabled) {
      throw new AgentError({
        category: 'validation',
        code: 'MCP_SERVER_DISABLED',
        message: `MCP server ${serverId} is disabled`,
        retryable: false,
      });
    }

    // Create and connect client
    const client = createMCPClient(config);
    await client.connect();
    this.clients.set(serverId, client);

    return client;
  }

  /**
   * Disconnect from a server
   */
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
    }
  }

  /**
   * Get all tools from all connected servers
   */
  async getAllTools(): Promise<Array<MCPToolDefinition & { serverId: string }>> {
    const tools: Array<MCPToolDefinition & { serverId: string }> = [];

    for (const [serverId, client] of this.clients) {
      if (!client.isConnected()) continue;

      try {
        const serverTools = await client.listTools();
        for (const tool of serverTools) {
          tools.push({ ...tool, serverId });
        }
      } catch (error) {
        logger.error('Failed to list tools', { serverId, error });
      }
    }

    return tools;
  }

  /**
   * Connect to all enabled servers with concurrency limit.
   * Limits to MAX_CONCURRENT_CONNECTIONS simultaneous connections
   * to avoid overwhelming the system during startup.
   */
  async connectAll(): Promise<void> {
    const MAX_CONCURRENT = 3;
    const enabledConfigs = Array.from(this.servers.values()).filter((c) => c.enabled);

    // Process in batches of MAX_CONCURRENT
    for (let i = 0; i < enabledConfigs.length; i += MAX_CONCURRENT) {
      const batch = enabledConfigs.slice(i, i + MAX_CONCURRENT);
      await Promise.all(
        batch.map((config) =>
          this.connect(config.id)
            .then(() => {})
            .catch((error) => {
              logger.error('Failed to connect', { serverId: config.id, error });
            }),
        ),
      );
    }
  }

  /**
   * Disconnect from all servers (alias for dispose)
   */
  async disconnectAll(): Promise<void> {
    await this.dispose();
  }

  /**
   * Dispose all connections
   */
  async dispose(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];

    for (const serverId of this.clients.keys()) {
      disconnectPromises.push(this.disconnect(serverId));
    }

    await Promise.all(disconnectPromises);
  }

  /**
   * Call a tool on a specific server.
   * Attempts one automatic reconnect if the server is disconnected.
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    let client = this.clients.get(serverId);

    // Auto-reconnect: if disconnected, try one reconnect attempt
    if (!client?.isConnected()) {
      try {
        await this.connect(serverId);
        client = this.clients.get(serverId);
      } catch (error) {
        return {
          success: false,
          error: `MCP server ${serverId} is not connected and reconnect failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    if (!client?.isConnected()) {
      return {
        success: false,
        error: `MCP server ${serverId} is not connected`,
      };
    }

    try {
      const result = await client.callTool(toolName, args);

      if (result.isError) {
        const errorText = result.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n');

        return { success: false, error: errorText || 'Tool call failed' };
      }

      // Extract text content
      const textContent = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');

      return { success: true, data: textContent || result.content };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
