import * as path from 'path';
import * as vscode from 'vscode';
import {
  createProjectFileDiagnostic,
  handleProjectSourceAddRequest,
  storeProjectSourceAddRequest,
  type ProjectSourceAddRequest,
  type ProjectSourceAddResult,
  type AuthorizedWorkspaceWriter,
} from '@neko/shared';
import { NodeAuthorizedWorkspaceWriter } from '@neko/shared/vscode/extension/workspace-content-writer';
import {
  createCutWorkspaceMediaPathContext,
  isExistingLocalFile,
} from '../../services/tools/helpers';
import { getLogger } from '../../base';

const logger = getLogger('CutProjectSourceIngest');
const PROJECT_MEDIA_DIR = 'media';

export async function addCutProjectSource(
  documentUri: vscode.Uri,
  request: ProjectSourceAddRequest,
  writer: AuthorizedWorkspaceWriter = new NodeAuthorizedWorkspaceWriter({
    workspaceRoot: path.dirname(documentUri.fsPath),
  }),
): Promise<ProjectSourceAddResult> {
  try {
    return await handleProjectSourceAddRequest(normalizeCutProjectSourceAddRequest(request), {
      store: (storageRequest) => storeCutProjectSource(documentUri, storageRequest, writer),
    });
  } catch (error) {
    logger.error('Project source ingest failed', error);
    return {
      requestId: request.requestId,
      ok: false,
      diagnostics: [
        createProjectFileDiagnostic({
          code: 'write-failed',
          message:
            error instanceof Error
              ? `Failed to add ${request.browserFile?.name ?? 'source'}: ${error.message}`
              : `Failed to add ${request.browserFile?.name ?? 'source'}.`,
          recoverability: 'create-asset',
        }),
      ],
    };
  }
}

function normalizeCutProjectSourceAddRequest(
  request: ProjectSourceAddRequest,
): ProjectSourceAddRequest {
  const bytes = normalizeMessageBytes(request.bytes);
  return bytes === request.bytes ? request : { ...request, bytes };
}

async function storeCutProjectSource(
  documentUri: vscode.Uri,
  request: ProjectSourceAddRequest,
  writer: AuthorizedWorkspaceWriter,
) {
  const baseDir = path.dirname(documentUri.fsPath);
  return storeProjectSourceAddRequest(request, {
    documentPath: documentUri.fsPath,
    assetDirectory: PROJECT_MEDIA_DIR,
    workspaceContext: createCutWorkspaceMediaPathContext(baseDir, {
      documentUri,
      projectFilePath: documentUri.fsPath,
      fileExists: isExistingLocalFile,
    }),
    fileOps: {
      createDirectory: async (dirPath) =>
        vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
    },
    writer,
    defaultFileName: 'media.bin',
    unmanagedSourceMessage:
      'External media must be moved into the project or a configured media root before saving.',
  });
}

function normalizeMessageBytes(bytes: ProjectSourceAddRequest['bytes']): Uint8Array | undefined {
  if (!bytes) return undefined;
  if (bytes instanceof Uint8Array) return bytes;
  if (Array.isArray(bytes)) return Uint8Array.from(bytes);
  if (isArrayBuffer(bytes)) return new Uint8Array(bytes);
  if (typeof bytes === 'object' && 'buffer' in bytes) {
    const view = bytes as { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number };
    return new Uint8Array(view.buffer, view.byteOffset ?? 0, view.byteLength);
  }
  return undefined;
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}
