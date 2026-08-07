import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openFixtureWorkspace,
  readFetchStatus,
  replaceWorkbench,
} from '../../../../scripts/desktop-functional/desktop-operations.mjs';
import { createDesktopMediaFixtureSet } from '../../../../scripts/desktop-functional/media-fixtures.mjs';

const VISUAL_SETTLE_MILLISECONDS = 1_000;
const MEDIA_HAVE_CURRENT_DATA = 2;
const ACTIVE_CUT_ROOT_SELECTOR =
  '[data-workbench-slot="main"] ' +
  '.project-main-view-stack__item[data-main-view-id] ' +
  '[data-owner-root="cut"]';
const ACTIVE_CUT_TIMELINE_SELECTOR =
  '[data-workbench-slot="timeline"] ' + '[data-testid="desktop-cut-timeline-slot"]';

export const cutOpenNekoConsumerScenario = Object.freeze({
  id: 'cut-openneko-consumer',
  owner: '@neko/cut-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const editsRoot = join(workspacePath, 'edits');
    await Promise.all([
      mkdir(editsRoot, { recursive: true }),
      mkdir(join(workspacePath, 'exports'), { recursive: true }),
    ]);
    const media = await createDesktopMediaFixtureSet(workspacePath);
    await writeFile(
      join(editsRoot, 'qualification.otio'),
      `${JSON.stringify(cutTimeline(), null, 2)}\n`,
    );
    await writeFile(
      join(editsRoot, 'authoring.otio'),
      `${JSON.stringify(cutTimeline(), null, 2)}\n`,
    );
    return {
      workspacePath,
      media,
      documentId: 'edits/qualification.otio',
      authoringDocumentId: 'edits/authoring.otio',
      newDocumentId: 'edits/new-from-route.otio',
    };
  },
  async run({
    checkpoint,
    click,
    evaluate,
    prepared,
    readOpenNekoResourceRequests,
    screenshot,
    waitForSelector,
  }) {
    await openFixtureWorkspace(evaluate);
    await replaceWorkbench(
      evaluate,
      `(projection, current, tab, project) => ({
        ...current,
        display: { ...current.display, mode: 'main-only' },
        main: {
          views: [
            {
              viewId: 'cut:functional',
              viewInstanceId: tab.viewInstanceId,
              projectId: project.projectId,
              workspaceId: project.workspaceId,
              kind: 'cut',
              ownerId: 'cut:functional',
              displayLabel: 'qualification.otio',
              documentId: ${JSON.stringify(prepared.documentId)},
            },
          ],
          groups: [{
            groupId: 'main:primary',
            viewIds: ['cut:functional'],
            activeViewId: 'cut:functional',
          }],
          activeGroupId: 'main:primary',
        },
        timeline: { presentation: 'docked', ownerViewId: 'cut:functional', height: 240 },
      })`,
    );
    await waitForSelector(
      `${ACTIVE_CUT_ROOT_SELECTOR} [data-testid="cut-preview-toggle-playback"]`,
    );
    await waitForCutReady(evaluate);
    checkpoint('cut-ready');
    await evaluate(`(() => {
      window.__openNekoCutClickEvidence = [];
      const root = document.querySelector(${JSON.stringify(ACTIVE_CUT_ROOT_SELECTOR)});
      root?.querySelector('[data-testid="cut-preview-toggle-playback"]')?.addEventListener(
        'click', (event) => window.__openNekoCutClickEvidence.push({
          kind: 'playback-toggle',
          trusted: event.isTrusted,
        }),
      );
      document.querySelector(${JSON.stringify(ACTIVE_CUT_TIMELINE_SELECTOR)})
        ?.querySelector('.cut-basic-ruler')?.addEventListener('pointerdown', (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        window.__openNekoCutClickEvidence.push({
          kind: 'ruler-seek',
          trusted: event.isTrusted,
          ratio: (event.clientX - rect.left) / rect.width,
        });
      });
      return true;
    })()`);
    await click(`${ACTIVE_CUT_ROOT_SELECTOR} [data-testid="cut-preview-toggle-playback"]`);
    const playing = await waitForCutPlayback(evaluate);
    checkpoint('cut-playing', { startTime: playing.startTime, endTime: playing.endTime });
    const requestsBeforeSeek = new Set(readOpenNekoResourceRequests());
    const seekTarget = await readCutMidpointTarget(evaluate);
    await click(
      `${ACTIVE_CUT_TIMELINE_SELECTOR} .cut-basic-ruler-tick`,
      seekTarget.replacementTickIndex,
    );
    const seekOutput = await evaluate(
      `document.querySelector(${JSON.stringify(
        ACTIVE_CUT_ROOT_SELECTOR,
      )})?.querySelector('.cut-preview-controls output')?.textContent`,
    );
    checkpoint('cut-seek-clicked', { output: seekOutput });
    const seeked = await waitForCutPausedSeek(
      evaluate,
      playing.url,
      requestsBeforeSeek,
      readOpenNekoResourceRequests,
      seekTarget.replacementSeconds,
    );
    const releasedStatus = await waitForReleasedUrl(evaluate, playing.url);
    checkpoint('cut-preview-request-released');
    const readyMidpointState = await seekCutToTimelineMidpoint({ click, evaluate });
    const readyScreenshot = await captureSettledScreenshot(screenshot, 'cut-editor-ready');
    checkpoint('cut-ready-visual-midpoint', { visualMidpoint: readyMidpointState.evidence });
    const seekMidpointState = await seekCutToTimelineMidpoint({ click, evaluate });
    const seekScreenshot = await captureSettledScreenshot(screenshot, 'cut-playback-seek-visible');
    checkpoint('cut-seek-ready', {
      currentTime: seeked.currentTime,
      functionalSeekTime: seeked.timelineTime,
      visualMidpoint: seekMidpointState.evidence,
    });
    const authoring = await qualifyCutAuthoring({ evaluate, prepared, checkpoint });
    await waitForCutAuthoringVisible(evaluate);
    const authoringMidpointState = await seekCutToTimelineMidpoint({ click, evaluate });
    const authoringScreenshot = await captureSettledScreenshot(
      screenshot,
      'cut-authoring-complete',
    );
    const exported = await stat(
      join(prepared.workspacePath, 'exports', 'functional-cut-export.mp4'),
    );
    if (!exported.isFile() || exported.size === 0) {
      throw new Error('Cut dirty snapshot export did not publish a non-empty output.');
    }
    return {
      ownerRoot: 'cut',
      nativeVideo: true,
      changingFrames: playing.firstFrame !== playing.secondFrame,
      advancedFrom: playing.startTime,
      advancedTo: playing.endTime,
      seekedTo: seeked.currentTime,
      previewRequestChanged: seeked.url !== playing.url,
      releasedStatus,
      trustedInteractions: seeked.clickEvidence,
      authoring: { ...authoring, exportBytes: exported.size },
      visualMidpoints: {
        ready: readyMidpointState.evidence,
        seek: seekMidpointState.evidence,
        authoring: authoringMidpointState.evidence,
      },
      screenshots: [readyScreenshot, seekScreenshot, authoringScreenshot],
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
    if (!evidence.previewRequestChanged || evidence.releasedStatus !== 0) {
      throw new Error('Cut seek did not replace and release its prior preview request.');
    }
    if (
      !evidence.trustedInteractions?.some(
        (interaction) => interaction.kind === 'playback-toggle' && interaction.trusted,
      ) ||
      !evidence.trustedInteractions?.some(
        (interaction) => interaction.kind === 'ruler-seek' && interaction.trusted,
      )
    ) {
      throw new Error('Cut scenario did not reach package controls through trusted UI events.');
    }
    if (
      !evidence.authoring?.newTargetCreated ||
      !evidence.authoring?.explicitTargetAppended ||
      !evidence.authoring?.manualMutePreserved ||
      !evidence.authoring?.multiDocumentIsolated ||
      !evidence.authoring?.exportAcceptedDirty ||
      !evidence.authoring?.reopenedFromSavedState ||
      evidence.authoring.exportBytes < 1
    ) {
      throw new Error('Cut P0/P1 authoring evidence is incomplete.');
    }
  },
});

