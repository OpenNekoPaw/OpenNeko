/**
 * ListDirectory Tool - List directory contents
 *
 * Returns one bounded page of immediate child entries.
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
import { createNoWorkspaceFileAccessPolicy, type CoreFileAccessPolicy } from './file-access-policy';
import {
  presentCoreFileAccessDenial,
  presentInvalidToolArguments,
  presentListDirectoryFailure,
  projectPortableIoFailure,
} from './core-tool-presentation';

const MAX_ENTRIES = 80;

export interface ListDirectoryToolOptions {
  readonly fileAccessPolicy?: CoreFileAccessPolicy;
  readonly workspaceRoot?: string;
}

interface DirEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
  contentLocator?: import('@neko/content').WorkspaceFileContentLocator;
}

export class ListDirectoryTool extends BuiltinTool {
  private readonly fileAccessPolicy?: CoreFileAccessPolicy;
  private readonly workspaceRoot?: string;

  constructor(options?: ListDirectoryToolOptions) {
    super();
    this.fileAccessPolicy = options?.fileAccessPolicy ?? createNoWorkspaceFileAccessPolicy();
    this.workspaceRoot = options?.workspaceRoot && path.resolve(options.workspaceRoot);
  }

  readonly name = 'ListDirectory';
  readonly description =
    'List one level of an authorized Workspace directory as structured entries.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Normalized Workspace-relative or authorized absolute directory path. Use "." for the Workspace root.',
      },
      after: {
        type: 'string',
        description: 'Internal stable entry name cursor.',
      },
    },
    required: ['path'],
    additionalProperties: false,
  };
  readonly category: ToolCategory = 'file';
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid || Object.keys(args).some((key) => key !== 'path' && key !== 'after')) {
      return this.error(presentInvalidToolArguments(this.name, options?.metadata?.['locale']));
    }

    const dirPath = args.path as string;
    const after = args.after as string | undefined;

    try {
      const authorization = this.fileAccessPolicy?.authorize(dirPath, 'list');
      if (authorization && !authorization.allowed) {
        return this.error(
          presentCoreFileAccessDenial(
            'list-directory',
            authorization,
            options?.metadata?.['locale'],
          ),
        );
      }
      const resolved = authorization?.hostPath ?? path.resolve(dirPath);
      const entries = await this.listDir(resolved);
      const startIndex =
        after === undefined ? 0 : entries.findIndex((entry) => entry.name === after) + 1;
      if (after !== undefined && startIndex === 0) {
        return this.error(
          presentListDirectoryFailure('cursor-invalid', after, options?.metadata?.['locale']),
        );
      }
      const shown = entries.slice(startIndex, startIndex + MAX_ENTRIES);
      const truncated = startIndex + shown.length < entries.length;
      const last = shown.at(-1);
      const directoryPath = authorization?.allowed
        ? authorization.workspacePath
        : this.toWorkspacePath(resolved);

      return this.success({
        directoryPath,
        entries: shown,
        totalEntries: entries.length,
        truncated,
        ...(truncated && last ? { nextCursor: { directoryPath, after: last.name } } : {}),
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.error(
          presentListDirectoryFailure('not-found', dirPath, options?.metadata?.['locale']),
        );
      }
      if ((err as NodeJS.ErrnoException).code === 'ENOTDIR') {
        return this.error(
          presentListDirectoryFailure('not-directory', dirPath, options?.metadata?.['locale']),
        );
      }
      return this.error(
        presentListDirectoryFailure(
          'list-failed',
          projectPortableIoFailure(err),
          options?.metadata?.['locale'],
        ),
      );
    }
  }

  private async listDir(dirPath: string): Promise<DirEntry[]> {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });
    const results: DirEntry[] = [];

    for (const dirent of dirents.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }),
    )) {
      if (dirent.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, dirent.name);
      const childRelativePath = this.toWorkspacePath(fullPath);
      const authorization = this.fileAccessPolicy?.authorize(childRelativePath, 'list');
      if (authorization && !authorization.allowed) {
        continue;
      }
      const contentLocator = authorization?.allowed ? authorization.contentLocator : undefined;

      if (dirent.isDirectory()) {
        results.push({
          name: dirent.name,
          type: 'directory',
          ...(contentLocator ? { contentLocator } : {}),
        });
      } else if (dirent.isSymbolicLink()) {
        results.push({ name: dirent.name, type: 'symlink' });
      } else if (dirent.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          results.push({
            name: dirent.name,
            type: 'file',
            size: stat.size,
            ...(contentLocator ? { contentLocator } : {}),
          });
        } catch {
          results.push({
            name: dirent.name,
            type: 'file',
            ...(contentLocator ? { contentLocator } : {}),
          });
        }
      } else {
        results.push({ name: dirent.name, type: 'other' });
      }
    }

    return results;
  }

  private toWorkspacePath(resolved: string): string {
    if (!this.workspaceRoot) return '.';
    const relative = path.relative(this.workspaceRoot, resolved);
    return relative ? relative.split(path.sep).join('/') : '.';
  }
}
