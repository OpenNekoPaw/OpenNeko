// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineView } from '@neko-cut/domain';
import type { CutOtioController } from '../../controllers/CutOtioController';
import {
  CutOtioControllerProvider,
  useCutOtioController,
} from '../../controllers/CutOtioControllerContext';
import {
  createCutPresentationStore,
  CutPresentationStoreProvider,
} from '../../stores/cut-presentation-store';
import {
  PropertyPanelInline,
  projectCanvasCommandForPreset,
  projectClipForPropertyForm,
} from './PropertyPanelInline';
import { projectCanvasPresetId } from './projectCanvasPresets';

const postMessage = vi.hoisted(() => vi.fn());

vi.mock('../../utils/vscodeApi', () => ({ postMessage }));
vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('./PropertyPanel', () => ({
  PropertyPanel: (props: {
    element: {
      id: string;
      duration: number;
      startTime: number;
      trimStart: number;
      trimEnd: number;
    } | null;
    onElementCommit?: (id: string, changes: Record<string, unknown>) => void;
  }) => (
    <div>
      <button
        onClick={() =>
          props.element && props.onElementCommit?.(props.element.id, { name: 'Renamed' })
        }
        type="button"
      >
        rename
      </button>
      <button
        onClick={() =>
          props.element && props.onElementCommit?.(props.element.id, { speed: { speed: 2 } })
        }
        type="button"
      >
        speed
      </button>
      <button
        onClick={() =>
          props.element &&
          props.onElementCommit?.(props.element.id, {
            audio: { muted: true, gain: -3, fadeIn: 0.2, fadeOut: 0.3 },
          })
        }
        type="button"
      >
        audio
      </button>
      <button
        onClick={() =>
          props.element &&
          props.onElementCommit?.(props.element.id, {
            trimStart: props.element.trimStart + 0.5,
          })
        }
        type="button"
      >
        trim-start
      </button>
      <button
        onClick={() =>
          props.element &&
          props.onElementCommit?.(props.element.id, {
            trimEnd: props.element.trimEnd + 0.5,
          })
        }
        type="button"
      >
        trim-end
      </button>
      <button
        onClick={() =>
          props.element &&
          props.onElementCommit?.(props.element.id, {
            duration: props.element.duration,
          })
        }
        type="button"
      >
        same-duration
      </button>
      <button
        onClick={() =>
          props.element &&
          props.onElementCommit?.(props.element.id, {
            trimEnd: props.element.trimEnd,
          })
        }
        type="button"
      >
        same-trim-end
      </button>
    </div>
  ),
}));

