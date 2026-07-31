import { describe, expect, it } from 'vitest';
import {
  PREVIEW_HOST_RUNTIME_VERSION,
  PreviewContractError,
  assertNoForbiddenTransportValue,
  assertPreviewRuntimeIdentity,
  createSourceModelStaging,
  detectPreviewContentKind,
  getPreviewMediaType,
  parsePreviewMediaDescriptor,
  parsePreviewMediaRange,
  parsePreviewProjection,
  parsePreviewRuntimeRequest,
  type PreviewRuntimeIdentity,
} from './index';

const identity: PreviewRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'preview-1',
  viewEpoch: 1,
  documentId: 'document-1',
  sessionId: 'session-1',
  endpointEpoch: 'endpoint-1',
  revision: 2,
};

describe('Preview Host runtime contract', () => {
  it('classifies screenplay source as package-owned text preview content', () => {
    expect(detectPreviewContentKind('scripts/episode-1.fountain')).toBe('text');
    expect(getPreviewMediaType('scripts/episode-1.fountain')).toBe('text/plain');
  });

  it('creates the shared source-model staging used by VS Code and Desktop hosts', () => {
    const source = { kind: 'workspace-file' as const, path: 'models/asset-1.glb' };

    expect(
      createSourceModelStaging('session-1', {
        kind: 'source-model',
        source,
        fingerprint: 'revision-1',
        format: 'glb',
      }),
    ).toMatchObject({
      sessionId: 'session-1',
      subject: { kind: 'source-model', source },
      selectedPurposes: ['appearance', 'camera'],
    });
  });

  it('parses a path-free ready projection and runtime request', () => {
    expect(
      parsePreviewProjection({
        schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
        identity,
        presentation: 'temporary',
        status: 'ready',
        descriptor: {
          descriptorId: 'descriptor-1',
          revision: 'content-2',
          contentLocator: { kind: 'workspace-file', path: 'models/cat.glb' },
          contentKind: 'model',
          mediaType: 'model/gltf-binary',
          displayName: 'cat.glb',
          byteLength: 42,
        },
      }),
    ).toMatchObject({ status: 'ready', descriptor: { contentKind: 'model' } });
    expect(
      parsePreviewRuntimeRequest({
        schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
        requestId: 'request-1',
        route: 'snapshot.get',
        identity,
      }),
    ).toMatchObject({ route: 'snapshot.get', identity });
  });

  it('rejects unknown versions, routes and unsupported viewer kinds', () => {
    expect(() =>
      parsePreviewRuntimeRequest({
        schemaVersion: 99,
        requestId: 'request-1',
        route: 'snapshot.get',
        identity,
      }),
    ).toThrow(PreviewContractError);
    expect(() =>
      parsePreviewRuntimeRequest({
        schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
        requestId: 'request-1',
        route: 'file.open',
        identity,
      }),
    ).toThrow('route is invalid');
    expect(() =>
      parsePreviewMediaDescriptor({
        descriptorId: 'descriptor-1',
        revision: 'content-2',
        contentLocator: { kind: 'workspace-file', path: 'scenes/scene.nkc' },
        contentKind: 'canvas',
        mediaType: 'application/json',
        displayName: 'scene.nkc',
        byteLength: 42,
      }),
    ).toThrow('kind is unsupported');
  });

  it('rejects stale owners before effects execute', () => {
    expect(() =>
      assertPreviewRuntimeIdentity(identity, {
        ...identity,
        windowId: 'window-2',
      }),
    ).toThrowError(expect.objectContaining({ code: 'preview-stale-identity' }));
  });

  it('parses closed and open-ended byte ranges', () => {
    expect(parsePreviewMediaRange({ start: 10, endInclusive: 19 })).toEqual({
      start: 10,
      endInclusive: 19,
    });
    expect(parsePreviewMediaRange({ start: 10 })).toEqual({ start: 10 });
    expect(() => parsePreviewMediaRange({ start: 10, endInclusive: 9 })).toThrow('cannot precede');
  });

  it('rejects forbidden path, URL, cache and token fields', () => {
    for (const value of [
      { descriptorId: '/Users/private/cat.glb' },
      { descriptorId: 'file:///private/cat.glb' },
      { descriptorId: 'http://localhost:9000/file' },
      { resourceUrl: 'neko-media://descriptor-1' },
      { clientToken: 'secret' },
      { nested: { cachePath: '/tmp/cache' } },
    ]) {
      expect(() => assertNoForbiddenTransportValue(value)).toThrow(
        /forbidden path, URL or token|forbidden field/u,
      );
    }
  });

  it('classifies every package-owned viewer format without treating Canvas as Preview', () => {
    expect(detectPreviewContentKind('test_model.html')).toBe('text');
    expect(detectPreviewContentKind('candidates.json')).toBe('text');
    expect(detectPreviewContentKind('test.glb')).toBe('model');
    expect(detectPreviewContentKind('Untitled.nkc')).toBeUndefined();
    expect(getPreviewMediaType('test.glb')).toBe('model/gltf-binary');
    expect(getPreviewMediaType('test_model.html')).toBe('text/html');
  });
});
