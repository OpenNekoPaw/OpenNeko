import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyPanel } from './index';
import type { PropertyDefinition } from './property-types';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('@neko/ui PropertyPanel', () => {
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
  });

  it('renders grouped properties and separates preview, commit, reset, and keyframe callbacks', () => {
    const onPreviewChange = vi.fn();
    const onCommit = vi.fn();
    const onReset = vi.fn();
    const onToggleKeyframe = vi.fn();

    act(() => {
      root.render(
        <PropertyPanel
          groups={[{ id: 'transform', label: 'Transform', propertyIds: ['opacity', 'name'] }]}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          onReset={onReset}
          resetLabel="Restore"
          onToggleKeyframe={onToggleKeyframe}
          properties={[
            {
              id: 'opacity',
              kind: 'number',
              label: 'Opacity',
              value: 50,
              min: 0,
              max: 100,
              animatable: true,
              isAtKeyframe: true,
            },
            { id: 'name', kind: 'text', label: 'Name', value: 'Clip A' },
          ]}
        />,
      );
    });

    expect(host.textContent).toContain('Transform');
    expect(host.textContent).toContain('Opacity');
    expect(host.querySelector('[data-property-id="opacity"]')).not.toBeNull();

    const numberInput = host.querySelector<HTMLInputElement>('input[type="number"]');
    act(() => {
      setInputValue(numberInput, '72');
      numberInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPreviewChange).toHaveBeenCalledWith('opacity', 72);

    act(() => {
      numberInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(onCommit).toHaveBeenCalledWith('opacity', 72);

    const resetButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Restore',
    );
    act(() => {
      resetButton?.click();
    });
    expect(onReset).toHaveBeenCalledWith('opacity');

    const keyframeButton = host.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    act(() => {
      keyframeButton?.click();
    });
    expect(onToggleKeyframe).toHaveBeenCalledWith('opacity');
  });

  it('uses renderRow overrides without changing panel grouping', () => {
    const properties: PropertyDefinition[] = [
      { id: 'visible', kind: 'boolean', label: 'Visible', value: true },
    ];

    act(() => {
      root.render(
        <PropertyPanel
          properties={properties}
          renderRow={({ property }) => <div data-custom-row={property.id}>{property.label}</div>}
        />,
      );
    });

    expect(host.querySelector('[data-custom-row="visible"]')?.textContent).toBe('Visible');
  });

  it('preserves schema rendering for slider, text, color, boolean, and select properties', () => {
    const onPreviewChange = vi.fn();
    const onCommit = vi.fn();

    act(() => {
      root.render(
        <PropertyPanel
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          properties={[
            { id: 'scale', kind: 'slider', label: 'Scale', value: 1, min: 0, max: 2 },
            { id: 'title', kind: 'text', label: 'Title', value: 'Clip A' },
            { id: 'fill', kind: 'color', label: 'Fill', value: '#000000' },
            { id: 'visible', kind: 'boolean', label: 'Visible', value: true },
            {
              id: 'blend',
              kind: 'select',
              label: 'Blend',
              options: [{ value: 'normal', label: 'Normal' }],
              value: 'normal',
            },
          ]}
        />,
      );
    });

    for (const id of ['scale', 'title', 'fill', 'visible', 'blend']) {
      expect(host.querySelector(`[data-property-id="${id}"]`)).not.toBeNull();
    }

    const textInput = host.querySelector<HTMLInputElement>('input[aria-label="Title"]');
    act(() => {
      setInputValue(textInput, 'Clip B');
      textInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPreviewChange).toHaveBeenCalledWith('title', 'Clip B');

    act(() => {
      setInputValue(textInput, 'Clip B');
      textInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(onCommit).toHaveBeenCalledWith('title', 'Clip B');

    const colorInput = host.querySelector<HTMLInputElement>('input[type="color"]');
    act(() => {
      setInputValue(colorInput, '#ffffff');
      colorInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPreviewChange).toHaveBeenCalledWith('fill', '#ffffff');

    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    act(() => {
      checkbox?.click();
    });
    expect(onPreviewChange).toHaveBeenCalledWith('visible', false);
    expect(onCommit).toHaveBeenCalledWith('visible', false);

    expect(host.querySelector('button[aria-label="Blend"]')).not.toBeNull();
  });

  it('renders empty state for empty property sets', () => {
    act(() => {
      root.render(<PropertyPanel emptyState="Nothing selected" properties={[]} />);
    });

    expect(host.textContent).toContain('Nothing selected');
  });
});

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
