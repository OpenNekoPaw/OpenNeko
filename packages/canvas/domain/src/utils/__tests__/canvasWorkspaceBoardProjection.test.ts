import { describe, expect, it } from 'vitest';
import {
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceMarkdownProjectionArtifact,
  type CanvasWorkspaceResourceProjectionArtifact,
  type CanvasWorkspaceProjectionRequest,
} from '../../types/canvas-workspace-board';
import type { CanvasNode } from '../../types/canvas';
import type { ContentLocator } from '@neko/content';
import { createEmptyCanvasData } from '../canvasHeadlessAuthoring';
import { planCanvasWorkspaceBoardProjection } from '../canvasWorkspaceBoardProjection';

const sourceLocator: ContentLocator = {
  file: { authority: 'workspace', path: 'neko/assets/References/source-image.png' },
};
const generatedLocator = generatedOutputLocator('shot-1');

describe('planCanvasWorkspaceBoardProjection', () => {
  it('projects a flat creative-content graph with explicit source relations', () => {
    const plan = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());

    expect(plan.status).toBe('projected');
    expect(plan.canvasData.nodes).toHaveLength(3);
    expect(plan.canvasData.nodes.every((node) => node.type !== 'group')).toBe(true);
    expect(plan.canvasData.nodes.every((node) => node.parentId === undefined)).toBe(true);
    expect(plan.canvasData.nodes.map((node) => node.type)).toEqual(['file', 'markdown', 'media']);
    expect(
      plan.canvasData.nodes.map((node) =>
        'provenance' in node.data ? node.data.provenance?.['role'] : undefined,
      ),
    ).toEqual(['source', 'analysis', 'output']);
    expect(plan.canvasData.connections).toHaveLength(2);
    expect(plan.canvasData.connections.map((connection) => connection.type)).toEqual([
      'derived-from',
      'derived-from',
    ]);

    const [source, analysis, output] = plan.canvasData.nodes;
    expect(plan.canvasData.connections).toEqual([
      expect.objectContaining({ sourceId: source!.id, targetId: analysis!.id }),
      expect.objectContaining({ sourceId: analysis!.id, targetId: output!.id }),
    ]);
    expect(JSON.stringify(plan.canvasData)).not.toMatch(
      /generated-draft|webviewUri|cachePath|workspace-inbox|workspace-process/iu,
    );
  });

  it('groups one batch of generated outputs in a deterministic near-square grid', () => {
    const artifacts = Array.from({ length: 5 }, (_, index) =>
      generatedOutputArtifact('delivery:generated-batch', index + 1),
    );

    const first = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ deliveryId: 'delivery:generated-batch', artifacts }),
    );
    const second = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ deliveryId: 'delivery:generated-batch', artifacts }),
    );

    const group = first.canvasData.nodes.find((node) => node.type === 'group');
    expect(group).toMatchObject({
      type: 'group',
      container: {
        policy: 'group',
        layout: { mode: 'grid', columns: 3 },
      },
      data: {
        provenance: {
          kind: 'generated-batch',
          deliveryId: 'delivery:generated-batch',
        },
      },
    });
    const children = first.canvasData.nodes.filter((node) => node.parentId === group?.id);
    expect(children).toHaveLength(5);
    expect(group?.container?.childIds).toEqual(children.map((node) => node.id));
    expect(new Set(children.map((node) => node.position.x)).size).toBe(3);
    expect(new Set(children.map((node) => node.position.y)).size).toBe(2);
    expect(
      children.every(
        (child) =>
          child.position.x >= group!.position.x &&
          child.position.y >= group!.position.y &&
          child.position.x + child.size.width <= group!.position.x + group!.size.width &&
          child.position.y + child.size.height <= group!.position.y + group!.size.height,
      ),
    ).toBe(true);
    expect(first.nodeIds).toEqual(children.map((node) => node.id));
    expect(second.canvasData.nodes).toEqual(first.canvasData.nodes);
  });

  it('places repeated one-item deliveries across bounded top-level columns', () => {
    let canvasData = createEmptyCanvasData('Workspace');
    for (let index = 1; index <= 5; index += 1) {
      const deliveryId = `delivery:single-${index}`;
      canvasData = planCanvasWorkspaceBoardProjection(
        canvasData,
        request({
          deliveryId,
          artifacts: [generatedOutputArtifact(deliveryId, index)],
        }),
      ).canvasData;
    }

    expect(canvasData.nodes.every((node) => node.type !== 'group')).toBe(true);
    expect(new Set(canvasData.nodes.map((node) => node.position.x)).size).toBe(3);
    expect(new Set(canvasData.nodes.map((node) => node.position.y)).size).toBe(2);
    for (const [index, node] of canvasData.nodes.entries()) {
      expect(
        canvasData.nodes.slice(index + 1).every((candidate) => !rectanglesOverlap(node, candidate)),
      ).toBe(true);
    }
  });

  it('does not restore generated batch grouping after creator-owned ungrouping', () => {
    const artifacts = [
      generatedOutputArtifact('delivery:generated-edit', 1),
      generatedOutputArtifact('delivery:generated-edit', 2),
    ];
    const first = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ deliveryId: 'delivery:generated-edit', artifacts }),
    );
    const group = first.canvasData.nodes.find((node) => node.type === 'group')!;
    const edited = {
      ...first.canvasData,
      nodes: first.canvasData.nodes.map((node) => {
        if (node.id === group.id) {
          return {
            ...node,
            position: { x: 700, y: 400 },
            container: { ...node.container!, childIds: [] },
          };
        }
        return {
          ...node,
          parentId: undefined,
          position: { x: node.position.x + 900, y: node.position.y + 500 },
        };
      }),
    };

    const replay = planCanvasWorkspaceBoardProjection(
      edited,
      request({ deliveryId: 'delivery:generated-edit', artifacts }),
    );

    expect(replay.status).toBe('noop');
    expect(replay.canvasData).toBe(edited);
  });

  it('sizes a newly projected image node to the generated image aspect ratio', () => {
    const portraitImage = {
      ...outputArtifact('delivery:portrait-image'),
      generation: {
        jobRef: { kind: 'generation', jobId: 'job-1' },
        summary: {
          prompt: 'A silent megastructure under hard light',
          model: 'image-model',
          aspectRatio: '2:3',
          width: 1024,
          height: 1536,
        },
      },
    } satisfies CanvasWorkspaceProjectionArtifact;

    const plan = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ deliveryId: 'delivery:portrait-image', artifacts: [portraitImage] }),
    );

    const node = plan.canvasData.nodes[0]!;
    expect(node.type).toBe('media');
    expect(node.size.width).toBe(104);
    expect(node.size.width / node.size.height).toBeCloseTo(1024 / 1536, 8);
  });

  it('sizes a newly projected referenced image node to its intrinsic aspect ratio', () => {
    const image = {
      ...outputArtifact('delivery:referenced-portrait'),
      contentLocator: sourceLocator,
      generation: undefined,
      intrinsicDimensions: { width: 900, height: 1600 },
    } satisfies CanvasWorkspaceProjectionArtifact;

    const plan = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ deliveryId: 'delivery:referenced-portrait', artifacts: [image] }),
    );

    const node = plan.canvasData.nodes[0]!;
    expect(node.type).toBe('media');
    expect(node.size.width).toBe(104);
    expect(node.size.width / node.size.height).toBeCloseTo(900 / 1600, 8);
  });

  it('preserves creator sizing when an intrinsic image is projected again', () => {
    const firstImage = {
      ...outputArtifact('delivery:image-first'),
      intrinsicDimensions: { width: 900, height: 1600 },
    } satisfies CanvasWorkspaceProjectionArtifact;
    const first = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ deliveryId: 'delivery:image-first', artifacts: [firstImage] }),
    );
    const existing = first.canvasData.nodes[0]!;
    const creatorSize = { width: 460, height: 240 };
    const edited = {
      ...first.canvasData,
      nodes: first.canvasData.nodes.map((node) =>
        node.id === existing.id ? { ...node, size: creatorSize } : node,
      ),
    };
    const replayImage = {
      ...outputArtifact('delivery:image-replay'),
      intrinsicDimensions: { width: 900, height: 1600 },
    } satisfies CanvasWorkspaceProjectionArtifact;

    const replay = planCanvasWorkspaceBoardProjection(
      edited,
      request({ deliveryId: 'delivery:image-replay', artifacts: [replayImage] }),
    );

    expect(replay.canvasData.nodes).toHaveLength(1);
    expect(replay.canvasData.nodes[0]).toMatchObject({ id: existing.id, size: creatorSize });
  });

  it('deduplicates stable resource fingerprints across deliveries and preserves creator layout', () => {
    const first = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ artifacts: [sourceArtifact('delivery:batch-1')] }),
    );
    const source = first.canvasData.nodes[0]!;
    const edited = {
      ...first.canvasData,
      nodes: first.canvasData.nodes.map((node) => {
        if (node.id !== source.id || node.type !== 'file') return node;
        return {
          ...node,
          position: { x: 720, y: 360 },
          size: { width: 480, height: 360 },
          data: { ...node.data, title: 'Creator title' },
        };
      }),
    };
    const duplicateSource = {
      ...sourceArtifact('delivery:batch-2'),
      provenance: provenance(
        'delivery:batch-2',
        'source-copy',
        'source:sha256:source-image',
        'file-reference',
        'source',
      ),
    } satisfies CanvasWorkspaceProjectionArtifact;
    const output = outputArtifact('delivery:batch-2', ['source-copy']);

    const second = planCanvasWorkspaceBoardProjection(
      edited,
      request({ deliveryId: 'delivery:batch-2', artifacts: [duplicateSource, output] }),
    );

    expect(second.status).toBe('projected');
    expect(second.canvasData.nodes).toHaveLength(2);
    expect(second.canvasData.nodes.find((node) => node.id === source.id)).toMatchObject({
      position: { x: 720, y: 360 },
      size: { width: 480, height: 360 },
      data: { title: 'Creator title' },
    });
    const projectedOutput = second.canvasData.nodes.find((node) => node.type === 'media')!;
    expect(projectedOutput.position.x).toBeGreaterThanOrEqual(1248);
    expect(rectanglesOverlap(source, projectedOutput)).toBe(false);
    expect(second.canvasData.connections).toEqual([
      expect.objectContaining({ sourceId: source.id, targetId: projectedOutput.id }),
    ]);
  });

  it('uses the canonical locator rather than provenance fingerprints as content identity', () => {
    const portablePath = 'references/books/volume-01.epub';
    const weak = sourceDocumentArtifact({
      artifactId: 'source-weak',
      portablePath,
      contentFingerprint: portablePath,
    });
    const hashedSource = sourceDocumentArtifact({
      artifactId: 'source-hashed',
      portablePath,
      contentFingerprint: 'sha256:volume-01',
    });
    const hashed = {
      ...hashedSource,
      provenance: { ...hashedSource.provenance, role: 'output' as const },
    } satisfies CanvasWorkspaceProjectionArtifact;

    const plan = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ artifacts: [weak, hashed] }),
    );

    expect(plan.status).toBe('projected');
    expect(plan.canvasData.nodes).toHaveLength(1);
    expect(plan.canvasData.nodes[0]).toMatchObject({
      type: 'file',
      data: {
        contentLocator: { file: { authority: 'workspace', path: portablePath } },
      },
    });
    expect(new Set(plan.nodeIds).size).toBe(1);
  });

  it('does not mutate an existing locator when a new content fingerprint arrives', () => {
    const portablePath = 'references/books/volume-01.epub';
    const weak = sourceDocumentArtifact({
      artifactId: 'source-weak',
      portablePath,
      contentFingerprint: portablePath,
    });
    const first = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ artifacts: [weak] }),
    );
    const existing = first.canvasData.nodes[0]!;
    const moved = {
      ...first.canvasData,
      nodes: [{ ...existing, position: { x: 640, y: 320 } }],
    };
    const hashedSource = sourceDocumentArtifact({
      artifactId: 'source-hashed',
      portablePath,
      contentFingerprint: 'sha256:volume-01',
    });
    const hashed = {
      ...hashedSource,
      provenance: { ...hashedSource.provenance, deliveryId: 'delivery:batch-2' },
    } satisfies CanvasWorkspaceProjectionArtifact;

    const second = planCanvasWorkspaceBoardProjection(
      moved,
      request({ deliveryId: 'delivery:batch-2', artifacts: [hashed] }),
    );

    expect(second.status).toBe('noop');
    expect(second.canvasData.nodes).toHaveLength(1);
    expect(second.canvasData.nodes[0]).toMatchObject({
      id: existing.id,
      position: { x: 640, y: 320 },
      data: { contentLocator: { file: { authority: 'workspace', path: portablePath } } },
    });

    const changedSource = sourceDocumentArtifact({
      artifactId: 'source-hashed-changed',
      portablePath,
      contentFingerprint: 'sha256:volume-01-changed',
    });
    const changed = {
      ...changedSource,
      provenance: {
        ...changedSource.provenance,
        deliveryId: 'delivery:batch-3',
      },
    } satisfies CanvasWorkspaceProjectionArtifact;
    const third = planCanvasWorkspaceBoardProjection(
      second.canvasData,
      request({ deliveryId: 'delivery:batch-3', artifacts: [changed] }),
    );

    expect(third.status).toBe('noop');
    expect(third.canvasData.nodes).toHaveLength(1);
    expect(third.canvasData.nodes[0]).toMatchObject({
      id: existing.id,
      position: { x: 640, y: 320 },
    });
  });

  it('treats an equivalent repeated content graph as a noop', () => {
    const first = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());
    const replay = request({
      deliveryId: 'delivery:batch-2',
      artifacts: [
        {
          ...sourceArtifact('delivery:batch-2'),
          provenance: provenance(
            'delivery:batch-2',
            'source-copy',
            'source:sha256:source-image',
            'file-reference',
            'source',
          ),
        },
        {
          ...markdownArtifact('delivery:batch-2', ['source-copy']),
          provenance: provenance(
            'delivery:batch-2',
            'analysis-1',
            'markdown:sha256:analysis-1',
            'markdown',
            'analysis',
            ['source-copy'],
          ),
        },
        {
          ...outputArtifact('delivery:batch-2', ['analysis-1']),
          provenance: provenance(
            'delivery:batch-2',
            'shot-copy',
            'generated:sha256:shot-1',
            'image',
            'output',
            ['analysis-1'],
          ),
        },
      ],
    });

    const second = planCanvasWorkspaceBoardProjection(first.canvasData, replay);

    expect(second.status).toBe('noop');
    expect(second.canvasData).toBe(first.canvasData);
    expect(second.canvasData.nodes).toHaveLength(3);
    expect(second.canvasData.connections).toHaveLength(2);
  });

  it('does not create a distinct content node when only provenance fingerprint changes', () => {
    const first = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ artifacts: [outputArtifact('delivery:batch-1')] }),
    );
    const changed = {
      ...outputArtifact('delivery:batch-2'),
      contentLocator: generatedOutputLocator('shot-1'),
      provenance: provenance(
        'delivery:batch-2',
        'shot-1',
        'generated:sha256:shot-2',
        'image',
        'output',
      ),
    } satisfies CanvasWorkspaceProjectionArtifact;

    const second = planCanvasWorkspaceBoardProjection(
      first.canvasData,
      request({ deliveryId: 'delivery:batch-2', artifacts: [changed] }),
    );

    expect(second.status).toBe('noop');
    expect(second.canvasData.nodes).toHaveLength(1);
    expect(second.canvasData.nodes[0]!.id).toBe(first.canvasData.nodes[0]!.id);
  });

  it('fails atomically when a canonical content identity is occupied by unrelated data', () => {
    const initial = createEmptyCanvasData('Workspace');
    const expected = planCanvasWorkspaceBoardProjection(
      initial,
      request({ artifacts: [outputArtifact('delivery:batch-1')] }),
    );
    const occupied = expected.canvasData.nodes[0]!;
    if (occupied.type !== 'media') throw new Error('Expected a media projection fixture.');
    const conflictingCanvas = {
      ...initial,
      nodes: [
        {
          ...occupied,
          data: {
            ...occupied.data,
            contentLocator: generatedOutputLocator('other-shot'),
          },
        },
      ],
    };

    expect(() =>
      planCanvasWorkspaceBoardProjection(
        conflictingCanvas,
        request({ artifacts: [outputArtifact('delivery:batch-1')] }),
      ),
    ).toThrow('projection-conflict');
    expect(conflictingCanvas.nodes).toHaveLength(1);
  });
});

