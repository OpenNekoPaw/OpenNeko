import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  type CanvasWorkspaceProjectionRequest,
} from '@neko/shared';
import { WorkspaceBoardProjector } from './workspaceBoardProjector';

describe('WorkspaceBoardProjector', () => {
  it('routes an unbound result to the canonical Workspace Board coordinator', async () => {
    const enqueue = vi.fn(async (input: CanvasWorkspaceProjectionRequest) => [
      {
        version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
        deliveryId: input.process.deliveryId,
        status: 'projected' as const,
        target: {
          kind: 'workspace' as const,
          documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
        },
        revision: 'nkc:revision-1',
        diagnostics: [],
      },
    ]);
    const projector = new WorkspaceBoardProjector({
      getCoordinator: () => ({ enqueue }),
    });

    await expect(projector.project(request())).resolves.toMatchObject({
      status: 'projected',
      target: {
        kind: 'workspace',
        documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
      },
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { workspaceId: 'workspace-1', workspaceUri: 'file:///workspace/project/' },
      }),
    );
  });

  it('passes an explicit ordinary Canvas through the same coordinator without mirroring', async () => {
    const enqueue = vi.fn(async (input: CanvasWorkspaceProjectionRequest) => [
      {
        version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
        deliveryId: input.process.deliveryId,
        status: 'projected' as const,
        target: {
          kind: 'explicit' as const,
          documentUri: input.target.documentUri!,
        },
        revision: 'nkc:revision-2',
        diagnostics: [],
      },
    ]);
    const projector = new WorkspaceBoardProjector({ getCoordinator: () => ({ enqueue }) });
    const explicit = request({
      target: {
        workspaceId: 'workspace-1',
        workspaceUri: 'file:///workspace/project/',
        documentUri: 'file:///workspace/project/design/concept.nkc',
      },
    });

    await expect(projector.project(explicit)).resolves.toMatchObject({
      status: 'projected',
      target: { kind: 'explicit', documentUri: explicit.target.documentUri },
    });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ target: explicit.target }));
  });

  it('reports coordinator failure separately from artifact success', async () => {
    const enqueue = vi.fn(async () => {
      throw new Error('projection-conflict: creator changed this node');
    });
    const projector = new WorkspaceBoardProjector({ getCoordinator: () => ({ enqueue }) });

    const result = await projector.project(request());
    expect(result).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'projection-conflict' })],
    });
    expect(result).not.toHaveProperty('target');
  });

  it('reports a permission failure as a blocked projection write', async () => {
    const enqueue = vi.fn(async () => {
      throw new Error('EACCES: permission denied while saving the Workspace Board');
    });
    const projector = new WorkspaceBoardProjector({ getCoordinator: () => ({ enqueue }) });

    await expect(projector.project(request())).resolves.toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'projection-write-failed' })],
    });
  });

  it('rejects legacy routing payloads before invoking the coordinator', async () => {
    const enqueue = vi.fn();
    const projector = new WorkspaceBoardProjector({ getCoordinator: () => ({ enqueue }) });

    const result = await projector.project({
      ...request(),
      activeCanvas: 'file:///workspace/project/active.nkc',
    } as unknown as CanvasWorkspaceProjectionRequest);

    expect(result).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'legacy-routing-forbidden' })],
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects the legacy recent Canvas routing hint before invoking the coordinator', async () => {
    const enqueue = vi.fn();
    const projector = new WorkspaceBoardProjector({ getCoordinator: () => ({ enqueue }) });

    const result = await projector.project({
      ...request(),
      recentCanvas: 'file:///workspace/project/recent.nkc',
    } as unknown as CanvasWorkspaceProjectionRequest);

    expect(result).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'legacy-routing-forbidden' })],
    });
    expect(enqueue).not.toHaveBeenCalled();
  });
});

function request(
  overrides: Partial<CanvasWorkspaceProjectionRequest> = {},
): CanvasWorkspaceProjectionRequest {
  const deliveryId = 'delivery:shot-1';
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    target: { workspaceId: 'workspace-1', workspaceUri: 'file:///workspace/project/' },
    process: {
      deliveryId,
      sourceHost: 'vscode',
      taskId: 'task-1',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    artifacts: [
      {
        kind: 'image',
        title: 'Shot 1',
        resourceRef: {
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
        },
        provenance: {
          version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
          deliveryId,
          artifactId: 'shot-1',
          revision: 'generated:sha256:shot-1',
          kind: 'image',
          role: 'output',
          sourceId: 'generated-output:shot-1',
          taskId: 'task-1',
          createdAt: '2026-07-15T00:00:00.000Z',
        },
      },
    ],
    ...overrides,
  };
}
