// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ControlledWorkbenchShell,
  EditorWorkbenchShell,
  WorkbenchActivityBar,
  WorkbenchEditorTabs,
  WorkbenchListCard,
  WorkbenchPanelHeader,
  WorkbenchStatusBar,
  WorkbenchThumbnailStrip,
  WorkbenchWebviewRuntimeFrame,
} from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('editor workbench shell primitives', () => {
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

  it('renders VSCode-compatible workbench zones as reusable slots', () => {
    act(() => {
      root.render(
        <EditorWorkbenchShell
          titleBar={<div data-testid="title" />}
          activityBar={<div data-testid="activity" />}
          sidebar={<div data-testid="sidebar" />}
          editor={<div data-testid="editor" />}
          secondarySidebar={<div data-testid="secondary" />}
          bottomPanel={<div data-testid="bottom" />}
          statusBar={<div data-testid="status" />}
        />,
      );
    });

    expect(host.querySelector('[data-neko-editor-workbench="true"]')).not.toBeNull();
    expect(host.querySelector('[data-workbench-layout="docked-editor"]')).not.toBeNull();
    expect(host.querySelector('.neko-editor-workbench-title [data-testid="title"]')).not.toBeNull();
    expect(
      host.querySelector('.neko-editor-workbench-activity [data-testid="activity"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('.neko-editor-workbench-sidebar [data-testid="sidebar"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('.neko-editor-workbench-editor [data-testid="editor"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('.neko-editor-workbench-secondary-sidebar [data-testid="secondary"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('.neko-editor-workbench-bottom [data-testid="bottom"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('.neko-editor-workbench-status [data-testid="status"]'),
    ).not.toBeNull();
  });

  it('omits hidden docked side zones from the workbench shell', () => {
    act(() => {
      root.render(
        <EditorWorkbenchShell
          titleBar={<div data-testid="title" />}
          activityBar={<div data-testid="activity" />}
          sidebar={<div data-testid="sidebar" />}
          activityBarVisible={false}
          sidebarVisible={false}
          secondarySidebarVisible={false}
          editor={<div data-testid="editor" />}
          secondarySidebar={<div data-testid="secondary" />}
          statusBar={<div data-testid="status" />}
        />,
      );
    });

    const shell = host.querySelector('[data-neko-editor-workbench="true"]');
    expect(shell?.getAttribute('data-activity-visible')).toBe('false');
    expect(shell?.getAttribute('data-sidebar-visible')).toBe('false');
    expect(shell?.getAttribute('data-secondary-visible')).toBe('false');
    expect(host.querySelector('.neko-editor-workbench-activity')).toBeNull();
    expect(host.querySelector('.neko-editor-workbench-sidebar')).toBeNull();
    expect(host.querySelector('.neko-editor-workbench-secondary-sidebar')).toBeNull();
    expect(
      host.querySelector('.neko-editor-workbench-editor [data-testid="editor"]'),
    ).not.toBeNull();
  });

  it('renders controlled primary, split Main, movable docks and Timeline slots', () => {
    act(() => {
      root.render(
        <ControlledWorkbenchShell
          titleBar={<div data-testid="title" />}
          primarySidebar={<div data-testid="primary" />}
          primarySidebarWidth={232}
          primarySidebarResize={{
            label: 'Resize primary',
            minSize: 208,
            maxSize: 360,
            onResizeEnd: vi.fn(),
          }}
          main={<div data-testid="main" />}
          secondaryMain={<div data-testid="secondary-main" />}
          mainSplit="horizontal"
          leftDock={<div data-testid="left-dock" />}
          leftDockPresentation="overlay"
          leftDockResize={{
            label: 'Resize left',
            minSize: 280,
            maxSize: 520,
            onResizeEnd: vi.fn(),
          }}
          rightDock={<div data-testid="right-dock" />}
          rightDockPresentation="docked"
          rightDockResize={{
            label: 'Resize right',
            minSize: 280,
            maxSize: 520,
            onResizeEnd: vi.fn(),
          }}
          timeline={<div data-testid="timeline" />}
          timelineVisible
          timelineHeight={220}
          timelineResize={{
            label: 'Resize timeline',
            minSize: 160,
            maxSize: 480,
            onResizeEnd: vi.fn(),
          }}
          statusBar={<div data-testid="status" />}
        />,
      );
    });

    const shell = host.querySelector<HTMLElement>('[data-neko-controlled-workbench="true"]');
    expect(shell?.dataset['primaryVisible']).toBe('true');
    expect(shell?.dataset['leftPresentation']).toBe('overlay');
    expect(shell?.dataset['rightPresentation']).toBe('docked');
    expect(shell?.dataset['mainSplit']).toBe('horizontal');
    expect(shell?.dataset['timelineVisible']).toBe('true');
    expect(shell?.style.getPropertyValue('--neko-controlled-primary-width')).toBe('232px');
    expect(shell?.style.getPropertyValue('--neko-controlled-timeline-height')).toBe('220px');
    expect(
      host.querySelector('.neko-controlled-workbench-main__primary [data-testid="main"]'),
    ).not.toBeNull();
    expect(
      host.querySelector(
        '.neko-controlled-workbench-main__secondary [data-testid="secondary-main"]',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector('.neko-controlled-workbench-dock--left[data-presentation="overlay"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('.neko-controlled-workbench-dock--right[data-presentation="docked"]'),
    ).not.toBeNull();
    expect(host.querySelectorAll('[role="separator"]')).toHaveLength(4);
    expect(host.querySelector('[aria-label="Resize primary"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Resize timeline"]')).not.toBeNull();
  });

  it('updates a panel live and emits one final resize size', () => {
    const onResizeEnd = vi.fn();

    act(() => {
      root.render(
        <ControlledWorkbenchShell
          primarySidebar={<div data-testid="primary" />}
          primarySidebarWidth={232}
          primarySidebarResize={{
            label: 'Resize primary',
            minSize: 208,
            maxSize: 360,
            onResizeEnd,
          }}
          main={<div data-testid="main" />}
        />,
      );
    });

    const shell = host.querySelector<HTMLElement>('[data-neko-controlled-workbench="true"]');
    const panel = host.querySelector<HTMLElement>('.neko-controlled-workbench-primary');
    const handle = host.querySelector<HTMLElement>('[aria-label="Resize primary"]');
    expect(shell).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(handle).not.toBeNull();
    if (!shell || !panel || !handle) return;

    panel.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 232,
        top: 0,
        bottom: 600,
        width: 232,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }) as DOMRect;

    act(() => {
      dispatchPointer(handle, 'pointerdown', 1, 232, 0);
      dispatchPointer(handle, 'pointermove', 1, 300, 0);
      dispatchPointer(handle, 'pointerup', 1, 300, 0);
    });

    expect(onResizeEnd).toHaveBeenCalledOnce();
    expect(onResizeEnd).toHaveBeenCalledWith(300);
    expect(shell.style.getPropertyValue('--neko-controlled-primary-width')).toBe('300px');
  });

  it('collapses absent or explicitly hidden controlled Workbench zones', () => {
    act(() => {
      root.render(
        <ControlledWorkbenchShell
          primarySidebar={<div data-testid="primary" />}
          primarySidebarVisible={false}
          main={<div data-testid="main" />}
          mainSplit="vertical"
          leftDock={<div data-testid="left-dock" />}
          leftDockPresentation="hidden"
          leftDockResize={{
            label: 'Resize hidden left',
            onResizeEnd: vi.fn(),
          }}
          rightDock={<div data-testid="right-dock" />}
          rightDockPresentation="hidden"
          rightDockResize={{
            label: 'Resize hidden right',
            onResizeEnd: vi.fn(),
          }}
          timeline={<div data-testid="timeline" />}
          timelineVisible={false}
          timelineResize={{
            label: 'Resize hidden timeline',
            onResizeEnd: vi.fn(),
          }}
        />,
      );
    });

    const shell = host.querySelector<HTMLElement>('[data-neko-controlled-workbench="true"]');
    expect(shell?.dataset['primaryVisible']).toBe('false');
    expect(shell?.dataset['mainSplit']).toBe('none');
    expect(shell?.dataset['timelineVisible']).toBe('false');
    expect(host.querySelector('.neko-controlled-workbench-primary')).toBeNull();
    expect(host.querySelector('[role="separator"]')).toBeNull();
  });

  it('renders reusable activity buttons, tabs, cards, thumbnails, and status chrome', () => {
    const onActivitySelect = vi.fn();
    const onTabSelect = vi.fn();
    const onCardSelect = vi.fn();
    const onCardAction = vi.fn();
    const onThumbSelect = vi.fn();

    act(() => {
      root.render(
        <>
          <WorkbenchActivityBar
            label="Surfaces"
            activeId="explorer"
            items={[
              { id: 'explorer', label: 'Explorer', icon: <span>EX</span> },
              { id: 'assets', label: 'Assets', icon: <span>AS</span>, badge: '2' },
            ]}
            onSelect={onActivitySelect}
          />
          <WorkbenchEditorTabs
            label="Open editors"
            activeId="a"
            emptyLabel="No editors"
            tabs={[
              { id: 'a', label: 'A.nkc', icon: <span>NKC</span> },
              { id: 'b', label: 'B.otio' },
            ]}
            onSelect={onTabSelect}
          />
          <WorkbenchPanelHeader eyebrow="workspace" title="Explorer" count={3} />
          <WorkbenchListCard
            id="resource"
            label="Resource"
            selected
            description="Source-owned resource"
            eyebrow="asset"
            thumbnail={<span>IMG</span>}
            metadata={['png', '1024x768']}
            badges={[{ id: 'ready', label: 'Ready', tone: 'success' }]}
            actions={[{ id: 'open', label: 'Open', onClick: onCardAction }]}
            onSelect={onCardSelect}
          />
          <WorkbenchThumbnailStrip
            label="Media"
            title="Media"
            count={1}
            items={[{ id: 'thumb', label: 'test.png', preview: <span>IMG</span> }]}
            onSelect={onThumbSelect}
          />
          <WorkbenchStatusBar label="Status" items={['electron', 'trusted']} />
          <WorkbenchWebviewRuntimeFrame runtimeId="agent">
            <div data-testid="agent-root" />
          </WorkbenchWebviewRuntimeFrame>
        </>,
      );
    });

    expect(host.querySelectorAll('.neko-workbench-activity-button')).toHaveLength(2);
    expect(
      host.querySelector('.neko-workbench-activity-button[data-active="true"]'),
    ).not.toBeNull();
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(host.querySelector('.neko-workbench-panel-header__title')?.textContent).toBe('Explorer');
    expect(host.querySelector('.neko-workbench-list-card[data-selected="true"]')).not.toBeNull();
    expect(host.querySelector('.neko-workbench-thumbnail-strip__item')).not.toBeNull();
    expect(host.querySelector('.neko-workbench-status-bar')?.textContent).toContain('trusted');
    expect(
      host.querySelector(
        '.neko-workbench-webview-runtime-frame[data-neko-webview-runtime="agent"] [data-testid="agent-root"]',
      ),
    ).not.toBeNull();

    act(() => {
      host.querySelectorAll<HTMLButtonElement>('.neko-workbench-activity-button')[1]?.click();
      host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]?.click();
      host.querySelector<HTMLElement>('.neko-workbench-list-card')?.click();
      host.querySelector<HTMLButtonElement>('.neko-workbench-list-card__action')?.click();
      host.querySelector<HTMLButtonElement>('.neko-workbench-thumbnail-strip__item')?.click();
    });

    expect(onActivitySelect).toHaveBeenCalledWith('assets');
    expect(onTabSelect).toHaveBeenCalledWith('b');
    expect(onCardSelect).toHaveBeenCalledWith('resource');
    expect(onCardAction).toHaveBeenCalledTimes(1);
    expect(onThumbSelect).toHaveBeenCalledWith('thumb');
  });

  it('supports VSCode-style tab close and drag reorder callbacks', () => {
    const onTabSelect = vi.fn();
    const onTabClose = vi.fn();
    const onTabReorder = vi.fn();

    act(() => {
      root.render(
        <WorkbenchEditorTabs
          label="Open editors"
          activeId="a"
          emptyLabel="No editors"
          tabs={[
            { id: 'a', label: 'A.nkc', closeLabel: 'Close A.nkc' },
            { id: 'b', label: 'B.otio', closeLabel: 'Close B.otio' },
          ]}
          onClose={onTabClose}
          onReorder={onTabReorder}
          onSelect={onTabSelect}
        />,
      );
    });

    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.getAttribute('draggable')).toBe('true');

    act(() => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Close A.nkc"]')?.click();
    });

    expect(onTabClose).toHaveBeenCalledWith('a');
    expect(onTabSelect).not.toHaveBeenCalled();

    const dataTransfer = createTestDataTransfer();
    act(() => {
      dispatchDragEvent(tabs[0]!, 'dragstart', dataTransfer);
      dispatchDragEvent(tabs[1]!, 'drop', dataTransfer);
    });

    expect(onTabReorder).toHaveBeenCalledWith('a', 'b');
  });
});

function dispatchPointer(
  target: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  clientX: number,
  clientY: number,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  target.dispatchEvent(event);
}

function createTestDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    effectAllowed: 'uninitialized',
    dropEffect: 'none',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData(format?: string): void {
      if (format) {
        values.delete(format);
      } else {
        values.clear();
      }
    },
    getData(format: string): string {
      return values.get(format) ?? '';
    },
    setData(format: string, data: string): void {
      values.set(format, data);
    },
    setDragImage: vi.fn(),
  };
}

function dispatchDragEvent(
  element: HTMLElement,
  type: 'dragstart' | 'drop',
  dataTransfer: DataTransfer,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  element.dispatchEvent(event);
}
