import type { TimelineView } from '@neko-cut/domain';

export interface CutDocumentStatusSnapshot {
  readonly documentUri: string;
  readonly sessionId: string;
  readonly revision: number;
  readonly name: string;
  readonly durationSeconds: number;
  readonly trackCount: number;
  readonly clipCount: number;
  readonly dirty: boolean;
}

export function createCutDocumentStatusSnapshot(
  view: TimelineView,
  dirty: boolean,
): CutDocumentStatusSnapshot {
  return {
    documentUri: view.documentUri,
    sessionId: view.sessionId,
    revision: view.revision,
    name: view.name,
    durationSeconds: view.durationSeconds,
    trackCount: view.tracks.length,
    clipCount: view.tracks.reduce(
      (count, track) => count + track.items.filter((item) => item.kind === 'clip').length,
      0,
    ),
    dirty,
  };
}

export function formatCutDocumentStatus(
  snapshot: CutDocumentStatusSnapshot,
  labels: {
    readonly clips: (count: number) => string;
    readonly tracks: (count: number) => string;
    readonly duration: (value: string) => string;
    readonly dirty: string;
  },
): { readonly text: string; readonly tooltip: string } {
  const duration = formatDuration(snapshot.durationSeconds);
  return {
    text: `$(file-media) ${snapshot.name}${snapshot.dirty ? ' *' : ''} · ${labels.clips(snapshot.clipCount)}`,
    tooltip: [
      snapshot.name,
      labels.duration(duration),
      labels.tracks(snapshot.trackCount),
      labels.clips(snapshot.clipCount),
      ...(snapshot.dirty ? [labels.dirty] : []),
    ].join('\n'),
  };
}

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}
