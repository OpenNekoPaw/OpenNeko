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

  it('projects CommonMark list structure and only marks canonical GFM task items', async () => {
    const source = [
      '- [ ] 待处理',
      '- [x] 已完成',
      '',
      '1. 第一项',
      '2. 第二项',
      '',
      '[-] 非法任务标记',
      '[x] 不是列表项',
    ].join('\n');
    const { serialized, root, destroy } = await roundTrip(source);

    const tasks = root.querySelectorAll('li[data-item-type="task"]');
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.getAttribute('data-checked')).toBe('false');
    expect(tasks[1]?.getAttribute('data-checked')).toBe('true');
    expect(root.querySelectorAll('ol > li')).toHaveLength(2);
    expect(root.querySelector('ol')?.textContent).toContain('第一项');
    expect(root.querySelector('ol')?.textContent).toContain('第二项');
    expect(
      [...root.querySelectorAll('p')].every(
        (paragraph) => !paragraph.hasAttribute('data-item-type'),
      ),
    ).toBe(true);
    expect(root.textContent).toContain('[-] 非法任务标记');
    expect(root.textContent).toContain('[x] 不是列表项');
    expect(assessOpenNekoMarkdownRichRoundTrip(source, serialized)).toEqual({ status: 'ready' });

    await destroy();
  });
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
