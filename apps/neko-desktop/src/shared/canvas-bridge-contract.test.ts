import { describe, expect, it } from 'vitest';
import { createCanvasHostSessionId, parseCanvasHostRuntimeIdentity } from '@neko/canvas-domain';
import {
  parseDesktopCanvasWorkspaceIndexCatalogRequest,
  parseDesktopCanvasWorkspaceIndexCatalogResult,
  parseDesktopCanvasWorkspaceIndexChangedEvent,
  parseDesktopCanvasWorkspaceDocumentOpenRequest,
  parseDesktopCanvasWorkspaceDocumentOpenResult,
  isSameCanvasHostIdentity,
  parseDesktopCanvasPreviewResourceReleaseRequest,
  parseDesktopCanvasPreviewResourceRequest,
  parseDesktopCanvasPreviewResourceResult,
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
    expect(parseCanvasHostRuntimeIdentity(identity)).toEqual(identity);
    expect(createCanvasHostSessionId(identity.viewId, identity.viewInstanceId)).toBe(
      identity.sessionId,
    );
    expect(isSameCanvasHostIdentity(identity, { ...identity })).toBe(true);
  });

  it('rejects missing and stale identity input instead of using active Canvas state', () => {
    expect(() =>
      parseCanvasHostRuntimeIdentity({
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

  it('parses exact embedded Preview ownership and rejects non-opaque transport values', () => {
    const request = {
      identity,
      requestId: 'embedded-1',
      nodeId: 'generation-1',
      outputId: 'output-1',
      locator: { file: { authority: 'workspace' as const, path: 'neko/generated/output-1.png' } },
      contentKind: 'image' as const,
      mediaType: 'image/png',
      displayName: 'Output 1',
    };
    const result = {
      requestId: 'embedded-1',
      descriptor: {
        descriptorId: 'canvas-preview-session-1-output-1',
        sourceFingerprint: 'sha256-output-1',
        contentLocator: request.locator,
        url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        contentKind: 'image' as const,
        mediaType: 'image/png',
        displayName: 'Output 1',
        byteLength: 42,
      },
    };

    expect(parseDesktopCanvasPreviewResourceRequest(request)).toEqual(request);
    expect(parseDesktopCanvasPreviewResourceResult(result, 'embedded-1')).toEqual(result);
    expect(
      parseDesktopCanvasPreviewResourceReleaseRequest({
        identity,
        descriptorId: result.descriptor.descriptorId,
      }),
    ).toEqual({ identity, descriptorId: result.descriptor.descriptorId });
    expect(() =>
      parseDesktopCanvasPreviewResourceRequest({ ...request, identity: undefined }),
    ).toThrow();
    expect(() =>
      parseDesktopCanvasPreviewResourceResult(
        {
          ...result,
          descriptor: { ...result.descriptor, url: 'file:///private/output-1.png' },
        },
        'embedded-1',
      ),
    ).toThrow();
  });
});

describe('Desktop Canvas workspace index catalog contract', () => {
  it('strictly parses one Workspace-scoped changed event', () => {
    expect(parseDesktopCanvasWorkspaceIndexChangedEvent({ workspaceId: 'ws1' })).toEqual({
      workspaceId: 'ws1',
    });
    expect(() =>
      parseDesktopCanvasWorkspaceIndexChangedEvent({ workspaceId: 'ws1', extra: true }),
    ).toThrow("unsupported field 'extra'");
  });

  it('parses an exact request', () => {
    expect(
      parseDesktopCanvasWorkspaceIndexCatalogRequest({
        requestId: 'r1',
        workspaceId: 'ws1',
        workspaceGrantId: 'grant1',
      }),
    ).toEqual({ requestId: 'r1', workspaceId: 'ws1', workspaceGrantId: 'grant1' });
  });

  it('rejects unknown request fields', () => {
    expect(() =>
      parseDesktopCanvasWorkspaceIndexCatalogRequest({
        requestId: 'r1',
        workspaceId: 'ws1',
        workspaceGrantId: 'grant1',
        extra: true,
      }),
    ).toThrow("unsupported field 'extra'");
  });

  it('rejects result workspace mismatch', () => {
    expect(() =>
      parseDesktopCanvasWorkspaceIndexCatalogResult(
        {
          requestId: 'r1',
          catalog: {
            workspaceId: 'ws2',
            defaultTarget: { workspaceId: 'ws2', canvasId: 'neko/boards/workspace.nkc' },
            options: [
              {
                target: { workspaceId: 'ws2', canvasId: 'neko/boards/workspace.nkc' },
                label: 'Board',
              },
            ],
            diagnostics: [],
          },
        },
        'r1',
        'ws1',
      ),
    ).toThrow('workspace mismatch');
  });
});

describe('Desktop Canvas workspace document open contract', () => {
  it('accepts only an exact Workspace NKC identity and correlated result', () => {
    const request = {
      requestId: 'open-1',
      workspaceId: 'ws1',
      workspaceGrantId: 'grant1',
      canvasId: 'neko/boards/story.nkc',
    };
    expect(parseDesktopCanvasWorkspaceDocumentOpenRequest(request)).toEqual(request);
    expect(
      parseDesktopCanvasWorkspaceDocumentOpenResult(
        { requestId: 'open-1', status: 'opened' },
        'open-1',
      ),
    ).toEqual({ requestId: 'open-1', status: 'opened' });
    expect(() =>
      parseDesktopCanvasWorkspaceDocumentOpenRequest({ ...request, canvasId: 'notes/story.txt' }),
    ).toThrow('NKC identity');
    expect(() =>
      parseDesktopCanvasWorkspaceDocumentOpenRequest({ ...request, extra: true }),
    ).toThrow("unsupported field 'extra'");
  });
});
