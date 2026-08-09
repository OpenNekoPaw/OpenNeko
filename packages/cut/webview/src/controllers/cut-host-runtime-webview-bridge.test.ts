import {
  DEFAULT_CUT_HOST_PRESENTATION,
  createOtioTimeline,
  projectTimelineView,
  type CutHostRuntime,
  type CutHostRuntimeResult,
  type CutHostRuntimeSnapshot,
} from '@neko/cut-domain';
import { describe, expect, it, vi } from 'vitest';
import { createCutHostRuntimeWebviewBridge } from './cut-host-runtime-webview-bridge';

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'cut-view-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'cuts/story.otio',
  sessionId: 'cut-session-1',
  rendererSessionId: 'endpoint-1',
} as const;

describe('createCutHostRuntimeWebviewBridge', () => {
  it('prepares one Snapshot before a late Root subscriber and replays it without another read', async () => {
    const initial = snapshot(0);
    const disposeSubscription = vi.fn();
    const runtime: CutHostRuntime = {
      identity,
      getSnapshot: vi.fn(async () => initial),
      execute: vi.fn(),
      subscribe: vi.fn(() => disposeSubscription),
    };
    const bridge = createCutHostRuntimeWebviewBridge(runtime);

    bridge.prepare();
    expect(runtime.subscribe).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      const messages: unknown[] = [];
      const unsubscribe = bridge.subscribe((message) => messages.push(message));
      expect(messages).toHaveLength(2);
      unsubscribe();
    });
    bridge.postIntent({ type: 'cut:ready' });
    await Promise.resolve();
    expect(runtime.getSnapshot).toHaveBeenCalledOnce();

    bridge.dispose();
    expect(disposeSubscription).toHaveBeenCalledOnce();
    expect(() => bridge.subscribe(() => undefined)).toThrow('disposed');
  });

  it('keeps a runtime event authoritative when the older initial Snapshot resolves later', async () => {
    const initial = snapshot(0);
    const current = snapshot(1);
    let resolveInitial: ((value: CutHostRuntimeSnapshot) => void) | undefined;
    let onEvent: ((event: { snapshot: CutHostRuntimeSnapshot }) => void) | undefined;
    const runtime: CutHostRuntime = {
      identity,
      getSnapshot: vi.fn(
        () =>
          new Promise<CutHostRuntimeSnapshot>((resolve) => {
            resolveInitial = resolve;
          }),
      ),
      execute: vi.fn(),
      subscribe: vi.fn((listener) => {
        onEvent = listener;
        return () => undefined;
      }),
    };
    const bridge = createCutHostRuntimeWebviewBridge(runtime);
    const messages: unknown[] = [];
    bridge.prepare();
    bridge.subscribe((message) => messages.push(message));

    onEvent?.({ snapshot: current });
    resolveInitial?.(initial);
    await Promise.resolve();

    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'cut:runtime-snapshot', dirty: true }),
    );
    expect(messages).not.toContainEqual(
      expect.objectContaining({ type: 'cut:runtime-snapshot', dirty: false }),
    );
  });

  it('projects snapshot-first state and orders a mutation projection before its result', async () => {
    const initial = snapshot(0);
    const next = snapshot(1);
    const runtime: CutHostRuntime = {
      identity,
      getSnapshot: vi.fn(async () => initial),
      execute: vi.fn(async (): Promise<CutHostRuntimeResult> => ({
        snapshot: next,
      })),
      subscribe: vi.fn(() => () => undefined),
    };
    const messages: unknown[] = [];
    const bridge = createCutHostRuntimeWebviewBridge(runtime);
    const unsubscribe = bridge.subscribe((message) => messages.push(message));

    bridge.postIntent({ type: 'cut:ready' });
    await vi.waitFor(() => expect(messages).toHaveLength(2));
    bridge.postIntent({
      type: 'cut:command',
      documentUri: identity.documentId,
      sessionId: identity.sessionId,
      clientMutationId: 'mutation-1',
      command: { type: 'trim-trailing-gaps' },
    });

    await vi.waitFor(() => expect(messages).toHaveLength(5));
    expect(messages).toEqual([
      {
        type: 'cut:runtime-snapshot',
        view: initial.document,
        dirty: initial.dirty,
        presentation: initial.presentation,
      },
      { type: 'cut:export-tasks', tasks: [] },
      {
        type: 'cut:runtime-snapshot',
        view: next.document,
        dirty: next.dirty,
        presentation: next.presentation,
      },
      { type: 'cut:export-tasks', tasks: [] },
      {
        type: 'cut:mutation-result',
        clientMutationId: 'mutation-1',
        succeeded: true,
      },
    ]);
    expect(runtime.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'command.execute',
        commandId: 'mutation-1',
        payload: { type: 'trim-trailing-gaps' },
      }),
    );
    unsubscribe();
  });

  it('projects package-owned representation output without reporting an operation failure', async () => {
    const initial = snapshot(0);
    const runtime: CutHostRuntime = {
      identity,
      getSnapshot: vi.fn(async () => initial),
      execute: vi.fn(async (): Promise<CutHostRuntimeResult> => ({
        snapshot: initial,
        output: {
          type: 'representations',
          requestId: 'representation-request-1',
          results: [
            {
              clipId: 'clip-1',
              kind: 'thumbnail',
              status: 'ready',
              density: 64,
              tileIndex: 0,
              sourceTimeSeconds: 0,
              dataUrl: 'data:image/png;base64,Y2F0',
            },
          ],
        },
      })),
      subscribe: vi.fn(() => () => undefined),
    };
    const messages: unknown[] = [];
    const bridge = createCutHostRuntimeWebviewBridge(runtime);
    bridge.subscribe((message) => messages.push(message));

    bridge.postIntent({
      type: 'cut:request-representations',
      documentUri: identity.documentId,
      sessionId: identity.sessionId,
      requestId: 'representation-request-1',
      requests: [{ clipId: 'clip-1', kind: 'thumbnail', density: 64, tileIndex: 0 }],
    });

    await vi.waitFor(() =>
      expect(messages).toContainEqual(
        expect.objectContaining({
          type: 'cut:representations',
          results: [expect.objectContaining({ clipId: 'clip-1', status: 'ready' })],
        }),
      ),
    );
    expect(messages).not.toContainEqual(expect.objectContaining({ type: 'cut:error' }));
  });

  it('returns a typed representation failure without raising a generic Cut operation error', async () => {
    const initial = snapshot(0);
    const runtime: CutHostRuntime = {
      identity,
      getSnapshot: vi.fn(async () => initial),
      execute: vi.fn(async () => {
        throw new Error('media worker unavailable');
      }),
      subscribe: vi.fn(() => () => undefined),
    };
    const messages: unknown[] = [];
    const bridge = createCutHostRuntimeWebviewBridge(runtime);
    bridge.subscribe((message) => messages.push(message));

    bridge.postIntent({
      type: 'cut:request-representations',
      documentUri: identity.documentId,
      sessionId: identity.sessionId,
      requestId: 'representation-request-failed',
      requests: [{ clipId: 'clip-1', kind: 'thumbnail', density: 64, tileIndex: 0 }],
    });

    await vi.waitFor(() =>
      expect(messages).toContainEqual({
        type: 'cut:representation-failed',
        documentUri: identity.documentId,
        sessionId: identity.sessionId,
        requestId: 'representation-request-failed',
        diagnostic: { code: 'media-runtime-unavailable' },
      }),
    );
    expect(messages).not.toContainEqual(expect.objectContaining({ type: 'cut:error' }));
  });

  it('projects owner-authorized HTTP preview output to the package Cut controller', async () => {
    const initial = snapshot(0);
    const previewMessage = {
      type: 'cut:preview-ready' as const,
      previewRequestId: 'session-1:preview:1',
      videoClipId: 'clip-1',
      timelineTimeSeconds: 0,
      segmentEndSeconds: 5,
      playbackEndSeconds: 5,
      mediaSourceTimeSeconds: 0,
      mediaPlaybackRate: 1,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      video: {
        url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        mimeType: 'video/mp4',
        preparationProfile: 'h264-mp4-direct' as const,
        mediaTimeOriginSeconds: 0,
        durationSeconds: 5,
      },
      videoPlaybackRate: 1,
      audioStreams: [],
      audioGainsDb: [],
      audioPlayback: [],
    };
    const runtime: CutHostRuntime = {
      identity,
      getSnapshot: vi.fn(async () => initial),
      execute: vi.fn(async (): Promise<CutHostRuntimeResult> => ({
        snapshot: initial,
        output: { type: 'preview', message: previewMessage },
      })),
      subscribe: vi.fn(() => () => undefined),
    };
    const messages: unknown[] = [];
    const bridge = createCutHostRuntimeWebviewBridge(runtime);
    bridge.subscribe((message) => messages.push(message));

    bridge.postIntent({
      type: 'cut:preview-start',
      documentUri: identity.documentId,
      sessionId: identity.sessionId,
      timelineTimeSeconds: 0,
      previewRequestId: 'session-1:preview:1',
      playbackMode: 'playing',
    });

    await vi.waitFor(() => expect(messages).toContainEqual(previewMessage));
    expect(messages).not.toContainEqual(expect.objectContaining({ type: 'cut:error' }));
  });

  it('routes save and bounded presentation changes through the owning runtime', async () => {
    const initial = snapshot(0);
    const presentation = {
      ...DEFAULT_CUT_HOST_PRESENTATION,
      pixelsPerSecond: 160,
      overviewVisible: false,
    };
    const runtime: CutHostRuntime = {
      identity,
      getSnapshot: vi.fn(async () => initial),
      execute: vi.fn(async (request): Promise<CutHostRuntimeResult> => ({
        snapshot:
          request.route === 'presentation.update'
            ? { ...initial, presentation }
            : { ...initial, dirty: false },
      })),
      subscribe: vi.fn(() => () => undefined),
    };
    const bridge = createCutHostRuntimeWebviewBridge(runtime);
    bridge.subscribe(() => undefined);

    bridge.postIntent({
      type: 'cut:presentation-update',
      documentUri: identity.documentId,
      sessionId: identity.sessionId,
      clientMutationId: 'presentation-command',
      presentation,
    });
    bridge.postIntent({
      type: 'cut:save',
      documentUri: identity.documentId,
      sessionId: identity.sessionId,
      clientMutationId: 'save-command',
    });

    await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(2));
    expect(runtime.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'presentation.update',
        commandId: 'presentation-command',
        payload: presentation,
      }),
    );
    expect(runtime.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'document.save',
        commandId: 'save-command',
      }),
    );
  });
});

function snapshot(state: number): CutHostRuntimeSnapshot {
  return {
    identity,
    dirty: state > 0,
    document: projectTimelineView({
      document: createOtioTimeline('Story', {
        profile: '1080p30',
        editRateNumerator: 30,
        editRateDenominator: 1,
        width: 1920,
        height: 1080,
      }),
      documentUri: identity.documentId,
      sessionId: identity.sessionId,
    }),
    playback: { status: 'idle' },
    export: { tasks: [] },
    presentation: DEFAULT_CUT_HOST_PRESENTATION,
  };
}
