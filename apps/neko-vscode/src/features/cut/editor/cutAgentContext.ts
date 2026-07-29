import type { TimelineClipView, TimelineTrackView, TimelineView } from '@neko-cut/domain';
import type { AgentContextPayload } from '@neko/shared';

export type CutAgentSelection =
  | {
      readonly kind: 'clip';
      readonly trackId: string;
      readonly clipId: string;
    }
  | {
      readonly kind: 'track';
      readonly trackId: string;
    };

export function projectCutAgentContext(
  view: TimelineView,
  selection: CutAgentSelection,
): AgentContextPayload {
  const track = view.tracks.find((candidate) => candidate.trackId === selection.trackId);
  if (!track) {
    throw new Error(`Agent context Track ${selection.trackId} is unavailable.`);
  }
  if (selection.kind === 'track') return projectTrackContext(view, track);

  const clip = track.items.find(
    (candidate) => candidate.kind === 'clip' && candidate.clipId === selection.clipId,
  );
  if (!clip || clip.kind !== 'clip') {
    throw new Error(`Agent context Clip ${selection.clipId} is unavailable.`);
  }
  return projectClipContext(view, track, clip);
}

function projectClipContext(
  view: TimelineView,
  track: TimelineTrackView,
  clip: TimelineClipView,
): AgentContextPayload {
  return {
    type: track.kind === 'Audio' ? 'audio-clip' : 'cut-clip',
    id: `${view.documentUri}#clip=${clip.clipId}`,
    label: clip.name,
    summary: `${track.kind} Clip “${clip.name}” at ${formatSeconds(clip.startSeconds)} for ${formatSeconds(clip.durationSeconds)}.`,
    data: {
      schemaVersion: 1,
      document: documentIdentity(view),
      selection: {
        kind: 'clip',
        trackId: track.trackId,
        clipId: clip.clipId,
      },
      track: trackSummary(track),
      clip: {
        name: clip.name,
        targetUrl: clip.targetUrl,
        timelineStartSeconds: clip.startSeconds,
        durationSeconds: clip.durationSeconds,
        sourceStartSeconds: clip.sourceStartSeconds,
        playbackRate: clip.playbackRate,
        enabled: clip.enabled,
        locked: clip.locked,
        audio: clip.audio,
      },
    },
  };
}

function projectTrackContext(view: TimelineView, track: TimelineTrackView): AgentContextPayload {
  const clips = track.items.filter(
    (candidate): candidate is TimelineClipView => candidate.kind === 'clip',
  );
  return {
    type: track.kind === 'Audio' ? 'audio-clip' : 'cut-clip',
    id: `${view.documentUri}#track=${track.trackId}`,
    label: track.name,
    summary: `${track.kind} Track “${track.name}” containing ${clips.length} Clip${clips.length === 1 ? '' : 's'}.`,
    data: {
      schemaVersion: 1,
      document: documentIdentity(view),
      selection: { kind: 'track', trackId: track.trackId },
      track: {
        ...trackSummary(track),
        clips: clips.map((clip) => ({
          clipId: clip.clipId,
          name: clip.name,
          timelineStartSeconds: clip.startSeconds,
          durationSeconds: clip.durationSeconds,
          targetUrl: clip.targetUrl,
        })),
      },
    },
  };
}

function documentIdentity(view: TimelineView) {
  return {
    documentUri: view.documentUri,
    sessionId: view.sessionId,
    revision: view.revision,
    name: view.name,
  };
}

function trackSummary(track: TimelineTrackView) {
  return {
    trackId: track.trackId,
    name: track.name,
    kind: track.kind,
    enabled: track.enabled,
    locked: track.locked,
    audioMuted: track.audioMuted,
  };
}

function formatSeconds(value: number): string {
  return `${value.toFixed(2)}s`;
}
