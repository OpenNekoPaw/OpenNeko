/**
 * Core Tools Factory
 *
 * Creates the default creative-session file/search tools (L1 layer).
 * These are always available to the agent alongside meta tools.
 */

import type { Tool, IProjectMemoryManager } from '@neko/shared';
import { ReadTool } from './read-tool';
import { WriteTool } from './write-tool';
import { BashTool, type BashToolOptions } from './bash-tool';
import { ListDirectoryTool } from './list-directory-tool';
import { GrepTool } from './grep-tool';
import { MemoryWriteTool, type ProjectMemoryMutationProposalSink } from './memory-write-tool';
import {
  createNoWorkspaceFileAccessPolicy,
  createWorkspaceFileAccessPolicy,
  type CoreFileAccessPolicy,
} from './file-access-policy';
import type { WorkspaceFileIgnoreRules } from '../../input/workspace-ignore';

export interface CoreToolsOptions {
  /** Default working directory for Grep and optional Developer Mode shell */
  defaultCwd?: string;
  /** Additional read-only roots such as enabled media libraries. */
  authorizedReadRoots?: readonly string[];
  /** Workspace-local ignore rules, including parsed .gitignore entries. */
  workspaceIgnoreRules?: WorkspaceFileIgnoreRules;
  /** Bash command timeout in ms (default 120000). Ignored unless includeShell is true. */
  bashTimeout?: number;
  /** Explicit Developer Mode / migration switch. Ordinary creative sessions keep this false. */
  includeShell?: boolean;
  /** Project memory manager — enables MemoryWrite tool when provided */
  projectMemoryManager?: IProjectMemoryManager;
  /** Client/domain proposal sink for MemoryWrite. The tool never commits `.neko` directly. */
  projectMemoryProposalSink?: ProjectMemoryMutationProposalSink;
  /** Explicit file access policy for core file/search tools. */
  fileAccessPolicy?: CoreFileAccessPolicy;
}

/**
 * Create default creative file/search tools.
 *
 * Returns: Read, Write, ListDirectory, Grep. Bash is opt-in only.
 */
export function createCoreTools(options?: CoreToolsOptions): Tool[] {
  const fileAccessPolicy =
    options?.fileAccessPolicy ??
    (options?.defaultCwd
      ? createWorkspaceFileAccessPolicy({
          workspaceRoot: options.defaultCwd,
          readRoots: [options.defaultCwd, ...(options.authorizedReadRoots ?? [])],
          writeRoots: [options.defaultCwd],
          ignoreRules: options.workspaceIgnoreRules,
        })
      : createNoWorkspaceFileAccessPolicy());
  const tools: Tool[] = [
    new ReadTool({ fileAccessPolicy }),
    new WriteTool({ defaultCwd: options?.defaultCwd, fileAccessPolicy }),
    new ListDirectoryTool({ fileAccessPolicy }),
    new GrepTool({ defaultCwd: options?.defaultCwd, fileAccessPolicy }),
  ];

  if (options?.includeShell === true) {
    const bashOpts: BashToolOptions = {
      defaultCwd: options.defaultCwd,
      timeout: options.bashTimeout,
    };
    tools.push(new BashTool(bashOpts));
  }

  if (options?.projectMemoryManager) {
    tools.push(new MemoryWriteTool({ proposalSink: options.projectMemoryProposalSink }));
  }

  return tools;
}
