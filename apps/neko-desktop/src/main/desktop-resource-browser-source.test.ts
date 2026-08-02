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
import {
  ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
  encodeEntityRepresentationBindingFile,
} from '@neko-entity/domain';
import type { ILogger } from '@neko/shared/logger';
import type { ResourceBrowserIdentity } from '@neko-assets/domain/resource-browser/contract';
import { presentResourceBrowserContentItem } from '@neko-assets/domain/resource-browser/presenter';
import { createElectronNekoHostPorts } from './electron-host-ports';
import {
  createResourceBrowserNodeProjectionSource,
  createResourceBrowserNodeReadSource,
  readGlobalMediaLibraryChildren,
  searchGlobalAssetCatalog,
  searchGlobalMediaLibraries,
} from '@neko-assets/node';
import {
  createGlobalMediaLibraryConnection,
  listGlobalMediaLibraryConnections,
  removeGlobalMediaLibraryConnection,
} from '@neko-assets/node';
import { WorkspaceMediaLibrarySyncService } from '@neko-assets/node';

const temporaryRoots: string[] = [];
const identity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:view-1',
  viewEpoch: 1,
  endpointEpoch: 'endpoint-1',
};

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('Desktop Resource Browser source', () => {
  it('projects a required-but-unlinked Media Library from authoritative project references', async () => {
    const fixture = await createFixture();
    const nekoDirectory = path.join(fixture.workspace, 'neko');
    await mkdir(nekoDirectory, { recursive: true });
    await writeFile(
      path.join(nekoDirectory, 'entity-representation-bindings.json'),
      encodeEntityRepresentationBindingFile({
        version: ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
        bindings: [
          {
            id: 'binding-footage',
            entityId: 'character-a',
            entityKind: 'character',
            representation: {
              kind: 'workspace-file',
              path: 'neko/assets/Footage/shot.mov',
            },
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    );
    const host = createElectronNekoHostPorts({
      homedir: fixture.root,
      nekoHome: path.join(fixture.root, '.openneko'),
      workspaceRoot: fixture.workspace,
      version: '0.0.1',
      logger: createLogger(),
    });
    const workspace = {
      workspaceId: identity.workspaceId,
      workspacePath: fixture.workspace,
      displayName: 'Fixture',
      locator: { kind: 'relative' as const, value: 'workspace' },
    };
    const source = createResourceBrowserNodeReadSource({
      workspace,
      host,
      workspaceMediaLibrarySync: new WorkspaceMediaLibrarySyncService(
        path.join(fixture.root, '.openneko', 'media-libraries'),
      ),
    });

    await expect(source.media.search({ identity, query: '', limit: 20 })).resolves.toEqual([
      expect.objectContaining({
        label: 'Footage',
        libraryName: 'Footage',
        availability: 'unavailable',
        capabilities: [],
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
    await mkdir(path.join(fixture.workspace, 'neko', 'assets'), { recursive: true });
    await symlink(libraryRoot, path.join(fixture.workspace, 'neko', 'assets', 'Library'));
    await writeFile(
      path.join(fixture.workspace, 'Untitled.nkc'),
      JSON.stringify({
        version: '3.0',
        name: 'Untitled',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
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
      version: '0.0.1',
      logger: createLogger(),
    });
    const workspace = {
      workspaceId: identity.workspaceId,
      workspacePath: fixture.workspace,
      displayName: 'Fixture',
      locator: { kind: 'relative' as const, value: 'workspace' },
    };
    const workspaceMediaLibrarySync = new WorkspaceMediaLibrarySyncService(
      path.join(fixture.root, '.openneko', 'media-libraries'),
    );
    const source = createResourceBrowserNodeReadSource({
      workspace,
      host,
      workspaceMediaLibrarySync,
    });

    await expect(source.media.search({ identity, query: '', limit: 20 })).resolves.toEqual([
      expect.objectContaining({
        label: 'Library',
        availability: 'available',
        libraryStatus: expect.objectContaining({
          state: 'unreferenced-linked',
        }),
      }),
    ]);
    await expect(workspaceMediaLibrarySync.inspect(workspace)).resolves.toMatchObject({
      coverage: 'incomplete',
      portability: {
        state: 'coverage-incomplete',
      },
    });
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
      version: '0.0.1',
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
      version: '0.0.1',
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
      version: '0.0.1',
      logger: createLogger(),
    });
    const source = createResourceBrowserNodeReadSource({
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

  it('projects workspace files, linked media and Character representations as portable locators', async () => {
    const fixture = await createFixture();
    const mediaRoot = path.join(fixture.root, 'linked-media');
    await mkdir(mediaRoot);
    await writeFile(path.join(mediaRoot, 'voice.wav'), 'audio');
    await mkdir(path.join(fixture.workspace, 'neko', 'assets'), { recursive: true });
    await symlink(mediaRoot, path.join(fixture.workspace, 'neko', 'assets', 'Voice'));
    await mkdir(path.join(fixture.workspace, 'characters'), { recursive: true });
    await writeFile(path.join(fixture.workspace, 'characters', 'neko.png'), 'image');
    await mkdir(path.join(fixture.workspace, 'coverage'), { recursive: true });
    await writeFile(path.join(fixture.workspace, 'coverage', 'favicon.png'), 'report');
    await writeFile(path.join(fixture.workspace, 'index.ts'), 'export {};');
    await writeFile(path.join(fixture.workspace, 'workspace-only.mp4'), 'video');
    await writeFile(
      path.join(fixture.workspace, 'characters.json'),
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'character-neko',
            canonicalName: 'Neko',
            aliases: ['猫'],
            status: 'confirmed',
          },
        ],
      }),
    );
    await writeFile(
      path.join(fixture.workspace, 'neko', 'entity-representation-bindings.json'),
      JSON.stringify({
        version: 2,
        bindings: [
          {
            id: 'binding-neko',
            entityId: 'character-neko',
            entityKind: 'character',
            representation: {
              kind: 'workspace-file',
              path: 'characters/neko.png',
            },
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: '2026-07-28T00:00:00.000Z',
          },
        ],
      }),
    );

    const composition = createComposition(fixture.workspace);
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
    const entityProjection = await composition.source.entities.list({
      identity,
      query: '',
      limit: 20,
    });

    expect(media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locator: {
            kind: 'workspace-file',
            path: 'neko/assets/Voice/voice.wav',
          },
        }),
      ]),
    );
    expect(entityProjection).toMatchObject({
      entities: [{ id: 'character-neko', kind: 'character' }],
      bindings: [
        {
          representation: {
            kind: 'workspace-file',
            path: 'characters/neko.png',
          },
        },
      ],
    });
    expect(
      allMedia.some(
        (entry) => entry.locator.kind === 'workspace-file' && entry.locator.path === 'index.ts',
      ),
    ).toBe(false);
    expect(
      allMedia.some(
        (entry) =>
          entry.locator.kind === 'workspace-file' && entry.locator.path === 'coverage/favicon.png',
      ),
    ).toBe(false);
    expect(
      allMedia.some(
        (entry) =>
          entry.locator.kind === 'workspace-file' && entry.locator.path === 'workspace-only.mp4',
      ),
    ).toBe(false);
    expect(JSON.stringify({ media, entityProjection })).not.toContain(fixture.root);
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
      facet: 'media' as const,
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
      expectedWorkbenchRevision: 3,
    };
    await composition.interactions.preview({ identity, item, target });
    await composition.interactions.reveal({ identity, item });
    await expect(
      composition.interactions.resolveThumbnail({
        identity,
        item,
        descriptor: {
          descriptorId: 'thumbnail-cat',
          revision: '1',
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
    ).rejects.toThrow('outside its authorized workspace source');
  });

  it('projects OTIO through Cut and Fountain through the package Preview route', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.workspace, 'story.otio'), '{"OTIO_SCHEMA":"Timeline.1"}');
    await writeFile(path.join(fixture.workspace, 'pilot.fountain'), 'INT. ROOM - DAY');
    const mediaRoot = path.join(fixture.root, 'linked-media');
    await mkdir(mediaRoot);
    await writeFile(path.join(mediaRoot, 'story.otio'), '{"OTIO_SCHEMA":"Timeline.1"}');
    await mkdir(path.join(fixture.workspace, 'neko', 'assets'), { recursive: true });
    await symlink(mediaRoot, path.join(fixture.workspace, 'neko', 'assets', 'Editorial'));
    const openCut = vi.fn(async () => undefined);
    const composition = createComposition(fixture.workspace, { openCut });
    const mediaRoots = await composition.source.media.search({
      identity,
      query: '',
      limit: 20,
    });
    const editorialRoot = mediaRoots.find((entry) => entry.libraryName === 'Editorial');
    if (!editorialRoot) throw new Error('Missing Editorial library fixture.');
    const media = await composition.source.media.children({
      identity,
      parent: presentResourceBrowserContentItem(editorialRoot, 'media'),
      limit: 20,
    });
    const files = await composition.source.files.list({
      identity,
      query: '',
      limit: 20,
    });
    const cut = media.find(
      (entry) =>
        entry.locator.kind === 'workspace-file' &&
        entry.locator.path === 'neko/assets/Editorial/story.otio',
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

    await composition.interactions.openCut({
      identity,
      item: {
        resourceId: 'content:story',
        facet: 'media',
        role: 'content',
        depth: 0,
        kind: 'file',
        label: 'story.otio',
        locator: { kind: 'workspace-file', path: 'story.otio' },
        capabilities: ['open-cut', 'reveal'],
      },
    });
    expect(openCut).toHaveBeenCalledWith({
      identity,
      item: expect.objectContaining({ label: 'story.otio' }),
      absolutePath: expect.stringMatching(/\/workspace\/story\.otio$/u),
    });
  });

  it('shares the confirmed Entity and active representation policy with Agent mentions', async () => {
    const fixture = await createFixture();
    await mkdir(path.join(fixture.workspace, 'neko'), { recursive: true });
    await writeFile(
      path.join(fixture.workspace, 'characters.json'),
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'confirmed',
            canonicalName: 'Confirmed',
            aliases: [],
            status: 'confirmed',
          },
          {
            id: 'candidate',
            canonicalName: 'Candidate',
            aliases: [],
            status: 'candidate',
          },
        ],
      }),
    );
    await writeFile(
      path.join(fixture.workspace, 'neko', 'entity-representation-bindings.json'),
      JSON.stringify({
        version: 2,
        bindings: [
          {
            id: 'binding-confirmed',
            entityId: 'confirmed',
            entityKind: 'character',
            representation: { kind: 'workspace-file', path: 'confirmed.png' },
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: '2026-07-29T00:00:00.000Z',
          },
        ],
      }),
    );

    const result = await createComposition(fixture.workspace).source.entities.list({
      identity,
      query: '',
      limit: 20,
    });

    expect(result.entities.map((entity) => entity.id)).toEqual(['confirmed']);
    expect(result.bindings.map((binding) => binding.id)).toEqual(['binding-confirmed']);
  });

  it('adds a selected directory through links without copying the library', async () => {
    const fixture = await createFixture();
    const selected = path.join(fixture.root, 'Media Source');
    await mkdir(selected);
    await writeFile(path.join(selected, 'unreferenced.mov'), 'external-only');
    const didMutateGlobalMediaLibraries = vi.fn();
    const composition = createComposition(fixture.workspace, {
      selectSource: async () => selected,
      didMutateGlobalMediaLibraries,
    });

    await expect(composition.interactions.addDirectoryLibrary({ identity })).resolves.toBe('added');

    const link = await lstat(path.join(fixture.workspace, 'neko', 'assets', 'Media Source'));
    expect(link.isSymbolicLink()).toBe(true);
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
    expect(await realpath(path.join(fixture.workspace, 'neko', 'assets', 'Media Source'))).toBe(
      await realpath(selected),
    );
    await expect(readFile(path.join(selected, 'unreferenced.mov'), 'utf8')).resolves.toBe(
      'external-only',
    );
    expect(didMutateGlobalMediaLibraries).toHaveBeenCalledOnce();
  });

  it('links a configured global library by identity without projecting its path', async () => {
    const fixture = await createFixture();
    const selected = path.join(fixture.root, 'Global Footage');
    const globalMediaLibraryRoot = path.join(fixture.root, '.openneko', 'media-libraries');
    await mkdir(selected);
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: globalMediaLibraryRoot,
      sourceDirectory: selected,
      locationKind: 'nas',
    });
    const selectGlobalLibrary = vi.fn(async () => libraryId);
    const composition = createComposition(fixture.workspace, { selectGlobalLibrary });

    await expect(composition.interactions.linkGlobalLibrary({ identity })).resolves.toBe('linked');

    expect(selectGlobalLibrary).toHaveBeenCalledWith({
      windowId: identity.windowId,
      libraries: [{ libraryId, name: 'Global Footage', locationKind: 'nas' }],
    });
    expect(await realpath(path.join(fixture.workspace, 'neko', 'assets', 'Global Footage'))).toBe(
      await realpath(selected),
    );
  });

  it('rolls back a newly created global library when the workspace link fails', async () => {
    const fixture = await createFixture();
    const selected = path.join(fixture.root, 'Conflict');
    await mkdir(selected);
    await mkdir(path.join(fixture.workspace, 'neko', 'assets', 'Conflict'), { recursive: true });
    const globalMediaLibraryRoot = path.join(fixture.root, '.openneko', 'media-libraries');
    const didMutateGlobalMediaLibraries = vi.fn();
    const composition = createComposition(fixture.workspace, {
      selectSource: async () => selected,
      didMutateGlobalMediaLibraries,
    });

    await expect(composition.interactions.addDirectoryLibrary({ identity })).rejects.toThrow();
    await expect(listGlobalMediaLibraryConnections(globalMediaLibraryRoot)).resolves.toEqual([]);
    expect(didMutateGlobalMediaLibraries).not.toHaveBeenCalled();
  });

  it('relinks and removes only the selected managed media library root', async () => {
    const fixture = await createFixture();
    const first = path.join(fixture.root, 'original', 'First');
    const second = path.join(fixture.root, 'replacement', 'First');
    await mkdir(first, { recursive: true });
    await mkdir(second, { recursive: true });
    await writeFile(path.join(first, 'first-only.mov'), 'first');
    await writeFile(path.join(second, 'second-only.mov'), 'second');
    await createComposition(fixture.workspace, {
      selectSource: async () => first,
    }).interactions.addDirectoryLibrary({ identity });
    const libraryItem = {
      resourceId: 'content:library',
      facet: 'media' as const,
      role: 'library-root' as const,
      depth: 0,
      libraryName: 'First',
      kind: 'directory' as const,
      label: 'First',
      locator: { kind: 'workspace-file' as const, path: 'neko/assets/First' },
      capabilities: ['reveal'] as const,
    };
    const composition = createComposition(fixture.workspace, {
      selectSource: async () => second,
    });

    await expect(
      composition.interactions.relinkSource({ identity, item: libraryItem }),
    ).resolves.toBe('relinked');
    expect(await realpath(path.join(fixture.workspace, 'neko', 'assets', 'First'))).toBe(
      await realpath(second),
    );
    expect(
      await realpath(path.join(fixture.root, '.openneko', 'media-libraries', 'local', 'First')),
    ).toBe(await realpath(second));
    expect(
      (await lstat(path.join(fixture.workspace, 'neko', 'assets', 'First'))).isSymbolicLink(),
    ).toBe(true);
    expect(
      (
        await lstat(path.join(fixture.root, '.openneko', 'media-libraries', 'local', 'First'))
      ).isSymbolicLink(),
    ).toBe(true);

    await composition.interactions.removeSource({ identity, item: libraryItem });
    await expect(
      lstat(path.join(fixture.workspace, 'neko', 'assets', 'First')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(path.join(first, 'first-only.mov'), 'utf8')).resolves.toBe('first');
    await expect(readFile(path.join(second, 'second-only.mov'), 'utf8')).resolves.toBe('second');
  });

  it('projects the Desktop preview and Canvas file kinds shown by the Resource Browser', async () => {
    const fixture = await createFixture();
    const mediaRoot = path.join(fixture.root, 'linked-media');
    await mkdir(mediaRoot);
    await writeFile(path.join(mediaRoot, 'test.glb'), 'glb');
    await mkdir(path.join(fixture.workspace, 'neko', 'assets'), { recursive: true });
    await symlink(mediaRoot, path.join(fixture.workspace, 'neko', 'assets', 'Models'));
    await writeFile(path.join(fixture.workspace, 'test_model.html'), '<main>model</main>');
    await writeFile(path.join(fixture.workspace, 'candidates.json'), '{"items":[]}');
    await writeFile(path.join(fixture.workspace, 'test.glb'), 'glb');
    await writeFile(path.join(fixture.workspace, 'Untitled.nkc'), '{"version":1}');
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
      parent: presentResourceBrowserContentItem(modelsRoot, 'media'),
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
            kind: 'workspace-file',
            path: 'neko/assets/Models/test.glb',
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
    readonly openCut?: (input: {
      readonly identity: ResourceBrowserIdentity;
      readonly item: Parameters<
        ReturnType<typeof createResourceBrowserNodeProjectionSource>['interactions']['openCut']
      >[0]['item'];
      readonly absolutePath: string;
    }) => Promise<void>;
    readonly revealPath?: (absolutePath: string) => Promise<void>;
    readonly selectSource?: (windowId: string) => Promise<string | undefined>;
    readonly selectGlobalLibrary?: Parameters<
      typeof createResourceBrowserNodeProjectionSource
    >[0]['selectGlobalLibrary'];
    readonly didMutateGlobalMediaLibraries?: () => void;
    readonly createThumbnail?: (absolutePath: string) => Promise<string>;
  } = {},
) {
  const host = createElectronNekoHostPorts({
    homedir: path.dirname(workspacePath),
    nekoHome: path.join(path.dirname(workspacePath), '.openneko'),
    workspaceRoot: workspacePath,
    version: '0.0.1',
    logger: createLogger(),
    revealPath: effects.revealPath,
  });
  return createResourceBrowserNodeProjectionSource({
    globalMediaLibraryRoot: path.join(path.dirname(workspacePath), '.openneko', 'media-libraries'),
    workspace: {
      workspaceId: 'workspace-1',
      workspacePath,
      displayName: 'Fixture',
      locator: { kind: 'relative', value: 'workspace' },
    },
    host,
    openPreview: effects.openPreview ?? (async () => undefined),
    openCut: effects.openCut ?? (async () => undefined),
    selectSource: effects.selectSource ?? (async () => undefined),
    selectGlobalLibrary: effects.selectGlobalLibrary ?? (async () => undefined),
    mutateGlobalMediaLibraries: (operation) => operation(),
    didMutateGlobalMediaLibraries: effects.didMutateGlobalMediaLibraries ?? (() => undefined),
    createThumbnail: effects.createThumbnail ?? (async () => 'data:image/png;base64,aW1hZ2U='),
    addToCanvas: async () => undefined,
    addToCut: async () => undefined,
  });
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
