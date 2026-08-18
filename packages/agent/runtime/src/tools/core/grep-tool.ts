/**
 * Grep Tool - Search file contents with regex
 *
 * Pure Node.js implementation. Supports glob filtering and context lines.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  ToolResult,
  ToolCategory,
  ToolParameters,
  ToolExecuteOptions,
} from '@neko/agent-contracts';
import { BuiltinTool } from '../base';
import {
  createNoWorkspaceFileAccessPolicy,
  createWorkspaceFileAccessPolicy,
  type CoreFileAccessPolicy,
} from './file-access-policy';
import {
  presentCoreFileAccessDenial,
  presentGrepFailure,
  presentInvalidToolArguments,
  projectPortableIoFailure,
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
    'Search Workspace files using regex. Returns matching lines with Workspace-relative paths and line numbers.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern to search for',
      },
      path: {
        type: 'string',
        description:
          'Normalized Workspace-relative or authorized absolute directory or file path. Use "." for the root.',
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
    const resolved = authorization?.hostPath ?? path.resolve(this.defaultCwd ?? '.', searchPath);
    const displaySearchPath = authorization?.allowed ? authorization.workspacePath : searchPath;
    const matches: GrepMatch[] = [];

    try {
      const stat = await fs.stat(resolved);
      if (stat.isFile()) {
        await this.searchFile(resolved, displaySearchPath, regex, contextLines, matches);
      } else if (stat.isDirectory()) {
        await this.searchDir(
          resolved,
          displaySearchPath,
          regex,
          include,
          contextLines,
          matches,
          new Set<string>(),
        );
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
          projectPortableIoFailure(err),
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
    displayPath: string,
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
            file: displayPath,
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
    displayDirPath: string,
    regex: RegExp,
    include: string | undefined,
    contextLines: number,
    matches: GrepMatch[],
    visitedDirectories: Set<string>,
  ): Promise<void> {
    if (matches.length >= MAX_RESULTS * 2) return;

    let realDirectoryPath: string;
    try {
      realDirectoryPath = await fs.realpath(dirPath);
    } catch {
      return;
    }
    if (visitedDirectories.has(realDirectoryPath)) return;
    visitedDirectories.add(realDirectoryPath);

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
      const childRelativePath = joinDisplayPath(displayDirPath, dirent.name);
      const authorization = this.fileAccessPolicy?.authorize(childRelativePath, 'read');
      if (authorization && !authorization.allowed) {
        continue;
      }
      const childDisplayPath = authorization?.allowed
        ? authorization.workspacePath
        : childRelativePath;

      if (dirent.isDirectory()) {
        await this.searchDir(
          fullPath,
          childDisplayPath,
          regex,
          include,
          contextLines,
          matches,
          visitedDirectories,
        );
      } else if (dirent.isFile()) {
        if (include && !matchGlob(dirent.name, include)) continue;
        await this.searchFile(fullPath, childDisplayPath, regex, contextLines, matches);
      } else if (dirent.isSymbolicLink()) {
        let target;
        try {
          target = await fs.stat(fullPath);
        } catch {
          continue;
        }
        if (target.isDirectory()) {
          await this.searchDir(
            fullPath,
            childDisplayPath,
            regex,
            include,
            contextLines,
            matches,
            visitedDirectories,
          );
        } else if (target.isFile()) {
          if (include && !matchGlob(dirent.name, include)) continue;
          await this.searchFile(fullPath, childDisplayPath, regex, contextLines, matches);
        }
      }
    }
  }
}

function joinDisplayPath(directoryPath: string, name: string): string {
  return directoryPath === '.' ? name : path.posix.join(directoryPath, name);
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
