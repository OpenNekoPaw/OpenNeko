import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CUT_HOST_RUNTIME_ROUTES,
  DEFAULT_CUT_HOST_PRESENTATION,
  applyCutCommand,
  createOtioTimeline,
  parseOtio,
  serializeOtio,
  type CutHostRuntimeIdentity,
} from '@neko/cut-domain';
import { ConsoleLogger } from '@neko/shared/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { DesktopCutRuntime } from './desktop-cut-runtime';
import {
  projectDesktopConversationNavigation,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import {
  closeCutView,
  createDefaultDesktopWorkbenchLayout,
  getActiveMainView,
  openOrFocusCutView,
  openOrFocusMainView,
  setCutPanelPresentation,
  setWorkbenchDisplayMode,
  type DesktopWorkbenchLayoutProjection,
} from '@neko/host/desktop-workbench-contract';
import {
  createDefaultDesktopApplicationSidebar,
  parseDesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('DesktopCutRuntime', () => {
  it('coalesces concurrent draft creation, appends later drafts and rebinds on first save', async () => {
    const harness = await createDraftRuntimeHarness({ saveDestination: 'cuts/saved.otio' });

    await Promise.all([
      harness.runtime.createDraft(harness.request),
      harness.runtime.createDraft(harness.request),
    ]);
    expect(harness.workbench().cutPanel?.views).toHaveLength(1);

    await harness.runtime.createDraft(harness.request);

    const [view, secondView] = harness.workbench().cutPanel?.views ?? [];
    if (!view?.documentId || !secondView?.documentId) {
      throw new Error('Cut draft View fixtures are missing.');
    }
    expect(view.documentId).toMatch(/^cut-draft:/u);
    expect(view.displayLabel).toBe('Untitled Cut');
    expect(secondView.documentId).toMatch(/^cut-draft:/u);
    expect(secondView.documentId).not.toBe(view.documentId);
    expect(secondView.displayLabel).toBe('Untitled Cut 2');
    expect(harness.workbench().cutPanel).toMatchObject({
      activeViewId: secondView.viewId,
      presentation: 'docked',
    });
    expect(harness.workbench().cutPanel?.views).toHaveLength(2);
    await expect(readFile(path.join(harness.workspacePath, 'Untitled Cut.otio'))).rejects.toThrow();
    await expect(
      readFile(path.join(harness.workspacePath, 'Untitled Cut 2.otio')),
    ).rejects.toThrow();
    await expect(
      harness.runtime.getSnapshot(
        harness.request.windowId,
        createViewIdentity(secondView, harness.request.rendererSessionId),
      ),
    ).resolves.toMatchObject({
      document: {
        name: 'Untitled Cut 2',
        tracks: [expect.objectContaining({ kind: 'Video', items: [] })],
      },
    });
    const identity = createViewIdentity(view, harness.request.rendererSessionId);
    const events: Array<{ readonly sequence: number; readonly documentId: string }> = [];
    await harness.runtime.subscribe(harness.request.windowId, identity, (event) =>
      events.push({
        sequence: event.sequence,
        documentId: event.snapshot.identity.documentId,
      }),
    );
    await expect(
      harness.runtime.getSnapshot(harness.request.windowId, identity),
    ).resolves.toMatchObject({
      dirty: true,
      document: {
        name: 'Untitled Cut',
        tracks: [expect.objectContaining({ kind: 'Video', items: [] })],
      },
    });

    const saved = await harness.runtime.execute(harness.request.windowId, {
      requestId: 'save-draft-request',
      commandId: 'save-draft-command',
      route: CUT_HOST_RUNTIME_ROUTES.save,
      identity,
    });

    expect(saved.snapshot).toMatchObject({
      dirty: false,
      identity: { documentId: 'cuts/saved.otio', sessionId: identity.sessionId },
    });
    expect(saved.output).toEqual({ type: 'identity-rebound', eventSequence: 1 });
    expect(events).toEqual([{ sequence: 1, documentId: 'cuts/saved.otio' }]);
    await harness.runtime.execute(harness.request.windowId, {
      requestId: 'saved-presentation-request',
      commandId: 'saved-presentation-command',
      route: CUT_HOST_RUNTIME_ROUTES.presentationUpdate,
      identity: saved.snapshot.identity,
      payload: { ...DEFAULT_CUT_HOST_PRESENTATION, previewVolume: 0.5 },
    });
    expect(events).toEqual([
      { sequence: 1, documentId: 'cuts/saved.otio' },
      { sequence: 2, documentId: 'cuts/saved.otio' },
    ]);
    expect(harness.workbench().cutPanel?.views[0]).toMatchObject({
      documentId: 'cuts/saved.otio',
      displayLabel: 'saved.otio',
      viewId: view.viewId,
    });
    expect(
      parseOtio(await readFile(path.join(harness.workspacePath, 'cuts/saved.otio'))),
    ).toMatchObject({ ok: true });
    await harness.runtime.dispose();
  });

  it('projects only the exact visible Cut target and treats hidden Cut history as a new draft', async () => {
    const harness = await createDraftRuntimeHarness({});
    const sourceIdentity = harness.canvasSourceIdentity();

    await expect(harness.runtime.resolveCanvasHandoffTarget(sourceIdentity)).resolves.toEqual({
      kind: 'new-cut-draft',
      workbenchInstanceId: harness.request.workbenchInstanceId,
    });
    await harness.runtime.createDraft(harness.request);
    const view = harness.workbench().cutPanel?.views[0];
    if (!view) throw new Error('Cut target fixture is missing.');
    await expect(harness.runtime.resolveCanvasHandoffTarget(sourceIdentity)).resolves.toEqual({
      kind: 'existing-cut',
      workbenchInstanceId: harness.request.workbenchInstanceId,
      viewId: view.viewId,
      viewInstanceId: view.viewInstanceId,
      documentId: view.documentId,
      sessionId: `cut-session:${view.viewId}:${view.viewInstanceId}`,
    });

    harness.setWorkbench(setCutPanelPresentation(harness.workbench(), 'hidden'));
    await expect(harness.runtime.resolveCanvasHandoffTarget(sourceIdentity)).resolves.toEqual({
      kind: 'new-cut-draft',
      workbenchInstanceId: harness.request.workbenchInstanceId,
    });
    expect(harness.workbench().cutPanel?.views).toHaveLength(1);
    await harness.runtime.dispose();
  });

  it('creates one exact draft for Canvas media, preserves the source and deduplicates its Cut command', async () => {
    const probe = vi.fn(async () => ({
      durationSeconds: 3,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      hasVideo: true,
      hasAudio: true,
      audioStreams: [],
    }));
    const dispose = vi.fn(async () => undefined);
    const harness = await createDraftRuntimeHarness({
      createAuthoringMediaAdapter: () => ({ probe, dispose }),
    });
    await mkdir(path.join(harness.workspacePath, 'media'));
    const sourcePath = path.join(harness.workspacePath, 'media', 'clip.mp4');
    await writeFile(sourcePath, 'source-fixture');
    const identity = harness.canvasSourceIdentity();
    const target = await harness.runtime.resolveCanvasHandoffTarget(identity);

    const changed = await harness.runtime.addCanvasMaterial({
      identity,
      nodeId: 'video-node-1',
      label: 'clip.mp4',
      locator: { kind: 'workspace-file', path: 'media/clip.mp4' },
      target,
    });
    const existingTarget = await harness.runtime.resolveCanvasHandoffTarget(identity);
    const replayed = await harness.runtime.addCanvasMaterial({
      identity,
      nodeId: 'video-node-1',
      label: 'clip.mp4',
      locator: { kind: 'workspace-file', path: 'media/clip.mp4' },
      target: existingTarget,
    });

    expect(changed.document).toMatchObject({
      tracks: [
        expect.objectContaining({
          kind: 'Video',
          items: [expect.objectContaining({ name: 'clip.mp4', durationSeconds: 3 })],
        }),
      ],
    });
    expect(replayed).toEqual(changed);
    expect(probe).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(await readFile(sourcePath, 'utf8')).toBe('source-fixture');
    expect(harness.workbench().cutPanel?.views).toHaveLength(1);
    await harness.runtime.dispose();
  });

  it('imports a Canvas Video and applies canonical audio separation in the exact Cut target', async () => {
    const harness = await createDraftRuntimeHarness({
      createAuthoringMediaAdapter: () => ({
        probe: vi.fn(async () => ({
          durationSeconds: 3,
          width: 1920,
          height: 1080,
          framesPerSecond: 30,
          hasVideo: true,
          hasAudio: true,
          audioStreams: [],
        })),
        dispose: vi.fn(async () => undefined),
      }),
    });
    await mkdir(path.join(harness.workspacePath, 'media'));
    await writeFile(path.join(harness.workspacePath, 'media', 'clip.mp4'), 'source-fixture');
    const identity = harness.canvasSourceIdentity();
    const target = await harness.runtime.resolveCanvasHandoffTarget(identity);

    const snapshot = await harness.runtime.addCanvasMaterialAndSeparateAudio({
      identity,
      nodeId: 'video-node-1',
      label: 'clip.mp4',
      locator: { kind: 'workspace-file', path: 'media/clip.mp4' },
      target,
    });

    expect(snapshot.document).toMatchObject({
      tracks: [
        expect.objectContaining({
          kind: 'Video',
          items: [
            expect.objectContaining({
              name: 'clip.mp4',
              linkedAudioClipId: expect.any(String),
            }),
          ],
        }),
        expect.objectContaining({
          kind: 'Audio',
          items: [
            expect.objectContaining({
              name: 'clip.mp4 Audio',
              linkedVideoClipId: expect.any(String),
            }),
          ],
        }),
      ],
    });
    await harness.runtime.dispose();
  });

  it('rejects a stale Canvas Cut target before probing or mutating either Cut', async () => {
    const probe = vi.fn();
    const harness = await createDraftRuntimeHarness({
      createAuthoringMediaAdapter: () => ({ probe, dispose: vi.fn(async () => undefined) }),
    });
    await mkdir(path.join(harness.workspacePath, 'media'));
    await writeFile(path.join(harness.workspacePath, 'media', 'clip.mp4'), 'source-fixture');
    const identity = harness.canvasSourceIdentity();
    await harness.runtime.createDraft(harness.request);
    const staleTarget = await harness.runtime.resolveCanvasHandoffTarget(identity);
    await harness.runtime.createDraft(harness.request);

    await expect(
      harness.runtime.addCanvasMaterial({
        identity,
        nodeId: 'video-node-1',
        label: 'clip.mp4',
        locator: { kind: 'workspace-file', path: 'media/clip.mp4' },
        target: staleTarget,
      }),
    ).rejects.toThrow('target changed before execution');
    expect(probe).not.toHaveBeenCalled();
    for (const view of harness.workbench().cutPanel?.views ?? []) {
      await expect(
        harness.runtime.getSnapshot(
          harness.request.windowId,
          createViewIdentity(view, harness.request.rendererSessionId),
        ),
      ).resolves.toMatchObject({ document: { tracks: [expect.objectContaining({ items: [] })] } });
    }
    await harness.runtime.dispose();
  });

  it('keeps an unsupported Canvas media handoff local to the newly created empty draft', async () => {
    const harness = await createDraftRuntimeHarness({
      createAuthoringMediaAdapter: () => ({
        probe: vi.fn(async () => ({
          durationSeconds: 1,
          width: 0,
          height: 0,
          framesPerSecond: 0,
          hasVideo: false,
          hasAudio: false,
          audioStreams: [],
        })),
        dispose: vi.fn(async () => undefined),
      }),
    });
    await mkdir(path.join(harness.workspacePath, 'media'));
    const sourcePath = path.join(harness.workspacePath, 'media', 'unsupported.bin');
    await writeFile(sourcePath, 'unsupported-source');
    const identity = harness.canvasSourceIdentity();
    const target = await harness.runtime.resolveCanvasHandoffTarget(identity);

    await expect(
      harness.runtime.addCanvasMaterial({
        identity,
        nodeId: 'unsupported-node',
        label: 'unsupported.bin',
        locator: { kind: 'workspace-file', path: 'media/unsupported.bin' },
        target,
      }),
    ).rejects.toThrow('no supported video or audio stream');
    const view = harness.workbench().cutPanel?.views[0];
    if (!view) throw new Error('Failed handoff draft View is missing.');
    await expect(
      harness.runtime.getSnapshot(
        harness.request.windowId,
        createViewIdentity(view, harness.request.rendererSessionId),
      ),
    ).resolves.toMatchObject({
      document: { tracks: [expect.objectContaining({ kind: 'Video', items: [] })] },
    });
    expect(await readFile(sourcePath, 'utf8')).toBe('unsupported-source');
    await harness.runtime.dispose();
  });

  it('keeps a dirty unnamed draft when discard is cancelled and releases only it when confirmed', async () => {
    const confirmDiscardDraft = vi
      .fn<NonNullable<ConstructorParameters<typeof DesktopCutRuntime>[0]['confirmDiscardDraft']>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const harness = await createDraftRuntimeHarness({ confirmDiscardDraft });
    await harness.runtime.createDraft(harness.request);
    const view = harness.workbench().cutPanel?.views[0];
    if (!view?.documentId) throw new Error('Cut draft View fixture is missing.');
    const identity = createViewIdentity(view, harness.request.rendererSessionId);

    await expect(
      harness.runtime.closeView({ ...harness.request, identity }),
    ).resolves.toMatchObject({ status: 'cancelled' });
    expect(harness.workbench().cutPanel?.views).toHaveLength(1);

    await expect(
      harness.runtime.closeView({ ...harness.request, identity }),
    ).resolves.toMatchObject({ status: 'updated' });
    expect(harness.workbench().cutPanel).toBeUndefined();
    await expect(harness.runtime.getSnapshot(harness.request.windowId, identity)).rejects.toThrow();
    expect(confirmDiscardDraft).toHaveBeenCalledTimes(2);
    await harness.runtime.dispose();
  });

  it('preserves the exact unnamed draft when Save As is cancelled', async () => {
    const selectDraftDestination = vi.fn(async () => undefined);
    const harness = await createDraftRuntimeHarness({ selectDraftDestination });
    await harness.runtime.createDraft(harness.request);
    const view = harness.workbench().cutPanel?.views[0];
    if (!view?.documentId) throw new Error('Cut draft View fixture is missing.');
    const identity = createViewIdentity(view, harness.request.rendererSessionId);

    const result = await harness.runtime.execute(harness.request.windowId, {
      requestId: 'cancel-save-draft-request',
      commandId: 'cancel-save-draft-command',
      route: CUT_HOST_RUNTIME_ROUTES.save,
      identity,
    });

    expect(result.snapshot).toMatchObject({ dirty: true, identity });
    expect(harness.workbench().cutPanel?.views[0]).toEqual(view);
    expect(selectDraftDestination).toHaveBeenCalledOnce();
    await harness.runtime.dispose();
  });

  it('rejects Save As before writing when its exact draft View changes during selection', async () => {
    let finishSelection: ((documentId: string) => void) | undefined;
    const selectDraftDestination = vi.fn(
      () => new Promise<string>((resolve) => (finishSelection = resolve)),
    );
    const harness = await createDraftRuntimeHarness({ selectDraftDestination });
    await harness.runtime.createDraft(harness.request);
    const view = harness.workbench().cutPanel?.views[0];
    if (!view?.documentId) throw new Error('Cut draft View fixture is missing.');
    const identity = createViewIdentity(view, harness.request.rendererSessionId);

    const saving = harness.runtime.execute(harness.request.windowId, {
      requestId: 'stale-view-save-request',
      commandId: 'stale-view-save-command',
      route: CUT_HOST_RUNTIME_ROUTES.save,
      identity,
    });
    await vi.waitFor(() => expect(selectDraftDestination).toHaveBeenCalledOnce());
    harness.setWorkbench(closeCutView(harness.workbench(), view.viewId));
    finishSelection?.('cuts/stale-view.otio');

    await expect(saving).rejects.toThrow('View changed during Save As selection');
    await expect(
      readFile(path.join(harness.workspacePath, 'cuts/stale-view.otio')),
    ).rejects.toThrow();
    await expect(
      harness.runtime.getSnapshot(harness.request.windowId, identity),
    ).resolves.toMatchObject({
      identity,
    });
    await harness.runtime.dispose();
  });

  it('rejects Save As before writing when its renderer changes during selection', async () => {
    let finishSelection: ((documentId: string) => void) | undefined;
    const selectDraftDestination = vi.fn(
      () => new Promise<string>((resolve) => (finishSelection = resolve)),
    );
    const harness = await createDraftRuntimeHarness({ selectDraftDestination });
    await harness.runtime.createDraft(harness.request);
    const view = harness.workbench().cutPanel?.views[0];
    if (!view?.documentId) throw new Error('Cut draft View fixture is missing.');
    const identity = createViewIdentity(view, harness.request.rendererSessionId);

    const saving = harness.runtime.execute(harness.request.windowId, {
      requestId: 'stale-renderer-save-request',
      commandId: 'stale-renderer-save-command',
      route: CUT_HOST_RUNTIME_ROUTES.save,
      identity,
    });
    await vi.waitFor(() => expect(selectDraftDestination).toHaveBeenCalledOnce());
    harness.setRendererSessionId('endpoint-2');
    finishSelection?.('cuts/stale-renderer.otio');

    await expect(saving).rejects.toThrow('renderer identity changed during selection');
    await expect(
      readFile(path.join(harness.workspacePath, 'cuts/stale-renderer.otio')),
    ).rejects.toThrow();
    await harness.runtime.dispose();
  });

  it('releases a committed Save As session when the Shell View update fails', async () => {
    const harness = await createDraftRuntimeHarness({ saveDestination: 'cuts/recoverable.otio' });
    await harness.runtime.createDraft(harness.request);
    const view = harness.workbench().cutPanel?.views[0];
    if (!view?.documentId) throw new Error('Cut draft View fixture is missing.');
    const identity = createViewIdentity(view, harness.request.rendererSessionId);
    harness.setWorkbenchUpdateFailure(true);

    await expect(
      harness.runtime.execute(harness.request.windowId, {
        requestId: 'failed-view-update-save-request',
        commandId: 'failed-view-update-save-command',
        route: CUT_HOST_RUNTIME_ROUTES.save,
        identity,
      }),
    ).rejects.toThrow("saved as 'cuts/recoverable.otio'");
    expect(
      parseOtio(await readFile(path.join(harness.workspacePath, 'cuts/recoverable.otio'))),
    ).toMatchObject({ ok: true });
    await rm(path.join(harness.workspacePath, 'cuts/recoverable.otio'));
    await expect(
      harness.runtime.getSnapshot(harness.request.windowId, {
        ...identity,
        documentId: 'cuts/recoverable.otio',
      }),
    ).rejects.toThrow();
    await harness.runtime.dispose();
  });

  it('fails visibly when draft Save As or discard confirmation is not configured', async () => {
    const harness = await createDraftRuntimeHarness({});
    await harness.runtime.createDraft(harness.request);
    const view = harness.workbench().cutPanel?.views[0];
    if (!view?.documentId) throw new Error('Cut draft View fixture is missing.');
    const identity = createViewIdentity(view, harness.request.rendererSessionId);

    await expect(
      harness.runtime.execute(harness.request.windowId, {
        requestId: 'save-without-picker-request',
        commandId: 'save-without-picker-command',
        route: CUT_HOST_RUNTIME_ROUTES.save,
        identity,
      }),
    ).rejects.toThrow('Save As is unavailable');
    await expect(harness.runtime.closeView({ ...harness.request, identity })).rejects.toThrow(
      'discard confirmation is unavailable',
    );
    expect(harness.workbench().cutPanel?.views).toHaveLength(1);
    await expect(
      harness.runtime.getSnapshot(harness.request.windowId, identity),
    ).resolves.toMatchObject({ identity });
    await harness.runtime.dispose();
  });

  it('closes an expired draft View without resolving it as a Workspace file', async () => {
    const harness = await createDraftRuntimeHarness({ expiredDraft: true });
    const view = harness.workbench().cutPanel?.views[0];
    if (!view) throw new Error('Expired Cut draft View fixture is missing.');
    const identity = createViewIdentity(view, harness.request.rendererSessionId);

    await expect(
      harness.runtime.closeView({ ...harness.request, identity }),
    ).resolves.toMatchObject({ status: 'updated' });
    expect(harness.workbench().cutPanel).toBeUndefined();
    expect(harness.resolveCutViewGrant).not.toHaveBeenCalled();
    await harness.runtime.dispose();
  });

  it('creates and appends an explicit workspace OTIO target through the authorized writer', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-cut-create-'));
    roots.push(workspacePath);
    await mkdir(path.join(workspacePath, 'cuts'), { recursive: true });
    const identity = createIdentity('cuts/new-story.otio');
    const runtime = createRuntime(workspacePath, identity);
    const created = await runtime.execute(identity.windowId, {
      requestId: 'create-request',
      commandId: 'create-command',
      route: CUT_HOST_RUNTIME_ROUTES.documentCreate,
      identity,
      payload: {
        type: 'cut:document-create',
        name: 'New Story',
        profile: {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        },
        items: [
          {
            kind: 'media',
            clipId: 'route-clip-1',
            name: 'Opening',
            targetUrl: '../media/opening.mp4',
            durationFrames: 60,
            rate: 30,
          },
        ],
      },
    });
    expect(created.snapshot).toMatchObject({ dirty: false });

    const appended = await runtime.execute(identity.windowId, {
      requestId: 'append-request',
      commandId: 'append-command',
      route: CUT_HOST_RUNTIME_ROUTES.commandExecute,
      identity,
      payload: {
        type: 'append-route',
        items: [{ kind: 'gap', durationFrames: 30, rate: 30 }],
      },
    });
    expect(appended.snapshot).toMatchObject({ dirty: true });
    await runtime.execute(identity.windowId, {
      requestId: 'save-request',
      commandId: 'save-command',
      route: CUT_HOST_RUNTIME_ROUTES.save,
      identity,
    });
    const persisted = parseOtio(await readFile(path.join(workspacePath, identity.documentId)));
    expect(persisted).toMatchObject({ ok: true });
    if (!persisted.ok) throw new Error('Created Desktop Cut target is invalid.');
    expect(persisted.document.tracks.children[0]?.children).toHaveLength(2);
    await runtime.dispose();
  });

  it('keeps Chat + Canvas active while binding the lower Timeline to one Cut document', async () => {
    const workspacePath = await realpath(await mkdtemp(path.join(tmpdir(), 'openneko-cut-focus-')));
    roots.push(workspacePath);
    const documentId = 'cuts/story.otio';
    const documentPath = path.join(workspacePath, documentId);
    await mkdir(path.dirname(documentPath), { recursive: true });
    await writeFile(
      documentPath,
      serializeOtio(
        createOtioTimeline('Story', {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        }),
      ),
    );
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'project-view-1',
      viewInstanceId: 'view-instance-1',
      rendererSessionId: 'endpoint-1',
    };
    const workspace = {
      workspaceId: 'workspace-1',
      workspacePath,
      displayName: 'Fixture',
      locator: { kind: 'relative' as const, value: '.' },
    };
    let workbench = openOrFocusMainView(createDefaultDesktopWorkbenchLayout('window-1'), {
      viewId: 'canvas:project-view-1:board',
      viewInstanceId: 'view-instance-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      kind: 'canvas',
      ownerId: 'canvas:project-view-1',
      displayLabel: 'board.nkc',
      documentId: 'boards/board.nkc',
    });
    workbench = setWorkbenchDisplayMode(workbench, 'chat-main');
    const project = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      profile: 'content' as const,
      displayName: 'Fixture',
      createdAt: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    };
    const agentHome = {
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    } as const;
    const catalog = { projects: [project] };
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
    const getProjection = (): DesktopShellProjection => ({
      applicationInstanceId: 'application-1',
      rendererSessionId: 'endpoint-1',
      catalog,
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
        workbench: (() => {
          return createDesktopWindowComposition({
            workbenchInstanceId: 'workbench:workspace-1',
            layout: workbench,
            scene,
          });
        })(),
        applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
      },
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(
        catalog,
        agentHome,
        catalog.projects.map((project) => project.projectId),
      ),
      domains: [],
    });
    const updateWorkbench = vi.fn(
      async (
        _windowId: string,
        _rendererSessionId: string,
        _workbenchInstanceId: string,
        next: DesktopWorkbenchLayoutProjection,
      ) => {
        workbench = next;
        return getProjection();
      },
    );
    const runtime = new DesktopCutRuntime({
      shell: {
        getProjection: vi.fn(async () => getProjection()),
        updateWorkbench,
        resolveAgentWorkspace: vi.fn(async () => workspace),
        resolveCutCreationGrant: vi.fn(),
        resolveCutViewGrant: vi.fn(),
      },
      host: createElectronNekoHostPorts({
        homedir: workspacePath,
        nekoHome: path.join(workspacePath, '.neko-home'),
        workspaceRoot: workspacePath,
        logger: new ConsoleLogger('DesktopCutRuntimeFocusTest'),
      }),
    });
    const item = {
      resourceId: 'resource-story',
      source: 'files' as const,
      role: 'content' as const,
      depth: 0,
      kind: 'file' as const,
      label: 'story.otio',
      locator: { kind: 'workspace-file' as const, path: documentId },
      capabilities: ['open-creative-document'] as const,
    };

    expect(runtime.supportsOpen(item)).toBe(true);
    expect(
      runtime.supportsOpen({
        ...item,
        resourceId: 'resource-video',
        label: 'video.mp4',
        locator: { kind: 'workspace-file', path: 'media/video.mp4' },
      }),
    ).toBe(false);

    await runtime.openAlongsideCanvas({ identity, item, absolutePath: documentPath });
    const firstViewId = workbench.cutPanel?.views.find(
      (view) => view.documentId === documentId,
    )?.viewId;
    await runtime.openAlongsideCanvas({ identity, item, absolutePath: documentPath });

    expect(firstViewId).toMatch(/^cut:project-view-1:/u);
    expect(getActiveMainView(workbench)?.kind).toBe('canvas');
    expect(workbench.display.mode).toBe('chat-main');
    expect(workbench.main.views).toHaveLength(1);
    expect(workbench.cutPanel).toMatchObject({
      presentation: 'docked',
      activeViewId: firstViewId,
    });
    expect(workbench.cutPanel?.views).toHaveLength(1);

    const secondDocumentId = 'cuts/alternate.otio';
    const secondDocumentPath = path.join(workspacePath, secondDocumentId);
    await writeFile(
      secondDocumentPath,
      serializeOtio(
        createOtioTimeline('Alternate', {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        }),
      ),
    );
    const secondItem = {
      ...item,
      resourceId: 'resource-alternate',
      label: 'alternate.otio',
      locator: { kind: 'workspace-file' as const, path: secondDocumentId },
    };
    await runtime.openAlongsideCanvas({
      identity,
      item: secondItem,
      absolutePath: secondDocumentPath,
    });
    const secondViewId = workbench.cutPanel?.views.find(
      (view) => view.documentId === secondDocumentId,
    )?.viewId;
    expect(secondViewId).not.toBe(firstViewId);
    expect(workbench.cutPanel?.views).toHaveLength(2);
    expect(getActiveMainView(workbench)?.kind).toBe('canvas');
    expect(workbench.cutPanel?.activeViewId).toBe(secondViewId);

    await runtime.openAlongsideCanvas({ identity, item, absolutePath: documentPath });
    expect(getActiveMainView(workbench)?.kind).toBe('canvas');
    expect(workbench.cutPanel?.views).toHaveLength(2);
    expect(workbench.cutPanel?.activeViewId).toBe(firstViewId);

    await runtime.open({ identity, item, absolutePath: documentPath });
    expect(getActiveMainView(workbench)?.kind).toBe('canvas');
    expect(workbench.cutPanel?.views.find((view) => view.viewId === firstViewId)).toMatchObject({
      kind: 'cut',
      documentId,
      viewId: firstViewId,
    });
    await runtime.dispose();
  });

  it('opens one owner-bound OTIO session and applies package-owned Cut commands', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-cut-'));
    roots.push(workspacePath);
    const documentId = 'cuts/story.otio';
    const documentPath = path.join(workspacePath, documentId);
    await mkdir(path.dirname(documentPath), { recursive: true });
    await writeFile(
      documentPath,
      serializeOtio(
        createOtioTimeline('Story', {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        }),
      ),
    );
    const identity = createIdentity(documentId);
    const authority = { current: identity };
    const runtime = createRuntime(
      workspacePath,
      identity,
      undefined,
      undefined,
      undefined,
      authority,
    );
    const initial = await runtime.getSnapshot('window-1', identity);
    const events: unknown[] = [];
    await runtime.subscribe('window-1', identity, (event) => events.push(event));

    const next = await runtime.execute('window-1', {
      requestId: 'request-1',
      commandId: 'command-1',
      route: CUT_HOST_RUNTIME_ROUTES.commandExecute,
      identity,
      payload: {
        type: 'add-track',
        trackId: 'audio-1',
        trackKind: 'Audio',
        name: 'Audio 1',
      },
    });

    expect(initial.document).toMatchObject({
      documentUri: documentId,
      sessionId: identity.sessionId,
    });
    expect(next.snapshot.document).toMatchObject({
      tracks: expect.arrayContaining([
        expect.objectContaining({ trackId: 'audio-1', kind: 'Audio' }),
      ]),
    });
    expect(events).toEqual([
      expect.objectContaining({
        sequence: 1,
        snapshot: expect.objectContaining({ dirty: true }),
      }),
    ]);

    const recoveredIdentity = {
      ...identity,
      rendererSessionId: 'endpoint-2',
    };
    authority.current = recoveredIdentity;
    await expect(runtime.getSnapshot('window-1', recoveredIdentity)).resolves.toMatchObject({
      identity: { rendererSessionId: 'endpoint-2' },
    });
    await expect(runtime.getSnapshot('window-1', identity)).rejects.toThrow('stale Cut authority');
  });

  it('serializes operations inside the owning session', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-cut-stale-'));
    roots.push(workspacePath);
    const documentId = 'story.otio';
    await writeFile(
      path.join(workspacePath, documentId),
      serializeOtio(
        createOtioTimeline('Story', {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        }),
      ),
    );
    const identity = createIdentity(documentId);
    const runtime = createRuntime(workspacePath, identity);
    await runtime.getSnapshot('window-1', identity);

    const first = runtime.execute('window-1', {
      requestId: 'presentation-request-1',
      commandId: 'presentation-command-1',
      route: CUT_HOST_RUNTIME_ROUTES.presentationUpdate,
      identity,
      payload: { ...DEFAULT_CUT_HOST_PRESENTATION, previewVolume: 0.5 },
    });
    const second = runtime.execute('window-1', {
      requestId: 'presentation-request-2',
      commandId: 'presentation-command-2',
      route: CUT_HOST_RUNTIME_ROUTES.presentationUpdate,
      identity,
      payload: { ...DEFAULT_CUT_HOST_PRESENTATION, previewVolume: 0.25 },
    });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect((await runtime.getSnapshot('window-1', identity)).presentation.previewVolume).toBe(0.25);
  });

  it('owns command idempotency, history, dirty, save and presentation in one session', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-cut-session-flows-'));
    roots.push(workspacePath);
    const documentId = 'story.otio';
    const documentPath = path.join(workspacePath, documentId);
    await writeFile(
      documentPath,
      serializeOtio(
        createOtioTimeline('Story', {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        }),
      ),
    );
    const identity = createIdentity(documentId);
    const runtime = createRuntime(workspacePath, identity);
    const events: Array<{ readonly sequence: number }> = [];
    await runtime.subscribe('window-1', identity, (event) => events.push(event));

    const commandRequest = {
      requestId: 'command-request',
      commandId: 'command-idempotency-key',
      route: CUT_HOST_RUNTIME_ROUTES.commandExecute,
      identity,
      payload: {
        type: 'add-track',
        trackId: 'audio-1',
        trackKind: 'Audio',
        name: 'Audio 1',
      },
    } as const;
    const changed = await runtime.execute('window-1', commandRequest);
    const replayed = await runtime.execute('window-1', {
      ...commandRequest,
      requestId: 'command-replay-request',
    });
    expect(replayed).toEqual(changed);
    expect(changed.snapshot).toMatchObject({ dirty: true });
    expect(events).toHaveLength(1);

    const presentation = {
      ...DEFAULT_CUT_HOST_PRESENTATION,
      previewVolume: 0.35,
      pixelsPerSecond: 180,
      snappingEnabled: false,
      overviewVisible: false,
    };
    const presented = await runtime.execute('window-1', {
      requestId: 'presentation-request',
      commandId: 'presentation-command',
      route: CUT_HOST_RUNTIME_ROUTES.presentationUpdate,
      identity,
      payload: presentation,
    });
    expect(presented.snapshot).toMatchObject({
      dirty: true,
      presentation,
    });

    const saved = await runtime.execute('window-1', {
      requestId: 'save-request',
      commandId: 'save-command',
      route: CUT_HOST_RUNTIME_ROUTES.save,
      identity,
    });
    expect(saved.snapshot).toMatchObject({ dirty: false, presentation });
    const persisted = parseOtio(await readFile(documentPath));
    expect(persisted.ok).toBe(true);
    if (!persisted.ok) throw new Error('Saved OTIO fixture did not parse.');
    expect(persisted.document.tracks.children).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Audio 1' })]),
    );

    const undone = await runtime.execute('window-1', {
      requestId: 'undo-request',
      commandId: 'undo-command',
      route: CUT_HOST_RUNTIME_ROUTES.undo,
      identity,
    });
    expect(undone.snapshot).toMatchObject({ dirty: true });
    expect(
      (undone.snapshot.document as { readonly tracks: readonly { readonly name: string }[] })
        .tracks,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Audio 1' })]));

    const redone = await runtime.execute('window-1', {
      requestId: 'redo-request',
      commandId: 'redo-command',
      route: CUT_HOST_RUNTIME_ROUTES.redo,
      identity,
    });
    expect(redone.snapshot).toMatchObject({ dirty: true });
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('resolves Timeline representation requests through the package-owned media adapter', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-cut-representations-'));
    roots.push(workspacePath);
    const documentId = 'story.otio';
    await writeFile(
      path.join(workspacePath, documentId),
      serializeOtio(
        createOtioTimeline('Story', {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        }),
      ),
    );
    const identity = createIdentity(documentId);
    const dispose = vi.fn(async () => undefined);
    const runtime = createRuntime(workspacePath, identity, () => ({
      captureFrame: vi.fn(),
      generateWaveform: vi.fn(),
      dispose,
    }));

    await runtime.getSnapshot('window-1', identity);
    const result = await runtime.execute('window-1', {
      requestId: 'representation-request',
      commandId: 'representation-command',
      route: CUT_HOST_RUNTIME_ROUTES.representationResolve,
      identity,
      payload: {
        type: 'cut:request-representations',
        documentUri: documentId,
        sessionId: identity.sessionId,
        requests: [{ clipId: 'missing-clip', kind: 'thumbnail', density: 64, tileIndex: 0 }],
      },
    });

    expect(result).toMatchObject({
      snapshot: expect.objectContaining({ dirty: false }),
      output: {
        type: 'representations',
        results: [
          {
            clipId: 'missing-clip',
            kind: 'thumbnail',
            status: 'unavailable',
          },
        ],
      },
    });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('projects package-owned Cut preview streams through owner-bound Desktop media URLs', async () => {
    const workspacePath = await realpath(
      await mkdtemp(path.join(tmpdir(), 'openneko-cut-preview-')),
    );
    roots.push(workspacePath);
    const documentId = 'story.otio';
    await writeFile(path.join(workspacePath, 'media.mp4'), 'fixture');
    const document = applyCutCommand(
      createOtioTimeline('Story', {
        profile: '1080p30',
        editRateNumerator: 30,
        editRateDenominator: 1,
        width: 1920,
        height: 1080,
      }),
      {
        type: 'link-media',
        clipId: 'video-clip-1',
        name: 'Shot',
        targetUrl: 'media.mp4',
        durationFrames: 150,
        rate: 30,
        trackId: 'video-1',
        timelineStartFrames: 0,
        overlapPolicy: 'reject',
      },
    );
    await writeFile(path.join(workspacePath, documentId), serializeOtio(document));
    const identity = createIdentity(documentId);
    const stopPreview = vi.fn(async () => undefined);
    const mediaAdapter = {
      probe: vi.fn(async () => ({
        durationSeconds: 5,
        width: 1920,
        height: 1080,
        framesPerSecond: 30,
        hasVideo: true,
        hasAudio: false,
        audioStreams: [],
      })),
      startPreview: vi.fn(async () => ({
        sessionId: 'video-session-1',
        video: {
          url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          mimeType: 'video/mp4',
          preparationProfile: 'h264-mp4-direct' as const,
          mediaTimeOriginSeconds: 0,
          durationSeconds: 5,
        },
      })),
      resumePreview: vi.fn(async () => undefined),
      stopPreview,
      startPcmMix: vi.fn(),
      resumePcm: vi.fn(async () => undefined),
      stopPcm: vi.fn(async () => undefined),
      captureFrame: vi.fn(),
      generateWaveform: vi.fn(),
      export: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    const runtime = createRuntime(workspacePath, identity, undefined, () => mediaAdapter);
    await runtime.getSnapshot('window-1', identity);

    const result = await runtime.execute('window-1', {
      requestId: 'preview-request',
      commandId: 'preview-command',
      route: CUT_HOST_RUNTIME_ROUTES.previewStart,
      identity,
      payload: {
        type: 'cut:preview-start',
        documentUri: documentId,
        sessionId: identity.sessionId,
        timelineTimeSeconds: 0,
        previewRequestId: 'preview-request-1',
        playbackMode: 'playing',
      },
    });

    expect(result.output).toMatchObject({
      type: 'preview',
      message: {
        type: 'cut:preview-ready',
        previewRequestId: 'preview-request-1',
        video: {
          url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
      },
    });
    expect(JSON.stringify(result.output)).not.toContain('neko-media:');
    expect(mediaAdapter.startPreview).toHaveBeenCalledOnce();
    await runtime.dispose();
    expect(stopPreview).toHaveBeenCalledWith('video-session-1');
  });

  it('stops active PCM before disposing its media adapter when the Cut view closes', async () => {
    const workspacePath = await realpath(
      await mkdtemp(path.join(tmpdir(), 'openneko-cut-close-pcm-')),
    );
    roots.push(workspacePath);
    const documentId = 'story.otio';
    await writeFile(path.join(workspacePath, 'audio.aac'), 'fixture');
    const withAudioTrack = applyCutCommand(
      createOtioTimeline('Story', {
        profile: '1080p30',
        editRateNumerator: 30,
        editRateDenominator: 1,
        width: 1920,
        height: 1080,
      }),
      {
        type: 'add-track',
        trackId: 'audio-1',
        trackKind: 'Audio',
        name: 'Audio 1',
      },
    );
    const document = applyCutCommand(withAudioTrack, {
      type: 'link-media',
      clipId: 'audio-clip-1',
      name: 'Audio',
      targetUrl: 'audio.aac',
      durationFrames: 180,
      rate: 30,
      trackId: 'audio-1',
      timelineStartFrames: 0,
      overlapPolicy: 'reject',
    });
    await writeFile(path.join(workspacePath, documentId), serializeOtio(document));
    const identity = createIdentity(documentId);
    const stopFailure = new Error('PCM stop failed.');
    let failStopPcm: (() => void) | undefined;
    const pcmStopped = new Promise<void>((_resolve, reject) => {
      failStopPcm = () => reject(stopFailure);
    });
    const stopPcm = vi.fn(() => pcmStopped);
    const dispose = vi.fn(async () => undefined);
    const mediaAdapter = {
      probe: vi.fn(),
      startPreview: vi.fn(),
      resumePreview: vi.fn(async () => undefined),
      stopPreview: vi.fn(async () => undefined),
      startPcmMix: vi.fn(async () => ({
        sessionId: 'pcm-session-1',
        stream: {
          streamUrl: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          sampleRate: 48_000,
          channels: 2,
        },
      })),
      resumePcm: vi.fn(async () => undefined),
      stopPcm,
      captureFrame: vi.fn(),
      generateWaveform: vi.fn(),
      export: vi.fn(),
      dispose,
    };
    const runtime = createRuntime(workspacePath, identity, undefined, () => mediaAdapter);
    await runtime.getSnapshot('window-1', identity);
    await runtime.execute('window-1', {
      requestId: 'preview-start-request',
      commandId: 'preview-start-command',
      route: CUT_HOST_RUNTIME_ROUTES.previewStart,
      identity,
      payload: {
        type: 'cut:preview-start',
        documentUri: documentId,
        sessionId: identity.sessionId,
        timelineTimeSeconds: 0,
        previewRequestId: 'preview-request-1',
        playbackMode: 'playing',
      },
    });
    await runtime.execute('window-1', {
      requestId: 'preview-activate-request',
      commandId: 'preview-activate-command',
      route: CUT_HOST_RUNTIME_ROUTES.previewActivate,
      identity,
      payload: {
        type: 'cut:preview-activate',
        previewRequestId: 'preview-request-1',
      },
    });

    runtime.reconcileWindow('window-1', [createDefaultDesktopWorkbenchLayout('window-1')]);
    await vi.waitFor(() => expect(stopPcm).toHaveBeenCalledWith('pcm-session-1'));
    const disposeCallsBeforePcmSettled = dispose.mock.calls.length;
    failStopPcm?.();
    await expect(runtime.dispose()).rejects.toThrow('Cut sessions could not be disposed.');
    expect(disposeCallsBeforePcmSettled).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('adds one authorized resource to the exact Cut session and fences stale targets', async () => {
    const workspacePath = await realpath(
      await mkdtemp(path.join(tmpdir(), 'openneko-cut-resource-')),
    );
    roots.push(workspacePath);
    const documentId = 'story.otio';
    await writeFile(
      path.join(workspacePath, documentId),
      serializeOtio(
        createOtioTimeline('Story', {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        }),
      ),
    );
    await mkdir(path.join(workspacePath, 'media'));
    await writeFile(path.join(workspacePath, 'media', 'clip.mp4'), 'fixture');
    const identity = createIdentity(documentId);
    const dispose = vi.fn(async () => undefined);
    const probe = vi.fn(async () => ({
      durationSeconds: 4,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      hasVideo: true,
      hasAudio: true,
      audioStreams: [],
    }));
    const runtime = createRuntime(
      workspacePath,
      identity,
      undefined,
      undefined,
      undefined,
      undefined,
      () => ({ probe, dispose }),
    );
    const resourceIdentity = {
      projectId: identity.projectId,
      workspaceId: identity.workspaceId,
      windowId: identity.windowId,
      viewId: 'resource-browser:project-view-1',
      viewInstanceId: 'view-instance-1',
      rendererSessionId: identity.rendererSessionId,
    };
    const item = {
      resourceId: 'content:clip',
      source: 'media' as const,
      role: 'content' as const,
      depth: 0,
      kind: 'video' as const,
      label: 'clip.mp4',
      locator: { kind: 'workspace-file' as const, path: 'media/clip.mp4' },
      capabilities: ['preview', 'add-to-cut'] as const,
    };
    const target = {
      viewId: identity.viewId,
      viewInstanceId: identity.viewInstanceId,
      documentId: identity.documentId,
      sessionId: identity.sessionId,
    };

    const changed = await runtime.addResource({ resourceIdentity, item, target });
    const replayed = await runtime.addResource({ resourceIdentity, item, target });

    expect(changed).toMatchObject({
      document: {
        tracks: expect.arrayContaining([
          expect.objectContaining({
            kind: 'Video',
            items: [
              expect.objectContaining({
                kind: 'clip',
                name: 'clip.mp4',
                durationSeconds: 4,
              }),
            ],
          }),
        ]),
      },
    });
    expect(replayed).toEqual(changed);
    expect(probe).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();

    const videoTrack = (
      changed.document as {
        readonly tracks: readonly { readonly kind: string; readonly trackId: string }[];
      }
    ).tracks.find((track) => track.kind === 'Video');
    if (!videoTrack) throw new Error('Desktop Cut fixture has no Video Track.');
    const dropped = await runtime.execute('window-1', {
      requestId: 'drop-media-request',
      commandId: 'drop-media-command',
      route: CUT_HOST_RUNTIME_ROUTES.mediaDrop,
      identity,
      payload: {
        type: 'cut:drop-link-media',
        trackId: videoTrack.trackId,
        source: {
          kind: 'content-locator',
          data: {
            type: 'content-locator',
            locator: { kind: 'workspace-file', path: 'media/clip.mp4' },
            name: 'clip.mp4',
          },
        },
        timelineStartFrames: 120,
        overlapPolicy: 'insert',
      },
    });
    expect(dropped.snapshot).toMatchObject({ dirty: true });
    expect(probe).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(2);

    await expect(
      runtime.addResource({
        resourceIdentity,
        item,
        target: {
          ...target,
          sessionId: 'cut-session:another-view:view-instance-1',
        },
      }),
    ).rejects.toThrow('stale Cut authority');
    expect((await runtime.getSnapshot('window-1', identity)).dirty).toBe(true);
  });

  it('starts, projects and cancels the extracted package-owned ExportJob', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-cut-export-'));
    roots.push(workspacePath);
    const documentId = 'story.otio';
    await writeFile(
      path.join(workspacePath, documentId),
      serializeOtio(
        createOtioTimeline('Story', {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        }),
      ),
    );
    const identity = createIdentity(documentId);
    let exportSignal: AbortSignal | undefined;
    const exportMediaAdapter = createExportMediaAdapter(
      (signal) =>
        new Promise<void>(() => {
          exportSignal = signal;
        }),
    );
    const runtime = createRuntime(
      workspacePath,
      identity,
      undefined,
      undefined,
      () => exportMediaAdapter,
    );
    await runtime.getSnapshot('window-1', identity);

    const started = await runtime.execute('window-1', {
      requestId: 'export-start-request',
      commandId: 'export-start-command',
      route: CUT_HOST_RUNTIME_ROUTES.exportStart,
      identity,
      payload: {
        type: 'cut:export-start',
        documentUri: documentId,
        sessionId: identity.sessionId,
        settings: {
          outputName: 'story-final',
          container: 'mp4',
          width: 1920,
          height: 1080,
          framesPerSecond: 30,
          videoBitrate: 8_000_000,
          includeAudio: true,
          audioBitrate: 192_000,
          audioSampleRate: 48_000,
        },
      },
    });
    const task = started.snapshot.export.tasks[0];
    expect(task).toMatchObject({
      documentUri: documentId,
      sessionId: identity.sessionId,
      sourceSnapshotId: 'export-start-request',
      outputWorkspaceRelativePath: 'exports/story-final.mp4',
      status: 'running',
    });
    await vi.waitFor(() => expect(exportSignal).toBeDefined());
    expect(exportMediaAdapter.export).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.objectContaining({
          documentUri: pathToFileURL(await realpath(path.join(workspacePath, documentId))).href,
        }),
      }),
      expect.any(AbortSignal),
    );
    if (!task) throw new Error('Desktop Cut Export Job fixture is missing.');

    await vi.waitFor(async () => {
      const cancelled = await runtime.execute('window-1', {
        requestId: 'export-cancel-request',
        commandId: 'export-cancel-command',
        route: CUT_HOST_RUNTIME_ROUTES.exportCancel,
        identity,
        payload: {
          type: 'cut:export-cancel',
          documentUri: documentId,
          sessionId: identity.sessionId,
          jobId: task.jobId,
        },
      });
      expect(cancelled.snapshot.export.tasks).toEqual([
        expect.objectContaining({ jobId: task.jobId, status: 'cancelled' }),
      ]);
    });
    expect(exportSignal?.aborted).toBe(true);
    await runtime.dispose();
  });
});

