import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openFixtureWorkspace,
  openPreviewResource,
  readFetchStatus,
} from '../../../../scripts/desktop-functional/desktop-operations.mjs';
import { createDesktopMediaFixtureSet } from '../../../../scripts/desktop-functional/media-fixtures.mjs';

const VIEWERS = Object.freeze([
  { key: 'image', kind: 'image', pathKey: 'image' },
  { key: 'audio', kind: 'audio', pathKey: 'audio' },
  { key: 'video', kind: 'video', pathKey: 'video' },
  { key: 'pdf', kind: 'document', pathKey: 'pdf' },
  { key: 'glb', kind: 'model', pathKey: 'glb' },
  { key: 'gltf', kind: 'model', pathKey: 'gltf' },
]);

export const previewOpenNekoConsumerScenario = Object.freeze({
  id: 'preview-openneko-consumer',
  owner: '@neko/preview-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    return { workspacePath, media: await createDesktopMediaFixtureSet(workspacePath) };
  },
  async run({ click, evaluate, prepared, readOpenNekoResourceRequests }) {
    await openFixtureWorkspace(evaluate);
    const viewers = [];
    for (const definition of VIEWERS) {
      const path = prepared.media[definition.pathKey];
      const before = readOpenNekoResourceRequests();
      await openPreviewResource(evaluate, path);
      const detail = await waitForViewer(click, evaluate, definition);
      const after = readOpenNekoResourceRequests();
      const sessionUrls = [
        ...(detail.sourceUrl ? [detail.sourceUrl] : []),
        ...after.filter((url) => !before.includes(url)),
      ].filter((url, index, values) => values.indexOf(url) === index);
      if (sessionUrls.length === 0) {
        throw new Error(`Preview ${definition.key} did not expose an OpenNeko resource request.`);
      }
      await click('.neko-preview-root__actions button:last-child');
      await waitForPreviewClosed(evaluate);
      const releasedStatuses = [];
      for (const url of sessionUrls) {
        releasedStatuses.push(await waitForReleasedUrl(evaluate, url));
      }
      const reportDetail = Object.fromEntries(
        Object.entries(detail).filter(
          ([key]) => !['sourceUrl', 'alertText', 'statusText', 'rootText'].includes(key),
        ),
      );
      viewers.push({
        key: definition.key,
        kind: definition.kind,
        ...reportDetail,
        resourceRequestCount: sessionUrls.length,
        releasedStatuses,
      });
    }
    return {
      ownerRoot: 'preview',
      viewers,
      gltfDependencyRequested:
        viewers.find((viewer) => viewer.key === 'gltf')?.resourceRequestCount >= 2,
    };
  },
  assertObservation(observation, evidence) {
    if (observation.openNekoResourceRequestCount < 7) {
      throw new Error('Preview did not reach the OpenNeko handler for its viewer matrix.');
    }
    if (evidence.viewers.length !== VIEWERS.length) {
      throw new Error('Preview package-owned viewer matrix is incomplete.');
    }
    if (!evidence.gltfDependencyRequested) {
      throw new Error('Preview glTF viewer did not request its dependency set.');
    }
    if (
      evidence.viewers.some(
        (viewer) => viewer.ready !== true || viewer.releasedStatuses.some((status) => status !== 0),
      )
    ) {
      throw new Error('Preview viewer readiness or session release was not proven.');
    }
  },
});

async function waitForViewer(click, evaluate, definition) {
  const deadline = Date.now() + 45_000;
  let playbackStarted = false;
  let lastDetail;
  while (Date.now() < deadline) {
    const detail = await evaluate(`(() => {
      const root = document.querySelector('.neko-preview-root[data-preview-kind=${JSON.stringify(definition.kind)}]');
      if (!(root instanceof HTMLElement)) return undefined;
      const image = root.querySelector('.neko-preview-root__image');
      const video = root.querySelector('video');
      const audio = root.querySelector('audio');
      const pdf = root.querySelector('[data-testid="pdf-preview-ready"]');
      const model = root.querySelector('[data-testid="model-preview-ready"]');
      const playbackButton = root.querySelector(
        '[data-testid="preview-${definition.key}-toggle-playback"]',
      );
      const playbackButtonRect = playbackButton?.getBoundingClientRect();
      return {
        imageReady: image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        videoReady: video instanceof HTMLVideoElement && video.readyState >= HTMLMediaElement.HAVE_METADATA,
        videoTime: video instanceof HTMLVideoElement ? video.currentTime : 0,
        videoPaused: video instanceof HTMLVideoElement ? video.paused : undefined,
        videoError: video instanceof HTMLVideoElement ? video.error?.code : undefined,
        audioReady: audio instanceof HTMLAudioElement && audio.readyState >= HTMLMediaElement.HAVE_METADATA,
        audioTime: audio instanceof HTMLAudioElement ? audio.currentTime : 0,
        pdfReady: pdf instanceof HTMLElement && Number(pdf.dataset.pageCount ?? '0') > 0,
        modelReady: model instanceof HTMLElement && model.dataset.viewerStatus === 'ready',
        meshCount: model instanceof HTMLElement ? Number(model.dataset.meshCount ?? '0') : 0,
        playbackButtonCount: root.querySelectorAll(
          '[data-testid="preview-${definition.key}-toggle-playback"]',
        ).length,
        playbackButtonWidth: playbackButtonRect?.width ?? 0,
        playbackButtonHeight: playbackButtonRect?.height ?? 0,
        alertText: root.querySelector('[role="alert"]')?.textContent,
        statusText: root.querySelector('[role="status"]')?.textContent,
        rootText: root.textContent?.trim().slice(0, 240),
        sourceUrl:
          image instanceof HTMLImageElement ? image.src :
          video instanceof HTMLVideoElement ? video.src :
          audio instanceof HTMLAudioElement ? audio.src : undefined,
      };
    })()`);
    lastDetail = detail;
    if (detail) {
      const ready =
        (definition.key === 'image' && detail.imageReady) ||
        (definition.key === 'audio' && detail.audioTime > 0.1) ||
        (definition.key === 'video' && detail.videoTime > 0.1) ||
        (definition.key === 'pdf' && detail.pdfReady) ||
        ((definition.key === 'glb' || definition.key === 'gltf') &&
          detail.modelReady &&
          detail.meshCount > 0);
      if (ready) return { ...detail, ready: true };
      if ((definition.key === 'audio' || definition.key === 'video') && !playbackStarted) {
        const ready = definition.key === 'audio' ? detail.audioReady : detail.videoReady;
        if (
          ready &&
          detail.playbackButtonCount > 0 &&
          detail.playbackButtonWidth > 0 &&
          detail.playbackButtonHeight > 0
        ) {
          await click(`[data-testid="preview-${definition.key}-toggle-playback"]`);
          playbackStarted = true;
        }
      }
    }
    await delay(100);
  }
  throw new Error(
    `Preview ${definition.key} viewer did not become ready before timeout: ${JSON.stringify(lastDetail)}`,
  );
}

async function waitForPreviewClosed(evaluate) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!(await evaluate(`Boolean(document.querySelector('.neko-preview-root'))`))) return;
    await delay(100);
  }
  throw new Error('Preview Root remained mounted after its package-owned close action.');
}

async function waitForReleasedUrl(evaluate, url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const status = await readFetchStatus(evaluate, url);
    if (status === 0) return status;
    await delay(100);
  }
  throw new Error('Preview session resource remained reachable after close.');
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
