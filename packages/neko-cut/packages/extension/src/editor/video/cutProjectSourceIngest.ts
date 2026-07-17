import * as path from 'path';
import * as vscode from 'vscode';
import {
  createProjectFileDiagnostic,
  handleProjectSourceAddRequest,
  ingestProjectSourceAddRequest,
  type ContentIngestRequest,
  type ContentIngestResult,
  type ProjectSourceAddRequest,
  type ProjectSourceAddResult,
} from '@neko/shared';
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
): Promise<ProjectSourceAddResult> {
  try {
    return await handleProjectSourceAddRequest(normalizeCutProjectSourceAddRequest(request), {
      ingest: (ingestRequest) => ingestCutProjectSource(documentUri, ingestRequest),
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

async function ingestCutProjectSource(
  documentUri: vscode.Uri,
  request: ContentIngestRequest,
): Promise<ContentIngestResult> {
  const baseDir = path.dirname(documentUri.fsPath);
  return ingestProjectSourceAddRequest(request, {
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
      fileExists: async (filePath) => {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
          return true;
        } catch {
          return false;
        }
      },
      writeFile: async (filePath, bytes) =>
        vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes),
    },
    defaultFileName: 'media.bin',
    unmanagedSourceMessage:
      'External media must be moved into the project, asset library, or a configured media root before saving.',
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
