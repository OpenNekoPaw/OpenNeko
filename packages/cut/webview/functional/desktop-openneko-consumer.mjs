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
  '[data-workbench-slot="bottomPanel"] [data-workbench-cut-panel="true"] ' +
  '[data-owner-root="cut"]';
const ACTIVE_CUT_TIMELINE_SELECTOR = `${ACTIVE_CUT_ROOT_SELECTOR} .cut-basic-timeline-region`;

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
    drag,
    evaluate,
    hover,
    pressKey,
    prepared,
    readOpenNekoResourceRequests,
    screenshot,
    waitForSelector,
  }) {
    await openFixtureWorkspace(evaluate);
    await waitForSelector('[data-workbench-region-control="cut-panel"]');
    const emptyControl = await evaluate(`(() => {
      const control = document.querySelector('[data-workbench-region-control="cut-panel"]');
      return {
        exists: control instanceof HTMLButtonElement,
        disabled: control instanceof HTMLButtonElement ? control.disabled : true,
        pressed: control?.getAttribute('aria-pressed'),
      };
    })()`);
    if (!emptyControl.exists || emptyControl.disabled || emptyControl.pressed !== 'false') {
      throw new Error(`Cut empty draft control is invalid: ${JSON.stringify(emptyControl)}`);
    }
    await click('[data-workbench-region-control="cut-panel"]');
    await waitForSelector('.cut-basic-timeline-region [data-cut-track-id]');
    await delay(VISUAL_SETTLE_MILLISECONDS);
    const emptyDraft = await evaluate(`(() => {
      const panel = document.querySelector('[data-workbench-cut-panel="true"]');
      const views = [...document.querySelectorAll(
        '[data-workbench-cut-panel="true"] [data-cut-view-id]'
      )];
      const timeline = panel?.querySelector('.cut-basic-timeline');
      const tracks = timeline?.querySelectorAll('[data-cut-track-id]') ?? [];
      const clips = timeline?.querySelectorAll('.cut-basic-clip') ?? [];
      const syntheticEmpty = timeline?.querySelector(
        '[data-cut-empty-timeline="true"], .cut-basic-timeline-empty'
      );
      const saveControl = timeline?.querySelector('button[title*="Cmd/Ctrl+S"]');
      const control = document.querySelector('[data-workbench-region-control="cut-panel"]');
      return {
        panelVisible: Boolean(panel),
        oneActiveRoot: views.length === 1,
        canonicalTimeline: Boolean(timeline) && tracks.length > 0 && clips.length === 0,
        syntheticEmptyAbsent: !syntheticEmpty,
        saveControlVisible: saveControl instanceof HTMLButtonElement && !saveControl.disabled,
        saveControlIcon: Boolean(saveControl?.querySelector('.codicon-save')),
        selected: control?.getAttribute('aria-pressed') === 'true',
      };
    })()`);
    const emptyDraftScreenshot = await screenshot('cut-empty-draft');
    await resizeCutWindow(evaluate, 1280, 760);
    await delay(VISUAL_SETTLE_MILLISECONDS);
    const emptyDraftCompact = await evaluate(`(() => {
      const timeline = document.querySelector('.cut-basic-timeline-region');
      const bounds = timeline?.getBoundingClientRect();
      return {
        timelineVisible: Boolean(bounds && bounds.width > 0 && bounds.height > 0),
        insideViewport: Boolean(
          bounds && bounds.left >= 0 && bounds.right <= innerWidth &&
          bounds.top >= 0 && bounds.bottom <= innerHeight
        ),
        syntheticEmptyAbsent: !document.querySelector(
          '[data-cut-empty-timeline="true"], .cut-basic-timeline-empty'
        ),
      };
    })()`);
    const emptyDraftCompactScreenshot = await screenshot('cut-empty-draft-compact');
    await resizeCutWindow(evaluate, 2000, 1250);
    await delay(VISUAL_SETTLE_MILLISECONDS);
    const rulerSticky = await evaluate(`(() => {
      const scroll = document.querySelector('.cut-basic-timeline-scroll');
      const ruler = scroll?.querySelector('.cut-basic-ruler-row');
      const track = scroll?.querySelector('.cut-basic-track-row');
      if (!(scroll instanceof HTMLElement) || !(ruler instanceof HTMLElement) ||
          !(track instanceof HTMLElement)) {
        throw new Error('Canonical Cut Timeline scroll geometry is unavailable.');
      }
      const originalTrackHeight = track.style.height;
      track.style.height = '800px';
      scroll.scrollTop = 120;
      const scrollBounds = scroll.getBoundingClientRect();
      const rulerBounds = ruler.getBoundingClientRect();
      const evidence = {
        scrollTop: scroll.scrollTop,
        rulerVisible: rulerBounds.bottom > scrollBounds.top && rulerBounds.top < scrollBounds.bottom,
        rulerPinnedToTop: Math.abs(rulerBounds.top - scrollBounds.top) <= 2,
      };
      scroll.scrollTop = 0;
      track.style.height = originalTrackHeight;
      return evidence;
    })()`);
    await click('[data-cut-tab-add="true"]');
    await waitForSelector(
      '[data-workbench-cut-panel="true"] .neko-workbench-editor-tab:nth-child(2)',
    );
    await delay(VISUAL_SETTLE_MILLISECONDS);
    const emptyDraftAdd = await evaluate(`(() => {
      const panel = document.querySelector('[data-workbench-cut-panel="true"]');
      const tabs = [...(panel?.querySelectorAll('.neko-workbench-editor-tab') ?? [])];
      const labels = tabs.map((tab) =>
        tab.querySelector('.neko-workbench-editor-tab__label')?.textContent?.trim() ?? ''
      );
      const active = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
      return {
        addControlPresent: panel?.querySelector('[data-cut-tab-add="true"]') instanceof HTMLButtonElement,
        tabCount: tabs.length,
        labels,
        labelsUnique: new Set(labels).size === labels.length,
        activeLabel: active?.querySelector('.neko-workbench-editor-tab__label')?.textContent?.trim(),
        oneActiveRoot: panel?.querySelectorAll('[data-cut-view-id]').length === 1,
        defaultVideoTrack: Boolean(
          panel?.querySelector(
            '[data-cut-track-id] .cut-basic-track-type-icon[title="Video"]'
          )
        ),
        syntheticEmptyAbsent: !panel?.querySelector(
          '[data-cut-empty-timeline="true"], .cut-basic-timeline-empty'
        ),
      };
    })()`);
    const emptyDraftAddedScreenshot = await screenshot('cut-empty-draft-added');
    checkpoint('cut-empty-draft', emptyDraft);
    checkpoint('cut-empty-draft-add', emptyDraftAdd);
    checkpoint('cut-timeline-ruler-sticky', rulerSticky);
    await replaceWorkbench(
      evaluate,
      `(projection, current, tab, project) => ({
        ...current,
        display: { ...current.display, mode: 'main-only' },
        cutPanel: {
          presentation: 'docked',
          height: 420,
          views: [
            {
              viewId: 'cut:functional',
              viewInstanceId: tab.viewInstanceId,
              projectId: project.projectId,
              workspaceId: project.workspaceId,
              kind: 'cut',
              ownerId: 'cut-session:cut:functional:' + tab.viewInstanceId,
              displayLabel: 'qualification.otio',
              documentId: ${JSON.stringify(prepared.documentId)},
            },
          ],
          activeViewId: 'cut:functional',
        },
      })`,
    );
    await waitForSelector(
      `${ACTIVE_CUT_ROOT_SELECTOR} [data-testid="cut-preview-toggle-playback"]`,
    );
    await waitForCutReady(evaluate);
    checkpoint('cut-ready');
    const saveControl = await qualifyCutSaveControl({
      checkpoint,
      click,
      evaluate,
      pressKey,
      prepared,
    });
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
    let seeked;
    try {
      seeked = await waitForCutPausedSeek(
        evaluate,
        playing.url,
        requestsBeforeSeek,
        readOpenNekoResourceRequests,
        seekTarget.replacementSeconds,
      );
    } catch {
      await click(
        `${ACTIVE_CUT_TIMELINE_SELECTOR} .cut-basic-ruler-tick`,
        seekTarget.replacementTickIndex,
      );
      seeked = await waitForCutPausedSeek(
        evaluate,
        playing.url,
        requestsBeforeSeek,
        readOpenNekoResourceRequests,
        seekTarget.replacementSeconds,
      );
    }
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
    const tabPanel = await qualifyCutTabPanelPresentation({
      checkpoint,
      click,
      evaluate,
      hover,
      screenshot,
    });
    await waitForCutAuthoringVisible(evaluate);
    const authoringMidpointState = await seekCutToTimelineMidpoint({ click, evaluate });
    const authoringScreenshot = await captureSettledScreenshot(
      screenshot,
      'cut-authoring-complete',
    );
    const resourceDrop = await qualifyResourceDropToCutTimeline({
      checkpoint,
      click,
      drag,
      evaluate,
      screenshot,
    });
    await resizeCutWindow(evaluate, 1280, 760);
    await delay(VISUAL_SETTLE_MILLISECONDS);
    const compactLayout = await inspectCutLayout(evaluate);
    if (!compactLayout.previewAboveTimeline || compactLayout.overlaps.length > 0) {
      throw new Error(`Cut compact layout is invalid: ${JSON.stringify(compactLayout)}`);
    }
    const compactScreenshot = await screenshot('cut-preview-timeline-compact');
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
      tabPanel,
      resourceDrop,
      saveControl,
      emptyDraft,
      emptyDraftCompact,
      emptyDraftAdd,
      rulerSticky,
      compactLayout,
      visualMidpoints: {
        ready: readyMidpointState.evidence,
        seek: seekMidpointState.evidence,
        authoring: authoringMidpointState.evidence,
      },
      screenshots: [
        emptyDraftScreenshot,
        emptyDraftCompactScreenshot,
        emptyDraftAddedScreenshot,
        readyScreenshot,
        seekScreenshot,
        ...tabPanel.screenshots,
        authoringScreenshot,
        resourceDrop.screenshot,
        compactScreenshot,
      ],
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
    if (
      !evidence.emptyDraft?.panelVisible ||
      !evidence.emptyDraft?.oneActiveRoot ||
      !evidence.emptyDraft?.canonicalTimeline ||
      !evidence.emptyDraft?.syntheticEmptyAbsent ||
      !evidence.emptyDraft?.saveControlVisible ||
      !evidence.emptyDraft?.saveControlIcon ||
      !evidence.emptyDraft?.selected ||
      !evidence.emptyDraftCompact?.timelineVisible ||
      !evidence.emptyDraftCompact?.insideViewport ||
      !evidence.emptyDraftCompact?.syntheticEmptyAbsent ||
      evidence.emptyDraftAdd?.tabCount !== 2 ||
      !evidence.emptyDraftAdd?.addControlPresent ||
      !evidence.emptyDraftAdd?.labelsUnique ||
      evidence.emptyDraftAdd?.activeLabel !== evidence.emptyDraftAdd?.labels?.[1] ||
      !evidence.emptyDraftAdd?.oneActiveRoot ||
      !evidence.emptyDraftAdd?.defaultVideoTrack ||
      !evidence.emptyDraftAdd?.syntheticEmptyAbsent ||
      evidence.rulerSticky?.scrollTop <= 28 ||
      !evidence.rulerSticky?.rulerVisible ||
      !evidence.rulerSticky?.rulerPinnedToTop
    ) {
      throw new Error('Cut empty draft evidence is incomplete.');
    }
    if (
      !evidence.tabPanel?.hiddenReclaimedMain ||
      !evidence.tabPanel?.tabsKeepMainStable ||
      !evidence.tabPanel?.controlStateTracksPanel ||
      !evidence.tabPanel?.controlOrderCorrect ||
      !evidence.saveControl?.trustedClick ||
      !evidence.saveControl?.persisted ||
      !evidence.saveControl?.trustedShortcut ||
      !evidence.saveControl?.shortcutPersisted ||
      !evidence.resourceDrop?.clipAdded ||
      !evidence.compactLayout?.previewAboveTimeline
    ) {
      throw new Error('Cut Panel tabs, presentation or Resource drag evidence is incomplete.');
    }
  },
});

