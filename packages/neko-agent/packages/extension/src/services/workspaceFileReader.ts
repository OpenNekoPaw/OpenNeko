/**
 * VSCode workspace file-reader adapter for @neko/agent input processing.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_MENTION_EXCLUDE_GLOB, type IFileReader } from '@neko/agent';
import { createWorkspaceMentionIgnoreFilter } from './workspaceIgnoreFilter';

export interface VSCodeWorkspaceFileReaderOptions {
  readonly resolvePath?: (filePath: string) => Promise<string>;
}

export function createVSCodeWorkspaceFileReader(
  workspaceRoot: string,
  ignoreFilter?: Awaited<ReturnType<typeof createWorkspaceMentionIgnoreFilter>>,
  options: VSCodeWorkspaceFileReaderOptions = {},
): IFileReader {
  let lazyIgnoreFilter: Promise<
    Awaited<ReturnType<typeof createWorkspaceMentionIgnoreFilter>>
  > | null = ignoreFilter ? Promise.resolve(ignoreFilter) : null;
  const resolvePath = options.resolvePath ?? ((filePath: string) => Promise.resolve(filePath));
  const toUri = (filePath: string): vscode.Uri =>
    path.isAbsolute(filePath)
      ? vscode.Uri.file(filePath)
      : vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), filePath);
  const resolveUri = async (filePath: string): Promise<vscode.Uri> =>
    toUri(await resolvePath(toResolverInput(filePath, workspaceRoot)));
  const resolveIgnoreFilter = () => {
    lazyIgnoreFilter ??= createWorkspaceMentionIgnoreFilter(workspaceRoot);
    return lazyIgnoreFilter;
  };
  const isIgnored = async (filePath: string | vscode.Uri): Promise<boolean> =>
    (await resolveIgnoreFilter()).isIgnored(filePath);
  const assertReadable = async (filePath: string, resolvedUri?: vscode.Uri): Promise<void> => {
    if (await isIgnored(filePath)) {
      throw new Error('File is ignored by workspace mention filters');
    }
    if (resolvedUri && (await isIgnored(resolvedUri))) {
      throw new Error('File is ignored by workspace mention filters');
    }
  };

  return {
    async readFile(filePath: string): Promise<string> {
      const uri = await resolveUri(filePath);
      await assertReadable(filePath, uri);
      const content = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(content).toString('utf-8');
    },

    async exists(filePath: string): Promise<boolean> {
      if (await isIgnored(filePath)) {
        return false;
      }
      try {
        const uri = await resolveUri(filePath);
        if (await isIgnored(uri)) {
          return false;
        }
        await vscode.workspace.fs.stat(uri);
        return true;
      } catch {
        return false;
      }
    },

    async isFile(filePath: string): Promise<boolean> {
      if (await isIgnored(filePath)) {
        return false;
      }
      try {
        const uri = await resolveUri(filePath);
        if (await isIgnored(uri)) {
          return false;
        }
        const stat = await vscode.workspace.fs.stat(uri);
        return stat.type === vscode.FileType.File;
      } catch {
        return false;
      }
    },

    async isDirectory(filePath: string): Promise<boolean> {
      if (await isIgnored(filePath)) {
        return false;
      }
      try {
        const uri = await resolveUri(filePath);
        if (await isIgnored(uri)) {
          return false;
        }
        const stat = await vscode.workspace.fs.stat(uri);
        return stat.type === vscode.FileType.Directory;
      } catch {
        return false;
      }
    },

    async glob(pattern: string, options?: { cwd?: string }): Promise<string[]> {
      const cwd = await resolvePath(toResolverInput(options?.cwd ?? workspaceRoot, workspaceRoot));
      const relativePattern = new vscode.RelativePattern(cwd, pattern);
      const files = await vscode.workspace.findFiles(
        relativePattern,
        DEFAULT_MENTION_EXCLUDE_GLOB,
        100,
      );
      const filter = await resolveIgnoreFilter();
      return files
        .filter((file) => !filter.isIgnored(file))
        .map((file) => vscode.workspace.asRelativePath(file, false));
    },

    async stat(filePath: string): Promise<{
      size: number;
      isFile: boolean;
      isDirectory: boolean;
    }> {
      const uri = await resolveUri(filePath);
      await assertReadable(filePath, uri);
      const stat = await vscode.workspace.fs.stat(uri);
      return {
        size: stat.size,
        isFile: stat.type === vscode.FileType.File,
        isDirectory: stat.type === vscode.FileType.Directory,
      };
    },
  };
}

function toResolverInput(filePath: string, workspaceRoot: string): string {
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }

  const relativePath = path.relative(workspaceRoot, filePath);
  if (relativePath.startsWith('${')) {
    return relativePath;
  }
  return filePath;
}
