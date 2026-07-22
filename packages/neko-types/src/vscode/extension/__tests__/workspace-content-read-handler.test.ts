import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeWorkspaceContentReadHandler } from '../workspace-content-read-handler';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('NodeWorkspaceContentReadHandler', () => {
  it('reads ordinary workspace files with bounded range and safe identity', async () => {
    const workspaceRoot = await createTempDir('workspace');
    await mkdir(path.join(workspaceRoot, 'media'), { recursive: true });
    await writeFile(path.join(workspaceRoot, 'media', 'sample.txt'), '0123456789', 'utf8');
    const locator = { kind: 'workspace-file' as const, path: 'media/sample.txt' };
    const handler = new NodeWorkspaceContentReadHandler({ workspaceRoot });

    await expect(
      handler.read(locator, { range: { offset: 2, length: 4 }, maxBytes: 4 }),
    ).resolves.toMatchObject({
      status: 'ready',
      locator,
      bytes: new TextEncoder().encode('2345'),
      offset: 2,
      totalByteLength: 10,
      fingerprint: { strategy: 'mtime-size' },
    });
    const result = await handler.stat(locator, {});
    expect(JSON.stringify(result)).not.toContain(workspaceRoot);
  });

  it('enforces the instance default byte limit before allocation', async () => {
    const workspaceRoot = await createTempDir('workspace');
    await writeFile(path.join(workspaceRoot, 'large.bin'), new Uint8Array(8));
    const locator = { kind: 'workspace-file' as const, path: 'large.bin' };
    const handler = new NodeWorkspaceContentReadHandler({ workspaceRoot, defaultMaxBytes: 4 });

    await expect(handler.read(locator, {})).resolves.toEqual({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-too-large' },
    });
  });

  it('reads managed linked-library descendants through the workspace locator', async () => {
    const workspaceRoot = await createTempDir('workspace');
    const libraryTarget = await createTempDir('library');
    await mkdir(path.join(workspaceRoot, 'neko', 'assets'), { recursive: true });
    await mkdir(path.join(libraryTarget, 'books'), { recursive: true });
    await writeFile(path.join(libraryTarget, 'books', 'comic.epub'), 'epub-bytes', 'utf8');
    await symlink(libraryTarget, path.join(workspaceRoot, 'neko', 'assets', 'Books'));
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Books/books/comic.epub',
    };
    const handler = new NodeWorkspaceContentReadHandler({ workspaceRoot });

    const result = await handler.read(locator, { maxBytes: 32 });
    expect(result).toMatchObject({
      status: 'ready',
      locator,
      bytes: new TextEncoder().encode('epub-bytes'),
      mimeType: 'application/epub+zip',
    });
    expect(JSON.stringify(result)).not.toContain(libraryTarget);
  });

  it('rejects unmanaged symlinks without disclosing their target', async () => {
    const workspaceRoot = await createTempDir('workspace');
    const externalRoot = await createTempDir('external');
    await writeFile(path.join(externalRoot, 'private.txt'), 'private', 'utf8');
    await symlink(externalRoot, path.join(workspaceRoot, 'outside'));
    const locator = { kind: 'workspace-file' as const, path: 'outside/private.txt' };
    const handler = new NodeWorkspaceContentReadHandler({ workspaceRoot });

    const result = await handler.read(locator, { maxBytes: 32 });
    expect(result).toEqual({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-unauthorized' },
    });
    expect(JSON.stringify(result)).not.toContain(externalRoot);
  });

  it('computes sha256 when the locator carries a sha256 precondition', async () => {
    const workspaceRoot = await createTempDir('workspace');
    const bytes = new TextEncoder().encode('fingerprinted');
    await writeFile(path.join(workspaceRoot, 'fingerprinted.bin'), bytes);
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const locator = {
      kind: 'workspace-file' as const,
      path: 'fingerprinted.bin',
      fingerprint: { strategy: 'sha256' as const, value: digest },
    };
    const handler = new NodeWorkspaceContentReadHandler({ workspaceRoot });

    await expect(handler.read(locator, { maxBytes: 32 })).resolves.toMatchObject({
      status: 'ready',
      fingerprint: { strategy: 'sha256', value: digest },
    });
  });
});

async function createTempDir(label: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `neko-content-${label}-`));
  tempDirs.push(dir);
  return dir;
}