async function qualifyCutAuthoring({ evaluate, prepared, checkpoint }) {
  const firstPass = await evaluate(`(async () => {
    let projection = await window.openNekoDesktop.shell.getSnapshot();
    const active = projection.window.activeTarget;
    if (active.kind !== 'project') throw new Error('Cut functional Project is not active.');
    const tab = projection.window.tabs.find((candidate) => candidate.tabId === active.tabId);
    const project = projection.catalog.projects.find((candidate) => candidate.projectId === tab?.projectId);
    if (!tab || !project) throw new Error('Cut functional Project identity is missing.');
    const execute = (identity, route, payload, requestId = crypto.randomUUID()) =>
      window.openNekoDesktop.cut.execute({
        requestId,
        commandId: crypto.randomUUID(),
        route,
        identity,
        ...(payload === undefined ? {} : { payload }),
      });
    const newIdentity = {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId: projection.window.windowId,
      viewId: 'cut:new-target',
      viewInstanceId: tab.viewInstanceId,
      documentId: ${JSON.stringify(prepared.newDocumentId)},
      sessionId: 'cut-session:cut:new-target:' + tab.viewInstanceId,
      rendererSessionId: projection.rendererSessionId,
    };
    const created = await execute(newIdentity, 'document.create', {
      type: 'cut:document-create',
      name: 'New from Canvas route',
      profile: {
        profile: '1080p30',
        editRateNumerator: 30,
        editRateDenominator: 1,
        width: 1920,
        height: 1080,
      },
      items: [{
        kind: 'media',
        clipId: 'new-route-clip',
        name: 'New route opening',
        targetUrl: '../media/motion-with-audio.mp4',
        durationFrames: 60,
        rate: 30,
      }],
    });
    const workbenchInstance = projection.window.workbench;
    const currentWorkbench = workbenchInstance.layout;
    const nextWorkbench = {
      ...currentWorkbench,
      main: {
        ...currentWorkbench.main,
        views: [
          ...currentWorkbench.main.views,
          {
            viewId: 'cut:authoring',
            viewInstanceId: tab.viewInstanceId,
            projectId: project.projectId,
            workspaceId: project.workspaceId,
            kind: 'cut',
            ownerId: 'cut-session:cut:authoring:' + tab.viewInstanceId,
            displayLabel: 'authoring.otio',
            documentId: ${JSON.stringify(prepared.authoringDocumentId)},
          },
          {
            viewId: 'cut:new-target',
            viewInstanceId: tab.viewInstanceId,
            projectId: project.projectId,
            workspaceId: project.workspaceId,
            kind: 'cut',
            ownerId: 'cut-session:cut:new-target:' + tab.viewInstanceId,
            displayLabel: 'new-from-route.otio',
            documentId: ${JSON.stringify(prepared.newDocumentId)},
          },
        ],
        groups: currentWorkbench.main.groups.map((group, index) => index === 0 ? ({
          ...group,
          viewIds: [...group.viewIds, 'cut:authoring', 'cut:new-target'],
        }) : group),
      },
    };
    projection = await window.openNekoDesktop.workbench.update(
      workbenchInstance.workbenchInstanceId,
      nextWorkbench,
    );
    const updatedWorkbenchInstance = projection.window.workbench;
    if (updatedWorkbenchInstance.workbenchInstanceId !== workbenchInstance.workbenchInstanceId) {
      throw new Error('Updated Cut Workbench identity changed.');
    }
    const identityFor = (viewId) => {
      const view = updatedWorkbenchInstance.layout.main.views.find(
        (candidate) => candidate.viewId === viewId,
      );
      if (!view?.documentId) throw new Error('Cut functional View is missing: ' + viewId);
      return {
        projectId: view.projectId,
        workspaceId: view.workspaceId,
        windowId: projection.window.windowId,
        viewId: view.viewId,
        viewInstanceId: view.viewInstanceId,
        documentId: view.documentId,
        sessionId: 'cut-session:' + view.viewId + ':' + view.viewInstanceId,
        rendererSessionId: projection.rendererSessionId,
      };
    };
    const playbackIdentity = identityFor('cut:functional');
    const authoringIdentity = identityFor('cut:authoring');
    const playbackBefore = await window.openNekoDesktop.cut.getSnapshot(playbackIdentity);
    const authoringBefore = await window.openNekoDesktop.cut.getSnapshot(authoringIdentity);

    let current = await execute(authoringIdentity, 'command.execute', {
      type: 'append-route',
      items: [{
        kind: 'media',
        clipId: 'appended-route-clip',
        name: 'Explicit route append',
        targetUrl: '../media/motion-with-audio.mp4',
        durationFrames: 60,
        rate: 30,
      }],
    });
    current = await execute(authoringIdentity, 'command.execute', {
      type: 'set-audio',
      clipId: 'clip-motion-a',
      settings: { muted: true, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
    });
    current = await execute(authoringIdentity, 'command.execute', {
      type: 'separate-audio',
      videoClipId: 'clip-motion-a',
      audioClipId: 'separated-audio',
      audioTrackId: 'separated-audio-track',
    });
    current = await execute(authoringIdentity, 'command.execute', {
      type: 'unseparate-audio',
      videoClipId: 'clip-motion-a',
    });
    const separatedVideo = current.snapshot.document.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === 'clip' && item.clipId === 'clip-motion-a');
    current = await execute(authoringIdentity, 'command.execute', {
      type: 'rename-clip',
      clipId: 'clip-motion-a',
      name: 'Saved authoring clip',
    });
    const exportSnapshotId = crypto.randomUUID();
    current = await execute(authoringIdentity, 'export.start', {
      type: 'cut:export-start',
      documentUri: authoringIdentity.documentId,
      sessionId: authoringIdentity.sessionId,
      settings: {
        outputName: 'functional-cut-export',
        container: 'mp4',
        width: 640,
        height: 360,
        framesPerSecond: 30,
        videoBitrate: 1000000,
        includeAudio: true,
        audioBitrate: 128000,
        audioSampleRate: 48000,
      },
    }, exportSnapshotId);
    current = await execute(authoringIdentity, 'command.execute', {
      type: 'rename-clip',
      clipId: 'clip-motion-b',
      name: 'Later edit after export acceptance',
    });
    let exported;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const snapshot = await window.openNekoDesktop.cut.getSnapshot(authoringIdentity);
      const task = snapshot.export.tasks.find(
        (candidate) => candidate.sourceSnapshotId === exportSnapshotId,
      );
      if (task?.status === 'completed') {
        exported = { task, snapshot };
        break;
      }
      if (task?.status === 'failed' || task?.status === 'cancelled' || task?.status === 'outcome-unknown') {
        throw new Error('Cut functional export did not complete: ' + JSON.stringify(task));
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!exported) throw new Error('Cut functional export timed out.');
    const saved = await execute(authoringIdentity, 'document.save');
    const playbackAfter = await window.openNekoDesktop.cut.getSnapshot(playbackIdentity);
    return {
      authoringIdentity,
      playbackDocumentBefore: JSON.stringify(playbackBefore.document),
      playbackDocumentAfter: JSON.stringify(playbackAfter.document),
      newTargetCreated: created.snapshot.identity.documentId === ${JSON.stringify(prepared.newDocumentId)} &&
        created.snapshot.dirty === false,
      explicitTargetAppended: current.snapshot.document.tracks
        .flatMap((track) => track.items)
        .some((item) => item.kind === 'clip' && item.clipId === 'appended-route-clip'),
      manualMutePreserved: separatedVideo?.audio?.muted === true,
      exportSourceSnapshotId: exported.task.sourceSnapshotId,
      exportAcceptedDirty: exported.task.sourceSnapshotId === exportSnapshotId,
      savedDirty: saved.snapshot.dirty,
    };
  })()`);
  checkpoint('cut-authoring-exported', {
    exportSourceSnapshotId: firstPass.exportSourceSnapshotId,
  });

  await replaceWorkbench(
    evaluate,
    `(projection, current) => ({
      ...current,
      main: {
        ...current.main,
        views: current.main.views.filter((view) => view.viewId !== 'cut:authoring'),
        groups: current.main.groups.map((group) => ({
          ...group,
          viewIds: group.viewIds.filter((viewId) => viewId !== 'cut:authoring'),
          activeViewId: group.activeViewId === 'cut:authoring' ? 'cut:functional' : group.activeViewId,
        })),
      },
    })`,
  );
  await delay(250);
  await replaceWorkbench(
    evaluate,
    `(projection, current, tab, project) => ({
      ...current,
      main: {
        ...current.main,
        views: [...current.main.views, {
          viewId: 'cut:authoring-reopened',
          viewInstanceId: tab.viewInstanceId,
          projectId: project.projectId,
          workspaceId: project.workspaceId,
          kind: 'cut',
          ownerId: 'cut-session:cut:authoring-reopened:' + tab.viewInstanceId,
          displayLabel: 'authoring.otio',
          documentId: ${JSON.stringify(prepared.authoringDocumentId)},
        }],
        groups: current.main.groups.map((group, index) => index === 0 ? ({
          ...group,
          viewIds: [...group.viewIds, 'cut:authoring-reopened'],
          activeViewId: 'cut:authoring-reopened',
        }) : group),
      },
      timeline: {
        ...current.timeline,
        ownerViewId: 'cut:authoring-reopened',
      },
    })`,
  );
  const reopened = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const workbenchInstance = projection.window.workbench;
    const view = workbenchInstance.layout.main.views.find(
      (candidate) => candidate.viewId === 'cut:authoring-reopened',
    );
    if (!view?.documentId) throw new Error('Reopened Cut View is missing.');
    const identity = {
      projectId: view.projectId,
      workspaceId: view.workspaceId,
      windowId: projection.window.windowId,
      viewId: view.viewId,
      viewInstanceId: view.viewInstanceId,
      documentId: view.documentId,
      sessionId: 'cut-session:' + view.viewId + ':' + view.viewInstanceId,
      rendererSessionId: projection.rendererSessionId,
    };
    const snapshot = await window.openNekoDesktop.cut.getSnapshot(identity);
    const clips = snapshot.document.tracks.flatMap((track) => track.items)
      .filter((item) => item.kind === 'clip');
    return {
      sessionChanged: identity.sessionId !== ${JSON.stringify(firstPass.authoringIdentity.sessionId)},
      renamedClip: clips.some((clip) =>
        clip.clipId === 'clip-motion-a' && clip.name === 'Saved authoring clip' && clip.audio.muted === true),
      laterEdit: clips.some((clip) =>
        clip.clipId === 'clip-motion-b' && clip.name === 'Later edit after export acceptance'),
    };
  })()`);
  checkpoint('cut-authoring-reopened');
  return {
    newTargetCreated: firstPass.newTargetCreated,
    explicitTargetAppended: firstPass.explicitTargetAppended,
    manualMutePreserved: firstPass.manualMutePreserved,
    multiDocumentIsolated: firstPass.playbackDocumentBefore === firstPass.playbackDocumentAfter,
    exportAcceptedDirty: firstPass.exportAcceptedDirty,
    reopenedFromSavedState: reopened.sessionChanged && reopened.renamedClip && reopened.laterEdit,
  };
}

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

async function waitForCutPausedSeek(
  evaluate,
  previousUrl,
  requestsBeforeSeek,
  readRequests,
  targetTimelineSeconds,
) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const hasNewRequest = readRequests().some(
      (url) => url !== previousUrl && !requestsBeforeSeek.has(url),
    );
    if (hasNewRequest) {
      const sample = await evaluate(cutVideoSeekSampleExpression());
      last = sample;
      const seekedVideo = sample?.videos?.find(
        (video) =>
          video.url?.startsWith('openneko://resource/') &&
          !requestsBeforeSeek.has(video.url) &&
          video.readyState >= MEDIA_HAVE_CURRENT_DATA &&
          video.paused,
      );
      if (seekedVideo && Math.abs(sample.timelineTime - targetTimelineSeconds) <= 0.05) {
        return {
          ...seekedVideo,
          output: sample.output,
          timelineTime: sample.timelineTime,
          clickEvidence: sample.clickEvidence,
        };
      }
    }
    await delay(100);
  }
  throw new Error(
    `Cut package-owned paused seek did not publish a replacement preview request: ${JSON.stringify(last)}`,
  );
}

async function waitForCutReady(evaluate) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const state = await evaluate(`(() => {
      const roots = [...document.querySelectorAll(${JSON.stringify(ACTIVE_CUT_ROOT_SELECTOR)})];
      const root = roots[0];
      const timelines = [...document.querySelectorAll(${JSON.stringify(
        ACTIVE_CUT_TIMELINE_SELECTOR,
      )})];
      const timeline = timelines[0];
      const output = root?.querySelector('.cut-preview-controls output')?.textContent ?? '';
      return {
        rootCount: roots.length,
        timelineCount: timelines.length,
        output,
        clipCount: timeline?.querySelectorAll('.cut-basic-clip').length ?? 0,
        panelIds: [...document.querySelectorAll(
          '[data-workbench-slot="main"] [data-workbench-main-panel][data-active="true"]',
        )].map((panel) => panel.getAttribute('data-workbench-main-panel')),
      };
    })()`);
    last = state;
    if (
      state.rootCount === 1 &&
      state.timelineCount === 1 &&
      state.output.includes('00:04.00') &&
      state.clipCount === 2
    ) {
      return;
    }
    await delay(100);
  }
  throw new Error(
    `Cut package-owned OTIO View did not become ready before timeout: ${JSON.stringify(last)}`,
  );
}

async function seekCutToTimelineMidpoint({ click, evaluate }) {
  const target = await readCutMidpointTarget(evaluate);
  await click(`${ACTIVE_CUT_TIMELINE_SELECTOR} .cut-basic-ruler-tick`, target.tickIndex);
  const presented = await waitForCutFrameAtTimelineTime(evaluate, target.midpointSeconds);
  return {
    evidence: {
      durationSeconds: target.durationSeconds,
      midpointSeconds: target.midpointSeconds,
      presentedSeconds: presented.timelineTime,
      mediaTime: presented.currentTime,
    },
    resourceUrl: presented.url,
  };
}

async function readCutMidpointTarget(evaluate) {
  const target = await evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(ACTIVE_CUT_ROOT_SELECTOR)});
    const timeline = document.querySelector(${JSON.stringify(ACTIVE_CUT_TIMELINE_SELECTOR)});
    const readClock = (value) => {
      const parts = value.trim().split(':');
      if (parts.length !== 2) return undefined;
      const minutes = Number(parts[0]);
      const seconds = Number(parts[1]);
      return Number.isFinite(minutes) && Number.isFinite(seconds)
        ? minutes * 60 + seconds
        : undefined;
    };
    const output = root?.querySelector('.cut-preview-controls output')?.textContent ?? '';
    const outputParts = output.split('/');
    const durationSeconds = readClock(outputParts[outputParts.length - 1] ?? '');
    const ruler = timeline?.querySelector('.cut-basic-ruler');
    const referenceTick = [...(timeline?.querySelectorAll('.cut-basic-ruler-tick') ?? [])].find((tick) => {
      const seconds = readClock(tick.textContent ?? '');
      const left = Number.parseFloat(tick.style.left);
      return seconds !== undefined && seconds > 0 && Number.isFinite(left) && left > 0;
    });
    const referenceSeconds = referenceTick ? readClock(referenceTick.textContent ?? '') : undefined;
    const referenceLeft = referenceTick ? Number.parseFloat(referenceTick.style.left) : undefined;
    const rulerWidth = ruler?.getBoundingClientRect().width ?? 0;
    if (
      durationSeconds === undefined ||
      durationSeconds <= 0 ||
      referenceSeconds === undefined ||
      referenceLeft === undefined ||
      rulerWidth <= 0
    ) {
      return { output, durationSeconds, referenceSeconds, referenceLeft, rulerWidth };
    }
    const pixelsPerSecond = referenceLeft / referenceSeconds;
    const midpointSeconds = durationSeconds / 2;
    const ticks = [...(timeline?.querySelectorAll('.cut-basic-ruler-tick') ?? [])].map((tick, index) => ({
      index,
      seconds: Number.parseFloat(tick.style.left) / pixelsPerSecond,
    }));
    const nearestTick = (seconds) => ticks.reduce((nearest, candidate) =>
      Math.abs(candidate.seconds - seconds) < Math.abs(nearest.seconds - seconds)
        ? candidate
        : nearest,
    );
    const midpointTick = nearestTick(midpointSeconds);
    const replacementSeconds = durationSeconds * 0.625;
    const replacementTick = nearestTick(replacementSeconds);
    return {
      durationSeconds,
      midpointSeconds,
      tickIndex: midpointTick.index,
      tickSeconds: midpointTick.seconds,
      replacementSeconds,
      replacementTickIndex: replacementTick.index,
      replacementTickSeconds: replacementTick.seconds,
      rulerWidth,
      pixelsPerSecond,
      output,
    };
  })()`);
  if (
    !target ||
    !Number.isFinite(target.durationSeconds) ||
    !Number.isFinite(target.midpointSeconds) ||
    !Number.isInteger(target.tickIndex) ||
    !Number.isFinite(target.tickSeconds) ||
    Math.abs(target.tickSeconds - target.midpointSeconds) > 0.05 ||
    !Number.isInteger(target.replacementTickIndex) ||
    !Number.isFinite(target.replacementTickSeconds) ||
    Math.abs(target.replacementTickSeconds - target.replacementSeconds) > 0.05
  ) {
    throw new Error(
      `Cut midpoint target could not be derived from the visible timeline: ${JSON.stringify(target)}`,
    );
  }
  return target;
}

