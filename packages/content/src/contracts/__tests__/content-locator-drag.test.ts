import { describe, expect, it } from 'vitest';
import {
  CONTENT_LOCATOR_DRAG_MIME,
  createContentLocatorDragData,
  parseContentLocatorDragData,
} from '../content-locator-drag';

describe('ContentLocator drag contract', () => {
  it('carries only a portable locator and display name', () => {
    expect(CONTENT_LOCATOR_DRAG_MIME).toBe('application/x-openneko-content-locator+json');
    expect(
      createContentLocatorDragData({
        locator: {
          kind: 'workspace-file',
          path: 'neko/assets/Reference/cat.png',
        },
        name: 'cat.png',
      }),
    ).toEqual({
      type: 'content-locator',
      locator: {
        kind: 'workspace-file',
        path: 'neko/assets/Reference/cat.png',
      },
      name: 'cat.png',
    });
  });

  it('rejects absolute paths and unknown fields', () => {
    expect(() =>
      parseContentLocatorDragData({
        type: 'content-locator',
        locator: { kind: 'workspace-file', path: '/private/cat.png' },
        name: 'cat.png',
      }),
    ).toThrow('workspace-relative');
    expect(() =>
      parseContentLocatorDragData({
        type: 'content-locator',
        locator: {
          kind: 'workspace-file',
          path: 'media/cat.png',
          absolutePath: '/private/cat.png',
        },
        name: 'cat.png',
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseContentLocatorDragData({
        unexpectedField: 1,
        type: 'content-locator',
        locator: { kind: 'workspace-file', path: 'media/cat.png' },
        name: 'cat.png',
      }),
    ).toThrow('shape or type');
  });
});
