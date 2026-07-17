import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeekBar } from './index';

describe('@neko/ui SeekBar', () => {
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

  it('separates drag preview from seek commit', () => {
    const onSeeking = vi.fn();
    const onSeekCommit = vi.fn();

    act(() => {
      root.render(
        <SeekBar
          currentTime={10}
          duration={100}
          onSeekCommit={onSeekCommit}
          onSeeking={onSeeking}
        />,
      );
    });

    const track = host.querySelector<HTMLDivElement>('.cursor-pointer');
    expect(track).not.toBeNull();

    if (!track) throw new Error('SeekBar track was not rendered');
    track.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 200,
      }) as DOMRect;

    act(() => {
      track.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 80 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 120 }));
    });

    expect(onSeeking).toHaveBeenNthCalledWith(1, 10);
    expect(onSeeking).toHaveBeenNthCalledWith(2, 40);
    expect(onSeekCommit).toHaveBeenCalledTimes(1);
    expect(onSeekCommit).toHaveBeenCalledWith(60);
  });
});
