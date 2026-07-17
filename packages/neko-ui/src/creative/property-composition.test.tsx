import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AxisGroup,
  NumberPropertyRow,
  PanelSection,
  PropertyRow,
  SelectPropertyRow,
} from './index';

describe('@neko/ui creative property composition primitives', () => {
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

  it('renders layout-only section and row slots without schema props', () => {
    const onReset = vi.fn();

    act(() => {
      root.render(
        <PanelSection description="Stable fields" title="Transform">
          <PropertyRow
            actions={<button type="button">Action</button>}
            keyframe={<button type="button">Key</button>}
            label="Opacity"
            onReset={onReset}
            propertyId="opacity"
            resetLabel="Restore"
          >
            <input aria-label="Opacity value" />
          </PropertyRow>
        </PanelSection>,
      );
    });

    expect(host.querySelector('section')?.getAttribute('aria-label')).toBe('Transform');
    expect(host.querySelector('[data-property-id="opacity"]')).not.toBeNull();
    expect(host.textContent).toContain('Stable fields');
    expect(host.textContent).toContain('Action');
    expect(host.textContent).toContain('Key');

    act(() => {
      host.querySelector<HTMLButtonElement>('button:nth-of-type(2)')?.click();
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('passes number row preview and commit phases through the composed control', () => {
    const onPreviewChange = vi.fn();
    const onCommit = vi.fn();

    act(() => {
      root.render(
        <NumberPropertyRow
          id="size"
          label="Size"
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          value={12}
        />,
      );
    });

    const input = host.querySelector<HTMLInputElement>('input[type="number"]');
    act(() => {
      setInputValue(input, '16');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPreviewChange).toHaveBeenCalledWith('size', 16);

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(onCommit).toHaveBeenCalledWith('size', 16);
    expect(host.querySelector('[data-property-id="size"]')).not.toBeNull();
  });

  it('maps axis edits to typed axis callbacks instead of string path parsing', () => {
    const onPreviewChange = vi.fn();
    const onCommit = vi.fn();

    act(() => {
      root.render(
        <AxisGroup label="Position">
          <AxisGroup.Axis
            axis="x"
            onCommit={onCommit}
            onPreviewChange={onPreviewChange}
            value={0}
          />
        </AxisGroup>,
      );
    });

    const input = host.querySelector<HTMLInputElement>('input[type="number"]');
    act(() => {
      setInputValue(input, '24');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPreviewChange).toHaveBeenCalledWith('x', 24);

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(onCommit).toHaveBeenCalledWith('x', 24);
  });

  it('select rows expose a two-phase contract even though select has a single change event', () => {
    const onPreviewChange = vi.fn();
    const onCommit = vi.fn();

    act(() => {
      root.render(
        <SelectPropertyRow
          id="blend"
          label="Blend"
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          options={[{ value: 'normal', label: 'Normal' }]}
          value="normal"
        />,
      );
    });

    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Blend');
    expect(host.querySelector('[data-property-id="blend"]')).not.toBeNull();
    expect(onPreviewChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
