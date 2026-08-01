import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openFixtureWorkspace,
  readFetchStatus,
  replaceWorkbench,
} from '../../../scripts/desktop-functional/desktop-operations.mjs';
import { createDesktopMediaFixtureSet } from '../../../scripts/desktop-functional/media-fixtures.mjs';

export const canvasOpenNekoConsumerScenario = Object.freeze({
  id: 'canvas-openneko-consumer',
  owner: 'neko-canvas-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const boardsRoot = join(workspacePath, 'boards');
    await mkdir(boardsRoot, { recursive: true });
    const media = await createDesktopMediaFixtureSet(workspacePath);
    await Promise.all([
      writeFile(
        join(boardsRoot, 'video.nkc'),
        `${JSON.stringify(canvasDocument('Video View', 'video-node', media.video, 'video'), null, 2)}\n`,
      ),
      writeFile(
        join(boardsRoot, 'audio.nkc'),
        `${JSON.stringify(canvasDocument('Audio View', 'audio-node', media.audio, 'audio'), null, 2)}\n`,
      ),
    ]);
    return {
      workspacePath,
      videoDocumentId: 'boards/video.nkc',
      audioDocumentId: 'boards/audio.nkc',
    };
  },
  async run({ checkpoint, click, evaluate, hover, prepared, waitForSelector }) {
    await openFixtureWorkspace(evaluate);
    await replaceWorkbench(
      evaluate,
      `(projection, current, tab, project) => ({
        ...current,
        revision: current.revision + 1,
        display: { ...current.display, mode: 'main-only' },
        main: {
          views: [
            {
              viewId: 'canvas:functional:video',
              viewEpoch: tab.viewEpoch,
              projectId: project.projectId,
              workspaceId: project.workspaceId,
              kind: 'canvas',
              ownerId: 'canvas:functional:video',
              displayLabel: 'video.nkc',
              documentId: ${JSON.stringify(prepared.videoDocumentId)},
            },
            {
              viewId: 'canvas:functional:audio',
              viewEpoch: tab.viewEpoch,
              projectId: project.projectId,
              workspaceId: project.workspaceId,
              kind: 'canvas',
              ownerId: 'canvas:functional:audio',
              displayLabel: 'audio.nkc',
              documentId: ${JSON.stringify(prepared.audioDocumentId)},
            },
          ],
          groups: [
            {
              groupId: 'main:primary',
              viewIds: ['canvas:functional:video'],
              activeViewId: 'canvas:functional:video',
            },
            {
              groupId: 'main:secondary',
              viewIds: ['canvas:functional:audio'],
              activeViewId: 'canvas:functional:audio',
            },
          ],
          activeGroupId: 'main:primary',
          split: { axis: 'columns', ratio: 0.5 },
        },
        timeline: { presentation: 'hidden', height: 240 },
      })`,
    );
    await waitForSelector('[data-owner-root="canvas"]');
    await waitForCanvasRoots(evaluate);
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-media-node"][data-media-type="video"]',
    );
    await hover(
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-media-node"][data-media-type="video"]',
    );
    await waitForCanvasPackagePlaybackState(evaluate, 'canvas:functional:video', 'video');
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-preview-surface="video"] [data-testid="canvas-video-toggle-playback"]',
    );
    const videoPlayback = await ensureCanvasMediaPlayback(
      click,
      evaluate,
      'canvas:functional:video',
      'video',
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-video-toggle-playback"]',
    );
    checkpoint('canvas-video-playing', { currentTime: videoPlayback.currentTime });
    await hover(
      '[data-owner-view-id="canvas:functional:audio"] [data-testid="canvas-audio-node-title"]',
    );
    await waitForCanvasPackagePlaybackState(evaluate, 'canvas:functional:audio', 'audio');
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:audio"] [data-preview-surface="audio"] [data-testid="canvas-audio-toggle-playback"]',
    );
    const audioPlayback = await ensureCanvasMediaPlayback(
      click,
      evaluate,
      'canvas:functional:audio',
      'audio',
      '[data-owner-view-id="canvas:functional:audio"] [data-testid="canvas-audio-toggle-playback"]',
    );
    checkpoint('canvas-audio-playing', { currentTime: audioPlayback.currentTime });
    const playback = {
      videoUrl: videoPlayback.url,
      videoTime: videoPlayback.currentTime,
      audioUrl: audioPlayback.url,
      audioTime: audioPlayback.currentTime,
    };
    await replaceWorkbench(
      evaluate,
      `(projection, current) => ({
        ...current,
        revision: current.revision + 1,
        main: {
          views: [],
          groups: [{ groupId: 'main:primary', viewIds: [] }],
          activeGroupId: 'main:primary',
        },
        timeline: { presentation: 'hidden', height: 240 },
      })`,
    );
    await waitForCanvasRootsRemoved(evaluate);
    checkpoint('canvas-roots-removed');
    await delay(500);
    const released = [
      await waitForReleasedUrl(evaluate, playback.videoUrl, 'video'),
      await waitForReleasedUrl(evaluate, playback.audioUrl, 'audio'),
    ];
    return {
      ownerRoot: 'canvas',
      rootCount: 2,
      locatorBackedNodes: ['video', 'audio'],
      nativeElements: ['video', 'audio'],
      videoAdvancedTo: playback.videoTime,
      audioAdvancedTo: playback.audioTime,
      isolatedUrls: playback.videoUrl !== playback.audioUrl,
      releasedStatuses: released,
    };
  },
  assertObservation(observation, evidence) {
    if (observation.openNekoResourceRequestCount < 2) {
      throw new Error('Canvas did not reach the OpenNeko resource handler for both Views.');
    }
    if (observation.pcmResponseCount !== 0) {
      throw new Error('Canvas ordinary node playback unexpectedly consumed PCM.');
    }
    if (
      evidence.rootCount !== 2 ||
      !evidence.isolatedUrls ||
      evidence.videoAdvancedTo <= 0 ||
      evidence.audioAdvancedTo <= 0
    ) {
      throw new Error('Canvas package-owned two-View playback isolation was not proven.');
    }
    if (evidence.releasedStatuses.some((status) => status !== 0)) {
      throw new Error('Canvas View teardown left an OpenNeko resource reachable.');
    }
  },
});

