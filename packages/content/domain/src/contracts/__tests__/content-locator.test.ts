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

  it('addresses PDF pages and DOCX text ranges without a second locating object', () => {
    const pdf = {
      file: { authority: 'workspace', path: 'books/story.pdf' },
      selector: { kind: 'page', pageNumber: 3, pageIndex: 2 },
    } as const;
    const docx = {
      file: { authority: 'workspace', path: 'notes/story.docx' },
      selector: { kind: 'text-range', startChar: 120, endChar: 240 },
    } as const;

    expect(validateContentLocator(pdf)).toEqual({ ok: true, locator: pdf });
    expect(validateContentLocator(docx)).toEqual({ ok: true, locator: docx });
    expect(contentLocatorKey(pdf)).not.toBe(
      contentLocatorKey({ file: { authority: 'workspace', path: 'books/story.pdf' } }),
    );
  });

  it('rejects ambiguous and unsupported document selectors', () => {
    const source = { file: { authority: 'workspace', path: 'books/story.pdf' } };
    const selectors = [
      { kind: 'page', pageNumber: 3, pageIndex: 3 },
      { kind: 'text-range', startChar: 20, endChar: 10 },
      { kind: 'text-range', startChar: 0, paragraphIndex: 0 },
      { kind: 'chapter', chapterHref: 'chapter-1.xhtml' },
      { kind: 'region', pageNumber: 1 },
      { kind: 'slide', slideNumber: 1, slideIndex: 0 },
    ];

    expect(selectors.map((selector) => validateContentLocator({ ...source, selector }).ok)).toEqual(
      selectors.map(() => false),
    );
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
