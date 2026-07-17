// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoControls } from './VideoControls';

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.percent !== undefined ? `${key}:${values.percent}` : key,
  }),
}));

vi.mock('@neko/ui/icons', () => {
  const TestIcon = ({ className }: { className?: string }) => (
    <span className={className} data-testid="icon" />
  );

  return {
    InfoIcon: TestIcon,
    PauseIcon: TestIcon,
    PictureInPictureIcon: TestIcon,
    PlayIcon: TestIcon,
    VolumeIcon: TestIcon,
    VolumeOffIcon: TestIcon,
  };
});

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('VideoControls', () => {
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

  it('gives the video volume slider a stable pointer target width', () => {
    act(() => {
      root.render(
        <VideoControls
          currentTime={15}
          duration={126}
          isConnected={true}
          isPlaying={true}
          onSeek={vi.fn()}
          onSpeedChange={vi.fn()}
          onTogglePlay={vi.fn()}
          onVolumeChange={vi.fn()}
          speed={1}
          volume={0.6}
        />,
      );
    });

    const volumeSlider = host.querySelector('[title="preview.video.volumeLabel:60"]');

    expect(volumeSlider?.className).toContain('w-20');
    expect(volumeSlider?.className).not.toContain('w-15');
  });
});