async function qualifyCutSaveControl({ checkpoint, click, evaluate, pressKey, prepared }) {
  const selector = `${ACTIVE_CUT_ROOT_SELECTOR} button[title*="Cmd/Ctrl+S"]`;
  const control = await evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Cut save control is unavailable.');
    }
    window.__openNekoCutSaveClickEvidence = [];
    window.__openNekoCutSaveKeyEvidence = [];
    button.addEventListener('click', (event) => {
      window.__openNekoCutSaveClickEvidence.push({ trusted: event.isTrusted });
    });
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyS' && (event.metaKey || event.ctrlKey)) {
        window.__openNekoCutSaveKeyEvidence.push({
          trusted: event.isTrusted,
          primary: event.metaKey ? 'meta' : 'control',
        });
      }
    }, { capture: true });
    const bounds = button.getBoundingClientRect();
    return {
      label: button.getAttribute('aria-label'),
      enabled: !button.disabled,
      hasIcon: Boolean(button.querySelector('.codicon-save')),
      width: bounds.width,
      height: bounds.height,
    };
  })()`);
  const documentPath = join(prepared.workspacePath, prepared.documentId);
  const before = await stat(documentPath);
  await click(selector);
  const deadline = Date.now() + 10_000;
  let after = before;
  while (Date.now() < deadline) {
    after = await stat(documentPath);
    if (after.mtimeMs > before.mtimeMs) break;
    await delay(100);
  }
  const interactions = await evaluate(`window.__openNekoCutSaveClickEvidence ?? []`);
  const beforeShortcut = after;
  await pressKey('s', ['Meta']);
  const shortcutDeadline = Date.now() + 10_000;
  let afterShortcut = beforeShortcut;
  while (Date.now() < shortcutDeadline) {
    afterShortcut = await stat(documentPath);
    if (afterShortcut.mtimeMs > beforeShortcut.mtimeMs) break;
    await delay(100);
  }
  const keyInteractions = await evaluate(`window.__openNekoCutSaveKeyEvidence ?? []`);
  const evidence = {
    ...control,
    trustedClick: interactions.some((entry) => entry.trusted === true),
    persisted: after.mtimeMs > before.mtimeMs,
    trustedShortcut: keyInteractions.some((entry) => entry.trusted === true),
    shortcutPersisted: afterShortcut.mtimeMs > beforeShortcut.mtimeMs,
  };
  checkpoint('cut-save-control', evidence);
  return evidence;
}

async function qualifyCutTabPanelPresentation({ checkpoint, click, evaluate, hover, screenshot }) {
  await evaluate(`(() => {
    const tabs = [...document.querySelectorAll(
      '[data-workbench-cut-panel="true"] .neko-workbench-editor-tab',
    )];
    const qualification = tabs.find((tab) => tab.textContent?.includes('qualification.otio'));
    const authoring = tabs.find((tab) => tab.textContent?.includes('authoring.otio'));
    if (!(qualification instanceof HTMLElement) || !(authoring instanceof HTMLElement)) {
      throw new Error('Cut Panel OTIO tabs are unavailable.');
    }
    qualification.dataset.cutFunctionalTab = 'qualification';
    authoring.dataset.cutFunctionalTab = 'authoring';
    return true;
  })()`);
  await click('[data-cut-functional-tab="authoring"]');
  await waitForActiveCutView(evaluate, 'cut:authoring-reopened');
  await waitForCutPanelControlEnabled(evaluate);
  const visible = await inspectCutLayout(evaluate);
  const visiblePresentation = await waitForCutPanelPresentation(evaluate, true);
  await click('[data-workbench-region-control="cut-panel"]');
  const hidden = await waitForCutPanelPresentation(evaluate, false);
  await hover('[data-workbench-slot="main"]');
  const hiddenScreenshot = await captureSettledScreenshot(screenshot, 'cut-panel-hidden');

  await waitForCutPanelControlEnabled(evaluate);
  await click('[data-workbench-region-control="cut-panel"]');
  await waitForActiveCutView(evaluate, 'cut:authoring-reopened');
  const restoredPresentation = await waitForCutPanelPresentation(evaluate, true);
  await evaluate(`(() => {
    const tabs = [...document.querySelectorAll(
      '[data-workbench-cut-panel="true"] .neko-workbench-editor-tab',
    )];
    const qualification = tabs.find((tab) => tab.textContent?.includes('qualification.otio'));
    const authoring = tabs.find((tab) => tab.textContent?.includes('authoring.otio'));
    if (!(qualification instanceof HTMLElement) || !(authoring instanceof HTMLElement)) {
      throw new Error('Restored Cut Panel OTIO tabs are unavailable.');
    }
    qualification.dataset.cutFunctionalTab = 'qualification';
    authoring.dataset.cutFunctionalTab = 'authoring';
    return true;
  })()`);

  await click('[data-cut-functional-tab="qualification"]');
  await waitForActiveCutView(evaluate, 'cut:functional');
  const qualification = await inspectCutLayout(evaluate);
  const switchedScreenshot = await captureSettledScreenshot(
    screenshot,
    'cut-qualification-tab-visible',
  );

  await click('[data-cut-functional-tab="authoring"]');
  await waitForActiveCutView(evaluate, 'cut:authoring-reopened');
  const presentation = await readCutPanelPresentation(evaluate);

  const evidence = {
    hiddenReclaimedMain:
      visible.panelVisible &&
      !hidden.panelVisible &&
      hidden.cutRootCount === 0 &&
      hidden.mainHeight > visible.mainHeight,
    tabsKeepMainStable:
      qualification.activeCutViewId === 'cut:functional' &&
      visible.activeMainViewId === qualification.activeMainViewId &&
      presentation.presentation === 'docked' &&
      presentation.activeViewId === 'cut:authoring-reopened' &&
      presentation.viewIds.includes('cut:functional'),
    controlStateTracksPanel:
      visiblePresentation.controlPressed &&
      !hidden.controlPressed &&
      !hidden.controlDisabled &&
      restoredPresentation.controlPressed,
    controlOrderCorrect:
      JSON.stringify(restoredPresentation.controlOrder) ===
      JSON.stringify(['agent', 'main', 'cut-panel', 'management']),
    visibleLayout: visible,
    hiddenLayout: hidden,
    screenshots: [hiddenScreenshot, switchedScreenshot],
  };
  checkpoint('cut-tab-panel-presentation', evidence);
  return evidence;
}

async function resizeCutWindow(evaluate, width, height) {
  await evaluate(`(() => {
    window.resizeTo(${String(width)}, ${String(height)});
    return { width: window.innerWidth, height: window.innerHeight };
  })()`);
  await delay(250);
}

async function qualifyResourceDropToCutTimeline({ checkpoint, click, drag, evaluate, screenshot }) {
  const mediaExpanded = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.neko-resource-browser__item-row')];
    const mediaRow = rows.find((row) =>
      row.querySelector('strong')?.textContent?.trim() === 'media',
    );
    const mediaItem = mediaRow?.querySelector('.neko-resource-browser__item');
    const disclosure = mediaRow?.querySelector('.neko-resource-browser__disclosure');
    if (!(mediaItem instanceof HTMLButtonElement) || !(disclosure instanceof HTMLElement)) {
      throw new Error('Workspace media directory is unavailable for Cut drag qualification.');
    }
    disclosure.dataset.cutFunctionalMediaDisclosure = 'true';
    return mediaItem.getAttribute('aria-expanded') === 'true';
  })()`);
  if (!mediaExpanded) await click('[data-cut-functional-media-disclosure="true"]');
  const deadline = Date.now() + 10_000;
  let sourceReady = false;
  while (Date.now() < deadline) {
    sourceReady = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll('.neko-resource-browser__item')];
      const source = buttons.find((button) =>
        button.querySelector('strong')?.textContent?.trim() === 'motion-with-audio.mp4',
      );
      if (!(source instanceof HTMLButtonElement) || !source.draggable) return false;
      source.dataset.cutFunctionalDragSource = 'true';
      return true;
    })()`);
    if (sourceReady) break;
    await delay(100);
  }
  if (!sourceReady) throw new Error('Workspace video resource did not become draggable.');
  await evaluate(`(() => {
    window.__openNekoCutDragEvidence = [];
    const record = (kind) => (event) => {
      window.__openNekoCutDragEvidence.push({
        kind,
        trusted: event.isTrusted,
        types: [...event.dataTransfer.types],
      });
    };
    document.querySelector('[data-cut-functional-drag-source="true"]')
      ?.addEventListener('dragstart', record('dragstart'));
    const timeline = document.querySelector(${JSON.stringify(ACTIVE_CUT_TIMELINE_SELECTOR)});
    timeline?.addEventListener('dragenter', record('dragenter'));
    timeline?.addEventListener('dragover', record('dragover'));
    timeline?.addEventListener('drop', record('drop'));
    return true;
  })()`);
  const before = await readActiveCutClipCount(evaluate);
  await drag('[data-cut-functional-drag-source="true"]', '[data-cut-track-id="video-1"]', {
    targetPosition: { xRatio: 0.85, yRatio: 0.5 },
  });
  let after = before;
  const mutationDeadline = Date.now() + 30_000;
  while (Date.now() < mutationDeadline) {
    after = await readActiveCutClipCount(evaluate);
    if (after > before) break;
    await delay(100);
  }
  const clipAdded = after === before + 1;
  if (!clipAdded) {
    const dragEvidence = await evaluate(`window.__openNekoCutDragEvidence ?? []`);
    throw new Error(
      `Resource drag did not add one Cut clip: ${JSON.stringify({ before, after, dragEvidence })}`,
    );
  }
  const dragScreenshot = await captureSettledScreenshot(screenshot, 'cut-resource-dropped');
  const evidence = { before, after, clipAdded, screenshot: dragScreenshot };
  checkpoint('cut-resource-dropped', evidence);
  return evidence;
}

async function waitForActiveCutView(evaluate, viewId) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const ready = await evaluate(`(() => {
      const panel = document.querySelector('[data-workbench-cut-panel="true"]');
      const root = panel?.querySelector('[data-owner-root="cut"]');
      return panel?.querySelector('[data-cut-view-id]')?.getAttribute('data-cut-view-id') ===
          ${JSON.stringify(viewId)} && root instanceof HTMLElement;
    })()`);
    if (ready) return;
    await delay(100);
  }
  const state = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const workbench = projection.window.workbench.layout;
    const panel = document.querySelector('[data-workbench-cut-panel="true"]');
    return {
      hostActiveViewId: workbench.cutPanel?.activeViewId,
      hostPresentation: workbench.cutPanel?.presentation,
      domActiveViewId: panel?.querySelector('[data-cut-view-id]')?.getAttribute('data-cut-view-id'),
      cutRootCount: panel?.querySelectorAll('[data-owner-root="cut"]').length ?? 0,
      controlDisabled: document.querySelector('[data-workbench-region-control="cut-panel"]')?.disabled,
    };
  })()`);
  throw new Error(`Cut View '${viewId}' did not become active: ${JSON.stringify(state)}`);
}

