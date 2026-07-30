import { describe, expect, it } from 'vitest';
import {
  CUT_HOST_RUNTIME_ROUTES,
  CUT_HOST_RUNTIME_VERSION,
  CutHostRuntimeContractError,
  DEFAULT_CUT_HOST_PRESENTATION,
  assertCutHostRuntimeIdentity,
  parseCutHostPresentationState,
  parseCutHostRuntimeRequest,
  parseCutHostRuntimeResult,
  type CutHostRuntimeIdentity,
} from './host-runtime-contract';

const identity: CutHostRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'cut-view-1',
  viewEpoch: 1,
  documentId: 'cut-document-1',
  sessionId: 'cut-session-1',
  endpointEpoch: 'endpoint-1',
};

describe('Cut Host runtime contract', () => {
  it('keeps every Cut effect in the explicit owning route catalog', () => {
    expect(Object.values(CUT_HOST_RUNTIME_ROUTES)).toEqual([
      'snapshot.get',
      'command.execute',
      'command.batch',
      'history.undo',
      'history.redo',
      'media.select',
      'media.drop',
      'agent.send',
      'preview.start',
      'preview.prepare',
      'preview.activate',
      'preview.pause',
      'preview.stop',
      'representation.resolve',
      'export.get',
      'export.start',
      'export.cancel',
      'document.save',
      'presentation.update',
    ]);
  });

  it('parses versioned requests with command and revision fencing', () => {
    expect(
      parseCutHostRuntimeRequest({
        schemaVersion: CUT_HOST_RUNTIME_VERSION,
        requestId: 'request-1',
        commandId: 'command-1',
        route: 'command.execute',
        identity,
        expectedRevision: 7,
        payload: { type: 'split' },
      }),
    ).toMatchObject({
      route: 'command.execute',
      commandId: 'command-1',
      expectedRevision: 7,
      identity,
    });
  });

  it('rejects unknown versions, routes and stale owners', () => {
    expect(() =>
      parseCutHostRuntimeRequest({
        schemaVersion: 2,
        requestId: 'request-1',
        commandId: 'command-1',
        route: 'command.execute',
        identity,
        expectedRevision: 7,
      }),
    ).toThrow(CutHostRuntimeContractError);
    expect(() =>
      parseCutHostRuntimeRequest({
        schemaVersion: CUT_HOST_RUNTIME_VERSION,
        requestId: 'request-1',
        commandId: 'command-1',
        route: 'legacy.post-message',
        identity,
        expectedRevision: 7,
      }),
    ).toThrow('route is invalid');
    expect(() =>
      assertCutHostRuntimeIdentity(identity, {
        ...identity,
        sessionId: 'cut-session-2',
      }),
    ).toThrowError(expect.objectContaining({ code: 'cut-host-runtime-stale-identity' }));
  });

  it('parses bounded representation output together with its authoritative snapshot', () => {
    const snapshot = {
      schemaVersion: CUT_HOST_RUNTIME_VERSION,
      identity,
      revision: 3,
      dirty: false,
      document: { name: 'Fixture' },
      playback: null,
      export: { tasks: [] },
      presentation: DEFAULT_CUT_HOST_PRESENTATION,
    };
    expect(
      parseCutHostRuntimeResult({
        schemaVersion: CUT_HOST_RUNTIME_VERSION,
        snapshot,
        output: {
          type: 'representations',
          revision: 3,
          results: [
            {
              clipId: 'clip-1',
              kind: 'thumbnail',
              status: 'ready',
              density: 16,
              tileIndex: 0,
              sourceTimeSeconds: 1,
              dataUrl: 'data:image/png;base64,Y2F0',
            },
          ],
        },
      }),
    ).toEqual(
      expect.objectContaining({
        snapshot,
        output: expect.objectContaining({
          type: 'representations',
          revision: 3,
        }),
      }),
    );
  });

  it('parses Desktop-authorized preview output without accepting arbitrary URLs', () => {
    const snapshot = {
      schemaVersion: CUT_HOST_RUNTIME_VERSION,
      identity,
      revision: 0,
      dirty: false,
      document: { name: 'Fixture' },
      playback: null,
      export: { tasks: [] },
      presentation: DEFAULT_CUT_HOST_PRESENTATION,
    };
    const result = {
      schemaVersion: CUT_HOST_RUNTIME_VERSION,
      snapshot,
      output: {
        type: 'preview',
        message: {
          type: 'cut:preview-ready',
          generation: 1,
          timelineTimeSeconds: 0,
          segmentEndSeconds: 5,
          playbackEndSeconds: 5,
          width: 1920,
          height: 1080,
          framesPerSecond: 30,
          video: {
            version: 1,
            transport: 'authorized',
            url: 'neko-media://desktop/media%3Apreview/preview.mp4',
            mimeType: 'video/mp4',
            preparationProfile: 'h264-mp4-direct',
            mediaTimeOriginSeconds: 0,
            durationSeconds: 5,
          },
          audioStreams: [],
          audioGainsDb: [],
          audioPlayback: [],
        },
      },
    };

    expect(parseCutHostRuntimeResult(result)).toMatchObject({
      output: {
        type: 'preview',
        message: {
          video: { transport: 'authorized' },
        },
      },
    });
    expect(() =>
      parseCutHostRuntimeResult({
        ...result,
        output: {
          ...result.output,
          message: {
            ...result.output.message,
            video: {
              ...result.output.message.video,
              url: 'https://example.com/video.mp4',
            },
          },
        },
      }),
    ).toThrow('does not match its transport');
  });

  it('accepts only bounded serializable presentation state', () => {
    expect(
      parseCutHostPresentationState({
        ...DEFAULT_CUT_HOST_PRESENTATION,
        previewVolume: 0.4,
        pixelsPerSecond: 160,
      }),
    ).toEqual({
      ...DEFAULT_CUT_HOST_PRESENTATION,
      previewVolume: 0.4,
      pixelsPerSecond: 160,
    });
    expect(() =>
      parseCutHostPresentationState({
        ...DEFAULT_CUT_HOST_PRESENTATION,
        pixelsPerSecond: 0,
      }),
    ).toThrow('between 8 and 480');
    expect(() =>
      parseCutHostPresentationState({
        ...DEFAULT_CUT_HOST_PRESENTATION,
        previewVolume: 2,
      }),
    ).toThrow('between 0 and 1');
  });
});
