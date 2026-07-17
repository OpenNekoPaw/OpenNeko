import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NumberInput, NumberSlider } from './index';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('@neko/ui creative number controls', () => {
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

  it('emits preview on edit and commit on blur with bounded values', () => {
    const onPreviewChange = vi.fn();
    const onCommit = vi.fn();

    act(() => {
      root.render(
        <NumberInput
          id="opacity"
          label="Opacity"
          max={100}
          min={0}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          value={50}
        />,
      );
    });

    const input = host.querySelector('input');
    expect(input?.getAttribute('aria-label')).toBe('Opacity');

    act(() => {
      setInputValue(input, '120');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPreviewChange).toHaveBeenCalledWith('opacity', 100);

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(onCommit).toHaveBeenCalledWith('opacity', 100);
    expect(input?.getAttribute('data-neko-keyboard-scope')).toBe('text-input');
    expect(input?.getAttribute('data-neko-keyboard-owner')).toBe('number-input:opacity');
  });

  it('composes the shared Slider primitive for range editing', () => {
    const onPreviewChange = vi.fn();
    const onCommit = vi.fn();

    act(() => {
      root.render(
        <NumberSlider
          id="scale"
          max={10}
          min={0}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          value={5}
        />,
      );
    });

    const slider = host.querySelector('[role="slider"]');
    expect(slider?.getAttribute('aria-label')).toBe('scale');
    expect(slider?.getAttribute('aria-valuenow')).toBe('5');
    expect(host.querySelector('input[type="range"]')).toBeNull();
    expect(host.querySelector('input[type="number"]')?.getAttribute('aria-label')).toBe('scale');
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
