import * as path from 'node:path';
import type * as vscode from 'vscode';
import { PathResolver, type PathVariableMap, type WorkspaceMediaPathContext } from '../../path';

export interface VSCodeWorkspaceMediaPathContextInput {
  readonly documentUri?: vscode.Uri;
  readonly workspaceFolders?: readonly vscode.WorkspaceFolder[];
  readonly pathVariables?: PathVariableMap | ReadonlyMap<string, string>;
  readonly allowedRoots?: readonly string[];
}

export function createVSCodeWorkspaceMediaPathContext({
  documentUri,
  workspaceFolders = [],
  pathVariables,
  allowedRoots,
}: VSCodeWorkspaceMediaPathContextInput): WorkspaceMediaPathContext {
  const documentFsPath = documentUri?.scheme === 'file' ? documentUri.fsPath : undefined;
  const documentDir = documentFsPath ? path.dirname(documentFsPath) : undefined;
  const owningWorkspaceRoot = documentUri
    ? findOwningWorkspaceRoot(documentUri, workspaceFolders)
    : workspaceFolders[0]?.uri.fsPath;
  const workspaceRoots = workspaceFolders.map((folder) => folder.uri.fsPath);
  const variables = new Map(pathVariables ?? []);
  if (owningWorkspaceRoot) {
    variables.set('WORKSPACE', owningWorkspaceRoot);
    variables.set('PROJECT', owningWorkspaceRoot);
  }

  return {
    ...(documentUri ? { sourceDocumentUri: documentUri.toString() } : {}),
    ...(owningWorkspaceRoot ? { owningWorkspaceRoot } : {}),
    workspaceRoots,
    ...(documentDir ? { documentDir } : {}),
    pathVariables: variables,
    allowedRoots: allowedRoots ?? workspaceRoots,
  };
}

export function createVSCodeWorkspacePathResolver(
  context: WorkspaceMediaPathContext,
): PathResolver {
  return new PathResolver(new Map(context.pathVariables ?? []));
}

function findOwningWorkspaceRoot(
  documentUri: vscode.Uri,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
): string | undefined {
  if (documentUri.scheme !== 'file') return workspaceFolders[0]?.uri.fsPath;
  return workspaceFolders
    .map((folder) => folder.uri.fsPath)
    .filter((root) => isPathInsideOrEqual(documentUri.fsPath, root))
    .sort((left, right) => right.length - left.length)[0];
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}
