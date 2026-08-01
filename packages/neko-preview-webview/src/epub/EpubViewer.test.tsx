// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';
import {
  EpubViewer,
  fetchForEpub,
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

  it('returns an ArrayBuffer for epub.js binary archive requests', async () => {
    const archive = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(archive, { status: 200 })),
    );

    const result = await fetchForEpub('http://127.0.0.1:43125/v1/resources/book', 'binary');

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual(Array.from(archive));
  });

  it('keeps blob requests as Blob objects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('chapter image', { status: 200 })),
    );

    const result = await fetchForEpub('http://127.0.0.1:43125/v1/resources/image', 'blob');

    expect(result).toBeInstanceOf(Blob);
  });

  it('opens an archived EPUB supplied through the embeddable source URL', async () => {
    const archive = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../../scripts/agent-eval/shared-fixtures/document-image-workspace/synthetic-document.epub',
      ),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(archive, { status: 200 })),
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
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
            <EpubViewer sourceUrl="http://127.0.0.1:43125/v1/resources/book" />
          </I18nProvider>,
        );
      });
      await vi.waitFor(() => expect(container.textContent).toContain('Page'), {
        timeout: 5_000,
      });
      expect(container.textContent).not.toContain('Error:');
    } finally {
      await act(async () => root.unmount());
    }
  });
});

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
