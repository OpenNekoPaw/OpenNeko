import { describe, expect, it } from 'vitest';
import {
  PreviewContractError,
  assertNoForbiddenTransportValue,
  assertPreviewRuntimeIdentity,
  createSourceModelStaging,
  detectPreviewContentKind,
  getPreviewMediaType,
  getEpubResourceMediaType,
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
  viewInstanceId: 'view-instance-1',
  documentId: 'document-1',
  sessionId: 'session-1',
  rendererSessionId: 'endpoint-1',
};

describe('Preview Host runtime contract', () => {
  it('parses the exact loading projection without a synthetic descriptor', () => {
    expect(
      parsePreviewProjection({ identity, presentation: 'temporary', status: 'loading' }),
    ).toEqual({ identity, presentation: 'temporary', status: 'loading' });
    expect(() =>
      parsePreviewProjection({
        identity,
        presentation: 'temporary',
        status: 'loading',
        descriptor: {},
      }),
    ).toThrow('unsupported fields');
  });

  it('classifies screenplay source as package-owned text preview content', () => {
    expect(detectPreviewContentKind('scripts/episode-1.fountain')).toBe('text');
    expect(getPreviewMediaType('scripts/episode-1.fountain')).toBe('text/plain');
  });

  it('owns EPUB entry MIME resolution without treating the archive as one binary payload', () => {
    expect(getEpubResourceMediaType('META-INF/container.xml')).toBe('application/xml');
    expect(getEpubResourceMediaType('OPS/package.opf')).toBe('application/oebps-package+xml');
    expect(getEpubResourceMediaType('OPS/toc.ncx')).toBe('application/x-dtbncx+xml');
    expect(getEpubResourceMediaType('OPS/chapter.xhtml')).toBe('application/xhtml+xml');
    expect(getEpubResourceMediaType('OPS/style.css')).toBe('text/css');
    expect(getEpubResourceMediaType('OPS/cover.avif')).toBe('image/avif');
    expect(getEpubResourceMediaType('OPS/font.woff2')).toBe('font/woff2');
    expect(getEpubResourceMediaType('OPS/audio.mp3')).toBe('audio/mpeg');
    expect(getEpubResourceMediaType('OPS/data.bin')).toBe('application/octet-stream');
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
        identity,
        presentation: 'temporary',
        status: 'ready',
        descriptor: {
          descriptorId: 'descriptor-1',
          sourceFingerprint: 'content-2',
          contentLocator: { kind: 'workspace-file', path: 'models/cat.glb' },
          url: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
          contentKind: 'model',
          mediaType: 'model/gltf-binary',
          displayName: 'cat.glb',
          byteLength: 42,
        },
      }),
    ).toMatchObject({ status: 'ready', descriptor: { contentKind: 'model' } });
    expect(
      parsePreviewRuntimeRequest({
        requestId: 'request-1',
        route: 'snapshot.get',
        identity,
      }),
    ).toMatchObject({ route: 'snapshot.get', identity });
  });

  it('rejects unknown fields, routes and unsupported viewer kinds', () => {
    expect(() =>
      parsePreviewRuntimeRequest({
        requestId: 'request-1',
        route: 'snapshot.get',
        identity,
        removedTechnicalField: true,
      }),
    ).toThrow(PreviewContractError);
    expect(() =>
      parsePreviewRuntimeRequest({
        requestId: 'request-1',
        route: 'file.open',
        identity,
      }),
    ).toThrow('route is invalid');
    expect(() =>
      parsePreviewMediaDescriptor({
        descriptorId: 'descriptor-1',
        sourceFingerprint: 'content-2',
        contentLocator: { kind: 'workspace-file', path: 'scenes/scene.nkc' },
        url: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
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

  it('parses exact resource-set URLs and rejects private or filesystem schemes', () => {
    expect(
      parsePreviewMediaDescriptor({
        descriptorId: 'descriptor-1',
        sourceFingerprint: 'content-2',
        contentLocator: { kind: 'workspace-file', path: 'models/cat.gltf' },
        url: 'openneko://resource/0123456789abcdefghijklmnopqrstuv/cat.gltf',
        resourceUris: {
          'cat.gltf': 'openneko://resource/0123456789abcdefghijklmnopqrstuv/cat.gltf',
          'cat.bin': 'openneko://resource/0123456789abcdefghijklmnopqrstuv/cat.bin',
        },
        contentKind: 'model',
        mediaType: 'model/gltf+json',
        displayName: 'cat.gltf',
        byteLength: 42,
      }),
    ).toMatchObject({
      resourceUris: {
        'cat.bin': 'openneko://resource/0123456789abcdefghijklmnopqrstuv/cat.bin',
      },
    });
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
