// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineControls } from './TimelineControls';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('TimelineControls media-kind actions', () => {
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

  it('uses accessible Audio and Subtitle icons without visible A/S glyphs', () => {
    const onAddAudioTrack = vi.fn();
    const onAddSubtitleTrack = vi.fn();

    act(() => {
      root.render(
        <TimelineControls
          canAddAudioTrack
          canAddSubtitleTrack
          canSplit={false}
          hasSelection={false}
          onAddAudioTrack={onAddAudioTrack}
          onAddSubtitleTrack={onAddSubtitleTrack}
          onDelete={vi.fn()}
          onExport={vi.fn()}
          onFitAll={vi.fn()}
          onLinkMedia={vi.fn()}
          onPixelsPerSecond={vi.fn()}
          onRedo={vi.fn()}
          onSplit={vi.fn()}
          onToggleOverview={vi.fn()}
          onToggleSnapping={vi.fn()}
          onUndo={vi.fn()}
          overviewVisible
          pixelsPerSecond={80}
          snappingEnabled
        />,
      );
    });

    const audioButton = getButton('timeline.controls.audioTrack');
    const subtitleButton = getButton('timeline.controls.subtitleTrack');

    expect(audioButton.getAttribute('aria-label')).toBe('timeline.controls.audioTrack');
    expect(subtitleButton.getAttribute('aria-label')).toBe('timeline.controls.subtitleTrack');
    expect(audioButton.textContent).toBe('');
    expect(subtitleButton.textContent).toBe('');
    expect(audioButton.querySelector('svg polygon')).not.toBeNull();
    expect(audioButton.querySelector('svg path')).not.toBeNull();
    expect(subtitleButton.querySelector('svg path')).not.toBeNull();
    expect(subtitleButton.querySelector('svg polyline')).not.toBeNull();

    act(() => audioButton.click());
    act(() => subtitleButton.click());

    expect(onAddAudioTrack).toHaveBeenCalledOnce();
    expect(onAddSubtitleTrack).toHaveBeenCalledOnce();
  });

  function getButton(title: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
    if (!button) throw new Error(`Missing Timeline control: ${title}`);
    return button;
  }
});
