// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { CANVAS_ADD_ACTION_GROUPS } from '../../utils/canvasAddActions';
import { CanvasAddActionPopover } from './CanvasAddActionPopover';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('CanvasAddActionPopover', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
    setLocale('en');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it('defines only valid user add actions', () => {
    expect(
      CANVAS_ADD_ACTION_GROUPS.map((group) => ({
        id: group.id,
        actions: group.actions.map((action) => action.id),
      })),
    ).toEqual([
      { id: 'create', actions: ['markdown', 'group'] },
      { id: 'import', actions: ['image', 'audio', 'video'] },
      { id: 'reference', actions: ['file', 'subcanvas'] },
    ]);
    expect(
      CANVAS_ADD_ACTION_GROUPS.flatMap((group) => group.actions)
        .filter((action) => action.mode === 'direct')
        .map((action) => action.id),
    ).toEqual(['markdown', 'group']);
  });

  it('renders localized actions and closes after selection', () => {
    const onSelectAction = vi.fn();
    setLocale('zh-cn');

    act(() => {
      root.render(<CanvasAddActionPopover onSelectAction={onSelectAction} />);
    });
    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-canvas-toolbar-action="open-add-node-popover"]')
        ?.click();
    });

    const popover = document.body.querySelector('[data-canvas-add-action-popover="true"]');
    expect(popover?.textContent).toContain('创建');
    expect(popover?.textContent).toContain('导入');
    expect(popover?.textContent).toContain('引用');
    expect(popover?.textContent).toContain('Markdown');
    expect(popover?.textContent).toContain('图片');
    expect(popover?.textContent).toContain('子画布');
    expect(popover?.textContent).not.toContain('JobCard');

    act(() => {
      document.body
        .querySelector<HTMLButtonElement>('[data-canvas-add-action="markdown"]')
        ?.click();
    });
    expect(onSelectAction).toHaveBeenCalledWith('markdown');
    expect(document.body.querySelector('[data-canvas-add-action-popover="true"]')).toBeNull();
  });
});
