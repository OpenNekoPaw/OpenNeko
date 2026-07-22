import { createConversationProjectionStore } from '@neko/agent/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  AgentStreamProcessor,
  projectStreamMessageResourcesForWebview,
} from '../agentStreamProcessor';

vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  },
  window: { showInformationMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

async function* events() {
  yield { type: 'text' as const, content: 'authoritative' };
  yield { type: 'done' as const };
}

describe('AgentStreamProcessor conversation projection ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('commits stream updates to the conversation store even when transport is unavailable', async () => {
    const projection = createConversationProjectionStore('conversation-a');
    const webview = {
      postMessage: vi.fn().mockResolvedValue(false),
      asWebviewUri: vi.fn((uri: { readonly fsPath: string }) => ({
        toString: () => `webview-uri:${uri.fsPath}`,
      })),
    };
    const processor = new AgentStreamProcessor({
      getConversationProjection: (conversationId: string) => {
        expect(conversationId).toBe('conversation-a');
        return projection;
      },
    });

    await processor.processStream(webview as never, 'conversation-a', events(), {
      messageId: 'message-a',
      onPhaseChange: vi.fn(),
    });

    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agentTurnTimeline' }),
    );
    expect(projection.projectionVersion).toBeGreaterThan(0);
    expect(projection.snapshot()).toMatchObject({
      conversationId: 'conversation-a',
      turns: [
        {
          turnId: 'turn-message-a',
          messageId: 'message-a',
          completion: { status: 'completed' },
          items: [
            {
              kind: 'assistant_text',
              payload: { content: 'authoritative' },
            },
          ],
        },
      ],
    });
    processor.dispose();
    projection.dispose();
  });

  it('projects locator-only ReadImage attachments to bounded Webview previews without mutating history', async () => {
    const sourceBytes = await sharp({
      create: { width: 1200, height: 1800, channels: 3, background: '#d02020' },
    })
      .png()
      .toBuffer();
    const contentLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/comic.cbz' },
      entryPath: 'pages/001.png',
    };
    const assetRef = {
      assetId: 'page-1',
      uri: 'content:page-1',
      mimeType: 'image/png',
      contentLocator,
    };
    const message = {
      type: 'toolResult' as const,
      conversationId: 'conversation-a',
      messageId: 'message-a',
      toolCallId: 'read-image-1',
      success: true,
      data: { images: [{ label: 'Page 1', contentLocator }] },
      attachments: [{ type: 'image' as const, path: assetRef.uri, assetRef }],
      perceptionCards: [
        {
          version: 1 as const,
          assetId: 'page-1',
          modality: 'image' as const,
          createdAt: 1,
          layerStatus: {
            layer0: 'complete' as const,
            layer1: 'skipped' as const,
            layer2: 'complete' as const,
          },
          structural: { format: 'png', mimeType: 'image/png', byteSize: sourceBytes.byteLength },
          perceptual: { thumbnailRef: assetRef, keyframeRefs: [assetRef] },
        },
      ],
    };
    const loadContentAsset = vi.fn(async () => ({
      status: 'ready' as const,
      locator: contentLocator,
      diagnostics: [],
      bytes: sourceBytes,
      mimeType: 'image/png',
      sizeBytes: sourceBytes.byteLength,
    }));

    const projected = await projectStreamMessageResourcesForWebview({} as never, message, {
      contentAccessRuntime: { loadContentAsset } as never,
    });

    expect(projected).toMatchObject({
      attachments: [
        {
          assetRef: {
            contentLocator,
            previewUri: expect.stringMatching(/^data:image\/webp;base64,/),
          },
        },
      ],
    });
    expect(loadContentAsset).toHaveBeenCalledTimes(1);
    expect(projected.perceptionCards?.[0]?.perceptual?.thumbnailRef).not.toHaveProperty(
      'previewUri',
    );
    expect(assetRef).not.toHaveProperty('previewUri');
  });

  it('projects hydrated locator-only perception cards when legacy history has no attachments', async () => {
    const sourceBytes = await sharp({
      create: { width: 900, height: 1200, channels: 3, background: '#2040d0' },
    })
      .png()
      .toBuffer();
    const contentLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/comic.cbz' },
      entryPath: 'pages/002.png',
    };
    const assetRef = {
      assetId: 'page-2',
      uri: 'content:page-2',
      mimeType: 'image/png',
      contentLocator,
    };
    const loadContentAsset = vi.fn(async () => ({
      status: 'ready' as const,
      locator: contentLocator,
      diagnostics: [],
      bytes: sourceBytes,
      mimeType: 'image/png',
      sizeBytes: sourceBytes.byteLength,
    }));

    const projected = await projectStreamMessageResourcesForWebview(
      {} as never,
      {
        type: 'toolResult' as const,
        conversationId: 'conversation-a',
        messageId: 'message-a',
        toolCallId: 'read-image-hydrated',
        success: true,
        data: { images: [{ label: 'Page 2', contentLocator }] },
        perceptionCards: [
          {
            version: 1 as const,
            assetId: 'page-2',
            modality: 'image' as const,
            createdAt: 1,
            layerStatus: {
              layer0: 'complete' as const,
              layer1: 'skipped' as const,
              layer2: 'complete' as const,
            },
            structural: {
              format: 'png',
              mimeType: 'image/png',
              byteSize: sourceBytes.byteLength,
            },
            perceptual: { thumbnailRef: assetRef },
          },
        ],
      },
      { contentAccessRuntime: { loadContentAsset } as never },
    );

    expect(projected.perceptionCards?.[0]?.perceptual?.thumbnailRef).toMatchObject({
      contentLocator,
      previewUri: expect.stringMatching(/^data:image\/webp;base64,/),
    });
    expect(loadContentAsset).toHaveBeenCalledTimes(1);
    expect(assetRef).not.toHaveProperty('previewUri');
  });
});
