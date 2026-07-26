import { describe, expect, it } from 'vitest';
import type { StoryboardMediaRef } from '@neko/shared';
import { toCanvasStableMediaContentLocator } from '../canvasMediaContentLocator';

function mediaRef(overrides: Partial<StoryboardMediaRef> = {}): StoryboardMediaRef {
  return {
    refId: 'frame-1',
    role: 'generated',
    locator: { type: 'workspace-path', path: 'assets/frames/frame-1.png' },
    contentLocator: { kind: 'workspace-file', path: 'assets/frames/frame-1.png' },
    mimeType: 'image/png',
    ...overrides,
  };
}

describe('Canvas stable media content locator', () => {
  it('returns the explicitly supplied ContentLocator', () => {
    const ref = mediaRef();
    expect(toCanvasStableMediaContentLocator(ref)).toBe(ref.contentLocator);
  });

  it('rejects legacy semantic locators and ResourceRef instead of inferring content identity', () => {
    expect(() =>
      toCanvasStableMediaContentLocator(
        mediaRef({
          contentLocator: undefined,
          resourceRef: {
            id: 'legacy-frame',
            scope: 'project',
            provider: 'workspace',
            kind: 'media',
            source: { kind: 'file', projectRelativePath: 'assets/frames/frame-1.png' },
            fingerprint: { strategy: 'none', value: 'legacy-frame' },
          },
        }),
      ),
    ).toThrow(/storyboard-media-content-locator-migration-required/u);
  });

  it('rejects invalid ContentLocator values', () => {
    expect(() =>
      toCanvasStableMediaContentLocator(
        mediaRef({
          contentLocator: {
            kind: 'workspace-file',
            path: '/tmp/frame.png',
          },
        }),
      ),
    ).toThrow(/storyboard-media-content-locator-migration-required/u);
  });
});
