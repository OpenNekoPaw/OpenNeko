import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(__dirname, path), 'utf8');
}

describe('Cut OTIO Webview boundary', () => {
  const app = source('App.tsx');
  const previewControls = source('components/PreviewControls.tsx');
  const root = source('root.tsx');
  const timeline = source('components/Timeline/Timeline.tsx');
  const track = source('components/Timeline/TimelineTrack.tsx');
  const clip = source('components/Timeline/TimelineElementContent.tsx');
  const toolbar = source('components/Timeline/TimelineControls.tsx');
  const overview = source('components/Timeline/TimelineMinimap/TimelineMinimap.tsx');
  const inspector = source('components/PropertyPanel/PropertyPanelInline.tsx');
  const exportPanel = source('components/Timeline/export/ExportPanel.tsx');
  const exportConfig = source('components/Timeline/export/ExportConfigView.tsx');
  const exportProgress = source('components/Timeline/export/ExportProgressView.tsx');
  const errorBoundary = source('components/ErrorBoundary/ErrorBoundary.tsx');
  const representations = source('hooks/useClipRepresentations.ts');
  const contextMenu = source('hooks/useTimelineContextMenu.ts');
  const styles = source('index.css');
  const presentation = [app, timeline, track, clip, inspector].join('\n');

  it('retains the established preview, controller, timeline, inspector and workbench boundaries', () => {
    expect(app).toMatch(/<CreativeWorkbenchShell/);
    expect(app).toMatch(/<PreviewPanel/);
    expect(app).toMatch(/<PreviewControls/);
    expect(app).toMatch(/<PropertyPanelInline/);
    expect(app).toMatch(/<Timeline/);
    expect(app).toMatch(
      /<Timeline[\s\S]*onOpenPackage=\{linkMediaToSelectedTrack\}[\s\S]*onSave=\{save\}[\s\S]*onSeek=\{seek\}/,
    );
    expect(app).not.toMatch(/timelineVisible|data-cut-timeline-visible/);
    expect(app).not.toMatch(/createPortal\(/);
    expect(app).not.toMatch(/timelineTarget|timeline-only/);
    expect(timeline).toMatch(/<TimelineControls/);
    expect(timeline).toMatch(/onSave=\{props\.onSave\}/);
    expect(timeline).toMatch(/<TimelineMinimap/);
    expect(timeline).toMatch(/<TimelineRuler/);
    expect(timeline).toMatch(/<TimelineTrack/);
  });

  it('stretches the Cut editor through the Workbench height chain', () => {
    expect(styles).toMatch(/\.cut-workbench-shell\s*\{[^}]*height:\s*100%;/);
    expect(styles).toMatch(/\.cut-workbench-body\s*\{[^}]*height:\s*100%;/);
    expect(styles).toMatch(
      /\.cut-main-panel,\s*\.cut-preview-timeline-panel\s*\{[^}]*height:\s*100%;/,
    );
    expect(styles).toMatch(/\.cut-basic-editor\s*\{[^}]*height:\s*100%;/);
  });

  it('scopes standalone Webview resets and theme tokens to the embeddable Cut root', () => {
    expect(root).toMatch(/className="cut-webview-root"/);
    expect(styles).toMatch(/\.cut-webview-root\s*\{/);
    expect(styles).not.toMatch(/(^|\n)\s*:root\s*\{/);
    expect(styles).not.toMatch(/(^|\n)\s*html,\s*body,\s*#root\s*\{/);
    expect(styles).not.toMatch(/(^|\n)\s*body\s*\{/);
    expect(styles).not.toMatch(/(^|\n)\s*#root\s*\{/);
    expect(styles).not.toMatch(/(^|\n)\s*::selection\s*\{/);
    expect(styles).not.toMatch(/(^|\n)\s*::-webkit-scrollbar\s*\{/);
  });

  it('uses a document-scoped presentation store without restoring ProjectData authority', () => {
    expect(root).toMatch(/CutPresentationStoreProvider/);
    expect(root).toMatch(/CutOtioControllerProvider/);
    expect(presentation).not.toMatch(/useEditorStore|ProjectData|project:changed|updateProject/);
    expect(inspector).toMatch(/TimelineClipView/);
    expect(inspector).toMatch(/controller\.command/);
  });

  it('keeps durable edits on revisioned OTIO command paths', () => {
    expect(timeline).toMatch(/type: 'place-clip'/);
    expect(timeline).toMatch(/type: 'trim'/);
    expect(timeline).toMatch(/type: 'ripple-delete'/);
    expect(inspector).toMatch(/type: 'set-clip-duration'/);
    expect(inspector).toMatch(/type: 'set-playback-rate'/);
    expect(inspector).toMatch(/type: 'rename-clip'/);
    expect(inspector).toMatch(/type: 'set-audio'/);
  });

  it('retains bounded track entry and direct file drop/link entry', () => {
    expect(timeline).toMatch(/audioTrackCount < 3/);
    expect(timeline).toMatch(/subtitleTrackCount < 1/);
    expect(timeline).toMatch(/readDroppedMediaSource/);
    expect(timeline).toMatch(/controller\.dropLinkMedia/);
    expect(toolbar).toMatch(/timeline\.controls\.addMedia/);
    expect(track).not.toMatch(/cut-basic-track-add|props\.onLinkMedia/);
    expect(track).toMatch(/props\.onToggleTrackEnabled/);
  });

  it('supports pointer placement, trimming, snapping and cancellation without optimistic document mutation', () => {
    expect(timeline).toMatch(/setPointerCapture/);
    expect(timeline).toMatch(/lostpointercapture/);
    expect(timeline).toMatch(/visibilitychange/);
    expect(timeline).toMatch(/buildTimelinePointerDragPreview/);
    expect(track).toMatch(/cut-basic-trim-handle is-start/);
    expect(track).toMatch(/cut-basic-trim-handle is-end/);
    expect(track).toMatch(/data-drag-target/);
  });

  it('keeps contextual timeline commands and keyboard-owned application commands separate', () => {
    expect(timeline).toMatch(/useTimelineContextMenu/);
    expect(contextMenu).toMatch(/preventDefault/);
    expect(contextMenu).toMatch(/input\.onSelect\(clip\.clipId/);
    expect(timeline).toMatch(/timeline\.clip\.lock/);
    expect(timeline).toMatch(/timeline\.contextMenu\.addMedia/);
    expect(app).toMatch(/useKeyboardShortcuts/);
    expect(app).toMatch(/if \(view\) controller\.save\(\)/);
    expect(app).toMatch(/onSave=\{save\}/);
    expect(timeline).toMatch(/onSave=\{props\.onSave\}/);
  });

  it('uses Host-derived thumbnail and waveform representations', () => {
    expect(representations).toMatch(/controller\.requestRepresentations/);
    expect(representations).toMatch(/representationKey/);
    expect(clip).toMatch(/data-derived-state/);
    expect(clip).toMatch(/cut-basic-thumbnails/);
    expect(clip).toMatch(/cut-basic-waveform/);
    expect(clip + representations).not.toMatch(/readFile|workspace\.fs|generateWaveform/);
    expect(styles).toMatch(/\.cut-basic-thumbnails\s*\{[^}]*opacity:\s*1;/);
  });

  it('keeps overview, zoom and resizable right dock as presentation state', () => {
    expect(toolbar).toMatch(/type="range"/);
    expect(overview).toMatch(/TimelineView/);
    expect(overview).toMatch(/ResizeObserver/);
    expect(overview).toMatch(/role="scrollbar"/);
    expect(app).toMatch(/usePersistedResize/);
    expect(app).toMatch(/useResizable<HTMLDivElement>/);
    expect(app).toMatch(/edge: 'right'/);
    expect(styles).toMatch(/\.cut-basic-ruler-row\s*\{[^}]*position:\s*sticky;/);
    expect(styles).toMatch(/\.cut-basic-ruler-row\s*\{[^}]*top:\s*0;/);
    expect(styles).toMatch(/\.cut-basic-timeline-scroll[\s\S]*overflow: auto/);
    expect(styles).toMatch(/\.cut-basic-track-header[\s\S]*position: sticky/);
  });

  it('owns Inspector visibility in PreviewControls without a collapsed right rail or Timeline toggle', () => {
    expect(app).toMatch(
      /<PreviewControls[\s\S]*propertyPanelVisible=\{!inspectorLayout\.collapsed\}/,
    );
    expect(app).toMatch(
      /usePersistedResize\('cut\.inspector', 280, \{ minSize: 220, maxSize: 420 \}\)/,
    );
    expect(app).toMatch(/useResizable<HTMLElement>\(\{[\s\S]*edge: 'right'/);
    expect(styles).toMatch(
      /\.cut-basic-inspector-shell\s*\{[^}]*min-width:\s*220px;[^}]*max-width:\s*min\(420px,\s*max\(220px,\s*42vw\)\);[^}]*padding-left:\s*5px;/,
    );
    expect(styles).toMatch(
      /\.cut-basic-inspector-resize-handle\s*\{[^}]*inset:\s*0 auto 0 0;[^}]*width:\s*5px;[^}]*border-left:\s*1px solid var\(--neko-panel-border\);[^}]*border-right:\s*1px solid var\(--neko-panel-border\);/,
    );
    expect(previewControls).toMatch(/onTogglePropertyPanel/);
    expect(previewControls).toMatch(/timeline\.controls\.propertyPanel/);
    expect(toolbar).not.toMatch(/onTogglePropertyPanel|propertyPanelVisible|RightPanel/);
    expect(app).not.toMatch(/cut-basic-inspector-rail/);
    expect(styles).not.toMatch(/\.cut-basic-inspector-rail/);
  });

  it('centers the retained export workflow and projects Host task state', () => {
    expect(exportPanel).toMatch(/<Dialog/);
    expect(exportPanel).toMatch(/<ExportConfigView/);
    expect(exportPanel).toMatch(/<ExportProgressView/);
    expect(exportConfig).toMatch(/TimelineView/);
    expect(exportProgress).toMatch(/CutExportTaskSnapshot/);
  });

  it('keeps preview stream ownership in the controller layer and consumes all audio streams', () => {
    expect(app).toMatch(/CutHtmlVideoClient/);
    expect(app).toMatch(/CutPcmAudioClient/);
    expect(app).toMatch(/CutPreviewClock/);
    expect(app).toMatch(/PreviewAudioContextOwner/);
    expect(app).toMatch(/contextForConnection\(\)/);
    expect(app).toMatch(/message\.audioStreams\.map/);
    expect(app).toMatch(/new CutPcmAudioClient/);
    expect(app).toMatch(/previewClockRef\.current\?\.read\(\)/);
    expect(app).not.toMatch(/EngineAvStreamLifecycle|AudioStreamClient/);
    expect(app).toMatch(/timelineEndSeconds: prepared\.playbackEndSeconds/);
    expect(app).toMatch(/controller\.startPreview\(\s*playheadSeconds,/);
    expect(app).toMatch(/controller\.preparePreview\(playheadSeconds\)/);
    expect(app).toMatch(/controller\.activatePreview\(previewRequestId\)/);
    expect(app.match(/controller\.startPreview\(/g)).toHaveLength(2);
    expect(app).toMatch(/previewVideoClientRef\.current\?\.pause\(\)/);
    expect(app).toMatch(/activeVideoClient\.seek\(/);
    expect(app).toMatch(/onOpenPackage=\{linkMediaToSelectedTrack\}/);
    expect(app).toMatch(/onSave=\{save\}/);
    expect(app).toMatch(/onSeek=\{seek\}/);
    expect(timeline).toMatch(/onSeek: \(seconds: number\) => void/);
    expect(timeline).toMatch(/props\.onSeek\(/);
    expect(timeline).toMatch(/onSeek=\{props\.onSeek\}/);
    expect(timeline).not.toMatch(/actions\.seek\(/);
    expect(app).toMatch(/controller\.pausePreview\(\)/);
    expect(app).toMatch(/controller\.pausePreview\(previewRequestId\)/);
    expect(app).toMatch(/preparePreviewVideoClient\(message, attempt\)/);
    expect(app).toMatch(/preparePreviewAudioClients\(\s*message,/);
    expect(app).toMatch(
      /onEnded: \(\) => mediaPlaybackEndRef\.current\?\.\(message\.previewRequestId\)/,
    );
    expect(app).toMatch(
      /onPlaybackEnd: \(\) => mediaPlaybackEndRef\.current\?\.\(message\.previewRequestId\)/,
    );
    expect(app).toMatch(/finishPreviewPlaybackSegment\(segment\)/);
    expect(app).toMatch(/secondaryVideoRef=\{secondaryPreviewVideoRef\}/);
    expect(app).toMatch(/controller\.startPreview\(\s*targetSeconds,\s*undefined,\s*'paused'/);

    const connect = app.slice(
      app.indexOf('const connectPreviewClients'),
      app.indexOf('const activatePreparedPreview'),
    );
    const preparedBranch = app.slice(
      app.indexOf("message['type'] === 'cut:preview-prepared'"),
      app.indexOf("message['type'] === 'cut:preview-activated'"),
    );
    expect(preparedBranch).toContain('preparePreviewAudioClients(');
    expect(preparedBranch).toContain('preparePreviewVideoClient(');
    expect(preparedBranch.indexOf('preparePreviewVideoClient(')).toBeLessThan(
      app.indexOf('activatePreparedPreview(waitingBoundary)') -
        app.indexOf("message['type'] === 'cut:preview-prepared'"),
    );
    const activation = app.slice(
      app.indexOf("message['type'] === 'cut:preview-activated'"),
      app.indexOf('const accepted = controller.acceptHostMessage'),
    );
    expect(connect).not.toContain('.startAt(');
    expect(
      app.slice(
        app.indexOf('const preparePreviewVideoClient'),
        app.indexOf('const disposePreparedVideoRequestId'),
      ),
    ).toContain('primeForSynchronizedStart()');
    expect(activation).not.toContain('primeForSynchronizedStart()');
    expect(activation.indexOf('.startAt(sharedStartTime)')).toBeGreaterThan(-1);
    expect(activation.indexOf('.startAt(sharedStartTime)')).toBeLessThan(
      activation.indexOf('waitForAudioContextTime('),
    );
    expect(activation.indexOf('waitForAudioContextTime(')).toBeLessThan(
      activation.indexOf('videoClient?.play()'),
    );
    expect(activation.indexOf('videoClient?.play()')).toBeLessThan(
      activation.indexOf('playbackSegmentRef.current ='),
    );
    expect(activation.indexOf('setActiveVideoSlot(')).toBeLessThan(
      activation.indexOf('videoPromotion.previous.dispose()'),
    );
  });

  it('disposes Webview playback clients before stopping a discontinuous host preview', () => {
    const branchStart = app.indexOf('if (clock?.discontinuity) {');
    const branchEnd = app.indexOf('return;', branchStart);
    const branch = app.slice(branchStart, branchEnd);
    expect(branchStart).toBeGreaterThan(-1);
    expect(branch).toContain('stopPlaybackClients(');
    expect(branch.indexOf('stopPlaybackClients(')).toBeLessThan(
      branch.indexOf('controller.stopPreview()'),
    );
  });

  it('projects localized failures through the retained Toast surface only', () => {
    expect(root).toMatch(/<ToastProvider>/);
    expect(app).toMatch(/useToast/);
    expect(app).toMatch(/translateCutDiagnostic/);
    expect(app).not.toMatch(/cut-basic-error|cut-basic-notice/);
    expect(styles).not.toMatch(/\.cut-basic-error|\.cut-basic-notice/);
    expect(errorBoundary).toMatch(/useTranslation/);
    expect(errorBoundary).not.toMatch(/error\.message|Something went wrong|Try again/);
  });
});
