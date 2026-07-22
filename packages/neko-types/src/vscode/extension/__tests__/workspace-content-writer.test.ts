import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  NodeAuthorizedOutputAllocator,
  NodeAuthorizedWorkspaceWriter,
} from '../workspace-content-writer';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('NodeAuthorizedOutputAllocator', () => {
  it('allocates only beneath the Host-fixed workspace output directory', async () => {
    const allocator = new NodeAuthorizedOutputAllocator({
      outputDirectory: 'neko/generated/image',
    });

    const result = await allocator.allocate({
      fileNameHint: '../../portrait',
      mediaType: 'image/png',
    });

    expect(result).toMatchObject({
      status: 'allocated',
      locator: { kind: 'workspace-file' },
    });
    if (result.status !== 'allocated') throw new Error('Expected an allocated locator.');
    expect(result.locator.path).toMatch(/^neko\/generated\/image\/portrait-[0-9a-f-]+\.png$/u);
    expect(result.locator.path).not.toContain('..');
  });

  it('rejects request-level destination routing and observes cancellation', async () => {
    const allocator = new NodeAuthorizedOutputAllocator({ outputDirectory: 'neko/generated' });
    await expect(allocator.allocate({ destination: '/tmp/output' } as never)).rejects.toThrow(
      'Output allocation request is invalid.',
    );
    const controller = new AbortController();
    controller.abort();
    await expect(allocator.allocate({ signal: controller.signal })).resolves.toEqual({
      status: 'unavailable',
      diagnostic: { code: 'content-cancelled' },
    });
  });
});

describe('NodeAuthorizedWorkspaceWriter', () => {
  it('atomically creates a workspace file and fails closed on conflict', async () => {
    const workspaceRoot = await createWorkspace();
    await mkdir(path.join(workspaceRoot, 'output'));
    const writer = new NodeAuthorizedWorkspaceWriter({ workspaceRoot });
    const locator = { kind: 'workspace-file' as const, path: 'output/result.txt' };

    await expect(
      writer.write(locator, new TextEncoder().encode('first'), { conflict: 'fail-if-exists' }),
    ).resolves.toMatchObject({ status: 'written', locator, byteLength: 5 });
    await expect(
      writer.write(locator, new TextEncoder().encode('second'), { conflict: 'fail-if-exists' }),
    ).resolves.toEqual({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-conflict' },
    });
    expect(await readFile(path.join(workspaceRoot, locator.path), 'utf8')).toBe('first');
    expect(
      (await readdir(path.join(workspaceRoot, 'output'))).filter((name) => name.endsWith('.tmp')),
    ).toEqual([]);
  });

  it('writes through an authorized linked Media Library directory', async () => {
    const workspaceRoot = await createWorkspace();
    const targetRoot = await mkdtemp(path.join(os.tmpdir(), 'neko-media-writer-target-'));
    workspaces.push(targetRoot);
    await mkdir(path.join(workspaceRoot, 'neko', 'assets'), { recursive: true });
    await symlink(targetRoot, path.join(workspaceRoot, 'neko', 'assets', 'Books'));
    const writer = new NodeAuthorizedWorkspaceWriter({ workspaceRoot });
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Books/copied.epub',
    };

    const result = await writer.write(locator, new TextEncoder().encode('epub'), {
      conflict: 'fail-if-exists',
    });

    expect(result).toMatchObject({ status: 'written', locator });
    expect(await readFile(path.join(targetRoot, 'copied.epub'), 'utf8')).toBe('epub');
  });

  it('enforces fingerprint, size, cancellation, and path authorization', async () => {
    const workspaceRoot = await createWorkspace();
    await mkdir(path.join(workspaceRoot, 'output'));
    const targetPath = path.join(workspaceRoot, 'output', 'result.txt');
    await writeFile(targetPath, 'original');
    const targetStat = await stat(targetPath);
    const writer = new NodeAuthorizedWorkspaceWriter({ workspaceRoot, defaultMaxBytes: 8 });
    const locator = { kind: 'workspace-file' as const, path: 'output/result.txt' };

    await expect(
      writer.write(locator, new TextEncoder().encode('changed'), {
        conflict: 'replace',
        expectedFingerprint: { strategy: 'mtime-size', value: 'stale' },
      }),
    ).resolves.toMatchObject({ status: 'unavailable', diagnostic: { code: 'content-changed' } });
    await expect(
      writer.write(locator, new Uint8Array(9), { conflict: 'replace' }),
    ).resolves.toMatchObject({ status: 'unavailable', diagnostic: { code: 'content-too-large' } });
    const controller = new AbortController();
    controller.abort();
    await expect(
      writer.write(locator, new Uint8Array(), {
        conflict: 'replace',
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ status: 'unavailable', diagnostic: { code: 'content-cancelled' } });
    await expect(
      writer.write({ kind: 'workspace-file', path: '../outside.txt' }, new Uint8Array(), {
        conflict: 'replace',
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-unauthorized' },
    });

    await expect(
      writer.write(locator, new TextEncoder().encode('updated'), {
        conflict: 'replace',
        expectedFingerprint: {
          strategy: 'mtime-size',
          value: `${targetStat.mtimeMs}:${targetStat.size}`,
        },
      }),
    ).resolves.toMatchObject({ status: 'written' });
    expect(await readFile(targetPath, 'utf8')).toBe('updated');
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'neko-media-writer-workspace-'));
  workspaces.push(workspaceRoot);
  return workspaceRoot;
}
