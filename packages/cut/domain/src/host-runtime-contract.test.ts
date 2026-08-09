import { describe, expect, it } from 'vitest';
import {
  CUT_HOST_RUNTIME_ROUTES,
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
  viewInstanceId: 'view-instance-1',
  documentId: 'cut-document-1',
  sessionId: 'cut-session-1',
  rendererSessionId: 'endpoint-1',
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
      'document.create',
      'presentation.update',
    ]);
  });

  it('parses canonical requests with exact command ownership', () => {
    expect(
      parseCutHostRuntimeRequest({
        requestId: 'request-1',
        commandId: 'command-1',
        route: 'command.execute',
        identity,
        payload: { type: 'split' },
      }),
    ).toMatchObject({
      route: 'command.execute',
      commandId: 'command-1',
      identity,
    });
  });

  it('rejects unknown fields and stale owners', () => {
    expect(() =>
      parseCutHostRuntimeRequest({
        unexpectedField: 2,
        requestId: 'request-1',
        commandId: 'command-1',
        route: 'command.execute',
        identity,
      }),
    ).toThrow(CutHostRuntimeContractError);
    expect(() =>
      assertCutHostRuntimeIdentity(identity, {
        ...identity,
        sessionId: 'cut-session-2',
      }),
    ).toThrowError(expect.objectContaining({ code: 'cut-host-runtime-stale-identity' }));
  });

  it('parses bounded representation output together with its authoritative snapshot', () => {
    const snapshot = {
      identity,
      dirty: false,
      document: { name: 'Fixture' },
      playback: null,
      export: { tasks: [] },
      presentation: DEFAULT_CUT_HOST_PRESENTATION,
    };
    expect(
      parseCutHostRuntimeResult({
        snapshot,
        output: {
          type: 'representations',
          requestId: 'representation-request-1',
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
          requestId: 'representation-request-1',
        }),
      }),
    );
  });

  it('parses an authoritative identity rebind event cursor', () => {
    const snapshot = {
      identity,
      dirty: false,
      document: { name: 'Fixture' },
      playback: null,
      export: { tasks: [] },
      presentation: DEFAULT_CUT_HOST_PRESENTATION,
    };
    expect(
      parseCutHostRuntimeResult({
        snapshot,
        output: { type: 'identity-rebound', eventSequence: 3 },
      }),
    ).toMatchObject({ output: { type: 'identity-rebound', eventSequence: 3 } });
    expect(() =>
      parseCutHostRuntimeResult({
        snapshot,
        output: { type: 'identity-rebound', eventSequence: 0 },
      }),
    ).toThrow('positive integer');
  });

  it('parses Desktop HTTP preview output without accepting arbitrary URLs', () => {
    const snapshot = {
      identity,
      dirty: false,
      document: { name: 'Fixture' },
      playback: null,
      export: { tasks: [] },
      presentation: DEFAULT_CUT_HOST_PRESENTATION,
    };
    const result = {
      snapshot,
      output: {
        type: 'preview',
        message: {
          type: 'cut:preview-ready',
          previewRequestId: 'session-1:preview:1',
          timelineTimeSeconds: 0,
          segmentEndSeconds: 5,
          playbackEndSeconds: 5,
          width: 1920,
          height: 1080,
          framesPerSecond: 30,
          video: {
            url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
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
          video: {
            url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
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
    ).toThrow('resource URL is invalid');
  });

  it('accepts only bounded serializable presentation state', () => {
    expect(
      parseCutHostPresentationState({
        ...DEFAULT_CUT_HOST_PRESENTATION,
        playheadSeconds: 14.5,
        previewVolume: 0.4,
        pixelsPerSecond: 160,
      }),
    ).toEqual({
      ...DEFAULT_CUT_HOST_PRESENTATION,
      playheadSeconds: 14.5,
      previewVolume: 0.4,
      pixelsPerSecond: 160,
    });
    expect(() =>
      parseCutHostPresentationState({
        ...DEFAULT_CUT_HOST_PRESENTATION,
        playheadSeconds: -1,
      }),
    ).toThrow('must not be negative');
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
