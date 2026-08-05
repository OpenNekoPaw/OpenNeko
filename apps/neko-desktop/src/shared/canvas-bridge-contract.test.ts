import { describe, expect, it } from 'vitest';
import { createCanvasHostSessionId } from '@neko/canvas-domain';
import {
  isSameCanvasHostIdentity,
  parseDesktopCanvasHostIdentity,
  parseDesktopCanvasMediaRequest,
  parseDesktopCanvasMediaResponse,
  parseDesktopCanvasPreviewVariantRequest,
  parseDesktopCanvasPreviewVariantResult,
} from './canvas-bridge-contract';

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

describe('Desktop Canvas bridge contract', () => {
  it('parses every explicit owner identity field', () => {
    expect(parseDesktopCanvasHostIdentity(identity)).toEqual(identity);
    expect(createCanvasHostSessionId(identity.viewId, identity.viewInstanceId)).toBe(identity.sessionId);
    expect(isSameCanvasHostIdentity(identity, { ...identity })).toBe(true);
  });

  it('rejects missing and stale identity input instead of using active Canvas state', () => {
    expect(() =>
      parseDesktopCanvasHostIdentity({
        ...identity,
        documentId: '',
      }),
    ).toThrow('document identity is required');
    expect(
      isSameCanvasHostIdentity(identity, {
        ...identity,
        viewInstanceId: 'view-instance-stale',
      }),
    ).toBe(false);
  });

  it('accepts only owner-bound portable preview locators and image data results', () => {
    const request = {
      identity,
      requestId: 'preview-1',
      locator: { kind: 'workspace-file', path: 'media/cat.png' },
      role: 'thumbnail',
      mediaType: 'image',
    };
    expect(parseDesktopCanvasPreviewVariantRequest(request)).toEqual(request);
    expect(
      parseDesktopCanvasPreviewVariantResult(
        { requestId: 'preview-1', url: 'data:image/png;base64,Y2F0' },
        'preview-1',
      ),
    ).toEqual({ requestId: 'preview-1', url: 'data:image/png;base64,Y2F0' });

    expect(() =>
      parseDesktopCanvasPreviewVariantRequest({
        ...request,
        locator: { kind: 'workspace-file', path: '/private/cat.png' },
      }),
    ).toThrow('portable workspace-file');
    expect(() =>
      parseDesktopCanvasPreviewVariantRequest({
        ...request,
        locator: { kind: 'workspace-file', path: '../cat.png' },
      }),
    ).toThrow('portable workspace-file');
    expect(() =>
      parseDesktopCanvasPreviewVariantResult(
        { requestId: 'preview-1', url: 'file:///private/cat.png' },
        'preview-1',
      ),
    ).toThrow('preview result is invalid');
  });

  it('parses owner-bound Canvas media requests and rejects escaping paths', () => {
    const request = {
      identity,
      type: 'media:probe',
      nodeId: 'audio-1',
      locator: { kind: 'workspace-file', path: 'cases/test.aac' },
      mediaType: 'audio',
    };
    expect(parseDesktopCanvasMediaRequest(request)).toEqual(request);
    expect(() =>
      parseDesktopCanvasMediaRequest({
        ...request,
        locator: { kind: 'workspace-file', path: '../test.aac' },
      }),
    ).toThrow('portable workspace-file');
  });

  it('parses package media responses without accepting mismatched node ownership', () => {
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
    expect(parseDesktopCanvasMediaResponse(response, 'audio-1')).toEqual(response);
    expect(() => parseDesktopCanvasMediaResponse(response, 'audio-2')).toThrow(
      'owner does not match',
    );
  });

  it('retains locator-backed native media descriptors and rejects path-only success', () => {
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

    expect(parseDesktopCanvasMediaResponse(response, 'audio-1')).toEqual(response);
    expect(() =>
      parseDesktopCanvasMediaResponse(
        {
          ...response,
          contentLocator: undefined,
          assetPath: 'media/voice.aac',
        },
        'audio-1',
      ),
    ).toThrow('stream response is incomplete');
  });
});