function createRuntime(
  workspacePath: string,
  identity: CutHostRuntimeIdentity,
  createMediaAdapter?: ConstructorParameters<typeof DesktopCutRuntime>[0]['createMediaAdapter'],
  createPreviewMediaAdapter?: ConstructorParameters<
    typeof DesktopCutRuntime
  >[0]['createPreviewMediaAdapter'],
  createExportMediaAdapter?: ConstructorParameters<
    typeof DesktopCutRuntime
  >[0]['createExportMediaAdapter'],
  identityAuthority?: { current: CutHostRuntimeIdentity },
  createAuthoringMediaAdapter?: ConstructorParameters<
    typeof DesktopCutRuntime
  >[0]['createAuthoringMediaAdapter'],
): DesktopCutRuntime {
  const workspace = {
    workspaceId: 'workspace-1',
    workspacePath,
    displayName: 'Fixture',
    locator: { kind: 'relative' as const, value: '.' },
  };
  return new DesktopCutRuntime({
    shell: {
      getProjection: vi.fn(),
      updateWorkbench: vi.fn(),
      resolveAgentWorkspace: vi.fn(async () => workspace),
      resolveCutCreationGrant: vi.fn(async () => ({ identity, workspace })),
      resolveCutViewGrant: vi.fn(async (_windowId, requestedIdentity) => {
        const authoritative = identityAuthority?.current ?? identity;
        if (
          requestedIdentity.rendererSessionId !== authoritative.rendererSessionId ||
          requestedIdentity.sessionId !== authoritative.sessionId
        ) {
          throw new Error('Desktop fixture rejected stale Cut authority.');
        }
        return { identity: authoritative, workspace };
      }),
    },
    host: createElectronNekoHostPorts({
      homedir: workspacePath,
      nekoHome: path.join(workspacePath, '.neko-home'),
      workspaceRoot: workspacePath,
      logger: new ConsoleLogger('DesktopCutRuntimeTest'),
    }),
    ...(createMediaAdapter ? { createMediaAdapter } : {}),
    ...(createPreviewMediaAdapter ? { createPreviewMediaAdapter } : {}),
    ...(createExportMediaAdapter ? { createExportMediaAdapter } : {}),
    ...(createAuthoringMediaAdapter ? { createAuthoringMediaAdapter } : {}),
  });
}

