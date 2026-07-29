import type { TimelineClipView } from '@neko-cut/domain';
import { describe, expect, it, vi } from 'vitest';
import { createTimelineClipMenuItems } from './timelineContextMenu';

const clip: TimelineClipView = {
  kind: 'clip',
  clipId: 'clip-1',
  name: 'Shot',
  targetUrl: './media/shot.mp4',
  startSeconds: 2,
  durationSeconds: 3,
  sourceStartSeconds: 0,
  sourceAvailableDurationSeconds: 10,
  playbackRate: 1,
  enabled: true,
  locked: false,
  audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
};

describe('Timeline Clip context menu', () => {
  it('dispatches basic editing actions for the explicit Clip', () => {
    const actions = {
      split: vi.fn(),
      copy: vi.fn(),
      duplicate: vi.fn(),
      setEnabled: vi.fn(),
      setLocked: vi.fn(),
      setMuted: vi.fn(),
      separateAudio: vi.fn(),
      unseparateAudio: vi.fn(),
      sendToAgent: vi.fn(),
      deleteClip: vi.fn(),
    };
    const items = createTimelineClipMenuItems({
      clip,
      track: track('Video'),
      playheadSeconds: 3,
      labels: labels(),
      actions,
    });

    expect(items[0]?.disabled).toBe(false);
    expect(items.map((item) => item.label)).not.toContain('Lock Track');
    expect(items.map((item) => item.label)).not.toContain('Hide Track');
    items[0]?.onClick();
    items[1]?.onClick();
    items[2]?.onClick();
    items[3]?.onClick();
    items[4]?.onClick();
    items[5]?.onClick();
    items[6]?.onClick();
    items[7]?.onClick();
    items[9]?.onClick();

    expect(actions.split).toHaveBeenCalledWith(clip);
    expect(actions.copy).toHaveBeenCalledWith(clip);
    expect(actions.duplicate).toHaveBeenCalledWith(clip);
    expect(actions.setEnabled).toHaveBeenCalledWith(clip, false);
    expect(actions.setLocked).toHaveBeenCalledWith(clip, true);
    expect(actions.setMuted).toHaveBeenCalledWith(clip, true);
    expect(actions.separateAudio).toHaveBeenCalledWith(clip);
    expect(actions.sendToAgent).toHaveBeenCalledWith(clip);
    expect(actions.deleteClip).toHaveBeenCalledWith(clip);
  });

  it('disables split outside the Clip and omits media audio actions for subtitles', () => {
    const items = createTimelineClipMenuItems({
      clip,
      track: track('Subtitle'),
      playheadSeconds: 0,
      labels: labels(),
      actions: {
        split: vi.fn(),
        copy: vi.fn(),
        duplicate: vi.fn(),
        setEnabled: vi.fn(),
        setLocked: vi.fn(),
        setMuted: vi.fn(),
        separateAudio: vi.fn(),
        unseparateAudio: vi.fn(),
        sendToAgent: vi.fn(),
        deleteClip: vi.fn(),
      },
    });
    expect(items[0]?.disabled).toBe(true);
    expect(items.map((item) => item.label)).toEqual([
      'Split',
      'Copy',
      'Duplicate',
      'Disable',
      'Lock Clip',
      'Send to Agent',
      '',
      'Delete',
    ]);
  });
});

function labels() {
  return {
    split: 'Split',
    copy: 'Copy',
    duplicate: 'Duplicate',
    enable: 'Enable',
    disable: 'Disable',
    lock: 'Lock Clip',
    unlock: 'Unlock Clip',
    mute: 'Mute',
    unmute: 'Unmute',
    separateAudio: 'Separate',
    unseparateAudio: 'Unseparate',
    sendToAgent: 'Send to Agent',
    deleteClip: 'Delete',
  };
}

function track(kind: 'Video' | 'Audio' | 'Subtitle') {
  return {
    trackId: `${kind.toLowerCase()}-1`,
    name: kind,
    kind,
    enabled: true,
    locked: false,
    audioMuted: false,
    items: [clip],
  };
}
