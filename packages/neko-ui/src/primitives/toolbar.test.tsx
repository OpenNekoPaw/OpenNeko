import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolbarButton, ToolbarSeparator, ToolbarSpacer, VerticalToolbar } from './index';

describe('@neko/ui toolbar primitives', () => {
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

  it('renders the legacy vertical toolbar shell class and width', () => {
    act(() => {
      root.render(
        <VerticalToolbar className="custom-toolbar" width={56}>
          Body
        </VerticalToolbar>,
      );
    });

    const toolbar = host.querySelector<HTMLDivElement>('.neko-vtoolbar');
    expect(toolbar?.className).toContain('custom-toolbar');
    expect(toolbar?.style.width).toBe('56px');
    expect(toolbar?.textContent).toContain('Body');
  });

  it('renders button active, disabled, class, and command behavior', () => {
    const onClick = vi.fn();

    act(() => {
      root.render(
        <ToolbarButton
          active
          className="custom-button"
          icon={<span data-testid="icon">I</span>}
          title="Brush"
          onClick={onClick}
        />,
      );
    });

    const button = host.querySelector<HTMLButtonElement>('button');
    expect(button?.type).toBe('button');
    expect(button?.className).toContain('neko-toolbar-btn');
    expect(button?.className).toContain('active');
    expect(button?.className).toContain('custom-button');
    expect(button?.getAttribute('aria-label')).toBe('Brush');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.title).toBe('Brush');

    act(() => {
      button?.click();
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps disabled toolbar button inert', () => {
    const onClick = vi.fn();

    act(() => {
      root.render(<ToolbarButton disabled icon={<span />} title="Disabled" onClick={onClick} />);
    });

    const button = host.querySelector<HTMLButtonElement>('button');
    expect(button?.disabled).toBe(true);

    act(() => {
      button?.click();
    });

    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders separator and spacer compatibility elements', () => {
    act(() => {
      root.render(
        <>
          <ToolbarSeparator />
          <ToolbarSpacer />
        </>,
      );
    });

    expect(host.querySelector('.neko-toolbar-sep')?.getAttribute('role')).toBe('separator');
    expect(host.querySelector<HTMLDivElement>('div[style]')?.style.flex).toBe('1 1 0%');
  });
});
