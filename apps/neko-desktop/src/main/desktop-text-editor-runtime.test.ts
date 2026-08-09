import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { ResourceBrowserIdentity } from '@neko/assets-domain/resource-browser/contract';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';
import {
  createDefaultDesktopApplicationSidebar,
  parseDesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';
import { TEXT_EDITOR_HOST_ROUTES } from '@neko/text-editor-domain';
import type { Tool } from '@neko/agent-contracts';
import { createCoreTools } from '@neko/agent-runtime/tools';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopTextEditorRuntime,
  type DesktopTextEditorWatchFile,
  type DesktopTextEditorShellPort,
} from './desktop-text-editor-runtime';

const roots: string[] = [];
const resourceIdentity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:project-view-1',
  viewInstanceId: 'view-instance-1',
  rendererSessionId: 'renderer-1',
};

function emptyReferenceCatalog() {
  return {
    search: vi.fn(
      async (
        request: import('@neko/text-editor-domain').TextEditorMarkdownReferenceSearchRequest,
      ) => ({
        status: 'ready' as const,
        projection: {
          requestId: request.requestId,
          identity: request.identity,
          sessionId: request.sessionId,
          editSequence: request.editSequence,
          kind: request.kind,
          query: request.query,
          candidates: [],
          diagnostics: [],
        },
      }),
    ),
  };
}

