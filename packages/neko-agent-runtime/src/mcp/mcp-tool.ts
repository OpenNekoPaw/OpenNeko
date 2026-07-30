/**
 * MCP Tool - Wraps MCP tools as agent tools
 */

import type {
  IMCPClient,
  Tool,
  ToolResult,
  ToolCategory,
  MCPToolDefinition,
  ToolDefinition,
  ToolParameters,
  ToolParameterProperty,
} from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('MCPTool');

/** Maximum description length to prevent context bloat from verbose MCP tools */
const MAX_DESCRIPTION_LENGTH = 2048;

export interface MCPToolCallManager {
  callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }>;
}

export interface MCPToolDiscoveryManager extends MCPToolCallManager {
  getClient(serverId: string): IMCPClient | undefined;
  getAllTools(): Promise<Array<MCPToolDefinition & { serverId: string }>>;
}

export interface MCPAdapterOnlyToolBinding {
  readonly serverId: string;
  readonly toolName: string;
}

export interface MCPToolCreationOptions {
  /** MCP tools reserved for adapter calls and hidden from ordinary model-visible registration. */
  readonly adapterOnlyTools?: readonly MCPAdapterOnlyToolBinding[];
  /** Explicit escape hatch for debugging/raw MCP exposure. Defaults to false. */
  readonly exposeAdapterOnlyTools?: boolean;
}

/**
 * Truncate description to MAX_DESCRIPTION_LENGTH, appending ellipsis if truncated.
 */
function truncateDescription(description: string): string {
  if (description.length <= MAX_DESCRIPTION_LENGTH) {
    return description;
  }
  return description.slice(0, MAX_DESCRIPTION_LENGTH - 3) + '...';
}

/**
 * MCP tool wrapper - wraps an MCP tool as an agent tool
 */
export class MCPTool implements Tool {
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory = 'mcp';
  readonly parameters: ToolParameters;

  private serverId: string;
  private mcpManager: MCPToolCallManager;
  private originalName: string;

  constructor(mcpManager: MCPToolCallManager, serverId: string, mcpTool: MCPToolDefinition) {
    this.mcpManager = mcpManager;
    this.serverId = serverId;
    this.originalName = mcpTool.name;

    // Prefix tool name with server ID to avoid conflicts
    // Use double underscore to match permission system's mcp__ prefix convention
    this.name = `mcp__${serverId}__${mcpTool.name}`;
    this.description = truncateDescription(mcpTool.description || `MCP tool from ${serverId}`);
    this.parameters = normalizeMcpInputSchema(mcpTool.inputSchema);
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.mcpManager.callTool(this.serverId, this.originalName, args);

    return {
      success: result.success,
      data: result.data,
      error: result.error,
    };
  }

  toDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: { ...this.parameters },
      },
    };
  }
}

function normalizeMcpInputSchema(schema: Record<string, unknown> | undefined): ToolParameters {
  const properties = normalizeProperties(schema?.['properties']);
  const required = Array.isArray(schema?.['required'])
    ? schema['required'].filter((item): item is string => typeof item === 'string')
    : undefined;

  return {
    type: 'object',
    properties,
    ...(required && { required }),
  };
}

function normalizeProperties(value: unknown): Record<string, ToolParameterProperty> {
  if (!isRecord(value)) {
    return {};
  }

  const properties: Record<string, ToolParameterProperty> = {};
  for (const [key, property] of Object.entries(value)) {
    if (!isRecord(property)) {
      continue;
    }
    const type = property['type'];
    properties[key] = {
      ...property,
      type: isToolParameterType(type) ? type : 'object',
    };
  }
  return properties;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToolParameterType(value: unknown): value is ToolParameterProperty['type'] {
  return (
    value === 'string' ||
    value === 'number' ||
    value === 'integer' ||
    value === 'boolean' ||
    value === 'array' ||
    value === 'object'
  );
}

/**
 * Create MCPTool instances from MCP server tools
 */
export async function createMCPTools(
  mcpManager: MCPToolDiscoveryManager,
  serverId: string,
  options: MCPToolCreationOptions = {},
): Promise<MCPTool[]> {
  const client = mcpManager.getClient(serverId);
  if (!client?.isConnected()) {
    return [];
  }

  try {
    const mcpTools = await client.listTools();
    return mcpTools
      .filter((tool) => shouldExposeMcpTool(serverId, tool.name, options))
      .map((tool) => new MCPTool(mcpManager, serverId, tool));
  } catch (error) {
    logger.error('Failed to create MCP tools', { serverId, error });
    return [];
  }
}

/**
 * Create all MCP tools from all connected servers
 */
export async function createAllMCPTools(
  mcpManager: MCPToolDiscoveryManager,
  options: MCPToolCreationOptions = {},
): Promise<MCPTool[]> {
  const tools: MCPTool[] = [];

  const allTools = await mcpManager.getAllTools();
  for (const tool of allTools) {
    if (!shouldExposeMcpTool(tool.serverId, tool.name, options)) {
      continue;
    }
    tools.push(
      new MCPTool(mcpManager, tool.serverId, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }),
    );
  }

  return tools;
}

function shouldExposeMcpTool(
  serverId: string,
  toolName: string,
  options: MCPToolCreationOptions,
): boolean {
  if (options.exposeAdapterOnlyTools === true) {
    return true;
  }
  return !options.adapterOnlyTools?.some(
    (binding) => binding.serverId === serverId && binding.toolName === toolName,
  );
}
