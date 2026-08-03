import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openFixtureWorkspace,
  readFetchStatus,
  replaceWorkbench,
} from '../../../../scripts/desktop-functional/desktop-operations.mjs';
import { createDesktopMediaFixtureSet } from '../../../../scripts/desktop-functional/media-fixtures.mjs';

export const canvasOpenNekoConsumerScenario = Object.freeze({
  id: 'canvas-openneko-consumer',
  owner: '@neko/canvas-webview',
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
  async run({
    checkpoint,
    click,
    drag,
    evaluate,
    hover,
    prepared,
    restartApplication,
    screenshot,
    waitForSelector,
  }) {
    await waitForSelector('[data-home-composition="task-launchpad"]');
    const homeLaunchpad = await evaluate(`(() => {
      const main = document.querySelector('.home-main');
      const launchpad = document.querySelector('[data-home-composition="task-launchpad"]');
      const brand = document.querySelector('[data-primary-sidebar="application"] .home-brand');
      const title = brand?.querySelector('.home-brand-title');
      const heading = launchpad?.querySelector('.home-launchpad-heading');
      const intentActions = launchpad?.querySelector('.home-intent-actions');
      if (!(main instanceof HTMLElement)) throw new Error('Desktop Home Main is missing.');
      if (!(launchpad instanceof HTMLElement)) {
        throw new Error('Desktop Home Agent launchpad is missing.');
      }
      if (!(brand instanceof HTMLElement) || !(title instanceof HTMLButtonElement)) {
        throw new Error('Desktop Home text brand action is missing.');
      }
      if (!(heading instanceof HTMLElement) || !(intentActions instanceof HTMLElement)) {
        throw new Error('Desktop Home Agent heading or intent actions are missing.');
      }
      const mainRect = main.getBoundingClientRect();
      const launchpadRect = launchpad.getBoundingClientRect();
      return {
        brandText: brand.textContent?.trim() ?? '',
        brandChildCount: brand.children.length,
        brandIconCount: brand.querySelectorAll('svg, .brand-mark').length,
        titleActionLabel: title.getAttribute('aria-label'),
        headingIconCount: heading.querySelectorAll('svg, .home-launchpad-heading-icon').length,
        headingTextAlign: getComputedStyle(heading).textAlign,
        intentActionIconCount: intentActions.querySelectorAll('svg').length,
        horizontalCenterDelta: Math.abs(
          launchpadRect.left + launchpadRect.width / 2 - (mainRect.left + mainRect.width / 2),
        ),
        verticalCenterDelta: Math.abs(
          launchpadRect.top + launchpadRect.height / 2 - (mainRect.top + mainRect.height / 2),
        ),
      };
    })()`);
    checkpoint('home-agent-entry-centered', homeLaunchpad);
    const homeLaunchpadScreenshot = await screenshot('home-agent-entry-centered');
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
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-canvas-toolbar-action="open-add-node-popover"]',
    );
    await waitForSelector('[data-canvas-add-action="text"]');
    await click('[data-canvas-add-action="text"]');
    const authoredNodeCount = await waitForCanvasNodeCount(evaluate, 'canvas:functional:video', 2);
    checkpoint('canvas-node-authored', { nodeCount: authoredNodeCount });
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="video-node"]',
      0,
      { xRatio: 0.5, yRatio: 0.95 },
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-selection-action="preview:open"]',
    );
    checkpoint('canvas-material-actions-resolved');
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-canvas-toolbar-action="toggle-playback-panel"]',
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-playback-controller"]',
    );
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-storyline-node="true"][data-source-node-id="video-node"]',
    );
    const storylinePlaySelector =
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-playback-controller"] button[title="播放"], [data-owner-view-id="canvas:functional:video"] [data-testid="canvas-playback-controller"] button[title="Play"]';
    await waitForSelector(storylinePlaySelector);
    await click(storylinePlaySelector);
    const storylinePlayback = await waitForCanvasStorylinePlayback(
      evaluate,
      'canvas:functional:video',
      false,
    );
    const storylinePauseSelector =
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-playback-controller"] button[title="暂停"], [data-owner-view-id="canvas:functional:video"] [data-testid="canvas-playback-controller"] button[title="Pause"]';
    await waitForSelector(storylinePauseSelector);
    await click(storylinePauseSelector);
    await waitForCanvasStorylinePlayback(evaluate, 'canvas:functional:video', true);
    checkpoint('canvas-storyline-single-click-transport', {
      currentTime: storylinePlayback.currentTime,
    });
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-playback-action="close-overlay"]',
    );
    await waitForCanvasPlaybackOverlayRemoved(evaluate, 'canvas:functional:video');
    await hover(
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-media-node"][data-media-type="video"]',
    );
    await waitForCanvasPackagePlaybackState(evaluate, 'canvas:functional:video', 'video');
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-preview-surface="video"] [data-testid="canvas-video-toggle-playback"]',
    );
    const videoPlayback = await waitForCanvasMediaPlayback(
      evaluate,
      'canvas:functional:video',
      'video',
    );
    const videoPlaybackSelector =
      '[data-owner-view-id="canvas:functional:video"] [data-preview-surface="video"] [data-testid="canvas-video-toggle-playback"]';
    await click(videoPlaybackSelector);
    await waitForCanvasPlaybackOwner(evaluate, 'canvas:functional:video', 'video', 'manual-paused');
    await waitForCanvasMediaPaused(evaluate, 'canvas:functional:video', 'video', true);
    await click(videoPlaybackSelector);
    await waitForCanvasPlaybackOwner(
      evaluate,
      'canvas:functional:video',
      'video',
      'manual-playing',
    );
    await waitForCanvasMediaPaused(evaluate, 'canvas:functional:video', 'video', false);
    checkpoint('canvas-video-manual-playing', { currentTime: videoPlayback.currentTime });
    await hover(
      '[data-owner-view-id="canvas:functional:audio"] [data-testid="canvas-audio-node-title"]',
    );
    const videoAfterPointerLeave = await waitForCanvasMediaPlayback(
      evaluate,
      'canvas:functional:video',
      'video',
      videoPlayback.currentTime,
    );
    await waitForCanvasPackagePlaybackState(evaluate, 'canvas:functional:audio', 'audio');
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:audio"] [data-preview-surface="audio"] [data-testid="canvas-audio-toggle-playback"]',
    );
    const audioPlayback = await waitForCanvasMediaPlayback(
      evaluate,
      'canvas:functional:audio',
      'audio',
    );
    checkpoint('canvas-audio-playing', { currentTime: audioPlayback.currentTime });
    const playback = {
      videoUrl: videoPlayback.url,
      videoTime: videoPlayback.currentTime,
      videoTimeAfterPointerLeave: videoAfterPointerLeave.currentTime,
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
    await waitForSelector('[data-empty-main="true"]');
    const emptyMain = await evaluate(`(() => {
      const surface = document.querySelector('[data-empty-main="true"]');
      return {
        heading: surface?.querySelector('h2')?.textContent?.trim(),
        detail: surface?.querySelector('p')?.textContent?.trim(),
        hasDiagnostic: Boolean(surface?.querySelector('code')),
        exposesCanvasNotMounted: surface?.textContent?.includes('desktop-canvas-not-mounted') ?? false,
      };
    })()`);
    checkpoint('empty-main-after-last-tab-closed', emptyMain);
    const emptyMainScreenshot = await screenshot('empty-main-after-last-tab-closed');
    await delay(500);
    const released = [
      await waitForReleasedUrl(evaluate, playback.videoUrl, 'video'),
      await waitForReleasedUrl(evaluate, playback.audioUrl, 'audio'),
    ];
    const settings = await evaluate(`window.openNekoDesktop.settings.get()`);
    await evaluate(`window.openNekoDesktop.settings.update({
      ...${JSON.stringify(settings.preferences)},
      startupTarget: 'restore',
    }, ${String(settings.revision)})`);
    await restartApplication();
    await waitForSelector('[data-owner-root="canvas"]');
    const restoredDefault = await evaluate(`(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const active = projection.window.activeTarget;
      const views = projection.window.workbench.main.views;
      return {
        activeTarget: active.kind,
        canvasViews: views
          .filter((view) => view.kind === 'canvas')
          .map((view) => ({ viewId: view.viewId, documentId: view.documentId })),
        canvasRootCount: document.querySelectorAll('[data-owner-root="canvas"]').length,
        placeholderVisible: document.body.innerText.includes('desktop-canvas-not-mounted'),
      };
    })()`);
    checkpoint('default-workspace-canvas-restored', restoredDefault);
    const restoredScreenshot = await screenshot('default-workspace-canvas-restored');
    const leftDockSelector =
      '.neko-controlled-workbench-dock--left .neko-controlled-workbench-resize-handle--right';
    await waitForSelector(leftDockSelector);
    const leftDockWidthBeforeResize = await readLeftDockWidth(evaluate);
    await drag(leftDockSelector, '.neko-controlled-workbench-main', {
      targetPosition: { xRatio: 0.12, yRatio: 0.5 },
    });
    const resizeLifecycle = await waitForResizeLifecycleCompletion(
      evaluate,
      leftDockWidthBeforeResize,
    );
    checkpoint('left-dock-resize-indicator-cleared', resizeLifecycle);
    const resizedWorkbenchScreenshot = await screenshot('left-dock-resize-indicator-cleared');
    await replaceWorkbench(
      evaluate,
      `(projection, current) => ({
        ...current,
        revision: current.revision + 1,
        resourceDock: { ...current.resourceDock, presentation: 'docked' },
      })`,
    );
    await waitForSelector('[data-owner-root="assets"] .neko-resource-browser');
    const themeSurfaces = await evaluate(`(() => {
      const agent = document.querySelector(
        '[data-owner-root="agent"] [data-presentation="desktop-dock"]',
      );
      const resources = document.querySelector(
        '[data-owner-root="assets"] .neko-resource-browser',
      );
      const resourceInput = resources?.querySelector('.neko-resource-browser__search > div');
      if (!(agent instanceof HTMLElement)) throw new Error('Desktop Agent package Root is missing.');
      if (!(resources instanceof HTMLElement)) {
        throw new Error('Desktop Resource Browser package Root is missing.');
      }
      if (!(resourceInput instanceof HTMLElement)) {
        throw new Error('Desktop Resource Browser raised input is missing.');
      }
      const composerRail = agent.querySelector('.agent-composer-rail');
      if (!(composerRail instanceof HTMLElement)) {
        throw new Error('Desktop Agent composer rail is missing.');
      }
      const rootStyle = getComputedStyle(document.documentElement);
      const agentStyle = getComputedStyle(agent);
      const composerRailStyle = getComputedStyle(composerRail);
      return {
        agentBackground: agentStyle.backgroundColor,
        composerRailBackground: composerRailStyle.backgroundColor,
        composerRailBorderTopColor: composerRailStyle.borderTopColor,
        resourceBackground: getComputedStyle(resources).backgroundColor,
        resourceInputBackground: getComputedStyle(resourceInput).backgroundColor,
        resourcePackageHeaderCount: resources.querySelectorAll(
          '.neko-resource-browser__header',
        ).length,
        resourceToolbarActionLabels: Array.from(
          resources.querySelectorAll('.neko-resource-browser__toolbar button[aria-label]'),
          (element) => element.getAttribute('aria-label') ?? '',
        ),
        resourceManagementTitles: Array.from(
          document.querySelectorAll('.project-resource-dock__header strong'),
          (element) => element.textContent?.trim() ?? '',
        ),
        desktopMain: rootStyle.getPropertyValue('--neko-desktop-main').trim(),
        desktopSurface: rootStyle.getPropertyValue('--neko-desktop-surface').trim(),
        desktopSurfaceMuted: rootStyle.getPropertyValue('--neko-desktop-surface-muted').trim(),
        desktopSurfaceRaised: rootStyle.getPropertyValue('--neko-desktop-surface-raised').trim(),
      };
    })()`);
    checkpoint('desktop-dock-theme-surfaces', themeSurfaces);
    const themedDockScreenshot = await screenshot('desktop-dock-theme-surfaces');
    return {
      ownerRoot: 'canvas',
      homeLaunchpad,
      homeLaunchpadScreenshot,
      rootCount: 2,
      authoredNodeCount,
      locatorBackedNodes: ['video', 'audio'],
      nativeElements: ['video', 'audio'],
      storylineAdvancedTo: storylinePlayback.currentTime,
      videoManualStartTime: playback.videoTime,
      videoAdvancedTo: playback.videoTimeAfterPointerLeave,
      audioAdvancedTo: playback.audioTime,
      isolatedUrls: playback.videoUrl !== playback.audioUrl,
      releasedStatuses: released,
      emptyMain,
      emptyMainScreenshot,
      restoredDefault,
      restoredScreenshot,
      resizeLifecycle,
      resizedWorkbenchScreenshot,
      themeSurfaces,
      themedDockScreenshot,
    };
  },
  assertObservation(observation, evidence) {
    if (
      evidence.homeLaunchpad.brandText !== 'OpenNeko' ||
      evidence.homeLaunchpad.brandChildCount !== 1 ||
      evidence.homeLaunchpad.brandIconCount !== 0 ||
      !evidence.homeLaunchpad.titleActionLabel ||
      evidence.homeLaunchpad.headingIconCount !== 0 ||
      evidence.homeLaunchpad.headingTextAlign !== 'center' ||
      evidence.homeLaunchpad.intentActionIconCount === 0 ||
      evidence.homeLaunchpad.horizontalCenterDelta > 2 ||
      evidence.homeLaunchpad.verticalCenterDelta > 2
    ) {
      throw new Error(
        `Desktop Home brand or Agent launchpad composition is incorrect: ${JSON.stringify(evidence.homeLaunchpad)}`,
      );
    }
    if (observation.openNekoResourceRequestCount < 2) {
      throw new Error('Canvas did not reach the OpenNeko resource handler for both Views.');
    }
    if (observation.pcmResponseCount !== 0) {
      throw new Error('Canvas ordinary node playback unexpectedly consumed PCM.');
    }
    if (
      evidence.rootCount !== 2 ||
      evidence.authoredNodeCount !== 2 ||
      !evidence.isolatedUrls ||
      evidence.storylineAdvancedTo <= 0 ||
      evidence.videoAdvancedTo <= evidence.videoManualStartTime + 0.15 ||
      evidence.audioAdvancedTo <= 0
    ) {
      throw new Error('Canvas package-owned two-View playback isolation was not proven.');
    }
    if (evidence.releasedStatuses.some((status) => status !== 0)) {
      throw new Error('Canvas View teardown left an OpenNeko resource reachable.');
    }
    if (
      !evidence.emptyMain.heading ||
      !evidence.emptyMain.detail ||
      evidence.emptyMain.hasDiagnostic ||
      evidence.emptyMain.exposesCanvasNotMounted
    ) {
      throw new Error('Desktop did not render a diagnostic-free empty Main surface.');
    }
    if (
      evidence.restoredDefault.activeTarget !== 'project' ||
      evidence.restoredDefault.canvasRootCount !== 1 ||
      evidence.restoredDefault.canvasViews.length !== 1 ||
      evidence.restoredDefault.canvasViews[0]?.documentId !== 'neko/boards/workspace.nkc' ||
      evidence.restoredDefault.placeholderVisible
    ) {
      throw new Error('Desktop restart did not restore the canonical Workspace Canvas Main View.');
    }
    if (
      evidence.resizeLifecycle.widthAfter === evidence.resizeLifecycle.widthBefore ||
      evidence.resizeLifecycle.resizingOwnerCount !== 0
    ) {
      throw new Error('Desktop left Dock resize did not clear its active resize indicator.');
    }
    if (
      evidence.themeSurfaces.desktopMain !== '#ffffff' ||
      evidence.themeSurfaces.desktopSurface !== '#fafafa' ||
      evidence.themeSurfaces.desktopSurfaceMuted !== '#f3f3f2' ||
      evidence.themeSurfaces.desktopSurfaceRaised !== '#ffffff' ||
      evidence.themeSurfaces.agentBackground !== 'rgb(255, 255, 255)' ||
      evidence.themeSurfaces.composerRailBackground !== 'rgb(255, 255, 255)' ||
      evidence.themeSurfaces.composerRailBorderTopColor !== 'rgba(0, 0, 0, 0)' ||
      evidence.themeSurfaces.resourceBackground !== 'rgb(255, 255, 255)' ||
      evidence.themeSurfaces.resourceInputBackground !== 'rgb(255, 255, 255)' ||
      evidence.themeSurfaces.resourcePackageHeaderCount !== 0 ||
      !evidence.themeSurfaces.resourceToolbarActionLabels.some((label) =>
        ['配置媒体库', 'Configure media libraries'].includes(label),
      ) ||
      !evidence.themeSurfaces.resourceToolbarActionLabels.some((label) =>
        ['刷新', 'Refresh'].includes(label),
      ) ||
      evidence.themeSurfaces.resourceManagementTitles.length !== 1 ||
      !['资源管理', 'Resource management'].includes(
        evidence.themeSurfaces.resourceManagementTitles[0],
      )
    ) {
      throw new Error(
        `Desktop primary regions did not share one Main surface and chrome: ${JSON.stringify(evidence.themeSurfaces)}`,
      );
    }
  },
});

