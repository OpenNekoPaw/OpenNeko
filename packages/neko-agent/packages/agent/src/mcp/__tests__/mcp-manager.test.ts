/**
 * MCPManager Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPManager } from '../mcp-manager';
import type { IMCPClient, MCPServerConfig, MCPToolDefinition } from '@neko/shared';
import { AgentError } from '../../errors';

// Mock the mcp-client module
vi.mock('../mcp-client', () => ({
  createMCPClient: vi.fn(),
}));

// Mock the logger
vi.mock('../../utils/logger', () => ({
  getLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Import mocked function
import { createMCPClient } from '../mcp-client';

// =============================================================================
// Helpers
// =============================================================================

function createMockClient(connected = true): IMCPClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(connected),
    listTools: vi.fn().mockResolvedValue([]),
    callTool: vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: 'success' }],
    }),
  };
}

function createServerConfig(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'test-server',
    name: 'Test Server',
    type: 'stdio',
    enabled: true,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('MCPManager', () => {
  let manager: MCPManager;
  let mockCreateMCPClient: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new MCPManager();
    mockCreateMCPClient = vi.mocked(createMCPClient);
    mockCreateMCPClient.mockClear();
  });

  describe('register', () => {
    it('should register a server config', () => {
      const config = createServerConfig();
      manager.register(config);

      const servers = manager.listServers();
      expect(servers).toHaveLength(1);
      expect(servers[0]).toEqual(config);
    });

    it('should register multiple servers', () => {
      const config1 = createServerConfig({ id: 'server-1', name: 'Server 1' });
      const config2 = createServerConfig({ id: 'server-2', name: 'Server 2' });

      manager.register(config1);
      manager.register(config2);

      const servers = manager.listServers();
      expect(servers).toHaveLength(2);
      expect(servers).toContainEqual(config1);
      expect(servers).toContainEqual(config2);
    });

    it('should overwrite existing server with same ID', () => {
      const config1 = createServerConfig({ name: 'Original' });
      const config2 = createServerConfig({ name: 'Updated' });

      manager.register(config1);
      manager.register(config2);

      const servers = manager.listServers();
      expect(servers).toHaveLength(1);
      expect(servers[0]?.name).toBe('Updated');
    });
  });

  describe('listServers', () => {
    it('should return empty array when no servers registered', () => {
      const servers = manager.listServers();
      expect(servers).toEqual([]);
    });

    it('should return all registered servers', () => {
      const config1 = createServerConfig({ id: 'server-1' });
      const config2 = createServerConfig({ id: 'server-2' });

      manager.register(config1);
      manager.register(config2);

      const servers = manager.listServers();
      expect(servers).toHaveLength(2);
    });
  });

  describe('unregister', () => {
    it('should remove server from registry', () => {
      const config = createServerConfig();
      manager.register(config);

      manager.unregister('test-server');

      const servers = manager.listServers();
      expect(servers).toHaveLength(0);
    });

    it('should disconnect client if connected', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      manager.unregister('test-server');

      // Disconnect is called but errors are caught
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should remove client from clients map', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      manager.unregister('test-server');

      const client = manager.getClient('test-server');
      expect(client).toBeUndefined();
    });

    it('should handle unregistering non-existent server', () => {
      expect(() => manager.unregister('non-existent')).not.toThrow();
    });

    it('should handle disconnect errors gracefully', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockClient.disconnect = vi.fn().mockRejectedValue(new Error('Disconnect failed'));
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      // Should not throw
      expect(() => manager.unregister('test-server')).not.toThrow();
    });
  });

  describe('getClient', () => {
    it('should return undefined for unknown server', () => {
      const client = manager.getClient('unknown');
      expect(client).toBeUndefined();
    });

    it('should return undefined for registered but not connected server', () => {
      const config = createServerConfig();
      manager.register(config);

      const client = manager.getClient('test-server');
      expect(client).toBeUndefined();
    });

    it('should return client for connected server', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const client = manager.getClient('test-server');
      expect(client).toBe(mockClient);
    });
  });

  describe('connect', () => {
    it('should return existing connected client', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      const client1 = await manager.connect('test-server');
      const client2 = await manager.connect('test-server');

      expect(client1).toBe(client2);
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should create new client for registered server', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      const client = await manager.connect('test-server');

      expect(mockCreateMCPClient).toHaveBeenCalledWith(config);
      expect(mockClient.connect).toHaveBeenCalled();
      expect(client).toBe(mockClient);
    });

    it('should throw AgentError for unknown server', async () => {
      await expect(manager.connect('unknown')).rejects.toThrow(AgentError);
      await expect(manager.connect('unknown')).rejects.toThrow('MCP server unknown not found');
    });

    it('should throw AgentError with correct properties for unknown server', async () => {
      try {
        await manager.connect('unknown');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        const agentError = error as AgentError;
        expect(agentError.category).toBe('mcp');
        expect(agentError.code).toBe('MCP_SERVER_NOT_FOUND');
        expect(agentError.retryable).toBe(false);
      }
    });

    it('should throw AgentError for disabled server', async () => {
      const config = createServerConfig({ enabled: false });
      manager.register(config);

      await expect(manager.connect('test-server')).rejects.toThrow(AgentError);
      await expect(manager.connect('test-server')).rejects.toThrow(
        'MCP server test-server is disabled',
      );
    });

    it('should throw AgentError with correct properties for disabled server', async () => {
      const config = createServerConfig({ enabled: false });
      manager.register(config);

      try {
        await manager.connect('test-server');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        const agentError = error as AgentError;
        expect(agentError.category).toBe('validation');
        expect(agentError.code).toBe('MCP_SERVER_DISABLED');
        expect(agentError.retryable).toBe(false);
      }
    });

    it('should store client in clients map after connection', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const client = manager.getClient('test-server');
      expect(client).toBe(mockClient);
    });

    it('should propagate connection errors', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockClient.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);

      await expect(manager.connect('test-server')).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('should disconnect and remove client', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      await manager.disconnect('test-server');

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(manager.getClient('test-server')).toBeUndefined();
    });

    it('should be no-op for unknown server', async () => {
      await expect(manager.disconnect('unknown')).resolves.not.toThrow();
    });

    it('should be no-op for registered but not connected server', async () => {
      const config = createServerConfig();
      manager.register(config);

      await expect(manager.disconnect('test-server')).resolves.not.toThrow();
    });

    it('should propagate disconnect errors', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockClient.disconnect = vi.fn().mockRejectedValue(new Error('Disconnect failed'));
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      await expect(manager.disconnect('test-server')).rejects.toThrow('Disconnect failed');
    });
  });

  describe('getAllTools', () => {
    it('should return empty array when no clients connected', async () => {
      const tools = await manager.getAllTools();
      expect(tools).toEqual([]);
    });

    it('should collect tools from all connected clients', async () => {
      const config1 = createServerConfig({ id: 'server-1' });
      const config2 = createServerConfig({ id: 'server-2' });

      const mockClient1 = createMockClient();
      const mockClient2 = createMockClient();

      const tools1: MCPToolDefinition[] = [
        { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
      ];
      const tools2: MCPToolDefinition[] = [
        { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
      ];

      mockClient1.listTools = vi.fn().mockResolvedValue(tools1);
      mockClient2.listTools = vi.fn().mockResolvedValue(tools2);

      mockCreateMCPClient.mockReturnValueOnce(mockClient1).mockReturnValueOnce(mockClient2);

      manager.register(config1);
      manager.register(config2);
      await manager.connect('server-1');
      await manager.connect('server-2');

      const allTools = await manager.getAllTools();

      expect(allTools).toHaveLength(2);
      expect(allTools[0]).toEqual({ ...tools1[0], serverId: 'server-1' });
      expect(allTools[1]).toEqual({ ...tools2[0], serverId: 'server-2' });
    });

    it('should skip disconnected clients', async () => {
      const config1 = createServerConfig({ id: 'server-1' });
      const config2 = createServerConfig({ id: 'server-2' });

      const mockClient1 = createMockClient(true);
      const mockClient2 = createMockClient(false);

      const tools1: MCPToolDefinition[] = [
        { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
      ];

      mockClient1.listTools = vi.fn().mockResolvedValue(tools1);

      mockCreateMCPClient.mockReturnValueOnce(mockClient1).mockReturnValueOnce(mockClient2);

      manager.register(config1);
      manager.register(config2);
      await manager.connect('server-1');
      await manager.connect('server-2');

      const allTools = await manager.getAllTools();

      expect(allTools).toHaveLength(1);
      expect(allTools[0]).toEqual({ ...tools1[0], serverId: 'server-1' });
      expect(mockClient2.listTools).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and continue', async () => {
      const config1 = createServerConfig({ id: 'server-1' });
      const config2 = createServerConfig({ id: 'server-2' });

      const mockClient1 = createMockClient();
      const mockClient2 = createMockClient();

      mockClient1.listTools = vi.fn().mockRejectedValue(new Error('List tools failed'));
      const tools2: MCPToolDefinition[] = [
        { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
      ];
      mockClient2.listTools = vi.fn().mockResolvedValue(tools2);

      mockCreateMCPClient.mockReturnValueOnce(mockClient1).mockReturnValueOnce(mockClient2);

      manager.register(config1);
      manager.register(config2);
      await manager.connect('server-1');
      await manager.connect('server-2');

      const allTools = await manager.getAllTools();

      // Should still get tools from server-2
      expect(allTools).toHaveLength(1);
      expect(allTools[0]).toEqual({ ...tools2[0], serverId: 'server-2' });
    });

    it('should handle multiple tools from single server', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();

      const tools: MCPToolDefinition[] = [
        { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
        { name: 'tool3', description: 'Tool 3', inputSchema: { type: 'object' } },
      ];

      mockClient.listTools = vi.fn().mockResolvedValue(tools);
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const allTools = await manager.getAllTools();

      expect(allTools).toHaveLength(3);
      allTools.forEach((tool, index) => {
        expect(tool).toEqual({ ...tools[index], serverId: 'test-server' });
      });
    });
  });

  describe('connectAll', () => {
    it('should connect all enabled servers', async () => {
      const config1 = createServerConfig({ id: 'server-1', enabled: true });
      const config2 = createServerConfig({ id: 'server-2', enabled: true });

      const mockClient1 = createMockClient();
      const mockClient2 = createMockClient();

      mockCreateMCPClient.mockReturnValueOnce(mockClient1).mockReturnValueOnce(mockClient2);

      manager.register(config1);
      manager.register(config2);

      await manager.connectAll();

      expect(mockClient1.connect).toHaveBeenCalled();
      expect(mockClient2.connect).toHaveBeenCalled();
    });

    it('should skip disabled servers', async () => {
      const config1 = createServerConfig({ id: 'server-1', enabled: true });
      const config2 = createServerConfig({ id: 'server-2', enabled: false });

      const mockClient1 = createMockClient();

      mockCreateMCPClient.mockReturnValue(mockClient1);

      manager.register(config1);
      manager.register(config2);

      await manager.connectAll();

      expect(mockClient1.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle connection errors gracefully', async () => {
      const config1 = createServerConfig({ id: 'server-1' });
      const config2 = createServerConfig({ id: 'server-2' });

      const mockClient1 = createMockClient();
      const mockClient2 = createMockClient();

      mockClient1.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));

      mockCreateMCPClient.mockReturnValueOnce(mockClient1).mockReturnValueOnce(mockClient2);

      manager.register(config1);
      manager.register(config2);

      // Should not throw
      await expect(manager.connectAll()).resolves.not.toThrow();

      // server-2 should still be connected
      expect(mockClient2.connect).toHaveBeenCalled();
    });

    it('should handle no servers registered', async () => {
      await expect(manager.connectAll()).resolves.not.toThrow();
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all connected clients', async () => {
      const config1 = createServerConfig({ id: 'server-1' });
      const config2 = createServerConfig({ id: 'server-2' });

      const mockClient1 = createMockClient();
      const mockClient2 = createMockClient();

      mockCreateMCPClient.mockReturnValueOnce(mockClient1).mockReturnValueOnce(mockClient2);

      manager.register(config1);
      manager.register(config2);
      await manager.connect('server-1');
      await manager.connect('server-2');

      await manager.disconnectAll();

      expect(mockClient1.disconnect).toHaveBeenCalled();
      expect(mockClient2.disconnect).toHaveBeenCalled();
      expect(manager.getClient('server-1')).toBeUndefined();
      expect(manager.getClient('server-2')).toBeUndefined();
    });

    it('should handle no connected clients', async () => {
      await expect(manager.disconnectAll()).resolves.not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should disconnect all connected clients', async () => {
      const config1 = createServerConfig({ id: 'server-1' });
      const config2 = createServerConfig({ id: 'server-2' });

      const mockClient1 = createMockClient();
      const mockClient2 = createMockClient();

      mockCreateMCPClient.mockReturnValueOnce(mockClient1).mockReturnValueOnce(mockClient2);

      manager.register(config1);
      manager.register(config2);
      await manager.connect('server-1');
      await manager.connect('server-2');

      await manager.dispose();

      expect(mockClient1.disconnect).toHaveBeenCalled();
      expect(mockClient2.disconnect).toHaveBeenCalled();
      expect(manager.getClient('server-1')).toBeUndefined();
      expect(manager.getClient('server-2')).toBeUndefined();
    });

    it('should handle no connected clients', async () => {
      await expect(manager.dispose()).resolves.not.toThrow();
    });

    it('should handle disconnect errors', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockClient.disconnect = vi.fn().mockRejectedValue(new Error('Disconnect failed'));

      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      // Should propagate error
      await expect(manager.dispose()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('callTool', () => {
    it('should call tool on connected server', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      const mockResult = {
        isError: false,
        content: [{ type: 'text', text: 'Tool result' }],
      };
      mockClient.callTool = vi.fn().mockResolvedValue(mockResult);

      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const result = await manager.callTool('test-server', 'myTool', { arg: 'value' });

      expect(mockClient.callTool).toHaveBeenCalledWith('myTool', { arg: 'value' });
      expect(result).toEqual({ success: true, data: 'Tool result' });
    });

    it('should auto-reconnect when server is disconnected', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      let connectCount = 0;

      // First connection succeeds, then client appears disconnected,
      // then reconnect succeeds and client is connected again
      mockClient.isConnected = vi.fn().mockImplementation(() => connectCount > 0);
      mockClient.connect = vi.fn().mockImplementation(() => {
        connectCount++;
        return Promise.resolve();
      });
      const mockResult = {
        isError: false,
        content: [{ type: 'text', text: 'reconnected result' }],
      };
      mockClient.callTool = vi.fn().mockResolvedValue(mockResult);
      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      // First connect
      await manager.connect('test-server');

      // Reset isConnected to simulate disconnection
      connectCount = 0;
      mockClient.isConnected = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);

      const result = await manager.callTool('test-server', 'myTool', {});

      expect(result.success).toBe(true);
      expect(result.data).toBe('reconnected result');
    });

    it('should return error when reconnect fails', async () => {
      const config = createServerConfig({ enabled: false }); // disabled so reconnect will fail
      manager.register(config);

      const result = await manager.callTool('test-server', 'myTool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('reconnect failed');
    });

    it('should return error for completely unknown server', async () => {
      const result = await manager.callTool('unknown', 'myTool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not connected');
    });

    it('should handle tool errors from result', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      const mockResult = {
        isError: true,
        content: [{ type: 'text', text: 'Tool execution failed' }],
      };
      mockClient.callTool = vi.fn().mockResolvedValue(mockResult);

      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const result = await manager.callTool('test-server', 'myTool', {});

      expect(result).toEqual({
        success: false,
        error: 'Tool execution failed',
      });
    });

    it('should handle tool errors with multiple content items', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      const mockResult = {
        isError: true,
        content: [
          { type: 'text', text: 'Error line 1' },
          { type: 'image', data: 'base64...' },
          { type: 'text', text: 'Error line 2' },
        ],
      };
      mockClient.callTool = vi.fn().mockResolvedValue(mockResult);

      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const result = await manager.callTool('test-server', 'myTool', {});

      expect(result).toEqual({
        success: false,
        error: 'Error line 1\nError line 2',
      });
    });

    it('should handle tool errors with no text content', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      const mockResult = {
        isError: true,
        content: [{ type: 'image', data: 'base64...' }],
      };
      mockClient.callTool = vi.fn().mockResolvedValue(mockResult);

      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const result = await manager.callTool('test-server', 'myTool', {});

      expect(result).toEqual({
        success: false,
        error: 'Tool call failed',
      });
    });

    it('should extract text content from successful result', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      const mockResult = {
        isError: false,
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'text', text: 'Line 2' },
        ],
      };
      mockClient.callTool = vi.fn().mockResolvedValue(mockResult);

      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const result = await manager.callTool('test-server', 'myTool', {});

      expect(result).toEqual({
        success: true,
        data: 'Line 1\nLine 2',
      });
    });

    it('should return full content when no text content', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      const mockResult = {
        isError: false,
        content: [{ type: 'image', data: 'base64...' }],
      };
      mockClient.callTool = vi.fn().mockResolvedValue(mockResult);

      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const result = await manager.callTool('test-server', 'myTool', {});

      expect(result).toEqual({
        success: true,
        data: mockResult.content,
      });
    });

    it('should handle exceptions during tool call', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockClient.callTool = vi.fn().mockRejectedValue(new Error('Network error'));

      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const result = await manager.callTool('test-server', 'myTool', {});

      expect(result).toEqual({
        success: false,
        error: 'Network error',
      });
    });

    it('should handle non-Error exceptions', async () => {
      const config = createServerConfig();
      const mockClient = createMockClient();
      mockClient.callTool = vi.fn().mockRejectedValue('String error');

      mockCreateMCPClient.mockReturnValue(mockClient);

      manager.register(config);
      await manager.connect('test-server');

      const result = await manager.callTool('test-server', 'myTool', {});

      expect(result).toEqual({
        success: false,
        error: 'String error',
      });
    });
  });
});
