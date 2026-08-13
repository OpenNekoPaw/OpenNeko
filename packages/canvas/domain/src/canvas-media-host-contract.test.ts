import { describe, expect, it } from 'vitest';
import {
  CANVAS_MEDIA_HOST_REQUEST_TYPES,
  isCanvasMediaHostRequestType,
  parseCanvasMediaHostRequest,
  parseCanvasMediaHostResponse,
} from './canvas-media-host-contract';

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas:view-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'neko/boards/workspace.nkc',
  sessionId: 'canvas-session:canvas:view-1:view-instance-1',
  rendererSessionId: 'app-1:window-1:1',
};

describe('Canvas media Host contract', () => {
  it('owns a closed request kind catalog', () => {
    expect(CANVAS_MEDIA_HOST_REQUEST_TYPES).toEqual([
      'media:probe',
      'media:play',
      'media:seek',
      'media:pause',
      'media:resume',
      'media:stop',
      'media:captureFrame',
    ]);
    expect(isCanvasMediaHostRequestType('media:probe')).toBe(true);
    expect(isCanvasMediaHostRequestType('media:unknown')).toBe(false);
  });

  it('parses exact owner-bound requests and rejects escaping paths', () => {
    const request = {
      identity,
      type: 'media:probe',
      nodeId: 'audio-1',
      locator: { kind: 'workspace-file', path: 'cases/test.aac' },
      mediaType: 'audio',
    };
    expect(parseCanvasMediaHostRequest(request)).toEqual(request);
    expect(() =>
      parseCanvasMediaHostRequest({
        ...request,
        locator: { kind: 'workspace-file', path: '../test.aac' },
      }),
    ).toThrow('portable workspace-file');
    expect(() => parseCanvasMediaHostRequest({ ...request, type: 'media:unknown' })).toThrow(
      'unsupported',
    );
  });

  it('rejects responses owned by another media node', () => {
    const response = {
      type: 'media:probeResult',
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
    };
    expect(parseCanvasMediaHostResponse(response, 'audio-1')).toEqual(response);
    expect(() => parseCanvasMediaHostResponse(response, 'audio-2')).toThrow('owner does not match');
  });

  it('retains locator-backed descriptors and rejects path-only success', () => {
    const response = {
      type: 'media:streamReady',
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
      contentLocator: { kind: 'workspace-file', path: 'media/voice.aac' },
      audio: {
        url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        mimeType: 'audio/aac',
        durationSeconds: 12,
      },
    };

    expect(parseCanvasMediaHostResponse(response, 'audio-1')).toEqual(response);
    expect(() =>
      parseCanvasMediaHostResponse(
        { ...response, contentLocator: undefined, assetPath: 'media/voice.aac' },
        'audio-1',
      ),
    ).toThrow('stream response is incomplete');
    expect(() =>
      parseCanvasMediaHostResponse({ ...response, playbackRate: '1' }, 'audio-1'),
    ).toThrow('playback rate must be a positive number');
  });
});
