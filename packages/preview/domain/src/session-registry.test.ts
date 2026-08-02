import { describe, expect, it } from 'vitest';

import {
  PREVIEW_HOST_RUNTIME_VERSION,
  PreviewSessionRegistry,
  parsePreviewProjection,
  type PreviewRuntimeIdentity,
} from './index';

describe('PreviewSessionRegistry', () => {
  it('owns presentation transitions, revision CAS and same-slot replacement', () => {
    const registry = new PreviewSessionRegistry();
    const first = readyProjection(identity('session-1'), 'temporary');
    expect(registry.register(first)).toEqual([]);

    const transition = registry.planPresentation('session-1', 'pinned', 'preview:pinned');
    expect(registry.commit(transition).projection).toMatchObject({
      identity: { viewId: 'preview:pinned', revision: 1 },
      presentation: 'pinned',
    });
    expect(() => registry.commit(transition)).toThrow('stale');

    const second = readyProjection(identity('session-2'), 'temporary');
    expect(registry.register(second)).toEqual([]);
    const third = readyProjection(identity('session-3'), 'temporary');
    expect(registry.register(third)).toEqual(['session-2']);
    expect(() => registry.read('session-2')).toThrow('unavailable');
  });

  it('keeps transient and durable identities window-scoped during cleanup', () => {
    const registry = new PreviewSessionRegistry();
    registry.register(readyProjection(identity('session-1'), 'side'));
    registry.registerTransient('window-1', 'hover-1');
    expect(() => registry.releaseTransient('window-2', 'hover-1')).toThrow('unavailable');
    expect(registry.detachWindow('window-1')).toEqual(['session-1', 'hover-1']);
  });
});

function identity(sessionId: string): PreviewRuntimeIdentity {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: `preview:${sessionId}`,
    viewEpoch: 1,
    documentId: `${sessionId}.png`,
    sessionId,
    endpointEpoch: 'endpoint-1',
    revision: 0,
  };
}

function readyProjection(
  runtimeIdentity: PreviewRuntimeIdentity,
  presentation: 'temporary' | 'side',
) {
  return parsePreviewProjection({
    schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
    identity: runtimeIdentity,
    presentation,
    status: 'ready',
    descriptor: {
      descriptorId: `descriptor:${runtimeIdentity.sessionId}`,
      revision: 'fixture:1',
      contentLocator: { kind: 'workspace-file', path: runtimeIdentity.documentId },
      url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      contentKind: 'image',
      mediaType: 'image/png',
      displayName: runtimeIdentity.documentId,
      byteLength: 1,
    },
  });
}