function emptyMediaService() {
  return {
    prepare: vi.fn(),
    release: vi.fn(),
    releaseSession: vi.fn(),
    releaseWindow: vi.fn(),
    dispose: vi.fn(),
  };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('DesktopTextEditorRuntime', () => {
  it('opens, edits and saves one exact Workspace document through Content CAS', async () => {
    const root = await createWorkspace('notes/readme.md', '# Draft\n');
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell = createShell(
      root,
      () => workbench,
      (next) => {
        workbench = next;
      },
    );
    const identities = ['session', 'view', 'open'];
    const runtime = new DesktopTextEditorRuntime({
      shell,
      referenceCatalog: emptyReferenceCatalog(),
      media: emptyMediaService(),
      createIdentity: () => identities.shift() ?? 'next',
    });

    const opened = await runtime.open({
      identity: resourceIdentity,
      item: textItem('notes/readme.md'),
    });
    expect(opened.status).toBe('ready');
    if (opened.status !== 'ready') return;
    expect(workbench.main.views[0]).toMatchObject({
      kind: 'text-editor',
      documentId: 'notes/readme.md',
      editorSessionId: opened.identity.sessionId,
    });

    const edited = await runtime.execute('window-1', {
      route: TEXT_EDITOR_HOST_ROUTES.editsApply,
      requestId: 'edit-1',
      identity: opened.identity,
      expectedEditSequence: 0,
      changes: [{ from: 2, to: 7, insert: 'Saved' }],
    });
    expect(edited).toMatchObject({
      status: 'ready',
      projection: { source: '# Saved\n', editSequence: 1, dirty: true },
    });

    await runtime.execute('window-1', {
      route: TEXT_EDITOR_HOST_ROUTES.save,
      requestId: 'save-1',
      identity: opened.identity,
      expectedEditSequence: 1,
    });
    expect(await readFile(path.join(root, 'notes/readme.md'), 'utf8')).toBe('# Saved\n');
  });

  it('delegates reference search to one exact catalog and discards a stale edit sequence', async () => {
    const root = await createWorkspace('notes/readme.md', '@小');
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell = createShell(root, () => workbench, (next) => {
      workbench = next;
    });
    const entitySearch = vi.fn(async () => [
      {
        kind: 'mention' as const,
        source: 'entity' as const,
        ref: { kind: 'character', id: 'character-1' },
        label: '小橘',
      },
    ]);
    const referenceCatalog = {
      search: vi.fn(async (request, options) =>
        options.isCurrent?.(request) === false
          ? ({ status: 'discarded' as const, reason: 'stale' as const })
          : {
              status: 'ready' as const,
              projection: {
                requestId: request.requestId,
                identity: request.identity,
                sessionId: request.sessionId,
                editSequence: request.editSequence,
                kind: request.kind,
                query: request.query,
                candidates: await entitySearch(),
                diagnostics: [],
              },
            },
      ),
    } satisfies Pick<
      import('@neko/text-editor-domain').TextEditorMarkdownReferenceCatalog,
      'search'
    >;
    const runtime = new DesktopTextEditorRuntime({
      shell,
      referenceCatalog,
      media: emptyMediaService(),
    });
    const opened = await runtime.open({
      identity: resourceIdentity,
      item: textItem('notes/readme.md'),
    });
    if (opened.status !== 'ready') throw new Error('Expected a ready Text Editor.');
    const search = {
      requestId: 'references-1',
      identity: opened.projection.identity,
      sessionId: opened.projection.sessionId,
      editSequence: opened.projection.editSequence,
      kind: 'mention' as const,
      query: '小',
      limit: 30,
    };

    await expect(
      runtime.execute('window-1', {
        route: TEXT_EDITOR_HOST_ROUTES.referencesSearch,
        requestId: search.requestId,
        identity: opened.identity,
        search,
      }),
    ).resolves.toMatchObject({
      status: 'references-ready',
      projection: { candidates: [{ source: 'entity', label: '小橘' }] },
    });
    expect(entitySearch).toHaveBeenCalledOnce();

    await runtime.execute('window-1', {
      route: TEXT_EDITOR_HOST_ROUTES.editsApply,
      requestId: 'edit-after-search',
      identity: opened.identity,
      expectedEditSequence: 0,
      changes: [{ from: 2, to: 2, insert: '橘' }],
    });
    await expect(
      runtime.execute('window-1', {
        route: TEXT_EDITOR_HOST_ROUTES.referencesSearch,
        requestId: search.requestId,
        identity: opened.identity,
        search,
      }),
    ).resolves.toMatchObject({ status: 'references-discarded', reason: 'stale' });
    expect(entitySearch).toHaveBeenCalledOnce();
  });

  it('delegates Markdown media through the exact session source and releases its lease', async () => {
    const source = '![[assets/cover.png]]';
    const root = await createWorkspace('notes/readme.md', source);
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell = createShell(root, () => workbench, (next) => {
      workbench = next;
    });
    const media = emptyMediaService();
    media.prepare.mockImplementation(async (input) => ({
      ...input.request,
      status: 'ready',
      descriptor: {
        leaseId: 'lease-1',
        kind: 'image',
        renderUri: `openneko://resource/${'a'.repeat(32)}`,
        contentType: 'image/png',
        displayName: 'cover.png',
      },
    }));
    const runtime = new DesktopTextEditorRuntime({
      shell,
      referenceCatalog: emptyReferenceCatalog(),
      media,
    });
    const opened = await runtime.open({
      identity: resourceIdentity,
      item: textItem('notes/readme.md'),
    });
    if (opened.status !== 'ready') throw new Error('Expected a ready Text Editor.');
    const request = {
      requestId: 'media-1',
      identity: opened.projection.identity,
      sessionId: opened.projection.sessionId,
      editSequence: opened.projection.editSequence,
      surfaceId: 'surface-1',
      token: {
        kind: 'resource-embed' as const,
        from: 0,
        to: source.length,
        target: 'assets/cover.png',
      },
    };

    await expect(
      runtime.execute('window-1', {
        route: TEXT_EDITOR_HOST_ROUTES.mediaPrepare,
        requestId: request.requestId,
        identity: opened.identity,
        media: request,
      }),
    ).resolves.toMatchObject({
      status: 'media-ready',
      projection: { status: 'ready', descriptor: { leaseId: 'lease-1' } },
    });
    expect(media.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        request,
        source,
        resourceOwner: expect.objectContaining({
          windowId: opened.identity.windowId,
          viewId: opened.identity.viewId,
          sessionId: opened.identity.sessionId,
          rendererSessionId: opened.identity.rendererSessionId,
        }),
      }),
    );
    expect(media.prepare.mock.calls[0]?.[0].isCurrent()).toBe(true);

    const release = {
      requestId: 'media-release-1',
      identity: request.identity,
      sessionId: request.sessionId,
      surfaceId: request.surfaceId,
      leaseId: 'lease-1',
    };
    await expect(
      runtime.execute('window-1', {
        route: TEXT_EDITOR_HOST_ROUTES.mediaRelease,
        requestId: release.requestId,
        identity: opened.identity,
        media: release,
      }),
    ).resolves.toMatchObject({
      status: 'media-released',
      surfaceId: 'surface-1',
      leaseId: 'lease-1',
    });
    expect(media.release).toHaveBeenCalledWith(release);
    runtime.dispose();
    expect(media.releaseSession).toHaveBeenCalledWith(opened.identity.sessionId);
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('preserves dirty source on external conflict and accepts only the current renderer', async () => {
    const root = await createWorkspace('story/main.fountain', '.内景 房间 - 夜\n');
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    let rendererSessionId = 'renderer-1';
    const shell = createShell(
      root,
      () => workbench,
      (next) => {
        workbench = next;
      },
      () => rendererSessionId,
    );
    const identities = ['session', 'view', 'open'];
    const runtime = new DesktopTextEditorRuntime({
      shell,
      referenceCatalog: emptyReferenceCatalog(),
      media: emptyMediaService(),
      createIdentity: () => identities.shift() ?? 'next',
    });
    const opened = await runtime.open({
      identity: resourceIdentity,
      item: textItem('story/main.fountain'),
    });
    if (opened.status !== 'ready') throw new Error('Expected a ready Text Editor.');
    await runtime.execute('window-1', {
      route: TEXT_EDITOR_HOST_ROUTES.editsApply,
      requestId: 'edit-1',
      identity: opened.identity,
      expectedEditSequence: 0,
      changes: [{ from: 0, to: 0, insert: 'Title: Test\n\n' }],
    });
    await writeFile(path.join(root, 'story/main.fountain'), 'external source changed\n');

    await expect(
      runtime.execute('window-1', {
        route: TEXT_EDITOR_HOST_ROUTES.save,
        requestId: 'save-conflict',
        identity: opened.identity,
        expectedEditSequence: 1,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'text-document-save-conflict' },
    });

    rendererSessionId = 'renderer-2';
    const reboundIdentity = { ...opened.identity, rendererSessionId };
    const rebound = await runtime.execute('window-1', {
      route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
      requestId: 'projection-rebound',
      identity: reboundIdentity,
    });
    expect(rebound).toMatchObject({
      status: 'ready',
      projection: { dirty: true, conflict: true, source: 'Title: Test\n\n.内景 房间 - 夜\n' },
    });
    await expect(
      runtime.execute('window-1', {
        route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
        requestId: 'projection-stale',
        identity: opened.identity,
      }),
    ).rejects.toThrow('identity is stale');
  });

  it('restores released clean Views with new exact sessions and rejects their prior identities', async () => {
    const root = await createWorkspace('notes/first.md', '# First\n');
    await mkdir(path.join(root, 'notes'), { recursive: true });
    await writeFile(path.join(root, 'notes/second.md'), '# Second\n');
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell = createShell(
      root,
      () => workbench,
      (next) => {
        workbench = next;
      },
    );
    const originalRuntime = new DesktopTextEditorRuntime({
      shell,
      referenceCatalog: emptyReferenceCatalog(),
      media: emptyMediaService(),
    });
    const first = await originalRuntime.open({
      identity: resourceIdentity,
      item: textItem('notes/first.md'),
    });
    const second = await originalRuntime.open({
      identity: resourceIdentity,
      item: textItem('notes/second.md'),
    });
    if (first.status !== 'ready' || second.status !== 'ready') {
      throw new Error('Expected ready Text Editor fixtures.');
    }
    originalRuntime.dispose();

    const restoredRuntime = new DesktopTextEditorRuntime({
      shell,
      referenceCatalog: emptyReferenceCatalog(),
      media: emptyMediaService(),
    });
    const restoredFirst = await restoredRuntime.execute('window-1', {
      route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
      requestId: 'restore-first',
      identity: first.identity,
    });
    if (restoredFirst.status !== 'ready') throw new Error('Expected a restored Text Editor.');
    expect(restoredFirst.identity).toMatchObject({
      viewId: first.identity.viewId,
      documentId: 'notes/first.md',
    });
    expect(restoredFirst.identity.sessionId).not.toBe(first.identity.sessionId);
    expect(restoredFirst.projection).toMatchObject({ source: '# First\n', dirty: false });
    expect(
      workbench.main.views.find((view) => view.viewId === first.identity.viewId),
    ).toMatchObject({
      ownerId: restoredFirst.identity.sessionId,
      editorSessionId: restoredFirst.identity.sessionId,
    });

    await expect(
      restoredRuntime.execute('window-1', {
        route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
        requestId: 'restore-first-again',
        identity: first.identity,
      }),
    ).rejects.toThrow('View identity is stale');
    await expect(
      restoredRuntime.execute('window-1', {
        route: TEXT_EDITOR_HOST_ROUTES.editsApply,
        requestId: 'edit-first-stale',
        identity: first.identity,
        expectedEditSequence: 0,
        changes: [{ from: 0, to: 0, insert: 'stale' }],
      }),
    ).rejects.toThrow('session is unavailable');

    const restoredSecond = await restoredRuntime.execute('window-1', {
      route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
      requestId: 'restore-second',
      identity: second.identity,
    });
    expect(restoredSecond).toMatchObject({
      status: 'ready',
      projection: { source: '# Second\n', dirty: false },
    });
    await expect(
      restoredRuntime.execute('window-1', {
        route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
        requestId: 'first-still-available',
        identity: restoredFirst.identity,
      }),
    ).resolves.toMatchObject({ status: 'ready', projection: { source: '# First\n' } });
    restoredRuntime.dispose();
  });

  it('publishes clean reload and dirty conflict from one parent-directory watcher', async () => {
    const root = await createWorkspace('notes/readme.md', '# Initial\n');
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell = createShell(
      root,
      () => workbench,
      (next) => {
        workbench = next;
      },
    );
    let notifyExternalChange: (() => Promise<void>) | undefined;
    const closeWatcher = vi.fn();
    const watchFile: DesktopTextEditorWatchFile = vi.fn((directory, fileName, onChange) => {
      expect(directory).toBe(path.join(root, 'notes'));
      expect(fileName).toBe('readme.md');
      notifyExternalChange = onChange;
      return { close: closeWatcher };
    });
    const identities = ['session', 'view', 'open'];
    const runtime = new DesktopTextEditorRuntime({
      shell,
      referenceCatalog: emptyReferenceCatalog(),
      media: emptyMediaService(),
      watchFile,
      createIdentity: () => identities.shift() ?? 'next',
    });
    const opened = await runtime.open({
      identity: resourceIdentity,
      item: textItem('notes/readme.md'),
    });
    if (opened.status !== 'ready') throw new Error('Expected a ready Text Editor.');
    const events: import('@neko/text-editor-domain').TextEditorProjectionEvent[] = [];
    const unsubscribe = await runtime.subscribe('window-1', opened.identity, (event) =>
      events.push(event),
    );
    if (!notifyExternalChange) throw new Error('Expected a Text Editor watcher callback.');

    await writeFile(path.join(root, 'notes/readme.md'), '# External\n');
    await notifyExternalChange();
    expect(events.at(-1)).toMatchObject({
      sequence: 1,
      projection: { source: '# External\n', editSequence: 1, dirty: false, conflict: false },
    });

    await runtime.execute('window-1', {
      route: TEXT_EDITOR_HOST_ROUTES.editsApply,
      requestId: 'edit-after-external',
      identity: opened.identity,
      expectedEditSequence: 1,
      changes: [{ from: 2, to: 10, insert: 'Draft' }],
    });
    await writeFile(path.join(root, 'notes/readme.md'), '# Changed again\n');
    await notifyExternalChange();
    expect(events.at(-1)).toMatchObject({
      sequence: 2,
      projection: { source: '# Draft\n', editSequence: 2, dirty: true, conflict: true },
    });

    unsubscribe();
    runtime.dispose();
    expect(closeWatcher).toHaveBeenCalledOnce();
  });

  it.each([
    ['notes/agent-change.md', '# Initial\n', '# Agent Markdown\n'],
    ['story/agent-change.fountain', '.INT. ROOM - DAY\n', '.EXT. STREET - NIGHT\n'],
    ['notes/agent-change.txt', 'Initial text\n', 'Agent plain text\n'],
  ])(
    'projects the canonical Agent Write for %s through the same external-change consumer',
    async (relativePath, initialSource, agentSource) => {
      const root = await createWorkspace(relativePath, initialSource, true);
      let workbench = createDefaultDesktopWorkbenchLayout('window-1');
      const shell = createShell(
        root,
        () => workbench,
        (next) => {
          workbench = next;
        },
      );
      let notifyExternalChange: (() => Promise<void>) | undefined;
      const runtime = new DesktopTextEditorRuntime({
        shell,
        referenceCatalog: emptyReferenceCatalog(),
        media: emptyMediaService(),
        watchFile: (_directory, _fileName, onChange) => {
          notifyExternalChange = onChange;
          return { close: () => undefined };
        },
      });
      const opened = await runtime.open({
        identity: resourceIdentity,
        item: textItem(relativePath),
      });
      if (opened.status !== 'ready') throw new Error('Expected a ready Text Editor.');
      const events: import('@neko/text-editor-domain').TextEditorProjectionEvent[] = [];
      await runtime.subscribe('window-1', opened.identity, (event) => events.push(event));
      const coreTools = createCoreTools({ defaultCwd: root });
      const observed = await getTool(coreTools, 'Read').execute({ file_path: relativePath });

      await expect(
        getTool(coreTools, 'Write').execute({
          file_path: relativePath,
          content: agentSource,
          expected_fingerprint: requireFingerprint(observed),
        }),
      ).resolves.toMatchObject({
        success: true,
        data: {
          contentLocator: { kind: 'workspace-file', path: relativePath },
          operation: 'replace',
        },
      });
      if (!notifyExternalChange) throw new Error('Expected a Text Editor watcher callback.');
      await notifyExternalChange();

      expect(events.at(-1)).toMatchObject({
        projection: { source: agentSource, dirty: false, conflict: false },
      });
      runtime.dispose();
    },
  );

  it('guards Window close with save, discard and cancel decisions', async () => {
    const root = await createWorkspace('notes/readme.md', '# Draft\n');
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const shell = createShell(
      root,
      () => workbench,
      (next) => {
        workbench = next;
      },
    );
    const identities = ['session', 'view', 'open'];
    const runtime = new DesktopTextEditorRuntime({
      shell,
      referenceCatalog: emptyReferenceCatalog(),
      media: emptyMediaService(),
      createIdentity: () => identities.shift() ?? 'next',
    });
    const opened = await runtime.open({
      identity: resourceIdentity,
      item: textItem('notes/readme.md'),
    });
    if (opened.status !== 'ready') throw new Error('Expected a ready Text Editor.');
    await runtime.execute('window-1', {
      route: TEXT_EDITOR_HOST_ROUTES.editsApply,
      requestId: 'edit-close',
      identity: opened.identity,
      expectedEditSequence: 0,
      changes: [{ from: 2, to: 7, insert: 'Saved' }],
    });
    expect(runtime.hasDirtySessions('window-1')).toBe(true);
    await expect(runtime.closeWindow('window-1', 'cancel')).resolves.toBe('cancelled');
    expect(runtime.hasDirtySessions('window-1')).toBe(true);

    await expect(runtime.closeWindow('window-1', 'save')).resolves.toBe('closed');
    expect(await readFile(path.join(root, 'notes/readme.md'), 'utf8')).toBe('# Saved\n');
    expect(runtime.hasDirtySessions('window-1')).toBe(false);
    expect(workbench.main.views).toHaveLength(0);
  });
});

async function createWorkspace(
  relativePath: string,
  source: string,
  coreFileToolsAllowed = false,
): Promise<string> {
  const parent = coreFileToolsAllowed ? path.resolve(process.cwd(), '.test-workspaces') : tmpdir();
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'openneko-text-editor-'));
  roots.push(root);
  const absolutePath = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source);
  return root;
}

