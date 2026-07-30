/**
 * Node.js File Reader
 *
 * File reader implementation using Node.js fs module.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IFileReader } from './types';
import { getLogger } from '../utils/logger';

const logger = getLogger('NodeFileReader');

/**
 * Node.js file reader implementation
 */
export class NodeFileReader implements IFileReader {
  private _basePath: string;

  constructor(basePath: string) {
    this._basePath = basePath;
  }

  private _resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this._basePath, filePath);
  }

  async readFile(filePath: string): Promise<string> {
    const fullPath = this._resolvePath(filePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this._resolvePath(filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async isFile(filePath: string): Promise<boolean> {
    try {
      const fullPath = this._resolvePath(filePath);
      const stat = await fs.stat(fullPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      const fullPath = this._resolvePath(filePath);
      const stat = await fs.stat(fullPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async glob(pattern: string, options?: { cwd?: string }): Promise<string[]> {
    // Simple glob implementation using fs.readdir
    // For production, consider using a proper glob library
    const cwd = options?.cwd ?? this._basePath;
    const fullCwd = this._resolvePath(cwd);

    // Handle simple patterns like "*.ts" or "**/*.ts"
    if (pattern.includes('**')) {
      return this._recursiveGlob(fullCwd, pattern);
    }

    // Simple pattern matching
    const files = await fs.readdir(fullCwd);
    const regex = this._patternToRegex(pattern);
    return files.filter((f) => regex.test(f));
  }

  async stat(filePath: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }> {
    const fullPath = this._resolvePath(filePath);
    const stat = await fs.stat(fullPath);
    return {
      size: stat.size,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
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

      if (current === '**') {
        // Match any depth
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const entryPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            await walk(entryPath, remainingParts); // Continue with **
            await walk(entryPath, rest); // Try next part
          } else if (
            rest.length === 0 ||
            this._patternToRegex(rest[rest.length - 1]).test(entry.name)
          ) {
            const relativePath = path.relative(this._basePath, entryPath);
            results.push(relativePath);
          }
        }
      } else {
        // Match specific pattern
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        const regex = this._patternToRegex(current);

        for (const entry of entries) {
          if (regex.test(entry.name)) {
            const entryPath = path.join(currentDir, entry.name);
            if (rest.length === 0) {
              const relativePath = path.relative(this._basePath, entryPath);
              results.push(relativePath);
            } else if (entry.isDirectory()) {
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
 * Create a Node.js file reader
 */
export function createNodeFileReader(basePath: string): IFileReader {
  return new NodeFileReader(basePath);
}
