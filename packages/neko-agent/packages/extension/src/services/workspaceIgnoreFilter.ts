import * as path from 'path';
import * as vscode from 'vscode';
import {
  isMentionExcludedPath,
  matchesGitignoreRules,
  normalizeRelativePath,
  parseGitignoreRules,
  shouldIgnoreWorkspaceFile,
  type WorkspaceFileIgnoreRules,
} from '@neko/agent';

export { matchesGitignoreRules, parseGitignoreRules };

export interface WorkspaceMentionIgnoreFilter {
  isIgnored(filePath: string | vscode.Uri): boolean;
}

export async function createWorkspaceMentionIgnoreFilter(
  workspaceRoot: string,
): Promise<WorkspaceMentionIgnoreFilter> {
  const rules = await loadWorkspaceFileIgnoreRules(workspaceRoot);

  return {
    isIgnored(filePath) {
      const relativePath = normalizeWorkspaceRelativePath(workspaceRoot, filePath);
      return (
        isMentionExcludedPath(relativePath) ||
        shouldIgnoreWorkspaceFile(relativePath, rules).ignored
      );
    },
  };
}

export async function loadWorkspaceFileIgnoreRules(
  workspaceRoot: string,
): Promise<WorkspaceFileIgnoreRules> {
  return {
    gitignoreRules: await readWorkspaceGitignoreRules(workspaceRoot),
  };
}

async function readWorkspaceGitignoreRules(workspaceRoot: string): Promise<readonly string[]> {
  try {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), '.gitignore');
    const content = await vscode.workspace.fs.readFile(uri);
    return parseGitignoreRules(Buffer.from(content).toString('utf-8'));
  } catch {
    return [];
  }
}

function normalizeWorkspaceRelativePath(
  workspaceRoot: string,
  filePath: string | vscode.Uri,
): string {
  const fsPath = typeof filePath === 'string' ? filePath : filePath.fsPath;
  const relativePath = path.isAbsolute(fsPath) ? path.relative(workspaceRoot, fsPath) : fsPath;
  return normalizeRelativePath(relativePath);
}