async function waitForCanvasRoots(evaluate) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ready = await evaluate(`(() => {
      const roots = [...document.querySelectorAll('[data-owner-root="canvas"]')];
      return roots.length === 2 && roots.every((root) =>
        [...root.querySelectorAll('button')].some((button) =>
          button.getAttribute('aria-label') === '播放' || button.getAttribute('aria-label') === 'Play',
        ),
      );
    })()`);
    if (ready) return;
    await delay(100);
  }
  throw new Error('Canvas two-View package-owned media actions were not ready before timeout.');
}

async function waitForCanvasMediaPlayback(evaluate, viewId, mediaType) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(`(() => {
      const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
      const media = root?.querySelector(${JSON.stringify(mediaType)});
      if (!(media instanceof HTMLMediaElement)) return undefined;
      const preview = root?.querySelector('[data-preview-surface=${JSON.stringify(mediaType)}]');
      return {
        url: media.src,
        currentTime: media.currentTime,
        paused: media.paused,
        readyState: media.readyState,
        errorCode: media.error?.code,
        previewDuration: preview?.getAttribute('data-media-duration'),
        controlledIdle: preview?.getAttribute('data-preview-controlled-idle'),
      };
    })()`);
    last = sample;
    if (sample?.url?.startsWith('openneko://resource/') && sample.currentTime > 0.15) {
      return sample;
    }
    await delay(100);
  }
  throw new Error(
    `Canvas ${mediaType} playback did not advance before timeout: ${JSON.stringify(last)}`,
  );
}

async function ensureCanvasMediaPlayback(click, evaluate, viewId, mediaType, playbackSelector) {
  await delay(250);
  const sample = await readCanvasMediaPlayback(evaluate, viewId, mediaType);
  if (!sample) {
    const state = await readCanvasPackagePlaybackState(evaluate, viewId, mediaType);
    if (state === 'playing') {
      await click(playbackSelector);
      await waitForCanvasPackagePlaybackState(evaluate, viewId, mediaType, 'stopped');
    }
    await click(playbackSelector);
    await waitForCanvasPackagePlaybackState(evaluate, viewId, mediaType);
  } else if (sample.currentTime <= 0.15 && sample.paused !== false) {
    await click(playbackSelector);
  }
  return waitForCanvasMediaPlayback(evaluate, viewId, mediaType);
}

function readCanvasMediaPlayback(evaluate, viewId, mediaType) {
  return evaluate(`(() => {
    const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
    const media = root?.querySelector(${JSON.stringify(mediaType)});
    if (!(media instanceof HTMLMediaElement)) return undefined;
    return { currentTime: media.currentTime, paused: media.paused };
  })()`);
}

async function waitForCanvasPackagePlaybackState(
  evaluate,
  viewId,
  mediaType,
  expectedState = 'playing',
) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = await readCanvasPackagePlaybackState(evaluate, viewId, mediaType);
    if (state === expectedState) return;
    await delay(100);
  }
  throw new Error(
    `Canvas ${mediaType} package-owned playback state did not reach ${expectedState}.`,
  );
}

function readCanvasPackagePlaybackState(evaluate, viewId, mediaType) {
  const selector = `[data-owner-view-id=${JSON.stringify(viewId)}] [data-testid="canvas-media-node"][data-media-type=${JSON.stringify(mediaType)}]`;
  return evaluate(
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute('data-playback-state')`,
  );
}

async function waitForCanvasRootsRemoved(evaluate) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const count = await evaluate(`document.querySelectorAll('[data-owner-root="canvas"]').length`);
    if (count === 0) return;
    await delay(100);
  }
  throw new Error('Canvas Roots remained mounted after Workbench teardown.');
}

async function waitForReleasedUrl(evaluate, url, mediaType) {
  const deadline = Date.now() + 10_000;
  let lastStatus;
  while (Date.now() < deadline) {
    const status = await readFetchStatus(evaluate, url);
    lastStatus = status;
    if (status === 0) return status;
    await delay(100);
  }
  throw new Error(
    `Canvas ${mediaType} View resource remained reachable after teardown with status ${String(lastStatus)}.`,
  );
}

function canvasDocument(name, nodeId, path, mediaType) {
  return {
    version: '3.0',
    name,
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: nodeId,
        type: 'media',
        position: { x: 80, y: 80 },
        size: { width: 320, height: 220 },
        zIndex: 1,
        data: {
          title: `${name} locator-backed node`,
          assetPath: path,
          contentLocator: { kind: 'workspace-file', path },
          mediaType,
        },
      },
    ],
    connections: [],
  };
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
