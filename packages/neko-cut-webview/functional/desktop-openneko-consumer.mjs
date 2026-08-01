import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openFixtureWorkspace,
  readFetchStatus,
  replaceWorkbench,
} from '../../../scripts/desktop-functional/desktop-operations.mjs';
import { createDesktopMediaFixtureSet } from '../../../scripts/desktop-functional/media-fixtures.mjs';

export const cutOpenNekoConsumerScenario = Object.freeze({
  id: 'cut-openneko-consumer',
  owner: 'neko-cut-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const editsRoot = join(workspacePath, 'edits');
    await mkdir(editsRoot, { recursive: true });
    const media = await createDesktopMediaFixtureSet(workspacePath);
    await writeFile(
      join(editsRoot, 'qualification.otio'),
      `${JSON.stringify(cutTimeline(), null, 2)}\n`,
    );
    return { workspacePath, media, documentId: 'edits/qualification.otio' };
  },
  async run({ click, evaluate, prepared, waitForSelector }) {
    await openFixtureWorkspace(evaluate);
    await replaceWorkbench(
      evaluate,
      `(projection, current, tab, project) => ({
        ...current,
        revision: current.revision + 1,
        display: { ...current.display, mode: 'main-only' },
        main: {
          views: [{
            viewId: 'cut:functional',
            viewEpoch: tab.viewEpoch,
            projectId: project.projectId,
            workspaceId: project.workspaceId,
            kind: 'cut',
            ownerId: 'cut:functional',
            displayLabel: 'qualification.otio',
            documentId: ${JSON.stringify(prepared.documentId)},
          }],
          groups: [{ groupId: 'main:primary', viewIds: ['cut:functional'], activeViewId: 'cut:functional' }],
          activeGroupId: 'main:primary',
        },
        timeline: { presentation: 'docked', ownerViewId: 'cut:functional', height: 240 },
      })`,
    );
    await waitForSelector('[data-owner-root="cut"] [data-testid="cut-preview-toggle-playback"]');
    await waitForCutReady(evaluate);
    await evaluate(`(() => {
      window.__openNekoCutClickEvidence = [];
      document.querySelector('[data-testid="cut-preview-toggle-playback"]')?.addEventListener(
        'click',
        (event) => window.__openNekoCutClickEvidence.push({ trusted: event.isTrusted }),
      );
      return true;
    })()`);
    await click('[data-testid="cut-preview-toggle-playback"]');
    const playing = await waitForCutPlayback(evaluate);
    await click('[data-testid="cut-preview-toggle-playback"]');
    await click('[data-cut-track-id="audio-1"]', 0, { xRatio: 0.32 });
    const seeked = await waitForCutSeek(evaluate, playing.url);
    const releasedStatus = await waitForReleasedUrl(evaluate, playing.url);
    return {
      ownerRoot: 'cut',
      nativeVideo: true,
      changingFrames: playing.firstFrame !== playing.secondFrame,
      advancedFrom: playing.startTime,
      advancedTo: playing.endTime,
      seekedTo: seeked.currentTime,
      generationChanged: seeked.url !== playing.url,
      releasedStatus,
    };
  },
  assertObservation(observation, evidence) {
    if (observation.openNekoResourceRequestCount < 2) {
      throw new Error('Cut did not reach the OpenNeko resource handler.');
    }
    if (observation.pcmResponseCount < 1) {
      throw new Error('Cut did not consume mixed OpenNeko PCM.');
    }
    if (!evidence.changingFrames || evidence.advancedTo <= evidence.advancedFrom) {
      throw new Error('Cut package-owned playback did not advance changing frames.');
    }
    if (!evidence.generationChanged || evidence.releasedStatus !== 0) {
      throw new Error('Cut seek did not replace and release its prior generation.');
    }
  },
});

async function waitForCutPlayback(evaluate) {
  const deadline = Date.now() + 30_000;
  let first;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(cutVideoSampleExpression());
    last = sample;
    if (sample?.url?.startsWith('openneko://resource/') && sample.currentTime > 0.15) {
      if (!first) {
        first = sample;
      } else if (sample.currentTime > first.currentTime + 0.15) {
        return {
          url: sample.url,
          startTime: first.currentTime,
          endTime: sample.currentTime,
          firstFrame: first.frame,
          secondFrame: sample.frame,
        };
      }
    }
    await delay(100);
  }
  throw new Error(
    `Cut package-owned playback did not advance before timeout: ${JSON.stringify(last)}`,
  );
}