function createExportMediaAdapter(
  run: (signal: AbortSignal) => Promise<void>,
): NonNullable<
  ReturnType<
    NonNullable<ConstructorParameters<typeof DesktopCutRuntime>[0]['createExportMediaAdapter']>
  >
> {
  return {
    probe: vi.fn(),
    captureFrame: vi.fn(),
    generateWaveform: vi.fn(),
    startPreview: vi.fn(),
    resumePreview: vi.fn(async () => undefined),
    stopPreview: vi.fn(async () => undefined),
    startPcmMix: vi.fn(),
    resumePcm: vi.fn(async () => undefined),
    stopPcm: vi.fn(async () => undefined),
    export: vi.fn(async (request, signal) => {
      if (!signal) throw new Error('Export cancellation signal is required.');
      await run(signal);
      return { outputWorkspaceRelativePath: request.outputWorkspaceRelativePath };
    }),
    dispose: vi.fn(async () => undefined),
  };
}

function createIdentity(documentId: string): CutHostRuntimeIdentity {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'cut-view-1',
    viewInstanceId: 'view-instance-1',
    documentId,
    sessionId: 'cut-session:cut-view-1:view-instance-1',
    rendererSessionId: 'endpoint-1',
  };
}

function createViewIdentity(
  view: NonNullable<DesktopWorkbenchLayoutProjection['cutPanel']>['views'][number],
  rendererSessionId: string,
): CutHostRuntimeIdentity {
  if (!view.documentId) throw new Error('Cut View requires a document identity.');
  return {
    projectId: view.projectId,
    workspaceId: view.workspaceId,
    windowId: 'window-1',
    viewId: view.viewId,
    viewInstanceId: view.viewInstanceId,
    documentId: view.documentId,
    sessionId: `cut-session:${view.viewId}:${view.viewInstanceId}`,
    rendererSessionId,
  };
}

