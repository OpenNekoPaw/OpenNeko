import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import {
  createBuiltInNodeCardPolicyRegistry,
  defaultCardPolicy,
  evaluateActionCondition,
  getNodeCardPolicy,
  getStableSafeVariantUrl,
  mediaCardPolicy,
  shotCardPolicy,
  textCardPolicy,
} from './index';

describe('node card policies', () => {
  it('builds media preview descriptors without runtime URLs', () => {
    const node = createMediaNode('media-1', {
      assetPath: 'assets/ref.png',
      thumbnailPath: 'assets/ref-thumb.png',
      mediaType: 'image',
    });

    const source = mediaCardPolicy.resolvePreviewSource(node);

    expect(source).toMatchObject({
      renderForm: 'asset-thumbnail',
      source: {
        id: 'node-card:media-1:media',
        role: 'image',
        asset: {
          kind: 'asset-identity',
          path: 'assets/ref-thumb.png',
          mediaType: 'image',
        },
        variants: [{ id: 'stable-source', role: 'image', sourcePath: 'assets/ref-thumb.png' }],
      },
    });
    expect(JSON.stringify(source)).not.toContain('runtimeUrl');
  });

  it('uses document entry refs as stable media titles while rendering from runtime paths', () => {
    const node = createMediaNode('media-doc-entry', {
      assetPath: '',
      documentResourceRef: {
        kind: 'document-entry',
        source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        entryPath: 'image/page-1.jpg',
        versionPolicy: 'versioned-export',
      },
      runtimeAssetPath:
        'https://file+.vscode-resource.vscode-cdn.net/workspace/.neko/.cache/resources/documents/doc_demo/5289df737df57326fcdd22597afb1fac.jpg',
      mediaType: 'image',
    });

    const source = mediaCardPolicy.resolvePreviewSource(node);

    expect(mediaCardPolicy.resolveTitle(node)).toBe('page-1.jpg');
    expect(source).toMatchObject({
      renderForm: 'asset-thumbnail',
      source: {
        asset: undefined,
        variants: [
          {
            id: 'stable-source',
            role: 'image',
            sourcePath:
              'https://file+.vscode-resource.vscode-cdn.net/workspace/.neko/.cache/resources/documents/doc_demo/5289df737df57326fcdd22597afb1fac.jpg',
          },
        ],
        metadata: { documentResourceRef: expect.objectContaining({ kind: 'document-entry' }) },
      },
    });
    if (source.renderForm !== 'asset-thumbnail') {
      throw new Error('Expected asset thumbnail preview');
    }
    expect(JSON.stringify(source.source.variants ?? [])).not.toContain('cachePath');
  });

  it('prefers a creator-facing media title over its stable resource identity', () => {
    const node = createMediaNode('media-authored-title', {
      assetPath: '',
      mediaType: 'image',
      title: 'Station concept from background host',
      resourceRef: {
        id: 'generated-output:station',
        scope: 'project',
        provider: 'generated-output',
        kind: 'generated',
        source: {
          kind: 'generated-asset',
          generatedAssetId: 'station',
          projectRelativePath: 'neko/generated/image/station.svg',
        },
        locator: { kind: 'generated-asset', assetId: 'station' },
        fingerprint: { strategy: 'hash', value: 'sha256:station' },
      },
    });

    expect(mediaCardPolicy.resolveTitle(node)).toBe('Station concept from background host');
  });

  it('shows document cache expiry without treating cache paths as previews', () => {
    const node = createMediaNode('media-doc-missing', {
      assetPath: '',
      documentResourceRef: {
        kind: 'document-entry',
        source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        entryPath: 'image/page-1.jpg',
        versionPolicy: 'versioned-export',
      },
      documentResourceStatus: {
        state: 'unavailable',
        reason: 'cache-missing',
        message: 'Document cache expired. Reopen the source document to regenerate the preview.',
      },
      mediaType: 'image',
    });

    const source = mediaCardPolicy.resolvePreviewSource(node);

    expect(source).toMatchObject({
      renderForm: 'asset-thumbnail',
      source: {
        asset: undefined,
        variants: undefined,
      },
    });
    expect(mediaCardPolicy.resolveSubtitle?.(node)).toBe(
      'Document cache expired. Reopen the source document to regenerate the preview.',
    );
    expect(mediaCardPolicy.resolveBadges?.(node)).toContainEqual({
      label: 'Cache',
      tone: 'warning',
    });
  });

  it('does not use document cache paths as preview descriptors without runtime authorization', () => {
    const node = createMediaNode('media-doc-entry-no-runtime', {
      assetPath: '',
      documentResourceRef: {
        kind: 'document-entry',
        source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        entryPath: 'image/page-1.jpg',
        versionPolicy: 'versioned-export',
      },
      mediaType: 'image',
    });

    const source = mediaCardPolicy.resolvePreviewSource(node);

    expect(source).toMatchObject({
      renderForm: 'asset-thumbnail',
      source: {
        asset: undefined,
        variants: undefined,
      },
    });
    if (source.renderForm !== 'asset-thumbnail') {
      throw new Error('Expected asset thumbnail preview');
    }
    expect(JSON.stringify(source.source.asset) ?? '').not.toContain(
      '/workspace/.neko/.cache/resources/documents/doc_demo',
    );
    expect(JSON.stringify(source.source.variants) ?? '').not.toContain(
      '/workspace/.neko/.cache/resources/documents/doc_demo',
    );
  });

  it('maps video media to media-poster and audio to waveform', () => {
    expect(
      mediaCardPolicy.resolvePreviewSource(
        createMediaNode('video-1', { assetPath: 'clip.mp4', mediaType: 'video' }),
      ).renderForm,
    ).toBe('media-poster');
    expect(
      mediaCardPolicy.resolvePreviewSource(
        createMediaNode('audio-1', { assetPath: 'voice.wav', mediaType: 'audio' }),
      ).renderForm,
    ).toBe('waveform');
  });

  it('keeps video source paths for thumbnail resolution without using runtime video URLs as posters', () => {
    const node = createMediaNode('video-runtime', {
      assetPath: 'cases/test.mp4',
      runtimeAssetPath:
        'https://file+.vscode-resource.vscode-cdn.net/Users/feng/Git/neko-test/cases/test.mp4',
      mediaType: 'video',
    });

    const source = mediaCardPolicy.resolvePreviewSource(node);

    expect(source.renderForm).toBe('media-poster');
    if (source.renderForm !== 'media-poster') {
      throw new Error('expected media poster preview');
    }
    expect(source.source.asset).toMatchObject({
      kind: 'asset-identity',
      path: 'cases/test.mp4',
      mediaType: 'video',
    });
    expect(JSON.stringify(source.source.variants ?? [])).not.toContain('runtimeAssetPath');
    expect(JSON.stringify(source.source.variants ?? [])).not.toContain('test.mp4');
  });

  it('represents shot inline preview as role-matched safe variant', () => {
    const node = createShotNode({
      id: 'shot-1',
      data: {
        shotNumber: 7,
        visualDescription: 'A bright doorway',
        generationStatus: 'done',
        generationHistory: [
          {
            id: 'candidate-1',
            dataUrl: 'data:image/png;base64,shot',
            selected: true,
          },
        ],
      },
    });

    const source = shotCardPolicy.resolvePreviewSource(node);

    expect(source.renderForm).toBe('asset-thumbnail');
    if (source.renderForm !== 'asset-thumbnail') {
      throw new Error('expected asset preview');
    }
    expect(source.source.role).toBe('generation-candidate');
    expect(source.source.variants).toEqual([
      {
        id: 'candidate-1',
        role: 'generation-candidate',
        sourcePath: 'data:image/png;base64,shot',
        selected: true,
      },
    ]);
    expect(getStableSafeVariantUrl(source.source)).toBe('data:image/png;base64,shot');
  });

  it('uses a shot reference image as the inline preview before generation', () => {
    const node = createShotNode({
      id: 'shot-reference',
      data: {
        shotNumber: 8,
        visualDescription: 'Imported panel',
        referenceImagePath: 'data:image/png;base64,reference',
      },
    });

    const source = shotCardPolicy.resolvePreviewSource(node);

    expect(source.renderForm).toBe('asset-thumbnail');
    if (source.renderForm !== 'asset-thumbnail') {
      throw new Error('expected asset preview');
    }
    expect(source.source.role).toBe('image');
    expect(source.source.variants).toEqual([
      {
        id: 'reference-image',
        role: 'image',
        sourcePath: 'data:image/png;base64,reference',
        selected: true,
      },
    ]);
    expect(getStableSafeVariantUrl(source.source)).toBe('data:image/png;base64,reference');
  });

  it('resolves imported document reference images through preview metadata', () => {
    const resourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-1.jpg',
      versionPolicy: 'read-only-source' as const,
    };
    const runtimeReferenceImagePath =
      'https://file+.vscode-resource.vscode-cdn.net/Users/feng/Library/Application%20Support/Code/User/globalStorage/page-1.jpg';
    const node = createShotNode({
      id: 'shot-document-reference',
      data: {
        shotNumber: 9,
        visualDescription: 'Imported document panel',
        referenceImagePath: runtimeReferenceImagePath,
        referenceImageResourceRef: resourceRef,
      },
    });

    const source = shotCardPolicy.resolvePreviewSource(node);

    expect(source.renderForm).toBe('asset-thumbnail');
    if (source.renderForm !== 'asset-thumbnail') {
      throw new Error('expected asset preview');
    }
    expect(source.source.role).toBe('image');
    expect(source.source.asset).toBeUndefined();
    expect(source.source.metadata).toEqual({ documentResourceRef: resourceRef });
    expect(source.source.variants).toBeUndefined();
    expect(JSON.stringify(source.source.asset) ?? '').not.toContain('globalStorage/page-1.jpg');
    expect(JSON.stringify(source.source.variants) ?? '').not.toContain('globalStorage/page-1.jpg');
  });

  it('adds reference summary badges for shot references and diagnostics', () => {
    const node = createShotNode({
      id: 'shot-reference-summary',
      data: {
        generationStatus: 'idle',
        referenceRefs: ['gallery-1'],
        generatedAsset: {
          id: 'asset-generated-1',
          type: 'generated-image',
          path: '${PROJECT}/generated/asset-generated-1.png',
          mimeType: 'image/png',
          generatedAt: '2026-06-09T00:00:00.000Z',
          width: 1024,
          height: 576,
          ratio: '16:9',
        },
        runtimeReferenceImagePath: 'vscode-resource://runtime/panel.png',
      },
    });

    expect(shotCardPolicy.resolveBadges?.(node)).toEqual(
      expect.arrayContaining([
        { label: 'Idle', tone: 'neutral' },
        { label: 'Refs 2', tone: 'error' },
      ]),
    );
  });

  it('adds reference summary badges for gallery and generated asset nodes', () => {
    const registry = createBuiltInNodeCardPolicyRegistry();
    const gallery = {
      id: 'gallery-1',
      type: 'gallery',
      position: { x: 0, y: 0 },
      size: { width: 180, height: 120 },
      zIndex: 1,
      container: {
        policy: 'gallery',
        childIds: ['front'],
        childPlacements: {
          front: {
            childId: 'front',
            metadata: { label: 'Front' },
          },
        },
      },
      data: {
        preset: 'custom',
        rows: 1,
        cols: 1,
      },
    } as CanvasNode;
    const generated = {
      id: 'asset-1',
      type: 'generated-asset',
      position: { x: 0, y: 0 },
      size: { width: 180, height: 120 },
      zIndex: 1,
      data: { assetId: 'asset-generated-1' },
    } as CanvasNode;

    expect(getNodeCardPolicy(registry, gallery).resolveBadges?.(gallery)).toEqual([
      { label: 'Refs 1', tone: 'info' },
    ]);
    expect(getNodeCardPolicy(registry, generated).resolveBadges?.(generated)).toEqual([
      { label: 'Refs 1', tone: 'info' },
    ]);
  });

  it('uses a materialized shot reference image as a safe runtime variant', () => {
    const resourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-1.jpg',
      versionPolicy: 'read-only-source' as const,
    };
    const runtimeReferenceImagePath =
      'https://file+.vscode-resource.vscode-cdn.net/Users/feng/Library/Application%20Support/Code/User/globalStorage/page-1.jpg';
    const node = createShotNode({
      id: 'shot-runtime-reference',
      data: {
        shotNumber: 10,
        visualDescription: 'Imported document panel',
        referenceImagePath: runtimeReferenceImagePath,
        referenceImageResourceRef: resourceRef,
        runtimeReferenceImagePath,
      },
    });

    const source = shotCardPolicy.resolvePreviewSource(node);

    expect(source.renderForm).toBe('asset-thumbnail');
    if (source.renderForm !== 'asset-thumbnail') {
      throw new Error('expected asset preview');
    }
    expect(source.source.asset).toBeUndefined();
    expect(source.source.metadata).toEqual({ documentResourceRef: resourceRef });
    expect(source.source.variants).toEqual([
      {
        id: 'reference-image',
        role: 'image',
        sourcePath: runtimeReferenceImagePath,
        selected: true,
      },
    ]);
    expect(getStableSafeVariantUrl(source.source)).toBe(runtimeReferenceImagePath);
  });

  it('builds text card previews from bounded excerpts', () => {
    const node = createTextNode('text-1', 'A compact note for the scene');

    expect(textCardPolicy.resolvePreviewSource(node)).toEqual({
      renderForm: 'text',
      textExcerpt: 'A compact note for the scene',
    });
    expect(textCardPolicy.resolveTitle(node)).toBe('A compact note for the scene');
  });

  it('uses default policy for unknown or unregistered node types', () => {
    const registry = createBuiltInNodeCardPolicyRegistry();
    const node = {
      id: 'storyboard-1',
      type: 'storyboard',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 80 },
      zIndex: 1,
      data: { title: 'Legacy board' },
    } as CanvasNode;

    expect(getNodeCardPolicy(registry, node)).toBe(defaultCardPolicy);
    expect(defaultCardPolicy.resolvePreviewSource(node).renderForm).toBe('icon');
  });
});

