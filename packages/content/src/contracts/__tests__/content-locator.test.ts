import { describe, expect, it } from 'vitest';

import {
  contentLocatorKey,
  contentLocatorsEqual,
  isProjectDurableContentLocator,
  normalizeWorkspaceContentPath,
  parseContentReferenceTarget,
  serializeContentReferenceTarget,
  validateContentLocator,
} from '../content-locator';

describe('content locator contracts', () => {
  it('rejects the retired Media Library content locator kind', () => {
    expect(
      validateContentLocator({
        kind: 'media-library',
        libraryName: 'Characters',
        relativePath: 'portraits/alice.png',
      }).ok,
    ).toBe(false);
  });

  it('accepts a mounted Media Library file as one durable workspace-relative identity', () => {
    expect(
      validateContentLocator({
        kind: 'workspace-file',
        path: 'neko/assets/Characters/portraits/alice.png',
      }),
    ).toEqual({
      ok: true,
      locator: {
        kind: 'workspace-file',
        path: 'neko/assets/Characters/portraits/alice.png',
      },
    });
    expect(
      isProjectDurableContentLocator({
        kind: 'workspace-file',
        path: 'neko/assets/Characters/portraits/alice.png',
      }),
    ).toBe(true);
    expect(
      isProjectDurableContentLocator({
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: 'neko/assets/Books/story.epub' },
        entryPath: 'cover.png',
      }),
    ).toBe(true);
  });

  it('accepts document, generated output, and package resource locators', () => {
    const values = [
      {
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: 'books/comic.epub' },
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
      path: 'neko/assets/Characters/portraits/alice.png',
      fingerprint: { strategy: 'sha256' as const, value: 'alice-content' },
    };
    const reordered = {
      fingerprint: { value: 'alice-content', strategy: 'sha256' as const },
      path: 'neko/assets/Characters/portraits/alice.png',
      kind: 'workspace-file' as const,
    };
    expect(contentLocatorsEqual(first, reordered)).toBe(true);
    expect(contentLocatorKey(first)).toBe(contentLocatorKey(reordered));
    expect(
      contentLocatorsEqual(first, {
        ...reordered,
        path: 'neko/assets/Characters/portraits/alice-edited.png',
      }),
    ).toBe(false);
  });

  it('round-trips portable workspace content-reference targets', () => {
    expect(parseContentReferenceTarget('neko/assets/Characters/portrait.png')).toEqual({
      kind: 'workspace-file',
      path: 'neko/assets/Characters/portrait.png',
    });
    expect(
      parseContentReferenceTarget(
        serializeContentReferenceTarget({
          kind: 'workspace-file',
          path: 'neko/assets/Characters/portrait.png',
        }),
      ),
    ).toEqual({
      kind: 'workspace-file',
      path: 'neko/assets/Characters/portrait.png',
    });
    expect(parseContentReferenceTarget('notes/story.md')).toEqual({
      kind: 'workspace-file',
      path: 'notes/story.md',
    });
    expect(parseContentReferenceTarget('media-library:Characters')).toBeUndefined();
    expect(parseContentReferenceTarget('../private.png')).toBeUndefined();
    expect(parseContentReferenceTarget('/Users/private.png')).toBeUndefined();
  });

  it('rejects local, legacy, absolute, provider, connection, cache, and runtime values', () => {
    const invalidPaths = [
      '.neko/binding.json',
      'folder/.neko/binding.json',
      '/Users/private/image.png',
      'C:/private/image.png',
      '../private.png',
      'cache:entry',
      '${MEDIA}/image.png',
    ];
    for (const path of invalidPaths) {
      expect(validateContentLocator({ kind: 'workspace-file', path }).ok, path).toBe(false);
    }

    for (const forbiddenField of ['connectionId', 'provider', 'cachePath', 'runtimeUrl']) {
      expect(
        validateContentLocator({
          kind: 'workspace-file',
          path: 'portraits/alice.png',
          [forbiddenField]: 'private',
        }).ok,
        forbiddenField,
      ).toBe(false);
    }
  });

  it('rejects absolute, URI, variable, traversal, and cache/runtime paths', () => {
    const paths = [
      '/Users/private/image.png',
      'C:/private/image.png',
      'file:///private/image.png',
      'https://example.com/image.png',
      '${MEDIA}/image.png',
      'neko/assets/../private.png',
      '.runtime/resources/image.png',
      'neko-media://panel/image.png',
    ];

    for (const path of paths) {
      const result = validateContentLocator({ kind: 'workspace-file', path });
      expect(result.ok, path).toBe(false);
    }
  });

  it('normalizes separators but requires persisted locators to already be canonical', () => {
    expect(normalizeWorkspaceContentPath('books\\comic.epub')).toBe('books/comic.epub');
    expect(validateContentLocator({ kind: 'workspace-file', path: 'books\\comic.epub' }).ok).toBe(
      false,
    );
  });

  it('rejects unsafe archive and package entry paths', () => {
    expect(
      validateContentLocator({
        kind: 'document-entry',
        source: {
          kind: 'document-entry',
          source: { kind: 'workspace-file', path: 'books/comic.epub' },
          entryPath: 'nested.cbz',
        },
        entryPath: 'outside.jpg',
      }).ok,
    ).toBe(false);
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
