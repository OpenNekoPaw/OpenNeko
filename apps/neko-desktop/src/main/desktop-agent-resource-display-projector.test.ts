import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConversationProjectionAttachmentHostFrame } from '@neko/agent-runtime/runtime/projection/conversation-projection-attachment-server';
import type {
  AgentTurnTimelineItem,
  AgentTurnTimelineToolCallItem,
  Message,
} from '@neko/agent-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentResourceDisplayProjector,
  type AgentResourceDisplayRegistrationPort,
} from '@neko/agent-runtime/runtime';
import { parsePreviewMediaDescriptor } from '@neko/preview-domain';
import type { DesktopResourceLease } from './desktop-resource-registry';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Desktop Agent resource display projector', () => {
  it('preserves locator and MIME while adding only a transient OpenNeko render projection', async () => {
    const fixture = await createFixture('media/clip.mp4');
    const release = vi.fn();
    const registerFile = vi.fn<AgentResourceDisplayRegistrationPort['registerFile']>(
      async (): Promise<DesktopResourceLease> => ({
        url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        release,
      }),
    );
    const recordProjection = vi.fn();
    const projector = createProjector(
      fixture.root,
      { registerFile },
      'connection-1',
      recordProjection,
    );

    const projected = await projector.project(
      snapshotFrame({
        contentLocator: fixture.locator,
        path: '/private/tmp/clip.mp4',
        mimeType: 'video/mp4',
      }),
    );

    expect(projected.type).toBe('projectionSnapshot');
    if (projected.type !== 'projectionSnapshot') {
      throw new Error('Expected projected snapshot frame.');
    }
    const data = readToolResultData(projected.projection.turns[0]?.items[0]);
    expect(data).toMatchObject({
      contentLocator: fixture.locator,
      path: 'media/clip.mp4',
      mimeType: 'video/mp4',
      previewDescriptor: {
        contentLocator: fixture.locator,
        url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        displayName: 'clip.mp4',
        mediaType: 'video/mp4',
        contentKind: 'video',
        byteLength: 7,
        sourceFingerprint: expect.any(String),
      },
    });
    expect(data).not.toHaveProperty('renderUri');
    expect(JSON.stringify(projected)).not.toContain('/private/tmp/clip.mp4');
    expect(registerFile).toHaveBeenCalledOnce();
    const [owner, source] = registerFile.mock.calls[0] ?? [];
    expect(owner).toEqual({
      windowId: 'window-1',
      viewId: 'view-1',
      sessionId: 'agent-display:conversation-1:attachment-1',
      connectionId: 'connection-1',
      sourceFingerprint: expect.any(String),
    });
    expect(source).toMatchObject({
      mediaType: 'video/mp4',
      sourceFingerprint: expect.any(String),
    });
    expect(source?.absolutePath).toMatch(/[/\\]media[/\\]clip\.mp4$/u);
    expect(recordProjection).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      toolCallId: 'tool-call-1',
      projectionKind: 'tool-result',
      status: 'authorized',
      locatorKind: 'workspace-file',
      transport: 'openneko-resource',
      renderTarget: 'agent-webview',
      diagnosticCodes: [],
    });

    projector.releaseAttachment('attachment-1');
    expect(release).toHaveBeenCalledOnce();
  });

  it('emits a visible diagnostic and never falls back to an unsafe display source', async () => {
    const root = await createTemporaryRoot();
    const registerFile = vi.fn();
    const recordProjection = vi.fn();
    const projector = createProjector(root, { registerFile }, 'connection-1', recordProjection);

    const projected = await projector.project(
      snapshotFrame({
        contentLocator: {
          kind: 'workspace-file',
          path: 'missing/video.mp4',
        },
        url: 'neko-media://desktop/unsupported-video',
        videoUrl: 'file:///private/tmp/video.mp4',
        audioUrl: 'data:audio/wav;base64,AA==',
        mimeType: 'video/mp4',
      }),
    );

    if (projected.type !== 'projectionSnapshot') {
      throw new Error('Expected projected snapshot frame.');
    }
    const data = readToolResultData(projected.projection.turns[0]?.items[0]);
    expect(data).not.toHaveProperty('renderUri');
    expect(JSON.stringify(data)).not.toContain('neko-media:');
    expect(JSON.stringify(data)).not.toContain('file:');
    expect(JSON.stringify(data)).not.toContain('data:');
    expect(data).toMatchObject({
      contentLocator: {
        kind: 'workspace-file',
        path: 'missing/video.mp4',
      },
      resourceProjectionDiagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: 'agent-preview-content-unavailable',
          severity: 'error',
          sourceKind: 'authorization-denied',
        }),
      ]),
    });
    expect(registerFile).not.toHaveBeenCalled();
    expect(recordProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: 'tool-call-1',
        status: 'denied',
        transport: 'none',
        diagnosticCodes: ['agent-preview-content-unavailable'],
      }),
    );
  });

  it('releases every outstanding lease when the owning connection is disposed', async () => {
    const fixture = await createFixture('audio/voice.wav');
    const release = vi.fn();
    const projector = createProjector(fixture.root, {
      registerFile: vi.fn(async () => ({
        url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        release,
      })),
    });

    await projector.project(
      snapshotFrame({
        contentLocator: fixture.locator,
        mimeType: 'audio/wav',
      }),
    );
    projector.dispose();

    expect(release).toHaveBeenCalledOnce();
    await expect(projector.project(snapshotFrame({}))).rejects.toThrow('disposed');
  });

  it('publishes document-entry bytes without replacing their stable locator', async () => {
    const root = await createTemporaryRoot();
    const locator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/story.epub' },
      entryPath: 'OPS/images/cover.png',
    };
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const release = vi.fn();
    const registerBytes = vi.fn(async () => ({
      url: 'openneko://resource/cccccccccccccccccccccccccccccccc/content',
      release,
    }));
    const loadDisplayAsset = vi.fn(async () => ({
      status: 'ready',
      diagnostics: [],
      bytes,
      mimeType: 'image/png',
      sizeBytes: bytes.byteLength,
    }));
    const recordProjection = vi.fn();
    const projector = createProjector(root, { registerBytes }, 'connection-1', recordProjection, {
      loadDisplayAsset,
    });

    const projected = await projector.project(
      snapshotFrame({ contentLocator: locator, mimeType: 'image/png' }),
    );

    if (projected.type !== 'projectionSnapshot') {
      throw new Error('Expected projected snapshot frame.');
    }
    const data = readToolResultData(projected.projection.turns[0]?.items[0]);
    expect(data).toMatchObject({
      contentLocator: locator,
      mimeType: 'image/png',
      previewDescriptor: {
        contentLocator: locator,
        url: 'openneko://resource/cccccccccccccccccccccccccccccccc/content',
        displayName: 'cover.png',
        mediaType: 'image/png',
        contentKind: 'image',
        byteLength: bytes.byteLength,
        sourceFingerprint: expect.any(String),
      },
    });
    expect(parsePreviewMediaDescriptor(data.previewDescriptor)).toMatchObject({
      contentLocator: locator,
      contentKind: 'image',
      mediaType: 'image/png',
    });
    expect(String((data.previewDescriptor as { descriptorId: string }).descriptorId)).not.toContain(
      'story.epub',
    );
    expect(loadDisplayAsset).toHaveBeenCalledWith({ locator, maxBytes: 64 * 1024 * 1024 });
    expect(registerBytes).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'connection-1' }),
      expect.objectContaining({ bytes, mediaType: 'image/png' }),
    );
    expect(recordProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        locatorKind: 'document-entry',
        status: 'authorized',
        transport: 'openneko-resource',
      }),
    );
    projector.dispose();
    expect(release).toHaveBeenCalledOnce();
  });

  it('reauthorizes persisted ReadImage messages through the same Host projector', async () => {
    const root = await createTemporaryRoot();
    const locator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/story.epub' },
      entryPath: 'OPS/images/cover.png',
    };
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const registerBytes = vi.fn(async () => ({
      url: 'openneko://resource/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/content',
      release: vi.fn(),
    }));
    const loadDisplayAsset = vi.fn(async () => ({
      status: 'ready',
      bytes,
      mimeType: 'image/png',
      sizeBytes: bytes.byteLength,
    }));
    const projector = createProjector(root, { registerBytes }, 'connection-history', undefined, {
      loadDisplayAsset,
    });
    const messages: Message[] = [
      {
        id: 'assistant-history',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'tool-block',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-image',
              name: 'ReadImage',
              arguments: {},
              result: {
                success: true,
                data: {
                  images: [{ label: 'cover.png', mimeType: 'image/png', contentLocator: locator }],
                },
                perceptionCards: [
                  {
                    assetId: 'cover',
                    modality: 'image',
                    createdAt: 1,
                    layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
                    structural: {
                      format: 'png',
                      mimeType: 'image/png',
                      byteSize: bytes.byteLength,
                    },
                    perceptual: {
                      thumbnailRef: {
                        assetId: 'cover',
                        uri: 'content:cover',
                        mimeType: 'image/png',
                        contentLocator: locator,
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ];

    const projected = await projector.projectMessages('conversation-history', messages);
    const toolCall = projected[0]?.contentBlocks?.[0]?.toolCall;
    const image = (toolCall?.result?.data as { images?: unknown[] } | undefined)?.images?.[0];
    const thumbnailRef = toolCall?.result?.perceptionCards?.[0]?.perceptual?.thumbnailRef;

    expect(image).toMatchObject({
      contentLocator: locator,
      previewDescriptor: {
        contentLocator: locator,
        url: 'openneko://resource/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/content',
      },
    });
    expect(thumbnailRef).toMatchObject({
      contentLocator: locator,
      previewDescriptor: {
        contentLocator: locator,
        url: 'openneko://resource/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/content',
      },
    });
    expect(registerBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'connection-history',
        sessionId: 'agent-display:conversation-history:history:conversation-history',
      }),
      expect.objectContaining({ bytes, mediaType: 'image/png' }),
    );
    expect(JSON.stringify(projected)).not.toContain('data:image');
  });

  it('keeps restored locators and exposes a diagnostic when Host preview loading fails', async () => {
    const root = await createTemporaryRoot();
    const locator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/story.epub' },
      entryPath: 'OPS/images/cover.png',
    };
    const projector = createProjector(root, {}, 'connection-history-failure', undefined, {
      loadDisplayAsset: vi.fn(async () => ({ status: 'failed' })),
    });
    const messages: Message[] = [
      {
        id: 'assistant-history-failure',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'tool-block',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-image',
              name: 'ReadImage',
              arguments: {},
              result: {
                success: true,
                data: {
                  images: [
                    {
                      label: 'cover.png',
                      mimeType: 'image/png',
                      contentLocator: locator,
                      path: '/private/tmp/cover.png',
                      src: 'data:image/png;base64,AA==',
                      renderUri: 'file:///private/tmp/cover.png',
                    },
                  ],
                },
                perceptionCards: [
                  {
                    assetId: 'cover',
                    modality: 'image',
                    createdAt: 1,
                    layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
                    structural: { format: 'png', mimeType: 'image/png', byteSize: 1 },
                    perceptual: {
                      thumbnailRef: {
                        assetId: 'cover',
                        uri: 'content:cover',
                        previewUri: 'data:image/png;base64,AA==',
                        mimeType: 'image/png',
                        contentLocator: locator,
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ];

    const projected = await projector.projectMessages('conversation-history-failure', messages);
    const toolCall = projected[0]?.contentBlocks?.[0]?.toolCall;
    const image = (toolCall?.result?.data as { images?: unknown[] } | undefined)?.images?.[0];
    const thumbnailRef = toolCall?.result?.perceptionCards?.[0]?.perceptual?.thumbnailRef;

    expect(image).toMatchObject({
      contentLocator: locator,
      path: 'OPS/images/cover.png',
      resourceProjectionDiagnostics: [
        expect.objectContaining({
          code: 'agent-preview-content-unavailable',
          sourceKind: 'authorization-denied',
        }),
      ],
    });
    expect(image).not.toHaveProperty('previewDescriptor');
    expect(thumbnailRef).toMatchObject({
      contentLocator: locator,
      uri: 'OPS/images/cover.png',
      resourceProjectionDiagnostics: [
        expect.objectContaining({
          code: 'agent-preview-content-unavailable',
          sourceKind: 'authorization-denied',
        }),
      ],
    });
    expect(thumbnailRef).not.toHaveProperty('previewDescriptor');
    expect(JSON.stringify(projected)).not.toMatch(/(?:data|file|content):/u);
  });

  it('keeps representation identity and isolates an unreadable sibling', async () => {
    const root = await createTemporaryRoot();
    const representationLocator = {
      kind: 'content-representation' as const,
      id: 'page-1',
      representationKind: 'raster-page' as const,
      source: { kind: 'workspace-file' as const, path: 'books/story.pdf' },
      spec: { kind: 'raster-page' as const, page: 1, format: 'png' as const },
      generatorId: 'document-raster',
      sourceFingerprint: 'sha256:source',
      specFingerprint: 'sha256:spec',
    };
    const missingLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/story.epub' },
      entryPath: 'OPS/images/missing.png',
    };
    const registerBytes = vi.fn(async () => ({
      url: 'openneko://resource/dddddddddddddddddddddddddddddddd/content',
      release: vi.fn(),
    }));
    const loadDisplayAsset = vi.fn(async ({ locator }) =>
      locator.kind === 'content-representation'
        ? {
            status: 'ready',
            bytes: new Uint8Array([137, 80, 78, 71]),
            mimeType: 'image/png',
          }
        : { status: 'failed' },
    );
    const projector = createProjector(root, { registerBytes }, 'connection-1', undefined, {
      loadDisplayAsset,
    });

    const projected = await projector.project(
      snapshotFrame({
        images: [
          { representationLocator, mimeType: 'image/png' },
          { contentLocator: missingLocator, mimeType: 'image/png' },
        ],
      }),
    );

    if (projected.type !== 'projectionSnapshot') {
      throw new Error('Expected projected snapshot frame.');
    }
    const data = readToolResultData(projected.projection.turns[0]?.items[0]);
    expect(data).toMatchObject({
      images: [
        {
          representationLocator,
          previewDescriptor: {
            contentLocator: representationLocator.source,
            url: 'openneko://resource/dddddddddddddddddddddddddddddddd/content',
            displayName: 'story.pdf',
            mediaType: 'image/png',
            contentKind: 'image',
            sourceFingerprint: expect.any(String),
          },
        },
        {
          contentLocator: missingLocator,
          resourceProjectionDiagnostics: [
            expect.objectContaining({ sourceKind: 'authorization-denied' }),
          ],
        },
      ],
    });
    expect(registerBytes).toHaveBeenCalledOnce();
  });

  it('isolates display leases across exact renderer connections', async () => {
    const fixture = await createFixture('media/clip.mp4');
    const releaseOld = vi.fn();
    const releaseCurrent = vi.fn();
    const oldResources = {
      registerFile: vi.fn(async () => ({
        url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        release: releaseOld,
      })),
    };
    const currentResources = {
      registerFile: vi.fn(async () => ({
        url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        release: releaseCurrent,
      })),
    };
    const oldProjector = createProjector(fixture.root, oldResources, 'connection-1');
    const currentProjector = createProjector(fixture.root, currentResources, 'connection-2');

    await oldProjector.project(
      snapshotFrame({ contentLocator: fixture.locator, mimeType: 'video/mp4' }),
    );
    await currentProjector.project(
      snapshotFrame({ contentLocator: fixture.locator, mimeType: 'video/mp4' }),
    );
    oldProjector.dispose();

    expect(releaseOld).toHaveBeenCalledOnce();
    expect(releaseCurrent).not.toHaveBeenCalled();
    expect(currentResources.registerFile).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'connection-2' }),
      expect.any(Object),
    );
    currentProjector.dispose();
    expect(releaseCurrent).toHaveBeenCalledOnce();
  });
});

function createProjector(
  workspacePath: string,
  resources: Partial<AgentResourceDisplayRegistrationPort>,
  connectionId = 'connection-1',
  recordProjection?: Parameters<typeof createAgentResourceDisplayProjector>[0]['recordProjection'],
  contentAssets: Parameters<typeof createAgentResourceDisplayProjector>[0]['contentAssets'] = {
    loadDisplayAsset: vi.fn(async () => ({ status: 'failed' })),
  },
) {
  return createAgentResourceDisplayProjector({
    identity: {
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId: 'view-1',
      connectionId,
    },
    workspace: {
      workspaceId: 'workspace-1',
      workspacePath,
      displayName: 'Fixture',
      locator: { kind: 'variable', value: '${HOME}/fixture' },
    },
    contentAssets,
    resources: {
      registerFile: vi.fn(async () => {
        throw new Error('Unexpected file display registration.');
      }),
      registerBytes: vi.fn(async () => {
        throw new Error('Unexpected byte display registration.');
      }),
      ...resources,
    },
    ...(recordProjection === undefined ? {} : { recordProjection }),
  });
}

function snapshotFrame(data: unknown): ConversationProjectionAttachmentHostFrame {
  const item: AgentTurnTimelineToolCallItem = {
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    runId: 'run-1',
    messageId: 'message-1',
    itemId: 'tool-item-1',
    sequence: 1,
    status: 'complete',
    createdAt: 1,
    updatedAt: 1,
    kind: 'tool_call',
    parentAnchor: 'turn',
    payload: {
      toolCall: {
        id: 'tool-call-1',
        name: 'ReadDocument',
        arguments: {
          contentLocator: {
            kind: 'workspace-file',
            path: 'documents/source.pdf',
          },
        },
        result: {
          success: true,
          data,
        },
      },
    },
  };
  return {
    type: 'projectionSnapshot',
    key: {
      attachmentId: 'attachment-1',
      tabId: 'tab-1',
      conversationId: 'conversation-1',
    },
    sequence: 0,
    projection: {
      conversationId: 'conversation-1',
      turns: [
        {
          turnId: 'turn-1',
          runId: 'run-1',
          messageId: 'message-1',
          items: [item],
        },
      ],
    },
  };
}

function readToolResultData(item: AgentTurnTimelineItem | undefined): Record<string, unknown> {
  if (!item || item.kind !== 'tool_call') throw new Error('Expected Tool Call timeline item.');
  const data = item.payload.toolCall.result?.data;
  if (!isRecord(data)) throw new Error('Expected Tool Call result data.');
  return data;
}

async function createFixture(relativePath: string) {
  const root = await createTemporaryRoot();
  const absolutePath = join(root, ...relativePath.split('/'));
  await mkdir(join(absolutePath, '..'), { recursive: true });
  await writeFile(absolutePath, 'fixture');
  return {
    root,
    locator: {
      kind: 'workspace-file' as const,
      path: relativePath,
    },
  };
}

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'neko-agent-display-'));
  temporaryRoots.push(root);
  return root;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
