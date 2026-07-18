import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  createGeneratedAssetsWorkspaceDeliveryBatch,
  createGeneratedAssetRevisionRef,
  type GeneratedImage,
} from '@neko/shared';
import { WorkspaceBoardProjectionHost } from './workspaceBoardProjectionHost';

vi.mock('vscode', async () => await import('../__mocks__/vscode'));

describe('WorkspaceBoardProjectionHost', () => {
  it('maps a terminal Markdown artifact batch with its original run/task identities', async () => {
    const project = vi.fn(async (request) => ({
      version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
      deliveryId: request.process.deliveryId,
      status: 'projected' as const,
      target: {
        kind: 'workspace' as const,
        documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
      },
      diagnostics: [],
    }));
    const host = new WorkspaceBoardProjectionHost({
      workspaceId: 'workspace-1',
      getCanvasApi: async () => ({ boards: { project } }),
      getWorkspaceUris: () => ['file:///workspace/project/'],
    });

    await host.deliverCreatorVisibleArtifacts({
      deliveryId: 'agent-turn:turn-1',
      createdAt: '2026-07-18T00:00:00.000Z',
      taskId: 'task-1',
      runId: 'run-1',
      artifacts: [
        {
          artifactId: 'analysis-1',
          revision: 'markdown:sha256-analysis-1',
          role: 'analysis',
          kind: 'markdown',
          title: 'Material Analysis',
          sourceId: 'artifact:analysis-1',
          markdown: '# Material Analysis\n\nFindings.',
        },
      ],
    });

    expect(project).toHaveBeenCalledWith(
      expect.objectContaining({
        process: expect.objectContaining({
          deliveryId: 'agent-turn:turn-1',
          taskId: 'task-1',
          runId: 'run-1',
        }),
        artifacts: [
          expect.objectContaining({
            kind: 'markdown',
            provenance: expect.objectContaining({ taskId: 'task-1', runId: 'run-1' }),
          }),
        ],
      }),
    );
  });

  it('maps typed generated output facts into the canonical Canvas projector', async () => {
    const project = vi.fn(async (request) => ({
      version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
      deliveryId: request.process.deliveryId,
      status: 'projected' as const,
      target: {
        kind: 'workspace' as const,
        documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
      },
      diagnostics: [],
    }));
    const host = new WorkspaceBoardProjectionHost({
      workspaceId: 'workspace-1',
      getCanvasApi: async () => ({ boards: { project } }),
      getWorkspaceUris: () => ['file:///workspace/project/'],
    });

    await expect(
      host.deliverBatch(createGeneratedAssetsWorkspaceDeliveryBatch([generatedImage()], 'vscode')),
    ).resolves.toMatchObject([{ status: 'projected' }]);
    expect(project).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { workspaceId: 'workspace-1', workspaceUri: 'file:///workspace/project/' },
        process: expect.objectContaining({
          sourceHost: 'vscode',
          taskId: 'task-1',
          runId: 'run-1',
        }),
        artifacts: [
          expect.objectContaining({
            kind: 'image',
            resourceRef: expect.objectContaining({ kind: 'generated' }),
            provenance: expect.objectContaining({
              artifactId: 'generated-1',
              role: 'output',
            }),
          }),
        ],
      }),
    );
    expect(JSON.stringify(project.mock.calls)).not.toContain('/workspace/project/neko/generated');
  });

  it('keeps generation successful when Canvas is unavailable', async () => {
    const host = new WorkspaceBoardProjectionHost({
      workspaceId: 'workspace-1',
      getCanvasApi: async () => undefined,
      getWorkspaceUris: () => ['file:///workspace/project/'],
    });

    await expect(
      host.deliverBatch(createGeneratedAssetsWorkspaceDeliveryBatch([generatedImage()], 'vscode')),
    ).resolves.toMatchObject([
      {
        status: 'blocked',
        diagnostics: [expect.objectContaining({ code: 'projection-write-failed' })],
      },
    ]);
  });

  it('redacts Canvas write failures before returning them to Agent result surfaces', async () => {
    const host = new WorkspaceBoardProjectionHost({
      workspaceId: 'workspace-1',
      getCanvasApi: async () => ({
        boards: {
          project: async () => {
            throw new Error('SQLITE_BUSY tasks /Users/private/neko.db token=must-not-leak');
          },
        },
      }),
      getWorkspaceUris: () => ['file:///workspace/project/'],
    });

    const results = await host.deliverBatch(
      createGeneratedAssetsWorkspaceDeliveryBatch([generatedImage()], 'vscode'),
    );

    expect(results).toMatchObject([
      { status: 'blocked', diagnostics: [{ code: 'projection-write-failed' }] },
    ]);
    expect(JSON.stringify(results)).not.toMatch(/SQLITE|tasks|\/Users\/private|must-not-leak/);
  });

  it('fails visibly for zero or ambiguous workspaces without calling Canvas', async () => {
    const getCanvasApi = vi.fn();
    const host = new WorkspaceBoardProjectionHost({
      workspaceId: 'workspace-1',
      getCanvasApi,
      getWorkspaceUris: () => [],
    });

    await expect(
      host.deliverBatch(createGeneratedAssetsWorkspaceDeliveryBatch([generatedImage()], 'vscode')),
    ).resolves.toMatchObject([
      { status: 'blocked', diagnostics: [expect.objectContaining({ code: 'workspace-required' })] },
    ]);
    expect(getCanvasApi).not.toHaveBeenCalled();
  });
});

function generatedImage(): GeneratedImage {
  const lifecycle = createGeneratedAssetRevisionRef({
    assetId: 'generated-1',
    contentDigest: 'sha256:generated-1',
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: { taskId: 'task-1', runId: 'run-1' },
  });
  return {
    id: 'generated-1',
    type: 'generated-image',
    path: '/workspace/project/neko/generated/image/generated-1.png',
    mimeType: 'image/png',
    generatedAt: '2026-07-15T00:00:00.000Z',
    prompt: 'Station concept',
    lifecycle,
    width: 1024,
    height: 1024,
    ratio: '1:1',
  };
}
