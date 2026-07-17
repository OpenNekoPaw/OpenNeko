// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Collapsible,
  ContextMenu,
  Dialog,
  ScrollArea,
  SegmentedControl,
  Tabs,
  ToggleGroup,
} from './index';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('@neko/ui compound primitives', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    document.body.replaceChildren();
  });

  it('renders Dialog with accessible title, description, and close control', () => {
    act(() => {
      root.render(
        <Dialog
          defaultOpen
          title="Export settings"
          description="Choose output options."
          footer={<Button>Export</Button>}
        >
          Body
        </Dialog>,
      );
    });

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Export settings');
    expect(dialog?.textContent).toContain('Body');
    expect(document.body.querySelector('button[aria-label="Close dialog"]')).not.toBeNull();
  }, 15_000);

  it('renders Tabs with controlled value and disabled trigger metadata', () => {
    const onValueChange = vi.fn();

    act(() => {
      root.render(
        <Tabs
          onValueChange={onValueChange}
          value="timeline"
          items={[
            { value: 'timeline', label: 'Timeline', content: 'Timeline content' },
            { value: 'graph', label: 'Graph', disabled: true, content: 'Graph content' },
          ]}
        />,
      );
    });

    expect(host.querySelector('[role="tablist"]')).not.toBeNull();
    expect(host.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe('Timeline');
    expect(host.querySelector('[role="tabpanel"]')?.textContent).toContain('Timeline content');
    expect(host.querySelector('[role="tab"][data-disabled]')?.textContent).toBe('Graph');
  });

  it('renders ContextMenu trigger without changing the wrapped element semantics', () => {
    const onSelect = vi.fn();

    act(() => {
      root.render(
        <ContextMenu
          trigger={<Button>More</Button>}
          items={[
            { id: 'rename', label: 'Rename', onSelect },
            { id: 'separator', type: 'separator' },
            { id: 'delete', label: 'Delete', danger: true, disabled: true },
          ]}
        />,
      );
    });

    expect(host.querySelector('button')?.textContent).toBe('More');
  });

  it('renders Collapsible open content and disabled trigger state from wrapped control', () => {
    act(() => {
      root.render(
        <Collapsible defaultOpen trigger={<Button disabled>Advanced</Button>}>
          Fine tuning
        </Collapsible>,
      );
    });

    expect(host.querySelector('button')?.hasAttribute('disabled')).toBe(true);
    expect(host.textContent).toContain('Fine tuning');
  });

  it('renders ScrollArea viewport and scrollbar affordance', () => {
    act(() => {
      root.render(
        <ScrollArea orientation="both" className="h-16 w-16">
          <div>Scrollable content</div>
        </ScrollArea>,
      );
    });

    expect(host.textContent).toContain('Scrollable content');
    expect(host.querySelector('[data-radix-scroll-area-viewport]')).not.toBeNull();
  });

  it('renders ToggleGroup as a labelled single-select toolbar', () => {
    const onValueChange = vi.fn();

    act(() => {
      root.render(
        <ToggleGroup
          label="Brush mode"
          onValueChange={onValueChange}
          value="draw"
          options={[
            { value: 'draw', label: 'Draw' },
            { value: 'erase', label: 'Erase', disabled: true },
          ]}
        />,
      );
    });

    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Brush mode');
    expect(host.querySelector('[data-state="on"]')?.textContent).toBe('Draw');
    expect(host.querySelector('[data-disabled]')?.textContent).toBe('Erase');
  });

  it('renders SegmentedControl with a single animated thumb', () => {
    const onValueChange = vi.fn();

    act(() => {
      root.render(
        <SegmentedControl
          label="Creation mode"
          value="professional"
          onValueChange={onValueChange}
          options={[
            { value: 'basic', label: 'Basic' },
            { value: 'professional', label: 'Professional' },
          ]}
        />,
      );
    });

    const control = host.querySelector<HTMLElement>('.neko-segmented-control');
    const thumb = host.querySelector<HTMLElement>('.neko-segmented-control-thumb');
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');

    expect(control?.getAttribute('aria-label')).toBe('Creation mode');
    expect(control?.style.maxWidth).toBe('176px');
    expect(thumb?.style.width).toBe('50%');
    expect(thumb?.style.transform).toBe('translateX(100%)');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');

    act(() => {
      tabs[0]?.click();
    });

    expect(onValueChange).toHaveBeenCalledWith('basic');
  });
});
