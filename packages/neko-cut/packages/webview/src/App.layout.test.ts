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
    expect(timeline).toMatch(/<TimelineControls/);
    expect(timeline).toMatch(/<TimelineMinimap/);
    expect(timeline).toMatch(/<TimelineRuler/);
    expect(timeline).toMatch(/<TimelineTrack/);
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
    expect(timeline).toMatch(/readDroppedMediaUris/);
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
      /\.cut-basic-inspector-resize-handle\s*\{[^}]*inset:\s*0 auto 0 0;[^}]*width:\s*5px;[^}]*border-left:\s*1px solid var\(--vscode-panel-border\);[^}]*border-right:\s*1px solid var\(--vscode-panel-border\);/,
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
    expect(app).toMatch(/EngineAvStreamLifecycle/);
    expect(app).toMatch(/PreviewAudioContextOwner/);
    expect(app).toMatch(/contextForConnection\(\)/);
    expect(app).toMatch(/\{ audioContext \}/);
    expect(app).toMatch(/additionalAudioStreamUrls\.map/);
    expect(app).toMatch(/new AudioStreamClient/);
    expect(app).toMatch(/frame\.timestamp \/ 1_000_000/);
    expect(app).toMatch(/setClockPlaybackRate\(message\.mediaPlaybackRate \?\? 1\)/);
    expect(app).toMatch(/timelineEndSeconds: prepared\.playbackEndSeconds/);
    expect(app).toMatch(/controller\.startPreview\(playheadSeconds\)/);
    expect(app).toMatch(/controller\.preparePreview\(playheadSeconds\)/);
    expect(app).toMatch(/controller\.activatePreview\(generation\)/);
    expect(app.match(/controller\.startPreview\(/g)).toHaveLength(1);
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
