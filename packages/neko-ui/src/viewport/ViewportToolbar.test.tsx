import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewportToolbarItem } from '@neko/shared';
import { ViewportToolbar } from './ViewportToolbar';

describe('ViewportToolbar', () => {
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

  it('renders degraded control affordance metadata without invoking disabled actions', () => {
    const onAction = vi.fn();
    const item: ViewportToolbarItem = {
      id: 'output-route',
      kind: 'button',
      label: 'Output',
      action: 'scene:live:outputRoute',
      disabled: true,
      disabledReason: 'Scene control is disconnected.',
      degraded: true,
      degradedReason: 'control-disconnected',
    };

    act(() => {
      root.render(<ViewportToolbar items={[item]} onAction={onAction} />);
    });

    expect(host.querySelector('.neko-vtoolbar')).not.toBeNull();
    const button = host.querySelector<HTMLButtonElement>('[data-action="scene:live:outputRoute"]');
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
    expect(button?.dataset['degraded']).toBe('true');
    expect(button?.dataset['degradedReason']).toBe('control-disconnected');
    expect(button?.title).toBe('Scene control is disconnected.');

    act(() => {
      button?.click();
    });
    expect(onAction).not.toHaveBeenCalled();
  });
});