async function waitForCutPanelControlEnabled(evaluate) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const enabled = await evaluate(`(() => {
      const control = document.querySelector('[data-workbench-region-control="cut-panel"]');
      return control instanceof HTMLButtonElement && !control.disabled;
    })()`);
    if (enabled) return;
    await delay(100);
  }
  throw new Error('Cut Panel control did not become interactive.');
}

async function readCutPanelPresentation(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const panel = projection.window.workbench.layout.cutPanel;
    return {
      presentation: panel?.presentation,
      activeViewId: panel?.activeViewId,
      viewIds: panel?.views.map((view) => view.viewId) ?? [],
    };
  })()`);
}

async function waitForCutPanelPresentation(evaluate, visible) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const state = await inspectWorkbenchCutPanelLayout(evaluate);
    if (state.panelVisible === visible && (visible || state.cutRootCount === 0)) return state;
    await delay(100);
  }
  throw new Error(`Cut Panel did not reach visible=${String(visible)}.`);
}

async function readActiveCutClipCount(evaluate) {
  return evaluate(`document.querySelector(${JSON.stringify(ACTIVE_CUT_TIMELINE_SELECTOR)})
    ?.querySelectorAll('.cut-basic-clip').length ?? 0`);
}

async function inspectCutLayout(evaluate) {
  return evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(ACTIVE_CUT_ROOT_SELECTOR)});
    const shell = root?.querySelector('.cut-workbench-shell');
    const body = root?.querySelector('.cut-workbench-body');
    const main = root?.querySelector('.cut-main-panel');
    const editor = root?.querySelector('.cut-basic-editor');
    const preview = root?.querySelector('.cut-basic-upper-workspace');
    const timeline = root?.querySelector('.cut-basic-timeline-region');
    if (!(editor instanceof HTMLElement) || !(preview instanceof HTMLElement)) {
      throw new Error('Cut layout inspection requires its editor and Preview.');
    }
    const editorRect = editor.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const timelineRect = timeline instanceof HTMLElement ? timeline.getBoundingClientRect() : undefined;
    const overlaps = timelineRect && previewRect.bottom > timelineRect.top + 0.5
      ? ['preview-timeline']
      : [];
    const boxes = Object.fromEntries(
      Object.entries({ root, shell, body, main, editor, preview }).map(([name, element]) => {
        if (!(element instanceof HTMLElement)) return [name, null];
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return [name, {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          display: style.display,
          flex: style.flex,
          heightStyle: style.height,
        }];
      }),
    );
    return {
      editorHeight: editorRect.height,
      previewHeight: previewRect.height,
      timelineHeight: timelineRect?.height ?? 0,
      panelVisible: true,
      activeCutViewId: root.closest('[data-cut-view-id]')?.getAttribute('data-cut-view-id'),
      activeMainViewId: document.querySelector('.project-main-view-stack__item[data-main-view-id]')
        ?.getAttribute('data-main-view-id'),
      mainHeight: document.querySelector('[data-workbench-slot="main"]')
        ?.getBoundingClientRect().height ?? 0,
      previewAboveTimeline: !timelineRect || previewRect.bottom <= timelineRect.top + 0.5,
      overlaps,
      boxes,
    };
  })()`);
}

