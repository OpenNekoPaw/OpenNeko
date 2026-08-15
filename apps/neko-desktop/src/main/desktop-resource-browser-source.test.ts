import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeProjectEntityDocument } from '@neko/entity-domain';
import type { ILogger } from '@neko/shared/logger';
import type { ResourceBrowserIdentity } from '@neko/assets-domain/resource-browser/contract';
import type {
  AssetLibraryMembershipRecord,
  AssetLibraryMembershipRepository,
} from '@neko/assets-domain/global-library/membership';
import {
  presentResourceBrowserContentItem,
  presentResourceBrowserMediaLibraryRootItem,
} from '@neko/assets-domain/resource-browser/presenter';
import { createElectronNekoHostPorts } from './electron-host-ports';
import {
  createResourceBrowserNodeProjectionSource,
  createResourceBrowserNodeReadSource,
  readGlobalMediaLibraryChildren,
  searchGlobalAssetCatalog,
  searchGlobalMediaLibraries,
} from '@neko/assets-node';
import {
  createGlobalMediaLibraryConnection,
  createWorkspaceLinkedMediaLibrary,
  listGlobalMediaLibraryConnections,
  ProjectMediaLibraryBindingRepository,
  removeGlobalMediaLibraryConnection,
} from '@neko/assets-node';

