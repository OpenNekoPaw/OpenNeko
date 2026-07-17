import { describe, expect, it, vi } from 'vitest';
import type {
  AgentTurnTimelineErrorItem,
  ConversationProjectionAttachmentHostFrame,
} from '@neko-agent/types';
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
});
