/**
 * Workspace Configuration Loader
 *
 * Loads MCP server configuration from .neko/config.toml.
 * Workspace config only manages MCP servers — providers and models
 * are user-level only (~/.neko/config.toml).
 *
 * Uses shared configuration module from @neko/shared.
 */

import type { MCPServerPreset } from '../types/config';
import type { UnifiedConfig } from '@neko/shared';
// Node.js config reader - direct import
import {
  readWorkspaceConfigResult as readWorkspaceConfigFileResult,
  type ConfigReadResult,
} from '@neko/shared/config/config-reader';

/**
 * Workspace configuration structure
 *
 * Only MCP servers are workspace-scoped.
 * Providers/models are user-level only (aligned with Claude Code / Cursor).
 */
export interface WorkspaceConfig {
  /** Workspace-specific MCP servers */
  mcpServers?: MCPServerPreset[];
  /** MCP server overrides */
  mcpServerOverrides?: Record<string, Partial<MCPServerPreset>>;
}

/**
 * Convert unified config to workspace config (extract MCP fields only)
 */
function unifiedToWorkspaceConfig(unified: UnifiedConfig | null): WorkspaceConfig | null {
  if (!unified) return null;

  return {
    mcpServers: unified.mcpServers as MCPServerPreset[] | undefined,
    mcpServerOverrides: unified.mcpServerOverrides as
      Record<string, Partial<MCPServerPreset>> | undefined,
  };
}

export function loadWorkspaceConfigResult(workspacePath: string): {
  raw: ConfigReadResult;
  config: WorkspaceConfig | null;
} {
  const raw = readWorkspaceConfigFileResult(workspacePath);
  return {
    raw,
    config: raw.status === 'ok' ? unifiedToWorkspaceConfig(raw.config) : null,
  };
}
