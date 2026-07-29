/**
 * MCP Server Configuration
 *
 * Re-exports types from shared package and provides utility functions.
 * Builtin MCP servers are loaded from platform via ConfigManager.
 */

import type { MCPServerConfig, MCPServerCategory, MCPToolInfo } from '@neko/shared';

// Re-export types from shared package
export type { MCPServerConfig, MCPServerCategory, MCPToolInfo };

/**
 * Get all MCP categories
 */
export function getMCPCategories(): MCPServerCategory[] {
  return ['filesystem', 'database', 'api', 'development', 'productivity', 'ai', 'other'];
}

/**
 * Get category display name
 */
export function getMCPCategoryName(category: MCPServerCategory): string {
  const names: Record<MCPServerCategory, string> = {
    filesystem: 'File System',
    database: 'Database',
    api: 'API & Web',
    development: 'Development',
    productivity: 'Productivity',
    ai: 'AI & Memory',
    other: 'Other',
  };
  return names[category];
}

/**
 * Get category icon
 */
export function getMCPCategoryIcon(category: MCPServerCategory): string {
  const icons: Record<MCPServerCategory, string> = {
    filesystem: '📁',
    database: '🗄️',
    api: '🌐',
    development: '🛠️',
    productivity: '📊',
    ai: '🤖',
    other: '📦',
  };
  return icons[category];
}