const temporaryRoots: string[] = [];
const identity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:view-1',
  viewInstanceId: 'view-instance-1',
  rendererSessionId: 'endpoint-1',
};

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('Desktop Resource Browser source', () => {
  it('imports selected regular files as project-owned bytes with conflict-free names', async () => {
    const fixture = await createFixture();
    const source = path.join(fixture.root, 'reference.png');
    await writeFile(source, 'external');
    await writeFile(path.join(fixture.workspace, 'reference.png'), 'existing');
    const composition = createComposition(fixture.workspace, {
      selectWorkspaceFiles: async () => [source],
    });

    await expect(composition.interactions.importFiles({ identity })).resolves.toBe('imported');
    await expect(readFile(path.join(fixture.workspace, 'reference.png'), 'utf8')).resolves.toBe(
      'existing',
    );
    await expect(readFile(path.join(fixture.workspace, 'reference (2).png'), 'utf8')).resolves.toBe(
      'external',
    );
    await expect(readFile(source, 'utf8')).resolves.toBe('external');
  });

  it('leaves project and source unchanged when file import is cancelled or invalid', async () => {
    const fixture = await createFixture();
    const cancelled = createComposition(fixture.workspace, {
      selectWorkspaceFiles: async () => undefined,
    });
    await expect(cancelled.interactions.importFiles({ identity })).resolves.toBe('cancelled');

    const selectedDirectory = path.join(fixture.root, 'selected-directory');
    await mkdir(selectedDirectory);
    await writeFile(path.join(selectedDirectory, 'source.txt'), 'source');
    const invalid = createComposition(fixture.workspace, {
      selectWorkspaceFiles: async () => [selectedDirectory],
    });
    await expect(invalid.interactions.importFiles({ identity })).rejects.toThrow(
      "Selected import 'selected-directory' must be a regular file.",
    );
    await expect(readFile(path.join(selectedDirectory, 'source.txt'), 'utf8')).resolves.toBe(
      'source',
    );
    await expect(lstat(path.join(fixture.workspace, 'selected-directory'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('projects a required-but-unlinked Media Library only from canonical project references', async () => {
    const fixture = await createFixture();
    const nekoDirectory = path.join(fixture.workspace, 'neko');
    await mkdir(nekoDirectory, { recursive: true });
    await writeFile(
      path.join(nekoDirectory, 'entities.json'),
      encodeProjectEntityDocument({
        projectId: identity.projectId,
        entities: [
          {
            entityId: 'character-a',
            kind: 'character',
            names: { canonical: 'Character A', aliases: [] },
            representations: [
              {
                bindingId: 'binding-footage',
                target: {
                  kind: 'media-library',
                  libraryName: 'Footage',
                  relativePath: 'shot.mov',
                },
                role: 'portrait',
                source: 'user',
                acceptedAt: '2026-08-01T00:00:00.000Z',
              },
            ],
            lifecycle: { state: 'active' },
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    );
    const host = createElectronNekoHostPorts({
      homedir: fixture.root,
      nekoHome: path.join(fixture.root, '.openneko'),
      workspaceRoot: fixture.workspace,
      logger: createLogger(),
    });
    const workspace = {
      workspaceId: identity.workspaceId,
      workspacePath: fixture.workspace,
      displayName: 'Fixture',
      locator: { kind: 'relative' as const, value: 'workspace' },
    };
    const source = createResourceBrowserNodeReadSource({
      projectId: identity.projectId,
      globalAssetRoot: path.join(fixture.root, '.openneko', 'assets'),
      globalMediaLibraryRoot: path.join(fixture.root, '.openneko', 'media-libraries'),
      workspace,
      host,
    });

    await expect(source.media.search({ identity, query: '', limit: 20 })).resolves.toEqual([
      expect.objectContaining({
        label: 'Footage',
        libraryName: 'Footage',
        libraryStatus: expect.objectContaining({
          state: 'required-unlinked',
          referenceCount: 1,
          missingCount: 1,
        }),
      }),
    ]);
  });

  it('keeps inspectable Media Libraries available when one Canvas document is invalid', async () => {
    const fixture = await createFixture();
    const libraryRoot = path.join(fixture.root, 'Library');
    await mkdir(libraryRoot);
    await writeFile(path.join(libraryRoot, 'clip.mp4'), 'clip');
    await bindProjectMediaLibrary(fixture.workspace, libraryRoot, 'Library');
    await writeFile(
      path.join(fixture.workspace, 'Untitled.nkc'),
      JSON.stringify({
        name: 'Untitled',
        viewport: null,
        nodes: [
          {
            id: 'media-a',
            type: 'media',
            position: { x: 0, y: 0 },
            size: { width: 320, height: 180 },
            zIndex: 1,
            data: {
              assetPath: 'https://example.test/runtime-only.mp4',
              mediaType: 'video',
            },
          },
        ],
        connections: [],
      }),
    );
    const host = createElectronNekoHostPorts({
      homedir: fixture.root,
      nekoHome: path.join(fixture.root, '.openneko'),
      workspaceRoot: fixture.workspace,
      logger: createLogger(),
    });
    const workspace = {
      workspaceId: identity.workspaceId,
      workspacePath: fixture.workspace,
      displayName: 'Fixture',
      locator: { kind: 'relative' as const, value: 'workspace' },
    };
    const source = createResourceBrowserNodeReadSource({
      projectId: identity.projectId,
      globalAssetRoot: path.join(fixture.root, '.openneko', 'assets'),
      globalMediaLibraryRoot: path.join(fixture.root, '.openneko', 'media-libraries'),
      workspace,
      host,
    });

    await expect(source.media.search({ identity, query: '', limit: 20 })).resolves.toEqual([
      expect.objectContaining({
        libraryName: 'Library',
        libraryStatus: expect.objectContaining({ state: 'unreferenced-local-binding' }),
      }),
    ]);
  });

  it('keeps Asset Library content independent from connected Media Library files', async () => {
    const fixture = await createFixture();
    const globalAssetRoot = path.join(fixture.root, 'home', '.neko', 'assets');
    const globalMediaLibraryRoot = path.join(fixture.root, 'home', '.neko', 'media-libraries');
    const externalLibrary = path.join(fixture.root, 'Footage');
    await mkdir(path.join(globalAssetRoot, 'Editorial'), { recursive: true });
    await mkdir(path.join(externalLibrary, 'shots'), { recursive: true });
    await writeFile(path.join(globalAssetRoot, 'Editorial', 'owned.mp4'), 'owned');
    await writeFile(path.join(externalLibrary, 'shots', 'external.mp4'), 'external');
    await writeFile(path.join(fixture.workspace, 'project-only.mp4'), 'must-not-appear');
    await utimes(
      path.join(globalAssetRoot, 'Editorial', 'owned.mp4'),
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-01T00:00:00.000Z'),
    );
    const host = createElectronNekoHostPorts({
      homedir: path.join(fixture.root, 'home'),
      nekoHome: path.join(fixture.root, 'home', '.neko'),
      workspaceRoot: fixture.workspace,
      logger: createLogger(),
    });
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: globalMediaLibraryRoot,
      sourceDirectory: externalLibrary,
      locationKind: 'nas',
    });

    const assets = await searchGlobalAssetCatalog({
      globalAssetRoot,
      files: host.files,
      memberships: createMemoryAssetMembershipRepository(),
      query: '',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    const libraries = await searchGlobalMediaLibraries({
      mediaLibraryRoot: globalMediaLibraryRoot,
      files: host.files,
      query: '',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    const searchMatches = await searchGlobalMediaLibraries({
      mediaLibraryRoot: globalMediaLibraryRoot,
      files: host.files,
      query: 'external',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });

    expect(assets.map((item) => item.label)).toEqual(['owned.mp4']);
    expect(libraries).toEqual([
      expect.objectContaining({
        libraryId,
        libraryLabel: 'Footage',
        label: 'Footage',
        kind: 'library',
        locationKind: 'nas',
      }),
    ]);
    expect(searchMatches).toEqual([
      expect.objectContaining({
        libraryId,
        libraryLabel: 'Footage',
        label: 'external.mp4',
        relativePath: 'shots/external.mp4',
        kind: 'file',
      }),
    ]);
    expect(JSON.stringify(assets)).not.toContain('external.mp4');
    expect(JSON.stringify(libraries)).not.toContain(fixture.root);
  });

  it('browses Media Library directories and removes only their connection', async () => {
    const fixture = await createFixture();
    const mediaLibraryRoot = path.join(fixture.root, 'home', '.neko', 'media-libraries');
    const target = path.join(fixture.root, 'References');
    await mkdir(path.join(target, 'images'), { recursive: true });
    await writeFile(path.join(target, 'images', 'hero.png'), 'hero');
    const host = createElectronNekoHostPorts({
      homedir: path.join(fixture.root, 'home'),
      nekoHome: path.join(fixture.root, 'home', '.neko'),
      workspaceRoot: fixture.workspace,
      logger: createLogger(),
    });
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot,
      sourceDirectory: target,
      locationKind: 'cloud',
    });

    const rootEntries = await readGlobalMediaLibraryChildren({
      mediaLibraryRoot,
      files: host.files,
      libraryId,
      relativePath: '',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    const imageEntries = await readGlobalMediaLibraryChildren({
      mediaLibraryRoot,
      files: host.files,
      libraryId,
      relativePath: 'images',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    expect(rootEntries).toEqual([
      expect.objectContaining({
        libraryLabel: 'References',
        kind: 'directory',
        relativePath: 'images',
      }),
    ]);
    expect(imageEntries).toEqual([
      expect.objectContaining({ kind: 'file', relativePath: 'images/hero.png' }),
    ]);

    await removeGlobalMediaLibraryConnection({ mediaLibraryRoot, libraryId });
    await expect(readFile(path.join(target, 'images', 'hero.png'), 'utf8')).resolves.toBe('hero');
  });

  it('exposes the same read authority to Home without composing interaction effects', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.workspace, 'brief.md'), '# Brief');
    const host = createElectronNekoHostPorts({
      homedir: fixture.root,
      nekoHome: path.join(fixture.root, '.openneko'),
      workspaceRoot: fixture.workspace,
      logger: createLogger(),
    });
    const source = createResourceBrowserNodeReadSource({
      projectId: identity.projectId,
      globalAssetRoot: path.join(fixture.root, '.openneko', 'assets'),
      globalMediaLibraryRoot: path.join(fixture.root, '.openneko', 'media-libraries'),
      workspace: {
        workspaceId: identity.workspaceId,
        workspacePath: fixture.workspace,
        displayName: 'Fixture',
        locator: { kind: 'relative', value: 'workspace' },
      },
      host,
    });

    await expect(source.files.list({ identity, query: 'brief', limit: 20 })).resolves.toEqual([
      expect.objectContaining({
        label: 'brief.md',
        locator: { kind: 'workspace-file', path: 'brief.md' },
      }),
    ]);
  });

  it('projects Files, Media and Assets through their owning identities', async () => {
    const fixture = await createFixture();
    const globalAssetRoot = path.join(fixture.root, '.openneko', 'assets');
    await mkdir(globalAssetRoot, { recursive: true });
    await writeFile(path.join(globalAssetRoot, 'lighting.png'), 'asset');
    const mediaRoot = path.join(fixture.root, 'linked-media');
    await mkdir(mediaRoot);
    await writeFile(path.join(mediaRoot, 'voice.wav'), 'audio');
    await bindProjectMediaLibrary(fixture.workspace, mediaRoot, 'Voice');
    await mkdir(path.join(fixture.workspace, 'coverage'), { recursive: true });
    await writeFile(path.join(fixture.workspace, 'coverage', 'favicon.png'), 'report');
    await writeFile(path.join(fixture.workspace, 'index.ts'), 'export {};');
    await writeFile(path.join(fixture.workspace, 'workspace-only.mp4'), 'video');

    const createThumbnail = vi.fn(async () => 'data:image/png;base64,YXVkaW8=');
    const composition = createComposition(fixture.workspace, { createThumbnail });
    const media = await composition.source.media.search({
      identity,
      query: 'voice',
      limit: 20,
    });
    const allMedia = await composition.source.media.search({
      identity,
      query: '',
      limit: 20,
    });
    const assets = await composition.source.assets.list({
      identity,
      query: 'lighting',
      limit: 20,
    });

    expect(media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locator: {
            kind: 'media-library',
            libraryName: 'Voice',
            relativePath: 'voice.wav',
          },
        }),
      ]),
    );
    const voice = media.find(
      (entry) =>
        entry.role !== 'library-root' &&
        entry.locator.kind === 'media-library' &&
        entry.locator.relativePath === 'voice.wav',
    );
    if (!voice || voice.role === 'library-root') {
      throw new Error('Missing external media fixture.');
    }
    await expect(
      composition.interactions.resolveThumbnail({
        identity,
        item: presentResourceBrowserContentItem(voice, 'media'),
        descriptor: {
          descriptorId: 'thumbnail-voice',
          sourceFingerprint: '1',
          mediaType: 'audio',
        },
      }),
    ).resolves.toBe('data:image/png;base64,YXVkaW8=');
    expect(createThumbnail).toHaveBeenCalledWith(await realpath(path.join(mediaRoot, 'voice.wav')));
    expect(assets).toEqual([
      expect.objectContaining({
        owner: 'global-asset-library',
        label: 'lighting.png',
        kind: 'asset',
        availability: 'available',
      }),
    ]);
    expect(
      allMedia.some(
        (entry) =>
          entry.role !== 'library-root' &&
          entry.locator.kind === 'workspace-file' &&
          entry.locator.path === 'index.ts',
      ),
    ).toBe(false);
    expect(
      allMedia.some(
        (entry) =>
          entry.role !== 'library-root' &&
          entry.locator.kind === 'workspace-file' &&
          entry.locator.path === 'coverage/favicon.png',
      ),
    ).toBe(false);
    expect(
      allMedia.some(
        (entry) =>
          entry.role !== 'library-root' &&
          entry.locator.kind === 'workspace-file' &&
          entry.locator.path === 'workspace-only.mp4',
      ),
    ).toBe(false);
    expect(JSON.stringify({ media, assets })).not.toContain(fixture.root);
  });

  it('opens an in-app Preview, reveals an authorized item and rejects an unmanaged symlink escape', async () => {
    const fixture = await createFixture();
    const outside = path.join(fixture.root, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'secret.png'), 'secret');
    await symlink(outside, path.join(fixture.workspace, 'escape'));
    await mkdir(path.join(fixture.workspace, 'assets'));
    await writeFile(path.join(fixture.workspace, 'assets', 'cat.png'), 'cat');
    const openPath = vi.fn(async () => undefined);
    const openPreview = vi.fn(async () => undefined);
    const revealPath = vi.fn(async () => undefined);
    const createThumbnail = vi.fn(async () => 'data:image/png;base64,Y2F0');
    const composition = createComposition(fixture.workspace, {
      openPath,
      openPreview,
      revealPath,
      createThumbnail,
    });
    const item = {
      resourceId: 'content:cat',
      source: 'media' as const,
      role: 'content' as const,
      depth: 0,
      kind: 'image' as const,
      label: 'cat.png',
      locator: { kind: 'workspace-file' as const, path: 'assets/cat.png' },
      capabilities: ['preview', 'reveal'] as const,
    };

    const target = {
      viewId: 'preview:project-view-1:temporary',
      presentation: 'temporary' as const,
    };
    await composition.interactions.preview({ identity, item, target });
    await composition.interactions.reveal({ identity, item });
    await expect(
      composition.interactions.resolveThumbnail({
        identity,
        item,
        descriptor: {
          descriptorId: 'thumbnail-cat',
          sourceFingerprint: '1',
          mediaType: 'image',
        },
      }),
    ).resolves.toBe('data:image/png;base64,Y2F0');

    expect(openPreview).toHaveBeenCalledWith({
      identity,
      item,
      absolutePath: expect.stringMatching(/\/workspace\/assets\/cat\.png$/u),
      target,
    });
    expect(openPath).not.toHaveBeenCalled();
    expect(revealPath).toHaveBeenCalledOnce();
    expect(createThumbnail).toHaveBeenCalledOnce();
    await expect(
      composition.interactions.preview({
        identity,
        target,
        item: {
          ...item,
          resourceId: 'content:escape',
          locator: {
            kind: 'workspace-file',
            path: 'escape/secret.png',
          },
        },
      }),
    ).rejects.toThrow('crosses an unmanaged symlink');
  });

  it('rejects one unbound external-media thumbnail without disabling project-file thumbnails', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.workspace, 'local.png'), 'local');
    const createThumbnail = vi.fn(async () => 'data:image/png;base64,aW1hZ2U=');
    const composition = createComposition(fixture.workspace, { createThumbnail });
    const descriptor = {
      descriptorId: 'thumbnail-fixture',
      sourceFingerprint: '1',
      mediaType: 'image',
    };

    await expect(
      composition.interactions.resolveThumbnail({
        identity,
        item: {
          resourceId: 'media:missing-library:missing.png',
          source: 'media',
          role: 'content',
          depth: 0,
          kind: 'image',
          label: 'missing.png',
          locator: {
            kind: 'media-library',
            libraryName: 'Missing Library',
            relativePath: 'missing.png',
          },
          capabilities: ['preview'],
        },
        descriptor,
      }),
    ).rejects.toThrow('Media Library content is unavailable: content-missing.');

    await expect(
      composition.interactions.resolveThumbnail({
        identity,
        item: {
          resourceId: 'content:local.png',
          source: 'files',
          role: 'content',
          depth: 0,
          kind: 'image',
          label: 'local.png',
          locator: { kind: 'workspace-file', path: 'local.png' },
          capabilities: ['preview'],
        },
        descriptor,
      }),
    ).resolves.toBe('data:image/png;base64,aW1hZ2U=');
    expect(createThumbnail).toHaveBeenCalledTimes(1);
  });

  it('projects OTIO through Cut and Fountain through the package Preview route', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.workspace, 'story.otio'), '{"OTIO_SCHEMA":"Timeline.1"}');
    await writeFile(path.join(fixture.workspace, 'pilot.fountain'), 'INT. ROOM - DAY');
    const mediaRoot = path.join(fixture.root, 'linked-media');
    await mkdir(mediaRoot);
    await writeFile(path.join(mediaRoot, 'story.otio'), '{"OTIO_SCHEMA":"Timeline.1"}');
    await bindProjectMediaLibrary(fixture.workspace, mediaRoot, 'Editorial');
    const openCreativeDocument = vi.fn(async () => undefined);
    const composition = createComposition(fixture.workspace, { openCreativeDocument });
    const mediaRoots = await composition.source.media.search({
      identity,
      query: '',
      limit: 20,
    });
    const editorialRoot = mediaRoots.find((entry) => entry.libraryName === 'Editorial');
    if (!editorialRoot) throw new Error('Missing Editorial library fixture.');
    const media = await composition.source.media.children({
      identity,
      parent:
        editorialRoot.role === 'library-root'
          ? presentResourceBrowserMediaLibraryRootItem(editorialRoot)
          : presentResourceBrowserContentItem(editorialRoot, 'media'),
      limit: 20,
    });
    const files = await composition.source.files.list({
      identity,
      query: '',
      limit: 20,
    });
    const cut = media.find(
      (entry) =>
        entry.role !== 'library-root' &&
        entry.locator.kind === 'media-library' &&
        entry.locator.libraryName === 'Editorial' &&
        entry.locator.relativePath === 'story.otio',
    );

    expect(cut).toMatchObject({
      capabilities: ['read', 'bind'],
      metadata: { mediaType: 'cut' },
    });
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'pilot.fountain',
          capabilities: expect.arrayContaining(['preview']),
          metadata: expect.objectContaining({ mediaType: 'text' }),
        }),
      ]),
    );

    await composition.interactions.openCreativeDocument({
      identity,
      item: {
        resourceId: 'content:story',
        source: 'files',
        role: 'content',
        depth: 0,
        kind: 'file',
        label: 'story.otio',
        locator: { kind: 'workspace-file', path: 'story.otio' },
        capabilities: ['open-creative-document', 'reveal'],
      },
    });
    expect(openCreativeDocument).toHaveBeenCalledWith({
      identity,
      item: expect.objectContaining({ label: 'story.otio' }),
      absolutePath: expect.stringMatching(/\/workspace\/story\.otio$/u),
      kind: 'cut',
    });
  });

  it('adds a selected directory through links without copying the library', async () => {
    const fixture = await createFixture();
    const selected = path.join(fixture.root, 'Media Source');
    await mkdir(selected);
    await writeFile(path.join(selected, 'unreferenced.mov'), 'external-only');
    const composition = createComposition(fixture.workspace, {
      selectSource: async () => selected,
    });

    await expect(composition.interactions.addDirectoryLibrary({ identity })).resolves.toBe('added');

    expect(
      (
        await lstat(
          path.join(fixture.root, '.openneko', 'media-libraries', 'local', 'Media Source'),
        )
      ).isSymbolicLink(),
    ).toBe(true);
    expect(
      await listGlobalMediaLibraryConnections(
        path.join(fixture.root, '.openneko', 'media-libraries'),
      ),
    ).toEqual([
      expect.objectContaining({
        name: 'Media Source',
        locationKind: 'local',
        availability: 'available',
      }),
    ]);
    await expect(
      lstat(path.join(fixture.workspace, 'neko', 'assets', 'Media Source')),
    ).resolves.toMatchObject({});
    await expect(readFile(path.join(selected, 'unreferenced.mov'), 'utf8')).resolves.toBe(
      'external-only',
    );
  });

  it('reuses the exact existing global connection and projects it into External Media', async () => {
    const fixture = await createFixture();
    const selected = path.join(fixture.root, 'Assets');
    const globalMediaLibraryRoot = path.join(fixture.root, '.openneko', 'media-libraries');
    await mkdir(selected);
    await writeFile(path.join(selected, 'linked.mov'), 'external-only');
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: globalMediaLibraryRoot,
      sourceDirectory: selected,
      locationKind: 'local',
    });
    const composition = createComposition(fixture.workspace, {
      selectGlobalLibrary: async () => libraryId,
    });

    await expect(composition.interactions.linkGlobalLibrary({ identity })).resolves.toBe('linked');

    await expect(listGlobalMediaLibraryConnections(globalMediaLibraryRoot)).resolves.toEqual([
      expect.objectContaining({ libraryId, name: 'Assets', availability: 'available' }),
    ]);
    await expect(
      readFile(path.join(fixture.workspace, 'neko', 'assets', 'Assets', 'linked.mov'), 'utf8'),
    ).resolves.toBe('external-only');
    await expect(
      composition.source.media.search({ identity, query: '', limit: 20 }),
    ).resolves.toEqual([
      expect.objectContaining({
        libraryName: 'Assets',
        libraryStatus: expect.objectContaining({ state: 'unreferenced-local-binding' }),
      }),
    ]);
    await expect(readFile(path.join(selected, 'linked.mov'), 'utf8')).resolves.toBe(
      'external-only',
    );
  });

  it('rejects a same-name global connection that targets another directory', async () => {
    const fixture = await createFixture();
    const connected = path.join(fixture.root, 'connected', 'Assets');
    const selected = path.join(fixture.root, 'selected', 'Assets');
    const globalMediaLibraryRoot = path.join(fixture.root, '.openneko', 'media-libraries');
    await mkdir(connected, { recursive: true });
    await mkdir(selected, { recursive: true });
    await writeFile(path.join(connected, 'connected.mov'), 'connected');
    await writeFile(path.join(selected, 'selected.mov'), 'selected');
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: globalMediaLibraryRoot,
      sourceDirectory: connected,
      locationKind: 'local',
    });
    const composition = createComposition(fixture.workspace, {
      selectSource: async () => selected,
    });

    await expect(composition.interactions.addDirectoryLibrary({ identity })).rejects.toThrow();

    await expect(
      lstat(path.join(fixture.workspace, 'neko', 'assets', 'Assets')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(listGlobalMediaLibraryConnections(globalMediaLibraryRoot)).resolves.toEqual([
      expect.objectContaining({ libraryId, name: 'Assets', availability: 'available' }),
    ]);
    await expect(readFile(path.join(connected, 'connected.mov'), 'utf8')).resolves.toBe(
      'connected',
    );
    await expect(readFile(path.join(selected, 'selected.mov'), 'utf8')).resolves.toBe('selected');
  });

  it('keeps cancelled directory selection free of local and global mutation', async () => {
    const fixture = await createFixture();
    const globalMediaLibraryRoot = path.join(fixture.root, '.openneko', 'media-libraries');
    const composition = createComposition(fixture.workspace, {
      selectSource: async () => undefined,
    });

    await expect(composition.interactions.addDirectoryLibrary({ identity })).resolves.toBe(
      'cancelled',
    );
    await expect(listGlobalMediaLibraryConnections(globalMediaLibraryRoot)).resolves.toEqual([]);
    await expect(
      lstat(path.join(fixture.workspace, '.neko', 'media-libraries')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rolls back a newly registered global connection when project association fails', async () => {
    const fixture = await createFixture();
    const selected = path.join(fixture.root, 'Rollback Source');
    const conflict = path.join(fixture.workspace, 'neko', 'assets', 'Rollback Source');
    const globalMediaLibraryRoot = path.join(fixture.root, '.openneko', 'media-libraries');
    await Promise.all([mkdir(selected, { recursive: true }), mkdir(conflict, { recursive: true })]);
    const composition = createComposition(fixture.workspace, {
      selectSource: async () => selected,
    });

    await expect(composition.interactions.addDirectoryLibrary({ identity })).rejects.toThrow(
      'conflicts',
    );

    await expect(listGlobalMediaLibraryConnections(globalMediaLibraryRoot)).resolves.toEqual([]);
    await expect(lstat(conflict)).resolves.toMatchObject({});
    await expect(
      lstat(path.join(fixture.workspace, '.neko', 'media-libraries', 'Rollback Source.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('relinks and removes only the selected managed media library root', async () => {
    const fixture = await createFixture();
    const first = path.join(fixture.root, 'original', 'First');
    const second = path.join(fixture.root, 'replacement', 'Second');
    await mkdir(first, { recursive: true });
    await mkdir(second, { recursive: true });
    await writeFile(path.join(first, 'shared.mov'), 'first');
    await writeFile(path.join(second, 'shared.mov'), 'second');
    await createComposition(fixture.workspace, {
      selectSource: async () => first,
    }).interactions.addDirectoryLibrary({ identity });
    await writeMediaRequirement(fixture.workspace, 'First', 'shared.mov');
    const { libraryId: secondConnectionId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: path.join(fixture.root, '.openneko', 'media-libraries'),
      sourceDirectory: second,
      locationKind: 'local',
    });
    const libraryItem = {
      resourceId: 'content:library',
      source: 'media' as const,
      role: 'library-root' as const,
      depth: 0,
      libraryName: 'First',
      kind: 'directory' as const,
      label: 'First',
      libraryStatus: {
        libraryName: 'First',
        state: 'available' as const,
        referenceCount: 0,
        missingCount: 0,
        operationFingerprint: 'sha256:first',
      },
      capabilities: [] as const,
    };
    const composition = createComposition(fixture.workspace, {
      selectGlobalLibrary: async () => secondConnectionId,
    });

    await expect(
      composition.interactions.relinkSource({ identity, item: libraryItem }),
    ).resolves.toBe('relinked');
    await expect(
      readFile(path.join(fixture.workspace, 'neko', 'assets', 'First', 'shared.mov'), 'utf8'),
    ).resolves.toBe('second');

    await composition.interactions.removeSource({ identity, item: libraryItem });
    await expect(
      lstat(path.join(fixture.workspace, 'neko', 'assets', 'First')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(path.join(first, 'shared.mov'), 'utf8')).resolves.toBe('first');
    await expect(readFile(path.join(second, 'shared.mov'), 'utf8')).resolves.toBe('second');
  });

  it('projects the Desktop preview and Canvas file kinds shown by the Resource Browser', async () => {
    const fixture = await createFixture();
    const mediaRoot = path.join(fixture.root, 'linked-media');
    await mkdir(mediaRoot);
    await writeFile(path.join(mediaRoot, 'test.glb'), 'glb');
    await bindProjectMediaLibrary(fixture.workspace, mediaRoot, 'Models');
    await writeFile(path.join(fixture.workspace, 'test_model.html'), '<main>model</main>');
    await writeFile(path.join(fixture.workspace, 'candidates.json'), '{"items":[]}');
    await writeFile(path.join(fixture.workspace, 'test.glb'), 'glb');
    await writeFile(path.join(fixture.workspace, 'Untitled.nkc'), '{"unexpectedField":1}');
    const composition = createComposition(fixture.workspace);

    const mediaRoots = await composition.source.media.search({
      identity,
      query: '',
      limit: 20,
    });
    const modelsRoot = mediaRoots.find((entry) => entry.libraryName === 'Models');
    if (!modelsRoot) throw new Error('Missing Models library fixture.');
    const media = await composition.source.media.children({
      identity,
      parent:
        modelsRoot.role === 'library-root'
          ? presentResourceBrowserMediaLibraryRootItem(modelsRoot)
          : presentResourceBrowserContentItem(modelsRoot, 'media'),
      limit: 20,
    });
    const files = await composition.source.files.list({
      identity,
      query: '',
      limit: 20,
    });

    expect(media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'test.glb',
          locator: {
            kind: 'media-library',
            libraryName: 'Models',
            relativePath: 'test.glb',
          },
          capabilities: expect.arrayContaining(['preview']),
          metadata: expect.objectContaining({ mediaType: 'model' }),
        }),
      ]),
    );
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'test_model.html',
          capabilities: expect.arrayContaining(['preview']),
          metadata: expect.objectContaining({ mediaType: 'text' }),
        }),
        expect.objectContaining({
          label: 'candidates.json',
          capabilities: expect.arrayContaining(['preview']),
          metadata: expect.objectContaining({ mediaType: 'text' }),
        }),
        expect.objectContaining({
          label: 'test.glb',
          capabilities: expect.arrayContaining(['preview']),
          metadata: expect.objectContaining({ mediaType: 'model' }),
        }),
        expect.objectContaining({
          label: 'Untitled.nkc',
          capabilities: ['read', 'bind'],
          metadata: expect.objectContaining({ mediaType: 'canvas' }),
        }),
      ]),
    );
  });
  it('browses nested directories through their exact Media Library identity', async () => {
    const fixture = await createFixture();
    const mediaRoot = path.join(fixture.root, 'linked-media');
    await mkdir(path.join(mediaRoot, 'Media'), { recursive: true });
    await writeFile(path.join(mediaRoot, 'Media', 'clip.mp4'), 'clip');
    await bindProjectMediaLibrary(fixture.workspace, mediaRoot, 'Assets');
    const composition = createComposition(fixture.workspace);

    const roots = await composition.source.media.search({ identity, query: '', limit: 20 });
    const root = roots.find((entry) => entry.libraryName === 'Assets');
    if (!root || root.role !== 'library-root') {
      throw new Error('Missing Assets Media Library root fixture.');
    }
    const rootChildren = await composition.source.media.children({
      identity,
      parent: presentResourceBrowserMediaLibraryRootItem(root),
      limit: 20,
    });
    const mediaDirectory = rootChildren.find(
      (entry) =>
        entry.role === 'directory' &&
        entry.locator.kind === 'media-library' &&
        entry.locator.relativePath === 'Media',
    );
    if (!mediaDirectory || mediaDirectory.role !== 'directory') {
      throw new Error('Missing nested Media directory fixture.');
    }

    await expect(
      composition.source.media.children({
        identity,
        parent: presentResourceBrowserContentItem(mediaDirectory, 'media'),
        limit: 20,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        label: 'clip.mp4',
        locator: {
          kind: 'media-library',
          libraryName: 'Assets',
          relativePath: 'Media/clip.mp4',
        },
        parentLocator: {
          kind: 'media-library',
          libraryName: 'Assets',
          relativePath: 'Media',
        },
      }),
    ]);
  });
});

