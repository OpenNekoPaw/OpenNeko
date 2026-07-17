import { describe, expect, it } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
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
  it('creates ordinary Inbox Group and Media nodes', () => {
    const plan = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());

    expect(plan.status).toBe('projected');
    expect(plan.canvasData.nodes).toHaveLength(2);
    const inbox = plan.canvasData.nodes.find((node) => node.id === CANVAS_WORKSPACE_INBOX_NODE_ID);
    const media = plan.canvasData.nodes.find((node) => node.type === 'media');
    expect(inbox).toMatchObject({
      type: 'group',
      data: { label: 'Inbox' },
      container: { policy: 'group', childIds: [media?.id] },
    });
    expect(media).toMatchObject({
      type: 'media',
      parentId: CANVAS_WORKSPACE_INBOX_NODE_ID,
      data: {
        assetPath: '',
        title: 'Shot 1',
        mediaType: 'image',
        resourceRef: generatedRef,
        generationContext: {
          prompt: 'A silent megastructure under hard light',
          model: 'image-model-v2',
          sourceNodeId: 'shot-node-1',
          aspectRatio: '16:9',
        },
        provenance: expect.objectContaining({
          projectionId: 'projection:shot-1',
          revision: 'generated:sha256:shot-1',
        }),
      },
    });
    expect(JSON.stringify(plan.canvasData)).not.toContain('generated-draft');
  });

  it('preserves creator edits and geometry during same-revision replay', () => {
    const first = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());
    const media = first.canvasData.nodes.find((node) => node.type === 'media')!;
    const edited = {
      ...first.canvasData,
      nodes: first.canvasData.nodes.map((node) =>
        node.id === media.id
          ? { ...node, position: { x: 900, y: 640 }, size: { width: 480, height: 360 } }
          : node.id === CANVAS_WORKSPACE_INBOX_NODE_ID && node.type === 'group'
            ? { ...node, data: { ...node.data, label: 'My selected work' } }
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
  });

  it('fails visibly instead of overwriting a creator-edited node with a new revision', () => {
    const first = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());

    expect(() =>
      planCanvasWorkspaceBoardProjection(
        first.canvasData,
        request({
          provenance: { ...request().provenance, revision: 'generated:sha256:shot-2' },
        }),
      ),
    ).toThrow('projection-conflict');
  });

  it('appends independent artifacts to the existing ordinary Inbox', () => {
    const first = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), request());
    const secondRequest = request({
      provenance: {
        ...request().provenance,
        projectionId: 'projection:notes-1',
        artifactId: 'notes-1',
        revision: 'markdown:notes-1',
        kind: 'markdown',
        sourceId: 'artifact:notes-1',
      },
      artifact: { kind: 'markdown', title: 'Notes', markdown: '# Notes' },
    });
    const second = planCanvasWorkspaceBoardProjection(first.canvasData, secondRequest);

    expect(second.canvasData.nodes.filter((node) => node.type === 'group')).toHaveLength(1);
    expect(second.canvasData.nodes.filter((node) => node.type === 'text')).toHaveLength(1);
    expect(
      second.canvasData.nodes.find((node) => node.id === CANVAS_WORKSPACE_INBOX_NODE_ID)?.container
        ?.childIds,
    ).toHaveLength(2);
  });
});

function request(
  overrides: Partial<CanvasWorkspaceProjectionRequest> = {},
): CanvasWorkspaceProjectionRequest {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    target: { workspaceUri: 'file:///workspace/project/' },
    provenance: {
      version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
      projectionId: 'projection:shot-1',
      artifactId: 'shot-1',
      revision: 'generated:sha256:shot-1',
      kind: 'image',
      sourceId: 'generated-output:shot-1',
      taskId: 'task-1',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    artifact: {
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
    },
    ...overrides,
  };
}
