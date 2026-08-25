import { describe, expect, it } from 'vitest';
import {
  parseAuthorizedPreviewSessionIdentity,
  parseAuthorizedPreviewSessionProjection,
} from './authorized-session';

describe('Authorized Preview session contract', () => {
  it('accepts an exact Asset Center-owned descriptor without Project identity or a path', () => {
    const projection = parseAuthorizedPreviewSessionProjection({
      identity: identity(),
      status: 'ready',
      descriptor: descriptor(),
    });
    expect(projection).toMatchObject({
      identity: {
        owner: { kind: 'asset-center', assetCenterSessionId: 'asset-center:window-1' },
      },
      status: 'ready',
    });
    expect(projection.identity).not.toHaveProperty('projectId');
    expect(projection.identity).not.toHaveProperty('workspaceId');
    if (projection.status !== 'ready') throw new Error('Expected a ready Preview projection.');
    expect(projection.descriptor).not.toHaveProperty('absolutePath');
  });

  it('rejects mixed owner fields and raw path descriptors', () => {
    expect(() =>
      parseAuthorizedPreviewSessionProjection({
        identity: { ...identity(), projectId: 'project-1' },
        status: 'ready',
        descriptor: descriptor(),
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAuthorizedPreviewSessionProjection({
        identity: { ...identity(), unexpectedField: 1 },
        status: 'ready',
        descriptor: descriptor(),
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAuthorizedPreviewSessionProjection({
        identity: identity(),
        status: 'ready',
        descriptor: { ...descriptor(), absolutePath: '/private/shot.png' },
      }),
    ).toThrow();
    expect(
      parseAuthorizedPreviewSessionProjection({
        identity: identity(),
        status: 'ready',
        descriptor: descriptor(),
      }),
    ).toMatchObject({ status: 'ready' });
  });

  it('accepts exact Agent and Canvas owners', () => {
    expect(
      parseAuthorizedPreviewSessionIdentity({
        previewSessionId: 'preview:agent:1',
        windowId: 'window-1',
        owner: {
          kind: 'assistant-scratch',
          assistantSpaceId: 'assistant-space-1',
          conversationId: 'conversation-1',
          scratchArtifactId: 'artifact-1',
        },
      }).owner,
    ).toEqual({
      kind: 'assistant-scratch',
      assistantSpaceId: 'assistant-space-1',
      conversationId: 'conversation-1',
      scratchArtifactId: 'artifact-1',
    });
    expect(
      parseAuthorizedPreviewSessionIdentity({
        previewSessionId: 'preview:canvas:1',
        windowId: 'window-1',
        owner: canvasOwner(),
      }).owner,
    ).toEqual(canvasOwner());
  });

  it('rejects inferred or incomplete Canvas ownership without affecting valid siblings', () => {
    for (const owner of [
      { ...canvasOwner(), outputId: undefined },
      { ...canvasOwner(), activeCanvas: true },
      { ...canvasOwner(), recentWorkspaceId: 'workspace-recent' },
    ]) {
      expect(() =>
        parseAuthorizedPreviewSessionIdentity({
          previewSessionId: 'preview:canvas:invalid',
          windowId: 'window-1',
          owner,
        }),
      ).toThrow();
    }
    expect(
      parseAuthorizedPreviewSessionProjection({
        identity: identity(),
        status: 'ready',
        descriptor: descriptor(),
      }),
    ).toMatchObject({ status: 'ready' });
  });

  it('keeps one expired resource fail-local while a sibling descriptor remains valid', () => {
    expect(
      parseAuthorizedPreviewSessionProjection({
        identity: {
          previewSessionId: 'preview:canvas:expired',
          windowId: 'window-1',
          owner: canvasOwner(),
        },
        status: 'unavailable',
        diagnostic: {
          code: 'preview-source-unavailable',
          message: 'The authorized resource lease expired.',
        },
      }),
    ).toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'preview-source-unavailable' },
    });
    expect(
      parseAuthorizedPreviewSessionProjection({
        identity: identity(),
        status: 'ready',
        descriptor: descriptor(),
      }),
    ).toMatchObject({ status: 'ready' });
  });
});

function canvasOwner() {
  return {
    kind: 'canvas' as const,
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    documentId: 'neko/boards/workspace.nkc',
    canvasSessionId: 'canvas-session-1',
    nodeId: 'node-1',
    outputId: 'output-1',
  };
}

function identity() {
  return {
    previewSessionId: 'preview:asset-center:1',
    windowId: 'window-1',
    owner: {
      kind: 'asset-center' as const,
      assetCenterSessionId: 'asset-center:window-1',
      resourceOwner: 'media-library' as const,
      itemId: 'media-library:item-1',
    },
  };
}

function descriptor() {
  return {
    descriptorId: 'descriptor-1',
    sourceFingerprint: 'fingerprint-1',
    contentLocator: { file: { authority: 'workspace' as const, path: 'shots/shot.png' } },
    url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    contentKind: 'image' as const,
    mediaType: 'image/png',
    displayName: 'shot.png',
    byteLength: 42,
  };
}
