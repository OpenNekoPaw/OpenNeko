import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeDocumentLowLevelAccess } from './node-document-low-level-access';

describe('createNodeDocumentLowLevelAccess', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('reads bounded file ranges and archive entries in the Node host', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'neko-document-access-'));
    tempDirs.push(dir);
    const filePath = path.join(dir, 'bytes.bin');
    await writeFile(filePath, new Uint8Array([0, 1, 2, 3, 4]));
    const archivePath = path.join(dir, 'book.epub');
    await writeArchive(archivePath, 'OPS/chapter.txt', 'chapter');
    const access = createNodeDocumentLowLevelAccess();

    await expect(access.readRange?.(filePath, 1, 3)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(access.readEntry?.(archivePath, 'OPS/chapter.txt')).resolves.toEqual(
      new Uint8Array(Buffer.from('chapter')),
    );
  });

  it('rejects archive traversal before lookup', async () => {
    const access = createNodeDocumentLowLevelAccess();
    await expect(access.readEntry?.('/tmp/missing.epub', '../secret')).rejects.toThrow(
      'escapes the archive root',
    );
  });

  it('rejects an out-of-bounds range before allocating the result buffer', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'neko-document-access-'));
    tempDirs.push(dir);
    const filePath = path.join(dir, 'bytes.bin');
    await writeFile(filePath, new Uint8Array([0, 1, 2]));

    const access = createNodeDocumentLowLevelAccess();
    await expect(access.readRange?.(filePath, 0, 3)).rejects.toThrow(
      'Document range exceeds file length',
    );
  });

  it('rejects oversized whole-file reads before loading bytes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'neko-document-access-'));
    tempDirs.push(dir);
    const filePath = path.join(dir, 'bytes.bin');
    await writeFile(filePath, new Uint8Array([0, 1, 2]));

    const access = createNodeDocumentLowLevelAccess({ maxWholeFileBytes: 2 });
    await expect(access.readFile(filePath)).rejects.toThrow('2-byte limit');
  });

  it('rejects oversized ranges and expanded archive entries', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'neko-document-access-'));
    tempDirs.push(dir);
    const filePath = path.join(dir, 'bytes.bin');
    await writeFile(filePath, new Uint8Array([0, 1, 2]));
    const archivePath = path.join(dir, 'book.epub');
    await writeArchive(archivePath, 'OPS/chapter.txt', 'chapter');
    const access = createNodeDocumentLowLevelAccess({
      maxRangeBytes: 2,
      maxArchiveEntryBytes: 4,
    });

    await expect(access.readRange?.(filePath, 0, 2)).rejects.toThrow('2-byte limit');
    await expect(access.readEntry?.(archivePath, 'OPS/chapter.txt')).rejects.toThrow(
      '4-byte limit',
    );
  });

  it(
    'keeps Node host access out of the browser-safe document barrel',
    async () => {
      const documentApi = await import('./index');
      expect('createNodeDocumentLowLevelAccess' in documentApi).toBe(false);
    },
    30_000,
  );
});

async function writeArchive(filePath: string, entryPath: string, content: string): Promise<void> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  await writer.add(entryPath, new TextReader(content));
  await writeFile(filePath, await writer.close());
}
