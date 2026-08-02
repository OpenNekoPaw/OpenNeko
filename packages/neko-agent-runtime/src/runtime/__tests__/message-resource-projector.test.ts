import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko-agent/contracts';
import {
  isLocalMediaFilePath,
  projectMessagesForResourceDisplay,
  projectResourceValue,
} from '../../input/message-resource-projector';

const contentLocator = {
  kind: 'workspace-file' as const,
  path: 'images/page-1.jpg',
};

describe('message resource projector', () => {
  it('detects absolute local media paths without treating relative or network URLs as files', () => {
    expect(isLocalMediaFilePath('/tmp/image.png')).toBe(true);
    expect(isLocalMediaFilePath('C:\\tmp\\video.mp4')).toBe(true);
    expect(isLocalMediaFilePath('/tmp/readme.txt')).toBe(false);
    expect(isLocalMediaFilePath('relative/image.png')).toBe(false);
    expect(isLocalMediaFilePath('https://example.test/image.png')).toBe(false);
  });

  it('preserves ContentLocator, removes absolute display paths and adds only renderUri', async () => {
    const resolveContentLocator = vi.fn(
      async () => 'http://127.0.0.1:43125/v1/resources/image-token',
    );

    await expect(
      projectResourceValue(
        {
          label: 'Page 1',
          path: '/tmp/page-1.jpg',
          mimeType: 'image/jpeg',
          contentLocator,
        },
        { resolveContentLocator },
      ),
    ).resolves.toEqual({
      label: 'Page 1',
      path: 'images/page-1.jpg',
      mimeType: 'image/jpeg',
      contentLocator,
      renderUri: 'http://127.0.0.1:43125/v1/resources/image-token',
    });
    expect(resolveContentLocator).toHaveBeenCalledWith(contentLocator, {
      mediaType: 'image/jpeg',
    });
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

    const [projected] = await projectMessagesForResourceDisplay(messages, {
      resolveContentLocator: async () => 'http://127.0.0.1:43125/v1/resources/image-token',
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
      renderUri: 'http://127.0.0.1:43125/v1/resources/image-token',
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
          resolveContentLocator: async () => {
            throw new Error('denied');
          },
        },
      ),
    ).resolves.toEqual({
      contentLocator,
      path: 'images/page-1.jpg',
      mimeType: 'image/jpeg',
      resourceProjectionDiagnostics: [
        {
          code: 'resource-projection-denied',
          severity: 'error',
          field: 'contentLocator',
          sourceKind: 'authorization-denied',
          message: 'Content could not be authorized for Webview display.',
        },
      ],
    });
  });
});