async function createDraftRuntimeHarness(options: {
  readonly saveDestination?: string;
  readonly selectDraftDestination?: NonNullable<
    ConstructorParameters<typeof DesktopCutRuntime>[0]['selectDraftDestination']
  >;
  readonly expiredDraft?: boolean;
  readonly confirmDiscardDraft?: NonNullable<
    ConstructorParameters<typeof DesktopCutRuntime>[0]['confirmDiscardDraft']
  >;
  readonly createAuthoringMediaAdapter?: NonNullable<
    ConstructorParameters<typeof DesktopCutRuntime>[0]['createAuthoringMediaAdapter']
  >;
}) {
  const workspacePath = await realpath(await mkdtemp(path.join(tmpdir(), 'openneko-cut-draft-')));
  roots.push(workspacePath);
  if (options.saveDestination) {
    await mkdir(path.dirname(path.join(workspacePath, options.saveDestination)), {
      recursive: true,
    });
  }
  const workspace = {
    workspaceId: 'workspace-1',
    workspacePath,
    displayName: 'Fixture',
    locator: { kind: 'relative' as const, value: '.' },
  };
  const project = {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    profile: 'content' as const,
    displayName: 'Fixture',
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
  let workbench = createDefaultDesktopWorkbenchLayout('window-1');
  let rendererSessionId = 'endpoint-1';
  let failWorkbenchUpdates = false;
  workbench = openOrFocusMainView(workbench, {
    viewId: 'canvas-view-1',
    viewInstanceId: 'view-instance-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    kind: 'canvas',
    ownerId: 'canvas-session:canvas-view-1:view-instance-1',
    displayLabel: 'Workspace Canvas',
    documentId: 'neko/boards/workspace.nkc',
  });
  const scope = {
    kind: 'workspace' as const,
    draftId: 'draft:workspace-1',
    workspaceId: 'workspace-1',
    workspaceGrantId: 'workspace-grant:workspace-1',
  };
  const scene = parseDesktopWorkbenchSceneProjection({
    sceneId: 'scene:workspace-1',
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
      status: { kind: 'scene-status', sceneId: 'scene:workspace-1' },
    },
  });
  if (options.expiredDraft) {
    workbench = openOrFocusCutView(workbench, {
      viewId: 'cut:project-view-1:expired',
      viewInstanceId: 'view-instance-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      kind: 'cut',
      ownerId: 'cut-session:cut:project-view-1:expired:view-instance-1',
      displayLabel: 'Untitled Cut',
      documentId: 'cut-draft:expired',
    });
  }
  const resolveCutViewGrant = vi.fn(
    async (_windowId: string, identity: CutHostRuntimeIdentity) => ({ identity, workspace }),
  );
  const projection = (): DesktopShellProjection => ({
    applicationInstanceId: 'application-1',
    rendererSessionId,
    catalog: { projects: [project] },
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
    agentHome: { conversations: [], attention: { needsInput: 0, needsReview: 0, running: 0 } },
    conversationNavigation: { recentProjectIds: [], groups: [] },
    domains: [],
  });
  const runtime = new DesktopCutRuntime({
    shell: {
      getProjection: vi.fn(async () => projection()),
      updateWorkbench: vi.fn(async (_windowId, _sessionId, _instanceId, next) => {
        if (failWorkbenchUpdates) throw new Error('Desktop fixture rejected View update.');
        workbench = next;
        return projection();
      }),
      resolveAgentWorkspace: vi.fn(async () => workspace),
      resolveCutCreationGrant: vi.fn(),
      resolveCutViewGrant,
    },
    host: createElectronNekoHostPorts({
      homedir: workspacePath,
      nekoHome: path.join(workspacePath, '.neko-home'),
      workspaceRoot: workspacePath,
      logger: new ConsoleLogger('DesktopCutDraftRuntimeTest'),
    }),
    draftLabel: 'Untitled Cut',
    ...(options.selectDraftDestination
      ? { selectDraftDestination: options.selectDraftDestination }
      : options.saveDestination
        ? { selectDraftDestination: vi.fn(async () => options.saveDestination) }
        : {}),
    ...(options.confirmDiscardDraft ? { confirmDiscardDraft: options.confirmDiscardDraft } : {}),
    ...(options.createAuthoringMediaAdapter
      ? { createAuthoringMediaAdapter: options.createAuthoringMediaAdapter }
      : {}),
  });
  return {
    runtime,
    workspacePath,
    workbench: () => workbench,
    setWorkbench: (next: DesktopWorkbenchLayoutProjection) => {
      workbench = next;
    },
    setRendererSessionId: (next: string) => {
      rendererSessionId = next;
    },
    setWorkbenchUpdateFailure: (failed: boolean) => {
      failWorkbenchUpdates = failed;
    },
    resolveCutViewGrant,
    request: {
      windowId: 'window-1',
      rendererSessionId: 'endpoint-1',
      workbenchInstanceId: 'workbench:workspace-1',
    },
    canvasSourceIdentity: () => ({
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'canvas-view-1',
      viewInstanceId: 'view-instance-1',
      rendererSessionId: 'endpoint-1',
    }),
  };
}
