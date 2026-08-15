import { describe, expect, it } from 'vitest';

import {
  contentLocatorKey,
  contentLocatorsEqual,
  isProjectDurableContentLocator,
  isWorkspaceMediaLibraryProjectionPath,
  normalizeMediaLibraryContentPath,
  normalizeWorkspaceContentPath,
  parseContentReferenceTarget,
  serializeContentReferenceTarget,
  validateContentLocator,
} from '../content-locator';

describe('content locator contracts', () => {
  it('accepts an owner-qualified Media Library locator', () => {
    expect(
      validateContentLocator({
        kind: 'media-library',
        libraryName: 'Characters',
        relativePath: 'portraits/alice.png',
        fingerprint: { strategy: 'sha256', value: 'alice-content' },
      }),
    ).toMatchObject({ ok: true });
  });

  it('accepts a managed-link Workspace locator as a runtime access projection', () => {
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
    expect(isWorkspaceMediaLibraryProjectionPath('neko/assets/Characters/alice.png')).toBe(true);
    expect(isWorkspaceMediaLibraryProjectionPath('Neko/Assets/Characters/alice.png')).toBe(true);
    expect(isWorkspaceMediaLibraryProjectionPath('media/Characters/alice.png')).toBe(false);
    expect(
      isProjectDurableContentLocator({
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: 'neko/assets/Books/story.epub' },
        entryPath: 'cover.png',
      }),
    ).toBe(false);
    expect(
      isProjectDurableContentLocator({
        kind: 'media-library',
        libraryName: 'Books',
        relativePath: 'story.epub',
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
        kind: 'document-entry',
        source: {
          kind: 'media-library',
          libraryName: 'Books',
          relativePath: 'comics/comic.epub',
        },
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
      kind: 'media-library' as const,
      libraryName: 'Characters',
      relativePath: 'portraits/alice.png',
      fingerprint: { strategy: 'sha256' as const, value: 'alice-content' },
    };
    const reordered = {
      fingerprint: { value: 'alice-content', strategy: 'sha256' as const },
      relativePath: 'portraits/alice.png',
      libraryName: 'Characters',
      kind: 'media-library' as const,
    };
    expect(contentLocatorsEqual(first, reordered)).toBe(true);
    expect(contentLocatorKey(first)).toBe(contentLocatorKey(reordered));
    expect(
      contentLocatorsEqual(first, {
        ...reordered,
        relativePath: 'portraits/alice-edited.png',
      }),
    ).toBe(false);
  });

  it('round-trips portable workspace and Media Library content-reference targets', () => {
    expect(
      parseContentReferenceTarget(
        serializeContentReferenceTarget({
          kind: 'media-library',
          libraryName: '角色 参考',
          relativePath: 'portrait/#1.png',
        }),
      ),
    ).toEqual({
      kind: 'media-library',
      libraryName: '角色 参考',
      relativePath: 'portrait/#1.png',
    });
    expect(parseContentReferenceTarget('notes/story.md')).toEqual({
      kind: 'workspace-file',
      path: 'notes/story.md',
    });
    expect(parseContentReferenceTarget('media-library:Characters')).toBeUndefined();
    expect(
      parseContentReferenceTarget('media-library:Characters/%2e%2e/private.png'),
    ).toBeUndefined();
    expect(
      parseContentReferenceTarget('media-library:Characters/neko/assets/private.png'),
    ).toBeUndefined();
  });

  it('rejects local, legacy, absolute, provider, connection, cache, and runtime values', () => {
    const invalidPaths = [
      '.neko/binding.json',
      'folder/.neko/binding.json',
      'neko/assets/Characters/alice.png',
      '/Users/private/image.png',
      'C:/private/image.png',
      '../private.png',
      'cache:entry',
      '${MEDIA}/image.png',
    ];
    for (const relativePath of invalidPaths) {
      expect(
        validateContentLocator({
          kind: 'media-library',
          libraryName: 'Characters',
          relativePath,
        }).ok,
        relativePath,
      ).toBe(false);
    }

    for (const forbiddenField of ['connectionId', 'provider', 'cachePath', 'runtimeUrl']) {
      expect(
        validateContentLocator({
          kind: 'media-library',
          libraryName: 'Characters',
          relativePath: 'portraits/alice.png',
          [forbiddenField]: 'private',
        }).ok,
        forbiddenField,
      ).toBe(false);
    }
    expect(normalizeMediaLibraryContentPath('portraits/alice.png')).toBe('portraits/alice.png');
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
