/**
 * AttachmentProcessor unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { AttachmentProcessor } from '../attachmentProcessor';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import type { ResourceRef } from '@neko/shared';

// Mock fs.promises for file reading
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('AttachmentProcessor', () => {
  let processor: AttachmentProcessor;
  let contentAccessRuntime: AgentContentAccessRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    contentAccessRuntime = createContentAccessRuntime();
    processor = new AttachmentProcessor({ contentAccessRuntime });
  });

  describe('processAttachments', () => {
    it('should return empty result for undefined attachments', async () => {
      const result = await processor.processAttachments(undefined);

      expect(result.textContent).toBe('');
      expect(result.imageAttachments).toEqual([]);
    });

    it('should return empty result for empty array', async () => {
      const result = await processor.processAttachments([]);

      expect(result.textContent).toBe('');
      expect(result.imageAttachments).toEqual([]);
    });

    it('should process image attachment with base64 preview', async () => {
      const attachments = [
        {
          type: 'image' as const,
          name: 'photo.png',
          preview: 'data:image/png;base64,iVBORw0KGgoAAAANS',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.imageAttachments).toHaveLength(1);
      expect(result.imageAttachments[0]).toEqual({
        type: 'base64',
        media_type: 'image/png',
        data: 'iVBORw0KGgoAAAANS',
      });
    });

    it('should process image attachment from file path', async () => {
      const mockBuffer = Buffer.from('fake-image-data');
      vi.mocked(contentAccessRuntime.loadProviderAsset).mockResolvedValueOnce({
        status: 'ready',
        diagnostics: [],
        bytes: mockBuffer,
        mimeType: 'image/jpeg',
        sizeBytes: mockBuffer.byteLength,
      });
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('legacy binary image read must not be used'),
      );

      const attachments = [
        {
          type: 'image' as const,
          name: 'photo.jpg',
          path: '/tmp/photo.jpg',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith({
        caller: 'attachment-processor',
        source: { kind: 'file', path: '/tmp/photo.jpg' },
        preferredTarget: 'bytes',
        mimeTypeHint: 'image/jpeg',
      });
      expect(fs.promises.readFile).not.toHaveBeenCalled();
      expect(result.imageAttachments).toHaveLength(1);
      expect(result.imageAttachments[0]).toEqual({
        type: 'base64',
        media_type: 'image/jpeg',
        data: mockBuffer.toString('base64'),
      });
    });

    it('should handle image read failure gracefully', async () => {
      vi.mocked(contentAccessRuntime.loadProviderAsset).mockResolvedValueOnce({
        status: 'unauthorized',
        diagnostics: [
          {
            code: 'unauthorized',
            severity: 'error',
            message: 'Unauthorized image source',
          },
        ],
      });
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('legacy binary image read must not be used'),
      );

      const attachments = [
        {
          type: 'image' as const,
          name: 'missing.png',
          path: '/tmp/missing.png',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith({
        caller: 'attachment-processor',
        source: { kind: 'file', path: '/tmp/missing.png' },
        preferredTarget: 'bytes',
        mimeTypeHint: 'image/png',
      });
      expect(fs.promises.readFile).not.toHaveBeenCalled();
      expect(result.imageAttachments).toHaveLength(0);
    });

    it('should process file attachment by reading content', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('const x = 1;' as any);

      const attachments = [
        {
          type: 'file' as const,
          name: 'code.ts',
          path: '/tmp/code.ts',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.textContent).toContain('### File: code.ts');
      expect(result.textContent).toContain('const x = 1;');
    });

    it('should keep document attachments as ReadDocument references without reading them', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('book content' as any);

      const attachments = [
        {
          type: 'file' as const,
          name: '卷01.epub',
          path: '${A}/epub/animation/灯神/卷01.epub',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(fs.promises.readFile).not.toHaveBeenCalled();
      expect(result.textContent).toContain('[Attached document: 卷01.epub]');
      expect(result.textContent).toContain('${A}/epub/animation/灯神/卷01.epub');
      expect(result.textContent).toContain('Use ReadDocument');
      expect(result.textContent).not.toContain('book content');
    });

    it('should handle file read failure gracefully', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('Permission denied'));

      const attachments = [
        {
          type: 'file' as const,
          name: 'secret.txt',
          path: '/tmp/secret.txt',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.textContent).toContain('### File: secret.txt');
      expect(result.textContent).toContain('Failed to read file');
    });

    it('should process video/audio attachment as reference', async () => {
      const attachments = [
        {
          type: 'video' as const,
          name: 'clip.mp4',
          path: '/tmp/clip.mp4',
        },
        {
          type: 'audio' as const,
          name: 'music.mp3',
          path: '/tmp/music.mp3',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.textContent).toContain('[Attached video: clip.mp4]');
      expect(result.textContent).toContain('(path: /tmp/clip.mp4)');
      expect(result.textContent).toContain('[Attached audio: music.mp3]');
    });

    it('should process mixed attachments', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('file content' as any);

      const attachments = [
        { type: 'image' as const, name: 'img.png', preview: 'data:image/png;base64,abc123' },
        { type: 'file' as const, name: 'readme.md', path: '/tmp/readme.md' },
        { type: 'video' as const, name: 'demo.mp4' },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.imageAttachments).toHaveLength(1);
      expect(result.textContent).toContain('### File: readme.md');
      expect(result.textContent).toContain('[Attached video: demo.mp4]');
    });
  });

  describe('processContextImageResources', () => {
    it('loads 3D reference resources through stable ResourceRef identity', async () => {
      const bytes = new Uint8Array(Buffer.from('pose-image'));
      const resource = previewResourceRef('pose-control');
      vi.mocked(contentAccessRuntime.loadProviderAsset).mockResolvedValueOnce({
        status: 'ready',
        diagnostics: [],
        bytes,
        mimeType: 'image/png',
        sizeBytes: bytes.byteLength,
      });

      await expect(
        processor.processContextImageResources([{ role: 'pose', resource }]),
      ).resolves.toEqual([
        { type: 'base64', media_type: 'image/png', data: Buffer.from(bytes).toString('base64') },
      ]);
      expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith({
        caller: 'attachment-processor',
        source: resource,
        preferredTarget: 'bytes',
        mimeTypeHint: 'image/png',
        metadata: { threeReferenceRole: 'pose' },
      });
    });

    it('fails visibly when a declared 3D reference image is unavailable', async () => {
      vi.mocked(contentAccessRuntime.loadProviderAsset).mockResolvedValueOnce({
        status: 'unauthorized',
        diagnostics: [
          {
            code: 'unauthorized',
            severity: 'error',
            message: 'outside allowed roots',
          },
        ],
      });

      await expect(
        processor.processContextImageResources([
          { role: 'camera', resource: previewResourceRef('camera-composition') },
        ]),
      ).rejects.toThrow(/camera.*outside allowed roots/);
    });
  });

  describe('readFileAsBase64', () => {
    it('should read and convert to base64 with correct mime type', async () => {
      const mockBuffer = Buffer.from('test');
      vi.mocked(contentAccessRuntime.loadProviderAsset).mockResolvedValueOnce({
        status: 'ready',
        diagnostics: [],
        bytes: mockBuffer,
        mimeType: 'image/webp',
        sizeBytes: mockBuffer.byteLength,
      });
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('legacy binary image read must not be used'),
      );

      const result = await processor.readFileAsBase64('/path/to/image.webp');

      expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith({
        caller: 'attachment-processor',
        source: { kind: 'file', path: '/path/to/image.webp' },
        preferredTarget: 'bytes',
        mimeTypeHint: 'image/webp',
      });
      expect(fs.promises.readFile).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'base64',
        media_type: 'image/webp',
        data: mockBuffer.toString('base64'),
      });
    });

    it('should default to image/png for unknown extensions', async () => {
      const mockBuffer = Buffer.from('test');
      vi.mocked(contentAccessRuntime.loadProviderAsset).mockResolvedValueOnce({
        status: 'ready',
        diagnostics: [],
        bytes: mockBuffer,
        mimeType: 'image/png',
        sizeBytes: mockBuffer.byteLength,
      });

      const result = await processor.readFileAsBase64('/path/to/image.xyz');

      expect(result?.media_type).toBe('image/png');
    });

    it('should return null on read failure', async () => {
      vi.mocked(contentAccessRuntime.loadProviderAsset).mockResolvedValueOnce({
        status: 'missing-source',
        diagnostics: [
          {
            code: 'missing-source',
            severity: 'error',
            message: 'Image source is missing',
          },
        ],
      });

      const result = await processor.readFileAsBase64('/nonexistent.png');

      expect(result).toBeNull();
    });

    it('returns null when image runtime is unavailable instead of using direct fs reads', async () => {
      processor = new AttachmentProcessor();
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('legacy binary image read must not be used'),
      );

      const result = await processor.readFileAsBase64('/path/to/image.png');

      expect(result).toBeNull();
      expect(fs.promises.readFile).not.toHaveBeenCalled();
    });
  });
});

function createContentAccessRuntime(): AgentContentAccessRuntime {
  return {
    resolve: vi.fn(),
    resolveImageMetadata: vi.fn(),
    resolveDocumentContent: vi.fn(),
    loadProviderAsset: vi.fn(async () => ({
      status: 'ready' as const,
      diagnostics: [],
      bytes: new Uint8Array(Buffer.from('image-bytes')),
      mimeType: 'image/png',
      sizeBytes: 'image-bytes'.length,
    })),
    projectResource: vi.fn(),
  } as unknown as AgentContentAccessRuntime;
}

function previewResourceRef(id: string): ResourceRef {
  return {
    id,
    scope: 'project',
    provider: 'preview-variant',
    kind: 'preview',
    source: {
      kind: 'preview-asset',
      previewAssetId: id,
      filePath: `/workspace/.neko/.cache/resources/three-reference-captures/${id}.png`,
    },
    locator: { kind: 'preview-asset', assetId: id },
    fingerprint: {
      strategy: 'provider',
      value: `preview:${id}`,
      providerId: 'preview-variant',
    },
  };
}
