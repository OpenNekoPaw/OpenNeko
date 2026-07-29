import { describe, expect, it, vi } from 'vitest';
import type { IMCPClient, MCPServerConfig, Tool } from '@neko/shared';
import { MCPManager } from '../mcp-manager';
import { connectMCPServersRuntime } from '../mcp-runtime-bootstrap';

function createServer(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'server-a',
    name: 'Server A',
    description: 'Test MCP server',
    category: 'development',
    transport: 'stdio',
    command: 'test-command',
    enabled: true,
    ...overrides,
  };
}

function createConnectedClient(serverId: string): IMCPClient {
  return {
    serverId,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: () => true,
    listTools: vi.fn(async () => []),
    callTool: vi.fn(async () => ({ content: [] })),
    listResources: vi.fn(async () => []),
    readResource: vi.fn(async () => ''),
    listPrompts: vi.fn(async () => []),
    getPrompt: vi.fn(async () => ({ messages: [] })),
  };
}

function createTool(name: string): Tool {
  return {
    name,
    description: 'Test tool',
    category: 'mcp',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: vi.fn(async () => ({ success: true })),
  };
}

describe('connectMCPServersRuntime', () => {
  it('connects registered servers and registers MCP tools without requiring a state observer', async () => {
    const mcpManager = new MCPManager();
    mcpManager.register(createServer({ id: 'server-a', name: 'Server A' }));

    const connect = vi
      .spyOn(mcpManager, 'connect')
      .mockImplementation(async (serverId) => createConnectedClient(serverId));
    const tool = createTool('mcp__server-a__search');
    const toolRegistry = { register: vi.fn() };
    const createTools = vi.fn(async () => [tool]);

    const result = await connectMCPServersRuntime({
      mcpManager,
      toolRegistry,
      createTools,
    });

    expect(connect).toHaveBeenCalledWith('server-a');
    expect(createTools).toHaveBeenCalledWith(mcpManager, {});
    expect(toolRegistry.register).toHaveBeenCalledWith(tool);
    expect(result).toEqual({
      connectedServerIds: ['server-a'],
      failedServers: [],
      registeredToolCount: 1,
    });
  });

  it('connects multiple registered servers and registers MCP tools', async () => {
    const mcpManager = new MCPManager();
    mcpManager.register(createServer({ id: 'server-a', name: 'Server A' }));
    mcpManager.register(createServer({ id: 'server-b', name: 'Server B' }));

    const connect = vi
      .spyOn(mcpManager, 'connect')
      .mockImplementation(async (serverId) => createConnectedClient(serverId));
    const tool = createTool('mcp__server-a__search');
    const toolRegistry = { register: vi.fn() };
    const createTools = vi.fn(async () => [tool]);

    const result = await connectMCPServersRuntime({
      mcpManager,
      toolRegistry,
      createTools,
    });

    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenNthCalledWith(1, 'server-a');
    expect(connect).toHaveBeenNthCalledWith(2, 'server-b');
    expect(createTools).toHaveBeenCalledWith(mcpManager, {});
    expect(toolRegistry.register).toHaveBeenCalledWith(tool);
    expect(result).toEqual({
      connectedServerIds: ['server-a', 'server-b'],
      failedServers: [],
      registeredToolCount: 1,
    });
  });

  it('keeps connecting remaining servers and registers tools after failures', async () => {
    const events: string[] = [];
    const mcpManager = new MCPManager();
    mcpManager.register(createServer({ id: 'server-a', name: 'Server A' }));
    mcpManager.register(createServer({ id: 'server-b', name: 'Server B' }));

    vi.spyOn(mcpManager, 'connect').mockImplementation(async (serverId) => {
      events.push(`connect:${serverId}`);
      if (serverId === 'server-b') {
        throw new Error('connection refused');
      }
      return createConnectedClient(serverId);
    });

    const toolRegistry = { register: vi.fn() };
    const createTools = vi.fn(async () => {
      events.push('createTools');
      return [createTool('mcp__server-a__search')];
    });

    const result = await connectMCPServersRuntime({
      mcpManager,
      toolRegistry,
      createTools,
    });

    expect(events).toEqual(['connect:server-a', 'connect:server-b', 'createTools']);
    expect(toolRegistry.register).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      connectedServerIds: ['server-a'],
      failedServers: [
        {
          id: 'server-b',
          name: 'Server B',
          error: 'connection refused',
        },
      ],
      registeredToolCount: 1,
    });
  });

  it('passes external research MCP bindings as adapter-only raw MCP filters', async () => {
    const mcpManager = new MCPManager();
    mcpManager.register(createServer({ id: 'research', name: 'Research' }));

    vi.spyOn(mcpManager, 'connect').mockImplementation(async (serverId) =>
      createConnectedClient(serverId),
    );
    const toolRegistry = { register: vi.fn() };
    const createTools = vi.fn(async () => [createTool('mcp__research__repo_status')]);

    await connectMCPServersRuntime({
      mcpManager,
      toolRegistry,
      createTools,
      externalResearch: {
        mode: 'live',
        providerId: 'mcp:research',
        mcp: {
          serverId: 'research',
          searchTool: {
            name: 'web_search',
            queryArg: 'query',
            outputSchema: 'neko.externalResearch.search.v1',
          },
          fetchTool: {
            name: 'fetch_url',
            urlArg: 'url',
            outputSchema: 'neko.externalResearch.fetch.v1',
          },
        },
      },
    });

    expect(createTools).toHaveBeenCalledWith(mcpManager, {
      adapterOnlyTools: [
        { serverId: 'research', toolName: 'web_search' },
        { serverId: 'research', toolName: 'fetch_url' },
      ],
      exposeAdapterOnlyTools: false,
    });
    expect(toolRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'mcp__research__repo_status' }),
    );
  });

  it('can pass the explicit raw MCP exposure escape hatch for bound research tools', async () => {
    const mcpManager = new MCPManager();
    mcpManager.register(createServer({ id: 'research', name: 'Research' }));

    vi.spyOn(mcpManager, 'connect').mockImplementation(async (serverId) =>
      createConnectedClient(serverId),
    );
    const createTools = vi.fn(async () => []);

    await connectMCPServersRuntime({
      mcpManager,
      toolRegistry: { register: vi.fn() },
      createTools,
      externalResearch: {
        mode: 'indexed',
        mcp: {
          serverId: 'research',
          exposeBoundToolsAsRawMcp: true,
          searchTool: {
            name: 'web_search',
            queryArg: 'query',
            outputSchema: 'neko.externalResearch.search.v1',
          },
        },
      },
    });

    expect(createTools).toHaveBeenCalledWith(mcpManager, {
      adapterOnlyTools: [{ serverId: 'research', toolName: 'web_search' }],
      exposeAdapterOnlyTools: true,
    });
  });
});