async function waitForCutFrameAtTimelineTime(evaluate, targetTimelineSeconds) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(cutVideoSeekSampleExpression());
    last = sample;
    const visibleVideo = sample?.videos?.find(
      (video) =>
        video.url?.startsWith('openneko://resource/') &&
        video.ariaHidden !== 'true' &&
        video.readyState >= MEDIA_HAVE_CURRENT_DATA &&
        video.paused,
    );
    if (visibleVideo && Math.abs(sample.timelineTime - targetTimelineSeconds) <= 0.05) {
      return { ...visibleVideo, timelineTime: sample.timelineTime };
    }
    await delay(100);
  }
  throw new Error(
    `Cut midpoint frame did not become visible before timeout: ${JSON.stringify(last)}`,
  );
}

async function waitForCutAuthoringVisible(evaluate) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const visible = await evaluate(`(() => {
      const timeline = document.querySelector(${JSON.stringify(ACTIVE_CUT_TIMELINE_SELECTOR)});
      return [...(timeline?.querySelectorAll('.cut-basic-clip-name') ?? [])].some(
        (element) => element.textContent?.trim() === 'Saved authoring clip',
      );
    })()`);
    if (visible) return;
    await delay(100);
  }
  throw new Error('Cut saved authoring state did not become visible before screenshot capture.');
}

