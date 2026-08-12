import { lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  AssetLibraryMembershipRecord,
  AssetLibraryMembershipRepository,
} from '@neko/assets-domain/global-library/membership';
import type { HostFileSystemPort } from '@neko/host/ports';
import { createGlobalMediaLibraryConnection } from './global-media-library-files';
import {
  ResourceBrowserNodeRuntime,
  type ResourceBrowserNodeRuntimeOptions,
  type ResourceBrowserShellProjection,
} from './resource-browser-node-runtime';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('ResourceBrowserNodeRuntime global Library mutations', () => {
  it('moves Asset files while preserving identity and removes memberships without deleting bytes', async () => {
    const fixture = await createFixture();
    const source = path.join(fixture.assetRoot, 'incoming', 'hero.png');
    const destination = path.join(fixture.assetRoot, 'organized');
    await mkdir(path.dirname(source), { recursive: true });
    await mkdir(destination);
    await writeFile(source, 'hero');
    fixture.memberships.seed(assetRecord('asset-hero', 'incoming/hero.png', 'hero.png'));
    fixture.setMoveDestination(destination);

    const projection = await fixture.runtime.searchHomeAssets(searchInput(fixture.windowId));
    const item = projection.items.find((candidate) => candidate.id === 'asset-hero');
    if (!item) throw new Error('Expected the Asset membership projection.');

    await expect(
      fixture.runtime.moveHomeItems({ windowId: fixture.windowId, itemIds: [item.id] }),
    ).resolves.toEqual({ status: 'moved', itemIds: ['asset-hero'] });
    await expect(readFile(path.join(destination, 'hero.png'), 'utf8')).resolves.toBe('hero');
    await expect(fixture.memberships.repository.get('asset-hero')).resolves.toMatchObject({
      membershipId: 'asset-hero',
      sourceRelativePath: 'organized/hero.png',
      label: 'hero.png',
    });

    await fixture.runtime.searchHomeAssets(searchInput(fixture.windowId));
    await expect(
      fixture.runtime.removeHomeAssets({ windowId: fixture.windowId, assetIds: ['asset-hero'] }),
    ).resolves.toEqual({ status: 'removed', assetIds: ['asset-hero'] });
    await expect(readFile(path.join(destination, 'hero.png'), 'utf8')).resolves.toBe('hero');
    await expect(fixture.memberships.repository.get('asset-hero')).resolves.toMatchObject({
      state: 'removed',
    });
  });

  it('retains a missing Asset membership with exact fields and allows explicit removal', async () => {
    const fixture = await createFixture();
    fixture.memberships.seed(assetRecord('asset-missing', 'missing/hero.png', 'hero.png'));

    const projection = await fixture.runtime.searchHomeAssets(searchInput(fixture.windowId));
    expect(projection.items).toEqual([
      expect.objectContaining({
        id: 'asset-missing',
        availability: 'unavailable',
        description: 'missing/hero.png',
        unavailable: {
          fieldNames: ['sourceRelativePath'],
          message: 'Asset source file is unavailable.',
        },
      }),
    ]);
    expect(projection.items[0]?.thumbnail).toBeUndefined();

    await expect(
      fixture.runtime.removeHomeAssets({
        windowId: fixture.windowId,
        assetIds: ['asset-missing'],
      }),
    ).resolves.toEqual({ status: 'removed', assetIds: ['asset-missing'] });
    await expect(fixture.memberships.repository.get('asset-missing')).resolves.toMatchObject({
      state: 'removed',
    });
  });

  it('moves Media files only inside one connection and rebuilds their locator identity', async () => {
    const fixture = await createFixture();
    const library = path.join(fixture.root, 'Footage');
    const destination = path.join(library, 'organized');
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(library, 'shot.png'), 'shot');
    await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.mediaLibraryRoot,
      sourceDirectory: library,
      locationKind: 'local',
    });
    fixture.setMoveDestination(destination);

    const before = await fixture.runtime.searchHomeMediaLibraries({
      ...searchInput(fixture.windowId),
      query: 'shot',
    });
    const item = before.items.find((candidate) => candidate.kind === 'file');
    if (!item) throw new Error('Expected a Media Library file projection.');

    await expect(
      fixture.runtime.moveHomeItems({ windowId: fixture.windowId, itemIds: [item.id] }),
    ).resolves.toEqual({ status: 'moved', itemIds: [item.id] });
    await expect(readFile(path.join(destination, 'shot.png'), 'utf8')).resolves.toBe('shot');
    await expect(lstat(path.join(library, 'shot.png'))).rejects.toMatchObject({ code: 'ENOENT' });

    const after = await fixture.runtime.searchHomeMediaLibraries({
      ...searchInput(fixture.windowId),
      query: 'shot',
    });
    const movedItem = after.items.find((candidate) => candidate.kind === 'file');
    expect(movedItem).toMatchObject({ relativePath: 'organized/shot.png' });
    expect(movedItem?.id).not.toBe(item.id);
  });

  it('preserves files when destination selection is cancelled', async () => {
    const fixture = await createFixture();
    const source = path.join(fixture.assetRoot, 'hero.png');
    await mkdir(fixture.assetRoot, { recursive: true });
    await writeFile(source, 'hero');
    fixture.memberships.seed(assetRecord('asset-hero', 'hero.png', 'hero.png'));
    fixture.setMoveDestination(undefined);
    await fixture.runtime.searchHomeAssets(searchInput(fixture.windowId));

    await expect(
      fixture.runtime.moveHomeItems({ windowId: fixture.windowId, itemIds: ['asset-hero'] }),
    ).resolves.toEqual({ status: 'cancelled' });
    await expect(readFile(source, 'utf8')).resolves.toBe('hero');
    await expect(fixture.memberships.repository.get('asset-hero')).resolves.toMatchObject({
      sourceRelativePath: 'hero.png',
    });
  });

  it('rejects mixed owners, cross-library files, and stale identities before mutation', async () => {
    const fixture = await createFixture();
    const assetPath = path.join(fixture.assetRoot, 'asset.png');
    await mkdir(fixture.assetRoot, { recursive: true });
    await writeFile(assetPath, 'asset');
    fixture.memberships.seed(assetRecord('asset-one', 'asset.png', 'asset.png'));
    await fixture.runtime.searchHomeAssets(searchInput(fixture.windowId));

    const firstLibrary = path.join(fixture.root, 'FirstLibrary');
    const secondLibrary = path.join(fixture.root, 'SecondLibrary');
    await mkdir(firstLibrary);
    await mkdir(secondLibrary);
    await writeFile(path.join(firstLibrary, 'shared.png'), 'first');
    await writeFile(path.join(secondLibrary, 'shared.png'), 'second');
    await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.mediaLibraryRoot,
      sourceDirectory: firstLibrary,
      locationKind: 'local',
    });
    await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.mediaLibraryRoot,
      sourceDirectory: secondLibrary,
      locationKind: 'local',
    });
    const media = await fixture.runtime.searchHomeMediaLibraries({
      ...searchInput(fixture.windowId),
      query: 'shared',
    });
    const files = media.items.filter((candidate) => candidate.kind === 'file');
    expect(files).toHaveLength(2);

    await expect(
      fixture.runtime.moveHomeItems({
        windowId: fixture.windowId,
        itemIds: ['asset-one', files[0]!.id],
      }),
    ).rejects.toThrow('requires one resource owner');
    await expect(
      fixture.runtime.moveHomeItems({
        windowId: fixture.windowId,
        itemIds: files.map((item) => item.id),
      }),
    ).rejects.toThrow('requires files from one connection');

    await fixture.runtime.searchHomeMediaLibraries({
      ...searchInput(fixture.windowId),
      query: 'no-match',
    });
    await expect(
      fixture.runtime.moveHomeItems({ windowId: fixture.windowId, itemIds: [files[0]!.id] }),
    ).rejects.toThrow('is stale');
    await expect(readFile(path.join(firstLibrary, 'shared.png'), 'utf8')).resolves.toBe('first');
    await expect(readFile(path.join(secondLibrary, 'shared.png'), 'utf8')).resolves.toBe('second');
  });
});

