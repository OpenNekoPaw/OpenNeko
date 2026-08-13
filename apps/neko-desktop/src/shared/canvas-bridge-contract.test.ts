import { describe, expect, it } from 'vitest';
import { createCanvasHostSessionId, parseCanvasHostRuntimeIdentity } from '@neko/canvas-domain';
import {
  isSameCanvasHostIdentity,
  parseDesktopCanvasEmbeddedPreviewReleaseRequest,
  parseDesktopCanvasEmbeddedPreviewRequest,
  parseDesktopCanvasEmbeddedPreviewResult,
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

  it('accepts owner-bound portable preview locators and opaque resource results', () => {
    const request = {
      identity,
      requestId: 'preview-1',
      sourceId: 'image-node-1',
      locator: { kind: 'workspace-file', path: 'media/cat.png' },
      role: 'thumbnail',
      mediaType: 'image',
    };
    expect(parseDesktopCanvasPreviewVariantRequest(request)).toEqual(request);
    expect(
      parseDesktopCanvasPreviewVariantResult(
        {
          requestId: 'preview-1',
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/preview',
        },
        'preview-1',
      ),
    ).toEqual({
      requestId: 'preview-1',
      url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/preview',
    });

    expect(
      parseDesktopCanvasPreviewVariantRequest({
        ...request,
        locator: {
          kind: 'document-entry',
          source: { kind: 'workspace-file', path: 'books/story.epub' },
          entryPath: 'OPS/images/cover.jpg',
        },
      }).locator.kind,
    ).toBe('document-entry');

    expect(() =>
      parseDesktopCanvasPreviewVariantRequest({
        ...request,
        locator: { kind: 'workspace-file', path: '/private/cat.png' },
      }),
    ).toThrow('valid ContentLocator');
    expect(() =>
      parseDesktopCanvasPreviewVariantRequest({
        ...request,
        locator: { kind: 'workspace-file', path: '../cat.png' },
      }),
    ).toThrow('valid ContentLocator');
    expect(() =>
      parseDesktopCanvasPreviewVariantResult(
        { requestId: 'preview-1', url: 'file:///private/cat.png' },
        'preview-1',
      ),
    ).toThrow('preview result is invalid');
  });

  it('parses exact embedded Preview ownership and rejects non-opaque transport values', () => {
    const request = {
      identity,
      requestId: 'embedded-1',
      nodeId: 'generation-1',
      outputId: 'output-1',
      locator: {
        kind: 'generated-output' as const,
        outputId: 'output-1',
        digest: 'sha256:output-1',
        path: 'neko/generated/output-1.png',
      },
      contentKind: 'image' as const,
      mediaType: 'image/png',
      displayName: 'Output 1',
    };
    const result = {
      requestId: 'embedded-1',
      descriptor: {
        descriptorId: 'canvas-embedded-session-1-output-1',
        sourceFingerprint: 'sha256-output-1',
        contentLocator: request.locator,
        url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        contentKind: 'image' as const,
        mediaType: 'image/png',
        displayName: 'Output 1',
        byteLength: 42,
      },
    };

    expect(parseDesktopCanvasEmbeddedPreviewRequest(request)).toEqual(request);
    expect(parseDesktopCanvasEmbeddedPreviewResult(result, 'embedded-1')).toEqual(result);
    expect(
      parseDesktopCanvasEmbeddedPreviewReleaseRequest({
        identity,
        descriptorId: result.descriptor.descriptorId,
      }),
    ).toEqual({ identity, descriptorId: result.descriptor.descriptorId });
    expect(() =>
      parseDesktopCanvasEmbeddedPreviewRequest({ ...request, identity: undefined }),
    ).toThrow();
    expect(() =>
      parseDesktopCanvasEmbeddedPreviewResult(
        {
          ...result,
          descriptor: { ...result.descriptor, url: 'file:///private/output-1.png' },
        },
        'embedded-1',
      ),
    ).toThrow();
  });
});
