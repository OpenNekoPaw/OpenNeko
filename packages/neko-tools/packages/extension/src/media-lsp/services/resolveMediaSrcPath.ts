import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { resolveHostContentMediaPath } from '@neko/shared/vscode/extension';

const PATH_VARIABLE_RE = /\$\{[^}]+\}/;

function hasPathVariable(src: string): boolean {
  return PATH_VARIABLE_RE.test(src);
}

export async function resolveMediaSrcPath(jviDir: string, src: string): Promise<string> {
  if (!hasPathVariable(src) && !isWorkspaceLinkedMediaPath(src)) {
    if (path.isAbsolute(src)) return src;
    return path.resolve(jviDir, src);
  }

  return resolveHostContentMediaPath(src, {
    workspaceRoot: findOwningWorkspaceRoot(jviDir),
    workspaceFolders: vscode.workspace.workspaceFolders ?? [],
    getExtension: vscode.extensions.getExtension,
    fileExists: isExistingLocalFile,
  });
}

function isWorkspaceLinkedMediaPath(value: string): boolean {
  return value.replace(/\\/gu, '/').startsWith('neko/assets/');
}

function findOwningWorkspaceRoot(filePath: string): string | undefined {
  return (vscode.workspace.workspaceFolders ?? [])
    .map((folder) => folder.uri.fsPath)
    .filter((root) => isPathInsideOrEqual(filePath, root))
    .sort((left, right) => right.length - left.length)[0];
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isExistingLocalFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
