import type { CanvasTextDocumentReadResult } from '@neko/shared';
import type { TextDocumentRuntimeProjection } from '../components/nodes/nodeRendererTypes';

export function applyTextDocumentReadResult(
  current: Record<string, TextDocumentRuntimeProjection>,
  result: CanvasTextDocumentReadResult,
): Record<string, TextDocumentRuntimeProjection> {
  const pending = current[result.nodeId];
  if (
    !pending ||
    pending.requestId !== result.requestId ||
    pending.docPath !== result.docPath ||
    pending.docType !== result.docType
  ) {
    return current;
  }

  return {
    ...current,
    [result.nodeId]:
      result.status === 'ready'
        ? {
            status: 'ready',
            requestId: result.requestId,
            docPath: result.docPath,
            docType: result.docType,
            text: result.text,
          }
        : {
            status: 'error',
            requestId: result.requestId,
            docPath: result.docPath,
            docType: result.docType,
            error: result.error,
          },
  };
}