function rectanglesOverlap(
  left: Pick<CanvasNode, 'position' | 'size'>,
  right: Pick<CanvasNode, 'position' | 'size'>,
): boolean {
  return !(
    left.position.x + left.size.width <= right.position.x ||
    right.position.x + right.size.width <= left.position.x ||
    left.position.y + left.size.height <= right.position.y ||
    right.position.y + right.size.height <= left.position.y
  );
}

function request(
  input: {
    readonly deliveryId?: string;
    readonly artifacts?: readonly CanvasWorkspaceProjectionArtifact[];
  } = {},
): CanvasWorkspaceProjectionRequest {
  const deliveryId = input.deliveryId ?? 'delivery:batch-1';
  return {
    target: { workspaceId: 'workspace-1', workspaceUri: 'file:///workspace/project/' },
    process: {
      deliveryId,
      sourceHost: 'headless',
      taskId: 'task-1',
      runId: 'run-1',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    artifacts: input.artifacts ?? [
      sourceArtifact(deliveryId),
      markdownArtifact(deliveryId, ['source-1']),
      outputArtifact(deliveryId, ['analysis-1']),
    ],
  };
}

function sourceArtifact(deliveryId: string): CanvasWorkspaceResourceProjectionArtifact {
  return {
    kind: 'file-reference',
    title: 'Source image',
    contentLocator: sourceLocator,
    provenance: provenance(
      deliveryId,
      'source-1',
      'source:sha256:source-image',
      'file-reference',
      'source',
    ),
  };
}

function markdownArtifact(
  deliveryId: string,
  sourceArtifactIds: readonly string[] = [],
): CanvasWorkspaceMarkdownProjectionArtifact {
  return {
    kind: 'markdown',
    title: 'Material Analysis',
    markdown: '# Material Analysis',
    provenance: provenance(
      deliveryId,
      'analysis-1',
      'markdown:sha256:analysis-1',
      'markdown',
      'analysis',
      sourceArtifactIds,
    ),
  };
}

function outputArtifact(
  deliveryId: string,
  sourceArtifactIds: readonly string[] = [],
): CanvasWorkspaceResourceProjectionArtifact {
  return {
    kind: 'image',
    title: 'Shot 1',
    mimeType: 'image/png',
    contentLocator: generatedLocator,
    generation: {
      jobRef: { kind: 'generation', jobId: 'job-1' },
      summary: {
        prompt: 'A silent megastructure under hard light',
        model: 'image-model',
        sourceNodeId: 'shot-node-1',
        aspectRatio: '16:9',
      },
    },
    provenance: provenance(
      deliveryId,
      'shot-1',
      'generated:sha256:shot-1',
      'image',
      'output',
      sourceArtifactIds,
    ),
  };
}

function generatedOutputArtifact(
  deliveryId: string,
  index: number,
): CanvasWorkspaceResourceProjectionArtifact {
  const outputId = `generated-${index}`;
  const digest = `sha256:generated-${index}`;
  return {
    ...outputArtifact(deliveryId),
    title: `Generated ${index}`,
    contentLocator: generatedOutputLocator(outputId),
    provenance: provenance(deliveryId, outputId, digest, 'image', 'output'),
  };
}

function sourceDocumentArtifact(input: {
  readonly artifactId: string;
  readonly portablePath: string;
  readonly contentFingerprint: string;
}): CanvasWorkspaceResourceProjectionArtifact {
  return {
    kind: 'file-reference',
    title: input.portablePath,
    contentLocator: { file: { authority: 'workspace', path: input.portablePath } },
    provenance: provenance(
      'delivery:batch-1',
      input.artifactId,
      input.contentFingerprint,
      'file-reference',
      'source',
    ),
  };
}

function provenance(
  deliveryId: string,
  artifactId: string,
  contentFingerprint: string,
  kind: CanvasWorkspaceProjectionArtifact['kind'],
  role: 'source' | 'analysis' | 'output',
  sourceArtifactIds: readonly string[] = [],
) {
  return {
    deliveryId,
    artifactId,
    contentFingerprint,
    kind,
    role,
    sourceId: `artifact:${artifactId}`,
    ...(sourceArtifactIds.length > 0 ? { sourceArtifactIds } : {}),
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-07-15T00:00:00.000Z',
  };
}

function generatedOutputLocator(id: string): ContentLocator {
  return { file: { authority: 'workspace', path: `neko/generated/image/${id}.png` } };
}
