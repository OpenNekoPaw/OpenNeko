import { describe, expect, it } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceProjectionRequest,
} from '../../types/canvas-workspace-board';
import type { ResourceRef } from '../../types/resource-cache';
import { createEmptyCanvasData } from '../canvasHeadlessAuthoring';
import {
  CANVAS_WORKSPACE_INBOX_NODE_ID,
  planCanvasWorkspaceBoardProjection,
} from '../canvasWorkspaceBoardProjection';

const generatedRef: ResourceRef = {
  id: 'generated-output:shot-1',
  scope: 'project',
  provider: 'generated-output',
  kind: 'generated',
  source: {
    kind: 'generated-asset',
    generatedAssetId: 'shot-1',
    projectRelativePath: 'neko/generated/image/shot-1.png',
  },
  locator: { kind: 'generated-asset', assetId: 'shot-1' },
  fingerprint: { strategy: 'hash', value: 'sha256:shot-1' },
};

describe('planCanvasWorkspaceBoardProjection', () => {
  it('creates one ordinary processing Group in source-analysis-output order', () => {
    const plan = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());

    expect(plan.status).toBe('projected');
    expect(plan.canvasData.nodes).toHaveLength(5);
    const inbox = plan.canvasData.nodes.find((node) => node.id === CANVAS_WORKSPACE_INBOX_NODE_ID);
    const processingGroup = plan.canvasData.nodes.find(
      (node) => node.type === 'group' && node.id !== CANVAS_WORKSPACE_INBOX_NODE_ID,
    );
    expect(inbox).toMatchObject({
      type: 'group',
      data: { label: 'Inbox' },
      container: { policy: 'group', childIds: [processingGroup?.id] },
    });
    expect(processingGroup).toMatchObject({
      type: 'group',
      parentId: CANVAS_WORKSPACE_INBOX_NODE_ID,
      data: {
        label: 'Agent Task task-1',
        provenance: {
          deliveryId: 'delivery:batch-1',
          artifacts: [
            { artifactId: 'source-1', role: 'source' },
            { artifactId: 'analysis-1', role: 'analysis' },
            { artifactId: 'shot-1', role: 'output' },
          ],
        },
      },
    });
    const children = processingGroup?.container?.childIds.map((id) =>
      plan.canvasData.nodes.find((node) => node.id === id),
    );
    expect(children?.map((node) => node?.type)).toEqual(['document', 'text', 'media']);
    expect(children?.map((node) => node?.data.provenance?.['role'])).toEqual([
      'source',
      'analysis',
      'output',
    ]);
    expect(JSON.stringify(plan.canvasData)).not.toMatch(/generated-draft|webviewUri|cachePath/iu);
  });

  it('preserves creator edits and deleted children during equivalent replay', () => {
    const first = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());
    const media = first.canvasData.nodes.find((node) => node.type === 'media')!;
    const edited = {
      ...first.canvasData,
      nodes: first.canvasData.nodes
        .filter((node) => node.type !== 'text')
        .map((node) =>
          node.id === media.id
            ? { ...node, position: { x: 900, y: 640 }, size: { width: 480, height: 360 } }
            : node,
        ),
    };

    const replay = planCanvasWorkspaceBoardProjection(edited, request());

    expect(replay.status).toBe('noop');
    expect(replay.canvasData).toBe(edited);
    expect(replay.canvasData.nodes.find((node) => node.id === media.id)).toMatchObject({
      position: { x: 900, y: 640 },
      size: { width: 480, height: 360 },
    });
    expect(replay.canvasData.nodes.some((node) => node.type === 'text')).toBe(false);
  });

  it('fails visibly when one delivery identity is reused with another revision', () => {
    const first = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());
    const changed = request({
      artifacts: request().artifacts.map((artifact) =>
        artifact.provenance.artifactId === 'shot-1'
          ? {
              ...artifact,
              provenance: { ...artifact.provenance, revision: 'generated:sha256:shot-2' },
            }
          : artifact,
      ),
    });

    expect(() => planCanvasWorkspaceBoardProjection(first.canvasData, changed)).toThrow(
      'projection-conflict',
    );
  });

  it('rejects occupied child identities atomically', () => {
    const initial = createEmptyCanvasData('Workspace');
    const expected = planCanvasWorkspaceBoardProjection(initial, request());
    const occupiedChild = expected.canvasData.nodes.find((node) => node.type === 'media')!;
    const poisoned = { ...initial, nodes: [{ ...occupiedChild, parentId: undefined }] };

    expect(() => planCanvasWorkspaceBoardProjection(poisoned, request())).toThrow(
      'projection-conflict',
    );
    expect(poisoned.nodes).toHaveLength(1);
  });

  it('appends distinct deliveries without changing existing processing records', () => {
    const first = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());
    const second = planCanvasWorkspaceBoardProjection(
      first.canvasData,
      request({
        deliveryId: 'delivery:batch-2',
        artifacts: [markdownArtifact('delivery:batch-2')],
      }),
    );

    expect(second.canvasData.nodes.filter((node) => node.type === 'group')).toHaveLength(3);
    expect(second.canvasData.nodes.filter((node) => node.type === 'text')).toHaveLength(2);
    expect(
      second.canvasData.nodes.find((node) => node.id === CANVAS_WORKSPACE_INBOX_NODE_ID)?.container
        ?.childIds,
    ).toHaveLength(2);
  });
});

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
      markdownArtifact(deliveryId),
      outputArtifact(deliveryId),
    ],
  };
}

function sourceArtifact(deliveryId: string): CanvasWorkspaceProjectionArtifact {
  return {
    kind: 'file-reference',
    title: 'Source image',
    resourceRef: generatedRef,
    provenance: provenance(
      deliveryId,
      'source-1',
      'source:sha256:shot-1',
      'file-reference',
      'source',
    ),
  };
}

function markdownArtifact(deliveryId: string): CanvasWorkspaceProjectionArtifact {
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
    ),
  };
}

function outputArtifact(deliveryId: string): CanvasWorkspaceProjectionArtifact {
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
    provenance: provenance(deliveryId, 'shot-1', 'generated:sha256:shot-1', 'image', 'output'),
  };
}

function provenance(
  deliveryId: string,
  artifactId: string,
  revision: string,
  kind: CanvasWorkspaceProjectionArtifact['kind'],
  role: 'source' | 'analysis' | 'output',
) {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    deliveryId,
    artifactId,
    revision,
    kind,
    role,
    sourceId: `artifact:${artifactId}`,
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-07-15T00:00:00.000Z',
  };
}
