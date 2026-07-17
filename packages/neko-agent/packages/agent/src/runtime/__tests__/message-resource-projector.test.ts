import { describe, expect, it } from 'vitest';
import type { Message } from '@neko-agent/types';
import {
  isLocalMediaFilePath,
  projectMessagesForResourceDisplay,
  projectResourceValue,
  updateBackgroundTaskToolResultUrls,
} from '../../input/message-resource-projector';

describe('message resource projector', () => {
  it('detects absolute local media paths only', () => {
    expect(isLocalMediaFilePath('/tmp/image.png')).toBe(true);
    expect(isLocalMediaFilePath('C:\\tmp\\video.mp4')).toBe(true);
    expect(isLocalMediaFilePath('/tmp/readme.txt')).toBe(false);
    expect(isLocalMediaFilePath('relative/image.png')).toBe(false);
    expect(isLocalMediaFilePath('https://example.test/image.png')).toBe(false);
  });

  it('projects single url fields without preserving raw local paths', () => {
    expect(
      projectResourceValue(
        {
          url: '/tmp/image.png',
          thumbnailUrl: '/tmp/thumb.png',
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      url: 'webview:///tmp/image.png',
      thumbnailUrl: 'webview:///tmp/thumb.png',
    });
  });

  it('projects urls arrays without preserving raw local paths', () => {
    expect(
      projectResourceValue(
        {
          urls: ['/tmp/a.png', 'https://example.test/b.png', '/tmp/c.jpg'],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      urls: ['webview:///tmp/a.png', 'https://example.test/b.png', 'webview:///tmp/c.jpg'],
    });
  });

  it('projects structured image argument paths without adding webview handles', () => {
    expect(
      projectResourceValue(
        {
          images: [{ label: 'Page 1', path: '/tmp/page-1.jpg' }],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      images: [{ label: 'Page 1', path: 'webview:///tmp/page-1.jpg' }],
    });
  });

  it('adds renderUri for stable resource-backed media without replacing durable path fields', () => {
    expect(
      projectResourceValue(
        {
          images: [
            {
              label: 'Page 1',
              path: '/tmp/page-1.jpg',
              resourceRef: {
                id: 'page-1',
                scope: 'project',
                provider: 'read-image',
                kind: 'media',
                source: { kind: 'file', projectRelativePath: 'images/page-1.jpg' },
                locator: { kind: 'file', path: 'images/page-1.jpg' },
                fingerprint: {
                  strategy: 'provider',
                  providerId: 'read-image',
                  value: 'page-1',
                },
              },
            },
          ],
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      images: [
        {
          label: 'Page 1',
          path: '/tmp/page-1.jpg',
          renderUri: 'webview:///tmp/page-1.jpg',
          resourceRef: {
            id: 'page-1',
            scope: 'project',
            provider: 'read-image',
            kind: 'media',
            source: { kind: 'file', projectRelativePath: 'images/page-1.jpg' },
            locator: { kind: 'file', path: 'images/page-1.jpg' },
            fingerprint: {
              strategy: 'provider',
              providerId: 'read-image',
              value: 'page-1',
            },
          },
        },
      ],
    });
  });

  it('treats nested ResourceRef values as atomic stable identity during Webview projection', () => {
    const resourceRef = {
      id: 'generated-1',
      scope: 'project',
      provider: 'generated-asset',
      kind: 'generated',
      source: {
        kind: 'generated-asset',
        generatedAssetId: 'generated-1',
        filePath: '/workspace/neko/generated/image/task_1_0.png',
        metadata: {
          path: '/workspace/neko/generated/image/task_1_0.png',
          mimeType: 'image/png',
        },
      },
      locator: { kind: 'generated-asset', assetId: 'generated-1' },
      fingerprint: {
        strategy: 'provider',
        value: 'generated-1',
        providerId: 'generated-asset',
      },
    };

    expect(
      projectResourceValue(
        {
          uri: '/workspace/neko/generated/image/task_1_0.png',
          resourceRef,
        },
        { resolveLocalMediaPath: (path) => `webview://${path}` },
      ),
    ).toEqual({
      uri: '/workspace/neko/generated/image/task_1_0.png',
      renderUri: 'webview:///workspace/neko/generated/image/task_1_0.png',
      resourceRef,
    });
  });

  it('projects tool result payloads in content blocks', () => {
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
              id: 'tool-2',
              name: 'GenerateVideo',
              arguments: {},
              result: { success: true, data: { urls: ['/tmp/video.mp4'] } },
            },
          },
        ],
      },
    ];

    expect(
      projectMessagesForResourceDisplay(messages, {
        resolveLocalMediaPath: (path) => `webview://${path}`,
      }),
    ).toEqual([
      {
        ...messages[0],
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-2',
              name: 'GenerateVideo',
              arguments: {},
              result: {
                success: true,
                data: { urls: ['webview:///tmp/video.mp4'] },
              },
            },
          },
        ],
      },
    ]);
  });

  it('projects top-level tool result media fields in content blocks', () => {
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
              id: 'tool-2',
              name: 'ReadImage',
              arguments: {},
              result: {
                success: true,
                data: {},
                attachments: [
                  {
                    type: 'image',
                    path: '/tmp/page-1.jpg',
                    mimeType: 'image/jpeg',
                    assetRef: {
                      assetId: 'read-image-page-1',
                      uri: '/tmp/page-1.jpg',
                      mimeType: 'image/jpeg',
                    },
                  },
                ],
                perceptionCards: [
                  {
                    version: 1,
                    assetId: 'read-image-page-1',
                    modality: 'image',
                    createdAt: 1,
                    layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
                    structural: { format: 'jpeg', mimeType: 'image/jpeg', byteSize: 10 },
                    perceptual: {
                      keyframeRefs: [
                        {
                          assetId: 'read-image-page-1',
                          uri: '/tmp/page-1.jpg',
                          mimeType: 'image/jpeg',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ];

    expect(
      projectMessagesForResourceDisplay(messages, {
        resolveLocalMediaPath: (path) => `webview://${path}`,
      }),
    ).toEqual([
      {
        ...messages[0],
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-2',
              name: 'ReadImage',
              arguments: {},
              result: {
                success: true,
                data: {},
                attachments: [
                  {
                    type: 'image',
                    path: 'webview:///tmp/page-1.jpg',
                    mimeType: 'image/jpeg',
                    assetRef: {
                      assetId: 'read-image-page-1',
                      uri: 'webview:///tmp/page-1.jpg',
                      mimeType: 'image/jpeg',
                    },
                  },
                ],
                perceptionCards: [
                  {
                    version: 1,
                    assetId: 'read-image-page-1',
                    modality: 'image',
                    createdAt: 1,
                    layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
                    structural: { format: 'jpeg', mimeType: 'image/jpeg', byteSize: 10 },
                    perceptual: {
                      keyframeRefs: [
                        {
                          assetId: 'read-image-page-1',
                          uri: 'webview:///tmp/page-1.jpg',
                          mimeType: 'image/jpeg',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ]);
  });

  it('projects tool argument payloads in content blocks', () => {
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
              id: 'tool-2',
              name: 'ReadImage',
              arguments: { images: [{ label: 'Page 1', path: '/tmp/block-page.jpg' }] },
            },
          },
        ],
      },
    ];

    expect(
      projectMessagesForResourceDisplay(messages, {
        resolveLocalMediaPath: (path) => `webview://${path}`,
      }),
    ).toEqual([
      {
        ...messages[0],
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-2',
              name: 'ReadImage',
              arguments: {
                images: [
                  {
                    label: 'Page 1',
                    path: 'webview:///tmp/block-page.jpg',
                  },
                ],
              },
            },
          },
        ],
      },
    ]);
  });

  it('does not emit display URLs when the host resolver fails', () => {
    expect(
      projectResourceValue(
        {
          url: '/tmp/image.png',
        },
        {
          resolveLocalMediaPath: () => {
            throw new Error('bad uri');
          },
        },
      ),
    ).toEqual({
      resourceProjectionDiagnostics: [
        {
          code: 'resource-projection-denied',
          severity: 'error',
          field: 'url',
          sourceKind: 'local-media-path',
          message:
            'Local media path could not be projected for Webview display. Use ResourceRef, source refs, workspace-relative paths, or adapter-projected render descriptors.',
        },
      ],
    });
  });

  it('updates matching background task tool results with completed urls', () => {
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
              name: 'GenerateImage',
              arguments: {},
              result: {
                success: true,
                data: { taskId: 'task-1', backgroundMode: true, status: 'running' },
              },
            },
          },
        ],
      },
    ];

    const result = updateBackgroundTaskToolResultUrls(messages, 'task-1', ['/tmp/output.png']);

    expect(result.updated).toBe(true);
    expect(result.messages[0]?.contentBlocks?.[0]?.toolCall?.result?.data).toEqual({
      taskId: 'task-1',
      backgroundMode: true,
      status: 'completed',
      url: '/tmp/output.png',
      urls: ['/tmp/output.png'],
    });
  });

  it('does not update non-matching background task tool results', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [],
      },
    ];

    expect(updateBackgroundTaskToolResultUrls(messages, 'task-1', ['/tmp/output.png'])).toEqual({
      messages,
      updated: false,
    });
  });
});
