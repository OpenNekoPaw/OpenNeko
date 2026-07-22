import { describe, expect, it, vi } from 'vitest';
import type { ContentReadService } from '@neko/shared';
import { createNodeDocumentRasterRepresentationGenerator } from './node-document-raster-representation';

describe('node document raster representation generator', () => {
  it('renders a requested PDF page to PNG bytes without returning a path', async () => {
    const destroy = vi.fn(async () => undefined);
    const getScreenshot = vi.fn(async () => ({
      pages: [
        {
          data: new Uint8Array([137, 80, 78, 71]),
          pageNumber: 2,
          width: 640,
          height: 900,
        },
      ],
    }));
    const contentRead = {
      read: vi.fn(async () => ({
        status: 'ready' as const,
        locator: { kind: 'workspace-file' as const, path: 'docs/story.pdf' },
        bytes: new Uint8Array([37, 80, 68, 70]),
        offset: 0,
        totalByteLength: 4,
        metadata: {},
      })),
    } satisfies ContentReadService;
    const generator = createNodeDocumentRasterRepresentationGenerator({
      workspaceRoot: '/workspace',
      contentRead,
      loadPdfParse: async () => ({
        PDFParse: class {
          getScreenshot = getScreenshot;
          destroy = destroy;
        },
      }),
    });

    const result = await generator.generate({
      source: { kind: 'workspace-file', path: 'docs/story.pdf' },
      spec: { kind: 'raster-page', page: 2, scale: 1.5, format: 'png' },
    });

    expect(contentRead.read).toHaveBeenCalledWith(
      { kind: 'workspace-file', path: 'docs/story.pdf' },
      { maxBytes: 512 * 1024 * 1024 },
    );
    expect(getScreenshot).toHaveBeenCalledWith({
      partial: [2],
      scale: 1.5,
      imageDataUrl: false,
      imageBuffer: true,
    });
    expect(result).toEqual({
      bytes: new Uint8Array([137, 80, 78, 71]),
      metadata: {
        mimeType: 'image/png',
        byteLength: 4,
        width: 640,
        height: 900,
      },
    });
    expect(result).not.toHaveProperty('path');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('routes Office documents through the injected conversion port', async () => {
    const convertToPdf = vi.fn(async () => new Uint8Array([37, 80, 68, 70]));
    const generator = createNodeDocumentRasterRepresentationGenerator({
      workspaceRoot: '/workspace',
      contentRead: { read: vi.fn() } as unknown as ContentReadService,
      officeRasterizer: { convertToPdf },
      loadPdfParse: async () => ({
        PDFParse: class {
          async getScreenshot() {
            return {
              pages: [
                {
                  data: new Uint8Array([1]),
                  pageNumber: 1,
                  width: 10,
                  height: 20,
                },
              ],
            };
          }
          async destroy() {}
        },
      }),
    });

    await generator.generate({
      source: { kind: 'workspace-file', path: 'docs/story.docx' },
      spec: { kind: 'raster-page', page: 1, format: 'png' },
    });

    expect(convertToPdf).toHaveBeenCalledWith({ sourcePath: '/workspace/docs/story.docx' });
  });
});
