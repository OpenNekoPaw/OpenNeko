/**
 * Tool handler interface and result types for the strategy-based tool registry.
 */

import type { ProjectData } from '@neko/shared';

export type ToolApplyResult =
  | { success: true; data?: unknown; updatedProject?: ProjectData }
  | { success: false; error: string };

export interface IToolHandler {
  readonly toolNames: readonly string[];
  apply(project: ProjectData, toolName: string, params: Record<string, unknown>): ToolApplyResult;
}
