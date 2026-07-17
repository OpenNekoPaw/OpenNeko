/**
 * Grep Tool - Search file contents with regex
 *
 * Pure Node.js implementation. Supports glob filtering and context lines.
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
  presentGrepFailure,
  presentInvalidToolArguments,
} from './core-tool-presentation';

const MAX_RESULTS = 100;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file
const DEFAULT_CONTEXT = 0;

export interface GrepToolOptions {
  defaultCwd?: string;
  readonly fileAccessPolicy?: CoreFileAccessPolicy;
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
  context?: string[];
}

export class GrepTool extends BuiltinTool {
  readonly name = 'Grep';
  readonly description =
    'Search file contents using regex. Returns matching lines with file paths and line numbers.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Directory or file to search in',
      },
      include: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g. "*.ts", "*.{ts,tsx}")',
      },
      context: {
        type: 'number',
        description: 'Number of context lines before and after match. Default 0.',
      },
    },
    required: ['pattern', 'path'],
  };
  readonly category: ToolCategory = 'file';
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  private defaultCwd?: string;
  private readonly fileAccessPolicy?: CoreFileAccessPolicy;

  constructor(options?: GrepToolOptions) {
    super();
    this.defaultCwd = options?.defaultCwd;
    this.fileAccessPolicy =
      options?.fileAccessPolicy ??
      (options?.defaultCwd
        ? createWorkspaceFileAccessPolicy({ workspaceRoot: options.defaultCwd })
        : createNoWorkspaceFileAccessPolicy());
  }

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(presentInvalidToolArguments(this.name, options?.metadata?.['locale']));
    }

    const pattern = args.pattern as string;
    const searchPath = args.path as string;
    const include = args.include as string | undefined;
    const contextLines = (args.context as number | undefined) ?? DEFAULT_CONTEXT;

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'gi');
    } catch {
      return this.error(
        presentGrepFailure('invalid-pattern', pattern, options?.metadata?.['locale']),
      );
    }

    const authorization = this.fileAccessPolicy?.authorize(searchPath, 'read');
    if (authorization && !authorization.allowed) {
      return this.error(
        presentCoreFileAccessDenial('search-path', authorization, options?.metadata?.['locale']),
      );
    }
    const resolved = authorization?.path ?? path.resolve(this.defaultCwd ?? '.', searchPath);
    const matches: GrepMatch[] = [];

    try {
      const stat = await fs.stat(resolved);
      if (stat.isFile()) {
        await this.searchFile(resolved, regex, contextLines, matches);
      } else if (stat.isDirectory()) {
        await this.searchDir(resolved, regex, include, contextLines, matches);
      } else {
        return this.error(
          presentGrepFailure('invalid-path-kind', searchPath, options?.metadata?.['locale']),
        );
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.error(
          presentGrepFailure('not-found', searchPath, options?.metadata?.['locale']),
        );
      }
      return this.error(
        presentGrepFailure(
          'search-failed',
          err instanceof Error ? err.message : String(err),
          options?.metadata?.['locale'],
        ),
      );
    }

    const truncated = matches.length > MAX_RESULTS;
    const shown = truncated ? matches.slice(0, MAX_RESULTS) : matches;

    // Format output
    const lines = shown.map((m) => {
      let result = `${m.file}:${m.line}: ${m.content}`;
      if (m.context && m.context.length > 0) {
        result += '\n' + m.context.map((c) => `  ${c}`).join('\n');
      }
      return result;
    });

    return this.success({
      content: lines.join('\n'),
      totalMatches: matches.length,
      truncated,
    });
  }

  private async searchFile(
    filePath: string,
    regex: RegExp,
    contextLines: number,
    matches: GrepMatch[],
  ): Promise<void> {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FILE_SIZE) return;

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        regex.lastIndex = 0;
        if (regex.test(line)) {
          const context: string[] = [];
          if (contextLines > 0) {
            const start = Math.max(0, i - contextLines);
            const end = Math.min(lines.length - 1, i + contextLines);
            for (let j = start; j <= end; j++) {
              if (j !== i) {
                const ctxLine = lines[j];
                if (ctxLine !== undefined) {
                  context.push(`${j + 1}: ${ctxLine}`);
                }
              }
            }
          }
          matches.push({
            file: filePath,
            line: i + 1,
            content: line.trim(),
            context: context.length > 0 ? context : undefined,
          });
          if (matches.length >= MAX_RESULTS * 2) return;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  private async searchDir(
    dirPath: string,
    regex: RegExp,
    include: string | undefined,
    contextLines: number,
    matches: GrepMatch[],
  ): Promise<void> {
    if (matches.length >= MAX_RESULTS * 2) return;

    let dirents;
    try {
      dirents = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirent of dirents) {
      if (matches.length >= MAX_RESULTS * 2) return;

      // Skip hidden dirs and common non-source dirs
      if (dirent.name.startsWith('.')) continue;
      if (dirent.name === 'node_modules' || dirent.name === 'dist') continue;

      const fullPath = path.join(dirPath, dirent.name);
      const authorization = this.fileAccessPolicy?.authorize(fullPath, 'read');
      if (authorization && !authorization.allowed) {
        continue;
      }

      if (dirent.isDirectory()) {
        await this.searchDir(fullPath, regex, include, contextLines, matches);
      } else if (dirent.isFile()) {
        if (include && !matchGlob(dirent.name, include)) continue;
        await this.searchFile(fullPath, regex, contextLines, matches);
      }
    }
  }
}

/** Simple glob matching for file extensions like "*.ts" or "*.{ts,tsx}" */
function matchGlob(filename: string, pattern: string): boolean {
  // Handle brace expansion: *.{ts,tsx} → [*.ts, *.tsx]
  const braceMatch = pattern.match(/^(.*)\{([^}]+)\}(.*)$/);
  if (braceMatch) {
    const [, prefix, options, suffix] = braceMatch;
    return (options ?? '')
      .split(',')
      .some((opt) => matchGlob(filename, `${prefix ?? ''}${opt.trim()}${suffix ?? ''}`));
  }

  // Convert simple glob to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(filename);
}