async function createFixture(): Promise<{
  readonly root: string;
  readonly assetRoot: string;
  readonly mediaLibraryRoot: string;
  readonly windowId: string;
  readonly memberships: ReturnType<typeof createMembershipRepository>;
  readonly runtime: ResourceBrowserNodeRuntime;
  readonly setMoveDestination: (destination: string | undefined) => void;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-global-library-runtime-'));
  temporaryRoots.push(root);
  const assetRoot = path.join(root, 'assets');
  const mediaLibraryRoot = path.join(root, 'media-libraries');
  const memberships = createMembershipRepository();
  let moveDestination: string | undefined;
  const windowId = 'window-1';
  const runtime = new ResourceBrowserNodeRuntime({
    globalAssetRoot: assetRoot,
    globalMediaLibraryRoot: mediaLibraryRoot,
    assetLibraryMemberships: memberships.repository,
    readEntityCharacterResources: async () => [],
    shell: {
      getProjection: async () => ({}) as ResourceBrowserShellProjection,
      resolveProjectWorkspace: async () => {
        throw new Error('Project resolution is not expected.');
      },
      resolveAgentWorkspace: async () => {
        throw new Error('Agent resolution is not expected.');
      },
    },
    host: {
      files: createFilePort(),
      external: { openExternal: async () => undefined },
    },
    openPreview: async () => undefined,
    openCreativeDocument: async () => undefined,
    openTextEditor: async () => undefined,
    selectSource: async () => undefined,
    trashWorkspaceItem: async () => undefined,
    selectConfiguredGlobalMediaLibrary: async () => undefined,
    selectGlobalMediaLibrarySource: async () => undefined,
    selectGlobalAssetSources: async () => undefined,
    selectGlobalLibraryMoveDestination: async () => moveDestination,
    createThumbnail: async () => 'data:image/png;base64,AA==',
    createGlobalLibraryThumbnail: async () => 'data:image/png;base64,AA==',
    openQuickPreview: async () => {
      throw new Error('Quick Preview is not expected.');
    },
    releaseQuickPreview: () => undefined,
    canvas: {
      executeIntent: async () => {
        throw new Error('Canvas intent is not expected.');
      },
    },
    cut: { addResource: async () => undefined },
    entity: {
      executeIntent: async () => {
        throw new Error('Entity intent is not expected.');
      },
    },
  } satisfies ResourceBrowserNodeRuntimeOptions);
  return {
    root,
    assetRoot,
    mediaLibraryRoot,
    windowId,
    memberships,
    runtime,
    setMoveDestination: (destination) => {
      moveDestination = destination;
    },
  };
}

