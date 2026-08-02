import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DEFAULT_CANVAS_DATA } from '@neko/canvas-domain';
import type { ILogger } from '@neko/shared/logger';
import {
  CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
  parseCanvasHostIntentRequest,
  type CanvasHostIntentResult,
} from '@neko/canvas-domain';
import { createResourceBrowserSnapshotRequest } from '@neko/assets-domain/resource-browser/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanvasHostSessionId } from '@neko/canvas-domain';
import { createDesktopResourceBrowserIdentity } from '../shared/resource-browser-bridge-contract';
import type { DesktopWorkbenchViewRef } from '../shared/workbench-contract';
import {
  createResourceToCanvasInteraction,
  ResourceBrowserNodeRuntime,
  type ResourceBrowserNodeRuntimeOptions,
} from '@neko/assets-node';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { createGlobalMediaLibraryConnection } from '@neko/assets-node';
import { DesktopShellService } from './shell-service';
import {
  DesktopShellStateRepository,
  type DesktopShellStateFilePort,
} from './shell-state-repository';
import type { DesktopWorkspaceRegistry } from './desktop-workspace-registry';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

const resourceIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:project-view-1',
  viewEpoch: 1,
  endpointEpoch: 'endpoint-1',
} as const;
const canvasView: DesktopWorkbenchViewRef = {
  viewId: 'canvas:board-a',
  viewEpoch: 1,
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  kind: 'canvas',
  ownerId: 'canvas:board-a',
  displayLabel: 'a.nkc',
  documentId: 'boards/a.nkc',
};

describe('createResourceToCanvasInteraction', () => {
  it('routes a stable ContentLocator to the exact revisioned Canvas session', async () => {
    const executeIntent = vi.fn<ResourceBrowserNodeRuntimeOptions['canvas']['executeIntent']>(
      async (_windowId, payload) => accepted(payload),
    );
    const addToCanvas = createResourceToCanvasInteraction({
      shell: shellWithViews([canvasView]),
      canvas: { executeIntent },
      windowId: 'window-1',
    });

    await addToCanvas({
      identity: resourceIdentity,
      item: {
        resourceId: 'content:cat',
        facet: 'media',
        role: 'content',
        depth: 0,
        kind: 'image',
        label: 'cat.png',
        locator: { kind: 'workspace-file', path: 'media/cat.png' },
        capabilities: ['preview', 'reveal', 'add-to-canvas'],
      },
      target: {
        documentId: 'boards/a.nkc',
        sessionId: createCanvasHostSessionId(canvasView.viewId, canvasView.viewEpoch),
        expectedRevision: 4,
      },
    });

    expect(executeIntent).toHaveBeenCalledWith(
      'window-1',
      expect.objectContaining({
        expectedRevision: 4,
        identity: expect.objectContaining({
          viewId: canvasView.viewId,
          documentId: 'boards/a.nkc',
          sessionId: createCanvasHostSessionId(canvasView.viewId, canvasView.viewEpoch),
        }),
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: {
              projectId: 'project-1',
              canvasId: 'boards/a.nkc',
              canvasSessionId: createCanvasHostSessionId(canvasView.viewId, canvasView.viewEpoch),
            },
            locator: { kind: 'workspace-file', path: 'media/cat.png' },
            mediaKind: 'image',
            title: 'cat.png',
          },
        },
      }),
    );
  });

  it('rejects a stale target instead of falling back to another active Canvas', async () => {
    const executeIntent = vi.fn<ResourceBrowserNodeRuntimeOptions['canvas']['executeIntent']>();
    const addToCanvas = createResourceToCanvasInteraction({
      shell: shellWithViews([
        {
          ...canvasView,
          viewId: 'canvas:active',
          documentId: 'boards/active.nkc',
        },
      ]),
      canvas: { executeIntent },
      windowId: 'window-1',
    });

    await expect(
      addToCanvas({
        identity: resourceIdentity,
        item: {
          resourceId: 'content:cat',
          facet: 'media',
          role: 'content',
          depth: 0,
          kind: 'image',
          label: 'cat.png',
          locator: { kind: 'workspace-file', path: 'media/cat.png' },
          capabilities: ['add-to-canvas'],
        },
        target: {
          documentId: 'boards/missing.nkc',
          sessionId: 'canvas-session:missing',
          expectedRevision: 0,
        },
      }),
    ).rejects.toThrow('stale or not attached');
    expect(executeIntent).not.toHaveBeenCalled();
  });

  it('retains stable Entity and active representation evidence in Canvas authoring', async () => {
    const executeIntent = vi.fn<ResourceBrowserNodeRuntimeOptions['canvas']['executeIntent']>(
      async (_windowId, payload) => accepted(payload),
    );
    const addToCanvas = createResourceToCanvasInteraction({
      shell: shellWithViews([canvasView]),
      canvas: { executeIntent },
      windowId: 'window-1',
    });

    await addToCanvas({
      identity: resourceIdentity,
      item: {
        resourceId: 'entity:character-neko',
        facet: 'materials',
        role: 'entity',
        depth: 0,
        kind: 'character',
        label: 'Neko',
        entityRef: { entityId: 'character-neko', entityKind: 'character' },
        entityStatus: 'confirmed',
        representationAvailability: 'active',
        representationLocator: {
          kind: 'workspace-file',
          path: 'characters/neko.png',
        },
        representationBindingId: 'binding-neko-portrait',
        representationRole: 'portrait',
        capabilities: ['preview', 'add-to-canvas', 'add-to-agent'],
      },
      target: {
        documentId: 'boards/a.nkc',
        sessionId: createCanvasHostSessionId(canvasView.viewId, canvasView.viewEpoch),
        expectedRevision: 7,
      },
    });

    expect(executeIntent).toHaveBeenCalledWith(
      'window-1',
      expect.objectContaining({
        intent: {
          type: 'author-material',
          request: expect.objectContaining({
            kind: 'direct-reference',
            locator: {
              kind: 'workspace-file',
              path: 'characters/neko.png',
            },
            entity: {
              entityId: 'character-neko',
              bindingId: 'binding-neko-portrait',
              role: 'portrait',
            },
          }),
        },
      }),
    );
  });
});

