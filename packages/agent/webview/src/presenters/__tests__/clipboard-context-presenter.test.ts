import { describe, expect, it } from 'vitest';
import { projectClipboardTextToContextPayload } from '../clipboard-context-presenter';

describe('clipboard-context-presenter', () => {
  it('projects document image reference JSON into an image context payload', () => {
    const payload = projectClipboardTextToContextPayload(
      JSON.stringify({
        kind: 'document-image-reference',
        document: {
          filePath: '/books/a.epub',
          source: { filePath: '/books/a.epub', format: 'epub' },
          contentLocator: {
            kind: 'document-entry',
            source: { kind: 'workspace-file', path: 'books/a.epub' },
            entryPath: 'image/Page_1.jpg',
          },
          locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
        },
        image: {
          index: 0,
          width: 1494,
          height: 2133,
          byteSize: 1024,
          mimeType: 'image/jpeg',
        },
        display: {
          runtimeOnly: true,
          path: '/tmp/page-1.jpg',
        },
      }),
    );

    expect(payload).toEqual({
      type: 'image',
      id: 'document-image:books/a.epub#image/Page_1.jpg:image/Page_1.jpg:chapter:Page_1@1',
      label: 'chapter:Page_1@1',
      summary: 'Document image: Page_1.jpg#chapter:Page_1@1',
      data: {
        kind: 'document-image-reference',
        document: {
          contentLocator: {
            kind: 'document-entry',
            source: { kind: 'workspace-file', path: 'books/a.epub' },
            entryPath: 'image/Page_1.jpg',
          },
          locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
        },
        image: {
          index: 0,
          width: 1494,
          height: 2133,
          byteSize: 1024,
          mimeType: 'image/jpeg',
          contentLocator: {
            kind: 'document-entry',
            source: { kind: 'workspace-file', path: 'books/a.epub' },
            entryPath: 'image/Page_1.jpg',
          },
        },
        navigationData: {
          source: 'epub',
          entryPath: 'image/Page_1.jpg',
        },
      },
    });
  });

  it('requires a stable document image identity', () => {
    const payload = projectClipboardTextToContextPayload(
      JSON.stringify({
        kind: 'document-image-reference',
        document: {
          filePath: '/books/a.epub',
          source: { filePath: '/books/a.epub', format: 'epub' },
        },
        image: {
          index: 0,
          path: '/tmp/page-1.jpg',
          width: 1494,
          height: 2133,
          mimeType: 'image/jpeg',
        },
      }),
    );

    expect(payload).toBeNull();
  });

  it('rejects unknown document image reference fields locally', () => {
    const canonicalReference = {
      kind: 'document-image-reference',
      document: {
        filePath: '/books/a.epub',
        contentLocator: {
          kind: 'document-entry',
          source: { kind: 'workspace-file', path: 'books/a.epub' },
          entryPath: 'image/Page_1.jpg',
        },
      },
      image: { index: 0 },
    };

    expect(
      projectClipboardTextToContextPayload(
        JSON.stringify({ ...canonicalReference, unexpectedField: 2 }),
      ),
    ).toBeNull();
  });

  it('projects media library references from Host-issued content locators', () => {
    const payload = projectClipboardTextToContextPayload(
      JSON.stringify({
        kind: 'media-library-file-reference',
        path: '${REFS}/hero.png',
        resolvedPath: '/mnt/media/hero.png',
        contentLocator: { kind: 'workspace-file', path: 'references/hero.png' },
        name: 'hero.png',
        mediaType: 'image',
        source: { partition: 'media-library', variable: 'REFS' },
      }),
    );

    expect(payload).toEqual({
      type: 'media',
      id: 'media-library-file:references/hero.png',
      label: 'hero.png',
      summary: 'Media: hero.png (image)',
      data: expect.objectContaining({
        kind: 'media-library-file-reference',
        contentLocator: { kind: 'workspace-file', path: 'references/hero.png' },
        source: { partition: 'media-library', variable: 'REFS' },
        navigationData: {
          source: 'media-library',
          partition: 'media-library',
        },
      }),
    });
  });

  it('rejects media library clipboard references without Host-issued identity', () => {
    expect(
      projectClipboardTextToContextPayload(
        JSON.stringify({
          kind: 'media-library-file-reference',
          path: '${REFS}/hero.png',
          resolvedPath: '/mnt/media/hero.png',
          name: 'hero.png',
          mediaType: 'image',
        }),
      ),
    ).toBeNull();
  });

  it('ignores ordinary pasted text', () => {
    expect(projectClipboardTextToContextPayload('hello')).toBeNull();
  });
});