async function createFixture(): Promise<{ readonly root: string; readonly workspace: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-browser-'));
  temporaryRoots.push(root);
  const workspace = path.join(root, 'workspace');
  await mkdir(workspace);
  return { root, workspace };
}

function createComposition(
  workspacePath: string,
  effects: {
    readonly openPath?: (absolutePath: string) => Promise<void>;
    readonly openPreview?: (input: {
      readonly identity: ResourceBrowserIdentity;
      readonly item: Parameters<
        ReturnType<typeof createResourceBrowserNodeProjectionSource>['interactions']['preview']
      >[0]['item'];
      readonly absolutePath: string;
      readonly target: Parameters<
        ReturnType<typeof createResourceBrowserNodeProjectionSource>['interactions']['preview']
      >[0]['target'];
    }) => Promise<void>;
    readonly openCreativeDocument?: (input: {
      readonly identity: ResourceBrowserIdentity;
      readonly item: Parameters<
        ReturnType<
          typeof createResourceBrowserNodeProjectionSource
        >['interactions']['openCreativeDocument']
      >[0]['item'];
      readonly absolutePath: string;
      readonly kind: 'canvas' | 'cut';
    }) => Promise<void>;
    readonly revealPath?: (absolutePath: string) => Promise<void>;
    readonly selectSource?: (windowId: string) => Promise<string | undefined>;
    readonly selectWorkspaceFiles?: (windowId: string) => Promise<readonly string[] | undefined>;
    readonly selectGlobalLibrary?: Parameters<
      typeof createResourceBrowserNodeProjectionSource
    >[0]['selectGlobalLibrary'];
    readonly createThumbnail?: (absolutePath: string) => Promise<string>;
  } = {},
) {
  const host = createElectronNekoHostPorts({
    homedir: path.dirname(workspacePath),
    nekoHome: path.join(path.dirname(workspacePath), '.openneko'),
    workspaceRoot: workspacePath,
    logger: createLogger(),
    revealPath: effects.revealPath,
  });
  return createResourceBrowserNodeProjectionSource({
    projectId: 'project-1',
    globalAssetRoot: path.join(path.dirname(workspacePath), '.openneko', 'assets'),
    assetLibraryMemberships: createMemoryAssetMembershipRepository(),
    globalMediaLibraryRoot: path.join(path.dirname(workspacePath), '.openneko', 'media-libraries'),
    workspace: {
      workspaceId: 'workspace-1',
      workspacePath,
      displayName: 'Fixture',
      locator: { kind: 'relative', value: 'workspace' },
    },
    host,
    openPreview: effects.openPreview ?? (async () => undefined),
    openCreativeDocument: effects.openCreativeDocument ?? (async () => undefined),
    openTextEditor: async () => undefined,
    selectSource: effects.selectSource ?? (async () => undefined),
    selectWorkspaceFiles: effects.selectWorkspaceFiles ?? (async () => undefined),
    trashWorkspaceItem: async () => undefined,
    selectGlobalLibrary: effects.selectGlobalLibrary ?? (async () => undefined),
    mutateGlobalMediaLibraries: (operation) => operation(),
    createThumbnail: effects.createThumbnail ?? (async () => 'data:image/png;base64,aW1hZ2U='),
    addToCanvas: async () => undefined,
    addToCut: async () => undefined,
  });
}

