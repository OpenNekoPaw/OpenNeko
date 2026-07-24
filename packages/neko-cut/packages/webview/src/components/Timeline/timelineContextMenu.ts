import type { ReactNode } from 'react';
import type { TimelineClipView, TimelineTrackView } from '@neko-cut/domain';
import type { MenuItem } from '../ContextMenu';

export interface TimelineContextMenuLabels {
  readonly split: string;
  readonly copy: string;
  readonly duplicate: string;
  readonly enable: string;
  readonly disable: string;
  readonly lock: string;
  readonly unlock: string;
  readonly mute: string;
  readonly unmute: string;
  readonly separateAudio: string;
  readonly unseparateAudio: string;
  readonly sendToAgent: string;
  readonly deleteClip: string;
}

export interface TimelineContextMenuActions {
  readonly split: (clip: TimelineClipView) => void;
  readonly copy: (clip: TimelineClipView) => void;
  readonly duplicate: (clip: TimelineClipView) => void;
  readonly setEnabled: (clip: TimelineClipView, enabled: boolean) => void;
  readonly setLocked: (clip: TimelineClipView, locked: boolean) => void;
  readonly setMuted: (clip: TimelineClipView, muted: boolean) => void;
  readonly separateAudio: (clip: TimelineClipView) => void;
  readonly unseparateAudio: (clip: TimelineClipView) => void;
  readonly sendToAgent: (clip: TimelineClipView) => void;
  readonly deleteClip: (clip: TimelineClipView) => void;
}

export function createTimelineClipMenuItems(input: {
  readonly clip: TimelineClipView;
  readonly track: TimelineTrackView;
  readonly playheadSeconds: number;
  readonly labels: TimelineContextMenuLabels;
  readonly actions: TimelineContextMenuActions;
  readonly icons?: {
    readonly sendToAgent?: ReactNode;
  };
}): MenuItem[] {
  const { actions, clip, labels, playheadSeconds, track } = input;
  const trackKind = track.kind;
  const canSplit =
    playheadSeconds > clip.startSeconds &&
    playheadSeconds < clip.startSeconds + clip.durationSeconds;
  const items: MenuItem[] = [
    {
      label: labels.split,
      shortcut: 'S',
      disabled: !canSplit,
      onClick: () => actions.split(clip),
    },
    {
      label: labels.copy,
      shortcut: 'Cmd+C',
      onClick: () => actions.copy(clip),
    },
    {
      label: labels.duplicate,
      shortcut: 'Cmd+D',
      disabled: track.locked,
      onClick: () => actions.duplicate(clip),
    },
    {
      label: clip.enabled ? labels.disable : labels.enable,
      onClick: () => actions.setEnabled(clip, !clip.enabled),
    },
    {
      label: clip.locked ? labels.unlock : labels.lock,
      onClick: () => actions.setLocked(clip, !clip.locked),
    },
  ];
  if (trackKind !== 'Subtitle') {
    items.push({
      label: clip.audio.muted ? labels.unmute : labels.mute,
      onClick: () => actions.setMuted(clip, !clip.audio.muted),
    });
  }
  if (trackKind === 'Video') {
    items.push({
      label: clip.linkedAudioClipId ? labels.unseparateAudio : labels.separateAudio,
      onClick: () =>
        clip.linkedAudioClipId ? actions.unseparateAudio(clip) : actions.separateAudio(clip),
    });
  }
  items.push(
    {
      label: labels.sendToAgent,
      icon: input.icons?.sendToAgent,
      onClick: () => actions.sendToAgent(clip),
    },
    { label: '', separator: true, onClick: () => undefined },
    {
      label: labels.deleteClip,
      shortcut: 'Delete',
      danger: true,
      onClick: () => actions.deleteClip(clip),
    },
  );
  return items;
}