function readLeftDockWidth(evaluate) {
  return evaluate(`(() => {
    const dock = document.querySelector('.neko-controlled-workbench-dock--left');
    if (!(dock instanceof HTMLElement)) throw new Error('Desktop left Dock is missing.');
    return dock.getBoundingClientRect().width;
  })()`);
}

async function waitForResizeLifecycleCompletion(evaluate, widthBefore) {
  const deadline = Date.now() + 5_000;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(`(() => {
      const dock = document.querySelector('.neko-controlled-workbench-dock--left');
      if (!(dock instanceof HTMLElement)) throw new Error('Desktop left Dock is missing.');
      return {
        widthBefore: ${String(widthBefore)},
        widthAfter: dock.getBoundingClientRect().width,
        resizingOwnerCount: document.querySelectorAll('[data-resizing="true"]').length,
      };
    })()`);
    last = sample;
    if (sample.widthAfter !== widthBefore && sample.resizingOwnerCount === 0) return sample;
    await delay(100);
  }
  throw new Error(`Desktop resize lifecycle did not complete: ${JSON.stringify(last)}`);
}

async function waitForCanvasNodeCount(evaluate, viewId, expectedCount) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const nodeCount = await evaluate(`(() => {
      const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
      return root?.querySelectorAll('[data-node-presentation]').length ?? 0;
    })()`);
    if (nodeCount === expectedCount) return nodeCount;
    await delay(100);
  }
  throw new Error(
    `Canvas View '${viewId}' did not reach ${String(expectedCount)} authored nodes before timeout.`,
  );
}

