import { describe, expect, it } from 'vitest';

import {
  contentLocatorKey,
  contentLocatorsEqual,
  createContentEntryLocator,
  createWorkspaceFileContentLocator,
  isProjectDurableContentLocator,
  normalizeWorkspaceContentPath,
  parseContentReferenceTarget,
  serializeContentReferenceTarget,
  validateContentLocator,
} from '../content-locator';

describe('content locator contracts', () => {
  it('addresses a Workspace file with one file authority and no owner lifecycle', () => {
    const locator = {
      file: { authority: 'workspace', path: 'neko/assets/Characters/portraits/alice.png' },
    } as const;
    expect(validateContentLocator(locator)).toEqual({ ok: true, locator });
    expect(isProjectDurableContentLocator(locator)).toBe(true);
  });

  it('addresses a file-internal entry with one selector', () => {
    const source = createWorkspaceFileContentLocator('books/story.epub');
    const locator = createContentEntryLocator(source, 'images/cover.png');
    expect(locator).toEqual({
      file: { authority: 'workspace', path: 'books/story.epub' },
      selector: { kind: 'entry', path: 'images/cover.png' },
    });
    expect(isProjectDurableContentLocator(locator)).toBe(true);
  });

  it('addresses an exact package file without manifest or digest metadata', () => {
    const locator = {
      file: {
        authority: 'package',
        packageId: 'live2d-alice',
        revision: 'release-one',
        path: 'textures/texture_00.png',
      },
    } as const;
    expect(validateContentLocator(locator)).toEqual({ ok: true, locator });
  });

  it('compares only file authority, path and selector', () => {
    const first = {
      file: { authority: 'workspace' as const, path: 'books/story.epub' },
      selector: { kind: 'entry' as const, path: 'images/cover.png' },
    };
    const reordered = {
      selector: { path: 'images/cover.png', kind: 'entry' as const },
      file: { path: 'books/story.epub', authority: 'workspace' as const },
    };
    expect(contentLocatorsEqual(first, reordered)).toBe(true);
    expect(contentLocatorKey(first)).toBe(contentLocatorKey(reordered));
    expect(
      contentLocatorsEqual(first, {
        ...reordered,
        selector: { kind: 'entry', path: 'images/page-1.png' },
      }),
    ).toBe(false);
  });

  it('round-trips portable Workspace content-reference targets', () => {
    const locator = createWorkspaceFileContentLocator('notes/story.md');
    expect(parseContentReferenceTarget(serializeContentReferenceTarget(locator))).toEqual(locator);
    expect(parseContentReferenceTarget('media-library:Characters')).toBeUndefined();
    expect(parseContentReferenceTarget('../private.png')).toBeUndefined();
    expect(parseContentReferenceTarget('/Users/private.png')).toBeUndefined();
  });

  it('rejects absolute, URI, variable, traversal and hidden runtime paths', () => {
    const paths = [
      '/Users/private/image.png',
      'C:/private/image.png',
      'file:///private/image.png',
      'https://example.com/image.png',
      '${MEDIA}/image.png',
      'neko/assets/../private.png',
      '.runtime/resources/image.png',
    ];
    for (const path of paths) {
      expect(validateContentLocator({ file: { authority: 'workspace', path } }).ok, path).toBe(
        false,
      );
    }
  });

  it('normalizes separators but requires persisted paths to already be canonical', () => {
    expect(normalizeWorkspaceContentPath('books\\comic.epub')).toBe('books/comic.epub');
    expect(
      validateContentLocator({ file: { authority: 'workspace', path: 'books\\comic.epub' } }).ok,
    ).toBe(false);
  });

  it('rejects unsafe entry and package member paths', () => {
    expect(
      validateContentLocator({
        file: { authority: 'workspace', path: 'books/comic.epub' },
        selector: { kind: 'entry', path: '../outside.jpg' },
      }).ok,
    ).toBe(false);
    expect(
      validateContentLocator({
        file: {
          authority: 'package',
          packageId: 'pkg',
          revision: 'release-one',
          path: '/absolute.bin',
        },
      }).ok,
    ).toBe(false);
  });

  it('poisons replaced lifecycle, freshness and representation locator shapes', () => {
    const replaced = [
      { kind: 'workspace-file', path: 'notes/story.md' },
      {
        file: { authority: 'workspace', path: 'notes/story.md' },
        fingerprint: { strategy: 'sha256', value: 'content' },
      },
      {
        kind: 'generated-output',
        outputId: 'output-1',
        digest: 'sha256:content',
        path: 'neko/generated/image/output-1.png',
      },
      {
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: 'books/story.epub' },
        entryPath: 'images/cover.png',
      },
      {
        kind: 'content-representation',
        id: 'representation-1',
        source: { kind: 'workspace-file', path: 'books/story.pdf' },
      },
    ];
    expect(replaced.map((value) => validateContentLocator(value).ok)).toEqual(
      replaced.map(() => false),
    );
  });
});
