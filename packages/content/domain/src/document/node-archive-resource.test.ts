import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeArchiveResource } from './node-archive-resource';

describe('createNodeArchiveResource', () => {
  const tempDirs: string[] = [];
  const openResources: Array<{ dispose(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(openResources.splice(0).map((resource) => resource.dispose()));
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('indexes metadata and decompresses only the exact requested entry', async () => {
    const archivePath = await writeArchive([
      ['META-INF/container.xml', '<container/>'],
      ['OPS/chapter-1.xhtml', '<p>one</p>'],
      ['OPS/chapter-2.xhtml', '<p>two</p>'],
    ]);
    const resource = await createNodeArchiveResource(archivePath);
    openResources.push(resource);

    expect(resource.entries).toEqual([
      { path: 'META-INF/container.xml', byteLength: 12 },
      { path: 'OPS/chapter-1.xhtml', byteLength: 10 },
      { path: 'OPS/chapter-2.xhtml', byteLength: 10 },
    ]);
    await expect(
      resource.readEntry('OPS/chapter-1.xhtml', new AbortController().signal),
    ).resolves.toEqual(new Uint8Array(Buffer.from('<p>one</p>')));
    await expect(
      resource.readEntry('OPS/missing.xhtml', new AbortController().signal),
    ).rejects.toThrow('does not exist');
  });

  it('rejects traversal, duplicate canonical paths, encryption and oversized entries', async () => {
    await expect(
      createNodeArchiveResource(await writeArchive([['../escape.txt', 'x']])),
    ).rejects.toThrow('not canonical');
    await expect(
      createNodeArchiveResource(
        await writeArchive([
          ['OPS/chapter.xhtml', 'one'],
          ['OPS\\chapter.xhtml', 'two'],
        ]),
      ),
    ).rejects.toThrow('duplicate path');
    await expect(
      createNodeArchiveResource(await writeArchive([['secret.txt', 'secret']], 'password')),
    ).rejects.toThrow('encrypted');
    await expect(
      createNodeArchiveResource(await writeArchive([['large.txt', 'large']]), {
        maxEntryBytes: 4,
      }),
    ).rejects.toThrow('4-byte limit');
  });

  it('fails local reads after cancellation, source changes or disposal', async () => {
    const archivePath = await writeArchive([['OPS/chapter.xhtml', 'chapter']]);
    const resource = await createNodeArchiveResource(archivePath);
    openResources.push(resource);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(resource.readEntry('OPS/chapter.xhtml', cancelled.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });

    await writeFile(archivePath, new Uint8Array([1, 2, 3]));
    await expect(
      resource.readEntry('OPS/chapter.xhtml', new AbortController().signal),
    ).rejects.toThrow('source changed');

    await resource.dispose();
    await expect(
      resource.readEntry('OPS/chapter.xhtml', new AbortController().signal),
    ).rejects.toThrow('disposed');
  });

  async function writeArchive(
    entries: readonly (readonly [string, string])[],
    password?: string,
  ): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'neko-archive-resource-'));
    tempDirs.push(dir);
    const archivePath = path.join(dir, 'book.epub');
    const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
    for (const [entryPath, content] of entries) {
      await writer.add(entryPath, new TextReader(content), password ? { password } : undefined);
    }
    await writeFile(archivePath, await writer.close());
    return archivePath;
  }
});