function searchInput(windowId: string) {
  return {
    windowId,
    query: '',
    sortBy: 'name' as const,
    sortDirection: 'ascending' as const,
    limit: 100,
  };
}

function assetRecord(
  membershipId: string,
  sourceRelativePath: string,
  label: string,
): AssetLibraryMembershipRecord {
  return {
    membershipId,
    sourceRelativePath,
    label,
    mediaType: 'image',
    byteLength: null,
    modifiedAt: null,
    state: 'active',
    createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
  };
}

function createMembershipRepository(): {
  readonly repository: AssetLibraryMembershipRepository;
  readonly seed: (record: AssetLibraryMembershipRecord) => void;
} {
  const records = new Map<string, AssetLibraryMembershipRecord>();
  return {
    seed: (record) => records.set(record.membershipId, record),
    repository: {
      get: async (membershipId) => records.get(membershipId) ?? null,
      findBySourceRelativePath: async (sourceRelativePath) =>
        [...records.values()].find((record) => record.sourceRelativePath === sourceRelativePath) ??
        null,
      listActive: async () => [...records.values()].filter((record) => record.state === 'active'),
      registerDiscovered: async () => undefined,
      activate: async () => {
        throw new Error('Asset activation is not expected.');
      },
      removeMany: async (membershipIds, removedAt) =>
        membershipIds.map((membershipId) => {
          const record = records.get(membershipId);
          if (!record || record.state !== 'active') throw new Error('stale membership');
          const removed = { ...record, state: 'removed' as const, updatedAt: removedAt };
          records.set(membershipId, removed);
          return removed;
        }),
      relocateMany: async (relocations) =>
        relocations.map((relocation) => {
          const record = records.get(relocation.membershipId);
          if (
            !record ||
            record.state !== 'active' ||
            record.sourceRelativePath !== relocation.expectedSourceRelativePath
          ) {
            throw new Error('stale membership');
          }
          const relocated = {
            ...record,
            sourceRelativePath: relocation.sourceRelativePath,
            label: relocation.label,
            updatedAt: relocation.relocatedAt,
          };
          records.set(record.membershipId, relocated);
          return relocated;
        }),
    },
  };
}

function createFilePort(): HostFileSystemPort {
  return {
    readText: (filePath) => readFile(filePath, 'utf8'),
    readBytes: (filePath) => readFile(filePath),
    writeText: (filePath, content) => writeFile(filePath, content, 'utf8'),
    writeBytes: (filePath, content) => writeFile(filePath, content),
    rename: async () => undefined,
    readDirectory: async (directoryPath) =>
      (await readdir(directoryPath, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        type: entry.isDirectory()
          ? ('directory' as const)
          : entry.isFile()
            ? ('file' as const)
            : entry.isSymbolicLink()
              ? ('symlink' as const)
              : ('unknown' as const),
      })),
    stat: async (filePath) => {
      const value = await stat(filePath);
      return {
        type: value.isDirectory() ? ('directory' as const) : ('file' as const),
        sizeBytes: value.size,
        modifiedAtMs: value.mtimeMs,
        createdAtMs: value.birthtimeMs,
      };
    },
    createDirectory: async (directoryPath) => {
      await mkdir(directoryPath, { recursive: true });
    },
    delete: async (filePath, options) =>
      rm(filePath, { recursive: options?.recursive ?? false, force: options?.idempotent ?? false }),
  };
}