async function waitForCanvasStorylinePlayback(evaluate, viewId, expectedPaused) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(`(() => {
      const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
      const media = root?.querySelector('.canvas-playback-overlay-preview video');
      return {
        url: media instanceof HTMLMediaElement ? media.src : undefined,
        currentTime: media instanceof HTMLMediaElement ? media.currentTime : undefined,
        paused: media instanceof HTMLMediaElement ? media.paused : undefined,
        expanded: root
          ?.querySelector('[data-testid="canvas-playback-overlay"]')
          ?.getAttribute('data-expanded'),
        unitId: root
          ?.querySelector('[data-testid="canvas-playback-stage"]')
          ?.getAttribute('data-unit-id'),
        transportTitles: Array.from(
          root?.querySelectorAll('[data-testid="canvas-playback-controller"] button') ?? [],
          (button) => button.getAttribute('title'),
        ),
      };
    })()`);
    last = sample;
    if (
      sample?.url?.startsWith('openneko://resource/') &&
      sample.paused === expectedPaused &&
      (expectedPaused || sample.currentTime > 0.15)
    ) {
      return sample;
    }
    await delay(100);
  }
  throw new Error(
    `Canvas Storyline playback did not reach paused=${String(expectedPaused)}: ${JSON.stringify(last)}.`,
  );
}

