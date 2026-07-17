// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
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

  it('renders progress fill from current time and duration', () => {
    act(() => {
      root.render(
        <ProgressBar currentTime={15} duration={60} onSeekCommit={vi.fn()} variant="video" />,
      );
    });

    expect(host.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('15');
    expect(host.querySelector<HTMLElement>('[data-neko-preview-progress-fill]')?.style.width).toBe(
      '25%',
    );
  });

  it('clamps displayed progress inside the media duration', () => {
    act(() => {
      root.render(<ProgressBar currentTime={90} duration={60} onSeekCommit={vi.fn()} />);
    });

    expect(host.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('60');
    expect(host.querySelector<HTMLElement>('[data-neko-preview-progress-fill]')?.style.width).toBe(
      '100%',
    );
  });
});
