import { describe, expect, it } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceProjectionRequest,
} from '../../types/canvas-workspace-board';
import type { CanvasNode } from '../../types/canvas';
import type { ResourceRef } from '../../types/resource-cache';
import { createEmptyCanvasData } from '../canvasHeadlessAuthoring';
import { planCanvasWorkspaceBoardProjection } from '../canvasWorkspaceBoardProjection';

const sourceRef = resourceRef('source-image', 'sha256:source-image');
const generatedRef = resourceRef('shot-1', 'sha256:shot-1');

describe('planCanvasWorkspaceBoardProjection', () => {
  it('projects a flat creative-content graph with explicit source relations', () => {
    const plan = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());

    expect(plan.status).toBe('projected');
    expect(plan.canvasData.nodes).toHaveLength(3);
    expect(plan.canvasData.nodes.every((node) => node.type !== 'group')).toBe(true);
    expect(plan.canvasData.nodes.every((node) => node.parentId === undefined)).toBe(true);
    expect(plan.canvasData.nodes.map((node) => node.type)).toEqual(['document', 'text', 'media']);
    expect(plan.canvasData.nodes.map((node) => node.data.provenance?.['role'])).toEqual([
      'source',
      'analysis',
      'output',
    ]);
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

  it('deduplicates stable resource revisions across deliveries and preserves creator layout', () => {
    const first = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ artifacts: [sourceArtifact('delivery:batch-1')] }),
    );
    const source = first.canvasData.nodes[0]!;
    const edited = {
      ...first.canvasData,
      nodes: first.canvasData.nodes.map((node) =>
        node.id === source.id
          ? {
              ...node,
              position: { x: 720, y: 360 },
              size: { width: 480, height: 360 },
              data: { ...node.data, title: 'Creator title' },
            }
          : node,
      ),
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

  it('creates a distinct content node for a new durable resource revision', () => {
    const first = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      request({ artifacts: [outputArtifact('delivery:batch-1')] }),
    );
    const changedRef = {
      ...generatedRef,
      fingerprint: { ...generatedRef.fingerprint, value: 'sha256:shot-2' },
    } satisfies ResourceRef;
    const changed = {
      ...outputArtifact('delivery:batch-2'),
      resourceRef: changedRef,
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

    expect(second.status).toBe('projected');
    expect(second.canvasData.nodes).toHaveLength(2);
    expect(second.canvasData.nodes[0]!.id).not.toBe(second.canvasData.nodes[1]!.id);
  });

  it('fails atomically when a canonical content identity is occupied by unrelated data', () => {
    const initial = createEmptyCanvasData('Workspace');
    const expected = planCanvasWorkspaceBoardProjection(
      initial,
      request({ artifacts: [outputArtifact('delivery:batch-1')] }),
    );
    const occupied = expected.canvasData.nodes[0]!;
    const poisoned = {
      ...initial,
      nodes: [
        {
          ...occupied,
          data: {
            ...occupied.data,
            resourceRef: resourceRef('other-shot', 'sha256:other-shot'),
          },
        },
      ],
    };

    expect(() =>
      planCanvasWorkspaceBoardProjection(
        poisoned,
        request({ artifacts: [outputArtifact('delivery:batch-1')] }),
      ),
    ).toThrow('projection-conflict');
    expect(poisoned.nodes).toHaveLength(1);
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
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
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

function sourceArtifact(deliveryId: string): CanvasWorkspaceProjectionArtifact {
  return {
    kind: 'file-reference',
    title: 'Source image',
    resourceRef: sourceRef,
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
): CanvasWorkspaceProjectionArtifact {
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
): CanvasWorkspaceProjectionArtifact {
  return {
    kind: 'image',
    title: 'Shot 1',
    mimeType: 'image/png',
    resourceRef: generatedRef,
    generationContext: {
      prompt: 'A silent megastructure under hard light',
      model: 'image-model-v2',
      sourceNodeId: 'shot-node-1',
      aspectRatio: '16:9',
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

function provenance(
  deliveryId: string,
  artifactId: string,
  revision: string,
  kind: CanvasWorkspaceProjectionArtifact['kind'],
  role: 'source' | 'analysis' | 'output',
  sourceArtifactIds: readonly string[] = [],
) {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    deliveryId,
    artifactId,
    revision,
    kind,
    role,
    sourceId: `artifact:${artifactId}`,
    ...(sourceArtifactIds.length > 0 ? { sourceArtifactIds } : {}),
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-07-15T00:00:00.000Z',
  };
}

function resourceRef(id: string, fingerprint: string): ResourceRef {
  return {
    id: `generated-output:${id}`,
    scope: 'project',
    provider: 'generated-output',
    kind: 'generated',
    source: {
      kind: 'generated-asset',
      generatedAssetId: id,
      projectRelativePath: `neko/generated/image/${id}.png`,
    },
    locator: { kind: 'generated-asset', assetId: id },
    fingerprint: { strategy: 'hash', value: fingerprint },
  };
}
