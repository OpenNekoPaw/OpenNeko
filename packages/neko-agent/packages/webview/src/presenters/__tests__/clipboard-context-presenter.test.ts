import { describe, expect, it } from 'vitest';
import { projectClipboardTextToContextPayload } from '../clipboard-context-presenter';

describe('clipboard-context-presenter', () => {
  it('projects document image reference JSON into an image context payload', () => {
    const payload = projectClipboardTextToContextPayload(
      JSON.stringify({
        kind: 'document-image-reference',
        protocolVersion: 2,
        document: {
          filePath: '/books/a.epub',
          source: { filePath: '/books/a.epub', format: 'epub' },
          locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/books/a.epub', format: 'epub' },
            entryPath: 'image/Page_1.jpg',
            versionPolicy: 'versioned-export',
          },
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
          renderUri: 'vscode-webview://page-1.jpg',
        },
      }),
    );

    expect(payload).toEqual({
      type: 'image',
      id: 'document-image:/books/a.epub:image/Page_1.jpg:chapter:Page_1@1',
      label: 'chapter:Page_1@1',
      summary: 'Document image: a.epub#chapter:Page_1@1',
      data: {
        kind: 'document-image-reference',
        document: {
          filePath: '/books/a.epub',
          source: { filePath: '/books/a.epub', format: 'epub' },
          locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/books/a.epub', format: 'epub' },
            entryPath: 'image/Page_1.jpg',
            versionPolicy: 'versioned-export',
          },
        },
        image: {
          index: 0,
          width: 1494,
          height: 2133,
          byteSize: 1024,
          mimeType: 'image/jpeg',
          resourceRef: {
            kind: 'document-entry',
            source: { filePath: '/books/a.epub', format: 'epub' },
            entryPath: 'image/Page_1.jpg',
            versionPolicy: 'versioned-export',
          },
        },
        navigationData: {
          source: 'epub',
          filePath: '/books/a.epub',
          entryPath: 'image/Page_1.jpg',
        },
      },
    });
  });

  it('rejects document image display paths without stable resource refs', () => {
    const payload = projectClipboardTextToContextPayload(
      JSON.stringify({
        kind: 'document-image-reference',
        protocolVersion: 2,
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

  it('projects media library reference JSON while preserving portable paths', () => {
    const payload = projectClipboardTextToContextPayload(
      JSON.stringify({
        kind: 'media-library-file-reference',
        path: '${REFS}/hero.png',
        resolvedPath: '/mnt/media/hero.png',
        name: 'hero.png',
        mediaType: 'image',
        source: { partition: 'media-library', variable: 'REFS' },
      }),
    );

    expect(payload).toEqual({
      type: 'media',
      id: 'media-library-file:${REFS}/hero.png:/mnt/media/hero.png',
      label: 'hero.png',
      summary: 'Media: hero.png (image)',
      data: expect.objectContaining({
        kind: 'media-library-file-reference',
        path: '${REFS}/hero.png',
        resolvedPath: '/mnt/media/hero.png',
        source: { partition: 'media-library', variable: 'REFS' },
        navigationData: {
          source: 'media-library',
          partition: 'media-library',
          portablePath: '${REFS}/hero.png',
          filePath: '/mnt/media/hero.png',
        },
      }),
    });
  });

  it('rejects legacy Asset reference clipboard payloads', () => {
    const payload = projectClipboardTextToContextPayload(
      JSON.stringify({
        kind: 'asset-reference',
        assetId: 'asset-1',
        label: 'Hero portrait',
        path: '${ASSETS}/hero.png',
        resolvedPath: '/workspace/assets/hero.png',
        mediaType: 'image',
      }),
    );

    expect(payload).toBeNull();
  });

  it('ignores ordinary pasted text', () => {
    expect(projectClipboardTextToContextPayload('hello')).toBeNull();
  });
});