async function waitForCanvasPlaybackOverlayRemoved(evaluate, viewId) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const visible = await evaluate(`Boolean(
      document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}] [data-testid="canvas-playback-overlay"]'),
    )`);
    if (!visible) return;
    await delay(100);
  }
  throw new Error('Canvas Storyline overlay remained visible after close.');
}

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

async function waitForCanvasMediaPlayback(evaluate, viewId, mediaType, minimumTime = 0) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(`(() => {
      const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
      const media = root?.querySelector(${JSON.stringify(mediaType)});
      const preview = root?.querySelector('[data-preview-surface=${JSON.stringify(mediaType)}]');
      const node = root?.querySelector(
        '[data-testid="canvas-media-node"][data-media-type=${JSON.stringify(mediaType)}]',
      );
      return {
        url: media instanceof HTMLMediaElement ? media.src : undefined,
        currentTime: media instanceof HTMLMediaElement ? media.currentTime : undefined,
        paused: media instanceof HTMLMediaElement ? media.paused : undefined,
        readyState: media instanceof HTMLMediaElement ? media.readyState : undefined,
        errorCode: media instanceof HTMLMediaElement ? media.error?.code : undefined,
        previewDuration: preview?.getAttribute('data-media-duration'),
        controlledIdle: preview?.getAttribute('data-preview-controlled-idle'),
        playbackState: node?.getAttribute('data-playback-state'),
        playbackOwner: node?.getAttribute('data-playback-owner'),
      };
    })()`);
    last = sample;
    if (
      sample?.url?.startsWith('openneko://resource/') &&
      sample.currentTime > Math.max(0.15, minimumTime + 0.15)
    ) {
      return sample;
    }
    await delay(100);
  }
  throw new Error(
    `Canvas ${mediaType} playback did not advance before timeout: ${JSON.stringify(last)}`,
  );
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

