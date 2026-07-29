import { describe, expect, it, vi } from 'vitest';
import type {
  AgentTurnTimelineErrorItem,
  AgentTurnTimelineToolCallItem,
  ConversationProjectionAttachmentHostFrame,
} from '@neko-agent/types';
import { createGeneratedAssetRevisionRef, type GeneratedAsset } from '@neko/shared';
import { projectConversationProjectionAttachmentFrameForWebview } from '../webviewResourceProjection';

const key = {
  endpointEpoch: 'endpoint-1',
  attachmentId: 'attachment-1',
  tabId: 'tab-1',
  conversationId: 'conversation-1',
} as const;

describe('Webview projection attachment resource projection', () => {
  it('projects snapshot resources only at the endpoint boundary', async () => {
    const imagePath = '/tmp/render-preview.png';
    const item = {
      conversationId: key.conversationId,
      turnId: 'turn-1',
      messageId: 'message-1',
      itemId: 'error-1',
      sequence: 1,
      itemRevision: 1,
      kind: 'error',
      status: 'failed',
      payload: { details: { path: imagePath } },
      createdAt: 1,
      updatedAt: 1,
    } satisfies AgentTurnTimelineErrorItem;
    const frame: ConversationProjectionAttachmentHostFrame = {
      type: 'projectionSnapshot',
      key,
      sequence: 0,
      projectionVersion: 1,
      projection: {
        conversationId: key.conversationId,
        projectionVersion: 1,
        turns: [
          {
            turnId: item.turnId,
            messageId: item.messageId,
            items: [item],
          },
        ],
      },
    };
    const toWebviewUri = vi.fn(() => 'webview-uri:/tmp/render-preview.png');

    const projected = await projectConversationProjectionAttachmentFrameForWebview(frame, {
      webview: {} as never,
      localResourceAccess: { toWebviewUri } as never,
      localMediaCaller: 'test.projection-attachment',
      documentResourceCaller: 'test.projection-document-resource',
    });

    expect(frame.projection.turns[0]?.items[0]).toMatchObject({
      payload: { details: { path: imagePath } },
    });
    expect(projected).toMatchObject({
      type: 'projectionSnapshot',
      key,
      projection: {
        turns: [
          {
            items: [
              {
                payload: {
                  details: { path: 'webview-uri:/tmp/render-preview.png' },
                },
              },
            ],
          },
        ],
      },
    });
    expect(toWebviewUri).toHaveBeenCalledWith({}, imagePath, 'test.projection-attachment');
  });

  it('does not rewrite attachment protocol control frames', async () => {
    const frame: ConversationProjectionAttachmentHostFrame = {
      type: 'projectionDetach',
      key,
      reason: 'tab-closed',
    };

    await expect(
      projectConversationProjectionAttachmentFrameForWebview(frame, {
        webview: {} as never,
        localMediaCaller: 'test.projection-attachment',
        documentResourceCaller: 'test.projection-document-resource',
      }),
    ).resolves.toBe(frame);
  });

  it('hydrates stable generated ContentLocators only at the Webview boundary', async () => {
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'generated-1',
      contentDigest: 'sha256:generated-1',
      contentPath: 'neko/generated/images/generated-1.png',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { operationId: 'generation-1' },
    });
    const asset: GeneratedAsset = {
      type: 'generated-image',
      id: 'generated-1',
      path: '/workspace/neko/generated/images/generated-1.png',
      mimeType: 'image/png',
      generatedAt: '2026-07-25T00:00:00.000Z',
      lifecycle,
      width: 1024,
      height: 1024,
      ratio: '1:1',
    };
    const item = {
      conversationId: key.conversationId,
      turnId: 'turn-1',
      runId: 'run-1',
      messageId: 'message-1',
      itemId: 'tool-generation-1',
      sequence: 1,
      itemRevision: 3,
      kind: 'tool_call',
      status: 'succeeded',
      payload: {
        toolCall: {
          id: 'generation-1',
          name: 'GenerateImage',
          arguments: { prompt: '雨中的霓虹街道' },
          result: {
            success: true,
            data: {
              jobId: 'generation-1',
              jobRevision: 3,
              status: 'completed',
              outputs: [{ type: 'image', contentLocator: lifecycle.contentLocator }],
            },
          },
        },
      },
      createdAt: 1,
      updatedAt: 3,
    } satisfies AgentTurnTimelineToolCallItem;
    const frame: ConversationProjectionAttachmentHostFrame = {
      type: 'projectionSnapshot',
      key,
      sequence: 0,
      projectionVersion: 1,
      projection: {
        conversationId: key.conversationId,
        projectionVersion: 1,
        turns: [
          {
            turnId: item.turnId,
            runId: item.runId,
            messageId: item.messageId,
            items: [item],
          },
        ],
      },
    };
    const toWebviewUri = vi.fn(() => 'webview://generated/generated-1.png');
    const resolveGenerationResult = vi.fn(() => ({ path: asset.path, asset }));

    const projected = await projectConversationProjectionAttachmentFrameForWebview(frame, {
      webview: {} as never,
      localResourceAccess: { toWebviewUri } as never,
      localMediaCaller: 'test.projection-attachment',
      documentResourceCaller: 'test.projection-document-resource',
      resolveGenerationResult,
    });

    expect(projected).toMatchObject({
      projection: {
        turns: [
          {
            items: [
              {
                payload: {
                  toolCall: {
                    result: {
                      data: {
                        outputs: [
                          {
                            contentLocator: lifecycle.contentLocator,
                            renderUri: 'webview://generated/generated-1.png',
                            mimeType: 'image/png',
                          },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    });
    expect(resolveGenerationResult).toHaveBeenCalledWith(lifecycle.contentLocator);
  });
});