async function writeMediaRequirement(
  workspacePath: string,
  libraryName: string,
  relativePath: string,
): Promise<void> {
  const nekoDirectory = path.join(workspacePath, 'neko');
  await mkdir(nekoDirectory, { recursive: true });
  await writeFile(
    path.join(nekoDirectory, 'entities.json'),
    encodeProjectEntityDocument({
      projectId: identity.projectId,
      entities: [
        {
          entityId: `entity-${libraryName.toLocaleLowerCase().replaceAll(' ', '-')}`,
          kind: 'character',
          names: { canonical: libraryName, aliases: [] },
          representations: [
            {
              bindingId: `binding-${libraryName.toLocaleLowerCase().replaceAll(' ', '-')}`,
              target: {
                kind: 'media-library',
                libraryName,
                relativePath,
              },
              role: 'portrait',
              source: 'user',
              acceptedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
          lifecycle: { state: 'active' },
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    }),
  );
}

async function bindProjectMediaLibrary(
  workspacePath: string,
  sourceDirectory: string,
  libraryName = path.basename(sourceDirectory),
): Promise<void> {
  const connection = await createGlobalMediaLibraryConnection({
    mediaLibraryRoot: path.join(path.dirname(workspacePath), '.openneko', 'media-libraries'),
    sourceDirectory,
    locationKind: 'local',
  });
  await createWorkspaceLinkedMediaLibrary({
    workspaceRoot: workspacePath,
    name: libraryName,
    targetDirectory: sourceDirectory,
  });
  await new ProjectMediaLibraryBindingRepository(workspacePath, identity.projectId).apply({
    libraryName,
    connectionId: connection.libraryId,
    expectedBindingFingerprint: null,
  });
}

function createMemoryAssetMembershipRepository(): AssetLibraryMembershipRepository {
  const records = new Map<string, AssetLibraryMembershipRecord>();
  return {
    async get(membershipId) {
      return records.get(membershipId) ?? null;
    },
    async findBySourceRelativePath(sourceRelativePath) {
      return (
        [...records.values()].find((record) => record.sourceRelativePath === sourceRelativePath) ??
        null
      );
    },
    async listActive() {
      return [...records.values()].filter((record) => record.state === 'active');
    },
    async registerDiscovered(registrations) {
      for (const registration of registrations) {
        const existing = [...records.values()].find(
          (record) => record.sourceRelativePath === registration.sourceRelativePath,
        );
        if (existing?.state === 'removed') continue;
        const record: AssetLibraryMembershipRecord = {
          membershipId: existing?.membershipId ?? registration.membershipId,
          sourceRelativePath: registration.sourceRelativePath,
          label: registration.label,
          mediaType: registration.mediaType,
          byteLength: registration.byteLength,
          modifiedAt: registration.modifiedAt,
          state: 'active',
          createdAt: existing?.createdAt ?? registration.registeredAt,
          updatedAt: registration.registeredAt,
        };
        records.set(record.membershipId, record);
      }
    },
    async activate(registration) {
      const existing = [...records.values()].find(
        (record) => record.sourceRelativePath === registration.sourceRelativePath,
      );
      const record: AssetLibraryMembershipRecord = {
        membershipId: existing?.membershipId ?? registration.membershipId,
        sourceRelativePath: registration.sourceRelativePath,
        label: registration.label,
        mediaType: registration.mediaType,
        byteLength: registration.byteLength,
        modifiedAt: registration.modifiedAt,
        state: 'active',
        createdAt: existing?.createdAt ?? registration.registeredAt,
        updatedAt: registration.registeredAt,
      };
      records.set(record.membershipId, record);
      return record;
    },
    async removeMany(membershipIds, removedAt) {
      const active = membershipIds.map((membershipId) => {
        const existing = records.get(membershipId);
        if (!existing || existing.state !== 'active') throw new Error('missing active membership');
        return existing;
      });
      return active.map((existing) => {
        const removed = { ...existing, state: 'removed' as const, updatedAt: removedAt };
        records.set(existing.membershipId, removed);
        return removed;
      });
    },
    async relocateMany(relocations) {
      const active = relocations.map((relocation) => {
        const existing = records.get(relocation.membershipId);
        if (
          !existing ||
          existing.state !== 'active' ||
          existing.sourceRelativePath !== relocation.expectedSourceRelativePath
        ) {
          throw new Error('missing active membership');
        }
        return { existing, relocation };
      });
      return active.map(({ existing, relocation }) => {
        const relocated = {
          ...existing,
          sourceRelativePath: relocation.sourceRelativePath,
          label: relocation.label,
          updatedAt: relocation.relocatedAt,
        };
        records.set(existing.membershipId, relocated);
        return relocated;
      });
    },
  };
}

function createLogger(): ILogger {
  return {
    source: 'test',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => createLogger(),
    setLevel: vi.fn(),
  };
}
