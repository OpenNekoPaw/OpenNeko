import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  createCanvasHostIntentRequest,
  type CanvasHostIntent,
  type CanvasHostRuntimeIdentity,
  type CanvasHostSnapshot,
} from '@neko/canvas-domain';
import { ConsoleLogger } from '@neko/shared/logger';
import { createWorkspaceLinkedMediaLibrary } from '@neko/assets-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { DesktopCanvasRuntime } from './desktop-canvas-runtime';
import {
  CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
  CANVAS_OPEN_IN_CUT_ACTION_ID,
  CANVAS_PREVIEW_ACTION_ID,
  CANVAS_REGENERATE_ACTION_ID,
} from '@neko/canvas-domain';
import { createGlobalMediaLibraryConnection } from '@neko/assets-node';
import type { DesktopCanvasViewGrant } from '@neko/host/desktop-shell-service';
import {
  createDefaultDesktopWorkbenchLayout,
  openOrFocusMainView,
} from '@neko/host/desktop-workbench-contract';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('DesktopCanvasRuntime', () => {
  it('opens path-only material nodes as unavailable without migrating or authorizing content', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-degraded-content-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const documentPath = path.join(workspacePath, identity.documentId);
    await mkdir(path.dirname(documentPath), { recursive: true });
    await writeFile(
      documentPath,
      JSON.stringify({
        name: 'Degraded materials',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'path-only-media',
            type: 'media',
            position: { x: 40, y: 60 },
            size: { width: 300, height: 180 },
            zIndex: 1,
            data: { assetPath: 'media/path-only.mp4', mediaType: 'video' },
          },
          {
            id: 'path-only-file',
            type: 'file',
            position: { x: 420, y: 60 },
            size: { width: 260, height: 180 },
            zIndex: 2,
            data: {
              path: 'documents/path-only.md',
              title: 'Path-only notes',
              mediaKind: 'document',
              mediaType: 'text/markdown',
            },
          },
        ],
        connections: [
          {
            id: 'path-only-reference',
            sourceId: 'path-only-file',
            targetId: 'path-only-media',
            sourceEndpoint: { nodeId: 'path-only-file', scope: 'node' },
            targetEndpoint: { nodeId: 'path-only-media', scope: 'node' },
            type: 'reference',
          },
        ],
      }),
    );
    const previewResource = vi.fn(async () => undefined);
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasDegradedContentTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      previewResource,
    });

    const snapshot = await runtime.getSnapshot('window-1', identity);

    expect(snapshot.canvas.nodes.map((node) => node.id)).toEqual([
      'path-only-media',
      'path-only-file',
    ]);
    expect(snapshot.canvas.connections.map((connection) => connection.id)).toEqual([
      'path-only-reference',
    ]);
    for (const node of snapshot.canvas.nodes) {
      expect(node.data).not.toHaveProperty('contentLocator');
      const actions = await runtime.resolveMaterialActions('window-1', {
        requestId: `resolve-${node.id}`,
        identity,
        selectedNodeIds: [node.id],
      });
      expect(actions.descriptors).toEqual([]);
    }
    expect(previewResource).not.toHaveBeenCalled();

    const saved = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'save-degraded-content',
        commandId: 'save-degraded-content',
        identity,
        intent: { type: 'save' },
      }),
    );
    expect(saved.status).toBe('accepted');
    const persisted = JSON.parse(await readFile(documentPath, 'utf8')) as {
      readonly nodes: readonly { readonly data: Readonly<Record<string, unknown>> }[];
    };
    expect(persisted.nodes).toHaveLength(2);
    expect(persisted.nodes.every((node) => node.data['contentLocator'] === undefined)).toBe(true);
    await runtime.dispose();
  });

  it('projects an authorized ContentLocator through owning Canvas authoring', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-content-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'media/cat.png', 'image');
    const identity = createIdentity();
    const runtime = createRuntime(workspacePath, identity);
    await runtime.getSnapshot('window-1', identity);
    const projectionEvents: unknown[] = [];
    const unsubscribe = await runtime.subscribe('window-1', identity, (event) =>
      projectionEvents.push(event),
    );

    const result = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-project-content',
        commandId: 'command-project-content',
        identity,
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: materialIdentity(identity),
            locator: { kind: 'workspace-file', path: 'media/cat.png' },
            mediaKind: 'image',
          },
        },
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error(result.diagnostic.message);
    expect(result.snapshot.canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'media',
        data: expect.objectContaining({
          assetPath: 'media/cat.png',
          contentLocator: { kind: 'workspace-file', path: 'media/cat.png' },
          mediaType: 'image',
        }),
      }),
    ]);
    expect(result.snapshot.dirty).toBe(true);
    expect(projectionEvents).toEqual([
      expect.objectContaining({ originCommandId: 'command-project-content' }),
    ]);
    unsubscribe();
  });

  it('rebuilds Preview owner descriptors and routes the selected canonical locator', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-preview-action-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'media/cat.png', 'image');
    const identity = createIdentity();
    const previewResource = vi.fn(async () => undefined);
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasPreviewActionTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      previewResource,
    });
    await runtime.getSnapshot('window-1', identity);
    const authored = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-preview-material',
        commandId: 'command-preview-material',
        identity,
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: materialIdentity(identity),
            locator: { kind: 'workspace-file', path: 'media/cat.png' },
            mediaKind: 'image',
          },
        },
      }),
    );
    expect(authored.status).toBe('accepted');
    if (authored.status !== 'accepted') throw new Error(authored.diagnostic.message);
    const node = authored.snapshot.canvas.nodes[0];
    if (!node) throw new Error('Authored material node is missing.');
    const resolution = await runtime.resolveMaterialActions('window-1', {
      requestId: 'resolve-preview-action',
      identity,
      selectedNodeIds: [node.id],
    });
    expect(resolution.descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: CANVAS_PREVIEW_ACTION_ID,
          ownerId: 'preview',
        }),
      ]),
    );

    const action = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-preview-action',
        commandId: 'command-preview-action',
        identity,
        intent: {
          type: 'execute-material-action',
          action: {
            identity: materialIdentity(identity),
            actionId: CANVAS_PREVIEW_ACTION_ID,
            selectedNodeIds: [node.id],
            payload: {},
          },
        },
      }),
    );

    expect(action.status).toBe('accepted');
    expect(previewResource).toHaveBeenCalledWith({
      identity,
      locator: { kind: 'workspace-file', path: 'media/cat.png' },
      absolutePath: await realpath(path.join(workspacePath, 'media/cat.png')),
    });
    await runtime.dispose();
  });

  it('routes an explicit project Media Library copy without mutating the Canvas source locator', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-library-action-'));
    const linkedLibraryPath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-library-target-'));
    roots.push(workspacePath, linkedLibraryPath);
    await writeFixtureFile(workspacePath, 'media/cat.png', 'image');
    await mkdir(path.join(linkedLibraryPath, 'Characters'), { recursive: true });
    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: workspacePath,
      name: 'Project Media',
      targetDirectory: linkedLibraryPath,
    });
    const identity = createIdentity();
    const requestProjectMediaLibraryCopy = vi.fn(async () => ({
      libraryName: 'Project Media',
      destinationDirectory: 'Characters',
      fileName: 'cat-copy.png',
      conflictPolicy: 'fail-if-exists' as const,
    }));
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasMediaLibraryActionTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      requestProjectMediaLibraryCopy,
    });
    await runtime.getSnapshot('window-1', identity);
    const authored = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-library-copy-material',
        commandId: 'command-library-copy-material',
        identity,
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: materialIdentity(identity),
            locator: { kind: 'workspace-file', path: 'media/cat.png' },
            mediaKind: 'image',
          },
        },
      }),
    );
    expect(authored.status).toBe('accepted');
    if (authored.status !== 'accepted') throw new Error(authored.diagnostic.message);
    const node = authored.snapshot.canvas.nodes[0];
    if (!node) throw new Error('Authored Media Library source node is missing.');

    const resolution = await runtime.resolveMaterialActions('window-1', {
      requestId: 'resolve-library-copy-action',
      identity,
      selectedNodeIds: [node.id],
    });
    expect(resolution.descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
          ownerId: 'media-library',
          effect: 'copy',
        }),
      ]),
    );

    const action = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-library-copy-action',
        commandId: 'command-library-copy-action',
        identity,
        intent: {
          type: 'execute-material-action',
          action: {
            identity: materialIdentity(identity),
            actionId: CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
            selectedNodeIds: [node.id],
            payload: {},
          },
        },
      }),
    );

    expect(action.status).toBe('accepted');
    if (action.status !== 'accepted') throw new Error(action.diagnostic.message);
    expect(action.snapshot.canvas.nodes).toEqual(authored.snapshot.canvas.nodes);
    expect(requestProjectMediaLibraryCopy).toHaveBeenCalledWith({
      identity,
      workspace: expect.objectContaining({ workspacePath }),
      target: expect.objectContaining({
        nodeId: node.id,
        locator: { kind: 'workspace-file', path: 'media/cat.png' },
      }),
      suggestedFileName: 'cat.png',
    });
    await expect(
      readFile(path.join(linkedLibraryPath, 'Characters', 'cat-copy.png'), 'utf8'),
    ).resolves.toBe('image');
    await expect(readFile(path.join(workspacePath, 'media', 'cat.png'), 'utf8')).resolves.toBe(
      'image',
    );
    await runtime.dispose();
  });

  it('offers Cut only through its owner and hands off the authorized OTIO locator', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-cut-action-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'cuts/story.otio', 'otio');
    const identity = createIdentity();
    const resolveCut = vi.fn(async () => true);
    const openInCut = vi.fn(async () => undefined);
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasCutActionTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      resolveCut,
      openInCut,
    });
    await runtime.getSnapshot('window-1', identity);
    const authored = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-cut-material',
        commandId: 'command-cut-material',
        identity,
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: materialIdentity(identity),
            locator: { kind: 'workspace-file', path: 'cuts/story.otio' },
            mediaKind: 'document',
          },
        },
      }),
    );
    expect(authored.status).toBe('accepted');
    if (authored.status !== 'accepted') throw new Error(authored.diagnostic.message);
    const node = authored.snapshot.canvas.nodes[0];
    if (!node) throw new Error('Authored Cut material node is missing.');
    const expectedTarget = expect.objectContaining({
      nodeId: node.id,
      mediaKind: 'document',
      origin: 'referenced',
      locator: { kind: 'workspace-file', path: 'cuts/story.otio' },
    });
    const absolutePath = await realpath(path.join(workspacePath, 'cuts/story.otio'));

    const resolution = await runtime.resolveMaterialActions('window-1', {
      requestId: 'resolve-cut-action',
      identity,
      selectedNodeIds: [node.id],
    });
    expect(resolution.descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: CANVAS_OPEN_IN_CUT_ACTION_ID,
          ownerId: 'cut',
        }),
      ]),
    );
    expect(resolveCut).toHaveBeenCalledWith({
      identity,
      target: expectedTarget,
      absolutePath,
    });

    const action = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-open-in-cut',
        commandId: 'command-open-in-cut',
        identity,
        intent: {
          type: 'execute-material-action',
          action: {
            identity: materialIdentity(identity),
            actionId: CANVAS_OPEN_IN_CUT_ACTION_ID,
            selectedNodeIds: [node.id],
            payload: {},
          },
        },
      }),
    );

    expect(action.status).toBe('accepted');
    expect(openInCut).toHaveBeenCalledWith({
      identity,
      target: expectedTarget,
      absolutePath,
    });
    await runtime.dispose();
  });

  it('routes the shared 3D Director model source to a canonical Canvas file node', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-model-source-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'models/character.glb', 'model');
    const identity = createIdentity();
    const requestSource = vi.fn(async () => ({
      kind: 'external-import' as const,
      source: {
        absolutePath: path.join(workspacePath, 'models/character.glb'),
        sourceName: 'character.glb',
      },
    }));
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasModelSourceTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      requestSource,
    });
    await runtime.getSnapshot('window-1', identity);

    const result = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-model-source',
        commandId: 'command-model-source',
        identity,
        intent: {
          type: 'request-source',
          sourceKind: 'model',
          sourceMode: 'import',
          position: { x: 160, y: 90 },
        },
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error(result.diagnostic.message);
    expect(requestSource).toHaveBeenCalledWith({
      identity,
      sourceKind: 'model',
      sourceMode: 'import',
      workspace: expect.objectContaining({ workspacePath }),
    });
    expect(result.snapshot.canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'file',
        position: { x: 160, y: 90 },
        data: expect.objectContaining({
          path: 'neko/imports/model/character.glb',
          contentLocator: expect.objectContaining({
            kind: 'workspace-file',
            path: 'neko/imports/model/character.glb',
            fingerprint: expect.objectContaining({ strategy: 'sha256' }),
          }),
        }),
      }),
    ]);
    await runtime.dispose();
  });

  it('retains a workspace reference without copying it into project imports', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-reference-source-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'media/cat.png', 'image');
    const identity = createIdentity();
    const requestSource = vi.fn(async () => ({
      kind: 'workspace-reference' as const,
      locator: { kind: 'workspace-file' as const, path: 'media/cat.png' },
      title: 'cat.png',
    }));
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasReferenceSourceTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      requestSource,
    });
    await runtime.getSnapshot('window-1', identity);

    const result = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-workspace-reference',
        commandId: 'command-workspace-reference',
        identity,
        intent: {
          type: 'request-source',
          sourceKind: 'image',
          sourceMode: 'reference',
          position: { x: 32, y: 48 },
        },
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error(result.diagnostic.message);
    expect(requestSource).toHaveBeenCalledWith({
      identity,
      sourceKind: 'image',
      sourceMode: 'reference',
      workspace: expect.objectContaining({ workspacePath }),
    });
    expect(result.snapshot.canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'media',
        position: { x: 32, y: 48 },
        data: expect.objectContaining({
          contentLocator: { kind: 'workspace-file', path: 'media/cat.png' },
          assetPath: 'media/cat.png',
        }),
      }),
    ]);
    await expect(
      readFile(path.join(workspacePath, 'neko/imports/image/cat.png')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await runtime.dispose();
  });

  it('routes an empty material request to the instance-scoped Generation owner', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-generation-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const generation = {
      requestDraft: vi.fn(async () => ({
        ref: { kind: 'generation' as const, jobId: 'generation-desktop-1' },
        phase: 'pending' as const,
        title: 'Generate image',
        inputNodeIds: [],
        mediaKind: 'image' as const,
        summary: { prompt: 'Create an image' },
      })),
      detachWindow: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasGenerationTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      generation,
    });
    await runtime.getSnapshot('window-1', identity);

    const result = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-generation-draft',
        commandId: 'command-generation-draft',
        identity,
        intent: {
          type: 'request-generation-draft',
          mediaKind: 'image',
          position: { x: 64, y: 96 },
          inputNodeIds: [],
        },
      }),
    );

    expect(generation.requestDraft).toHaveBeenCalledWith({
      identity,
      workspace: expect.objectContaining({
        workspaceId: 'workspace-1',
        workspacePath,
      }),
      mediaKind: 'image',
      position: { x: 64, y: 96 },
      inputNodeIds: [],
    });
    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error(result.diagnostic.message);
    expect(result.snapshot.canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'job',
        position: { x: 64, y: 96 },
        data: expect.objectContaining({
          jobRef: { kind: 'generation', jobId: 'generation-desktop-1' },
          status: 'queued',
          outputRefs: [],
        }),
      }),
    ]);
    expect(result.snapshot.canvas.nodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'media' }),
        expect.objectContaining({ type: 'file' }),
      ]),
    );

    runtime.detachWindow('window-1');
    expect(generation.detachWindow).toHaveBeenCalledWith('window-1');
    await runtime.dispose();
    expect(generation.dispose).toHaveBeenCalledOnce();
  });

  it('does not advertise empty Generation nodes when the owner exposes result actions only', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-result-only-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const generation = {
      resolveResultActions: vi.fn(async () => ({
        regenerate: true,
        editAndGenerate: false,
      })),
      regenerateResult: vi.fn(async () => {
        throw new Error('Result regeneration is not exercised by this capability test.');
      }),
      detachWindow: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const runtime = createRuntimeWithGeneration(workspacePath, identity, generation);

    const snapshot = await runtime.getSnapshot('window-1', identity);

    expect(snapshot.authoringCapabilities.generationMediaKinds).toEqual([]);
    await runtime.dispose();
  });

  it('rejects an escaping ContentLocator without mutating the Canvas', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-escape-'));
    roots.push(workspacePath);
    const outsidePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-outside-'));
    roots.push(outsidePath);
    await writeFixtureFile(outsidePath, 'secret.png', 'secret');
    await symlink(outsidePath, path.join(workspacePath, 'escape'));
    const identity = createIdentity();
    const runtime = createRuntime(workspacePath, identity);
    await runtime.getSnapshot('window-1', identity);

    const result = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-project-escape',
        commandId: 'command-project-escape',
        identity,
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: materialIdentity(identity),
            locator: { kind: 'workspace-file', path: 'escape/secret.png' },
            mediaKind: 'image',
          },
        },
      }),
    );

    expect(result).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-effect-failed' },
    });
    expect((await runtime.getSnapshot('window-1', identity)).canvas.nodes).toEqual([]);
  });

  it('resolves an inline preview from the exact Canvas workspace without exposing a path', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-preview-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'media/cat.png', 'image');
    const identity = createIdentity();
    const createPreviewVariant = vi.fn(async () => 'data:image/png;base64,Y2F0');
    const runtime = createRuntime(workspacePath, identity, createPreviewVariant);

    await runtime.getSnapshot('window-1', identity);
    await expect(
      runtime.resolvePreviewVariant('window-1', {
        identity,
        requestId: 'preview-1',
        locator: { kind: 'workspace-file', path: 'media/cat.png' },
        role: 'thumbnail',
        mediaType: 'image',
      }),
    ).resolves.toEqual({
      requestId: 'preview-1',
      url: 'data:image/png;base64,Y2F0',
    });
    expect(createPreviewVariant).toHaveBeenCalledWith({
      absolutePath: await realpath(path.join(workspacePath, 'media/cat.png')),
      mediaType: 'image',
    });

    await expect(
      runtime.resolvePreviewVariant('window-1', {
        identity,
        requestId: 'preview-escape',
        locator: { kind: 'workspace-file', path: '../cat.png' },
        role: 'thumbnail',
      }),
    ).rejects.toThrow('portable workspace-file');
  });

  it('routes package media requests through the owner-bound Canvas session workspace', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-media-route-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'media/test.aac', 'audio');
    const identity = createIdentity();
    const execute = vi.fn(async () => ({
      type: 'media:probeResult' as const,
      nodeId: 'audio-1',
      mediaInfo: {
        duration: 12,
        width: 0,
        height: 0,
        fps: 0,
        codec: 'aac',
        format: 'aac',
        hasAudio: true,
      },
    }));
    const media = {
      execute,
      detachWindow: vi.fn(),
      detachView: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasMediaRouteTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      media,
    });

    await runtime.getSnapshot('window-1', identity);
    await expect(
      runtime.executeMediaRequest('window-1', {
        identity,
        type: 'media:probe',
        nodeId: 'audio-1',
        locator: { kind: 'workspace-file', path: 'media/test.aac' },
        mediaType: 'audio',
      }),
    ).resolves.toMatchObject({
      type: 'media:probeResult',
      nodeId: 'audio-1',
      mediaInfo: { codec: 'aac' },
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ identity, nodeId: 'audio-1', type: 'media:probe' }),
      expect.objectContaining({ workspaceId: 'workspace-1', workspacePath }),
    );

    runtime.reconcileWindow('window-1', [createDefaultDesktopWorkbenchLayout('window-1')]);
    expect(media.detachView).toHaveBeenCalledWith('window-1', identity.viewId);

    runtime.detachWindow('window-1');
    expect(media.detachWindow).toHaveBeenCalledWith('window-1');
    await runtime.dispose();
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('reconciles all retained Workbenches before disposing only an absent Canvas session', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-multi-workbench-'));
    roots.push(workspacePath);
    const firstIdentity = createIdentity();
    const secondIdentity: CanvasHostRuntimeIdentity = {
      ...firstIdentity,
      projectId: 'project-2',
      workspaceId: 'workspace-2',
      viewId: 'canvas:view-2',
      documentId: 'neko/boards/second.nkc',
      sessionId: 'canvas-session:canvas:view-2:view-instance-1',
    };
    for (const identity of [firstIdentity, secondIdentity]) {
      const documentPath = path.join(workspacePath, identity.documentId);
      await mkdir(path.dirname(documentPath), { recursive: true });
      await writeFile(
        documentPath,
        JSON.stringify({
          name: identity.workspaceId,
          viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
          nodes: [],
          connections: [],
        }),
      );
    }
    const detachView = vi.fn();
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (_windowId, identity) => ({
          identity,
          workspace: {
            workspaceId: identity.workspaceId,
            workspacePath,
            displayName: identity.workspaceId,
            locator: { kind: 'relative' as const, value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasMultiWorkbenchTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      media: {
        execute: vi.fn(async () => {
          throw new Error('Media execution is not expected.');
        }),
        detachWindow: vi.fn(),
        detachView,
        dispose: vi.fn(async () => undefined),
      },
    });
    await runtime.getSnapshot('window-1', firstIdentity);
    await runtime.getSnapshot('window-1', secondIdentity);
    const layoutFor = (identity: CanvasHostRuntimeIdentity) =>
      openOrFocusMainView(createDefaultDesktopWorkbenchLayout(identity.workspaceId), {
        viewId: identity.viewId,
        viewInstanceId: identity.viewInstanceId,
        projectId: identity.projectId,
        workspaceId: identity.workspaceId,
        kind: 'canvas',
        ownerId: identity.sessionId,
        displayLabel: path.basename(identity.documentId),
        documentId: identity.documentId,
      });
    const firstLayout = layoutFor(firstIdentity);
    const secondLayout = layoutFor(secondIdentity);

    runtime.reconcileWindow('window-1', [firstLayout, secondLayout]);
    expect(detachView).not.toHaveBeenCalled();

    runtime.reconcileWindow('window-1', [secondLayout]);
    expect(detachView).toHaveBeenCalledOnce();
    expect(detachView).toHaveBeenCalledWith('window-1', firstIdentity.viewId);

    await runtime.dispose();
  });

  it('loads one owner-bound Canvas session, applies revisioned edits and atomically saves .nkc', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-runtime-'));
    roots.push(workspacePath);
    const identity: CanvasHostRuntimeIdentity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'canvas:view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'canvas-session:canvas:view-1:view-instance-1',
      rendererSessionId: 'app-1:window-1:1',
    };
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasRuntimeTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
    });

    const initial = await runtime.getSnapshot('window-1', identity);
    expect(initial.canvas.name).toBe('Fixture Canvas');

    const editedCanvas = {
      ...initial.canvas,
      name: 'Saved Canvas',
    };
    const edit = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-edit',
        commandId: 'command-edit',
        identity,
        intent: { type: 'replace-document', canvas: editedCanvas },
      }),
    );
    expect(edit.status).toBe('accepted');
    if (edit.status !== 'accepted') throw new Error(edit.diagnostic.message);

    const save = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-save',
        commandId: 'command-save',
        identity,
        intent: { type: 'save' },
      }),
    );
    expect(save.status).toBe('accepted');
    expect(
      JSON.parse(await readFile(path.join(workspacePath, identity.documentId), 'utf8')),
    ).toMatchObject({ name: 'Saved Canvas' });

    await runtime.dispose();
    await expect(runtime.getSnapshot('window-1', identity)).rejects.toThrow('disposed');

    const restartedRuntime = createRuntime(workspacePath, identity);
    const restarted = await restartedRuntime.getSnapshot('window-1', identity);
    expect(restarted.canvas.name).toBe('Saved Canvas');
    expect(restarted.canvas.nodes).toEqual([]);
    await restartedRuntime.dispose();
  });

  it('restores generated material evidence after restart and rebuilds owner actions', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-generation-restart-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'neko/generated/frame-1.png', 'generated-image');
    const identity = createIdentity();
    const generationSnapshot = {
      ref: { kind: 'generation' as const, jobId: 'generation-restart-1' },
      phase: 'succeeded' as const,
      title: 'Generate concept frame',
      inputNodeIds: [],
      mediaKind: 'image' as const,
      summary: {
        prompt: 'Create a quiet night-time concept frame',
        model: 'fixture-image-model',
      },
      position: { x: 120, y: 160 },
      resultLocators: [
        {
          kind: 'generated-output' as const,
          outputId: 'output-frame-1',
          digest: 'sha256:generated-frame-1',
          path: 'neko/generated/frame-1.png',
        },
      ],
    };
    const generation = {
      requestDraft: vi.fn(async () => generationSnapshot),
      resolveResultActions: vi.fn(async () => ({
        regenerate: true,
        editAndGenerate: false,
      })),
      regenerateResult: vi.fn(async () => generationSnapshot),
      detachWindow: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const runtime = createRuntimeWithGeneration(workspacePath, identity, generation);
    await runtime.getSnapshot('window-1', identity);

    const projected = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-generation-restart',
        commandId: 'command-generation-restart',
        identity,
        intent: {
          type: 'request-generation-draft',
          mediaKind: 'image',
          position: { x: 120, y: 160 },
          inputNodeIds: [],
        },
      }),
    );
    expect(projected.status).toBe('accepted');
    if (projected.status !== 'accepted') throw new Error(projected.diagnostic.message);
    const generatedNode = projected.snapshot.canvas.nodes.find(
      (node) => node.type === 'media' && node.data.contentLocator?.kind === 'generated-output',
    );
    if (!generatedNode || generatedNode.type !== 'media') {
      throw new Error('Generated Canvas material was not projected.');
    }

    const save = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'save-generation-restart',
        commandId: 'save-generation-restart',
        identity,
        intent: { type: 'save' },
      }),
    );
    expect(save.status).toBe('accepted');
    const documentPath = path.join(workspacePath, identity.documentId);
    const serialized = await readFile(documentPath, 'utf8');
    expect(JSON.parse(serialized)).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          type: 'media',
          data: expect.objectContaining({
            contentLocator: generationSnapshot.resultLocators[0],
            generation: {
              jobRef: generationSnapshot.ref,
              summary: generationSnapshot.summary,
            },
          }),
        }),
      ]),
    });
    expect(serialized).not.toContain('"actionId"');
    expect(serialized).not.toContain('blob:');
    expect(serialized).not.toContain('data:');
    await runtime.dispose();

    const restartedGeneration = {
      requestDraft: vi.fn(async () => undefined),
      resolveResultActions: vi.fn(async () => ({
        regenerate: true,
        editAndGenerate: false,
      })),
      regenerateResult: vi.fn(async () => generationSnapshot),
      detachWindow: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const restartedRuntime = createRuntimeWithGeneration(
      workspacePath,
      identity,
      restartedGeneration,
    );
    const restarted = await restartedRuntime.getSnapshot('window-1', identity);
    expect(restarted.canvas.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'job',
          data: expect.objectContaining({
            jobRef: { kind: 'generation', jobId: 'generation-restart-1' },
            status: 'completed',
          }),
        }),
        expect.objectContaining({
          id: generatedNode.id,
          type: 'media',
          data: expect.objectContaining({
            contentLocator: generationSnapshot.resultLocators[0],
            generation: {
              jobRef: { kind: 'generation', jobId: 'generation-restart-1' },
              summary: generationSnapshot.summary,
            },
          }),
        }),
      ]),
    );
    expect(restarted.canvas.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'generation-job:generation-restart-1',
          targetId: generatedNode.id,
          type: 'derived-from',
        }),
      ]),
    );

    const resolution = await restartedRuntime.resolveMaterialActions('window-1', {
      requestId: 'resolve-restarted-generation-actions',
      identity,
      selectedNodeIds: [generatedNode.id],
    });
    expect(resolution.descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: CANVAS_REGENERATE_ACTION_ID,
          ownerId: 'generation',
        }),
      ]),
    );
    expect(restartedGeneration.resolveResultActions).toHaveBeenCalledWith({
      identity,
      workspace: expect.objectContaining({ workspacePath }),
      target: expect.objectContaining({
        nodeId: generatedNode.id,
        origin: 'generated',
        locator: generationSnapshot.resultLocators[0],
        generation: {
          jobRef: { kind: 'generation', jobId: 'generation-restart-1' },
          summary: generationSnapshot.summary,
        },
      }),
    });
    await restartedRuntime.dispose();
  });

  it('preserves every Phase 1 material lifecycle across an isolated neko-test-shaped restart', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-neko-test-fixture-'));
    const linkedLibraryPath = await mkdtemp(path.join(tmpdir(), 'openneko-linked-media-'));
    const globalLibraryPath = await mkdtemp(path.join(tmpdir(), 'openneko-global-media-'));
    const externalSourcePath = await mkdtemp(path.join(tmpdir(), 'openneko-external-media-'));
    roots.push(workspacePath, linkedLibraryPath, globalLibraryPath, externalSourcePath);
    await Promise.all([
      writeFixtureFile(workspacePath, 'cases/test.png', 'workspace-image'),
      writeFixtureFile(workspacePath, 'neko/generated/concept-frame.png', 'generated-image'),
      writeFixtureFile(workspacePath, 'neko/derived/crop/test-cropped.png', 'derived-image'),
      writeFixtureFile(linkedLibraryPath, 'clips/linked.mp4', 'linked-video'),
      writeFixtureFile(globalLibraryPath, 'stills/global-frame.png', 'global-image'),
      writeFixtureFile(externalSourcePath, 'outside.png', 'external-image'),
    ]);
    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: workspacePath,
      name: 'linked-media',
      targetDirectory: linkedLibraryPath,
    });
    const globalMediaLibraryRoot = path.join(workspacePath, '.global-media-libraries');
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: globalMediaLibraryRoot,
      sourceDirectory: globalLibraryPath,
      locationKind: 'local',
    });
    const identity = createIdentity();
    const generation: NonNullable<
      ConstructorParameters<typeof DesktopCanvasRuntime>[0]['generation']
    > = {
      requestDraft: vi.fn(async (input) =>
        input.mediaKind === 'image'
          ? {
              ref: { kind: 'generation' as const, jobId: 'generation-phase-1-success' },
              phase: 'succeeded' as const,
              title: 'Generate concept frame',
              inputNodeIds: [...input.inputNodeIds],
              mediaKind: 'image' as const,
              summary: {
                prompt: 'Create a concept frame from the referenced image',
                model: 'fixture-image-model',
              },
              resultLocators: [
                {
                  kind: 'generated-output' as const,
                  outputId: 'concept-frame',
                  digest: 'sha256:phase-1-generated',
                  path: 'neko/generated/concept-frame.png',
                },
              ],
            }
          : {
              ref: { kind: 'generation' as const, jobId: 'generation-phase-1-failure' },
              phase: 'failed' as const,
              title: 'Generate video',
              inputNodeIds: [...input.inputNodeIds],
              mediaKind: 'video' as const,
              summary: {
                prompt: 'Generate a short video',
                model: 'fixture-video-model',
              },
              failure: {
                code: 'provider-failed',
                message: 'Fixture provider rejected the request',
                retryable: true,
              },
            },
      ),
      resolveResultActions: vi.fn(async () => ({
        regenerate: true,
        editAndGenerate: false,
      })),
      regenerateResult: vi.fn(async () => {
        throw new Error('Regeneration is not exercised by the lifecycle fixture.');
      }),
      detachWindow: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'neko-test',
            locator: { kind: 'relative', value: '.' },
          },
        })),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasPhase1LifecycleTest'),
      }),
      globalMediaLibraryRoot,
      requestSource: vi.fn(async () => ({
        kind: 'external-import' as const,
        source: {
          absolutePath: path.join(externalSourcePath, 'outside.png'),
          sourceName: 'outside.png',
        },
      })),
      generation,
    });

    let snapshot = await runtime.getSnapshot('window-1', identity);
    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'direct-workspace', {
      type: 'author-material',
      request: {
        kind: 'direct-reference',
        identity: materialIdentity(identity),
        locator: { kind: 'workspace-file', path: 'cases/test.png' },
        mediaKind: 'image',
      },
    });
    const referencedSource = snapshot.canvas.nodes.find(
      (node) =>
        (node.type === 'media' || node.type === 'file') &&
        node.data.contentLocator?.kind === 'workspace-file' &&
        node.data.contentLocator.path === 'cases/test.png',
    );
    if (!referencedSource) throw new Error('Referenced source node was not created.');

    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'direct-linked', {
      type: 'author-material',
      request: {
        kind: 'direct-reference',
        identity: materialIdentity(identity),
        locator: {
          kind: 'workspace-file',
          path: 'neko/assets/linked-media/clips/linked.mp4',
        },
        mediaKind: 'video',
      },
    });
    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'global-link', {
      type: 'author-material',
      request: {
        kind: 'global-library-link',
        identity: materialIdentity(identity),
        globalLibraryId: libraryId,
      },
    });
    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'global-copy', {
      type: 'author-material',
      request: {
        kind: 'global-library-copy',
        identity: materialIdentity(identity),
        globalLibraryId: libraryId,
        entryId: 'stills/global-frame.png',
        mediaKind: 'image',
        conflictPolicy: 'reject',
      },
    });
    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'external-import', {
      type: 'request-source',
      sourceKind: 'image',
      sourceMode: 'import',
    });
    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'generation-success', {
      type: 'request-generation-draft',
      mediaKind: 'image',
      position: { x: 420, y: 120 },
      inputNodeIds: [referencedSource.id],
    });
    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'generation-failure', {
      type: 'request-generation-draft',
      mediaKind: 'video',
      position: { x: 680, y: 120 },
      inputNodeIds: [],
    });
    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'derived-output', {
      type: 'author-material',
      request: {
        kind: 'derived-output-commit',
        identity: materialIdentity(identity),
        locator: {
          kind: 'workspace-file',
          path: 'neko/derived/crop/test-cropped.png',
        },
        mediaKind: 'image',
        title: 'test-cropped.png',
        sourceNodeIds: [referencedSource.id],
      },
    });

    expect(snapshot.canvas.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: referencedSource.id,
          data: expect.objectContaining({
            contentLocator: { kind: 'workspace-file', path: 'cases/test.png' },
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            contentLocator: {
              kind: 'workspace-file',
              path: 'neko/assets/linked-media/clips/linked.mp4',
            },
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            contentLocator: expect.objectContaining({
              kind: 'workspace-file',
              path: 'neko/imports/image/global-frame.png',
            }),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            contentLocator: expect.objectContaining({
              kind: 'workspace-file',
              path: 'neko/imports/image/outside.png',
            }),
          }),
        }),
        expect.objectContaining({
          type: 'job',
          data: expect.objectContaining({
            jobRef: { kind: 'generation', jobId: 'generation-phase-1-success' },
            status: 'completed',
          }),
        }),
        expect.objectContaining({
          type: 'media',
          data: expect.objectContaining({
            contentLocator: expect.objectContaining({
              kind: 'generated-output',
              outputId: 'concept-frame',
            }),
            generation: expect.objectContaining({
              jobRef: { kind: 'generation', jobId: 'generation-phase-1-success' },
            }),
          }),
        }),
        expect.objectContaining({
          type: 'job',
          data: expect.objectContaining({
            jobRef: { kind: 'generation', jobId: 'generation-phase-1-failure' },
            status: 'failed',
            diagnostic: 'provider-failed: Fixture provider rejected the request',
            outputRefs: [],
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            contentLocator: {
              kind: 'workspace-file',
              path: 'neko/derived/crop/test-cropped.png',
            },
          }),
        }),
      ]),
    );
    expect(referencedSource.data).not.toHaveProperty('generation');
    expect(
      snapshot.canvas.connections.some(
        (connection) =>
          connection.sourceId === referencedSource.id && connection.type === 'derived-from',
      ),
    ).toBe(true);
    expect(
      snapshot.canvas.nodes.filter(
        (node) =>
          (node.type === 'media' || node.type === 'file') &&
          node.data.generation?.jobRef.jobId === 'generation-phase-1-failure',
      ),
    ).toEqual([]);
    expect(
      await readFile(path.join(workspacePath, 'neko/imports/image/global-frame.png'), 'utf8'),
    ).toBe('global-image');
    expect(await readFile(path.join(workspacePath, 'neko/imports/image/outside.png'), 'utf8')).toBe(
      'external-image',
    );

    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'save-phase-1', {
      type: 'save',
    });
    const serialized = await readFile(path.join(workspacePath, identity.documentId), 'utf8');
    expect(serialized).not.toContain(workspacePath);
    expect(serialized).not.toContain(linkedLibraryPath);
    expect(serialized).not.toContain(globalLibraryPath);
    expect(serialized).not.toContain(externalSourcePath);
    expect(serialized).not.toContain('"actionId"');
    expect(serialized).not.toContain('blob:');
    expect(serialized).not.toContain('data:');
    await runtime.dispose();

    const restartedRuntime = createRuntimeWithGeneration(workspacePath, identity, {
      requestDraft: vi.fn(async () => undefined),
      resolveResultActions: vi.fn(async () => ({
        regenerate: true,
        editAndGenerate: false,
      })),
      regenerateResult: vi.fn(async () => {
        throw new Error('Regeneration is not exercised after restart.');
      }),
      detachWindow: vi.fn(),
      dispose: vi.fn(async () => undefined),
    });
    const restarted = await restartedRuntime.getSnapshot('window-1', identity);
    expect(restarted.canvas).toEqual(snapshot.canvas);
    expect(restarted.canvas.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: referencedSource.id,
          type: 'derived-from',
        }),
        expect.objectContaining({
          sourceId: 'generation-job:generation-phase-1-success',
          type: 'derived-from',
        }),
      ]),
    );
    await restartedRuntime.dispose();
  });

  it('isolates two Canvas document sessions in the same Window and releases both on detach', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-multi-'));
    roots.push(workspacePath);
    await writeFixtureFile(
      workspacePath,
      'boards/first.nkc',
      JSON.stringify({
        name: 'First',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [],
        connections: [],
      }),
    );
    await writeFixtureFile(
      workspacePath,
      'boards/second.nkc',
      JSON.stringify({
        name: 'Second',
        viewport: { pan: { x: 20, y: 30 }, zoom: 1.5 },
        nodes: [],
        connections: [],
      }),
    );
    const first = {
      ...createIdentity(),
      viewId: 'canvas:first',
      documentId: 'boards/first.nkc',
      sessionId: 'canvas-session:canvas:first:view-instance-1',
    };
    const second = {
      ...createIdentity(),
      viewId: 'canvas:second',
      documentId: 'boards/second.nkc',
      sessionId: 'canvas-session:canvas:second:view-instance-1',
    };
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(
          async (_windowId, requested): Promise<DesktopCanvasViewGrant> => ({
            identity: requested,
            workspace: {
              workspaceId: 'workspace-1',
              workspacePath,
              displayName: 'Fixture',
              locator: { kind: 'relative', value: '.' },
            },
          }),
        ),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasRuntimeMultiTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
    });

    const firstSnapshot = await runtime.getSnapshot('window-1', first);
    const secondSnapshot = await runtime.getSnapshot('window-1', second);
    expect(firstSnapshot.canvas.name).toBe('First');
    expect(secondSnapshot.canvas.name).toBe('Second');
    const secondPresentation = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'second-presentation',
        commandId: 'second-presentation',
        identity: second,
        intent: {
          type: 'update-presentation',
          presentation: {
            viewport: { pan: { x: 20, y: 30 }, zoom: 1.5 },
            selectedNodeIds: [],
          },
        },
      }),
    );
    expect(secondPresentation.status).toBe('accepted');
    expect((await runtime.getSnapshot('window-1', first)).presentation.viewport).toEqual({
      pan: { x: 0, y: 0 },
      zoom: 1,
    });
    expect((await runtime.getSnapshot('window-1', second)).presentation.viewport).toEqual({
      pan: { x: 20, y: 30 },
      zoom: 1.5,
    });

    const edit = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'multi-edit',
        commandId: 'multi-edit',
        identity: first,
        intent: {
          type: 'replace-document',
          canvas: { ...firstSnapshot.canvas, name: 'First edited' },
        },
      }),
    );
    expect(edit.status).toBe('accepted');
    expect((await runtime.getSnapshot('window-1', second)).canvas.name).toBe('Second');

    runtime.detachWindow('window-1');
    expect((await runtime.getSnapshot('window-1', first)).canvas.name).toBe('First');
  });
});

