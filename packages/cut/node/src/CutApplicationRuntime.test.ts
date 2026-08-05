import {
  CUT_HOST_RUNTIME_ROUTES,
  createOtioTimeline,
  serializeOtio,
  type CutDocumentStorage,
  type CutHostRuntimeIdentity,
  type CutMediaRuntimeAdapter,
} from '@neko/cut-domain';
import { describe, expect, it, vi } from 'vitest';

import { CutApplicationRuntime } from './CutApplicationRuntime';

describe('CutApplicationRuntime', () => {
  it('owns the document session and serialized command path behind an authorized Host port', async () => {
    const identity = fixtureIdentity();
    const storage = inMemoryStorage();
    const authorizeSession = vi.fn(async (windowId: string, requested: CutHostRuntimeIdentity) => {
      expect(windowId).toBe(identity.windowId);
      expect(requested).toEqual(identity);
      return {
        documentPath: '/fixture/cuts/story.otio',
        workspacePath: '/fixture',
        storage,
      };
    });
    const runtime = new CutApplicationRuntime({
      authorizeSession,
      authorizeNewSession: authorizeSession,
      resolveResourcePath: async () => {
        throw new Error('Resource resolution is not part of this scenario.');
      },
      readText: async () => {
        throw new Error('Text reading is not part of this scenario.');
      },
      createPreviewMediaAdapter: () => mediaAdapter(),
    });

    const result = await runtime.execute(identity.windowId, {
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

    expect(result.snapshot).toMatchObject({
      identity,
      dirty: true,
      document: {
        tracks: expect.arrayContaining([
          expect.objectContaining({ trackId: 'audio-1', kind: 'Audio' }),
        ]),
      },
    });
    expect(authorizeSession).toHaveBeenCalledOnce();
    await runtime.dispose();
  });

  it('projects exact Clip context and rejects unknown selections', async () => {
    const identity = fixtureIdentity();
    const runtime = new CutApplicationRuntime({
      authorizeSession: async () => ({
        documentPath: '/fixture/cuts/story.otio',
        workspacePath: '/fixture',
        storage: inMemoryStorage(),
      }),
      authorizeNewSession: async () => ({
        documentPath: '/fixture/cuts/new-story.otio',
        workspacePath: '/fixture',
        storage: inMemoryStorage(),
      }),
      resolveResourcePath: async () => {
        throw new Error('Resource resolution is not part of this scenario.');
      },
      readText: async () => {
        throw new Error('Text reading is not part of this scenario.');
      },
      createPreviewMediaAdapter: () => mediaAdapter(),
    });
    await runtime.execute(identity.windowId, {
      requestId: 'link-request',
      commandId: 'link-command',
      route: CUT_HOST_RUNTIME_ROUTES.commandExecute,
      identity,
      payload: {
        type: 'link-media',
        clipId: 'clip-1',
        name: 'Opening shot',
        targetUrl: '../media/opening.mp4',
        durationFrames: 90,
        rate: 30,
        trackId: 'video-1',
        timelineStartFrames: 0,
        overlapPolicy: 'reject',
      },
    });

    const result = await runtime.execute(identity.windowId, {
      requestId: 'agent-request',
      commandId: 'agent-command',
      route: CUT_HOST_RUNTIME_ROUTES.agentSend,
      identity,
      payload: {
        type: 'cut:send-to-agent',
        selection: { kind: 'clip', trackId: 'video-1', clipId: 'clip-1' },
      },
    });
    expect(result.output).toEqual({
      type: 'agent-context',
      payload: expect.objectContaining({
        type: 'cut-clip',
        id: 'cut:cuts/story.otio:track:video-1:clip:clip-1',
        label: 'Opening shot',
        summary: 'Video Clip “Opening shot” at 0.000s–3.000s.',
        data: expect.objectContaining({
          kind: 'cut-clip-selection',
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          document: {
            locator: { kind: 'workspace-file', path: 'cuts/story.otio' },
            sessionId: 'cut-session:cut-view-1:view-instance-1',
          },
          selection: expect.objectContaining({
            kind: 'clip',
            trackId: 'video-1',
            clipId: 'clip-1',
            timeRange: { startSeconds: 0, durationSeconds: 3 },
          }),
        }),
      }),
    });
    await expect(
      runtime.execute(identity.windowId, {
        requestId: 'stale-request',
        commandId: 'stale-command',
        route: CUT_HOST_RUNTIME_ROUTES.agentSend,
        identity,
        payload: {
          type: 'cut:send-to-agent',
          selection: { kind: 'clip', trackId: 'video-1', clipId: 'missing' },
        },
      }),
    ).rejects.toThrow('stale');
    await runtime.dispose();
  });

  it('creates a new explicit OTIO target and appends only to that session', async () => {
    const identity = { ...fixtureIdentity(), documentId: 'cuts/new-story.otio' };
    const write = vi.fn(async () => ({ fingerprint: 'fixture:new:1' }));
    const storage: CutDocumentStorage = {
      read: vi.fn(async () => {
        throw new Error('New Cut target must not be read before creation.');
      }),
      write,
    };
    const authorizeNewSession = vi.fn(async () => ({
      documentPath: '/fixture/cuts/new-story.otio',
      workspacePath: '/fixture',
      storage,
    }));
    const authorizeSession = vi.fn(async () => ({
      documentPath: '/fixture/cuts/new-story.otio',
      workspacePath: '/fixture',
      storage,
    }));
    const runtime = new CutApplicationRuntime({
      authorizeSession,
      authorizeNewSession,
      resolveResourcePath: async () => {
        throw new Error('Resource resolution is not part of this scenario.');
      },
      readText: async () => {
        throw new Error('Text reading is not part of this scenario.');
      },
      createPreviewMediaAdapter: () => mediaAdapter(),
    });

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
    expect(created.snapshot).toMatchObject({
      identity,
      dirty: false,
      document: {
        tracks: [
          expect.objectContaining({
            items: [expect.objectContaining({ clipId: 'route-clip-1' })],
          }),
        ],
      },
    });
    expect(authorizeNewSession).toHaveBeenCalledOnce();
    expect(authorizeSession).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledOnce();

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
    expect(authorizeSession).toHaveBeenCalledOnce();
    expect(created.snapshot.document).toMatchObject({ durationSeconds: 2 });
    expect(appended.snapshot.document).toMatchObject({ durationSeconds: 3 });
    await runtime.dispose();
  });

  it('rejects removed request fields without affecting independent sessions', async () => {
    const firstIdentity = fixtureIdentity();
    const secondIdentity: CutHostRuntimeIdentity = {
      ...firstIdentity,
      viewId: 'cut-view-2',
      documentId: 'cuts/alternate.otio',
      sessionId: 'cut-session:cut-view-2:view-instance-1',
    };
    const storageByDocument = new Map([
      [firstIdentity.documentId, inMemoryStorage()],
      [secondIdentity.documentId, inMemoryStorage()],
    ]);
    const runtime = new CutApplicationRuntime({
      authorizeSession: async (_windowId, identity) => {
        const storage = storageByDocument.get(identity.documentId);
        if (!storage) throw new Error(`Unknown test document ${identity.documentId}.`);
        return {
          documentPath: `/fixture/${identity.documentId}`,
          workspacePath: '/fixture',
          storage,
        };
      },
      authorizeNewSession: async () => {
        throw new Error('Creation is not part of this scenario.');
      },
      resolveResourcePath: async () => {
        throw new Error('Resource resolution is not part of this scenario.');
      },
      readText: async () => {
        throw new Error('Text reading is not part of this scenario.');
      },
      createPreviewMediaAdapter: () => mediaAdapter(),
    });

    await expect(
      runtime.execute(firstIdentity.windowId, {
        schemaVersion: 1,
        requestId: 'invalid-request',
        commandId: 'invalid-command',
        route: CUT_HOST_RUNTIME_ROUTES.snapshotGet,
        identity: firstIdentity,
      }),
    ).rejects.toThrow('unsupported fields: schemaVersion');

    const secondResult = await runtime.execute(secondIdentity.windowId, {
      requestId: 'second-request',
      commandId: 'second-command',
      route: CUT_HOST_RUNTIME_ROUTES.commandExecute,
      identity: secondIdentity,
      payload: {
        type: 'add-track',
        trackId: 'alternate-audio',
        trackKind: 'Audio',
        name: 'Alternate Audio',
      },
    });
    expect(secondResult.snapshot.document).toMatchObject({
      documentUri: secondIdentity.documentId,
      tracks: expect.arrayContaining([expect.objectContaining({ trackId: 'alternate-audio' })]),
    });
    await expect(runtime.getSnapshot(firstIdentity.windowId, firstIdentity)).resolves.toMatchObject(
      {
        identity: firstIdentity,
        document: { documentUri: firstIdentity.documentId },
      },
    );
    await runtime.dispose();
  });
});

function fixtureIdentity(): CutHostRuntimeIdentity {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'cut-view-1',
    viewInstanceId: 'view-instance-1',
    documentId: 'cuts/story.otio',
    sessionId: 'cut-session:cut-view-1:view-instance-1',
    rendererSessionId: 'endpoint-1',
  };
}

function inMemoryStorage(): CutDocumentStorage {
  let bytes = serializeOtio(
    createOtioTimeline('Story', {
      profile: '1080p30',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1920,
      height: 1080,
    }),
  );
  let fingerprint = 'fixture:1';
  return {
    read: async () => ({ bytes, fingerprint }),
    write: async (_documentUri, next, options) => {
      if (
        options.expectedFingerprint !== undefined &&
        options.expectedFingerprint !== fingerprint
      ) {
        throw new Error('Fixture document fingerprint conflict.');
      }
      bytes = next;
      fingerprint = 'fixture:2';
      return { fingerprint };
    },
  };
}

function mediaAdapter(): CutMediaRuntimeAdapter {
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
    export: vi.fn(),
    dispose: vi.fn(async () => undefined),
  };
}
