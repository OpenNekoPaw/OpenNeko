// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreativeLeftRail, CreativeWorkbenchShell, MainPanelControlLayer } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('creative workbench shell primitives', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders shell slots without owning domain content', () => {
    const onRightDockSizeChange = vi.fn();
    const onRightDockGroupChange = vi.fn();

    act(() => {
      root.render(
        <CreativeWorkbenchShell
          mainKind="viewport-timeline"
          leftRail={<div data-testid="left" />}
          main={<div data-testid="main" />}
          rightDock={{
            id: 'workbench-right-dock',
            size: 320,
            minSize: 200,
            maxSize: 420,
            onSizeChange: onRightDockSizeChange,
            groups: {
              label: 'Edit mode',
              activeId: 'basic',
              onActiveIdChange: onRightDockGroupChange,
              items: [
                { id: 'basic', label: 'Basic' },
                { id: 'professional', label: 'Professional' },
              ],
            },
            children: <div data-testid="right" />,
          }}
          bottomPanel={<div data-testid="bottom" />}
        />,
      );
    });

    expect(host.querySelector('.neko-creative-workbench-shell')).not.toBeNull();
    expect(
      host.querySelector('.neko-creative-workbench-main')?.getAttribute('data-main-kind'),
    ).toBe('viewport-timeline');
    expect(host.querySelector('[data-testid="left"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="main"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="right"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="bottom"]')).not.toBeNull();
    expect(host.querySelector('#workbench-right-dock')).not.toBeNull();
    expect(host.querySelector('#workbench-right-dock')?.getAttribute('data-resizing')).toBe(
      'false',
    );
    expect(host.querySelector('#workbench-right-dock')?.getAttribute('style')).toContain(
      'width: 320px',
    );
    expect(host.querySelector('.neko-creative-workbench-right-resize-handle')).not.toBeNull();
    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Edit mode');
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const tablist = host.querySelector<HTMLElement>('[role="tablist"]');
    const activeTab = tabs[0];
    expect(activeTab?.getAttribute('aria-selected')).toBe('true');
    expect(tablist?.style.borderRadius).toBe('999px');
    expect(tablist?.style.gap).toBe('0');
    expect(tablist?.style.width).toBe('100%');
    expect(tablist?.style.maxWidth).toBe('176px');
    expect(tablist?.style.margin).toBe('0px auto');
    expect(tablist?.style.overflow).toBe('hidden');
    expect(tablist?.style.boxShadow).toContain('inset 0 1px 2px');
    const thumb = host.querySelector<HTMLElement>('.neko-segmented-control-thumb');
    expect(thumb?.style.width).toBe('50%');
    expect(thumb?.style.transform).toBe('translateX(0%)');
    expect(host.querySelector('.neko-creative-workbench-right-panel-groups')).not.toBeNull();
    expect(activeTab?.style.borderRadius).toBe('999px');
    expect(activeTab?.style.height).toBe('24px');
    expect(activeTab?.style.background).toBe('transparent');
    expect(activeTab?.style.zIndex).toBe('1');

    act(() => {
      tabs[1]?.click();
    });

    expect(onRightDockGroupChange).toHaveBeenCalledWith('professional');
  });

  it('omits the rail container when a workbench has no left rail', () => {
    act(() => {
      root.render(
        <CreativeWorkbenchShell
          mainKind="preview-timeline"
          main={<div data-testid="main-only" />}
        />,
      );
    });

    expect(host.querySelector('.neko-creative-workbench-left-rail')).toBeNull();
    expect(host.querySelector('[data-testid="main-only"]')).not.toBeNull();
  });

  it('forwards visibility toggle state from left rail actions', () => {
    const onToggle = vi.fn();
    const onSave = vi.fn();

    act(() => {
      root.render(
        <CreativeLeftRail
          label="Workbench"
          actions={[
            {
              id: 'toggle-viewport-controls',
              label: 'Toggle viewport controls',
              icon: <span />,
              kind: 'visibility-toggle',
              visibilityTarget: 'hud',
              controls: 'viewport-controls',
              active: true,
              onClick: onToggle,
            },
            {
              id: 'save',
              label: 'Save',
              icon: <span />,
              kind: 'common-action',
              onClick: onSave,
            },
          ]}
        />,
      );
    });

    const rail = host.querySelector('.neko-creative-left-rail');
    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="toggle-viewport-controls"]',
    );
    const save = host.querySelector<HTMLButtonElement>('[data-creative-left-rail-action="save"]');

    expect(rail?.getAttribute('aria-label')).toBe('Workbench');
    expect(toggle?.getAttribute('data-creative-left-rail-kind')).toBe('visibility-toggle');
    expect(toggle?.getAttribute('data-creative-left-rail-target')).toBe('hud');
    expect(toggle?.getAttribute('aria-controls')).toBe('viewport-controls');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(save?.getAttribute('data-creative-left-rail-target')).toBeNull();
    expect(save?.getAttribute('aria-controls')).toBeNull();
    expect(save?.getAttribute('aria-expanded')).toBeNull();

    act(() => {
      toggle?.click();
      save?.click();
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('omits hidden main panel control layers from focus order', () => {
    act(() => {
      root.render(
        <>
          <MainPanelControlLayer
            id="visible-controls"
            visible={true}
            placement="overlay-top-left"
            label="Visible controls"
            role="toolbar"
          >
            <button type="button">Visible</button>
          </MainPanelControlLayer>
          <MainPanelControlLayer id="hidden-controls" visible={false} placement="transport">
            <button type="button">Hidden</button>
          </MainPanelControlLayer>
        </>,
      );
    });

    expect(host.querySelector('#visible-controls')?.getAttribute('data-placement')).toBe(
      'overlay-top-left',
    );
    expect(host.querySelector('#visible-controls')?.getAttribute('role')).toBe('toolbar');
    expect(host.querySelector('#hidden-controls')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(1);
  });
});
