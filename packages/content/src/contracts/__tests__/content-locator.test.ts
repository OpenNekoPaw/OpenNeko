import { describe, expect, it } from 'vitest';

import {
  contentLocatorKey,
  contentLocatorsEqual,
  normalizeWorkspaceContentPath,
  validateContentLocator,
} from '../content-locator';

describe('content locator contracts', () => {
  it('accepts workspace files and linked media as one locator kind', () => {
    expect(
      validateContentLocator({
        kind: 'workspace-file',
        path: 'neko/assets/Characters/alice.png',
        fingerprint: { strategy: 'sha256', value: 'alice-content' },
      }),
    ).toMatchObject({ ok: true });
  });

  it('accepts document, generated output, and package resource locators', () => {
    const values = [
      {
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: 'neko/assets/Books/comic.epub' },
        entryPath: 'OPS/images/page-1.jpg',
      },
      {
        kind: 'generated-output',
        outputId: 'output-1',
        digest: 'sha256:generated-content',
        path: 'neko/generated/image/output-1.png',
      },
      {
        kind: 'package-resource',
        packageId: 'live2d-alice',
        revision: 'release-one',
        resourcePath: 'textures/texture_00.png',
        manifestPath: 'neko/packages/live2d-alice/manifest.json',
      },
    ];

    expect(values.map(validateContentLocator)).toEqual(
      values.map((locator) => ({ ok: true, locator })),
    );
  });

  it('compares canonical locators without depending on object property order', () => {
    const first = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Characters/alice.png',
      fingerprint: { strategy: 'sha256' as const, value: 'alice-content' },
    };
    const reordered = {
      fingerprint: { value: 'alice-content', strategy: 'sha256' as const },
      path: 'neko/assets/Characters/alice.png',
      kind: 'workspace-file' as const,
    };
    expect(contentLocatorsEqual(first, reordered)).toBe(true);
    expect(contentLocatorKey(first)).toBe(contentLocatorKey(reordered));
    expect(
      contentLocatorsEqual(first, {
        ...reordered,
        path: 'neko/assets/Characters/alice-edited.png',
      }),
    ).toBe(false);
  });

  it('rejects absolute, URI, variable, traversal, and cache/runtime paths', () => {
    const paths = [
      '/Users/private/image.png',
      'C:/private/image.png',
      'file:///private/image.png',
      'https://example.com/image.png',
      '${MEDIA}/image.png',
      'neko/assets/../private.png',
      '.neko/.cache/resources/image.png',
      'neko-media://panel/image.png',
    ];

    for (const path of paths) {
      const result = validateContentLocator({ kind: 'workspace-file', path });
      expect(result.ok, path).toBe(false);
    }
  });

  it('normalizes separators but requires persisted locators to already be canonical', () => {
    expect(normalizeWorkspaceContentPath('neko\\assets\\Books\\comic.epub')).toBe(
      'neko/assets/Books/comic.epub',
    );
    expect(
      validateContentLocator({ kind: 'workspace-file', path: 'neko\\assets\\Books\\comic.epub' })
        .ok,
    ).toBe(false);
  });

  it('rejects unsafe archive and package entry paths', () => {
    expect(
      validateContentLocator({
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: 'books/comic.epub' },
        entryPath: '../outside.jpg',
      }).ok,
    ).toBe(false);
    expect(
      validateContentLocator({
        kind: 'package-resource',
        packageId: 'pkg',
        revision: 'release-one',
        resourcePath: '/absolute.bin',
      }).ok,
    ).toBe(false);
  });
});
