// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { CANVAS_ADD_ACTIONS } from '../../utils/canvasAddActions';
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
    expect(CANVAS_ADD_ACTIONS.map((action) => action.id)).toEqual([
      'text',
      'table',
      'image',
      'video',
      'audio',
      'director3d',
    ]);
    expect(
      CANVAS_ADD_ACTIONS.filter((action) => action.mode === 'direct').map(({ id }) => id),
    ).toEqual(['table']);
    expect(
      CANVAS_ADD_ACTIONS.filter((action) => action.mode === 'generation').map(({ id }) => id),
    ).toEqual(['text', 'image', 'video', 'audio']);
    expect(CANVAS_ADD_ACTIONS.find(({ id }) => id === 'director3d')).toMatchObject({
      nodeType: 'file',
      mode: 'source',
      sourceKind: 'model',
    });
  });

  it('renders localized actions and closes after selection', () => {
    const onSelectAction = vi.fn();
    setLocale('zh-cn');

    act(() => {
      root.render(
        <CanvasAddActionPopover
          onSelectAction={onSelectAction}
          availableSourceModes={['import', 'reference']}
          availableGenerationKinds={['prompt', 'image', 'video', 'audio']}
        />,
      );
    });
    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-canvas-toolbar-action="open-add-node-popover"]')
        ?.click();
    });

    const popover = document.body.querySelector('[data-canvas-add-action-popover="true"]');
    expect(popover?.textContent).toContain('添加节点');
    expect(popover?.textContent).toContain('文本');
    expect(popover?.textContent).toContain('表格');
    expect(popover?.textContent).toContain('结构化的行列数据');
    expect(popover?.textContent).toContain('图片');
    expect(popover?.textContent).toContain('视频');
    expect(popover?.textContent).toContain('音频');
    expect(popover?.textContent).toContain('3D 导演台');
    expect(popover?.textContent).toContain('新');
    expect(popover?.textContent).not.toContain('JobCard');

    act(() => {
      document.body.querySelector<HTMLButtonElement>('[data-canvas-add-action="table"]')?.click();
    });
    expect(onSelectAction).toHaveBeenCalledWith('table');
    expect(document.body.querySelector('[data-canvas-add-action-popover="true"]')).toBeNull();
  });

  it('creates Generation Nodes directly while 3D Director requires an explicit source mode', () => {
    const onSelectAction = vi.fn();

    act(() => {
      root.render(
        <CanvasAddActionPopover
          onSelectAction={onSelectAction}
          availableSourceModes={['import', 'reference']}
          availableGenerationKinds={['prompt', 'image', 'video', 'audio']}
        />,
      );
    });
    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-canvas-toolbar-action="open-add-node-popover"]')
        ?.click();
    });
    act(() => {
      document.body.querySelector<HTMLButtonElement>('[data-canvas-add-action="image"]')?.click();
    });

    expect(onSelectAction).toHaveBeenCalledWith('image');
    expect(document.body.querySelector('[data-canvas-add-action-popover="true"]')).toBeNull();

    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-canvas-toolbar-action="open-add-node-popover"]')
        ?.click();
    });
    act(() => {
      document.body
        .querySelector<HTMLButtonElement>('[data-canvas-add-action="director3d"]')
        ?.click();
    });
    const sourcePopover = document.body.querySelector('[data-canvas-add-action-popover="true"]');
    expect(sourcePopover?.textContent).not.toContain('Create with AI');
    expect(sourcePopover?.textContent).toContain('Import file');
    expect(sourcePopover?.textContent).toContain('Reference project content');
    act(() => {
      document.body
        .querySelector<HTMLButtonElement>('[data-canvas-add-source-mode="reference"]')
        ?.click();
    });
    expect(onSelectAction).toHaveBeenCalledWith('director3d', 'reference');
    expect(document.body.querySelector('[data-canvas-add-action-popover="true"]')).toBeNull();
  });

  it('omits Generation and source actions when their owners are unavailable', () => {
    const onSelectAction = vi.fn();

    act(() => {
      root.render(
        <CanvasAddActionPopover
          onSelectAction={onSelectAction}
          availableSourceModes={['import', 'reference']}
          availableGenerationKinds={[]}
        />,
      );
    });
    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-canvas-toolbar-action="open-add-node-popover"]')
        ?.click();
    });
    act(() => {
      document.body.querySelector<HTMLButtonElement>('[data-canvas-add-action="image"]')?.click();
    });

    expect(document.body.querySelector('[data-canvas-add-action="image"]')).toBeNull();
    expect(document.body.querySelector('[data-canvas-add-action="director3d"]')).not.toBeNull();

    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-canvas-toolbar-action="open-add-node-popover"]')
        ?.click();
    });
    act(() =>
      root.render(
        <CanvasAddActionPopover
          onSelectAction={onSelectAction}
          availableSourceModes={[]}
          availableGenerationKinds={[]}
        />,
      ),
    );
    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-canvas-toolbar-action="open-add-node-popover"]')
        ?.click();
    });
    expect(document.body.querySelector('[data-canvas-add-action="table"]')).not.toBeNull();
    expect(document.body.querySelector('[data-canvas-add-action="text"]')).toBeNull();
    expect(document.body.querySelector('[data-canvas-add-action="image"]')).toBeNull();
  });
});