function createShell(
  workspacePath: string,
  readWorkbench: () => ReturnType<typeof createDefaultDesktopWorkbenchLayout>,
  writeWorkbench: (workbench: ReturnType<typeof createDefaultDesktopWorkbenchLayout>) => void,
  readRendererSessionId: () => string = () => 'renderer-1',
): DesktopTextEditorShellPort {
  return {
    getProjection: async () => createShellProjection(readWorkbench(), readRendererSessionId()),
    resolveAgentWorkspace: async () => ({
      workspaceId: 'workspace-1',
      workspacePath,
      displayName: 'Fixture',
      locator: { kind: 'relative', value: '${HOME}/fixture' },
    }),
    updateWorkbench: vi.fn(async (_windowId, _rendererSessionId, _instanceId, next) => {
      writeWorkbench(next);
    }),
  };
}

function createShellProjection(
  workbench: ReturnType<typeof createDefaultDesktopWorkbenchLayout>,
  rendererSessionId: string,
): Awaited<ReturnType<DesktopTextEditorShellPort['getProjection']>> {
  const sceneId = 'scene:window-1:workspace-1';
  const scope = {
    kind: 'workspace' as const,
    draftId: 'draft:workspace-1',
    workspaceId: 'workspace-1',
    workspaceGrantId: 'workspace-grant:workspace-1',
  };
  const scene = parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: 'window-1',
    context: { kind: 'agent', agentViewId: 'project-view-1', scope },
    slots: {
      interaction: {
        kind: 'agent',
        agentSurfaceId: 'agent-surface:workspace-1',
        agentViewId: 'project-view-1',
        phase: 'draft',
        scope,
      },
      rightManager: { kind: 'workspace-resources', workspaceId: 'workspace-1' },
      status: { kind: 'scene-status', sceneId },
    },
  });
  return {
    rendererSessionId,
    catalog: {
      projects: [
        {
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          profile: 'content',
          displayName: 'Fixture',
          createdAt: '2026-08-08T00:00:00.000Z',
          updatedAt: '2026-08-08T00:00:00.000Z',
        },
      ],
    },
    window: {
      windowId: 'window-1',
      activeTarget: { kind: 'project', tabId: 'tab-1' },
      tabs: [
        {
          tabId: 'tab-1',
          projectId: 'project-1',
          viewId: 'project-view-1',
          viewInstanceId: 'view-instance-1',
        },
      ],
      workbench: createDesktopWindowComposition({
        workbenchInstanceId: 'workbench:workspace-1',
        layout: workbench,
        scene,
      }),
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
  };
}

function textItem(relativePath: string) {
  return {
    resourceId: `content:${relativePath}`,
    facet: 'files' as const,
    role: 'content' as const,
    depth: 0,
    kind: 'file' as const,
    label: path.basename(relativePath),
    locator: { kind: 'workspace-file' as const, path: relativePath },
    capabilities: ['edit-text', 'preview', 'reveal'] as const,
  };
}

function getTool(tools: readonly Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool: ${name}`);
  return tool;
}

function requireFingerprint(result: Awaited<ReturnType<Tool['execute']>>): unknown {
  if (
    !result.success ||
    typeof result.data !== 'object' ||
    result.data === null ||
    Array.isArray(result.data) ||
    !('fingerprint' in result.data)
  ) {
    throw new Error('Expected file freshness evidence.');
  }
  return result.data.fingerprint;
}
