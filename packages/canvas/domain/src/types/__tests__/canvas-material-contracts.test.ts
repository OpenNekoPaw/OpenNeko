import { describe, expect, it } from 'vitest';
import {
  deriveCanvasMaterialOrigin,
  isCanvasGenerationEvidence,
  isCanvasMaterialActionDescriptor,
  isCanvasMaterialActionIntent,
  isCanvasMaterialAuthoringRequest,
  isCanvasMediaLibraryCopyRequest,
  validateCanvasMaterialNodePersistence,
  type CanvasGenerationEvidence,
  type CanvasMaterialActionDescriptor,
  type CanvasMaterialActionIntent,
  type CanvasMaterialAuthoringIdentity,
} from '../canvas-material-contracts';

const identity: CanvasMaterialAuthoringIdentity = {
  projectId: 'project-1',
  canvasId: 'boards/concept.nkc',
  canvasSessionId: 'canvas-session-1',
};

const generation: CanvasGenerationEvidence = {
  jobRef: { kind: 'generation', jobId: 'generation-job-1' },
  summary: {
    prompt: 'A quiet cyberpunk street in the rain.',
    model: 'fixture-image-model',
    generatedAt: '2026-07-30T12:00:00.000Z',
    aspectRatio: '16:9',
  },
};

const generatedLocator = {
  file: { authority: 'workspace', path: 'neko/generated/image/output-1.png' },
} as const;

