import {
  CANVAS_TEXT_DOCUMENT_MAX_BYTES,
  inferCanvasTextFileFormat,
  type CanvasTextDocumentReadErrorCode,
  type CanvasTextDocumentReadRequest,
  type CanvasTextDocumentReadResult,
} from '@neko/shared';

export interface CanvasTextDocumentProjectionFileSystem {
  readonly stat: (filePath: string) => Promise<{ readonly size: number; readonly isFile: boolean }>;
  readonly readFile: (filePath: string) => Promise<Uint8Array>;
}

export async function readCanvasTextDocumentProjection(
  request: CanvasTextDocumentReadRequest,
  resolvedFilePath: string,
  fileSystem: CanvasTextDocumentProjectionFileSystem,
): Promise<CanvasTextDocumentReadResult> {
  const inferredFormat = inferCanvasTextFileFormat(request.docPath);
  const inferredDocumentType =
    inferredFormat === 'markdown' ? 'markdown' : inferredFormat === 'plain' ? 'text' : null;
  if (inferredDocumentType !== request.docType) {
    return createErrorResult(
      request,
      'unsupported-type',
      'The selected file does not match the requested Canvas text format.',
    );
  }

  let stat: { readonly size: number; readonly isFile: boolean };
  try {
    stat = await fileSystem.stat(resolvedFilePath);
  } catch {
    return createErrorResult(request, 'not-found', 'The text source could not be found.');
  }

  if (!stat.isFile) {
    return createErrorResult(request, 'not-a-file', 'The text source is not a file.');
  }
  if (stat.size > CANVAS_TEXT_DOCUMENT_MAX_BYTES) {
    return createErrorResult(
      request,
      'too-large',
      `The text source exceeds the ${CANVAS_TEXT_DOCUMENT_MAX_BYTES} byte Canvas preview limit.`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await fileSystem.readFile(resolvedFilePath);
  } catch {
    return createErrorResult(request, 'read-failed', 'The text source could not be read.');
  }
  if (bytes.byteLength > CANVAS_TEXT_DOCUMENT_MAX_BYTES) {
    return createErrorResult(
      request,
      'too-large',
      `The text source exceeds the ${CANVAS_TEXT_DOCUMENT_MAX_BYTES} byte Canvas preview limit.`,
    );
  }

  try {
    return {
      type: 'textDocument:readResult',
      requestId: request.requestId,
      nodeId: request.nodeId,
      docPath: request.docPath,
      docType: request.docType,
      status: 'ready',
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    };
  } catch {
    return createErrorResult(
      request,
      'invalid-utf8',
      'The text source is not valid UTF-8 and cannot be previewed.',
    );
  }
}

function createErrorResult(
  request: CanvasTextDocumentReadRequest,
  code: CanvasTextDocumentReadErrorCode,
  error: string,
): CanvasTextDocumentReadResult {
  return {
    type: 'textDocument:readResult',
    requestId: request.requestId,
    nodeId: request.nodeId,
    docPath: request.docPath,
    docType: request.docType,
    status: 'error',
    code,
    error,
  };
}
