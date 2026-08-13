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
  createProjectMediaLibraryBindingFingerprint,
  listGlobalMediaLibraryConnections,
  ProjectMediaLibraryBindingRepository,
  removeGlobalMediaLibraryConnection,
} from '@neko/assets-node';
import { confirmProjectMediaLibraryRecovery } from '@neko/assets-domain/contracts';

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
    await mkdir(path.join(fixture.workspace, 'neko', 'assets'), { recursive: true });
    await symlink(libraryRoot, path.join(fixture.workspace, 'neko', 'assets', 'Library'));
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

    await expect(source.media.search({ identity, query: '', limit: 20 })).resolves.toEqual([]);
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
    await mkdir(path.join(fixture.workspace, 'neko', 'assets'), { recursive: true });
    await symlink(mediaRoot, path.join(fixture.workspace, 'neko', 'assets', 'Voice'));
    await bindProjectMediaLibrary(fixture.workspace, mediaRoot, 'Voice');
    await mkdir(path.join(fixture.workspace, 'coverage'), { recursive: true });
    await writeFile(path.join(fixture.workspace, 'coverage', 'favicon.png'), 'report');
    await writeFile(path.join(fixture.workspace, 'index.ts'), 'export {};');
    await writeFile(path.join(fixture.workspace, 'workspace-only.mp4'), 'video');

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
          entry.locator.kind === 'workspace-file' && entry.locator.path === 'coverage/favicon.png',
      ),
    ).toBe(false);
    expect(
      allMedia.some(
        (entry) =>
          entry.role !== 'library-root' &&
          entry.locator.kind === 'workspace-file' && entry.locator.path === 'workspace-only.mp4',
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
    await writeMediaRequirement(fixture.workspace, 'Media Source', 'unreferenced.mov');
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
      new ProjectMediaLibraryBindingRepository(
        fixture.workspace,
        identity.projectId,
      ).read('Media Source'),
    ).resolves.toMatchObject({ status: 'available' });
    await expect(readFile(path.join(selected, 'unreferenced.mov'), 'utf8')).resolves.toBe(
      'external-only',
    );
  });

  it('links a configured global library by identity without projecting its path', async () => {
    const fixture = await createFixture();
    const selected = path.join(fixture.root, 'Global Footage');
    const globalMediaLibraryRoot = path.join(fixture.root, '.openneko', 'media-libraries');
    await mkdir(selected);
    await writeMediaRequirement(fixture.workspace, 'Global Footage', 'shot.mov');
    await writeFile(path.join(selected, 'shot.mov'), 'shot');
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
    await expect(
      new ProjectMediaLibraryBindingRepository(
        fixture.workspace,
        identity.projectId,
      ).read('Global Footage'),
    ).resolves.toMatchObject({
      status: 'available',
      binding: { connectionId: libraryId },
    });
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

  it('relinks and removes only the selected managed media library root', async () => {
    const fixture = await createFixture();
    const first = path.join(fixture.root, 'original', 'First');
    const second = path.join(fixture.root, 'replacement', 'Second');
    await mkdir(first, { recursive: true });
    await mkdir(second, { recursive: true });
    await writeFile(path.join(first, 'shared.mov'), 'first');
    await writeFile(path.join(second, 'shared.mov'), 'second');
    await writeMediaRequirement(fixture.workspace, 'First', 'shared.mov');
    await createComposition(fixture.workspace, {
      selectSource: async () => first,
    }).interactions.addDirectoryLibrary({ identity });
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
      new ProjectMediaLibraryBindingRepository(fixture.workspace, identity.projectId).read('First'),
    ).resolves.toMatchObject({
      status: 'available',
      binding: { connectionId: secondConnectionId },
    });

    await composition.interactions.removeSource({ identity, item: libraryItem });
    await expect(
      lstat(path.join(fixture.workspace, '.neko', 'media-libraries', 'First.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(path.join(first, 'shared.mov'), 'utf8')).resolves.toBe('first');
    await expect(readFile(path.join(second, 'shared.mov'), 'utf8')).resolves.toBe('second');
  });

  it('projects the Desktop preview and Canvas file kinds shown by the Resource Browser', async () => {
    const fixture = await createFixture();
    const mediaRoot = path.join(fixture.root, 'linked-media');
    await mkdir(mediaRoot);
    await writeFile(path.join(mediaRoot, 'test.glb'), 'glb');
    await mkdir(path.join(fixture.workspace, 'neko', 'assets'), { recursive: true });
    await symlink(mediaRoot, path.join(fixture.workspace, 'neko', 'assets', 'Models'));
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
              target: { kind: 'media-library', libraryName, relativePath },
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
  const { libraryId } = await createGlobalMediaLibraryConnection({
    mediaLibraryRoot: path.join(path.dirname(workspacePath), '.openneko', 'media-libraries'),
    sourceDirectory,
    locationKind: 'local',
  });
  const repository = new ProjectMediaLibraryBindingRepository(workspacePath, identity.projectId);
  const replacementBindingFingerprint = createProjectMediaLibraryBindingFingerprint({
    projectId: identity.projectId,
    libraryName,
    connectionId: libraryId,
  });
  await repository.applyRecovery(
    confirmProjectMediaLibraryRecovery({
      projectId: identity.projectId,
      libraryName,
      connectionId: libraryId,
      requirementFingerprint: 'sha256:test-requirement-1234',
      validatedRelativePaths: [],
      expectedBindingFingerprint: null,
      replacementBindingFingerprint,
    }),
  );
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
