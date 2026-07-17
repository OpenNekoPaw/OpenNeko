/**
 * VSCode File Reader
 *
 * File reader implementation using VSCode workspace API.
 * This is designed to be used in VSCode extension context.
 */

import type { IFileReader } from './types';
import { getLogger } from '../utils/logger';

const logger = getLogger('VSCodeFileReader');

/**
 * VSCode workspace API interface
 * This matches the subset of vscode.workspace we need
 */
export interface VSCodeWorkspaceAPI {
  fs: {
    stat(uri: { fsPath: string }): Promise<{ type: number; size: number }>;
    readFile(uri: { fsPath: string }): Promise<Uint8Array>;
    readDirectory(uri: { fsPath: string }): Promise<Array<[string, number]>>;
  };
  Uri: {
    file(path: string): { fsPath: string };
    joinPath(base: { fsPath: string }, ...pathSegments: string[]): { fsPath: string };
  };
  FileType: {
    File: number;
    Directory: number;
  };
}

/**
 * VSCode file reader implementation
 */
export class VSCodeFileReader implements IFileReader {
  private _basePath: string;
  private _workspace: VSCodeWorkspaceAPI;

  constructor(basePath: string, workspace: VSCodeWorkspaceAPI) {
    this._basePath = basePath;
    this._workspace = workspace;
  }

  private _resolvePath(filePath: string): { fsPath: string } {
    if (filePath.startsWith('/')) {
      return this._workspace.Uri.file(filePath);
    }
    const baseUri = this._workspace.Uri.file(this._basePath);
    return this._workspace.Uri.joinPath(baseUri, filePath);
  }

  async readFile(filePath: string): Promise<string> {
    const uri = this._resolvePath(filePath);
    const content = await this._workspace.fs.readFile(uri);
    return new TextDecoder().decode(content);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const uri = this._resolvePath(filePath);
      await this._workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  async isFile(filePath: string): Promise<boolean> {
    try {
      const uri = this._resolvePath(filePath);
      const stat = await this._workspace.fs.stat(uri);
      return stat.type === this._workspace.FileType.File;
    } catch {
      return false;
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      const uri = this._resolvePath(filePath);
      const stat = await this._workspace.fs.stat(uri);
      return stat.type === this._workspace.FileType.Directory;
    } catch {
      return false;
    }
  }

  async glob(pattern: string, options?: { cwd?: string }): Promise<string[]> {
    // Simple glob implementation using readDirectory
    // For production, consider using vscode.workspace.findFiles
    const cwd = options?.cwd ?? this._basePath;
    const cwdUri = this._resolvePath(cwd);

    // Handle simple patterns like "*.ts" or "*"
    if (pattern.includes('**')) {
      return this._recursiveGlob(cwdUri.fsPath, pattern);
    }

    // Simple pattern matching
    const entries = await this._workspace.fs.readDirectory(cwdUri);
    const regex = this._patternToRegex(pattern);
    return entries.filter(([name]) => regex.test(name)).map(([name]) => name);
  }

  async stat(filePath: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }> {
    const uri = this._resolvePath(filePath);
    const stat = await this._workspace.fs.stat(uri);
    return {
      size: stat.size,
      isFile: stat.type === this._workspace.FileType.File,
      isDirectory: stat.type === this._workspace.FileType.Directory,
    };
  }

  private _patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }

  private async _recursiveGlob(dir: string, pattern: string): Promise<string[]> {
    const results: string[] = [];
    const parts = pattern.split('/');

    const walk = async (currentDir: string, remainingParts: string[]): Promise<void> => {
      if (remainingParts.length === 0) return;

      const [current, ...rest] = remainingParts;
      const currentUri = this._workspace.Uri.file(currentDir);

      if (current === '**') {
        // Match any depth
        const entries = await this._workspace.fs.readDirectory(currentUri);
        for (const [name, type] of entries) {
          const entryPath = `${currentDir}/${name}`;
          if (type === this._workspace.FileType.Directory) {
            await walk(entryPath, remainingParts); // Continue with **
            await walk(entryPath, rest); // Try next part
          } else if (rest.length === 0 || this._patternToRegex(rest[rest.length - 1]).test(name)) {
            // Calculate relative path from base
            const relativePath = entryPath.startsWith(this._basePath)
              ? entryPath.slice(this._basePath.length + 1)
              : entryPath;
            results.push(relativePath);
          }
        }
      } else {
        // Match specific pattern
        const entries = await this._workspace.fs.readDirectory(currentUri);
        const regex = this._patternToRegex(current);

        for (const [name, type] of entries) {
          if (regex.test(name)) {
            const entryPath = `${currentDir}/${name}`;
            if (rest.length === 0) {
              const relativePath = entryPath.startsWith(this._basePath)
                ? entryPath.slice(this._basePath.length + 1)
                : entryPath;
              results.push(relativePath);
            } else if (type === this._workspace.FileType.Directory) {
              await walk(entryPath, rest);
            }
          }
        }
      }
    };

    try {
      await walk(dir, parts);
    } catch (error) {
      logger.warn('Glob error', { error });
    }

    return results;
  }
}

/**
 * Create a VSCode file reader
 */
export function createVSCodeFileReader(
  basePath: string,
  workspace: VSCodeWorkspaceAPI,
): IFileReader {
  return new VSCodeFileReader(basePath, workspace);
}
