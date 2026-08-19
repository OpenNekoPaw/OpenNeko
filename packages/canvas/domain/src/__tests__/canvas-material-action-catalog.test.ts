import { describe, expect, it } from 'vitest';
import {
  createCanvasGenerationNodeData,
  createEmptyCanvasData,
  type CanvasMaterialActionDescriptor,
  type CanvasNode,
} from '@neko/canvas-domain';
import {
  projectCanvasMaterialActionCatalog,
  resolveCanvasMaterialActionTargets,
} from '../canvas-material-action-catalog';
import { projectResolvedCanvasMaterialToCanvas } from '../canvas-content-authoring';

const previewImage: CanvasMaterialActionDescriptor = {
  id: 'preview:image',
  ownerId: 'preview',
  label: 'Preview',
  mediaKinds: ['image'],
  origins: ['referenced', 'generated'],
  selection: { minimum: 1, maximum: 1 },
  effect: 'read',
};

const regenerateImage: CanvasMaterialActionDescriptor = {
  id: 'generation:regenerate-image',
  ownerId: 'generation',
  label: 'Regenerate',
  mediaKinds: ['image'],
  origins: ['generated'],
  selection: { minimum: 1, maximum: 1 },
  effect: 'generate',
};

describe('Canvas material action catalog', () => {
  it('resolves the exact selected Generation media output as a material target', () => {
    const locator = {
      file: {
        authority: 'workspace' as const,
        path: 'neko/generated/video-output-1.mp4',
      },
    };
    const data = createCanvasGenerationNodeData('video');
    const node: CanvasNode = {
      id: 'video-generation',
      type: 'generation',
      position: { x: 0, y: 0 },
      size: { width: 240, height: 160 },
      zIndex: 0,
      data: {
        ...data,
        outputs: [
          {
            outputId: 'video-output-1',
            jobRef: { kind: 'generation', jobId: 'generation-job-1' },
            locator,
            kind: 'video',
            recipeInputFingerprint: 'recipe-fingerprint-1',
          },
        ],
        selectedOutputId: 'video-output-1',
      },
    };

    expect(resolveCanvasMaterialActionTargets([node], [node.id])).toEqual([
      {
        nodeId: node.id,
        mediaKind: 'video',
        origin: 'generated',
        locator,
      },
    ]);
  });

  it('does not invent a material target for an empty Generation node', () => {
    const node: CanvasNode = {
      id: 'empty-video-generation',
      type: 'generation',
      position: { x: 0, y: 0 },
      size: { width: 240, height: 160 },
      zIndex: 0,
      data: createCanvasGenerationNodeData('video'),
    };

    expect(resolveCanvasMaterialActionTargets([node], [node.id])).toEqual([]);
  });

  it('resolves the exact selected Prompt output as an immutable document target', () => {
    const locator = {
      file: {
        authority: 'workspace' as const,
        path: 'neko/generated/prompt-output-1.txt',
      },
    };
    const data = createCanvasGenerationNodeData('prompt');
    const node: CanvasNode = {
      id: 'prompt-generation',
      type: 'generation',
      position: { x: 0, y: 0 },
      size: { width: 240, height: 160 },
      zIndex: 0,
      data: {
        ...data,
        outputs: [
          {
            outputId: 'prompt-output-1',
            jobRef: { kind: 'generation', jobId: 'generation-job-1' },
            locator,
            kind: 'prompt',
            recipeInputFingerprint: 'recipe-fingerprint-1',
          },
        ],
        selectedOutputId: 'prompt-output-1',
      },
    };

    expect(resolveCanvasMaterialActionTargets([node], [node.id])).toEqual([
      {
        nodeId: node.id,
        mediaKind: 'document',
        origin: 'generated',
        locator,
      },
    ]);
  });

  it('uses canonical document semantics for a generic File without extension inference', () => {
    const node: CanvasNode = {
      id: 'generic-file',
      type: 'file',
      position: { x: 0, y: 0 },
      size: { width: 220, height: 150 },
      zIndex: 0,
      data: {
        path: 'references/looks-like-video.mp4',
        title: 'looks-like-video.mp4',
        contentLocator: {
          file: { authority: 'workspace', path: 'references/looks-like-video.mp4' },
        },
      },
    };

    expect(resolveCanvasMaterialActionTargets([node], [node.id])).toEqual([
      {
        nodeId: node.id,
        mediaKind: 'document',
        origin: 'referenced',
        locator: node.data.contentLocator,
      },
    ]);
  });

  it('projects owner actions from canonical kind and origin', () => {
    const referenced = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: 'media/reference.png' } },
        title: 'reference.png',
        mediaKind: 'image',
      },
      generateId: () => 'referenced-image',
    });
    const generated = projectResolvedCanvasMaterialToCanvas({
      canvas: referenced,
      material: {
        locator: { file: { authority: 'workspace', path: 'generated/image.png' } },
        title: 'image.png',
        mediaKind: 'image',
        generation: {
          jobRef: { kind: 'generation', jobId: 'generation-job' },
          summary: { prompt: 'A reference image', model: 'fixture-model' },
        },
      },
      generateId: () => 'generated-image',
    });

    const referencedTargets = resolveCanvasMaterialActionTargets(referenced.nodes, [
      'referenced-image',
    ]);
    const generatedTargets = resolveCanvasMaterialActionTargets(generated.nodes, [
      'generated-image',
    ]);

    expect(
      projectCanvasMaterialActionCatalog({
        descriptors: [previewImage, regenerateImage],
        targets: referencedTargets,
      }).map((descriptor) => descriptor.id),
    ).toEqual(['preview:image']);
    expect(
      projectCanvasMaterialActionCatalog({
        descriptors: [previewImage, regenerateImage],
        targets: generatedTargets,
      }).map((descriptor) => descriptor.id),
    ).toEqual(['preview:image', 'generation:regenerate-image']);
  });

  it('uses explicit File mediaKind rather than its extension', () => {
    const canvas = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: 'opaque/character.bin' } },
        title: 'character.bin',
        mediaKind: 'model',
      },
      generateId: () => 'model-node',
    });
    const inspectModel: CanvasMaterialActionDescriptor = {
      id: 'preview:model',
      ownerId: 'preview',
      label: 'Inspect model',
      mediaKinds: ['model'],
      origins: ['referenced'],
      selection: { minimum: 1, maximum: 1 },
      effect: 'read',
    };

    const targets = resolveCanvasMaterialActionTargets(canvas.nodes, ['model-node']);

    expect(targets[0]?.mediaKind).toBe('model');
    expect(
      projectCanvasMaterialActionCatalog({
        descriptors: [inspectModel],
        targets,
      }),
    ).toEqual([inspectModel]);
  });

  it.each([
    ['image', 'media'] as const,
    ['audio', 'media'] as const,
    ['video', 'media'] as const,
    ['document', 'file'] as const,
    ['model', 'file'] as const,
  ])('projects an owner action for explicit %s material identity', (mediaKind, nodeType) => {
    const canvas = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: `materials/${mediaKind}.source` } },
        title: `${mediaKind}.source`,
        mediaKind,
      },
      generateId: () => `${mediaKind}-node`,
    });
    const descriptor: CanvasMaterialActionDescriptor = {
      id: `inspect:${mediaKind}`,
      ownerId: 'preview',
      label: `Inspect ${mediaKind}`,
      mediaKinds: [mediaKind],
      origins: ['referenced'],
      selection: { minimum: 1, maximum: 1 },
      effect: 'read',
    };
    const targets = resolveCanvasMaterialActionTargets(canvas.nodes, [`${mediaKind}-node`]);

    expect(canvas.nodes[0]?.type).toBe(nodeType);
    expect(targets).toEqual([
      expect.objectContaining({
        nodeId: `${mediaKind}-node`,
        mediaKind,
        origin: 'referenced',
      }),
    ]);
    expect(projectCanvasMaterialActionCatalog({ descriptors: [descriptor], targets })).toEqual([
      descriptor,
    ]);
  });

  it('retains Entity representation identity while projecting locator-owned actions', () => {
    const entityRepresentation = {
      entityId: 'character-neko',
      bindingId: 'binding-neko-portrait',
      role: 'portrait',
    } as const;
    const canvas = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: 'neko/entities/neko/portrait.png' } },
        title: 'portrait.png',
        mediaKind: 'image',
        entity: entityRepresentation,
      },
      generateId: () => 'entity-representation',
    });
    const targets = resolveCanvasMaterialActionTargets(canvas.nodes, ['entity-representation']);

    expect(targets).toEqual([
      expect.objectContaining({
        nodeId: 'entity-representation',
        mediaKind: 'image',
        origin: 'referenced',
        entityRepresentation,
      }),
    ]);
    expect(
      projectCanvasMaterialActionCatalog({
        descriptors: [previewImage, regenerateImage],
        targets,
      }),
    ).toEqual([previewImage]);
  });

  it('does not project single-selection actions for a multi-selection', () => {
    let canvas = createEmptyCanvasData('Fixture');
    canvas = projectResolvedCanvasMaterialToCanvas({
      canvas,
      material: {
        locator: { file: { authority: 'workspace', path: 'media/first.png' } },
        title: 'first.png',
        mediaKind: 'image',
      },
      generateId: () => 'first',
    });
    canvas = projectResolvedCanvasMaterialToCanvas({
      canvas,
      material: {
        locator: { file: { authority: 'workspace', path: 'media/second.png' } },
        title: 'second.png',
        mediaKind: 'image',
      },
      generateId: () => 'second',
    });

    expect(
      projectCanvasMaterialActionCatalog({
        descriptors: [previewImage],
        targets: resolveCanvasMaterialActionTargets(canvas.nodes, ['first', 'second']),
      }),
    ).toEqual([]);
  });

  it('projects only descriptors valid for every target in a mixed selection', () => {
    let canvas = createEmptyCanvasData('Fixture');
    canvas = projectResolvedCanvasMaterialToCanvas({
      canvas,
      material: {
        locator: { file: { authority: 'workspace', path: 'media/frame.png' } },
        title: 'frame.png',
        mediaKind: 'image',
      },
      generateId: () => 'image',
    });
    canvas = projectResolvedCanvasMaterialToCanvas({
      canvas,
      material: {
        locator: { file: { authority: 'workspace', path: 'media/ambience.wav' } },
        title: 'ambience.wav',
        mediaKind: 'audio',
      },
      generateId: () => 'audio',
    });
    const inspectMixed: CanvasMaterialActionDescriptor = {
      id: 'preview:mixed',
      ownerId: 'preview',
      label: 'Preview selection',
      mediaKinds: ['image', 'audio'],
      origins: ['referenced'],
      selection: { minimum: 2, maximum: 2 },
      effect: 'read',
    };
    const imageOnly: CanvasMaterialActionDescriptor = {
      ...inspectMixed,
      id: 'preview:image-selection',
      mediaKinds: ['image'],
    };
    const targets = resolveCanvasMaterialActionTargets(canvas.nodes, ['image', 'audio']);

    expect(
      projectCanvasMaterialActionCatalog({
        descriptors: [inspectMixed, imageOnly],
        targets,
      }),
    ).toEqual([inspectMixed]);
  });

  it('fails visibly for stale node identities and duplicate owner action ids', () => {
    const canvas = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: 'media/reference.png' } },
        title: 'reference.png',
        mediaKind: 'image',
      },
      generateId: () => 'reference',
    });

    expect(() => resolveCanvasMaterialActionTargets(canvas.nodes, ['missing'])).toThrow(
      'unknown node',
    );
    expect(() =>
      projectCanvasMaterialActionCatalog({
        descriptors: [previewImage, { ...previewImage }],
        targets: resolveCanvasMaterialActionTargets(canvas.nodes, ['reference']),
      }),
    ).toThrow('Duplicate Canvas material action descriptor');
  });

  it('projects no actions for a degraded path-only material node', () => {
    const degraded: CanvasNode = {
      id: 'degraded-media',
      type: 'media',
      position: { x: 40, y: 60 },
      size: { width: 300, height: 180 },
      zIndex: 1,
      data: {
        assetPath: 'media/path-only.mp4',
        mediaType: 'video',
      },
    };

    expect(resolveCanvasMaterialActionTargets([degraded], [degraded.id])).toEqual([]);
  });

  it('resolves a mounted Media Library locator as a durable referenced target while rejecting unsafe values', () => {
    const mounted = {
      id: 'mounted-media',
      type: 'media',
      position: { x: 40, y: 60 },
      size: { width: 300, height: 180 },
      zIndex: 1,
      data: {
        assetPath: 'Books/story.epub/image/cover.jpg',
        mediaType: 'image',
        contentLocator: {
          file: { authority: 'workspace', path: 'neko/assets/Books/story.epub' },
          selector: { kind: 'entry', path: 'image/cover.jpg' },
        },
      },
    } as unknown as CanvasNode;
    const unsafe = {
      ...mounted,
      id: 'unsafe-media',
      data: {
        ...mounted.data,
        contentLocator: { file: { authority: 'workspace', path: '/Users/example/private.png' } },
      },
    } as unknown as CanvasNode;

    expect(resolveCanvasMaterialActionTargets([mounted], [mounted.id])).toEqual([
      expect.objectContaining({
        nodeId: 'mounted-media',
        origin: 'referenced',
        locator: {
          file: { authority: 'workspace', path: 'neko/assets/Books/story.epub' },
          selector: { kind: 'entry', path: 'image/cover.jpg' },
        },
      }),
    ]);
    expect(resolveCanvasMaterialActionTargets([unsafe], [unsafe.id])).toEqual([]);
  });
});
