import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko/agent-contracts';
import {
  isLocalMediaFilePath,
  projectMessagesForResourceDisplay,
  projectResourceValue,
} from '../../input/message-resource-projector';

const contentLocator = { file: { authority: 'workspace' as const, path: 'images/page-1.jpg' } };
const representationSource = {
  file: { authority: 'workspace' as const, path: 'documents/book.pdf' },
};

const representationHandle = {
  kind: 'content-representation-handle' as const,
  id: 'page-1',
};

describe('message resource projector', () => {
  it('detects absolute local media paths without treating relative or network URLs as files', () => {
    expect(isLocalMediaFilePath('/tmp/image.png')).toBe(true);
    expect(isLocalMediaFilePath('C:\\tmp\\video.mp4')).toBe(true);
    expect(isLocalMediaFilePath('/tmp/readme.txt')).toBe(false);
    expect(isLocalMediaFilePath('relative/image.png')).toBe(false);
    expect(isLocalMediaFilePath('https://example.test/image.png')).toBe(false);
  });

  it('preserves ContentLocator, removes absolute display paths and adds one Preview descriptor', async () => {
    const descriptor = previewDescriptor(contentLocator);
    const resolveDisplayLocator = vi.fn(async () => ({ status: 'ready' as const, descriptor }));

    await expect(
      projectResourceValue(
        {
          label: 'Page 1',
          path: '/tmp/page-1.jpg',
          mimeType: 'image/jpeg',
          contentLocator,
        },
        { resolveDisplayLocator },
      ),
    ).resolves.toEqual({
      label: 'Page 1',
      path: 'images/page-1.jpg',
      mimeType: 'image/jpeg',
      contentLocator,
      previewDescriptor: descriptor,
    });
    expect(resolveDisplayLocator).toHaveBeenCalledWith(
      { source: contentLocator },
      {
        mediaType: 'image/jpeg',
      },
    );
  });

  it('removes path-only local media and emits a visible diagnostic without inference', async () => {
    await expect(
      projectResourceValue({
        url: '/tmp/image.png',
        urls: ['/tmp/a.png', 'https://example.test/b.png'],
      }),
    ).resolves.toEqual({
      urls: ['https://example.test/b.png'],
      resourceProjectionDiagnostics: [
        {
          code: 'resource-projection-denied',
          severity: 'error',
          field: 'url',
          sourceKind: 'missing-content-locator',
          message: 'Local media display requires a validated ContentLocator.',
        },
        {
          code: 'resource-projection-denied',
          severity: 'error',
          field: 'urls',
          sourceKind: 'missing-content-locator',
          message: 'Local media display requires a validated ContentLocator.',
        },
      ],
    });
  });

  it('projects locator-backed Tool results without mutating Tool arguments or durable identity', async () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-1',
              name: 'ReadImage',
              arguments: { contentLocator },
              result: {
                success: true,
                data: {
                  contentLocator,
                  path: '/tmp/page-1.jpg',
                  mimeType: 'image/jpeg',
                },
              },
            },
          },
        ],
      },
    ];

    const descriptor = previewDescriptor(contentLocator);
    const [projected] = await projectMessagesForResourceDisplay(messages, {
      resolveDisplayLocator: async () => ({ status: 'ready', descriptor }),
    });
    expect(messages[0]?.contentBlocks?.[0]).toEqual({
      id: 'block-1',
      type: 'tool_call',
      timestamp: 1,
      toolCall: {
        id: 'tool-1',
        name: 'ReadImage',
        arguments: { contentLocator },
        result: {
          success: true,
          data: {
            contentLocator,
            path: '/tmp/page-1.jpg',
            mimeType: 'image/jpeg',
          },
        },
      },
    });
    const block = projected?.contentBlocks?.[0];
    expect(block?.type).toBe('tool_call');
    expect(block?.toolCall?.arguments).toEqual({ contentLocator });
    expect(block?.toolCall?.result?.data).toEqual({
      contentLocator,
      path: 'images/page-1.jpg',
      mimeType: 'image/jpeg',
      previewDescriptor: descriptor,
    });
    expect(JSON.stringify(projected)).not.toContain('/tmp/page-1.jpg');
  });

  it('preserves locator-backed data and emits a diagnostic when display authorization fails', async () => {
    await expect(
      projectResourceValue(
        {
          contentLocator,
          path: '/tmp/page-1.jpg',
          mimeType: 'image/jpeg',
        },
        {
          resolveDisplayLocator: async () => {
            return {
              status: 'unavailable',
              diagnostic: {
                code: 'agent-preview-content-unavailable',
                message: 'The requested image is unavailable.',
              },
            };
          },
        },
      ),
    ).resolves.toEqual({
      contentLocator,
      path: 'images/page-1.jpg',
      mimeType: 'image/jpeg',
      resourceProjectionDiagnostics: [
        {
          code: 'agent-preview-content-unavailable',
          severity: 'error',
          field: 'contentLocator',
          sourceKind: 'authorization-denied',
          message: 'The requested image is unavailable.',
        },
      ],
    });
  });

  it('uses an opaque representation handle for display without persisting it', async () => {
    const descriptor = previewDescriptor(representationSource);
    const resolveDisplayLocator = vi.fn(async () => ({ status: 'ready' as const, descriptor }));

    await expect(
      projectResourceValue(
        {
          label: 'Page 1',
          mimeType: 'image/png',
          contentLocator: representationSource,
          representationHandle,
        },
        { resolveDisplayLocator },
      ),
    ).resolves.toEqual({
      label: 'Page 1',
      mimeType: 'image/png',
      contentLocator: representationSource,
      previewDescriptor: descriptor,
    });
    expect(resolveDisplayLocator).toHaveBeenCalledWith(
      { source: representationSource, representationHandle },
      {
        mediaType: 'image/png',
      },
    );
    expect(
      JSON.stringify(
        await projectResourceValue({ contentLocator: representationSource, representationHandle }),
      ),
    ).not.toContain(representationHandle.id);
  });
});

function previewDescriptor(locator: typeof contentLocator) {
  return {
    descriptorId: 'agent-display:attachment-1:image-1',
    sourceFingerprint: 'sha256:image-1',
    contentLocator: locator,
    url: `openneko://resource/${'a'.repeat(32)}`,
    contentKind: 'image' as const,
    mediaType: 'image/jpeg',
    displayName: 'page-1.jpg',
    byteLength: 42,
  };
}
