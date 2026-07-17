import type * as vscode from 'vscode';
import type { ProjectFileOps } from '../../project-file-io';
import type { PathVariableMap, WorkspaceMediaPathContext } from '../../path';
import { createVSCodeWorkspaceMediaPathContext } from './workspace-media-path';

export interface VSCodeProjectFileIoAdapterOptions {
  readonly vscodeApi: Pick<typeof vscode, 'Uri' | 'workspace'>;
  readonly workspaceFolders?: readonly vscode.WorkspaceFolder[];
  readonly pathVariables?: PathVariableMap | ReadonlyMap<string, string>;
  readonly allowedRoots?: readonly string[];
}

export interface VSCodeProjectFileContextInput {
  readonly documentUri?: vscode.Uri;
  readonly pathVariables?: PathVariableMap | ReadonlyMap<string, string>;
  readonly allowedRoots?: readonly string[];
}

export interface VSCodeProjectFileIoAdapter {
  readonly fileOps: ProjectFileOps;
  createWorkspaceMediaPathContext(input?: VSCodeProjectFileContextInput): WorkspaceMediaPathContext;
  toFilePath(uriOrPath: vscode.Uri | string): string;
}

export function createVSCodeProjectFileIoAdapter(
  options: VSCodeProjectFileIoAdapterOptions,
): VSCodeProjectFileIoAdapter {
  const workspaceFolders =
    options.workspaceFolders ?? options.vscodeApi.workspace.workspaceFolders ?? [];
  const fileOps: ProjectFileOps = {
    readFile: async (filePath) =>
      options.vscodeApi.workspace.fs.readFile(options.vscodeApi.Uri.file(filePath)),
    writeFile: async (filePath, content) =>
      options.vscodeApi.workspace.fs.writeFile(options.vscodeApi.Uri.file(filePath), content),
    deleteFile: async (filePath) =>
      options.vscodeApi.workspace.fs.delete(options.vscodeApi.Uri.file(filePath)),
    renameFile: async (fromPath, toPath, renameOptions) =>
      options.vscodeApi.workspace.fs.rename(
        options.vscodeApi.Uri.file(fromPath),
        options.vscodeApi.Uri.file(toPath),
        { overwrite: renameOptions?.overwrite ?? false },
      ),
  };

  return {
    fileOps,
    createWorkspaceMediaPathContext(input = {}) {
      return createVSCodeWorkspaceMediaPathContext({
        documentUri: input.documentUri,
        workspaceFolders,
        pathVariables: input.pathVariables ?? options.pathVariables,
        allowedRoots: input.allowedRoots ?? options.allowedRoots,
      });
    },
    toFilePath(uriOrPath) {
      return typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.fsPath;
    },
  };
}
