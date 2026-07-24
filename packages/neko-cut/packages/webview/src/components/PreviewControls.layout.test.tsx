// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewControls, type PreviewControlsProps } from './PreviewControls';

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function props(overrides: Partial<PreviewControlsProps> = {}): PreviewControlsProps {
  return {
    currentTime: 1,
    duration: 10,
    playing: false,
    propertyPanelVisible: true,
    volume: 1,
    onStart: vi.fn(),
    onPrevious: vi.fn(),
    onToggle: vi.fn(),
    onNext: vi.fn(),
    onEnd: vi.fn(),
    onVolume: vi.fn(),
    onToggleMute: vi.fn(),
    onTogglePropertyPanel: vi.fn(),
    onFullscreen: vi.fn(),
    ...overrides,
  };
}

describe('PreviewControls retained controller behavior', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('routes playback, frame, mute, fullscreen and Inspector actions through supplied callbacks', () => {
    const input = props();
    act(() => root.render(<PreviewControls {...input} />));

    click('timeline.controls.play');
    click('timeline.basic.previousFrame');
    click('timeline.basic.globalVolume');
    click('timeline.basic.fullscreen');
    click('timeline.controls.propertyPanel');

    expect(input.onToggle).toHaveBeenCalledOnce();
    expect(input.onPrevious).toHaveBeenCalledOnce();
    expect(input.onToggleMute).toHaveBeenCalledOnce();
    expect(input.onFullscreen).toHaveBeenCalledOnce();
    expect(input.onTogglePropertyPanel).toHaveBeenCalledOnce();
  });

  it('projects the actual playback and time state', () => {
    act(() => root.render(<PreviewControls {...props({ playing: true, currentTime: 2 })} />));
    expect(host.querySelector('button[aria-label="timeline.controls.pause"]')).not.toBeNull();
    expect(host.querySelector('output')?.textContent).toContain('00:02.00');
  });

  it('projects Inspector visibility on the Preview controls toggle', () => {
    act(() => root.render(<PreviewControls {...props({ propertyPanelVisible: false })} />));
    expect(
      host
        .querySelector('button[aria-label="timeline.controls.propertyPanel"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  function click(label: string): void {
    const result = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(result).not.toBeNull();
    act(() => result?.click());
  }
});
