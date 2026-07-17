/**
 * Write Tool - Write content to a file
 *
 * Auto-creates parent directories. Supports append mode.
 * Requires confirmation before execution.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolResult, ToolCategory, ToolParameters, ToolExecuteOptions } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';
import {
  createNoWorkspaceFileAccessPolicy,
  createWorkspaceFileAccessPolicy,
  type CoreFileAccessPolicy,
} from './file-access-policy';
import {
  presentCoreFileAccessDenial,
  presentInvalidToolArguments,
  presentWriteFailure,
} from './core-tool-presentation';

export interface WriteToolOptions {
  /** Default working directory; relative paths are resolved against this */
  defaultCwd?: string;
  readonly fileAccessPolicy?: CoreFileAccessPolicy;
}

export class WriteTool extends BuiltinTool {
  private readonly defaultCwd?: string;
  private readonly fileAccessPolicy?: CoreFileAccessPolicy;

  constructor(options?: WriteToolOptions) {
    super();
    this.defaultCwd = options?.defaultCwd;
    this.fileAccessPolicy =
      options?.fileAccessPolicy ??
      (options?.defaultCwd
        ? createWorkspaceFileAccessPolicy({ workspaceRoot: options.defaultCwd })
        : createNoWorkspaceFileAccessPolicy());
  }

  readonly name = 'Write';
  readonly description =
    'Write content to a file. Creates parent directories if needed. Use append mode to add to existing files.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description:
          'Path to the file to write. Relative paths are resolved against the workspace root.',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
      append: {
        type: 'boolean',
        description: 'Append to file instead of overwriting. Default false.',
      },
    },
    required: ['file_path', 'content'],
  };
  readonly category: ToolCategory = 'file';
  override readonly requiresConfirmation = true;
  override readonly isDestructive = true;

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(presentInvalidToolArguments(this.name, options?.metadata?.['locale']));
    }

    const filePath = args.file_path as string;
    const content = args.content as string;
    const append = (args.append as boolean | undefined) ?? false;

    try {
      const authorization = this.fileAccessPolicy?.authorize(filePath, 'write');
      if (authorization && !authorization.allowed) {
        return this.error(
          presentCoreFileAccessDenial('write-file', authorization, options?.metadata?.['locale']),
        );
      }
      const resolved = authorization?.path ?? path.resolve(this.defaultCwd ?? '.', filePath);

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(resolved), { recursive: true });

      if (append) {
        await fs.appendFile(resolved, content, 'utf-8');
      } else {
        await fs.writeFile(resolved, content, 'utf-8');
      }

      const stat = await fs.stat(resolved);
      return this.success({
        path: resolved,
        mode: append ? 'append' : 'write',
        bytesWritten: Buffer.byteLength(content, 'utf-8'),
        totalSize: stat.size,
      });
    } catch (err) {
      return this.error(
        presentWriteFailure(
          err instanceof Error ? err.message : String(err),
          options?.metadata?.['locale'],
        ),
      );
    }
  }
}
