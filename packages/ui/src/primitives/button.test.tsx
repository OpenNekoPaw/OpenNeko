import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from './index';

describe('@neko/ui button primitives', () => {
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

  it('renders Button as a non-submit controlled command by default', () => {
    const onClick = vi.fn();

    act(() => {
      root.render(
        <Button variant="secondary" leadingIcon={<span data-testid="icon" />} onClick={onClick}>
          Apply
        </Button>,
      );
    });

    const button = host.querySelector('button');
    expect(button?.type).toBe('button');
    expect(button?.textContent).toBe('Apply');
    expect(button?.className).toContain('var(--neko-surface)');

    act(() => {
      button?.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps disabled Button inert', () => {
    const onClick = vi.fn();

    act(() => {
      root.render(
        <Button disabled onClick={onClick}>
          Apply
        </Button>,
      );
    });

    const button = host.querySelector('button');
    expect(button?.disabled).toBe(true);

    act(() => {
      button?.click();
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders IconButton with accessible label', () => {
    act(() => {
      root.render(<IconButton label="Confirm" icon={<span data-testid="icon" />} />);
    });

    const button = host.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Confirm');
    expect(button?.textContent).toBe('');
  });
});
