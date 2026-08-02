import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_CUT_HOST_PRESENTATION, type TimelineView } from '@neko/cut-domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CutWebviewRoot, type CutWebviewHostBridge } from './root';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('CutWebviewRoot runtime projection', () => {
  let container: HTMLDivElement;
  let timelineTarget: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, {
      IS_REACT_ACT_ENVIRONMENT: true,
      ResizeObserver: TestResizeObserver,
    });
    container = document.createElement('div');
    timelineTarget = document.createElement('div');
    document.body.append(container, timelineTarget);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    timelineTarget.remove();
    vi.restoreAllMocks();
  });

  it('renders a bounded Video/Audio/Subtitle OTIO projection in the host timeline slot', async () => {
    const listeners = new Set<(message: unknown) => void>();
    const bridge: CutWebviewHostBridge = {
      postIntent: (intent) => {
        if (intent.type !== 'cut:ready') return;
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({
              type: 'cut:runtime-snapshot',
              view: createFourTrackView(),
              dirty: false,
              presentation: DEFAULT_CUT_HOST_PRESENTATION,
            });
          }
        });
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    await act(async () => {
      root.render(
        <CutWebviewRoot bridge={bridge} locale="zh-cn" timelineTarget={timelineTarget} />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Cut 意外停止');
    expect(container.querySelector('.cut-basic-preview')).not.toBeNull();
    expect(timelineTarget.querySelector('.cut-basic-timeline-region--host')).not.toBeNull();
    expect(timelineTarget.querySelector('[aria-label="Video 1"]')).not.toBeNull();
    expect(timelineTarget.querySelector('[aria-label="Subtitle 1"]')).not.toBeNull();
  });

  it('renders the package-owned Timeline without duplicating the editor surface', async () => {
    const listeners = new Set<(message: unknown) => void>();
    const bridge: CutWebviewHostBridge = {
      postIntent: (intent) => {
        if (intent.type !== 'cut:ready') return;
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({
              type: 'cut:runtime-snapshot',
              view: createFourTrackView(),
              dirty: false,
              presentation: DEFAULT_CUT_HOST_PRESENTATION,
            });
          }
        });
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    await act(async () => {
      root.render(<CutWebviewRoot bridge={bridge} locale="zh-cn" presentation="timeline-only" />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-cut-presentation="timeline-only"]')).not.toBeNull();
    expect(container.querySelector('.cut-basic-timeline-region--host')).not.toBeNull();
    expect(container.querySelector('.cut-basic-preview')).toBeNull();
  });
});

function createFourTrackView(): TimelineView {
  return {
    documentUri: '.functional/cut-second.otio',
    sessionId: 'cut-session-2',
    revision: 0,
    name: 'Cut second',
    profile: {
      profile: 'tv-1080p',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1920,
      height: 1080,
    },
    tracks: [
      {
        trackId: 'video-1',
        name: 'Video 1',
        kind: 'Video',
        enabled: true,
        locked: false,
        audioMuted: false,
        items: [
          {
            kind: 'clip',
            clipId: 'clip-1',
            name: '720P.mp4',
            targetUrl: '../cases/720P.mp4',
            startSeconds: 0,
            durationSeconds: 21.266666666666666,
            sourceStartSeconds: 17.933333333333334,
            sourceAvailableStartSeconds: 17.933333333333334,
            sourceAvailableDurationSeconds: 21.266666666666666,
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
          {
            kind: 'clip',
            clipId: 'clip-2',
            name: 'external-test.mp4',
            targetUrl: 'media/external-test.mp4',
            startSeconds: 21.266666666666666,
            durationSeconds: 5.033333333333333,
            sourceStartSeconds: 0,
            sourceAvailableStartSeconds: 0,
            sourceAvailableDurationSeconds: 5.033333333333333,
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
      emptyTrack('audio-1', 'Audio 1', 'Audio'),
      emptyTrack('subtitle-1', 'Subtitle 1', 'Subtitle'),
      emptyTrack('audio-2', 'Audio 2', 'Audio'),
    ],
    durationSeconds: 26.299999999999997,
  };
}

function emptyTrack(
  trackId: string,
  name: string,
  kind: 'Audio' | 'Subtitle',
): TimelineView['tracks'][number] {
  return {
    trackId,
    name,
    kind,
    enabled: true,
    locked: false,
    audioMuted: false,
    items: [],
  };
}
