import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  type CanvasWorkspaceProjectionRequest,
  type ResourceRef,
} from '@neko/shared';
import { WorkspaceBoardProjector } from './workspaceBoardProjector';

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

describe('WorkspaceBoardProjector', () => {
  it('derives only the canonical Workspace Board target', async () => {
    const projectWorkspaceBoard = vi.fn(async () => authored());
    const projector = new WorkspaceBoardProjector({ authoring: { projectWorkspaceBoard } });

    await expect(projector.project(request())).resolves.toMatchObject({
      status: 'projected',
      target: {
        kind: 'workspace',
        documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
      },
      revision: 'nkc:revision-1',
    });
    expect(projectWorkspaceBoard).toHaveBeenCalledWith(
      expect.objectContaining({
        documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
        createIfMissing: true,
      }),
    );
  });

  it('uses an explicit ordinary Canvas without enabling implicit creation', async () => {
    const projectWorkspaceBoard = vi.fn(async () =>
      authored('file:///workspace/project/design/concept.nkc'),
    );
    const projector = new WorkspaceBoardProjector({ authoring: { projectWorkspaceBoard } });

    await projector.project(
      request({
        target: {
          workspaceUri: 'file:///workspace/project/',
          documentUri: 'file:///workspace/project/design/concept.nkc',
        },
      }),
    );

    expect(projectWorkspaceBoard).toHaveBeenCalledWith(
      expect.objectContaining({
        documentUri: 'file:///workspace/project/design/concept.nkc',
        createIfMissing: false,
      }),
    );
  });

  it('reports projection failure separately from generated output success', async () => {
    const projector = new WorkspaceBoardProjector({
      authoring: {
        projectWorkspaceBoard: vi.fn(async () => {
          throw new Error('projection-conflict: creator changed this node');
        }),
      },
    });

    const result = await projector.project(request());
    expect(result).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'projection-conflict' })],
    });
    expect(result).not.toHaveProperty('target');
  });

  it('rejects legacy routing payloads before authoring', async () => {
    const projectWorkspaceBoard = vi.fn(async () => authored());
    const projector = new WorkspaceBoardProjector({ authoring: { projectWorkspaceBoard } });

    const result = await projector.project({
      ...request(),
      conversationId: 'conversation-1',
    } as unknown as CanvasWorkspaceProjectionRequest);

    expect(result).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'legacy-routing-forbidden' })],
    });
    expect(projectWorkspaceBoard).not.toHaveBeenCalled();
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
    },
    ...overrides,
  };
}

function authored(documentUri = 'file:///workspace/project/neko/boards/workspace.nkc') {
  return {
    status: 'projected' as const,
    documentUri,
    nodeIds: ['workspace-inbox', 'workspace-artifact-1'],
    projectRef: {
      domain: 'canvas' as const,
      documentUri,
      projectRevision: 'nkc:revision-1',
      contentDigest: 'revision-1',
    },
  };
}
