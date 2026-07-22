import * as path from 'path';
import * as vscode from 'vscode';
import {
  ProjectFileStore,
  ProjectFileSaveSession,
  createDefaultProjectFormatCodecRegistry,
  nkvSourcePathPolicy,
  saveNkv,
  type ProjectData,
  type ProjectFileDiagnostic,
  type ProjectFileOps,
  type ProjectFileSaveReason,
} from '@neko/shared';
import { createVSCodeProjectFileIoAdapter } from '@neko/shared/vscode/extension/project-file-io';
import { NodeAuthorizedWorkspaceWriter } from '@neko/shared/vscode/extension/workspace-content-writer';
import {
  createCutWorkspaceMediaPathContext,
  isExistingLocalFile,
  normalizePathsForSave,
} from '../../services/tools/helpers';

export interface CutProjectSaveResult {
  readonly ok: boolean;
  readonly document?: ProjectData;
  readonly content?: string;
  readonly diagnostics: readonly ProjectFileDiagnostic[];
}

export interface CutProjectSaveOptions {
  readonly sourceUri?: vscode.Uri;
  readonly useSaveAs?: boolean;
  readonly fileOps?: ProjectFileOps;
}

export async function prepareCutProjectFileSave(
  documentUri: vscode.Uri,
  document: ProjectData,
): Promise<CutProjectSaveResult> {
  try {
    const normalizedDocument = await normalizePathsForSave(document, documentUri.fsPath, {
      documentUri,
    });
    return {
      ok: true,
      document: normalizedDocument,
      content: `${saveNkv(normalizedDocument)}\n`,
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'write-failed',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

export async function saveCutProjectFile(
  documentUri: vscode.Uri,
  document: ProjectData,
  saveReason: ProjectFileSaveReason = 'manual',
  options: CutProjectSaveOptions = {},
): Promise<CutProjectSaveResult> {
  const sourceUri = options.sourceUri ?? documentUri;
  const prepared = await prepareCutProjectFileSave(sourceUri, document);
  if (!prepared.ok || !prepared.document) return prepared;
  const fileOps = options.fileOps ?? createVSCodeProjectFileOps();
  const store = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps,
    ...(options.fileOps
      ? {}
      : {
          resolveAuthorizedWrite: (filePath: string) => ({
            writer: new NodeAuthorizedWorkspaceWriter({ workspaceRoot: path.dirname(filePath) }),
            locator: { kind: 'workspace-file' as const, path: path.basename(filePath) },
          }),
        }),
  });
  const context = createCutWorkspaceMediaPathContext(path.dirname(sourceUri.fsPath), {
    documentUri: sourceUri,
    projectFilePath: sourceUri.fsPath,
    fileExists: isExistingLocalFile,
  });
  const session = new ProjectFileSaveSession<ProjectData>({
    formatId: 'nkv',
    store,
    sourcePolicy: nkvSourcePathPolicy,
    createSourcePolicyOptions: () => ({
      context,
      fileExists: isExistingLocalFile,
    }),
  });
  const result = await session.save({
    targetUri: documentUri,
    sourceUri,
    document: prepared.document,
    saveReason,
    defaultMessage: 'Failed to save NKV project',
    useSaveAs: options.useSaveAs,
  });

  return {
    ok: result.ok,
    document: result.ok ? (result.document ?? prepared.document) : undefined,
    content: result.ok ? `${saveNkv(result.document ?? prepared.document)}\n` : undefined,
    diagnostics: result.diagnostics,
  };
}

function createVSCodeProjectFileOps(): ProjectFileOps {
  return createVSCodeProjectFileIoAdapter({
    vscodeApi: vscode,
    workspaceFolders: vscode.workspace.workspaceFolders,
  }).fileOps;
}
