import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishEpubPreviewResource, type EpubPreviewResourceTree } from './index';

describe('publishEpubPreviewResource', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('publishes one lazy virtual directory with EPUB media types and a trailing-slash URL', async () => {
    const absolutePath = await writeArchive([
      ['META-INF/container.xml', '<container/>'],
      ['OPS/package.opf', '<package/>'],
      ['OPS/chapter.xhtml', '<p>chapter</p>'],
    ]);
    let resourceTree: EpubPreviewResourceTree | undefined;
    const release = vi.fn();
    const registerResourceTree = vi.fn(async (tree: EpubPreviewResourceTree) => {
      resourceTree = tree;
      return {
        url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
        release,
      };
    });

    const lease = await publishEpubPreviewResource({ absolutePath, registerResourceTree });

    expect(lease.url).toBe('openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/');
    expect(registerResourceTree).toHaveBeenCalledOnce();
    expect(resourceTree?.entries).toEqual([
      expect.objectContaining({
        virtualPath: 'META-INF/container.xml',
        byteLength: 12,
        contentType: 'application/xml',
      }),
      expect.objectContaining({
        virtualPath: 'OPS/package.opf',
        contentType: 'application/oebps-package+xml',
      }),
      expect.objectContaining({
        virtualPath: 'OPS/chapter.xhtml',
        contentType: 'application/xhtml+xml',
      }),
    ]);
    const chapter = resourceTree?.entries.find(
      (entry) => entry.virtualPath === 'OPS/chapter.xhtml',
    );
    await expect(chapter?.read(new AbortController().signal)).resolves.toEqual(
      new Uint8Array(Buffer.from('<p>chapter</p>')),
    );

    resourceTree?.release();
    await expect(chapter?.read(new AbortController().signal)).rejects.toThrow('disposed');
  });

  it('rejects an archive without the canonical container before resource registration', async () => {
    const absolutePath = await writeArchive([['OPS/chapter.xhtml', '<p>chapter</p>']]);
    const registerResourceTree = vi.fn();

    await expect(
      publishEpubPreviewResource({ absolutePath, registerResourceTree }),
    ).rejects.toThrow('EPUB container descriptor is missing');
    expect(registerResourceTree).not.toHaveBeenCalled();
  });

  it('rejects and releases a resource publisher that violates the directory URL contract', async () => {
    const absolutePath = await writeArchive([
      ['META-INF/container.xml', '<container/>'],
      ['OPS/chapter.xhtml', '<p>chapter</p>'],
    ]);
    const release = vi.fn();

    await expect(
      publishEpubPreviewResource({
        absolutePath,
        registerResourceTree: async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release,
        }),
      }),
    ).rejects.toThrow('EPUB resource tree URL must end with a slash');
    expect(release).toHaveBeenCalledOnce();
  });

  async function writeArchive(entries: readonly (readonly [string, string])[]): Promise<string> {
    const directory = await mkdtemp(path.join(tmpdir(), 'neko-epub-preview-'));
    tempDirs.push(directory);
    const absolutePath = path.join(directory, 'book.epub');
    const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
    for (const [entryPath, content] of entries) {
      await writer.add(entryPath, new TextReader(content));
    }
    await writeFile(absolutePath, await writer.close());
    return absolutePath;
  }
});
