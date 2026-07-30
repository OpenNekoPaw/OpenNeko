/**
 * Read Tool - Read file contents with line numbers
 *
 * Supports offset/limit for partial reads and truncates long lines.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolResult, ToolCategory, ToolParameters, ToolExecuteOptions } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';
import { createNoWorkspaceFileAccessPolicy, type CoreFileAccessPolicy } from './file-access-policy';
import {
  presentCoreFileAccessDenial,
  presentInvalidToolArguments,
  presentLineTruncationMarker,
  presentReadFailure,
} from './core-tool-presentation';

const MAX_LINE_LENGTH = 2000;
const DEFAULT_LIMIT = 2000;

export interface ReadToolOptions {
  readonly fileAccessPolicy?: CoreFileAccessPolicy;
}

export class ReadTool extends BuiltinTool {
  private readonly fileAccessPolicy?: CoreFileAccessPolicy;

  constructor(options?: ReadToolOptions) {
    super();
    this.fileAccessPolicy = options?.fileAccessPolicy ?? createNoWorkspaceFileAccessPolicy();
  }

  readonly name = 'Read';
  readonly description =
    'Read a file from the filesystem. Returns contents with line numbers. Supports offset/limit for large files.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file to read',
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-based). Optional.',
      },
      limit: {
        type: 'number',
        description: `Max number of lines to read. Default ${DEFAULT_LIMIT}.`,
      },
    },
    required: ['file_path'],
  };
  readonly category: ToolCategory = 'file';
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(presentInvalidToolArguments(this.name, options?.metadata?.['locale']));
    }

    const filePath = args.file_path as string;
    const offset = (args.offset as number | undefined) ?? 1;
    const limit = (args.limit as number | undefined) ?? DEFAULT_LIMIT;

    try {
      const authorization = this.fileAccessPolicy?.authorize(filePath, 'read');
      if (authorization && !authorization.allowed) {
        return this.error(
          presentCoreFileAccessDenial('read-file', authorization, options?.metadata?.['locale']),
        );
      }
      const resolved = authorization?.path ?? path.resolve(filePath);
      const content = await fs.readFile(resolved, 'utf-8');
      const allLines = content.split('\n');
      const startIdx = Math.max(0, offset - 1);
      const endIdx = Math.min(allLines.length, startIdx + limit);
      const lines = allLines.slice(startIdx, endIdx);

      // Format with line numbers, truncate long lines
      const maxLineNum = endIdx;
      const padWidth = String(maxLineNum).length;
      const formatted = lines.map((line, i) => {
        const lineNum = String(startIdx + i + 1).padStart(padWidth, ' ');
        const truncated =
          line.length > MAX_LINE_LENGTH
            ? line.slice(0, MAX_LINE_LENGTH) +
              presentLineTruncationMarker(options?.metadata?.['locale'])
            : line;
        return `${lineNum}\t${truncated}`;
      });

      return this.success({
        content: formatted.join('\n'),
        totalLines: allLines.length,
        linesShown: lines.length,
        startLine: startIdx + 1,
        endLine: endIdx,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.error(presentReadFailure('not-found', filePath, options?.metadata?.['locale']));
      }
      if ((err as NodeJS.ErrnoException).code === 'EISDIR') {
        return this.error(
          presentReadFailure('is-directory', filePath, options?.metadata?.['locale']),
        );
      }
      return this.error(
        presentReadFailure(
          'read-failed',
          err instanceof Error ? err.message : String(err),
          options?.metadata?.['locale'],
        ),
      );
    }
  }
}