describe('PropertyPanelInline OTIO adapter', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    postMessage.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('maps retained form edits and explicit separation to revisioned Host intents', () => {
    const store = createCutPresentationStore();
    let controller: CutOtioController | undefined;
    store.setState({
      view: createView(),
      selection: { kind: 'clip', trackId: 'video-track', clipId: 'clip-1' },
    });
    act(() => {
      root.render(
        <CutPresentationStoreProvider store={store}>
          <CutOtioControllerProvider>
            <ControllerCapture
              onController={(value) => {
                controller = value;
              }}
            />
            <PropertyPanelInline mode="basic" />
          </CutOtioControllerProvider>
        </CutPresentationStoreProvider>,
      );
    });

    click('rename');
    acknowledgeMutation(controller, store, 8);
    click('speed');
    acknowledgeMutation(controller, store, 9);
    click('audio');
    acknowledgeMutation(controller, store, 10);
    click('timeline.contextMenu.separateAudio');

    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      expect.objectContaining({
        type: 'cut:command',
        expectedRevision: 7,
        command: { type: 'rename-clip', clipId: 'clip-1', name: 'Renamed' },
      }),
      expect.objectContaining({
        type: 'cut:command',
        expectedRevision: 8,
        command: { type: 'set-playback-rate', clipId: 'clip-1', playbackRate: 2 },
      }),
      expect.objectContaining({
        type: 'cut:command',
        expectedRevision: 9,
        command: {
          type: 'set-audio',
          clipId: 'clip-1',
          settings: { muted: true, gainDb: -3, fadeInSeconds: 0.2, fadeOutSeconds: 0.3 },
        },
      }),
      expect.objectContaining({
        type: 'cut:separate',
        expectedRevision: 10,
        videoClipId: 'clip-1',
      }),
    ]);
  });

  it('projects independent trim edges and submits signed edge deltas', () => {
    const view = createView();
    const track = view.tracks[0];
    const clip = track?.items[0];
    if (!track || clip?.kind !== 'clip') throw new Error('Clip fixture missing.');
    const projected = projectClipForPropertyForm(track, {
      ...clip,
      sourceAvailableStartSeconds: 5,
      sourceAvailableDurationSeconds: 20,
      sourceStartSeconds: 8,
      durationSeconds: 4,
      playbackRate: 2,
    });
    expect(projected).toMatchObject({ duration: 10, trimStart: 1.5, trimEnd: 4.5 });

    const store = createCutPresentationStore();
    let controller: CutOtioController | undefined;
    store.setState({
      view,
      selection: { kind: 'clip', trackId: 'video-track', clipId: 'clip-1' },
    });
    act(() => {
      root.render(
        <CutPresentationStoreProvider store={store}>
          <CutOtioControllerProvider>
            <ControllerCapture
              onController={(value) => {
                controller = value;
              }}
            />
            <PropertyPanelInline mode="basic" />
          </CutOtioControllerProvider>
        </CutPresentationStoreProvider>,
      );
    });
    click('trim-start');
    acknowledgeMutation(controller, store, 8);
    click('trim-end');

    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      expect.objectContaining({
        command: {
          type: 'trim',
          clipId: 'clip-1',
          startDeltaFrames: 15,
          endDeltaFrames: 0,
        },
      }),
      expect.objectContaining({
        command: {
          type: 'trim',
          clipId: 'clip-1',
          startDeltaFrames: 0,
          endDeltaFrames: 15,
        },
      }),
    ]);
  });

  it('formats frame-derived seconds without submitting same-frame values', () => {
    const view = createView();
    const track = view.tracks[0];
    const clip = track?.items[0];
    if (!track || clip?.kind !== 'clip') throw new Error('Clip fixture missing.');
    const durationSeconds = 638 / 30;
    const noisyClip = {
      ...clip,
      durationSeconds,
      sourceAvailableDurationSeconds: durationSeconds + 4e-15,
    };
    const projected = projectClipForPropertyForm(track, noisyClip);

    expect(projected).toMatchObject({
      duration: 21.267,
      trimEnd: 0,
    });

    const store = createCutPresentationStore();
    store.setState({
      view: {
        ...view,
        durationSeconds,
        tracks: [{ ...track, items: [noisyClip] }],
      },
      selection: { kind: 'clip', trackId: track.trackId, clipId: noisyClip.clipId },
    });
    act(() => {
      root.render(
        <CutPresentationStoreProvider store={store}>
          <CutOtioControllerProvider>
            <PropertyPanelInline mode="basic" />
          </CutOtioControllerProvider>
        </CutPresentationStoreProvider>,
      );
    });

    click('same-duration');
    click('same-trim-end');

    expect(postMessage).not.toHaveBeenCalled();
  });

  it('adapts the retained Track Inspector to revisioned state and Agent intents', () => {
    const store = createCutPresentationStore();
    let controller: CutOtioController | undefined;
    store.setState({
      view: createView(),
      selection: { kind: 'track', trackId: 'video-track' },
    });
    act(() => {
      root.render(
        <CutPresentationStoreProvider store={store}>
          <CutOtioControllerProvider>
            <ControllerCapture
              onController={(value) => {
                controller = value;
              }}
            />
            <PropertyPanelInline mode="basic" />
          </CutOtioControllerProvider>
        </CutPresentationStoreProvider>,
      );
    });

    const name = host.querySelector<HTMLInputElement>(
      'input[aria-label="propertyPanel.basic.name"]',
    );
    expect(name).not.toBeNull();
    if (!name) throw new Error('Track name input is missing.');
    act(() => {
      name.value = 'Renamed Track';
      name.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    acknowledgeMutation(controller, store, 8);
    const enabled = host.querySelector<HTMLInputElement>(
      'input[aria-label="propertyPanel.track.enabled"]',
    );
    expect(enabled).not.toBeNull();
    act(() => enabled?.click());
    acknowledgeMutation(controller, store, 9);
    click('timeline.contextMenu.sendToAgent');

    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      expect.objectContaining({
        type: 'cut:command',
        expectedRevision: 7,
        command: {
          type: 'rename-track',
          trackId: 'video-track',
          name: 'Renamed Track',
        },
      }),
      expect.objectContaining({
        type: 'cut:command',
        expectedRevision: 8,
        command: {
          type: 'set-track-enabled',
          trackId: 'video-track',
          enabled: false,
        },
      }),
      expect.objectContaining({
        type: 'cut:send-to-agent',
        expectedRevision: 9,
        selection: { kind: 'track', trackId: 'video-track' },
      }),
    ]);
  });

  it('renders localized Project Canvas presets and maps short-video to one typed command', () => {
    const store = createCutPresentationStore();
    store.setState({ view: createView(), selection: undefined });
    act(() => {
      root.render(
        <CutPresentationStoreProvider store={store}>
          <CutOtioControllerProvider>
            <PropertyPanelInline mode="basic" />
          </CutOtioControllerProvider>
        </CutPresentationStoreProvider>,
      );
    });

    const canvasPreset = host.querySelector(
      '[role="combobox"][aria-label="propertyPanel.project.canvasPreset"]',
    );
    expect(canvasPreset).not.toBeNull();
    expect(canvasPreset?.closest('[data-property-id="project.canvasPreset"]')).not.toBeNull();
    expect(projectCanvasCommandForPreset('short-video')).toEqual({
      type: 'set-project-canvas',
      profile: 'short-video-1080p',
      width: 1080,
      height: 1920,
    });
    expect(projectCanvasPresetId({ width: 1280, height: 720 })).toBe('custom');
  });

  it('groups Project, Track and Gap contexts in one continuous surface without tabs', () => {
    const store = createCutPresentationStore();
    const view = createView();
    const videoTrack = view.tracks[0];
    if (!videoTrack) throw new Error('Video Track fixture is missing.');
    const viewWithGap: TimelineView = {
      ...view,
      durationSeconds: 5,
      tracks: [
        {
          ...videoTrack,
          items: [...videoTrack.items, { kind: 'gap', startSeconds: 3, durationSeconds: 2 }],
        },
      ],
    };
    const render = () => {
      act(() => {
        root.render(
          <CutPresentationStoreProvider store={store}>
            <CutOtioControllerProvider>
              <PropertyPanelInline mode="basic" />
            </CutOtioControllerProvider>
          </CutPresentationStoreProvider>,
        );
      });
    };
    const groupLabels = () =>
      Array.from(host.querySelectorAll('.cut-inspector-group')).map((section) =>
        section.getAttribute('aria-label'),
      );

    store.setState({ view: viewWithGap, selection: undefined });
    render();
    expect(groupLabels()).toEqual(['propertyPanel.group.canvas', 'propertyPanel.group.timeline']);

    act(() => store.setState({ selection: { kind: 'track', trackId: 'video-track' } }));
    expect(groupLabels()).toEqual(['propertyPanel.group.basic', 'propertyPanel.group.state']);

    act(() =>
      store.setState({
        selection: { kind: 'gap', trackId: 'video-track', itemIndex: 1 },
      }),
    );
    expect(groupLabels()).toEqual(['propertyPanel.group.location', 'propertyPanel.group.range']);
    expect(host.querySelector('[role="tab"], [role="tablist"]')).toBeNull();
  });

  function click(label: string): void {
    const button = Array.from(host.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === label,
    );
    expect(button).toBeDefined();
    act(() => button?.click());
  }
});

