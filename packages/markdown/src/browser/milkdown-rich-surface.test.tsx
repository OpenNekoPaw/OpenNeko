// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MilkdownRichSurface, type MilkdownRichSurfaceState } from './milkdown-rich-surface';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
});

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
});

describe('MilkdownRichSurface', () => {
  it('mounts once and reconciles caller-owned Markdown source', async () => {
    const states: MilkdownRichSurfaceState[] = [];
    const onChange = vi.fn();
    ({ root, container } = createTestRoot());

    await render('# 第一章\n\n初始内容');
    await vi.waitFor(() => {
      expect(container?.querySelector('.ProseMirror')?.textContent).toContain('初始内容');
      expect(states.at(-1)).toBe('ready');
    });

    await render('## 第二章\n\n更新内容');
    await vi.waitFor(() => {
      expect(container?.querySelector('.ProseMirror')?.textContent).toContain('更新内容');
      expect(container?.querySelector('.ProseMirror')?.textContent).not.toContain('初始内容');
    });
    expect(onChange).not.toHaveBeenCalled();

    async function render(value: string): Promise<void> {
      await act(async () => {
        root?.render(
          <MilkdownRichSurface
            value={value}
            ariaLabel="Canvas Markdown"
            readOnly={false}
            onChange={onChange}
            onStateChange={(state) => states.push(state)}
          />,
        );
      });
    }
  });

  it('keeps source-preserving extensions visible but disables mutation', async () => {
    const states: MilkdownRichSurfaceState[] = [];
    ({ root, container } = createTestRoot());
    await act(async () => {
      root?.render(
        <MilkdownRichSurface
          value="查看 [[script.md#Scene 2]] 和 ![[cover.png]]。"
          ariaLabel="Canvas Markdown"
          readOnly={false}
          onChange={() => undefined}
          onStateChange={(state) => states.push(state)}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(states.at(-1)).toBe('unavailable');
      expect(container?.querySelector('.ProseMirror')?.getAttribute('aria-readonly')).toBe('true');
      expect(container?.textContent).toContain('script.md#Scene 2');
    });
  });
});

function createTestRoot(): { readonly root: Root; readonly container: HTMLDivElement } {
  const nextContainer = document.createElement('div');
  document.body.append(nextContainer);
  return { root: createRoot(nextContainer), container: nextContainer };
}