function cutVideoSeekSampleExpression() {
  return `(() => {
    const root = document.querySelector(${JSON.stringify(ACTIVE_CUT_ROOT_SELECTOR)});
    const videos = [...(root?.querySelectorAll('video') ?? [])];
    const output = root?.querySelector('.cut-preview-controls output')?.textContent ?? '';
    const readClock = (value) => {
      const parts = value.trim().split(':');
      if (parts.length !== 2) return undefined;
      const minutes = Number(parts[0]);
      const seconds = Number(parts[1]);
      return Number.isFinite(minutes) && Number.isFinite(seconds)
        ? minutes * 60 + seconds
        : undefined;
    };
    const video = videos.find(
      (candidate) => candidate.getAttribute('aria-hidden') !== 'true' && candidate.src,
    );
    return {
      url: video?.src,
      currentSrc: video?.currentSrc,
      currentTime: video?.currentTime,
      readyState: video?.readyState,
      paused: video?.paused,
      output,
      timelineTime: readClock(output.split('/')[0] ?? ''),
      clickEvidence: window.__openNekoCutClickEvidence,
      videos: videos.map((candidate) => ({
        url: candidate.src,
        currentTime: candidate.currentTime,
        readyState: candidate.readyState,
        paused: candidate.paused,
        ariaHidden: candidate.getAttribute('aria-hidden'),
      })),
    };
  })()`;
}