describe('Canvas material contracts', () => {
  it('derives origin from Generation evidence rather than the ContentLocator path', () => {
    expect(
      deriveCanvasMaterialOrigin({ file: { authority: 'workspace', path: 'media/reference.png' } }),
    ).toBe('referenced');
    expect(deriveCanvasMaterialOrigin(generatedLocator)).toBe('referenced');
    expect(deriveCanvasMaterialOrigin(generatedLocator, generation)).toBe('generated');
    expect(() =>
      deriveCanvasMaterialOrigin({
        file: { authority: 'workspace', path: '/Users/example/reference.png' },
      }),
    ).toThrow('valid ContentLocator');
  });

  it('requires a stable Generation Job ref and immutable summary', () => {
    expect(isCanvasGenerationEvidence(generation)).toBe(true);
    expect(
      isCanvasGenerationEvidence({
        ...generation,
        jobRef: { kind: 'canvas', jobId: 'generation-job-1' },
      }),
    ).toBe(false);
    expect(
      isCanvasGenerationEvidence({
        ...generation,
        summary: {},
      }),
    ).toBe(false);
  });

  it('validates the four explicit Host authoring entry families', () => {
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'direct-reference',
        identity,
        locator: { file: { authority: 'workspace', path: 'media/reference.png' } },
        mediaKind: 'image',
      }),
    ).toBe(true);
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'direct-reference',
        identity,
        locator: { file: { authority: 'workspace', path: 'neko/assets/Characters/reference.png' } },
        mediaKind: 'image',
      }),
    ).toBe(true);
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'external-import',
        identity,
        sourceToken: 'selection-1',
        sourceName: 'reference.png',
        mediaKind: 'image',
        conflictPolicy: 'rename',
      }),
    ).toBe(true);
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'global-library-link',
        identity,
        globalLibraryId: 'global-library-1',
      }),
    ).toBe(true);
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'global-library-copy',
        identity,
        globalLibraryId: 'global-library-1',
        entryId: 'entry-1',
        mediaKind: 'image',
        conflictPolicy: 'reject',
      }),
    ).toBe(true);
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'generated-output-commit',
        identity,
        locator: generatedLocator,
        generation,
        mediaKind: 'image',
        title: 'Generated concept',
      }),
    ).toBe(true);
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'derived-output-commit',
        identity,
        locator: { file: { authority: 'workspace', path: 'neko/derived/crop.png' } },
        mediaKind: 'image',
        title: 'crop.png',
        sourceNodeIds: ['source-node'],
      }),
    ).toBe(true);
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'derived-output-commit',
        identity,
        locator: generatedLocator,
        generation,
        mediaKind: 'image',
        title: 'AI variant',
        sourceNodeIds: ['source-node'],
      }),
    ).toBe(true);
  });

  it('rejects raw external paths while allowing canonical locators independent of provenance', () => {
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'external-import',
        identity,
        sourceToken: '/Users/example/reference.png',
        sourceName: 'reference.png',
        mediaKind: 'image',
        conflictPolicy: 'rename',
      }),
    ).toBe(false);
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'direct-reference',
        identity,
        locator: generatedLocator,
        mediaKind: 'image',
      }),
    ).toBe(true);
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'derived-output-commit',
        identity,
        locator: generatedLocator,
        mediaKind: 'image',
        title: 'Missing authority',
        sourceNodeIds: ['source-node'],
      }),
    ).toBe(true);
    expect(
      isCanvasMaterialAuthoringRequest({
        kind: 'derived-output-commit',
        identity,
        locator: { file: { authority: 'workspace', path: 'neko/derived/crop.png' } },
        generation,
        mediaKind: 'image',
        title: 'Conflicting evidence',
        sourceNodeIds: ['source-node'],
      }),
    ).toBe(true);
  });

  it('requires an explicit same-Entity replacement request with stale-binding evidence', () => {
    const request = {
      kind: 'entity-representation-replace',
      identity,
      nodeId: 'entity-node',
      expectedEntity: {
        entityId: 'character-1',
        bindingId: 'binding-portrait-original',
        role: 'portrait',
      },
      locator: { file: { authority: 'workspace', path: 'characters/portrait-replacement.png' } },
      mediaKind: 'image',
      title: 'portrait-replacement.png',
      entity: {
        entityId: 'character-1',
        bindingId: 'binding-portrait-replacement',
        role: 'portrait',
      },
    } as const;

    expect(isCanvasMaterialAuthoringRequest(request)).toBe(true);
    expect(
      isCanvasMaterialAuthoringRequest({
        ...request,
        entity: { ...request.entity, entityId: 'character-2' },
      }),
    ).toBe(false);
    expect(
      isCanvasMaterialAuthoringRequest({
        ...request,
        locator: generatedLocator,
      }),
    ).toBe(true);
  });

  it('validates owner-contributed action descriptors and instance-scoped intents', () => {
    const descriptor: CanvasMaterialActionDescriptor = {
      id: 'preview.open',
      ownerId: 'preview',
      label: 'Open preview',
      mediaKinds: ['image', 'video'],
      origins: ['referenced', 'generated'],
      selection: { minimum: 1, maximum: 1 },
      effect: 'read',
      executionPayload: {
        target: { kind: 'existing', viewId: 'cut-view-1' },
        choices: ['video', 1, true, null],
      },
    };
    const intent: CanvasMaterialActionIntent = {
      identity,
      actionId: descriptor.id,
      selectedNodeIds: ['media-1'],
      payload: {},
    };

    expect(isCanvasMaterialActionDescriptor(descriptor)).toBe(true);
    expect(
      isCanvasMaterialActionDescriptor({
        ...descriptor,
        executionPayload: { expected: Number.POSITIVE_INFINITY },
      }),
    ).toBe(false);
    expect(
      isCanvasMaterialActionDescriptor({
        ...descriptor,
        executionPayload: { target: new Date() },
      }),
    ).toBe(false);
    expect(
      isCanvasMaterialActionDescriptor({
        ...descriptor,
        executionPayload: undefined,
        unavailable: {
          code: 'cut-canvas-source-stale',
          message: 'The Canvas View is stale.',
        },
      }),
    ).toBe(true);
    expect(
      isCanvasMaterialActionDescriptor({
        ...descriptor,
        unavailable: { code: 'unknown-owner', message: 'Unknown diagnostic code.' },
      }),
    ).toBe(false);
    expect(isCanvasMaterialActionIntent(intent)).toBe(true);
    expect(isCanvasMaterialActionIntent({ ...intent, selectedNodeIds: [] })).toBe(false);
  });

  it('requires an explicit project-linked or global Media Library copy destination', () => {
    const source = { file: { authority: 'workspace', path: 'media/reference.png' } } as const;
    expect(
      isCanvasMediaLibraryCopyRequest({
        kind: 'copy-to-project-media-library',
        identity,
        source,
        libraryName: 'References',
        destinationDirectory: 'Characters/Hero',
        fileName: 'portrait.png',
        conflictPolicy: 'fail-if-exists',
      }),
    ).toBe(true);
    expect(
      isCanvasMediaLibraryCopyRequest({
        kind: 'copy-to-global-media-library',
        identity,
        source,
        globalLibraryId: 'media-library:local:References',
        destinationDirectory: 'Characters/Hero',
        fileName: 'portrait.png',
        conflictPolicy: 'replace',
      }),
    ).toBe(true);
    expect(
      isCanvasMediaLibraryCopyRequest({
        kind: 'saveCanvasMaterialToAssetLibrary',
        identity,
        source,
        destinationDirectory: '',
        fileName: 'portrait.png',
        conflictPolicy: 'replace',
      }),
    ).toBe(false);
    expect(
      isCanvasMediaLibraryCopyRequest({
        kind: 'copy-to-global-media-library',
        identity,
        source,
        globalLibraryId: 'media-library:local:References',
        destinationDirectory: '../outside',
        fileName: 'portrait.png',
        conflictPolicy: 'replace',
      }),
    ).toBe(false);
  });

  it('enforces referenced, generated, Entity and secret persistence invariants', () => {
    expect(
      validateCanvasMaterialNodePersistence('media', {
        assetPath: 'Books/story.epub/image/cover.jpg',
        contentLocator: {
          file: { authority: 'workspace', path: 'neko/assets/Books/story.epub' },
          selector: { kind: 'entry', path: 'image/cover.jpg' },
        },
      }),
    ).toEqual([]);
    expect(
      validateCanvasMaterialNodePersistence('media', {
        assetPath: 'media/reference.png',
        contentLocator: { file: { authority: 'workspace', path: 'media/reference.png' } },
        entityRepresentation: {
          entityId: 'character-1',
          bindingId: 'binding-1',
          role: 'portrait',
        },
      }),
    ).toEqual([]);
    expect(
      validateCanvasMaterialNodePersistence('media', {
        assetPath: generatedLocator.file.path,
        contentLocator: generatedLocator,
        generation,
      }),
    ).toEqual([]);

    expect(
      validateCanvasMaterialNodePersistence('media', {
        assetPath: 'media/reference.png',
        contentLocator: { file: { authority: 'workspace', path: 'media/reference.png' } },
        generation,
      }),
    ).toEqual([]);
    expect(
      validateCanvasMaterialNodePersistence('file', {
        path: generatedLocator.file.path,
        contentLocator: generatedLocator,
      }),
    ).toEqual([]);
    expect(
      validateCanvasMaterialNodePersistence('file', {
        path: generatedLocator.file.path,
        contentLocator: generatedLocator,
        generation: { ...generation, summary: {} },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'canvas-material-generation-evidence-required' }),
      ]),
    );
    expect(
      validateCanvasMaterialNodePersistence('media', {
        assetPath: 'media/reference.png',
        contentLocator: { file: { authority: 'workspace', path: 'media/reference.png' } },
        credentials: { accessToken: 'secret' },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'canvas-material-sensitive-value-forbidden' }),
      ]),
    );
  });
});