describe('ResourceBrowserNodeRuntime Project identity', () => {
  it('authorizes the right-Dock browser through its Project View without a Resource Main View', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-project-resource-runtime-'));
    temporaryRoots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    const registry: DesktopWorkspaceRegistry = {
      resolve: async () => ({
        workspaceId: 'workspace-1',
        workspacePath,
        displayName: 'Workspace',
        locator: { kind: 'relative', value: 'workspace' },
      }),
      dispose: async () => undefined,
    };
    let shellContent: string | null = null;
    const shell = new DesktopShellService({
      applicationInstanceId: 'app-1',
      stateRepository: new DesktopShellStateRepository({
        readTextIfExists: async () => shellContent,
        writeTextAtomic: async (content) => {
          shellContent = content;
        },
      }),
      workspaceRegistry: registry,
      startupTarget: 'restore',
      createIdentity: () => 'window-1',
    });
    const windowId = await shell.claimWindowId();
    shell.setRendererEpoch(windowId, 1);
    const initial = await shell.getProjection(windowId);
    const opened = await shell.openContent(
      windowId,
      workspacePath,
      initial.endpointEpoch,
      initial.window.revision,
    );
    const projection = opened.projection;
    const tab = projection.window.tabs[0];
    const project = projection.catalog.projects[0];
    if (!tab || !project) throw new Error('Project Resource runtime fixture failed to attach.');
    const identity = createDesktopResourceBrowserIdentity({
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId,
      projectViewId: tab.viewId,
      projectViewEpoch: tab.viewEpoch,
      endpointEpoch: projection.endpointEpoch,
    });
    const host = createElectronNekoHostPorts({
      homedir: root,
      nekoHome: path.join(root, '.neko'),
      version: '0.0.1',
      logger: createLogger(),
      revealPath: () => undefined,
    });
    const runtime = new ResourceBrowserNodeRuntime({
      globalAssetRoot: path.join(root, '.neko', 'assets'),
      globalMediaLibraryRoot: path.join(root, '.neko', 'media-libraries'),
      shell,
      host,
      openPreview: async () => undefined,
      openCut: async () => undefined,
      selectSource: async () => undefined,
      selectConfiguredGlobalMediaLibrary: async () => undefined,
      selectGlobalMediaLibrarySource: async () => undefined,
      selectGlobalAssetSources: async () => undefined,
      trashGlobalAsset: async () => undefined,
      createThumbnail: async () => 'data:image/png;base64,AA==',
      createGlobalLibraryThumbnail: async () => 'data:image/png;base64,AA==',
      openQuickPreview: async () => {
        throw new Error('Quick Preview is not expected by this identity test.');
      },
      releaseQuickPreview: () => undefined,
      canvas: {
        executeIntent: async () => {
          throw new Error('Canvas execution is not expected by this identity test.');
        },
      },
      cut: { addResource: async () => undefined },
    });

    try {
      await expect(
        runtime.getSnapshot(
          windowId,
          createResourceBrowserSnapshotRequest({ requestId: 'snapshot-1', identity }),
        ),
      ).resolves.toMatchObject({ identity });
      expect(projection.window.workbench.main.views).toEqual([
        expect.objectContaining({ kind: 'canvas' }),
      ]);
      await expect(
        runtime.getSnapshot(
          windowId,
          createResourceBrowserSnapshotRequest({
            requestId: 'snapshot-stale',
            identity: { ...identity, viewId: 'resource-browser:legacy-main-view' },
          }),
        ),
      ).rejects.toThrow('Project is not attached');
    } finally {
      runtime.dispose();
      shell.releaseWindow(windowId);
      await shell.dispose();
    }
  });
});

