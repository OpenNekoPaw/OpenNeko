import type { ContentLocator } from '@neko/content-domain';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  createCanvasGenerationNode,
  createCanvasHostIntentRequest,
  createDefaultCanvasWorkspaceTarget,
  createCanvasWorkspaceTarget,
  type CanvasGenerationApplicationPort,
  type CanvasHostIntent,
  type CanvasHostRuntimeIdentity,
  type CanvasHostSnapshot,
} from '@neko/canvas-domain';
import { ConsoleLogger } from '@neko/shared/logger';
import {
  createWorkspaceLinkedMediaLibrary,
  ProjectMediaLibraryBindingRepository,
} from '@neko/assets-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { DesktopCanvasRuntime } from './desktop-canvas-runtime';
import { CanvasAudioExtractionService } from '@neko/canvas-node';
import {
  CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
  CANVAS_ADD_TO_CUT_ACTION_ID,
  CANVAS_EDIT_TEXT_ACTION_ID,
  CANVAS_OPEN_IN_CUT_ACTION_ID,
  CANVAS_PREVIEW_ACTION_ID,
  CANVAS_REVEAL_ACTION_ID,
  CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID,
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
  it('opens a Canvas with unavailable Generation content and preserves it while saving siblings', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-node-local-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const unavailableData = {
      recipe: { kind: 'image', prompt: '' },
      outputs: [],
      phase: 'running',
    };
    await writeFixtureFile(
      workspacePath,
      identity.documentId,
      JSON.stringify({
        name: 'Node-local failure',
        nodes: [
          {
            id: 'note-1',
            type: 'markdown',
            position: { x: 0, y: 0 },
            size: { width: 280, height: 180 },
            zIndex: 0,
            data: { content: 'available sibling' },
          },
          {
            id: 'generation-invalid',
            type: 'generation',
            position: { x: 320, y: 0 },
            size: { width: 240, height: 180 },
            zIndex: 1,
            data: unavailableData,
          },
        ],
        connections: [],
      }),
    );
    const runtime = createRuntime(workspacePath, identity);

    const opened = await runtime.getSnapshot('window-1', identity);
    expect(opened.canvas.nodes.map((node) => node.id)).toEqual(['note-1', 'generation-invalid']);
    const changed = await executeAcceptedIntent(
      runtime,
      identity,
      opened,
      'rename-sibling-canvas',
      {
        type: 'replace-document',
        canvas: { ...opened.canvas, name: 'Sibling edit saved' },
        removedNodeIds: [],
      },
    );
    await executeAcceptedIntent(runtime, identity, changed, 'save-sibling-edit', { type: 'save' });

    const persisted = JSON.parse(
      await readFile(path.join(workspacePath, identity.documentId), 'utf8'),
    ) as { name: string; nodes: Array<{ id: string; data: unknown }> };
    expect(persisted.name).toBe('Sibling edit saved');
    expect(persisted.nodes.find((node) => node.id === 'generation-invalid')?.data).toEqual(
      unavailableData,
    );
    await runtime.dispose();
  });

  it('returns the document snapshot before resuming persisted Generation runs', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-progressive-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const run = {
      submissionId: 'submission-progressive-1',
      recipeInputFingerprint: 'sha256:progressive-recipe',
      jobRef: { kind: 'generation' as const, jobId: 'generation-progressive-1' },
    };
    const authoredCanvas = createCanvasGenerationNode({
      canvas: {
        name: 'Progressive Canvas',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [],
        connections: [],
      },
      nodeId: 'generation-node-1',
      kind: 'image',
      position: { x: 40, y: 60 },
    });
    const generationNode = authoredCanvas.nodes[0];
    if (!generationNode || generationNode.type !== 'generation') {
      throw new Error('Progressive Generation fixture is invalid.');
    }
    const canvas = {
      ...authoredCanvas,
      nodes: [
        {
          ...generationNode,
          data: { ...generationNode.data, latestRun: run },
        },
      ],
    };
    await writeFixtureFile(workspacePath, identity.documentId, JSON.stringify(canvas));
    let releaseResume = (): void => undefined;
    const resumeGate = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });
    const resumeNode = vi.fn(
      async (
        input: Parameters<CanvasGenerationApplicationPort['resumeNode']>[0],
      ): ReturnType<CanvasGenerationApplicationPort['resumeNode']> => {
        await resumeGate;
        return {
          canvas: input.canvas,
          projection: {
            nodeId: 'generation-node-1',
            ...run,
            phase: 'running' as const,
          },
        };
      },
    );
    const generation: CanvasGenerationApplicationPort = {
      startNode: async () => {
        throw new Error('Generation execution is not expected by this fixture.');
      },
      resumeNode,
      observeNode: async function* () {},
      cancelNode: async () => {
        throw new Error('Generation cancellation is not expected by this fixture.');
      },
      detachWindow: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const runtime = createRuntimeWithGeneration(workspacePath, identity, generation);

    const initial = await runtime.getSnapshot('window-1', identity);
    expect(initial.canvas.name).toBe('Progressive Canvas');
    expect(initial.generationNodes).toEqual([]);
    const events: CanvasHostSnapshot[] = [];
    await runtime.subscribe('window-1', identity, (event) => events.push(event.snapshot));
    await vi.waitFor(() => expect(resumeNode).toHaveBeenCalledOnce());

    releaseResume();
    await vi.waitFor(() => {
      expect(events.at(-1)?.generationNodes).toEqual([
        expect.objectContaining({ nodeId: 'generation-node-1', phase: 'running' }),
      ]);
    });
    await runtime.dispose();
  });

  it('reads a bounded text preview through the workspace content service', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-text-preview-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    await writeFixtureFile(workspacePath, 'data/project.json', '{"name":"OpenNeko"}');
    await writeFixtureFile(
      workspacePath,
      identity.documentId,
      JSON.stringify({
        name: 'Text preview',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'file-json',
            type: 'file',
            position: { x: 0, y: 0 },
            size: { width: 280, height: 180 },
            zIndex: 1,
            data: {
              path: 'data/project.json',
              title: 'project.json',
              mediaType: 'application/json',
              contentLocator: { file: { authority: 'workspace', path: 'data/project.json' } },
            },
          },
        ],
        connections: [],
      }),
    );
    const runtime = createRuntime(workspacePath, identity);
    await runtime.getSnapshot('window-1', identity);

    await expect(
      runtime.readTextFilePreview('window-1', {
        requestId: 'preview-ready',
        identity,
        nodeId: 'file-json',
        locator: { file: { authority: 'workspace', path: 'data/project.json' } },
      }),
    ).resolves.toEqual({
      requestId: 'preview-ready',
      nodeId: 'file-json',
      status: 'ready',
      kind: 'json',
      text: '{\n  "name": "OpenNeko"\n}',
      truncated: false,
      empty: false,
    });
    await expect(
      runtime.readTextFilePreview('window-1', {
        requestId: 'preview-stale',
        identity,
        nodeId: 'file-json',
        locator: { file: { authority: 'workspace', path: 'data/other.json' } },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'canvas-text-preview-stale-node' },
    });
    await runtime.dispose();
  });

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

  it('opens a project Canvas with one mounted Media Library locator isolated to its node', async () => {
    const workspacePath = await mkdtemp(
      path.join(tmpdir(), 'openneko-canvas-mounted-material-isolation-'),
    );
    roots.push(workspacePath);
    const identity = createIdentity();
    const documentPath = path.join(workspacePath, identity.documentId);
    await mkdir(path.dirname(documentPath), { recursive: true });
    const mountedLocator = {
      file: { authority: 'workspace', path: 'neko/assets/Books/story.epub' },
      selector: { kind: 'entry', path: 'image/cover.jpg' },
    } as const;
    await writeFile(
      documentPath,
      JSON.stringify({
        name: 'Imported project Canvas',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'mounted-cover',
            type: 'media',
            position: { x: 40, y: 60 },
            size: { width: 300, height: 180 },
            zIndex: 1,
            data: {
              assetPath: 'Books/story.epub/image/cover.jpg',
              mediaType: 'image',
              contentLocator: mountedLocator,
            },
          },
          {
            id: 'editable-sibling',
            type: 'markdown',
            position: { x: 400, y: 60 },
            size: { width: 260, height: 180 },
            zIndex: 2,
            data: { content: 'Sibling remains editable' },
          },
        ],
        connections: [],
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
        logger: new ConsoleLogger('DesktopCanvasInvalidMaterialIsolationTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      previewResource,
    });

    const snapshot = await runtime.getSnapshot('window-1', identity);
    expect(snapshot.canvas.nodes.map((node) => node.id)).toEqual([
      'mounted-cover',
      'editable-sibling',
    ]);
    await expect(
      runtime.resolveMaterialActions('window-1', {
        requestId: 'resolve-mounted-cover',
        identity,
        selectedNodeIds: ['mounted-cover'],
      }),
    ).resolves.toMatchObject({
      descriptors: [
        expect.objectContaining({
          id: 'preview:open',
          ownerId: 'preview',
        }),
      ],
    });
    expect(previewResource).not.toHaveBeenCalled();

    const saved = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'save-invalid-material-isolation',
        commandId: 'save-invalid-material-isolation',
        identity,
        intent: { type: 'save' },
      }),
    );
    expect(saved.status).toBe('accepted');
    const persisted = JSON.parse(await readFile(documentPath, 'utf8')) as {
      readonly nodes: readonly { readonly data: Readonly<Record<string, unknown>> }[];
    };
    expect(persisted.nodes[0]?.data['contentLocator']).toEqual(mountedLocator);
    expect(persisted.nodes[1]?.data['content']).toBe('Sibling remains editable');
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
            locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
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
          contentLocator: { file: { authority: 'workspace', path: 'media/cat.png' } },
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
            locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
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
      workspace: expect.objectContaining({ workspaceId: 'workspace-1', workspacePath }),
      locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
      absolutePath: await realpath(path.join(workspacePath, 'media/cat.png')),
    });
    await runtime.dispose();
  });

  it('routes a document-entry Image preview without inventing a Host file path', async () => {
    const workspacePath = await mkdtemp(
      path.join(tmpdir(), 'openneko-canvas-document-entry-preview-'),
    );
    roots.push(workspacePath);
    const identity = createIdentity();
    const locator = {
      file: { authority: 'workspace' as const, path: 'books/story.epub' },
      selector: { kind: 'entry' as const, path: 'OPS/images/cover.jpg' },
    };
    await writeFixtureFile(
      workspacePath,
      identity.documentId,
      JSON.stringify({
        name: 'Document entry preview',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'document-entry-image',
            type: 'media',
            position: { x: 40, y: 60 },
            size: { width: 240, height: 160 },
            zIndex: 1,
            data: {
              assetPath: '',
              mediaType: 'image',
              title: 'image result',
              contentLocator: locator,
            },
          },
        ],
        connections: [],
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
        logger: new ConsoleLogger('DesktopCanvasDocumentEntryPreviewTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      previewResource,
    });

    const resolution = await runtime.resolveMaterialActions('window-1', {
      requestId: 'resolve-document-entry-preview',
      identity,
      selectedNodeIds: ['document-entry-image'],
    });
    expect(resolution.descriptors).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: CANVAS_PREVIEW_ACTION_ID })]),
    );
    expect(resolution.descriptors).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: CANVAS_REVEAL_ACTION_ID })]),
    );

    const result = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'preview-document-entry',
        commandId: 'preview-document-entry',
        identity,
        intent: {
          type: 'execute-material-action',
          action: {
            identity: materialIdentity(identity),
            actionId: CANVAS_PREVIEW_ACTION_ID,
            selectedNodeIds: ['document-entry-image'],
            payload: {},
          },
        },
      }),
    );

    expect(result.status).toBe('accepted');
    expect(previewResource).toHaveBeenCalledWith({
      identity,
      workspace: expect.objectContaining({ workspaceId: 'workspace-1', workspacePath }),
      locator,
    });
    await runtime.dispose();
  });

  it('keeps document-entry File actions local when Cut requires a direct Host path', async () => {
    const workspacePath = await mkdtemp(
      path.join(tmpdir(), 'openneko-canvas-document-entry-file-actions-'),
    );
    roots.push(workspacePath);
    const identity = createIdentity();
    const locator = {
      file: { authority: 'workspace' as const, path: 'books/story.epub' },
      selector: { kind: 'entry' as const, path: 'OPS/chapter.xhtml' },
    };
    await writeFixtureFile(
      workspacePath,
      identity.documentId,
      JSON.stringify({
        name: 'Document entry file actions',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'document-entry-file',
            type: 'file',
            position: { x: 40, y: 60 },
            size: { width: 240, height: 160 },
            zIndex: 1,
            data: {
              path: 'OPS/chapter.xhtml',
              title: 'Chapter',
              mediaKind: 'document',
              contentLocator: locator,
            },
          },
        ],
        connections: [],
      }),
    );
    const resolveCut = vi.fn(async () => {
      throw new Error('Document entry must not enter direct Cut path resolution.');
    });
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
        logger: new ConsoleLogger('DesktopCanvasDocumentEntryFileActionsTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      previewResource: vi.fn(async () => undefined),
      resolveCut,
      openInCut: vi.fn(async () => undefined),
    });

    const resolution = await runtime.resolveMaterialActions('window-1', {
      requestId: 'resolve-document-entry-file-actions',
      identity,
      selectedNodeIds: ['document-entry-file'],
    });

    expect(resolution.descriptors).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: CANVAS_PREVIEW_ACTION_ID })]),
    );
    expect(resolution.descriptors).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: CANVAS_OPEN_IN_CUT_ACTION_ID })]),
    );
    expect(resolveCut).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('routes an explicit project Media Library copy without mutating the Canvas source locator', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-library-action-'));
    const linkedLibraryPath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-library-target-'));
    roots.push(workspacePath, linkedLibraryPath);
    await writeFixtureFile(workspacePath, 'media/cat.png', 'image');
    await mkdir(path.join(linkedLibraryPath, 'Characters'), { recursive: true });
    const identity = createIdentity();
    const globalMediaLibraryRoot = path.join(workspacePath, '.global-media-libraries');
    await bindProjectMediaLibrary(
      workspacePath,
      linkedLibraryPath,
      'Project Media',
      globalMediaLibraryRoot,
      identity.projectId,
    );
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
      globalMediaLibraryRoot,
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
            locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
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
        locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
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
            locator: { file: { authority: 'workspace', path: 'cuts/story.otio' } },
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
      locator: { file: { authority: 'workspace', path: 'cuts/story.otio' } },
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

  it('offers Text Editor only for an admitted referenced document and dispatches its exact target', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-edit-text-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'notes/scene.md', '# Scene');
    const identity = createIdentity();
    const resolveEditText = vi.fn(async () => true);
    const editText = vi.fn(async () => undefined);
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
        logger: new ConsoleLogger('DesktopCanvasEditTextActionTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      previewResource,
      resolveEditText,
      editText,
    });
    await runtime.getSnapshot('window-1', identity);
    const authored = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-text-material',
        commandId: 'command-text-material',
        identity,
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: materialIdentity(identity),
            locator: { file: { authority: 'workspace', path: 'notes/scene.md' } },
            mediaKind: 'document',
          },
        },
      }),
    );
    if (authored.status !== 'accepted') throw new Error(authored.diagnostic.message);
    const node = authored.snapshot.canvas.nodes[0];
    if (!node) throw new Error('Authored text node is missing.');
    const expectedTarget = {
      nodeId: node.id,
      mediaKind: 'document' as const,
      origin: 'referenced' as const,
      locator: { file: { authority: 'workspace' as const, path: 'notes/scene.md' } },
    };

    const resolution = await runtime.resolveMaterialActions('window-1', {
      requestId: 'resolve-edit-text-action',
      identity,
      selectedNodeIds: [node.id],
    });

    expect(resolution.descriptors).toEqual([
      expect.objectContaining({ id: CANVAS_EDIT_TEXT_ACTION_ID, ownerId: 'text-editor' }),
    ]);
    expect(resolveEditText).toHaveBeenCalledWith({ identity, target: expectedTarget });

    const action = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-edit-text',
        commandId: 'command-edit-text',
        identity,
        intent: {
          type: 'execute-material-action',
          action: {
            identity: materialIdentity(identity),
            actionId: CANVAS_EDIT_TEXT_ACTION_ID,
            selectedNodeIds: [node.id],
            payload: {},
          },
        },
      }),
    );

    expect(action.status).toBe('accepted');
    expect(editText).toHaveBeenCalledWith({ identity, target: expectedTarget });
    expect(previewResource).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('keeps Cut handoff and Canvas audio derivation as independent video actions', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-add-cut-action-'));
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'media/clip.mp4', 'video');
    const identity = createIdentity();
    const executionPayload = {
      target: {
        kind: 'existing-cut',
        workbenchInstanceId: 'workbench-1',
        viewId: 'cut-view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'cuts/story.otio',
        sessionId: 'cut-session:cut-view-1:view-instance-1',
      },
    } as const;
    const resolveAddToCut = vi.fn(async () => ({
      status: 'available' as const,
      executionPayload,
    }));
    const addToCut = vi.fn(async () => undefined);
    const probe = vi.fn(async () => availableVideoProbe());
    const transcode = vi.fn(async (_sourcePath: string, outputPath: string) => {
      await writeFile(outputPath, 'derived-audio');
    });
    const disposeMedia = vi.fn(async () => undefined);
    const audioExtraction = new CanvasAudioExtractionService({
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      media: { probe, transcode, dispose: disposeMedia },
      createId: () => 'audio-output-1',
    });
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
        logger: new ConsoleLogger('DesktopCanvasAddCutActionTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      resolveAddToCut,
      addToCut,
      audioExtraction,
    });
    await runtime.getSnapshot('window-1', identity);
    const authored = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-video-material',
        commandId: 'command-video-material',
        identity,
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: materialIdentity(identity),
            locator: { file: { authority: 'workspace', path: 'media/clip.mp4' } },
            mediaKind: 'video',
          },
        },
      }),
    );
    if (authored.status !== 'accepted') throw new Error(authored.diagnostic.message);
    const node = authored.snapshot.canvas.nodes[0];
    if (!node) throw new Error('Authored video node is missing.');

    const resolution = await runtime.resolveMaterialActions('window-1', {
      requestId: 'resolve-add-cut-action',
      identity,
      selectedNodeIds: [node.id],
    });
    expect(resolution.descriptors).toEqual([
      expect.objectContaining({
        id: CANVAS_ADD_TO_CUT_ACTION_ID,
        ownerId: 'cut',
        executionPayload,
      }),
      expect.objectContaining({
        id: CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID,
        ownerId: 'media',
      }),
    ]);
    expect(
      resolution.descriptors.some((descriptor) => descriptor.id === CANVAS_OPEN_IN_CUT_ACTION_ID),
    ).toBe(false);
    expect(resolution.descriptors[1]).not.toHaveProperty('executionPayload');
    expect(probe).toHaveBeenCalledWith(await realpath(path.join(workspacePath, 'media/clip.mp4')));

    const action = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-add-to-cut',
        commandId: 'command-add-to-cut',
        identity,
        intent: {
          type: 'execute-material-action',
          action: {
            identity: materialIdentity(identity),
            actionId: CANVAS_ADD_TO_CUT_ACTION_ID,
            selectedNodeIds: [node.id],
            payload: executionPayload,
          },
        },
      }),
    );

    expect(action.status).toBe('accepted');
    expect(addToCut).toHaveBeenCalledWith({
      identity,
      target: expect.objectContaining({
        nodeId: node.id,
        mediaKind: 'video',
        locator: { file: { authority: 'workspace', path: 'media/clip.mp4' } },
      }),
      executionPayload,
    });

    const separate = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'request-separate-video-audio',
        commandId: 'command-separate-video-audio',
        identity,
        intent: {
          type: 'execute-material-action',
          action: {
            identity: materialIdentity(identity),
            actionId: CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID,
            selectedNodeIds: [node.id],
            payload: {},
          },
        },
      }),
    );

    if (separate.status !== 'accepted') throw new Error(separate.diagnostic.message);
    expect(separate.snapshot.canvas.nodes).toHaveLength(2);
    expect(separate.snapshot.canvas.nodes[1]).toMatchObject({
      type: 'media',
      position: {
        x: node.position.x + node.size.width + 40,
        y: node.position.y,
      },
      data: {
        mediaType: 'audio',
        title: 'clip-audio.m4a',
        contentLocator: {
          file: {
            authority: 'workspace',
            path: 'neko/derived/audio/clip-audio-audio-output-1.m4a',
          },
        },
      },
    });
    expect(separate.snapshot.canvas.connections).toEqual([
      expect.objectContaining({ sourceId: node.id, type: 'derived-from' }),
    ]);
    expect(
      await readFile(
        path.join(workspacePath, 'neko/derived/audio/clip-audio-audio-output-1.m4a'),
        'utf8',
      ),
    ).toBe('derived-audio');
    await runtime.dispose();
    expect(disposeMedia).toHaveBeenCalledOnce();
  });

  it('projects Cut actions for the exact selected output of a Video Generation node', async () => {
    const workspacePath = await mkdtemp(
      path.join(tmpdir(), 'openneko-canvas-generated-video-actions-'),
    );
    roots.push(workspacePath);
    await writeFixtureFile(workspacePath, 'neko/generated/video-output-1.mp4', 'video');
    const identity = createIdentity();
    const documentPath = path.join(workspacePath, identity.documentId);
    await mkdir(path.dirname(documentPath), { recursive: true });
    await writeFile(
      documentPath,
      JSON.stringify({
        name: 'Generated video actions',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'video-generation-1',
            type: 'generation',
            position: { x: 40, y: 60 },
            size: { width: 240, height: 160 },
            zIndex: 1,
            data: {
              recipe: { kind: 'video', prompt: '' },
              outputs: [
                {
                  outputId: 'video-output-1',
                  jobRef: { kind: 'generation', jobId: 'generation-job-1' },
                  locator: {
                    file: { authority: 'workspace', path: 'neko/generated/video-output-1.mp4' },
                  },
                  kind: 'video',
                  recipeInputFingerprint: 'recipe-fingerprint-1',
                },
              ],
              selectedOutputId: 'video-output-1',
            },
          },
        ],
        connections: [],
      }),
    );
    const executionPayload = {
      target: {
        kind: 'new-cut-draft',
        workbenchInstanceId: 'workbench-1',
      },
    } as const;
    const resolveAddToCut = vi.fn(async () => ({
      status: 'available' as const,
      executionPayload,
    }));
    const audioExtraction = new CanvasAudioExtractionService({
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      media: {
        probe: vi.fn(async () => availableVideoProbe()),
        transcode: vi.fn(async () => undefined),
        dispose: vi.fn(async () => undefined),
      },
    });
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
        logger: new ConsoleLogger('DesktopCanvasGeneratedVideoActionsTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      resolveAddToCut,
      addToCut: vi.fn(async () => undefined),
      audioExtraction,
    });

    const resolution = await runtime.resolveMaterialActions('window-1', {
      requestId: 'resolve-generated-video-actions',
      identity,
      selectedNodeIds: ['video-generation-1'],
    });

    expect(resolution.descriptors).toEqual([
      expect.objectContaining({ id: CANVAS_ADD_TO_CUT_ACTION_ID, ownerId: 'cut' }),
      expect.objectContaining({ id: CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID, ownerId: 'media' }),
    ]);
    expect(resolveAddToCut).toHaveBeenCalledWith({
      identity,
      target: {
        nodeId: 'video-generation-1',
        mediaKind: 'video',
        origin: 'generated',
        locator: { file: { authority: 'workspace', path: 'neko/generated/video-output-1.mp4' } },
      },
    });
    await runtime.dispose();
  });

  it('keeps generated Image actions available without probing the Cut document owner', async () => {
    const workspacePath = await mkdtemp(
      path.join(tmpdir(), 'openneko-canvas-generated-image-actions-'),
    );
    roots.push(workspacePath);
    const identity = createIdentity();
    const contents = 'generated-image';
    const locator = {
      file: { authority: 'workspace' as const, path: 'neko/generated/image-output-1.png' },
    };
    await writeFixtureFile(workspacePath, locator.file.path, contents);
    await writeFixtureFile(
      workspacePath,
      identity.documentId,
      JSON.stringify({
        name: 'Generated image actions',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'generated-image-1',
            type: 'media',
            position: { x: 40, y: 60 },
            size: { width: 240, height: 160 },
            zIndex: 1,
            data: {
              assetPath: locator.file.path,
              mediaType: 'image',
              contentLocator: locator,
              generation: {
                jobRef: { kind: 'generation', jobId: 'generation-job-1' },
                summary: { prompt: 'Generate an image', model: 'fixture-image-model' },
              },
            },
          },
        ],
        connections: [],
      }),
    );
    const resolveCut = vi.fn(async () => {
      throw new Error('Generated Image must not enter Cut document resolution.');
    });
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
        logger: new ConsoleLogger('DesktopCanvasGeneratedImageActionsTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      previewResource,
      resolveCut,
      openInCut: vi.fn(async () => undefined),
    });

    const resolution = await runtime.resolveMaterialActions('window-1', {
      requestId: 'resolve-generated-image-actions',
      identity,
      selectedNodeIds: ['generated-image-1'],
    });

    expect(resolution.descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: CANVAS_PREVIEW_ACTION_ID, ownerId: 'preview' }),
      ]),
    );
    expect(resolveCut).not.toHaveBeenCalled();

    const action = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'preview-generated-image',
        commandId: 'preview-generated-image',
        identity,
        intent: {
          type: 'execute-material-action',
          action: {
            identity: materialIdentity(identity),
            actionId: CANVAS_PREVIEW_ACTION_ID,
            selectedNodeIds: ['generated-image-1'],
            payload: {},
          },
        },
      }),
    );

    expect(action.status).toBe('accepted');
    expect(previewResource).toHaveBeenCalledWith({
      identity,
      workspace: expect.objectContaining({ workspaceId: 'workspace-1', workspacePath }),
      locator,
      absolutePath: await realpath(path.join(workspacePath, locator.file.path)),
    });
    await runtime.dispose();
  });

  it('projects Preview for the exact selected output of an Image Generation node', async () => {
    const workspacePath = await mkdtemp(
      path.join(tmpdir(), 'openneko-canvas-generation-image-preview-'),
    );
    roots.push(workspacePath);
    const identity = createIdentity();
    const contents = 'generation-image-output';
    const outputId = 'image-output-1';
    const locator = {
      file: { authority: 'workspace' as const, path: 'neko/generated/image-output-1.png' },
    };
    await writeFixtureFile(workspacePath, locator.file.path, contents);
    await writeFixtureFile(
      workspacePath,
      identity.documentId,
      JSON.stringify({
        name: 'Image Generation output preview',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'image-generation-1',
            type: 'generation',
            position: { x: 40, y: 60 },
            size: { width: 240, height: 160 },
            zIndex: 1,
            data: {
              recipe: { kind: 'image', prompt: '' },
              outputs: [
                {
                  outputId,
                  jobRef: { kind: 'generation', jobId: 'generation-job-1' },
                  locator,
                  kind: 'image',
                  recipeInputFingerprint: 'recipe-fingerprint-1',
                },
              ],
              selectedOutputId: outputId,
            },
          },
        ],
        connections: [],
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
        logger: new ConsoleLogger('DesktopCanvasGenerationImagePreviewTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      previewResource,
    });

    const resolution = await runtime.resolveMaterialActions('window-1', {
      requestId: 'resolve-image-generation-preview',
      identity,
      selectedNodeIds: ['image-generation-1'],
    });
    expect(resolution.descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: CANVAS_PREVIEW_ACTION_ID, ownerId: 'preview' }),
      ]),
    );

    const action = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'preview-image-generation-output',
        commandId: 'preview-image-generation-output',
        identity,
        intent: {
          type: 'execute-material-action',
          action: {
            identity: materialIdentity(identity),
            actionId: CANVAS_PREVIEW_ACTION_ID,
            selectedNodeIds: ['image-generation-1'],
            payload: {},
          },
        },
      }),
    );

    expect(action.status).toBe('accepted');
    expect(previewResource).toHaveBeenCalledWith({
      identity,
      workspace: expect.objectContaining({ workspaceId: 'workspace-1', workspacePath }),
      locator,
      absolutePath: await realpath(path.join(workspacePath, locator.file.path)),
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
            file: { authority: 'workspace', path: 'neko/imports/model/character.glb' },
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
      locator: { file: { authority: 'workspace' as const, path: 'media/cat.png' } },
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
          contentLocator: { file: { authority: 'workspace', path: 'media/cat.png' } },
          assetPath: 'media/cat.png',
        }),
      }),
    ]);
    await expect(
      readFile(path.join(workspacePath, 'neko/imports/image/cat.png')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await runtime.dispose();
  });

  it('creates one empty Generation Node without submitting a Job or sibling material', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-generation-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const generation = createGenerationPort();
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
        requestId: 'create-generation-node',
        commandId: 'create-generation-node',
        identity,
        intent: {
          type: 'create-generation-node',
          kind: 'image',
          position: { x: 64, y: 96 },
        },
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error(result.diagnostic.message);
    expect(result.snapshot.canvas.nodes[0]?.id).toMatch(
      /^generation-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(result.snapshot.canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'generation',
        position: { x: 64, y: 96 },
        data: expect.objectContaining({
          recipe: {
            kind: 'image',
            prompt: '',
            aspectRatio: '1:1',
            width: 1024,
            height: 1024,
            count: 1,
            quality: 'auto',
          },
          outputs: [],
        }),
      }),
    ]);
    expect(result.snapshot.canvas.nodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'media' }),
        expect.objectContaining({ type: 'file' }),
        expect.objectContaining({ type: 'job' }),
      ]),
    );
    expect(generation.startNode).not.toHaveBeenCalled();

    runtime.detachWindow('window-1');
    expect(generation.detachWindow).toHaveBeenCalledWith('window-1');
    await runtime.dispose();
    expect(generation.dispose).toHaveBeenCalledOnce();
  });

  it('does not advertise Generation kinds without the Generation application port', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-result-only-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const runtime = createRuntime(workspacePath, identity);

    const snapshot = await runtime.getSnapshot('window-1', identity);

    expect(snapshot.authoringCapabilities.generationKinds).toEqual([]);
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
            locator: { file: { authority: 'workspace', path: 'escape/secret.png' } },
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

  it('authorizes and releases embedded Preview leases for exact Canvas outputs fail-locally', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-preview-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const firstLocator = {
      file: { authority: 'workspace' as const, path: 'neko/generated/output-1.png' },
    };
    const secondLocator = {
      file: { authority: 'workspace' as const, path: 'neko/generated/output-2.png' },
    };
    await writeFixtureFile(
      workspacePath,
      identity.documentId,
      JSON.stringify({
        name: 'Embedded preview',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'generation-1',
            type: 'generation',
            position: { x: 0, y: 0 },
            size: { width: 240, height: 180 },
            zIndex: 1,
            data: {
              recipe: { kind: 'image', prompt: 'Character', count: 2 },
              outputs: [
                {
                  outputId: 'output-1',
                  jobRef: { kind: 'generation', jobId: 'job-1' },
                  locator: firstLocator,
                  kind: 'image',
                  recipeInputFingerprint: 'recipe-1',
                },
                {
                  outputId: 'output-2',
                  jobRef: { kind: 'generation', jobId: 'job-1' },
                  locator: secondLocator,
                  kind: 'image',
                  recipeInputFingerprint: 'recipe-1',
                },
              ],
              selectedOutputId: 'output-1',
            },
          },
        ],
        connections: [],
      }),
    );
    const releases = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    let grantAvailable = true;
    const resolveCanvasViewGrant = vi.fn(async (): Promise<DesktopCanvasViewGrant> => {
      if (!grantAvailable) {
        throw new Error('Desktop Canvas View identity is not granted by the active Workbench.');
      }
      return {
        identity,
        workspace: {
          workspaceId: 'workspace-1',
          workspacePath,
          displayName: 'Fixture',
          locator: { kind: 'relative', value: '.' },
        },
      };
    });
    let registrationIndex = 0;
    const registerPreviewResource = vi.fn(
      async ({ locator }: { readonly locator: ContentLocator }) => {
        const sourcePath = locator.file.path;
        const index = registrationIndex++;
        return {
          url: `openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${sourcePath}-${index}`,
          sourceFingerprint: `sha256-${sourcePath}`,
          byteLength: 42,
          mediaType: 'image/png',
          release: releases[index]!,
        };
      },
    );
    const runtime = createRuntime(
      workspacePath,
      identity,
      registerPreviewResource,
      resolveCanvasViewGrant,
    );
    await runtime.getSnapshot('window-1', identity);

    await expect(
      runtime.resolvePreviewResource('window-1', {
        identity,
        requestId: 'embedded-invalid',
        nodeId: 'generation-1',
        outputId: 'output-1',
        locator: { file: { authority: 'workspace', path: 'neko/generated/stale.png' } },
        contentKind: 'image',
        mediaType: 'image/png',
        displayName: 'Stale',
      }),
    ).rejects.toThrow('output "output-1" is stale');
    expect(registerPreviewResource).not.toHaveBeenCalled();

    const first = await runtime.resolvePreviewResource('window-1', {
      identity,
      requestId: 'embedded-1',
      nodeId: 'generation-1',
      outputId: 'output-1',
      locator: firstLocator,
      contentKind: 'image',
      mediaType: 'image/png',
      displayName: 'Output 1',
    });
    expect(first.descriptor).toMatchObject({
      contentLocator: firstLocator,
      contentKind: 'image',
      url: expect.stringMatching(/^openneko:\/\/resource\//u),
    });
    expect(registerPreviewResource).toHaveBeenLastCalledWith(
      expect.objectContaining({ purpose: 'viewer-source' }),
    );
    await runtime.releasePreviewResource('window-1', {
      identity,
      descriptorId: first.descriptor.descriptorId,
    });
    expect(releases[0]).toHaveBeenCalledOnce();

    const staleMount = await runtime.resolvePreviewResource('window-1', {
      identity,
      requestId: 'embedded-remount-stale',
      nodeId: 'generation-1',
      outputId: 'output-1',
      locator: firstLocator,
      contentKind: 'image',
      mediaType: 'image/png',
      displayName: 'Output 1',
    });
    const activeMount = await runtime.resolvePreviewResource('window-1', {
      identity,
      requestId: 'embedded-remount-active',
      nodeId: 'generation-1',
      outputId: 'output-1',
      locator: firstLocator,
      contentKind: 'image',
      mediaType: 'image/png',
      displayName: 'Output 1',
    });
    expect(staleMount.descriptor.descriptorId).not.toBe(activeMount.descriptor.descriptorId);
    await runtime.releasePreviewResource('window-1', {
      identity,
      descriptorId: staleMount.descriptor.descriptorId,
    });
    expect(releases[1]).toHaveBeenCalledOnce();
    expect(releases[2]).not.toHaveBeenCalled();
    await runtime.releasePreviewResource('window-1', {
      identity,
      descriptorId: activeMount.descriptor.descriptorId,
    });
    expect(releases[2]).toHaveBeenCalledOnce();

    const detachedMount = await runtime.resolvePreviewResource('window-1', {
      identity,
      requestId: 'embedded-2',
      nodeId: 'generation-1',
      outputId: 'output-2',
      locator: secondLocator,
      contentKind: 'image',
      mediaType: 'image/png',
      displayName: 'Output 2',
    });
    expect(detachedMount).toMatchObject({ descriptor: { contentLocator: secondLocator } });
    expect(registerPreviewResource).toHaveBeenCalledTimes(4);

    grantAvailable = false;
    await expect(
      runtime.releasePreviewResource('window-2', {
        identity,
        descriptorId: detachedMount.descriptor.descriptorId,
      }),
    ).rejects.toThrow('Window identity does not match the sender');
    expect(releases[3]).not.toHaveBeenCalled();
    await expect(
      runtime.releasePreviewResource('window-1', {
        identity,
        descriptorId: detachedMount.descriptor.descriptorId,
      }),
    ).resolves.toBeUndefined();
    expect(releases[3]).toHaveBeenCalledOnce();
    await expect(
      runtime.releasePreviewResource('window-1', {
        identity,
        descriptorId: detachedMount.descriptor.descriptorId,
      }),
    ).resolves.toBeUndefined();
    expect(releases[3]).toHaveBeenCalledOnce();
    await expect(
      runtime.resolvePreviewResource('window-1', {
        identity,
        requestId: 'embedded-after-detach',
        nodeId: 'generation-1',
        outputId: 'output-2',
        locator: secondLocator,
        contentKind: 'image',
        mediaType: 'image/png',
        displayName: 'Output 2',
      }),
    ).rejects.toThrow('not granted by the active Workbench');
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
    runtime.reconcileWindow('window-1', [secondLayout]);
    await expect(runtime.getSnapshot('window-1', secondIdentity)).resolves.toMatchObject({
      identity: secondIdentity,
    });

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
        intent: { type: 'replace-document', canvas: editedCanvas, removedNodeIds: [] },
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

  it('keeps historical generated Job and Media nodes readable without regenerate actions', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-generation-restart-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const locator = {
      file: { authority: 'workspace' as const, path: 'neko/generated/frame-1.png' },
    };
    await writeFixtureFile(workspacePath, locator.file.path, 'generated-image');
    await writeFixtureFile(
      workspacePath,
      identity.documentId,
      JSON.stringify({
        name: 'Historical Canvas',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'generation-job:generation-restart-1',
            type: 'job',
            position: { x: 120, y: 160 },
            size: { width: 240, height: 150 },
            zIndex: 0,
            data: {
              jobRef: { kind: 'generation', jobId: 'generation-restart-1' },
              title: 'Generate concept frame',
              status: 'completed',
              inputRefs: [],
              outputRefs: [{ kind: 'canvas-node', nodeId: 'historical-media-1' }],
            },
          },
          {
            id: 'historical-media-1',
            type: 'media',
            position: { x: 400, y: 160 },
            size: { width: 320, height: 240 },
            zIndex: 1,
            data: {
              assetPath: locator.file.path,
              mediaType: 'image',
              contentLocator: locator,
              generation: {
                jobRef: { kind: 'generation', jobId: 'generation-restart-1' },
                summary: {
                  prompt: 'Create a quiet night-time concept frame',
                  model: 'fixture-image-model',
                },
              },
            },
          },
        ],
        connections: [
          {
            id: 'historical-generation-output',
            sourceId: 'generation-job:generation-restart-1',
            targetId: 'historical-media-1',
            sourceEndpoint: {
              nodeId: 'generation-job:generation-restart-1',
              scope: 'node',
            },
            targetEndpoint: { nodeId: 'historical-media-1', scope: 'node' },
            sourceAnchor: 'right',
            targetAnchor: 'left',
            type: 'derived-from',
          },
        ],
      }),
    );
    const restartedRuntime = createRuntimeWithGeneration(
      workspacePath,
      identity,
      createGenerationPort(),
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
          id: 'historical-media-1',
          type: 'media',
          data: expect.objectContaining({
            contentLocator: locator,
            generation: {
              jobRef: { kind: 'generation', jobId: 'generation-restart-1' },
              summary: {
                prompt: 'Create a quiet night-time concept frame',
                model: 'fixture-image-model',
              },
            },
          }),
        }),
      ]),
    );
    expect(restarted.canvas.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'generation-job:generation-restart-1',
          targetId: 'historical-media-1',
          type: 'derived-from',
        }),
      ]),
    );

    const resolution = await restartedRuntime.resolveMaterialActions('window-1', {
      requestId: 'resolve-restarted-generation-actions',
      identity,
      selectedNodeIds: ['historical-media-1'],
    });
    expect(resolution.descriptors.map((descriptor) => descriptor.ownerId)).not.toContain(
      'generation',
    );
    expect(restarted.canvas.nodes.some((node) => node.type === 'generation')).toBe(false);
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
      writeFixtureFile(workspacePath, 'neko/derived/crop/test-cropped.png', 'derived-image'),
      writeFixtureFile(linkedLibraryPath, 'clips/linked.mp4', 'linked-video'),
      writeFixtureFile(globalLibraryPath, 'stills/global-frame.png', 'global-image'),
      writeFixtureFile(externalSourcePath, 'outside.png', 'external-image'),
    ]);
    const identity = createIdentity();
    const globalMediaLibraryRoot = path.join(workspacePath, '.global-media-libraries');
    await bindProjectMediaLibrary(
      workspacePath,
      linkedLibraryPath,
      'linked-media',
      globalMediaLibraryRoot,
      identity.projectId,
    );
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: globalMediaLibraryRoot,
      sourceDirectory: globalLibraryPath,
      locationKind: 'local',
    });
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
    });

    let snapshot = await runtime.getSnapshot('window-1', identity);
    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'direct-workspace', {
      type: 'author-material',
      request: {
        kind: 'direct-reference',
        identity: materialIdentity(identity),
        locator: { file: { authority: 'workspace', path: 'cases/test.png' } },
        mediaKind: 'image',
      },
    });
    const referencedSource = snapshot.canvas.nodes.find(
      (node) =>
        (node.type === 'media' || node.type === 'file') &&
        node.data.contentLocator?.file.authority === 'workspace' &&
        node.data.contentLocator.file.path === 'cases/test.png',
    );
    if (!referencedSource) throw new Error('Referenced source node was not created.');

    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'direct-linked', {
      type: 'author-material',
      request: {
        kind: 'direct-reference',
        identity: materialIdentity(identity),
        locator: {
          file: { authority: 'workspace', path: 'neko/assets/linked-media/clips/linked.mp4' },
        },
        mediaKind: 'video',
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
    snapshot = await executeAcceptedIntent(runtime, identity, snapshot, 'derived-output', {
      type: 'author-material',
      request: {
        kind: 'derived-output-commit',
        identity: materialIdentity(identity),
        locator: { file: { authority: 'workspace', path: 'neko/derived/crop/test-cropped.png' } },
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
            contentLocator: { file: { authority: 'workspace', path: 'cases/test.png' } },
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            contentLocator: {
              file: { authority: 'workspace', path: 'neko/assets/linked-media/clips/linked.mp4' },
            },
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            contentLocator: expect.objectContaining({
              file: { authority: 'workspace', path: 'neko/imports/image/global-frame.png' },
            }),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            contentLocator: expect.objectContaining({
              file: { authority: 'workspace', path: 'neko/imports/image/outside.png' },
            }),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            contentLocator: {
              file: { authority: 'workspace', path: 'neko/derived/crop/test-cropped.png' },
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

    const restartedRuntime = createRuntime(workspacePath, identity);
    const restarted = await restartedRuntime.getSnapshot('window-1', identity);
    expect(restarted.canvas).toEqual(snapshot.canvas);
    expect(restarted.canvas.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: referencedSource.id,
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
          removedNodeIds: [],
        },
      }),
    );
    expect(edit.status).toBe('accepted');
    expect((await runtime.getSnapshot('window-1', second)).canvas.name).toBe('Second');

    runtime.detachWindow('window-1');
    expect((await runtime.getSnapshot('window-1', first)).canvas.name).toBe('First');
  });

  it('projects committed Canvas mutations into the clean open session and blocks dirty sessions', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-live-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const documentPath = path.join(workspacePath, identity.documentId);
    await mkdir(path.dirname(documentPath), { recursive: true });
    await writeFile(
      documentPath,
      JSON.stringify({
        name: 'Before delivery',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [],
        connections: [],
      }),
    );
    const runtime = createRuntime(workspacePath, identity);
    const initial = await runtime.getSnapshot('window-1', identity);
    const secondIdentity = {
      ...identity,
      viewId: 'canvas:view-2',
      viewInstanceId: 'view-instance-2',
      sessionId: 'canvas-session:canvas:view-2:view-instance-2',
    };
    await runtime.getSnapshot('window-1', secondIdentity);
    const projectionEvents: CanvasHostSnapshot[] = [];
    const secondProjectionEvents: CanvasHostSnapshot[] = [];
    await runtime.subscribe('window-1', identity, (event) => {
      projectionEvents.push(event.snapshot);
    });
    await runtime.subscribe('window-1', secondIdentity, (event) => {
      secondProjectionEvents.push(event.snapshot);
    });
    await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'saved-edit-before-delivery',
        commandId: 'saved-edit-before-delivery',
        identity,
        intent: {
          type: 'replace-document',
          canvas: { ...initial.canvas, name: 'Saved user edit' },
          removedNodeIds: [],
        },
      }),
    );
    await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'save-edit-before-delivery',
        commandId: 'save-edit-before-delivery',
        identity,
        intent: { type: 'save' },
      }),
    );

    await runtime.coordinateCanvasDocumentMutation(
      createDefaultCanvasWorkspaceTarget('workspace-1'),
      async () => {
        await writeFile(
          documentPath,
          JSON.stringify({
            name: 'Agent delivery',
            viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
            nodes: [
              {
                id: 'agent-output',
                type: 'media',
                position: { x: 40, y: 60 },
                size: { width: 240, height: 160 },
                zIndex: 1,
                data: { assetPath: 'output.png', mediaType: 'image' },
              },
            ],
            connections: [],
          }),
        );
        return undefined;
      },
    );

    expect((await runtime.getSnapshot('window-1', identity)).canvas.name).toBe('Agent delivery');
    expect((await runtime.getSnapshot('window-1', secondIdentity)).canvas.name).toBe(
      'Agent delivery',
    );
    expect(projectionEvents.at(-1)?.canvas.name).toBe('Agent delivery');
    expect(secondProjectionEvents.at(-1)?.canvas.name).toBe('Agent delivery');
    const undo = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'undo-after-delivery',
        commandId: 'undo-after-delivery',
        identity,
        intent: { type: 'undo' },
      }),
    );
    expect(undo.status).toBe('accepted');
    if (undo.status !== 'accepted') throw new Error(undo.diagnostic.message);
    expect(undo.snapshot.canvas.name).toBe('Agent delivery');
    expect(undo.snapshot.canvas.nodes.map((node) => node.id)).toEqual(['agent-output']);
    await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'save-live-board',
        commandId: 'save-live-board',
        identity,
        intent: { type: 'save' },
      }),
    );
    expect(JSON.parse(await readFile(documentPath, 'utf8'))).toMatchObject({
      name: 'Agent delivery',
    });
    runtime.detachWindow('window-1');
    const reopened = await runtime.getSnapshot('window-1', identity);
    expect(reopened.canvas.name).toBe('Agent delivery');
    expect(reopened.canvas.nodes.map((node) => node.id)).toEqual(['agent-output']);

    const snapshot = reopened;
    await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'dirty-live-board',
        commandId: 'dirty-live-board',
        identity,
        intent: {
          type: 'replace-document',
          canvas: { ...snapshot.canvas, name: 'Unsaved user edit' },
          removedNodeIds: [],
        },
      }),
    );
    const mutation = vi.fn(async () => undefined);
    await expect(
      runtime.coordinateCanvasDocumentMutation(
        createDefaultCanvasWorkspaceTarget('workspace-1'),
        mutation,
      ),
    ).resolves.toBeUndefined();
    expect(mutation).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(documentPath, 'utf8'))).toMatchObject({
      name: 'Unsaved user edit',
    });
    expect((await runtime.getSnapshot('window-1', identity)).canvas.name).toBe('Unsaved user edit');
    await runtime.dispose();
  });

  it('projects an Agent mutation into the exact open Canvas without reopening it', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-exact-live-'));
    roots.push(workspacePath);
    const identity = { ...createIdentity(), documentId: 'blame-PV.nkc' };
    const documentPath = path.join(workspacePath, identity.documentId);
    await writeFile(
      documentPath,
      JSON.stringify({
        name: 'BLAME PV',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [],
        connections: [],
      }),
    );
    const runtime = createRuntime(workspacePath, identity);
    await runtime.getSnapshot('window-1', identity);
    const projectionEvents: CanvasHostSnapshot[] = [];
    await runtime.subscribe('window-1', identity, (event) => {
      projectionEvents.push(event.snapshot);
    });

    await runtime.coordinateCanvasDocumentMutation(
      createCanvasWorkspaceTarget(identity.workspaceId, identity.documentId),
      async () => {
        await writeFile(
          documentPath,
          JSON.stringify({
            name: 'BLAME PV',
            viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
            nodes: [
              {
                id: 'agent-output',
                type: 'markdown',
                position: { x: 40, y: 60 },
                size: { width: 320, height: 180 },
                zIndex: 1,
                data: { content: '# Agent output' },
              },
            ],
            connections: [],
          }),
        );
        return undefined;
      },
    );

    expect((await runtime.getSnapshot('window-1', identity)).canvas.nodes).toEqual([
      expect.objectContaining({ id: 'agent-output' }),
    ]);
    expect(projectionEvents.at(-1)?.canvas.nodes).toEqual([
      expect.objectContaining({ id: 'agent-output' }),
    ]);
    await runtime.dispose();
  });

  it('rejects a stale Canvas save that omits authoritative nodes without removal evidence', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-save-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const documentPath = path.join(workspacePath, identity.documentId);
    await mkdir(path.dirname(documentPath), { recursive: true });
    await writeFile(
      documentPath,
      JSON.stringify({
        name: 'Before delivery',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [],
        connections: [],
      }),
    );
    const runtime = createRuntime(workspacePath, identity);
    const opened = await runtime.getSnapshot('window-1', identity);
    await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'local-edit-before-delivery',
        commandId: 'local-edit-before-delivery',
        identity,
        intent: {
          type: 'replace-document',
          canvas: { ...opened.canvas, name: 'Local edit' },
          removedNodeIds: [],
        },
      }),
    );
    const delivered = {
      name: 'Agent delivery',
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      nodes: [
        {
          id: 'agent-output',
          type: 'media' as const,
          position: { x: 40, y: 60 },
          size: { width: 240, height: 160 },
          zIndex: 1,
          data: { assetPath: 'output.png', mediaType: 'image' as const },
        },
      ],
      connections: [],
    };
    await writeFile(documentPath, JSON.stringify(delivered));

    const staleSave = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'stale-canvas-save',
        commandId: 'stale-canvas-save',
        identity,
        intent: { type: 'save' },
      }),
    );

    expect(staleSave).toMatchObject({
      status: 'rejected',
      diagnostic: {
        code: 'canvas-runtime-effect-failed',
        message: expect.stringContaining('canvas-authoritative-save-conflict'),
      },
    });
    expect(JSON.parse(await readFile(documentPath, 'utf8')).nodes).toEqual(delivered.nodes);

    const current = await runtime.getSnapshot('window-1', identity);
    await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'explicit-canvas-removal-evidence',
        commandId: 'explicit-canvas-removal-evidence',
        identity,
        intent: {
          type: 'replace-document',
          canvas: current.canvas,
          removedNodeIds: ['agent-output'],
        },
      }),
    );
    const explicitRemoval = await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'explicit-canvas-removal',
        commandId: 'explicit-canvas-removal',
        identity,
        intent: { type: 'save' },
      }),
    );
    expect(explicitRemoval.status).toBe('accepted');
    expect(JSON.parse(await readFile(documentPath, 'utf8')).nodes).toEqual([]);
    await runtime.dispose();
  });

  it('resolves a Workspace grant before entering the Canvas mutation queue', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-open-'));
    roots.push(workspacePath);
    const identity = createIdentity();
    const resolveCanvasViewGrant = vi.fn(async (): Promise<DesktopCanvasViewGrant> => {
      await runtime.coordinateCanvasDocumentMutation(
        createDefaultCanvasWorkspaceTarget(identity.workspaceId),
        async () => undefined,
      );
      return {
        identity,
        workspace: {
          workspaceId: identity.workspaceId,
          workspacePath,
          displayName: 'Fixture',
          locator: { kind: 'relative', value: '.' },
        },
      };
    });
    const runtime = new DesktopCanvasRuntime({
      shell: { resolveCanvasViewGrant },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasOpenTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
    });

    const snapshot = await runtime.getSnapshot('window-1', identity);

    expect(snapshot.canvas.name).toBe('Fixture Canvas');
    expect(resolveCanvasViewGrant).toHaveBeenCalledOnce();
    await runtime.dispose();
  });

  it('closes a clean deleted exact Canvas and preserves a dirty deleted sibling', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-canvas-delete-'));
    roots.push(workspacePath);
    const cleanIdentity = { ...createIdentity(), documentId: 'boards/clean.nkc' };
    const dirtyIdentity = {
      ...createIdentity(),
      viewId: 'canvas:view-dirty',
      sessionId: 'canvas-session:canvas:view-dirty:view-instance-1',
      documentId: 'boards/dirty.nkc',
    };
    const fixture = JSON.stringify({
      name: 'Fixture',
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      nodes: [],
      connections: [],
    });
    await writeFixtureFile(workspacePath, cleanIdentity.documentId, fixture);
    await writeFixtureFile(workspacePath, dirtyIdentity.documentId, fixture);
    const watchers = new Map<string, () => Promise<void>>();
    const closeCanvasView = vi.fn(async () => undefined);
    const runtime = new DesktopCanvasRuntime({
      shell: {
        resolveCanvasViewGrant: vi.fn(async (_windowId, identity) => ({
          identity,
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath,
            displayName: 'Fixture',
            locator: { kind: 'relative' as const, value: '.' },
          },
        })),
        closeCanvasView,
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCanvasDeleteTest'),
      }),
      globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
      watchFile: (_directory, fileName, onChange) => {
        watchers.set(fileName, onChange);
        return { close: () => undefined };
      },
    });
    await runtime.getSnapshot('window-1', cleanIdentity);
    const dirtySnapshot = await runtime.getSnapshot('window-1', dirtyIdentity);
    await runtime.executeIntent(
      'window-1',
      createCanvasHostIntentRequest({
        requestId: 'dirty-edit',
        commandId: 'dirty-edit',
        identity: dirtyIdentity,
        intent: {
          type: 'replace-document',
          canvas: { ...dirtySnapshot.canvas, name: 'Unsaved dirty Canvas' },
          removedNodeIds: [],
        },
      }),
    );

    await rm(path.join(workspacePath, cleanIdentity.documentId));
    await watchers.get('clean.nkc')?.();
    expect(closeCanvasView).toHaveBeenCalledWith(cleanIdentity);

    await rm(path.join(workspacePath, dirtyIdentity.documentId));
    await watchers.get('dirty.nkc')?.();
    expect(closeCanvasView).toHaveBeenCalledTimes(1);
    await expect(runtime.getSnapshot('window-1', dirtyIdentity)).resolves.toMatchObject({
      dirty: true,
      canvas: { name: 'Unsaved dirty Canvas' },
    });
    await runtime.dispose();
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
  registerPreviewResource?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: DesktopCanvasViewGrant['workspace'];
    readonly locator: import('@neko/content-domain').ContentLocator;
    readonly purpose: 'viewer-source';
    readonly mediaType?: string;
  }) => Promise<{
    readonly url: string;
    readonly sourceFingerprint: string;
    readonly byteLength: number;
    readonly mediaType: string;
    release(): void;
  }>,
  resolveCanvasViewGrant: (
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
  ) => Promise<DesktopCanvasViewGrant> = async () => ({
    identity,
    workspace: {
      workspaceId: 'workspace-1',
      workspacePath,
      displayName: 'Fixture',
      locator: { kind: 'relative', value: '.' },
    },
  }),
): DesktopCanvasRuntime {
  const previewLeases = new Map<string, { release(): void }>();
  return new DesktopCanvasRuntime({
    shell: {
      resolveCanvasViewGrant: vi.fn(resolveCanvasViewGrant),
    },
    host: createElectronNekoHostPorts({
      homedir: workspacePath,
      nekoHome: path.join(workspacePath, '.neko-home'),
      workspaceRoot: workspacePath,
      logger: new ConsoleLogger('DesktopCanvasRuntimeTest'),
    }),
    globalMediaLibraryRoot: path.join(workspacePath, '.global-media-libraries'),
    ...(registerPreviewResource
      ? {
          projectPreviewResource: async ({ descriptorId, displayName, ...request }) => {
            const lease = await registerPreviewResource(request);
            previewLeases.set(descriptorId, lease);
            const contentKind = lease.mediaType.startsWith('image/')
              ? 'image'
              : lease.mediaType.startsWith('video/')
                ? 'video'
                : lease.mediaType.startsWith('audio/')
                  ? 'audio'
                  : lease.mediaType.startsWith('text/')
                    ? 'text'
                    : 'document';
            return {
              status: 'ready' as const,
              lease,
              descriptor: {
                descriptorId,
                sourceFingerprint: lease.sourceFingerprint,
                contentLocator: request.locator,
                url: lease.url,
                contentKind,
                mediaType: lease.mediaType,
                displayName,
                byteLength: lease.byteLength,
              },
            };
          },
          releasePreviewResourceProjection: (descriptorId: string) => {
            previewLeases.get(descriptorId)?.release();
            previewLeases.delete(descriptorId);
          },
        }
      : {}),
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

function createGenerationPort() {
  return {
    startNode: vi.fn(async () => {
      throw new Error('Generation execution is not expected by this fixture.');
    }),
    resumeNode: vi.fn(async () => {
      throw new Error('Generation recovery is not expected by this fixture.');
    }),
    observeNode: vi.fn(() => {
      throw new Error('Generation observation is not expected by this fixture.');
    }),
    cancelNode: vi.fn(async () => {
      throw new Error('Generation cancellation is not expected by this fixture.');
    }),
    detachWindow: vi.fn(),
    dispose: vi.fn(async () => undefined),
  } satisfies CanvasGenerationApplicationPort;
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

async function bindProjectMediaLibrary(
  workspacePath: string,
  sourceDirectory: string,
  libraryName: string,
  globalMediaLibraryRoot: string,
  projectId: string,
): Promise<void> {
  const { libraryId } = await createGlobalMediaLibraryConnection({
    mediaLibraryRoot: globalMediaLibraryRoot,
    sourceDirectory,
    locationKind: 'local',
  });
  await createWorkspaceLinkedMediaLibrary({
    workspaceRoot: workspacePath,
    name: libraryName,
    targetDirectory: sourceDirectory,
  });
  await new ProjectMediaLibraryBindingRepository(workspacePath, projectId).apply({
    libraryName,
    connectionId: libraryId,
    expectedBindingFingerprint: null,
  });
}

function availableVideoProbe() {
  return {
    durationSeconds: 5,
    formatName: 'mov,mp4',
    video: {
      streamIndex: 0,
      codecName: 'h264',
      width: 1280,
      height: 720,
      framesPerSecond: 30,
      color: {},
    },
    audioStreams: [
      {
        streamIndex: 1,
        codecName: 'aac',
        sampleRate: 48_000,
        channels: 2,
      },
    ],
  };
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
