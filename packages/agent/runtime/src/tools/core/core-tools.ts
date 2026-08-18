/**
 * Core Tools Factory
 *
 * Creates the default creative-session file/search tools (L1 layer).
 * These are always available to the agent alongside meta tools.
 */

import type { Tool } from '@neko/agent-contracts';
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
import {
  createNodeHostContentReadService,
  NodeAuthorizedWorkspaceWriter,
} from '@neko/content/node';

export interface CoreToolsOptions {
  /** Default working directory for Grep and optional Developer Mode shell */
  defaultCwd?: string;
  /** Workspace-local ignore rules, including parsed .gitignore entries. */
  workspaceIgnoreRules?: WorkspaceFileIgnoreRules;
  /** Bash command timeout in ms (default 120000). Ignored unless includeShell is true. */
  bashTimeout?: number;
  /** Explicit Developer Mode shell switch. Ordinary creative sessions keep this false. */
  includeShell?: boolean;
  /** Owning-domain proposal sink for MemoryWrite. The Agent never commits durable facts. */
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
          ignoreRules: options.workspaceIgnoreRules,
        })
      : createNoWorkspaceFileAccessPolicy());
  const directoryAccessPolicy =
    options?.fileAccessPolicy ??
    (options?.defaultCwd
      ? createWorkspaceFileAccessPolicy({
          workspaceRoot: options.defaultCwd,
          ignoreRules: options.workspaceIgnoreRules,
        })
      : createNoWorkspaceFileAccessPolicy());
  const workspaceReader = options?.defaultCwd
    ? createNodeHostContentReadService({ workspaceRoot: options.defaultCwd })
    : undefined;
  const workspaceWriter = options?.defaultCwd
    ? new NodeAuthorizedWorkspaceWriter({ workspaceRoot: options.defaultCwd })
    : undefined;
  const tools: Tool[] = [
    new ReadTool({ fileAccessPolicy, workspaceReader }),
    new WriteTool({ fileAccessPolicy, workspaceWriter }),
    new ListDirectoryTool({
      fileAccessPolicy: directoryAccessPolicy,
      ...(options?.defaultCwd
        ? {
            workspaceRoot: options.defaultCwd,
          }
        : {}),
    }),
    new GrepTool({ defaultCwd: options?.defaultCwd, fileAccessPolicy }),
  ];

  if (options?.includeShell === true) {
    const bashOpts: BashToolOptions = {
      defaultCwd: options.defaultCwd,
      timeout: options.bashTimeout,
    };
    tools.push(new BashTool(bashOpts));
  }

  if (options?.projectMemoryProposalSink) {
    tools.push(new MemoryWriteTool({ proposalSink: options.projectMemoryProposalSink }));
  }

  return tools;
}