function createIdentity(): CanvasHostRuntimeIdentity {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'canvas:view-1',
    viewInstanceId: 'view-instance-1',
    documentId: 'neko/boards/workspace.nkc',
    sessionId: 'canvas-session:canvas:view-1:view-instance-1',
    rendererSessionId: 'app-1:window-1:1',
  };
}

function createRuntime(
  workspacePath: string,
  identity: CanvasHostRuntimeIdentity,
  createPreviewVariant?: (input: {
    readonly absolutePath: string;
    readonly mediaType?: string;
  }) => Promise<string>,
): DesktopCanvasRuntime {
  return new DesktopCanvasRuntime({
    shell: {
      resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
        identity,
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath,
          displayName: 'Fixture',
          locator: { kind: 'relative', value: '.' },
        },
      })),
    },
    host: createElectronNekoHostPorts({
      homedir: workspacePath,
      nekoHome: path.join(workspacePath, '.neko-home'),
      workspaceRoot: workspacePath,
      logger: new ConsoleLogger('DesktopCanvasRuntimeTest'),
    }),
    globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
    ...(createPreviewVariant ? { createPreviewVariant } : {}),
  });
}

function createRuntimeWithGeneration(
  workspacePath: string,
  identity: CanvasHostRuntimeIdentity,
  generation: ConstructorParameters<typeof DesktopCanvasRuntime>[0]['generation'],
): DesktopCanvasRuntime {
  if (!generation) throw new Error('Generation test owner is required.');
  return new DesktopCanvasRuntime({
    shell: {
      resolveCanvasViewGrant: vi.fn(async (): Promise<DesktopCanvasViewGrant> => ({
        identity,
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath,
          displayName: 'Fixture',
          locator: { kind: 'relative', value: '.' },
        },
      })),
    },
    host: createElectronNekoHostPorts({
      homedir: workspacePath,
      nekoHome: path.join(workspacePath, '.neko-home'),
      workspaceRoot: workspacePath,
      logger: new ConsoleLogger('DesktopCanvasGenerationRestartTest'),
    }),
    globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
    generation,
  });
}

function materialIdentity(identity: CanvasHostRuntimeIdentity) {
  return {
    projectId: identity.projectId,
    canvasId: identity.documentId,
    canvasSessionId: identity.sessionId,
  };
}

async function executeAcceptedIntent(
  runtime: DesktopCanvasRuntime,
  identity: CanvasHostRuntimeIdentity,
  snapshot: CanvasHostSnapshot,
  commandId: string,
  intent: CanvasHostIntent,
): Promise<CanvasHostSnapshot> {
  const result = await runtime.executeIntent(
    'window-1',
    createCanvasHostIntentRequest({
      requestId: `request-${commandId}`,
      commandId,
      identity,
      intent,
    }),
  );
  if (result.status !== 'accepted') throw new Error(result.diagnostic.message);
  return result.snapshot;
}

async function writeFixtureFile(
  workspacePath: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const absolutePath = path.join(workspacePath, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}
