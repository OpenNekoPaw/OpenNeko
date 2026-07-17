import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGeneratedAssetWorkspaceProjectionRequest,
  createGeneratedAssetRevisionRef,
  loadNkc,
  type GeneratedImage,
} from '@neko/shared';
import { NodeWorkspaceBoardProjector } from './node-workspace-board-projector';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('NodeWorkspaceBoardProjector', () => {
  it('persists and reopens the same ordinary Workspace Board without a Webview', async () => {
    const root = await createTemporaryDirectory();
    const projector = new NodeWorkspaceBoardProjector(root);
    const request = createGeneratedAssetWorkspaceProjectionRequest(
      generatedImage(root),
      projector.workspaceUri(),
    );

    await expect(projector.project(request)).resolves.toMatchObject({ status: 'projected' });
    await expect(projector.project(request)).resolves.toMatchObject({ status: 'noop' });
    const boardPath = path.join(root, 'neko', 'boards', 'workspace.nkc');
    const reopened = loadNkc(await fs.readFile(boardPath, 'utf8'));
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes.map((node) => node.type)).toEqual(['group', 'media']);
  });

  it('rejects a workspace outside the TUI session', async () => {
    const root = await createTemporaryDirectory();
    const other = await createTemporaryDirectory();
    const projector = new NodeWorkspaceBoardProjector(root);

    await expect(
      projector.project(
        createGeneratedAssetWorkspaceProjectionRequest(
          generatedImage(root),
          new NodeWorkspaceBoardProjector(other).workspaceUri(),
        ),
      ),
    ).resolves.toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'workspace-required' })],
    });
  });
});

function generatedImage(root: string): GeneratedImage {
  return {
    id: 'generated-1',
    type: 'generated-image',
    path: path.join(root, 'neko', 'generated', 'image', 'generated-1.png'),
    mimeType: 'image/png',
    generatedAt: '2026-07-15T00:00:00.000Z',
    lifecycle: createGeneratedAssetRevisionRef({
      assetId: 'generated-1',
      contentDigest: 'sha256:generated-1',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { taskId: 'task-1' },
    }),
    width: 1024,
    height: 1024,
    ratio: '1:1',
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-workspace-board-'));
  temporaryDirectories.push(directory);
  return directory;
}
