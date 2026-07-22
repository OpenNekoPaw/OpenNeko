import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizedWorkspaceWriter, ContentLocator, ContentReadService } from '@neko/shared';
import { createNodeHostContentReadService } from '@neko/shared/vscode/extension/node-content-read-service';
import { NodeAuthorizedWorkspaceWriter } from '@neko/shared/vscode/extension/workspace-content-writer';
import { MediaLibraryCopyService } from './MediaLibraryCopyService';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const sources: readonly ContentLocator[] = [
  { kind: 'workspace-file', path: 'neko/assets/Source/image.png' },
  {
    kind: 'document-entry',
    source: { kind: 'workspace-file', path: 'neko/assets/Books/book.epub' },
    entryPath: 'images/cover.png',
  },
  {
    kind: 'generated-output',
    outputId: 'output-1',
    revision: 'rev-1',
    digest: 'sha256:output',
    path: 'image.png',
  },
  {
    kind: 'package-resource',
    packageId: 'package-1',
    revision: '1.0.0',
    resourcePath: 'portrait.png',
  },
];

describe('MediaLibraryCopyService', () => {
  it.each(sources)('copies $kind content through read and writer ports', async (source) => {
    const read = vi.fn(async () => ({
      status: 'ready' as const,
      locator: source,
      bytes: new Uint8Array([1, 2, 3]),
      offset: 0,
      totalByteLength: 3,
      fingerprint: { strategy: 'sha256' as const, value: 'sha256:source' },
    }));
    const write = vi.fn(async (destination) => ({
      status: 'written' as const,
      locator: destination,
      byteLength: 3,
    }));
    const service = createService(read, write);

    const result = await service.copy({
      source,
      libraryName: 'Target',
      destinationDirectory: 'neko/assets/Target/Characters',
      fileName: 'portrait.png',
      conflict: 'fail-if-exists',
    });

    expect(result).toMatchObject({
      status: 'copied',
      source,
      destination: {
        kind: 'workspace-file',
        path: 'neko/assets/Target/Characters/portrait.png',
      },
    });
    expect(read).toHaveBeenCalledWith(source, {});
    expect(write).toHaveBeenCalledWith(
      { kind: 'workspace-file', path: 'neko/assets/Target/Characters/portrait.png' },
      new Uint8Array([1, 2, 3]),
      { conflict: 'fail-if-exists' },
    );
  });

  it('rejects unavailable libraries and destinations outside the selected root', async () => {
    const read = vi.fn();
    const write = vi.fn();
    const service = createService(read, write);
    const source = sources[0]!;

    await expect(
      service.copy({
        source,
        libraryName: 'Target',
        destinationDirectory: 'neko/assets/Other',
        fileName: 'portrait.png',
        conflict: 'replace',
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-unauthorized' },
    });
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('copies generated and document content through the shared Host read service', async () => {
    const workspaceRoot = await createTempDir('workspace');
    const targetRoot = await createTempDir('target');
    await mkdir(path.join(workspaceRoot, 'neko', 'assets'), { recursive: true });
    await symlink(targetRoot, path.join(workspaceRoot, 'neko', 'assets', 'Target'));
    await mkdir(path.join(workspaceRoot, 'neko', 'generated'), { recursive: true });
    await mkdir(path.join(workspaceRoot, 'books'), { recursive: true });
    const generatedBytes = new TextEncoder().encode('generated-bytes');
    await writeFile(path.join(workspaceRoot, 'neko', 'generated', 'portrait.png'), generatedBytes);
    await writeFile(path.join(workspaceRoot, 'books', 'characters.epub'), 'archive');
    const documentBytes = new TextEncoder().encode('document-entry-bytes');
    const readEntry = vi.fn(async () => documentBytes);
    const service = new MediaLibraryCopyService(
      {
        list: async () => [
          {
            name: 'Target',
            workspacePath: 'neko/assets/Target',
            availability: 'available',
          },
        ],
      },
      createNodeHostContentReadService({
        workspaceRoot,
        documentEntryReader: { readEntry },
      }),
      new NodeAuthorizedWorkspaceWriter({ workspaceRoot }),
    );

    const generated: ContentLocator = {
      kind: 'generated-output',
      outputId: 'portrait-1',
      revision: 'revision-1',
      digest: `sha256:${createHash('sha256').update(generatedBytes).digest('hex')}`,
      path: 'neko/generated/portrait.png',
    };
    const document: ContentLocator = {
      kind: 'document-entry',
      source: { kind: 'workspace-file', path: 'books/characters.epub' },
      entryPath: 'OPS/cover.png',
    };

    await expect(
      service.copy({
        source: generated,
        libraryName: 'Target',
        destinationDirectory: 'neko/assets/Target',
        fileName: 'generated.png',
        conflict: 'fail-if-exists',
      }),
    ).resolves.toMatchObject({ status: 'copied', source: generated });
    await expect(
      service.copy({
        source: document,
        libraryName: 'Target',
        destinationDirectory: 'neko/assets/Target',
        fileName: 'document.png',
        conflict: 'fail-if-exists',
      }),
    ).resolves.toMatchObject({ status: 'copied', source: document });

    await expect(readFile(path.join(targetRoot, 'generated.png'))).resolves.toEqual(
      Buffer.from(generatedBytes),
    );
    await expect(readFile(path.join(targetRoot, 'document.png'))).resolves.toEqual(
      Buffer.from(documentBytes),
    );
    expect(readEntry).toHaveBeenCalledWith(
      path.join(workspaceRoot, 'books', 'characters.epub'),
      'OPS/cover.png',
    );
  });
});

function createService(
  read: ReturnType<typeof vi.fn>,
  write: ReturnType<typeof vi.fn>,
): MediaLibraryCopyService {
  return new MediaLibraryCopyService(
    {
      list: async () => [
        {
          name: 'Target',
          workspacePath: 'neko/assets/Target',
          availability: 'available',
        },
      ],
    },
    { read, stat: vi.fn() } as unknown as ContentReadService,
    { write } as unknown as AuthorizedWorkspaceWriter,
  );
}

async function createTempDir(label: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `neko-media-copy-${label}-`));
  tempDirs.push(dir);
  return dir;
}
