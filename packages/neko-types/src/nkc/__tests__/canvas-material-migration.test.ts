import { describe, expect, it } from 'vitest';
import type {
  CanvasData,
  CanvasGenerationEvidence,
  CanvasNode,
  ContentLocator,
  JobCanvasNode,
  MediaCanvasNode,
} from '../../types';
import {
  inspectLegacyCanvasMaterialNodes,
  migrateCanvasMaterialNodes,
  validateNkc,
} from '../index';

const WORKSPACE_LOCATOR = {
  kind: 'workspace-file',
  path: 'assets/reference.png',
} satisfies ContentLocator;

const GENERATED_LOCATOR = {
  kind: 'generated-output',
  outputId: 'output-1',
  revision: 'revision-1',
  digest: 'sha256:generated',
  path: 'neko/generated/images/output-1.png',
} satisfies ContentLocator;

const GENERATION = {
  jobRef: { kind: 'generation', jobId: 'generation-job-1' },
  summary: {
    prompt: 'A generated concept image',
    model: 'fixture-image-model',
  },
} satisfies CanvasGenerationEvidence;

function createCanvas(nodes: CanvasNode[]): CanvasData {
  return {
    version: '3.0',
    name: 'Canvas material migration fixture',
    nodes,
    connections: [],
  };
}

function createMediaNode(id: string, data: MediaCanvasNode['data']): MediaCanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 32, y: 48 },
    size: { width: 320, height: 180 },
    zIndex: 4,
    data,
  };
}

function createGenerationJob(id: string, jobId: string, outputNodeId: string): JobCanvasNode {
  return {
    id,
    type: 'job',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 160 },
    zIndex: 1,
    data: {
      jobRef: { kind: 'generation', jobId },
      revision: 1,
      title: 'Generate material',
      status: 'completed',
      inputRefs: [],
      outputRefs: [{ kind: 'canvas-node', nodeId: outputNodeId }],
    },
  };
}

describe('Canvas material legacy inspection and migration', () => {
  it('leaves canonical referenced and generated nodes unchanged', () => {
    const referenced = createMediaNode('referenced-1', {
      assetPath: 'assets/reference.png',
      mediaType: 'image',
      contentLocator: WORKSPACE_LOCATOR,
    });
    const generated = createMediaNode('generated-1', {
      assetPath: GENERATED_LOCATOR.path,
      mediaType: 'image',
      contentLocator: GENERATED_LOCATOR,
      generation: GENERATION,
    });
    const canvas = createCanvas([referenced, generated]);

    expect(inspectLegacyCanvasMaterialNodes(canvas)).toEqual([
      expect.objectContaining({
        nodeId: 'referenced-1',
        status: 'canonical-referenced',
      }),
      expect.objectContaining({
        nodeId: 'generated-1',
        status: 'canonical-generated',
      }),
    ]);

    const result = migrateCanvasMaterialNodes(canvas);
    expect(result.status).toBe('unchanged');
    expect(result.data).toBe(canvas);
    expect(result.migratedNodeIds).toEqual([]);
  });

  it('migrates one unambiguous legacy generation summary without changing layout or locator', () => {
    const generated = createMediaNode('generated-1', {
      assetPath: GENERATED_LOCATOR.path,
      mediaType: 'image',
      title: 'Generated concept',
      contentLocator: GENERATED_LOCATOR,
      generationContext: GENERATION.summary,
      provenance: { owner: 'generation-domain', revision: 1 },
    });
    const canvas = createCanvas([
      generated,
      createGenerationJob('job-node-1', GENERATION.jobRef.jobId, generated.id),
    ]);

    const result = migrateCanvasMaterialNodes(canvas);

    expect(result.status).toBe('migrated');
    expect(result.migratedNodeIds).toEqual(['generated-1']);
    expect(result.data).not.toBe(canvas);
    expect(result.data.nodes[0]).toEqual({
      ...generated,
      data: {
        assetPath: GENERATED_LOCATOR.path,
        mediaType: 'image',
        title: 'Generated concept',
        contentLocator: GENERATED_LOCATOR,
        provenance: { owner: 'generation-domain', revision: 1 },
        generation: GENERATION,
      },
    });
    expect(generated.data.generationContext).toEqual(GENERATION.summary);
  });

  it('blocks legacy path and provenance heuristics when no ContentLocator exists', () => {
    const legacy = createMediaNode('legacy-1', {
      assetPath: 'neko/generated/images/legacy.png',
      mediaType: 'image',
      resourceRef: { id: 'legacy-resource' },
      provenance: { projectionId: 'generated-output:legacy' },
      generationContext: { prompt: 'Legacy prompt' },
    });
    const canvas = createCanvas([
      legacy,
      createGenerationJob('job-node-1', 'generation-job-1', legacy.id),
    ]);

    const inspections = inspectLegacyCanvasMaterialNodes(canvas);
    expect(inspections[0]).toEqual(
      expect.objectContaining({
        nodeId: 'legacy-1',
        status: 'migration-required',
        evidence: expect.arrayContaining([
          'generated-path',
          'generated-provenance',
          'legacy-generation-context',
          'job-output-ref',
        ]),
      }),
    );

    const result = migrateCanvasMaterialNodes(canvas);
    expect(result.status).toBe('migration-required');
    expect(result.data).toBe(canvas);
    expect(validateNkc(canvas).valid).toBe(false);
  });

  it('blocks ambiguous Job ownership instead of selecting a generation recipe', () => {
    const generated = createMediaNode('generated-1', {
      assetPath: GENERATED_LOCATOR.path,
      contentLocator: GENERATED_LOCATOR,
      mediaType: 'image',
      generationContext: GENERATION.summary,
    });
    const canvas = createCanvas([
      generated,
      createGenerationJob('job-node-1', 'generation-job-1', generated.id),
      createGenerationJob('job-node-2', 'generation-job-2', generated.id),
    ]);

    const result = migrateCanvasMaterialNodes(canvas);
    expect(result.status).toBe('migration-required');
    expect(result.data).toBe(canvas);
    expect(result.diagnostics).toEqual([expect.stringContaining('multiple Job outputs')]);
  });

  it('rejects absolute, runtime, temporary, and cache material identities', () => {
    const canvas = createCanvas([
      createMediaNode('runtime-1', {
        assetPath: GENERATED_LOCATOR.path,
        runtimeAssetPath: 'blob:neko-app://desktop/runtime-1',
        contentLocator: GENERATED_LOCATOR,
        generation: GENERATION,
        mediaType: 'image',
      }),
    ]);

    const result = migrateCanvasMaterialNodes(canvas);
    expect(result.status).toBe('invalid');
    expect(result.data).toBe(canvas);
    expect(result.diagnostics).toEqual([
      expect.stringContaining('absolute, runtime, temporary, or cache path'),
    ]);
  });
});
