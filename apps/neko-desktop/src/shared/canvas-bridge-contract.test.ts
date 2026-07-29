import { describe, expect, it } from 'vitest';
import {
  createDesktopCanvasSessionId,
  isSameCanvasHostIdentity,
  parseDesktopCanvasHostIdentity,
  parseDesktopCanvasPreviewVariantRequest,
  parseDesktopCanvasPreviewVariantResult,
} from './canvas-bridge-contract';

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas:view-1',
  viewEpoch: 1,
  documentId: 'neko/boards/workspace.nkc',
  sessionId: 'canvas-session:canvas:view-1:1',
  endpointEpoch: 'app-1:window-1:1',
};

describe('Desktop Canvas bridge contract', () => {
  it('parses every explicit owner identity field', () => {
    expect(parseDesktopCanvasHostIdentity(identity)).toEqual(identity);
    expect(createDesktopCanvasSessionId(identity.viewId, identity.viewEpoch)).toBe(
      identity.sessionId,
    );
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
        viewEpoch: identity.viewEpoch + 1,
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
});
