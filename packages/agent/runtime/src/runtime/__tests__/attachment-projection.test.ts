import { describe, expect, it, vi } from 'vitest';
import {
  extractFileReferencePaths,
  formatDocumentAttachmentReference,
  formatFileAttachmentContent,
  formatMediaAttachmentReference,
  formatUnreadableFileAttachment,
  parseBase64DataUrl,
  projectAgentMessageAttachments,
} from '../../input/attachment-projection';

describe('attachment projection helpers', () => {
  it('parses base64 data URLs into agent image attachments', () => {
    expect(parseBase64DataUrl('data:image/png;base64,abc123')).toEqual({
      type: 'base64',
      media_type: 'image/png',
      data: 'abc123',
    });
    expect(parseBase64DataUrl('not-a-data-url')).toBeNull();
  });

  it('formats file and media attachment text consistently', () => {
    expect(formatFileAttachmentContent('code.ts', 'const x = 1;')).toContain('### File: code.ts');
    expect(formatUnreadableFileAttachment('secret.txt')).toContain('Failed to read file');
    const documentReference = formatDocumentAttachmentReference(
      'book.epub',
      '${A}/books/book.epub',
    );
    expect(documentReference).toContain('Use ReadDocument');
    expect(documentReference).toContain('source={"kind":"file","path":"${A}/books/book.epub"}');
    expect(
      formatMediaAttachmentReference({
        type: 'video',
        name: 'clip.mp4',
        path: '/tmp/clip.mp4',
      }),
    ).toBe('\n\n[Attached video: clip.mp4] (path: /tmp/clip.mp4)');
  });

  it('localizes document attachment references while preserving ReadDocument contracts', () => {
    const documentReference = formatDocumentAttachmentReference(
      'book.epub',
      '${A}/books/book.epub',
      'zh-CN',
    );

    expect(documentReference).toContain('[已附加 文档: book.epub]');
    expect(documentReference).toContain('分析该文档前，先调用 ReadDocument');
    expect(documentReference).toContain('source={"kind":"file","path":"${A}/books/book.epub"}');
    expect(documentReference).not.toContain('Use ReadDocument with source=');
  });

  it('extracts file reference chip paths from a message', () => {
    expect(
      extractFileReferencePaths('see this\n[File: clip.mp4]\n/tmp/clip.mp4\nand\n[File: a]\n/a'),
    ).toEqual(['/tmp/clip.mp4', '/a']);
  });

  it('projects attachments with injected IO dependencies', async () => {
    const onError = vi.fn();
    const result = await projectAgentMessageAttachments(
      [
        {
          id: 'img-1',
          type: 'image',
          name: 'photo.png',
          preview: 'data:image/png;base64,abc123',
        },
        {
          id: 'file-1',
          type: 'file',
          name: 'code.ts',
          path: '/tmp/code.ts',
        },
        {
          id: 'video-1',
          type: 'video',
          name: 'clip.mp4',
          path: '/tmp/clip.mp4',
        },
      ],
      {
        readTextFile: async () => 'const x = 1;',
        readImageFileAsBase64: async () => null,
        onError,
      },
    );

    expect(result.imageAttachments).toEqual([
      { type: 'base64', media_type: 'image/png', data: 'abc123' },
    ]);
    expect(result.textContent).toContain('### File: code.ts');
    expect(result.textContent).toContain('[Attached video: clip.mp4]');
    expect(onError).not.toHaveBeenCalled();
  });

  it('projects document attachments as ReadDocument references without reading them', async () => {
    const readTextFile = vi.fn(async () => {
      throw new Error('document should not be read as text');
    });

    const result = await projectAgentMessageAttachments(
      [
        {
          id: 'file-1',
          type: 'file',
          name: 'book.epub',
          path: '${A}/books/book.epub',
        },
      ],
      {
        readTextFile,
        readImageFileAsBase64: async () => null,
        locale: 'zh',
      },
    );

    expect(readTextFile).not.toHaveBeenCalled();
    expect(result.textContent).toContain('[已附加 文档: book.epub]');
    expect(result.textContent).toContain('分析该文档前，先调用 ReadDocument');
    expect(result.textContent).toContain('source={"kind":"file","path":"${A}/books/book.epub"}');
    expect(result.textContent).not.toContain('document should not be read');
  });

  it('keeps unreadable file projection deterministic and reports the bridge error', async () => {
    const onError = vi.fn();
    const result = await projectAgentMessageAttachments(
      [{ id: 'file-1', type: 'file', name: 'secret.txt', path: '/tmp/secret.txt' }],
      {
        readTextFile: async () => {
          throw new Error('Permission denied');
        },
        readImageFileAsBase64: async () => null,
        onError,
      },
    );

    expect(result.textContent).toContain('Failed to read file');
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'read-file',
      }),
    );
  });
});
