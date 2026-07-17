/**
 * Configuration Types - Types for builtin presets and user configuration
 */

// =============================================================================
// MCP Server Configuration Types
// =============================================================================

/**
 * MCP server category
 */
export type MCPServerCategory =
  | 'filesystem'
  | 'database'
  | 'api'
  | 'development'
  | 'productivity'
  | 'ai'
  | 'other';

/**
 * MCP tool info (for display purposes)
 */
export interface MCPToolInfo {
  name: string;
  description: string;
}

/**
 * MCP server preset configuration
 */
export interface MCPServerPreset {
  /** Server ID */
  id: string;
  /** Server name */
  name: string;
  /** Server description */
  description: string;
  /** Category */
  category: MCPServerCategory;
  /** Transport type */
  transport: 'stdio' | 'http';
  /** Command to run (for stdio) */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Server URL (for http) */
  url?: string;
  /** Whether server is enabled */
  enabled: boolean;
  /** Whether this is a builtin preset */
  builtin?: boolean;
  /** Homepage URL */
  homepage?: string;
  /** Available tools */
  tools?: MCPToolInfo[];
}