describe('ResourceBrowserNodeRuntime global libraries', () => {
  it('resolves only the exact current thumbnail and rejects stale or cross-owner effects', async () => {
    const fixture = await createGlobalLibraryRuntimeFixture();
    const assetPath = path.join(fixture.assetRoot, 'hero.png');
    const externalRoot = path.join(fixture.root, 'Footage');
    await mkdir(fixture.assetRoot, { recursive: true });
    await mkdir(externalRoot, { recursive: true });
    await writeFile(assetPath, 'image');
    await writeFile(path.join(externalRoot, 'shot.mp4'), 'video');
    await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.mediaLibraryRoot,
      sourceDirectory: externalRoot,
      locationKind: 'local',
    });

    const assets = await fixture.runtime.searchHomeAssets({
      windowId: fixture.windowId,
      endpointEpoch: fixture.endpointEpoch,
      query: '',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    const asset = assets.items[0];
    if (!asset?.thumbnail) throw new Error('Fixture asset thumbnail is required.');
    const result = await fixture.runtime.resolveHomeLibraryThumbnail({
      windowId: fixture.windowId,
      endpointEpoch: fixture.endpointEpoch,
      request: {
        owner: asset.owner,
        itemId: asset.id,
        expectedCatalogRevision: assets.revision,
        descriptorId: asset.thumbnail.descriptorId,
        thumbnailRevision: asset.thumbnail.revision,
        variant: 'icon',
      },
    });

    expect(fixture.createGlobalLibraryThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        absolutePath: await realpath(assetPath),
        mediaType: 'image',
        variant: 'icon',
      }),
    );
    expect(result).toMatchObject({ itemId: asset.id, variant: 'icon' });
    expect(JSON.stringify(result)).not.toContain(fixture.root);

    await expect(
      fixture.runtime.resolveHomeLibraryThumbnail({
        windowId: fixture.windowId,
        endpointEpoch: fixture.endpointEpoch,
        request: {
          owner: asset.owner,
          itemId: asset.id,
          expectedCatalogRevision: assets.revision + 1,
          descriptorId: asset.thumbnail.descriptorId,
          thumbnailRevision: asset.thumbnail.revision,
          variant: 'hover',
        },
      }),
    ).rejects.toThrow('expected revision');

    const media = await fixture.runtime.searchHomeMediaLibraries({
      windowId: fixture.windowId,
      endpointEpoch: fixture.endpointEpoch,
      query: 'shot',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    const mediaItem = media.items[0];
    if (!mediaItem) throw new Error('Fixture Media Library item is required.');
    await expect(
      fixture.runtime.removeHomeAsset({
        windowId: fixture.windowId,
        endpointEpoch: fixture.endpointEpoch,
        assetId: mediaItem.id,
        expectedRevision: media.revision,
      }),
    ).rejects.toThrow('wrong owner');
    expect(fixture.trashGlobalAsset).not.toHaveBeenCalled();
  });

  it('serializes Asset mutations without blocking Media Library reads', async () => {
    const selectedSources = deferred<readonly string[] | undefined>();
    const selectGlobalAssetSources = vi.fn(() => selectedSources.promise);
    const fixture = await createGlobalLibraryRuntimeFixture({
      selectGlobalAssetSources,
    });
    const externalRoot = path.join(fixture.root, 'Footage');
    await mkdir(externalRoot, { recursive: true });
    await writeFile(path.join(externalRoot, 'shot.mp4'), 'video');
    await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.mediaLibraryRoot,
      sourceDirectory: externalRoot,
      locationKind: 'local',
    });

    const pendingImport = fixture.runtime.importHomeAssets({
      windowId: fixture.windowId,
      endpointEpoch: fixture.endpointEpoch,
      expectedRevision: 0,
    });
    await waitFor(() => selectGlobalAssetSources.mock.calls.length === 1);

    await expect(
      fixture.runtime.importHomeAssets({
        windowId: fixture.windowId,
        endpointEpoch: fixture.endpointEpoch,
        expectedRevision: 0,
      }),
    ).rejects.toThrow('already in progress');
    await expect(
      fixture.runtime.searchHomeMediaLibraries({
        windowId: fixture.windowId,
        endpointEpoch: fixture.endpointEpoch,
        query: '',
        sortBy: 'name',
        sortDirection: 'ascending',
        limit: 20,
      }),
    ).resolves.toMatchObject({ revision: 0 });

    selectedSources.resolve(undefined);
    await expect(pendingImport).resolves.toEqual({ status: 'cancelled', revision: 0 });
  });

  it('rejects stale endpoints, permits bounded parallel thumbnail variants, and aborts on detach', async () => {
    const thumbnailsStarted = deferred<void>();
    let startedCount = 0;
    const fixture = await createGlobalLibraryRuntimeFixture({
      createGlobalLibraryThumbnail: vi.fn(
        ({
          signal,
        }: Parameters<ResourceBrowserNodeRuntimeOptions['createGlobalLibraryThumbnail']>[0]) =>
          new Promise<string>((_resolve, reject) => {
            startedCount += 1;
            if (startedCount === 2) thumbnailsStarted.resolve();
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
          }),
      ),
    });
    await mkdir(fixture.assetRoot, { recursive: true });
    await writeFile(path.join(fixture.assetRoot, 'hero.png'), 'image');

    await expect(
      fixture.runtime.importHomeAssets({
        windowId: fixture.windowId,
        endpointEpoch: 'stale-endpoint',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('endpoint identity is stale');
    expect(fixture.selectGlobalAssetSources).not.toHaveBeenCalled();

    const assets = await fixture.runtime.searchHomeAssets({
      windowId: fixture.windowId,
      endpointEpoch: fixture.endpointEpoch,
      query: '',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    const asset = assets.items[0];
    if (!asset?.thumbnail) throw new Error('Fixture asset thumbnail is required.');
    const thumbnailRequest = {
      windowId: fixture.windowId,
      endpointEpoch: fixture.endpointEpoch,
      request: {
        owner: asset.owner,
        itemId: asset.id,
        expectedCatalogRevision: assets.revision,
        descriptorId: asset.thumbnail.descriptorId,
        thumbnailRevision: asset.thumbnail.revision,
        variant: 'hover',
      },
    } as const;
    const pendingHoverThumbnail = fixture.runtime.resolveHomeLibraryThumbnail(thumbnailRequest);
    const pendingIconThumbnail = fixture.runtime.resolveHomeLibraryThumbnail({
      ...thumbnailRequest,
      request: { ...thumbnailRequest.request, variant: 'icon' },
    });
    await thumbnailsStarted.promise;
    fixture.runtime.detachWindow(fixture.windowId);
    await expect(pendingHoverThumbnail).rejects.toThrow('detached');
    await expect(pendingIconThumbnail).rejects.toThrow('detached');
  });
});

function shellWithViews(views: readonly DesktopWorkbenchViewRef[]) {
  return {
    getProjection: async () => ({
      window: { workbench: { main: { views } } },
    }),
  };
}

function accepted(value: unknown): CanvasHostIntentResult {
  const request = parseCanvasHostIntentRequest(value);
  return {
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    requestId: request.requestId,
    commandId: request.commandId,
    status: 'accepted',
    snapshot: {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      identity: request.identity,
      revision: request.expectedRevision + 1,
      dirty: true,
      canvas: DEFAULT_CANVAS_DATA,
      presentation: {
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        selectedNodeIds: [],
      },
      authoringCapabilities: {
        sourceModes: ['import', 'reference'],
        generationMediaKinds: [],
      },
    },
  };
}

async function createGlobalLibraryRuntimeFixture(
  overrides: {
    readonly selectGlobalAssetSources?: ResourceBrowserNodeRuntimeOptions['selectGlobalAssetSources'];
    readonly createGlobalLibraryThumbnail?: ResourceBrowserNodeRuntimeOptions['createGlobalLibraryThumbnail'];
  } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-global-library-runtime-'));
  temporaryRoots.push(root);
  const home = path.join(root, 'home');
  const assetRoot = path.join(home, '.neko', 'assets');
  const mediaLibraryRoot = path.join(home, '.neko', 'media-libraries');
  const shell = createGlobalLibraryShell();
  const windowId = await shell.claimWindowId();
  shell.setRendererEpoch(windowId, 1);
  const endpointEpoch = (await shell.getProjection(windowId)).endpointEpoch;
  const host = createElectronNekoHostPorts({
    homedir: home,
    nekoHome: path.join(home, '.neko'),
    version: '0.0.1',
    logger: createLogger(),
    revealPath: () => undefined,
  });
  const selectGlobalAssetSources =
    overrides.selectGlobalAssetSources ?? vi.fn(async () => undefined);
  const createGlobalLibraryThumbnail =
    overrides.createGlobalLibraryThumbnail ?? vi.fn(async () => 'data:image/png;base64,AA==');
  const trashGlobalAsset = vi.fn(async () => undefined);
  const runtime = new ResourceBrowserNodeRuntime({
    globalAssetRoot: assetRoot,
    globalMediaLibraryRoot: mediaLibraryRoot,
    shell,
    host,
    openPreview: async () => undefined,
    openCut: async () => undefined,
    selectSource: async () => undefined,
    selectConfiguredGlobalMediaLibrary: async () => undefined,
    selectGlobalMediaLibrarySource: async () => undefined,
    selectGlobalAssetSources,
    trashGlobalAsset,
    createThumbnail: async () => 'data:image/png;base64,AA==',
    createGlobalLibraryThumbnail,
    openQuickPreview: async () => {
      throw new Error('Quick preview is not expected by this global-library test.');
    },
    releaseQuickPreview: () => undefined,
    canvas: {
      executeIntent: async () => {
        throw new Error('Canvas execution is not expected by this global-library test.');
      },
    },
    cut: {
      addResource: async () => undefined,
    },
  });
  return {
    root,
    assetRoot,
    mediaLibraryRoot,
    runtime,
    windowId,
    endpointEpoch,
    selectGlobalAssetSources,
    trashGlobalAsset,
    createGlobalLibraryThumbnail,
  };
}

function createGlobalLibraryShell(): DesktopShellService {
  let content: string | null = null;
  const file: DesktopShellStateFilePort = {
    readTextIfExists: async () => content,
    writeTextAtomic: async (next) => {
      content = next;
    },
  };
  const registry: DesktopWorkspaceRegistry = {
    resolve: async (): Promise<AssetWorkspaceResolution> => {
      throw new Error('Workspace resolution is not expected by this global-library test.');
    },
    dispose: async () => undefined,
  };
  return new DesktopShellService({
    applicationInstanceId: 'app-1',
    stateRepository: new DesktopShellStateRepository(file),
    workspaceRegistry: registry,
    startupTarget: 'restore',
    createIdentity: () => 'window-1',
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

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) throw new Error('Deferred promise is unavailable.');
      resolvePromise(value);
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Runtime test condition was not reached.');
}
