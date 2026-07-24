import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ProjectCacheSearchService,
  createProjectSearchHeadlessCapabilityProvider,
} from '@neko/search';
import { createNodeWorkspaceContentHostAdapter } from '../node-workspace-content-host';
import { createNodeMediaLibrarySearchAdapter } from '../node-media-library-search-adapter';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('createNodeMediaLibrarySearchAdapter', () => {
  it('projects linked files as exact workspace-relative locators without Asset facts', async () => {
    const workspaceRoot = temporaryDirectory('neko-tui-media-workspace-');
    const cloudLocalRoot = temporaryDirectory('neko-tui-cloud-local-');
    mkdirSync(path.join(cloudLocalRoot, 'epub'), { recursive: true });
    writeFileSync(path.join(cloudLocalRoot, 'epub', 'book.epub'), 'epub');
    mkdirSync(path.join(workspaceRoot, 'neko', 'assets'), { recursive: true });
    symlinkSync(cloudLocalRoot, path.join(workspaceRoot, 'neko', 'assets', 'Books'));
    const host = createNodeWorkspaceContentHostAdapter({ workDir: workspaceRoot });
    const runtime = ProjectCacheSearchService.create({
      resolveContext: async () => ({ projectRoot: workspaceRoot }),
      getWorkspaceRoots: () => [workspaceRoot],
    });
    runtime.registerAdapter(createNodeMediaLibrarySearchAdapter(host));

    const result = await runtime.query({
      text: 'book',
      mode: 'agent-tool',
      partitions: ['media-library'],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'workspace-file:neko/assets/Books/epub/book.epub',
        kind: 'document',
        filePath: 'neko/assets/Books/epub/book.epub',
        source: expect.objectContaining({
          partition: 'media-library',
          sourceKind: 'workspace-file',
          projectRelativePath: 'neko/assets/Books/epub/book.epub',
        }),
      }),
    ]);
    const provider = createProjectSearchHeadlessCapabilityProvider(runtime);
    const tool = provider.getTools({} as never)[0]!;
    const toolResult = await tool.execute({
      query: 'book',
      partitions: ['media-library'],
    });
    expect(toolResult.success).toBe(true);
    expect(JSON.stringify(toolResult)).toContain('neko/assets/Books/epub/book.epub');
    expect(JSON.stringify(toolResult)).not.toContain(workspaceRoot);
    expect(JSON.stringify(toolResult)).not.toContain(cloudLocalRoot);
    expect(JSON.stringify(toolResult)).not.toContain('asset-library');
    expect(JSON.stringify(toolResult)).not.toContain('assetId');
  });

  it('does not project broken roots or nested symlink targets', async () => {
    const workspaceRoot = temporaryDirectory('neko-tui-media-workspace-');
    const targetRoot = temporaryDirectory('neko-tui-media-target-');
    const nestedTarget = temporaryDirectory('neko-tui-media-nested-');
    writeFileSync(path.join(nestedTarget, 'hidden.png'), 'png');
    mkdirSync(path.join(workspaceRoot, 'neko', 'assets'), { recursive: true });
    symlinkSync(targetRoot, path.join(workspaceRoot, 'neko', 'assets', 'Media'));
    symlinkSync(nestedTarget, path.join(targetRoot, 'nested'));
    symlinkSync(
      path.join(targetRoot, 'missing'),
      path.join(workspaceRoot, 'neko', 'assets', 'Broken'),
    );
    const host = createNodeWorkspaceContentHostAdapter({ workDir: workspaceRoot });
    const runtime = ProjectCacheSearchService.create({
      resolveContext: async () => ({ projectRoot: workspaceRoot }),
      getWorkspaceRoots: () => [workspaceRoot],
    });
    runtime.registerAdapter(createNodeMediaLibrarySearchAdapter(host));

    await expect(
      runtime.query({ text: '', mode: 'agent-tool', partitions: ['media-library'] }),
    ).resolves.toMatchObject({ items: [] });
  });
});

function temporaryDirectory(prefix: string): string {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}
