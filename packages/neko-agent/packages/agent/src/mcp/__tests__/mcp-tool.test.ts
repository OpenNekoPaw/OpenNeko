/**
 * MCPTool Unit Tests — description truncation
 */

import { describe, it, expect, vi } from 'vitest';
import { MCPTool, createAllMCPTools, createMCPTools } from '../mcp-tool';
import type { IMCPClient, MCPToolDefinition } from '@neko/shared';
import type { MCPManager } from '../mcp-manager';

// Mock logger
vi.mock('../../utils/logger', () => ({
  getLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

function createMockManager(): MCPManager {
  return {
    callTool: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
  } as unknown as MCPManager;
}

function createConnectedClient(tools: MCPToolDefinition[]): IMCPClient {
  return {
    serverId: 'research',
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: () => true,
    listTools: vi.fn(async () => tools),
    callTool: vi.fn(async () => ({ content: [] })),
    listResources: vi.fn(async () => []),
    readResource: vi.fn(async () => ''),
    listPrompts: vi.fn(async () => []),
    getPrompt: vi.fn(async () => ({ messages: [] })),
  };
}

describe('MCPTool', () => {
  it('should preserve short descriptions unchanged', () => {
    const tool: MCPToolDefinition = {
      name: 'myTool',
      description: 'A short description',
      inputSchema: { type: 'object' },
    };

    const mcpTool = new MCPTool(createMockManager(), 'test-server', tool);

    expect(mcpTool.description).toBe('A short description');
  });

  it('should truncate descriptions exceeding 2048 characters', () => {
    const longDesc = 'x'.repeat(3000);
    const tool: MCPToolDefinition = {
      name: 'myTool',
      description: longDesc,
      inputSchema: { type: 'object' },
    };

    const mcpTool = new MCPTool(createMockManager(), 'test-server', tool);

    expect(mcpTool.description.length).toBe(2048);
    expect(mcpTool.description.endsWith('...')).toBe(true);
  });

  it('should use fallback description when none provided', () => {
    const tool: MCPToolDefinition = {
      name: 'myTool',
      description: '',
      inputSchema: { type: 'object' },
    };

    const mcpTool = new MCPTool(createMockManager(), 'test-server', tool);

    expect(mcpTool.description).toBe('MCP tool from test-server');
  });

  it('should prefix tool name with server ID', () => {
    const tool: MCPToolDefinition = {
      name: 'read_file',
      description: 'Read a file',
      inputSchema: { type: 'object' },
    };

    const mcpTool = new MCPTool(createMockManager(), 'my-server', tool);

    expect(mcpTool.name).toBe('mcp__my-server__read_file');
  });

  it('should keep exactly 2048 chars when description is exactly 2048', () => {
    const exactDesc = 'y'.repeat(2048);
    const tool: MCPToolDefinition = {
      name: 'myTool',
      description: exactDesc,
      inputSchema: { type: 'object' },
    };

    const mcpTool = new MCPTool(createMockManager(), 'test-server', tool);

    expect(mcpTool.description.length).toBe(2048);
    expect(mcpTool.description).toBe(exactDesc); // No truncation needed
  });
});

describe('MCP tool adapter-only filtering', () => {
  it('hides adapter-only MCP tools from per-server raw tool creation by default', async () => {
    const tools: MCPToolDefinition[] = [
      { name: 'web_search', description: 'Search', inputSchema: { type: 'object' } },
      { name: 'repo_status', description: 'Status', inputSchema: { type: 'object' } },
    ];
    const manager = {
      callTool: vi.fn(),
      getClient: vi.fn(() => createConnectedClient(tools)),
      getAllTools: vi.fn(),
    };

    const created = await createMCPTools(manager, 'research', {
      adapterOnlyTools: [{ serverId: 'research', toolName: 'web_search' }],
    });

    expect(created.map((tool) => tool.name)).toEqual(['mcp__research__repo_status']);
  });

  it('hides adapter-only MCP tools from all-server raw tool creation by default', async () => {
    const manager = {
      callTool: vi.fn(),
      getClient: vi.fn(),
      getAllTools: vi.fn(async () => [
        {
          serverId: 'research',
          name: 'web_search',
          description: 'Search',
          inputSchema: { type: 'object' },
        },
        {
          serverId: 'research',
          name: 'repo_status',
          description: 'Status',
          inputSchema: { type: 'object' },
        },
      ]),
    };

    const created = await createAllMCPTools(manager, {
      adapterOnlyTools: [{ serverId: 'research', toolName: 'web_search' }],
    });

    expect(created.map((tool) => tool.name)).toEqual(['mcp__research__repo_status']);
  });

  it('can expose adapter-only MCP tools through an explicit raw MCP escape hatch', async () => {
    const manager = {
      callTool: vi.fn(),
      getClient: vi.fn(),
      getAllTools: vi.fn(async () => [
        {
          serverId: 'research',
          name: 'web_search',
          description: 'Search',
          inputSchema: { type: 'object' },
        },
      ]),
    };

    const created = await createAllMCPTools(manager, {
      adapterOnlyTools: [{ serverId: 'research', toolName: 'web_search' }],
      exposeAdapterOnlyTools: true,
    });

    expect(created.map((tool) => tool.name)).toEqual(['mcp__research__web_search']);
  });
});
