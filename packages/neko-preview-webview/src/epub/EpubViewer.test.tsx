// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';
import { EpubViewer, fetchForEpub } from './EpubViewer';

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

    const result = await fetchForEpub('neko-media://desktop/descriptor/book.epub', 'binary');

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual(Array.from(archive));
  });

  it('keeps blob requests as Blob objects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('chapter image', { status: 200 })),
    );

    const result = await fetchForEpub('neko-media://desktop/descriptor/image.png', 'blob');

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
            <EpubViewer sourceUrl="neko-media://desktop/descriptor/book.epub" />
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
