import { describe, expect, it } from 'vitest';
import { parseAuthorizedPreviewSessionProjection } from './authorized-session';

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
        identity: { ...identity(), revision: 1 },
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
});

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
    contentLocator: { kind: 'workspace-file' as const, path: 'shots/shot.png' },
    url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    contentKind: 'image' as const,
    mediaType: 'image/png',
    displayName: 'shot.png',
    byteLength: 42,
  };
}
