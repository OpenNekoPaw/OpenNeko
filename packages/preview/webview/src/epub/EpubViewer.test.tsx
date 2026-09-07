// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';
import { PersistedStateProvider } from '../shared/usePersistedState';
import {
  EPUB_PAGINATED_THEME,
  EpubViewer,
  applyEpubImageLayout,
  fetchForEpub,
  getChapterNeighborhood,
  waitForEpubImage,
  waitForEpubResourceReadiness,
} from './EpubViewer';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  vi.unstubAllGlobals();
});

describe('fetchForEpub', () => {
  it('installs the NodeList map compatibility required by the embedded viewer', () => {
    expect(typeof Reflect.get(NodeList.prototype, 'map')).toBe('function');
  });

  it('returns an ArrayBuffer only for an exact binary entry request', async () => {
    const binaryEntry = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(binaryEntry, { status: 200 })),
    );

    const result = await fetchForEpub(
      'openneko://resource/0123456789abcdefghijklmnopqrstuv/OEBPS/font.woff2',
      'binary',
    );

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual(Array.from(binaryEntry));
  });

  it('keeps blob requests as Blob objects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('chapter image', { status: 200 })),
    );

    const result = await fetchForEpub('http://127.0.0.1:43125/resources/image', 'blob');

    expect(result).toBeInstanceOf(Blob);
  });

  it('opens a virtual-directory EPUB without requesting an unrelated distant asset', async () => {
    const archive = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../../../scripts/fixtures/documents/synthetic-document.epub',
      ),
    );
    const entries = await readArchiveEntries(archive);
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const packageDocument = decoder.decode(entries.get('OEBPS/content.opf'));
    entries.set(
      'OEBPS/content.opf',
      encoder.encode(
        packageDocument
          .replace(
            '</manifest>',
            '<item id="chapter-2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/>' +
              '<item id="chapter-3" href="chapter-3.xhtml" media-type="application/xhtml+xml"/>' +
              '<item id="chapter-4" href="chapter-4.xhtml" media-type="application/xhtml+xml"/>' +
              '</manifest>',
          )
          .replace(
            '</spine>',
            '<itemref idref="chapter-2"/><itemref idref="chapter-3"/>' +
              '<itemref idref="chapter-4"/></spine>',
          ),
      ),
    );
    for (const chapter of [2, 3, 4]) {
      entries.set(
        `OEBPS/chapter-${chapter}.xhtml`,
        encoder.encode(`<html xmlns="http://www.w3.org/1999/xhtml"><body>${chapter}</body></html>`),
      );
    }
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const entryPath = decodeURIComponent(url.pathname).replace(/^\/resources\/book\//u, '');
      requests.push(entryPath);
      if (entryPath === 'OEBPS/chapter-4.xhtml') {
        return new Response('poisoned distant chapter', { status: 500 });
      }
      const bytes = entries.get(entryPath);
      if (!bytes) return new Response('missing', { status: 404 });
      const body = new Uint8Array(bytes.byteLength);
      body.set(bytes);
      return new Response(body.buffer);
    });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        private observed = 0;

        constructor(private readonly callback: IntersectionObserverCallback) {}

        observe(target: Element): void {
          this.observed += 1;
          if (this.observed === 1) {
            this.callback(
              [{ target, isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
          }
        }
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <I18nProvider service={i18nService}>
            <PersistedStateProvider>
              <EpubViewer sourceUrl="http://127.0.0.1:43125/resources/book/" />
            </PersistedStateProvider>
          </I18nProvider>,
        );
      });
      await vi.waitFor(() => expect(container.textContent).toContain('Page'), {
        timeout: 5_000,
      });
      await vi.waitFor(() => expect(requests).toContain('OEBPS/page.xhtml'), {
        timeout: 5_000,
      });
      expect(container.textContent).not.toContain('Error:');

      const liveChapter = container.querySelector<HTMLElement>(
        '[data-spine-index].epub-chapter-content',
      );
      expect(liveChapter).not.toBeNull();
      expect(liveChapter?.style.marginInline).toBe('auto');
      const toolbar = container.querySelector<HTMLElement>('.epub-viewer__toolbar');
      expect(toolbar?.tagName).toBe('HEADER');
      expect(toolbar?.getAttribute('aria-label')).toBe('Book navigation');
      expect(toolbar?.querySelector('.epub-viewer__chapter-navigation')).not.toBeNull();
      expect(
        toolbar?.querySelector<HTMLButtonElement>('[aria-label="Previous chapter"]')?.type,
      ).toBe('button');
      expect(toolbar?.querySelector<HTMLButtonElement>('[aria-label="Next chapter"]')?.type).toBe(
        'button',
      );
      expect(toolbar?.querySelector('.epub-viewer__mode-button')).not.toBeNull();
      expect(requests).toContain('META-INF/container.xml');
      expect(requests).toContain('OEBPS/content.opf');
      expect(requests).toContain('OEBPS/page.xhtml');
      expect(requests).not.toContain('OEBPS/chapter-4.xhtml');
    } finally {
      await act(async () => root.unmount());
    }
  }, 15_000);
});

