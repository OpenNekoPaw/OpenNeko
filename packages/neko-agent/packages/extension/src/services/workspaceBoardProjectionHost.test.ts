import { describe, expect, it, vi } from 'vitest';
import { createGeneratedAssetRevisionRef, type GeneratedImage } from '@neko/shared';
import { WorkspaceBoardProjectionHost } from './workspaceBoardProjectionHost';

vi.mock('vscode', async () => await import('../__mocks__/vscode'));

describe('WorkspaceBoardProjectionHost', () => {
  it('maps typed generated output facts into the canonical Canvas projector', async () => {
    const project = vi.fn(async (request) => ({
      version: 1 as const,
      status: 'projected' as const,
      target: { kind: 'workspace' as const, documentUri: request.target.workspaceUri },
      diagnostics: [],
    }));
    const host = new WorkspaceBoardProjectionHost({
      getCanvasApi: async () => ({ boards: { project } }),
      getWorkspaceUris: () => ['file:///workspace/project/'],
    });

    await expect(host.projectGeneratedAssets([generatedImage()])).resolves.toMatchObject([
      { status: 'projected' },
    ]);
    expect(project).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { workspaceUri: 'file:///workspace/project/' },
        provenance: expect.objectContaining({
          projectionId: 'generated-output:generated-1',
          artifactId: 'generated-1',
          taskId: 'task-1',
        }),
        artifact: expect.objectContaining({
          kind: 'image',
          resourceRef: expect.objectContaining({ kind: 'generated' }),
        }),
      }),
    );
    expect(JSON.stringify(project.mock.calls)).not.toContain('/workspace/project/neko/generated');
  });

  it('keeps generation successful when Canvas is unavailable', async () => {
    const host = new WorkspaceBoardProjectionHost({
      getCanvasApi: async () => undefined,
      getWorkspaceUris: () => ['file:///workspace/project/'],
    });

    await expect(host.projectGeneratedAssets([generatedImage()])).resolves.toMatchObject([
      {
        status: 'blocked',
        diagnostics: [expect.objectContaining({ code: 'projection-write-failed' })],
      },
    ]);
  });

  it('fails visibly for zero or ambiguous workspaces without calling Canvas', async () => {
    const getCanvasApi = vi.fn();
    const host = new WorkspaceBoardProjectionHost({
      getCanvasApi,
      getWorkspaceUris: () => [],
    });

    await expect(host.projectGeneratedAssets([generatedImage()])).resolves.toMatchObject([
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