async function waitForCutReady(evaluate) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ready = await evaluate(`(() => {
      const output = document.querySelector('.cut-preview-controls output')?.textContent ?? '';
      return output.includes('00:04.00') &&
        document.querySelectorAll('.cut-basic-clip').length === 2;
    })()`);
    if (ready) return;
    await delay(100);
  }
  throw new Error('Cut package-owned OTIO View did not become ready before timeout.');
}

async function waitForCutSeek(evaluate, previousUrl) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(cutVideoSampleExpression());
    last = sample;
    if (
      sample?.url?.startsWith('openneko://resource/') &&
      sample.url !== previousUrl &&
      sample.currentTime > 1
    ) {
      return sample;
    }
    await delay(100);
  }
  throw new Error(
    `Cut package-owned seek did not publish a replacement generation: ${JSON.stringify(last)}`,
  );
}

async function waitForReleasedUrl(evaluate, url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const status = await readFetchStatus(evaluate, url);
    if (status === 0) return status;
    await delay(100);
  }
  throw new Error('Cut prior playback generation remained reachable after seek.');
}

function cutVideoSampleExpression() {
  return `(() => {
    const root = document.querySelector('[data-owner-root="cut"]');
    const videos = [...document.querySelectorAll('[data-owner-root="cut"] video')];
    const video = videos.find((candidate) => candidate.getAttribute('aria-hidden') !== 'true' && candidate.src);
    const button = root?.querySelector('[data-testid="cut-preview-toggle-playback"]');
    if (!(video instanceof HTMLVideoElement)) return {
      videoCount: videos.length,
      buttonLabel: button?.getAttribute('aria-label'),
      alerts: [...(root?.querySelectorAll('[role="alert"]') ?? [])].map((item) => item.textContent),
      output: root?.querySelector('.cut-preview-controls output')?.textContent,
      clickEvidence: window.__openNekoCutClickEvidence,
    };
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return {
      url: video.src,
      currentSrc: video.currentSrc,
      currentTime: video.currentTime,
      readyState: video.readyState,
      paused: video.paused,
      errorCode: video.error?.code,
      buttonLabel: button?.getAttribute('aria-label'),
      clickEvidence: window.__openNekoCutClickEvidence,
      frame: video.getVideoPlaybackQuality().totalVideoFrames,
    };
    const frame = video.getVideoPlaybackQuality().totalVideoFrames;
    return {
      url: video.src,
      currentSrc: video.currentSrc,
      currentTime: video.currentTime,
      readyState: video.readyState,
      paused: video.paused,
      errorCode: video.error?.code,
      buttonLabel: button?.getAttribute('aria-label'),
      clickEvidence: window.__openNekoCutClickEvidence,
      frame,
    };
  })()`;
}

function cutTimeline() {
  return {
    OTIO_SCHEMA: 'Timeline.1',
    name: 'OpenNeko Functional Cut',
    global_start_time: null,
    metadata: {
      openneko: {
        cut: {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        },
      },
    },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'Tracks',
      metadata: {},
      children: [
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'Video 1',
          kind: 'Video',
          metadata: { openneko: { cut: { trackId: 'video-1' } } },
          children: [
            {
              OTIO_SCHEMA: 'Clip.2',
              name: 'Motion A with mixed audio',
              media_reference: {
                OTIO_SCHEMA: 'ExternalReference.1',
                target_url: '../media/motion-with-audio.mp4',
                metadata: {},
              },
              source_range: timeRange(0, 60),
              metadata: { openneko: { cut: { clipId: 'clip-motion-a' } } },
              enabled: true,
              effects: [],
              markers: [],
            },
            {
              OTIO_SCHEMA: 'Clip.2',
              name: 'Motion B with mixed audio',
              media_reference: {
                OTIO_SCHEMA: 'ExternalReference.1',
                target_url: '../media/motion-with-audio.mp4',
                metadata: {},
              },
              source_range: timeRange(60, 60),
              metadata: { openneko: { cut: { clipId: 'clip-motion-b' } } },
              enabled: true,
              effects: [],
              markers: [],
            },
          ],
        },
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'Audio 1',
          kind: 'Audio',
          metadata: { openneko: { cut: { trackId: 'audio-1' } } },
          children: [],
        },
      ],
    },
  };
}

function timeRange(startValue, durationValue) {
  return {
    OTIO_SCHEMA: 'TimeRange.1',
    start_time: { OTIO_SCHEMA: 'RationalTime.1', value: startValue, rate: 30 },
    duration: { OTIO_SCHEMA: 'RationalTime.1', value: durationValue, rate: 30 },
  };
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
