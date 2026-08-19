import { describe, expect, it, vi } from 'vitest';
import type { ContentReadService } from '@neko/content';
import { CANVAS_TEXT_FILE_PREVIEW_MAX_BYTES } from '@neko/canvas-domain';
import { CanvasTextFilePreviewService } from './canvas-text-file-preview-service';

const locator = { file: { authority: 'workspace', path: 'data/project.json' } } as const;

describe('CanvasTextFilePreviewService', () => {
  it('uses the canonical bounded content reader and formats JSON', async () => {
    const read = vi.fn<ContentReadService['read']>().mockResolvedValue({
      status: 'ready',
      locator,
      bytes: new TextEncoder().encode('{"name":"Neko"}'),
      offset: 0,
      totalByteLength: 15,
      fingerprint: { strategy: 'sha256', value: 'digest' },
      mimeType: 'application/json',
    });
    const service = new CanvasTextFilePreviewService({
      read,
      stat: vi.fn<ContentReadService['stat']>(),
    });

    await expect(
      service.read({ requestId: 'request', nodeId: 'node', locator, path: locator.file.path }),
    ).resolves.toMatchObject({
      status: 'ready',
      kind: 'json',
      text: '{\n  "name": "Neko"\n}',
    });
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(locator, { maxBytes: CANVAS_TEXT_FILE_PREVIEW_MAX_BYTES });
  });

  it('does not read unsupported files', async () => {
    const read = vi.fn<ContentReadService['read']>();
    const service = new CanvasTextFilePreviewService({
      read,
      stat: vi.fn<ContentReadService['stat']>(),
    });
    await expect(
      service.read({
        requestId: 'request',
        nodeId: 'node',
        locator,
        path: 'images/source.png',
        mediaType: 'image/png',
      }),
    ).resolves.toEqual({ requestId: 'request', nodeId: 'node', status: 'unsupported' });
    expect(read).not.toHaveBeenCalled();
  });

  it('maps content failures to local diagnostics', async () => {
    const read = vi.fn<ContentReadService['read']>().mockResolvedValue({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-too-large' },
    });
    const service = new CanvasTextFilePreviewService({
      read,
      stat: vi.fn<ContentReadService['stat']>(),
    });
    await expect(
      service.read({ requestId: 'request', nodeId: 'node', locator, path: locator.file.path }),
    ).resolves.toEqual({
      requestId: 'request',
      nodeId: 'node',
      status: 'unavailable',
      diagnostic: { code: 'canvas-text-preview-too-large' },
    });
  });
});
