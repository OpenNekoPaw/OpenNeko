import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Checkbox, Stepper, Switch } from './index';

describe('@neko/ui form primitives', () => {
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

  it('renders Checkbox with label, disabled state, and keyboard boundary metadata', () => {
    const onCheckedChange = vi.fn();

    act(() => {
      root.render(
        <Checkbox checked={false} id="snap" label="Snap" onCheckedChange={onCheckedChange} />,
      );
    });

    const input = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(host.textContent).toContain('Snap');
    expect(input?.getAttribute('data-neko-keyboard-scope')).toBe('form-control');
    expect(input?.getAttribute('data-neko-keyboard-owner')).toBe('checkbox:snap');

    act(() => {
      input?.click();
    });
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('renders Switch as an aria switch and does not emit while disabled', () => {
    const onCheckedChange = vi.fn();

    act(() => {
      root.render(
        <Switch checked disabled id="loop" label="Loop" onCheckedChange={onCheckedChange} />,
      );
    });

    const button = host.querySelector<HTMLButtonElement>('button[role="switch"]');
    expect(button?.getAttribute('aria-checked')).toBe('true');
    expect(button?.getAttribute('data-neko-keyboard-scope')).toBe('form-control');
    expect(button?.getAttribute('data-neko-keyboard-owner')).toBe('switch:loop');

    act(() => {
      button?.click();
    });
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('emits Stepper preview and commit together for discrete step actions', () => {
    const onPreviewChange = vi.fn();
    const onCommit = vi.fn();

    act(() => {
      root.render(
        <Stepper
          id="copies"
          label="Copies"
          max={3}
          min={0}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          value={1}
        />,
      );
    });

    const rootControl = host.querySelector<HTMLElement>(
      '[data-neko-keyboard-owner="stepper:copies"]',
    );
    const increase = host.querySelector<HTMLButtonElement>('button[aria-label="Increase Copies"]');
    expect(rootControl?.getAttribute('data-neko-keyboard-scope')).toBe('form-control');
    expect(rootControl?.getAttribute('tabindex')).toBe('0');

    act(() => {
      increase?.click();
    });
    expect(onPreviewChange).toHaveBeenCalledWith('copies', 2);
    expect(onCommit).toHaveBeenCalledWith('copies', 2);
  });
});
