import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorPicker, ColorSwatch } from './index';

describe('@neko/ui creative color controls', () => {
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

  it('renders ColorSwatch with label and alpha', () => {
    act(() => {
      root.render(<ColorSwatch alpha={0.5} label="Fill" value="#ff0000" />);
    });

    const swatch = host.querySelector('[role="img"]') as HTMLElement | null;
    expect(swatch?.getAttribute('aria-label')).toBe('Fill');
    expect(swatch?.style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(swatch?.style.opacity).toBe('0.5');
  });

  it('separates ColorPicker preview and commit', () => {
    const onPreviewChange = vi.fn();
    const onCommit = vi.fn();

    act(() => {
      root.render(
        <ColorPicker
          id="fill"
          label="Fill"
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          value="#000000"
        />,
      );
    });

    const input = host.querySelector<HTMLInputElement>('input[type="color"]');
    act(() => {
      setInputValue(input, '#ffffff');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onPreviewChange).toHaveBeenCalledWith('fill', '#ffffff');

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(onCommit).toHaveBeenCalledWith('fill', '#ffffff');
  });
});

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