async function inspectWorkbenchCutPanelLayout(evaluate) {
  return evaluate(`(() => {
    const shell = document.querySelector('[data-neko-controlled-workbench="true"]');
    const main = document.querySelector('[data-workbench-slot="main"]');
    const panel = document.querySelector('[data-workbench-slot="bottomPanel"]');
    return {
      panelVisible: shell?.getAttribute('data-bottom-panel-visible') === 'true',
      mainHeight: main?.getBoundingClientRect().height ?? 0,
      panelHeight: panel?.getBoundingClientRect().height ?? 0,
      cutRootCount: panel?.querySelectorAll('[data-owner-root="cut"]').length ?? 0,
      activeMainViewId: document.querySelector('.project-main-view-stack__item[data-main-view-id]')
        ?.getAttribute('data-main-view-id'),
      controlPressed:
        document.querySelector('[data-workbench-region-control="cut-panel"]')
          ?.getAttribute('aria-pressed') === 'true',
      controlDisabled:
        document.querySelector('[data-workbench-region-control="cut-panel"]')?.disabled === true,
      controlOrder: [...document.querySelectorAll(
        '.workspace-region-controls [data-workbench-region-control]',
      )].map((element) => element.getAttribute('data-workbench-region-control')),
    };
  })()`);
}

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
    if (!currentWorkbench.cutPanel) throw new Error('Cut functional Panel is missing.');
    const nextWorkbench = {
      ...currentWorkbench,
      cutPanel: {
        ...currentWorkbench.cutPanel,
        views: [
          ...currentWorkbench.cutPanel.views,
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
      const view = updatedWorkbenchInstance.layout.cutPanel?.views.find(
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
      cutPanel: {
        ...current.cutPanel,
        views: current.cutPanel.views.filter((view) => view.viewId !== 'cut:authoring'),
        activeViewId: current.cutPanel.activeViewId === 'cut:authoring'
          ? 'cut:functional'
          : current.cutPanel.activeViewId,
      },
    })`,
  );
  await delay(250);
  await replaceWorkbench(
    evaluate,
    `(projection, current, tab, project) => ({
      ...current,
      cutPanel: {
        ...current.cutPanel,
        views: [...current.cutPanel.views, {
          viewId: 'cut:authoring-reopened',
          viewInstanceId: tab.viewInstanceId,
          projectId: project.projectId,
          workspaceId: project.workspaceId,
          kind: 'cut',
          ownerId: 'cut-session:cut:authoring-reopened:' + tab.viewInstanceId,
          displayLabel: 'authoring.otio',
          documentId: ${JSON.stringify(prepared.authoringDocumentId)},
        }],
        activeViewId: 'cut:authoring-reopened',
      },
    })`,
  );
  const reopened = await evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const workbenchInstance = projection.window.workbench;
    const view = workbenchInstance.layout.cutPanel?.views.find(
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