describe('action condition evaluator', () => {
  it('evaluates card and container scopes', () => {
    const idle = createShotNode({
      id: 'idle',
      data: { generationStatus: 'idle', generationHistory: [] },
    });
    const generating = createShotNode({
      id: 'generating',
      data: { generationStatus: 'generating', generationHistory: [] },
    });

    expect(
      evaluateActionCondition('has-selection', {
        node: idle,
        selection: { nodeIds: ['idle'] },
      }),
    ).toBe(true);
    expect(
      evaluateActionCondition('not-generating', {
        node: idle,
        childNodes: [idle, generating],
        selection: { nodeIds: [] },
      }),
    ).toBe(false);
    expect(
      evaluateActionCondition('has-asset', {
        node: createMediaNode('media-1', { assetPath: 'assets/ref.png' }),
        selection: { nodeIds: [] },
      }),
    ).toBe(true);
    expect(
      evaluateActionCondition('has-asset', {
        node: createMediaNode('media-2', {
          assetPath: '',
          runtimeAssetPath:
            'https://file+.vscode-resource.vscode-cdn.net/workspace/.neko/.cache/resources/documents/doc_demo/5289df737df57326fcdd22597afb1fac.jpg',
        }),
        selection: { nodeIds: [] },
      }),
    ).toBe(true);
  });

  it('uses resolved preview source for has-preview', () => {
    const node = createShotNode({
      id: 'shot-1',
      data: {
        generationHistory: [
          { id: 'candidate-1', dataUrl: 'data:image/png;base64,x', selected: true },
        ],
      },
    });
    const previewSource = shotCardPolicy.resolvePreviewSource(node);

    expect(
      evaluateActionCondition('has-preview', {
        node,
        previewSource,
        selection: { nodeIds: [] },
      }),
    ).toBe(true);
  });
});

function createMediaNode(
  id: string,
  data: Partial<Extract<CanvasNode, { type: 'media' }>['data']>,
): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    zIndex: 1,
    data: {
      assetPath: '',
      ...data,
    },
  } as CanvasNode;
}

function createShotNode(input: { id: string; data?: Record<string, unknown> }): CanvasNode {
  return {
    id: input.id,
    type: 'shot',
    position: { x: 0, y: 0 },
    size: { width: 220, height: 200 },
    zIndex: 1,
    data: {
      shotNumber: 1,
      duration: 3,
      visualDescription: '',
      characters: [],
      shotScale: 'MS',
      characterAction: '',
      emotion: [],
      sceneTags: [],
      generationStatus: 'idle',
      generationHistory: [],
      ...input.data,
    },
  } as CanvasNode;
}

function createTextNode(id: string, content: string): CanvasNode {
  return {
    id,
    type: 'text',
    position: { x: 0, y: 0 },
    size: { width: 160, height: 100 },
    zIndex: 1,
    data: { content },
  } as CanvasNode;
}