function ControllerCapture(props: {
  readonly onController: (controller: CutOtioController) => void;
}) {
  props.onController(useCutOtioController());
  return null;
}

function acknowledgeMutation(
  controller: CutOtioController | undefined,
  store: ReturnType<typeof createCutPresentationStore>,
  revision: number,
): void {
  if (!controller) throw new Error('Cut controller is unavailable.');
  const current = store.getState().view;
  if (!current) throw new Error('TimelineView fixture is unavailable.');
  const sent = postMessage.mock.calls[postMessage.mock.calls.length - 1]?.[0] as
    { readonly clientMutationId?: string } | undefined;
  if (!sent?.clientMutationId) throw new Error('Mutation intent is missing its client identity.');
  controller.acceptHostMessage({
    type: 'cut:view',
    view: { ...current, revision },
  });
  controller.acceptHostMessage({
    type: 'cut:mutation-result',
    clientMutationId: sent.clientMutationId,
    succeeded: true,
    revision,
  });
}

function createView(): TimelineView {
  return {
    documentUri: 'file:///workspace/cut.otio',
    sessionId: 'session-1',
    revision: 7,
    name: 'Cut',
    durationSeconds: 3,
    profile: {
      profile: 'tv-1080p',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1920,
      height: 1080,
    },
    tracks: [
      {
        trackId: 'video-track',
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
            durationSeconds: 3,
            sourceStartSeconds: 0,
            sourceAvailableStartSeconds: 0,
            sourceAvailableDurationSeconds: 3,
            playbackRate: 1,
            enabled: true,
            locked: false,
            audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
          },
        ],
      },
    ],
  };
}
