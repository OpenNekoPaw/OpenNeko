import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Badge, EmptyState, Progress } from './index';

describe('@neko/ui status primitives', () => {
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

  it('renders bounded progress metadata', () => {
    act(() => {
      root.render(<Progress label="Render progress" max={50} value={75} />);
    });

    const progress = host.querySelector('[role="progressbar"]');
    expect(progress?.getAttribute('aria-label')).toBe('Render progress');
    expect(progress?.getAttribute('aria-valuemax')).toBe('50');
    expect(progress?.getAttribute('aria-valuenow')).toBe('50');
    expect(host.querySelector<HTMLElement>('[role="progressbar"] > div')?.style.width).toBe('100%');
  });

  it('renders Badge with tone tokens', () => {
    act(() => {
      root.render(<Badge tone="warning">Draft</Badge>);
    });

    const badge = host.querySelector('span');
    expect(badge?.textContent).toBe('Draft');
    expect(badge?.className).toContain('inputValidation-warningBackground');
  });

  it('renders EmptyState title, description, and action', () => {
    act(() => {
      root.render(
        <EmptyState
          title="No assets"
          description="Import media to begin."
          action={<button type="button">Import</button>}
        />,
      );
    });

    expect(host.textContent).toContain('No assets');
    expect(host.textContent).toContain('Import media to begin.');
    expect(host.querySelector('button')?.textContent).toBe('Import');
  });
});