async function waitForReleasedUrl(evaluate, url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const status = await readFetchStatus(evaluate, url);
    if (status === 0) return status;
    await delay(100);
  }
  throw new Error('Cut prior playback request remained reachable after seek.');
}

function cutVideoSampleExpression() {
  return `(() => {
    const root = document.querySelector(${JSON.stringify(ACTIVE_CUT_ROOT_SELECTOR)});
    const videos = [...(root?.querySelectorAll('video') ?? [])];
    const video = videos.find((candidate) => !candidate.paused && candidate.src) ??
      videos.find((candidate) => candidate.getAttribute('aria-hidden') !== 'true' && candidate.src) ??
      videos.find((candidate) => candidate.src);
    const button = root?.querySelector('[data-testid="cut-preview-toggle-playback"]');
    if (!(video instanceof HTMLVideoElement)) return {
      videoCount: videos.length,
      buttonLabel: button?.getAttribute('aria-label'),
      alerts: [...(root?.querySelectorAll('[role="alert"]') ?? [])].map((item) => item.textContent),
      output: root?.querySelector('.cut-preview-controls output')?.textContent,
      toasts: [...(root?.querySelectorAll('[role="status"]') ?? [])].map((item) => item.textContent),
      clickEvidence: window.__openNekoCutClickEvidence,
      videos: videos.map((candidate) => ({
        url: candidate.src,
        currentTime: candidate.currentTime,
        readyState: candidate.readyState,
        paused: candidate.paused,
        errorCode: candidate.error?.code,
        ariaHidden: candidate.getAttribute('aria-hidden'),
      })),
    };
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return {
      url: video.src,
      currentSrc: video.currentSrc,
      currentTime: video.currentTime,
      readyState: video.readyState,
      paused: video.paused,
      errorCode: video.error?.code,
      buttonLabel: button?.getAttribute('aria-label'),
      output: root?.querySelector('.cut-preview-controls output')?.textContent,
      toasts: [...(root?.querySelectorAll('[role="status"]') ?? [])].map((item) => item.textContent),
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
      output: root?.querySelector('.cut-preview-controls output')?.textContent,
      toasts: [...(root?.querySelectorAll('[role="status"]') ?? [])].map((item) => item.textContent),
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

async function captureSettledScreenshot(screenshot, label) {
  await delay(VISUAL_SETTLE_MILLISECONDS);
  return screenshot(label);
}
