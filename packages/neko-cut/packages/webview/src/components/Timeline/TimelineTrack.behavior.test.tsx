// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineTrackView } from '@neko-cut/domain';
import { TimelineTrack } from './TimelineTrack';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('TimelineTrack retained basic behavior', () => {
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

  it('keeps media add out of the label and routes Track state, selection and Clip mute', () => {
    const onSelectClip = vi.fn();
    const onToggleClipMute = vi.fn();
    const onToggleTrackEnabled = vi.fn();
    const onToggleTrackMute = vi.fn();
    const onToggleTrackLock = vi.fn();
    const onRemoveTrack = vi.fn();
    const track = createTrack();
    act(() => {
      root.render(
        <TimelineTrack
          dragOver={false}
          onClipContextMenu={vi.fn()}
          onGapContextMenu={vi.fn()}
          onClipPointerDown={vi.fn()}
          onBeginTrackRename={vi.fn()}
          onCancelTrackRename={vi.fn()}
          onChangeTrackName={vi.fn()}
          onSaveTrackName={vi.fn()}
          onSelectClip={onSelectClip}
          onSelectGap={vi.fn()}
          onSelectTrack={vi.fn()}
          onTrackDragEnd={vi.fn()}
          onTrackDragOver={vi.fn()}
          onTrackDragStart={vi.fn()}
          onTrackDrop={vi.fn()}
          onTrackContextMenu={vi.fn()}
          onToggleClipMute={onToggleClipMute}
          onToggleTrackEnabled={onToggleTrackEnabled}
          onToggleTrackLock={onToggleTrackLock}
          onToggleTrackMute={onToggleTrackMute}
          onRemoveTrack={onRemoveTrack}
          pixelsPerSecond={80}
          representations={new Map()}
          timelineWidth={800}
          track={track}
          trackNameInputRef={{ current: null }}
          stackIndex={0}
        />,
      );
    });

    act(() => host.querySelector<HTMLButtonElement>('.cut-basic-track-visibility')?.click());
    act(() =>
      host
        .querySelector<HTMLElement>('.cut-basic-clip')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true })),
    );
    act(() => host.querySelector<HTMLButtonElement>('.cut-basic-clip-mute')?.click());
    act(() => host.querySelector<HTMLButtonElement>('.cut-basic-track-audio')?.click());
    act(() => host.querySelector<HTMLButtonElement>('.cut-basic-track-lock')?.click());
    act(() => host.querySelector<HTMLButtonElement>('.cut-basic-track-remove')?.click());

    expect(host.querySelector('.cut-basic-track-add')).toBeNull();
    expect(onToggleTrackEnabled).toHaveBeenCalledWith(track);
    expect(onSelectClip).toHaveBeenCalledWith('video-track', 'clip-1', true);
    expect(onToggleClipMute).toHaveBeenCalledWith(track.items[0]);
    expect(onToggleTrackMute).toHaveBeenCalledWith(track);
    expect(onToggleTrackLock).toHaveBeenCalledWith(track);
    expect(onRemoveTrack).not.toHaveBeenCalled();
    expect(host.querySelector('.cut-basic-track-type-icon')).not.toBeNull();
    expect(host.querySelector('.cut-basic-track-visibility svg')).not.toBeNull();
    expect(host.querySelector('.cut-basic-track-lock svg')).not.toBeNull();
    expect(host.querySelector('.cut-basic-track-label')).toBeNull();
    expect(host.querySelector('.cut-basic-track-name')).toBeNull();
  });

  it('renders localized disabled/locked tags and removes edit handles while locked', () => {
    const track = createTrack();
    const item = track.items[0];
    if (!item || item.kind !== 'clip') throw new Error('Clip fixture missing.');
    act(() => {
      root.render(
        <TimelineTrack
          dragOver={false}
          onClipContextMenu={vi.fn()}
          onGapContextMenu={vi.fn()}
          onClipPointerDown={vi.fn()}
          onBeginTrackRename={vi.fn()}
          onCancelTrackRename={vi.fn()}
          onChangeTrackName={vi.fn()}
          onSaveTrackName={vi.fn()}
          onSelectClip={vi.fn()}
          onSelectGap={vi.fn()}
          onSelectTrack={vi.fn()}
          onTrackDragEnd={vi.fn()}
          onTrackDragOver={vi.fn()}
          onTrackDragStart={vi.fn()}
          onTrackDrop={vi.fn()}
          onTrackContextMenu={vi.fn()}
          onToggleClipMute={vi.fn()}
          onToggleTrackEnabled={vi.fn()}
          onToggleTrackLock={vi.fn()}
          onToggleTrackMute={vi.fn()}
          onRemoveTrack={vi.fn()}
          pixelsPerSecond={80}
          representations={new Map()}
          timelineWidth={800}
          track={{ ...track, items: [{ ...item, enabled: false, locked: true }] }}
          trackNameInputRef={{ current: null }}
          stackIndex={0}
        />,
      );
    });

    expect(host.querySelector('.cut-basic-clip')?.getAttribute('data-enabled')).toBe('false');
    expect(host.querySelector('.cut-basic-clip')?.getAttribute('data-locked')).toBe('true');
    expect(host.textContent).toContain('timeline.clip.disabledTag');
    expect(host.textContent).toContain('timeline.clip.lockedTag');
    expect(host.querySelector('.cut-basic-trim-handle')).toBeNull();
  });

  it('selects and opens the context menu for an explicit Gap item', () => {
    const onSelectGap = vi.fn();
    const onGapContextMenu = vi.fn();
    const track = createTrack();
    const gapTrack: TimelineTrackView = {
      ...track,
      items: [{ kind: 'gap', startSeconds: 0, durationSeconds: 1 }, ...track.items],
    };
    act(() => {
      root.render(
        <TimelineTrack
          dragOver={false}
          onClipContextMenu={vi.fn()}
          onGapContextMenu={onGapContextMenu}
          onClipPointerDown={vi.fn()}
          onBeginTrackRename={vi.fn()}
          onCancelTrackRename={vi.fn()}
          onChangeTrackName={vi.fn()}
          onSaveTrackName={vi.fn()}
          onSelectClip={vi.fn()}
          onSelectGap={onSelectGap}
          onSelectTrack={vi.fn()}
          onTrackDragEnd={vi.fn()}
          onTrackDragOver={vi.fn()}
          onTrackDragStart={vi.fn()}
          onTrackDrop={vi.fn()}
          onTrackContextMenu={vi.fn()}
          onToggleClipMute={vi.fn()}
          onToggleTrackEnabled={vi.fn()}
          onToggleTrackLock={vi.fn()}
          onToggleTrackMute={vi.fn()}
          onRemoveTrack={vi.fn()}
          pixelsPerSecond={80}
          representations={new Map()}
          timelineWidth={800}
          track={gapTrack}
          trackNameInputRef={{ current: null }}
          stackIndex={0}
        />,
      );
    });

    const gap = host.querySelector<HTMLElement>('.cut-basic-gap');
    act(() => gap?.click());
    act(() =>
      gap?.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 20 }),
      ),
    );

    expect(onSelectGap).toHaveBeenCalledWith('video-track', 0);
    expect(onGapContextMenu).toHaveBeenCalledWith(expect.anything(), gapTrack, 0);
  });

  it('deletes an unlocked optional Track through its icon control', () => {
    const onRemoveTrack = vi.fn();
    const track = { ...createTrack(), trackId: 'audio-track', kind: 'Audio' as const };
    act(() => {
      root.render(
        <TimelineTrack
          dragOver={false}
          onClipContextMenu={vi.fn()}
          onGapContextMenu={vi.fn()}
          onClipPointerDown={vi.fn()}
          onBeginTrackRename={vi.fn()}
          onCancelTrackRename={vi.fn()}
          onChangeTrackName={vi.fn()}
          onRemoveTrack={onRemoveTrack}
          onSaveTrackName={vi.fn()}
          onSelectClip={vi.fn()}
          onSelectGap={vi.fn()}
          onSelectTrack={vi.fn()}
          onToggleClipMute={vi.fn()}
          onToggleTrackEnabled={vi.fn()}
          onToggleTrackLock={vi.fn()}
          onToggleTrackMute={vi.fn()}
          onTrackContextMenu={vi.fn()}
          onTrackDragEnd={vi.fn()}
          onTrackDragOver={vi.fn()}
          onTrackDragStart={vi.fn()}
          onTrackDrop={vi.fn()}
          pixelsPerSecond={80}
          representations={new Map()}
          stackIndex={0}
          timelineWidth={800}
          track={track}
          trackNameInputRef={{ current: null }}
        />,
      );
    });

    act(() => host.querySelector<HTMLButtonElement>('.cut-basic-track-remove')?.click());

    expect(onRemoveTrack).toHaveBeenCalledWith(track);
  });
});

function createTrack(): TimelineTrackView {
  return {
    trackId: 'video-track',
    kind: 'Video',
    name: 'Video',
    enabled: true,
    locked: false,
    audioMuted: false,
    items: [
      {
        kind: 'clip',
        clipId: 'clip-1',
        name: 'Clip',
        targetUrl: '../media/clip.mp4',
        startSeconds: 0,
        durationSeconds: 3,
        sourceStartSeconds: 0,
        playbackRate: 1,
        enabled: true,
        locked: false,
        audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
      },
    ],
  };
}
