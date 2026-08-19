import { describe, expect, it } from 'vitest';
import { type ContentLocator } from '@neko/content';
import { createEmptyCanvasData, type CanvasGenerationEvidence } from '@neko/canvas-domain';
import {
  portableMaterialPath,
  projectDerivedCanvasMaterialToCanvas,
  projectResolvedCanvasMaterialToCanvas,
  replaceCanvasEntityRepresentationOnCanvas,
} from '../canvas-content-authoring';

describe('Canvas ContentLocator authoring', () => {
  it('creates a durable media node at the requested position', () => {
    const canvas = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
        title: 'cat.png',
        mediaKind: 'image',
        position: { x: 320, y: 180 },
      },
    });

    expect(canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'media',
        position: { x: 320, y: 180 },
        data: expect.objectContaining({
          assetPath: 'media/cat.png',
          contentLocator: { file: { authority: 'workspace', path: 'media/cat.png' } },
          mediaType: 'image',
        }),
      }),
    ]);
  });

  it('projects every source-backed add action to a real supported Canvas node', () => {
    const sources = [
      { path: 'media/still.png', nodeType: 'media', mediaType: 'image' },
      { path: 'media/clip.mp4', nodeType: 'media', mediaType: 'video' },
      { path: 'media/voice.aac', nodeType: 'media', mediaType: 'audio' },
      { path: 'models/character.glb', nodeType: 'file', mediaType: undefined },
    ] as const;

    for (const source of sources) {
      const canvas = projectResolvedCanvasMaterialToCanvas({
        canvas: createEmptyCanvasData('Fixture'),
        material: {
          locator: { file: { authority: 'workspace', path: source.path } },
          title: source.path,
          mediaKind: source.mediaType ?? 'model',
          position: { x: 240, y: 160 },
        },
      });
      const node = canvas.nodes[0];

      expect(node).toMatchObject({
        type: source.nodeType,
        position: { x: 240, y: 160 },
      });
      expect(node?.data).toMatchObject({
        contentLocator: { file: { authority: 'workspace', path: source.path } },
      });
      if (source.mediaType) {
        expect(node?.data).toMatchObject({ mediaType: source.mediaType });
      }
    }
  });

  it('retains stable Entity representation evidence separately from content identity', () => {
    const locator = {
      file: { authority: 'workspace', path: 'neko/entities/neko/portrait.png' },
    } as const;
    const entity = {
      entityId: 'character-neko',
      bindingId: 'binding-neko-portrait',
      role: 'portrait',
    } as const;
    const canvas = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator,
        title: 'portrait.png',
        mediaKind: 'image',
        entity,
      },
    });

    expect(canvas.nodes[0]?.data).toMatchObject({
      contentLocator: locator,
      entityRepresentation: entity,
    });
    expect(canvas.nodes[0]?.data).not.toHaveProperty('generation');
  });

  it('changes an Entity representation only through an explicit non-stale replacement', () => {
    const originalEntity = {
      entityId: 'character-neko',
      bindingId: 'binding-neko-portrait-original',
      role: 'portrait',
    } as const;
    const original = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: 'characters/neko-original.png' } },
        title: 'neko-original.png',
        mediaKind: 'image',
        entity: originalEntity,
        position: { x: 320, y: 180 },
      },
      generateId: () => 'entity-node',
    });
    const originalSnapshot = structuredClone(original);
    const nextEntity = {
      entityId: 'character-neko',
      bindingId: 'binding-neko-portrait-replacement',
      role: 'portrait',
    } as const;

    expect(original).toEqual(originalSnapshot);
    expect(() =>
      replaceCanvasEntityRepresentationOnCanvas({
        canvas: original,
        nodeId: 'entity-node',
        expectedEntity: { ...originalEntity, bindingId: 'stale-binding' },
        material: {
          locator: { file: { authority: 'workspace', path: 'characters/neko-replacement.png' } },
          title: 'neko-replacement.png',
          mediaKind: 'image',
          entity: nextEntity,
        },
      }),
    ).toThrow('refresh is stale');

    const replaced = replaceCanvasEntityRepresentationOnCanvas({
      canvas: original,
      nodeId: 'entity-node',
      expectedEntity: originalEntity,
      material: {
        locator: { file: { authority: 'workspace', path: 'characters/neko-replacement.png' } },
        title: 'neko-replacement.png',
        mediaKind: 'image',
        entity: nextEntity,
      },
    });

    expect(original).toEqual(originalSnapshot);
    expect(replaced.nodes).toHaveLength(1);
    expect(replaced.nodes[0]).toMatchObject({
      id: 'entity-node',
      position: { x: 320, y: 180 },
      data: {
        contentLocator: {
          file: { authority: 'workspace', path: 'characters/neko-replacement.png' },
        },
        entityRepresentation: nextEntity,
      },
    });
  });

  it('maps Canvas documents and generic files without runtime locations', () => {
    const withCanvas = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: 'boards/scene.nkc' } },
        title: 'scene.nkc',
        mediaKind: 'document',
      },
    });
    const withDocument = projectResolvedCanvasMaterialToCanvas({
      canvas: withCanvas,
      material: {
        locator: { file: { authority: 'workspace', path: 'docs/brief.pdf' } },
        title: 'brief.pdf',
        mediaKind: 'document',
      },
    });

    expect(withDocument.nodes.map((node) => node.type)).toEqual(['canvas-embed', 'file']);
    expect(withDocument.nodes[0]?.data).toMatchObject({
      contentLocator: { file: { authority: 'workspace', path: 'boards/scene.nkc' } },
    });
    expect(JSON.stringify(withDocument)).not.toContain('file://');
    expect(JSON.stringify(withDocument)).not.toContain('runtimePath');
  });

  it.each([
    {
      locator: { file: { authority: 'workspace', path: 'media/cat.png' } } satisfies ContentLocator,
      expectedPath: 'media/cat.png',
    },
    {
      locator: {
        file: { authority: 'workspace', path: 'packs/story.epub' },
        selector: { kind: 'entry', path: 'images/cover.png' },
      } satisfies ContentLocator,
      expectedPath: 'images/cover.png',
    },
    {
      locator: {
        file: {
          authority: 'package',
          packageId: 'fixture-package',
          revision: '1.0.0',
          path: 'images/cover.png',
        },
      } satisfies ContentLocator,
      expectedPath: 'images/cover.png',
    },
  ])(
    'projects a canonical referenced locator without changing identity',
    ({ locator, expectedPath }) => {
      const canvas = projectResolvedCanvasMaterialToCanvas({
        canvas: createEmptyCanvasData('Fixture'),
        material: { locator, title: 'cover.png', mediaKind: 'image' },
      });

      expect(portableMaterialPath(locator)).toBe(expectedPath);
      expect(canvas.nodes[0]?.data).toMatchObject({ contentLocator: locator });
      expect(canvas.nodes[0]?.data).not.toHaveProperty('generation');
    },
  );

  it('persists Generation evidence independently beside a canonical Workspace locator', () => {
    const generation = generationEvidence();
    const locator = {
      file: { authority: 'workspace', path: 'neko/generated/image-1.png' },
    } as const;
    const canvas = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator,
        title: 'image-1.png',
        mediaKind: 'image',
        generation,
      },
    });

    expect(canvas.nodes[0]?.data).toMatchObject({
      contentLocator: locator,
      generation,
    });
    const referenced = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: { locator, title: 'image-1.png', mediaKind: 'image' },
    });
    expect(referenced.nodes[0]?.data).not.toHaveProperty('generation');
  });

  it('classifies a canonical locator with Generation evidence as generated', () => {
    const generation = generationEvidence();
    const canvas = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
        title: 'cat.png',
        mediaKind: 'image',
        generation,
      },
    });
    expect(canvas.nodes[0]?.data).toMatchObject({ generation });
  });

  it('commits a derivative as a new node with lineage without rewriting its sources', () => {
    const source = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: 'media/source.png' } },
        title: 'source.png',
        mediaKind: 'image',
      },
      generateId: () => 'source-node',
    });
    const originalSource = structuredClone(source.nodes[0]);

    const derived = projectDerivedCanvasMaterialToCanvas({
      canvas: source,
      material: {
        locator: { file: { authority: 'workspace', path: 'neko/derived/crop/source-cropped.png' } },
        title: 'source-cropped.png',
        mediaKind: 'image',
      },
      sourceNodeIds: ['source-node'],
      generateId: () => 'derived-node',
    });

    expect(derived.nodes).toHaveLength(2);
    expect(derived.nodes[0]).toEqual(originalSource);
    expect(derived.nodes[1]).toMatchObject({
      id: 'derived-node',
      data: {
        contentLocator: {
          file: { authority: 'workspace', path: 'neko/derived/crop/source-cropped.png' },
        },
      },
    });
    expect(derived.nodes[1]?.data).not.toHaveProperty('generation');
    expect(derived.connections).toContainEqual({
      id: 'material-derived:source-node:derived-node',
      sourceId: 'source-node',
      targetId: 'derived-node',
      type: 'derived-from',
      sourceEndpoint: { nodeId: 'source-node', scope: 'node' },
      targetEndpoint: { nodeId: 'derived-node', scope: 'node' },
    });
  });

  it('commits an AI derivative with Generation evidence without mutating its referenced source', () => {
    const source = projectResolvedCanvasMaterialToCanvas({
      canvas: createEmptyCanvasData('Fixture'),
      material: {
        locator: { file: { authority: 'workspace', path: 'media/source.png' } },
        title: 'source.png',
        mediaKind: 'image',
      },
      generateId: () => 'source-node',
    });
    const originalSource = structuredClone(source.nodes[0]);
    const generation = generationEvidence();
    const generatedLocator = {
      file: { authority: 'workspace', path: 'neko/generated/generated-derivative-1.png' },
    } as const;

    const derived = projectDerivedCanvasMaterialToCanvas({
      canvas: source,
      material: {
        locator: generatedLocator,
        title: 'generated-derivative-1.png',
        mediaKind: 'image',
        generation,
      },
      sourceNodeIds: ['source-node'],
      generateId: () => 'generated-node',
    });

    expect(derived.nodes[0]).toEqual(originalSource);
    expect(derived.nodes[0]?.data).not.toHaveProperty('generation');
    expect(derived.nodes[1]).toMatchObject({
      id: 'generated-node',
      data: {
        contentLocator: generatedLocator,
        generation,
      },
    });
    expect(derived.connections).toContainEqual(
      expect.objectContaining({
        sourceId: 'source-node',
        targetId: 'generated-node',
        type: 'derived-from',
      }),
    );
  });

  it('rejects missing derivative sources before creating output state', () => {
    expect(() =>
      projectDerivedCanvasMaterialToCanvas({
        canvas: createEmptyCanvasData('Fixture'),
        material: {
          locator: { file: { authority: 'workspace', path: 'neko/derived/output.png' } },
          title: 'output.png',
          mediaKind: 'image',
        },
        sourceNodeIds: ['missing-source'],
      }),
    ).toThrow('does not exist');
  });
});

function generationEvidence(): CanvasGenerationEvidence {
  return {
    jobRef: { kind: 'generation', jobId: 'generation-job-1' },
    summary: {
      prompt: 'A generated fixture',
      model: 'fixture-model',
    },
  };
}