async function readArchiveEntries(archive: Uint8Array): Promise<Map<string, Uint8Array>> {
  const reader = new ZipReader(new Uint8ArrayReader(archive), { useWebWorkers: false });
  const entries = new Map<string, Uint8Array>();
  try {
    for (const entry of await reader.getEntries()) {
      if (!entry.directory)
        entries.set(entry.filename, await entry.getData(new Uint8ArrayWriter()));
    }
    return entries;
  } finally {
    await reader.close();
  }
}

describe('EPUB archive resource readiness', () => {
  it('does not advance before epub.js finishes opening archive resources', async () => {
    let resolveOpened: (() => void) | undefined;
    const opened = new Promise<void>((resolveOpenedPromise) => {
      resolveOpened = resolveOpenedPromise;
    });
    const listeners = new Set<(error: unknown) => void>();
    const readiness = {
      opened,
      on: (_event: 'openFailed', listener: (error: unknown) => void) => {
        listeners.add(listener);
      },
      off: (_event: 'openFailed', listener: (error: unknown) => void) => {
        listeners.delete(listener);
      },
    };
    let ready = false;
    const pending = waitForEpubResourceReadiness(readiness).then(() => {
      ready = true;
    });

    await Promise.resolve();
    expect(ready).toBe(false);
    expect(listeners.size).toBe(1);

    resolveOpened?.();
    await pending;

    expect(ready).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('rejects when epub.js reports an archive open failure', async () => {
    const opened = new Promise<void>(() => undefined);
    let openFailed: ((error: unknown) => void) | undefined;
    const readiness = {
      opened,
      on: (_event: 'openFailed', listener: (error: unknown) => void) => {
        openFailed = listener;
      },
      off: () => {
        openFailed = undefined;
      },
    };
    const pending = waitForEpubResourceReadiness(readiness);

    openFailed?.(new Error('archive resources unavailable'));

    await expect(pending).rejects.toThrow('archive resources unavailable');
    expect(openFailed).toBeUndefined();
  });
});

describe('EPUB paginated image layout', () => {
  it('centers image-bearing SVG page canvases without overflowing the content area', () => {
    expect(EPUB_PAGINATED_THEME['svg:has(image)']).toEqual({
      'max-width': '100% !important',
      height: 'auto !important',
      display: 'block !important',
      margin: '0 auto !important',
    });
  });
});

describe('EPUB waterfall image layout', () => {
  it('normalizes raster and SVG image pages through the live chapter DOM path', () => {
    const chapter = document.createElement('article');
    chapter.innerHTML = '<img src="page.png"><svg><image href="page.png"></image></svg>';

    applyEpubImageLayout(chapter);

    for (const page of chapter.querySelectorAll<HTMLElement | SVGSVGElement>(
      'img, svg:has(image)',
    )) {
      expect(page.style.maxWidth).toBe('100%');
      expect(page.style.height).toBe('auto');
      expect(page.style.display).toBe('block');
      expect(page.style.margin).toBe('0px auto');
      expect(page.style.getPropertyPriority('margin')).toBe('important');
    }
  });
});

describe('EPUB waterfall progressive rendering', () => {
  it('selects only the target chapter and its bounded neighbors', () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({ index }));

    expect(getChapterNeighborhood(entries, 5, 2).map((entry) => entry.index)).toEqual([
      5, 4, 6, 3, 7,
    ]);
    expect(getChapterNeighborhood(entries, 0, 2).map((entry) => entry.index)).toEqual([0, 1, 2]);
    expect(getChapterNeighborhood(entries, 20, 2)).toEqual([]);
  });

  it('keeps one waterfall chapter render path without hidden full-spine measurement', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'EpubViewer.tsx'), 'utf8');

    expect(source.match(/await entry\.section\.render\(/g)).toHaveLength(1);
    expect(source).not.toContain('measureContainerRef');
    expect(source).not.toContain('measurementQueueRef');
    expect(source).not.toContain('warmChapterHeights');
    expect(source).toContain('className="epub-viewer__error" role="alert"');
    expect(source).toContain("t('preview.document.previewUnavailable')");
  });
});

describe('EPUB chapter image settlement', () => {
  it('accepts an already decoded image', async () => {
    const image = document.createElement('img');
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 640 },
    });

    await expect(waitForEpubImage(image)).resolves.toBeUndefined();
  });

  it('rejects an already completed image without decoded dimensions', async () => {
    const image = document.createElement('img');
    image.src = 'blob:broken-cover';
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 0 },
    });

    await expect(waitForEpubImage(image)).rejects.toThrow(
      'EPUB image failed to load: blob:broken-cover',
    );
  });

  it('distinguishes pending image load and error events', async () => {
    const loadedImage = document.createElement('img');
    const failedImage = document.createElement('img');
    failedImage.src = 'blob:broken-page';
    Object.defineProperty(loadedImage, 'complete', { configurable: true, value: false });
    Object.defineProperty(failedImage, 'complete', { configurable: true, value: false });
    const loaded = waitForEpubImage(loadedImage);
    const failed = waitForEpubImage(failedImage);

    loadedImage.dispatchEvent(new Event('load'));
    failedImage.dispatchEvent(new Event('error'));

    await expect(loaded).resolves.toBeUndefined();
    await expect(failed).rejects.toThrow('EPUB image failed to load: blob:broken-page');
  });
});
