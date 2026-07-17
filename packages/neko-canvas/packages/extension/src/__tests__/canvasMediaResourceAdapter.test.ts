import { describe, expect, it } from 'vitest';
import type { StoryboardMediaRef } from '@neko/shared';
import { toCanvasStableMediaResourceRef } from '../canvasMediaResourceAdapter';

function mediaRef(overrides: Partial<StoryboardMediaRef> = {}): StoryboardMediaRef {
  return {
    refId: 'frame-1',
    role: 'generated',
    locator: { type: 'workspace-path', path: 'assets/frames/frame-1.png' },
    mimeType: 'image/png',
    ...overrides,
  };
}

describe('Canvas stable media resource adapter', () => {
  it('converts asset and workspace locators into durable ResourceRefs', () => {
    expect(toCanvasStableMediaResourceRef(mediaRef()).source).toEqual({
      kind: 'file',
      projectRelativePath: 'assets/frames/frame-1.png',
    });
    expect(
      toCanvasStableMediaResourceRef(
        mediaRef({ locator: { type: 'asset', assetId: 'generated-frame', assetVersion: 'v2' } }),
      ),
    ).toEqual(
      expect.objectContaining({
        provider: 'neko-assets',
        source: { kind: 'generated-asset', generatedAssetId: 'generated-frame' },
        locator: { kind: 'generated-asset', assetId: 'generated-frame', variantId: 'v2' },
      }),
    );
  });

  it('preserves an explicitly supplied durable ResourceRef', () => {
    const resourceRef = toCanvasStableMediaResourceRef(mediaRef());
    expect(toCanvasStableMediaResourceRef(mediaRef({ resourceRef }))).toBe(resourceRef);
  });

  it('rejects Canvas nodes, tool results, absolute paths, and cache paths', () => {
    expect(() =>
      toCanvasStableMediaResourceRef(
        mediaRef({ locator: { type: 'canvas-node', canvasNodeId: 'runtime-node-1' } }),
      ),
    ).toThrow(/runtime\/projection locator canvas-node/);
    expect(() =>
      toCanvasStableMediaResourceRef(
        mediaRef({ locator: { type: 'tool-result', toolCallId: 'call-1' } }),
      ),
    ).toThrow(/runtime\/projection locator tool-result/);
    expect(() =>
      toCanvasStableMediaResourceRef(
        mediaRef({ locator: { type: 'workspace-path', path: '/tmp/frame.png' } }),
      ),
    ).toThrow(/project-relative or variable workspace path/);
    expect(() =>
      toCanvasStableMediaResourceRef(
        mediaRef({ locator: { type: 'workspace-path', path: '.neko/cache/frame.png' } }),
      ),
    ).toThrow(/project-relative or variable workspace path/);
  });
});
