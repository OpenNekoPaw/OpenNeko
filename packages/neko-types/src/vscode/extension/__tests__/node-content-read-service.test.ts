import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContentLocator } from '../../../types/content-locator';
import { createNodeHostContentReadService } from '../node-content-read-service';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('createNodeHostContentReadService', () => {
  it('reads document entries through the injected DocumentAccess owner', async () => {
    const workspaceRoot = await createTempDir();
    await mkdir(path.join(workspaceRoot, 'books'), { recursive: true });
    await writeFile(path.join(workspaceRoot, 'books', 'comic.epub'), 'archive');
    const readEntry = vi.fn(async () => new TextEncoder().encode('entry-bytes'));
    const service = createNodeHostContentReadService({
      workspaceRoot,
      documentEntryReader: { readEntry },
    });
    const locator = {
      kind: 'document-entry',
      source: { kind: 'workspace-file', path: 'books/comic.epub' },
      entryPath: 'OPS/image.png',
    } as const satisfies ContentLocator;

    await expect(service.read(locator, { range: { offset: 6, length: 5 } })).resolves.toMatchObject(
      {
        status: 'ready',
        locator,
        bytes: new TextEncoder().encode('bytes'),
        offset: 6,
        totalByteLength: 11,
        fingerprint: { strategy: 'sha256' },
      },
    );
    expect(readEntry).toHaveBeenCalledWith(
      path.join(workspaceRoot, 'books', 'comic.epub'),
      'OPS/image.png',
    );
  });

  it('reads generated output by workspace path and enforces the owner digest', async () => {
    const workspaceRoot = await createTempDir();
    const bytes = new TextEncoder().encode('generated');
    await mkdir(path.join(workspaceRoot, 'neko', 'generated'), { recursive: true });
    await writeFile(path.join(workspaceRoot, 'neko', 'generated', 'image.png'), bytes);
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const service = createNodeHostContentReadService({ workspaceRoot });
    const locator = {
      kind: 'generated-output',
      outputId: 'image-1',
      revision: 'revision-1',
      digest,
      path: 'neko/generated/image.png',
    } as const satisfies ContentLocator;

    await expect(service.read(locator)).resolves.toMatchObject({
      status: 'ready',
      locator,
      bytes,
      fingerprint: { strategy: 'sha256', value: digest },
    });
    await expect(service.read({ ...locator, digest: 'sha256:changed' })).resolves.toEqual({
      status: 'unavailable',
      locator: { ...locator, digest: 'sha256:changed' },
      diagnostic: { code: 'content-changed' },
    });
  });

  it('rejects package resources when no package owner handler is composed', async () => {
    const workspaceRoot = await createTempDir();
    const service = createNodeHostContentReadService({ workspaceRoot });
    const locator = {
      kind: 'package-resource',
      packageId: 'voice-pack-1',
      revision: 'revision-1',
      resourcePath: 'voices/line.wav',
    } as const satisfies ContentLocator;

    await expect(service.read(locator)).resolves.toEqual({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-unsupported' },
    });
  });
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'neko-host-content-read-'));
  tempDirs.push(dir);
  return dir;
}
