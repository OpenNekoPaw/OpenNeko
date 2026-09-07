// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MilkdownRichSurface,
  type MilkdownRichSurfaceActions,
  type MilkdownRichSurfaceSelectionActions,
  type MilkdownRichSurfaceState,
} from './milkdown-rich-surface';

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
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect(),
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

  it.each([
    {
      label: 'editable',
      source: '# 可编辑标题\n\n可编辑正文',
      expectedState: 'ready' as const,
      expectedText: '可编辑正文',
      readOnly: 'false',
    },
    {
      label: 'source-preserving read-only',
      source: '查看 [[script.md#Scene 2]] 和 ![[cover.png]]。',
      expectedState: 'unavailable' as const,
      expectedText: 'script.md#Scene 2',
      readOnly: 'true',
    },
  ])('selects and copies all Rich text while $label', async (fixture) => {
    let selectionActions: MilkdownRichSurfaceSelectionActions | undefined;
    const states: MilkdownRichSurfaceState[] = [];
    ({ root, container } = createTestRoot());
    await act(async () => {
      root?.render(
        <MilkdownRichSurface
          value={fixture.source}
          ariaLabel="Selectable Markdown"
          readOnly={false}
          onChange={() => undefined}
          onSelectionActions={(actions) => {
            selectionActions = actions;
          }}
          onStateChange={(state) => states.push(state)}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(states.at(-1)).toBe(fixture.expectedState);
      expect(selectionActions).toBeDefined();
    });
    const rich = container?.querySelector<HTMLElement>('.ProseMirror');
    expect(rich?.getAttribute('aria-readonly')).toBe(fixture.readOnly);
    expect(rich?.tabIndex).toBe(0);

    await act(async () => {
      expect(selectionActions?.selectAll()).toBe(true);
    });
    const copied = dispatchCopy(rich ?? undefined);
    expect(copied.get('text/plain')).toContain(fixture.expectedText);
    expect(copied.get('text/html')).toBeTruthy();
  });

  it('reveals the exact first, middle and last heading', async () => {
    let actions: MilkdownRichSurfaceActions | undefined;
    ({ root, container } = createTestRoot());
    await act(async () => {
      root?.render(
        <MilkdownRichSurface
          value={'# First\n\nBody\n\n## Middle\n\nBody\n\n### Last\n\nBody'}
          ariaLabel="Canvas Markdown"
          readOnly={false}
          onChange={() => undefined}
          onActions={(nextActions) => {
            actions = nextActions;
          }}
          onStateChange={() => undefined}
        />,
      );
    });

    await vi.waitFor(() => expect(actions).toBeDefined());
    for (const [headingIndex, label] of ['First', 'Middle', 'Last'].entries()) {
      await act(async () => {
        expect(actions?.revealHeading(headingIndex)).toBe(true);
      });
      await vi.waitFor(() => expect(selectedHeadingText()).toBe(label));
    }
    expect(actions?.revealHeading(3)).toBe(false);
  });

  it('keeps wide GFM tables inside the package-owned presentation wrapper', async () => {
    ({ root, container } = createTestRoot());
    await act(async () => {
      root?.render(
        <MilkdownRichSurface
          value={
            '| A | B | C | D | E | F | G |\n| - | - | - | - | - | - | - |\n| 1 | 2 | 3 | 4 | 5 | 6 | 7 |'
          }
          ariaLabel="Wide Markdown table"
          readOnly={false}
          onChange={() => undefined}
        />,
      );
    });

    await vi.waitFor(() => {
      const wrapper = container?.querySelector<HTMLElement>('[data-markdown-table-scroll="true"]');
      const table = wrapper?.querySelector<HTMLTableElement>('table');
      expect(wrapper?.dataset['markdownTableColumns']).toBe('7');
      expect(table?.getAttribute('style')).toBeNull();
      expect(table?.querySelectorAll('th')).toHaveLength(7);
      expect(table?.querySelectorAll('td')).toHaveLength(7);
    });
  });

  it('rejects a second table NodeView owner', async () => {
    const states: [MilkdownRichSurfaceState, string | undefined][] = [];
    ({ root, container } = createTestRoot());
    await act(async () => {
      root?.render(
        <MilkdownRichSurface
          value={'| A |\n| - |\n| 1 |'}
          ariaLabel="Canonical table owner"
          readOnly={false}
          onChange={() => undefined}
          createExtensions={() => ({
            nodeViews: [
              [
                'table',
                () => {
                  const dom = document.createElement('table');
                  return { dom };
                },
              ],
            ],
          })}
          onStateChange={(state, failure) => states.push([state, failure])}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(states.at(-1)).toEqual([
        'error',
        'Markdown table presentation is owned by the Rich Surface.',
      ]);
      expect(container?.querySelector('[data-markdown-table-scroll]')).toBeNull();
    });
  });
});

function selectedHeadingText(): string | undefined {
  const anchorNode = window.getSelection()?.anchorNode;
  const anchorElement =
    anchorNode instanceof Element ? anchorNode : (anchorNode?.parentElement ?? undefined);
  return anchorElement?.closest('h1, h2, h3, h4, h5, h6')?.textContent ?? undefined;
}

function dispatchCopy(target: HTMLElement | undefined): ReadonlyMap<string, string> {
  if (!target) throw new Error('Rich Surface copy fixture requires ProseMirror.');
  const copied = new Map<string, string>();
  const event = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      clearData: () => copied.clear(),
      setData: (format: string, value: string) => copied.set(format, value),
    },
  });
  target.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  return copied;
}

function rect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    top: 0,
    right: 100,
    bottom: 20,
    left: 0,
    toJSON: () => ({}),
  };
}

function createTestRoot(): { readonly root: Root; readonly container: HTMLDivElement } {
  const nextContainer = document.createElement('div');
  document.body.append(nextContainer);
  return { root: createRoot(nextContainer), container: nextContainer };
}
