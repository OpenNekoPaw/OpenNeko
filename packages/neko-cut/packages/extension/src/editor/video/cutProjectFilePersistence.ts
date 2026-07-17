import * as path from 'path';
import * as vscode from 'vscode';
import {
  ProjectFileStore,
  createDefaultProjectFormatCodecRegistry,
  nkvSourcePathPolicy,
  saveNkv,
  type ProjectData,
  type ProjectFileDiagnostic,
  type ProjectFileSaveReason,
} from '@neko/shared';
import {
  createVSCodeProjectFileIoAdapter,
  ProjectFileSaveSession,
} from '@neko/shared/vscode/extension';
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
  options: { readonly sourceUri?: vscode.Uri; readonly useSaveAs?: boolean } = {},
): Promise<CutProjectSaveResult> {
  const sourceUri = options.sourceUri ?? documentUri;
  const prepared = await prepareCutProjectFileSave(sourceUri, document);
  if (!prepared.ok || !prepared.document) return prepared;
  const adapter = createVSCodeProjectFileIoAdapter({
    vscodeApi: vscode,
    workspaceFolders: vscode.workspace.workspaceFolders,
  });
  const store = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: adapter.fileOps,
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
