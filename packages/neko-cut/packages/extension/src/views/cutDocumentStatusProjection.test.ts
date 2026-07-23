import type { TimelineView } from '@neko-cut/domain';
import { describe, expect, it } from 'vitest';
import {
  createCutDocumentStatusSnapshot,
  formatCutDocumentStatus,
} from './cutDocumentStatusProjection';

describe('Cut document status projection', () => {
  it('projects one explicit document/session without owning editor state', () => {
    const snapshot = createCutDocumentStatusSnapshot(view(), true);
    const projection = formatCutDocumentStatus(snapshot, {
      clips: (count) => `${count} clips`,
      tracks: (count) => `${count} tracks`,
      duration: (value) => `Duration: ${value}`,
      dirty: 'Unsaved changes',
    });

    expect(snapshot).toMatchObject({
      documentUri: 'file:///workspace/cut.otio',
      sessionId: 'session-1',
      revision: 2,
      trackCount: 2,
      clipCount: 1,
      dirty: true,
    });
    expect(projection.text).toBe('$(file-media) Cut * · 1 clips');
    expect(projection.tooltip).toContain('Duration: 01:05');
  });
});

function view(): TimelineView {
  return {
    documentUri: 'file:///workspace/cut.otio',
    sessionId: 'session-1',
    revision: 2,
    name: 'Cut',
    durationSeconds: 65.4,
    tracks: [
      {
        trackId: 'video',
        name: 'Video',
        kind: 'Video',
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
            durationSeconds: 65.4,
            sourceStartSeconds: 0,
            playbackRate: 1,
            enabled: true,
            locked: false,
            audio: {
              muted: false,
              gainDb: 0,
              fadeInSeconds: 0,
              fadeOutSeconds: 0,
            },
          },
        ],
      },
      {
        trackId: 'audio',
        name: 'Audio',
        kind: 'Audio',
        enabled: true,
        locked: false,
        audioMuted: false,
        items: [],
      },
    ],
  };
}
