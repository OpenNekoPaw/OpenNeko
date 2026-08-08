// @vitest-environment jsdom

import { defaultValueCtx, editorViewCtx, Editor, rootCtx, serializerCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { assessOpenNekoMarkdownRichRoundTrip } from '@neko/markdown';
import { OPENNEKO_GFM_CONFORMANCE_CASES } from '@neko/markdown/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
});

afterEach(() => document.body.replaceChildren());

describe('Milkdown 7.22.0 GFM spike', () => {
  for (const fixture of OPENNEKO_GFM_CONFORMANCE_CASES) {
    it(`round-trips shared corpus: ${fixture.id}`, async () => {
      const { serialized, root, destroy } = await roundTrip(fixture.source);
      const assessment = assessOpenNekoMarkdownRichRoundTrip(fixture.source, serialized);
      if (fixture.id === 'openneko-source-backed-extensions') {
        expect(assessment).toMatchObject({
          status: 'unavailable',
          reason: 'source-preserving-adapter-required',
        });
      } else {
        expect(assessment).toEqual({ status: 'ready' });
      }
      expect(root.querySelector('script')).toBeNull();
      await destroy();
    });
  }
});

async function roundTrip(source: string): Promise<{
  readonly serialized: string;
  readonly root: HTMLElement;
  readonly destroy: () => Promise<void>;
}> {
  const root = document.createElement('div');
  document.body.append(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, source);
    })
    .use(commonmark)
    .use(gfm)
    .create();
  return {
    root,
    serialized: editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc)),
    destroy: async () => {
      await editor.destroy();
      root.remove();
    },
  };
}