async function waitForCanvasPlaybackOwner(evaluate, viewId, mediaType, expectedOwner) {
  const deadline = Date.now() + 5_000;
  let last;
  while (Date.now() < deadline) {
    const selector = `[data-owner-view-id=${JSON.stringify(viewId)}] [data-testid="canvas-media-node"][data-media-type=${JSON.stringify(mediaType)}]`;
    const sample = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      const media = node?.querySelector(${JSON.stringify(mediaType)});
      const button = node?.querySelector('[data-testid="canvas-${mediaType}-toggle-playback"]');
      return {
        owner: node?.getAttribute('data-playback-owner'),
        state: node?.getAttribute('data-playback-state'),
        paused: media instanceof HTMLMediaElement ? media.paused : undefined,
        buttonTitle: button?.getAttribute('title'),
      };
    })()`);
    last = sample;
    if (sample?.owner === expectedOwner) return;
    await delay(100);
  }
  throw new Error(
    `Canvas ${mediaType} playback owner did not reach ${expectedOwner} before timeout: ${JSON.stringify(last)}.`,
  );
}

async function waitForCanvasMediaPaused(evaluate, viewId, mediaType, expectedPaused) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const sample = await evaluate(`(() => {
      const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
      const media = root?.querySelector(${JSON.stringify(mediaType)});
      const button = root?.querySelector('[data-testid="canvas-${mediaType}-toggle-playback"]');
      return {
        paused: media instanceof HTMLMediaElement ? media.paused : undefined,
        buttonLabel: button?.getAttribute('aria-label'),
      };
    })()`);
    const labels = expectedPaused ? ['播放', 'Play'] : ['暂停', 'Pause'];
    if (sample?.paused === expectedPaused && labels.includes(sample.buttonLabel)) return;
    await delay(100);
  }
  throw new Error(
    `Canvas ${mediaType} paused state did not reach ${String(expectedPaused)} before timeout.`,
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
