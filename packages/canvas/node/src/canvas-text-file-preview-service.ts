import type { ContentLocator, ContentReadService } from '@neko/content';
import {
  CANVAS_TEXT_FILE_PREVIEW_MAX_BYTES,
  createUnavailableCanvasTextFilePreview,
  formatCanvasTextFilePreview,
  mapContentDiagnosticToCanvasTextPreview,
  resolveCanvasTextFilePreviewKind,
  type CanvasTextFilePreviewResult,
} from '@neko/canvas-domain';

export interface CanvasTextFilePreviewServiceInput {
  readonly requestId: string;
  readonly nodeId: string;
  readonly locator: ContentLocator;
  readonly path: string;
  readonly mediaType?: string;
  readonly signal?: AbortSignal;
}

export class CanvasTextFilePreviewService {
  constructor(private readonly contentRead: ContentReadService) {}

  async read(input: CanvasTextFilePreviewServiceInput): Promise<CanvasTextFilePreviewResult> {
    const kind = resolveCanvasTextFilePreviewKind({
      path: input.path,
      ...(input.mediaType ? { mediaType: input.mediaType } : {}),
    });
    if (!kind) {
      return { requestId: input.requestId, nodeId: input.nodeId, status: 'unsupported' };
    }
    const content = await this.contentRead.read(input.locator, {
      maxBytes: CANVAS_TEXT_FILE_PREVIEW_MAX_BYTES,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (content.status === 'unavailable') {
      return createUnavailableCanvasTextFilePreview({
        requestId: input.requestId,
        nodeId: input.nodeId,
        code: mapContentDiagnosticToCanvasTextPreview(content.diagnostic.code),
      });
    }
    return formatCanvasTextFilePreview({
      requestId: input.requestId,
      nodeId: input.nodeId,
      kind,
      bytes: content.bytes,
    });
  }
}
