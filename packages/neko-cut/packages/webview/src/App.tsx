import { useEffect, useRef, useState, useCallback } from 'react';
import { useFocusedWebviewRoot } from '@neko/ui/keyboard';
import { useResizable } from '@neko/ui/hooks';
import { ResizeHandle } from '@neko/ui/primitives';
import { CreativeWorkbenchShell } from '@neko/ui/workbench';
import { useShallowStore } from './hooks/useShallowStore';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { PreviewPanel } from './components/PreviewPanel';
import { PreviewControls } from './components/PreviewControls';
import { Timeline } from './components/Timeline';
import { PropertyPanelInline } from './components/PropertyPanel/PropertyPanelInline';
import { CUT_PROPERTY_PANEL_WIDTH_BOUNDS } from './components/PreviewControls.presenter';
import { useTranslation } from './i18n/I18nContext';
import { useEditorStore } from './stores/editor-store';
import { getLogger } from './utils/logger';
const logger = getLogger('App');

// Split ratio: Preview占比 (0.0 ~ 1.0)
const DEFAULT_PREVIEW_RATIO = 0.5; // 默认 Preview 占 50%
const MIN_PREVIEW_RATIO = 0.2; // Preview 最小 20%
const MAX_PREVIEW_RATIO = 0.8; // Preview 最大 80%

type CutRightDockMode = 'basic' | 'professional';

function App() {
  const { t } = useTranslation();
  const {
    project,
    isPlaying,
    currentTime,
    seekRevision,
    playbackSpeed,
    seek,
    updatePlaybackTime,
    pause,
    getTotalDuration,
    togglePlayback,
    setPlaybackSpeed,
    previewQuality,
    setPreviewQuality,
    previewVolume,
    previewMuted,
    setPreviewVolume,
    togglePreviewMute,
  } = useShallowStore((state) => ({
    project: state.project,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    seekRevision: state.seekRevision,
    playbackSpeed: state.playbackSpeed,
    seek: state.seek,
    updatePlaybackTime: state.updatePlaybackTime,
    pause: state.pause,
    getTotalDuration: state.getTotalDuration,
    togglePlayback: state.togglePlayback,
    setPlaybackSpeed: state.setPlaybackSpeed,
    previewQuality: state.previewQuality,
    setPreviewQuality: state.setPreviewQuality,
    previewVolume: state.previewVolume,
    previewMuted: state.previewMuted,
    setPreviewVolume: state.setPreviewVolume,
    togglePreviewMute: state.togglePreviewMute,
  }));
  const propertyPanelVisible = useEditorStore((state) => state.propertyPanelVisible);
  const propertyPanelWidth = useEditorStore((state) => state.propertyPanelWidth);
  const setPropertyPanelWidth = useEditorStore((state) => state.setPropertyPanelWidth);
  const togglePropertyPanel = useEditorStore((state) => state.togglePropertyPanel);
  const { engineDiagnostic, sendMessage } = useVSCodeMessaging({
    subscribeToExtensionMessages: true,
  });
  const animationFrameRef = useRef<number>(0);
  const lastSeekTimeRef = useRef<number>(currentTime); // Track last known currentTime
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [rightDockMode, setRightDockMode] = useState<CutRightDockMode>('basic');

  // Cross-extension drag-and-drop: allow dropping generated assets from agent (ADR-5 P1)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      sendMessage({ type: 'dnd:drop' });
    },
    [sendMessage],
  );

  // Sync lastSeekTimeRef when manually seeking.
  useEffect(() => {
    lastSeekTimeRef.current = currentTime;
  }, [seekRevision]);

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  // Fullscreen toggle handler (CSS-based, since VS Code Webview doesn't support Fullscreen API)
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  /**
   * Capture screenshot handler
   */
  const handleCaptureScreenshot = useCallback(async () => {
    if (!project || isCapturingScreenshot) {
      return;
    }

    try {
      setIsCapturingScreenshot(true);

      // Call the PreviewPanel's capture function via window global
      const captureFunc = window.__previewPanelCaptureScreenshot;
      if (captureFunc) {
        await captureFunc();
      } else {
        logger.error('PreviewPanel capture function not available');
      }
    } catch (error) {
      logger.error('Screenshot capture failed:', error);
    } finally {
      setIsCapturingScreenshot(false);
    }
  }, [project, isCapturingScreenshot]);

  const handleOpenPackage = useCallback(() => {
    sendMessage({ type: 'project:package' });
  }, [sendMessage]);

  const {
    size: previewRatio,
    isResizing,
    containerRef,
    handleProps: previewResizeHandleProps,
  } = useResizable<HTMLDivElement>({
    edge: 'top',
    mode: 'ratio',
    initialSize: DEFAULT_PREVIEW_RATIO,
    minSize: MIN_PREVIEW_RATIO,
    maxSize: MAX_PREVIEW_RATIO,
    // Preserve the previous split math: the 4px resize handle is outside the
    // two flex panels, so the draggable height excludes the handle itself.
    calculateSize: (event, containerRect) =>
      (event.clientY - containerRect.top) / (containerRect.height - 4),
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const { isKeyboardFocused, setKeyboardFocused } = useFocusedWebviewRoot(rootRef);

  // Playback loop with optimized timing (avoid excessive store updates)
  // Use refs to avoid restarting the loop when currentTime changes
  const updatePlaybackTimeRef = useRef(updatePlaybackTime);
  const pauseRef = useRef(pause);
  const getTotalDurationRef = useRef(getTotalDuration);
  updatePlaybackTimeRef.current = updatePlaybackTime;
  pauseRef.current = pause;
  getTotalDurationRef.current = getTotalDuration;

  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    // Record the start time and initial playback position
    const startWallTime = performance.now();
    const startPlaybackTime = lastSeekTimeRef.current;
    let lastUpdateTime = startPlaybackTime;

    const tick = (now: number) => {
      // Calculate elapsed time from playback start for more accurate timing
      const elapsed = (now - startWallTime) / 1000;
      const newTime = startPlaybackTime + elapsed * playbackSpeed;

      const totalDuration = getTotalDurationRef.current();

      if (newTime >= totalDuration) {
        // Stop at the end
        updatePlaybackTimeRef.current(totalDuration);
        pauseRef.current();
        lastSeekTimeRef.current = totalDuration;
      } else {
        // Only update the playhead when time changed by at least 1 frame (~33ms
        // for 30fps). This is intentionally not a seek: the engine is already
        // streaming from its own clock during playback.
        if (Math.abs(newTime - lastUpdateTime) >= 0.033) {
          updatePlaybackTimeRef.current(newTime);
          lastUpdateTime = newTime;
          lastSeekTimeRef.current = newTime;
        }
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, seekRevision]); // Restart when play state, speed, or explicit seek changes

  useEffect(() => {
    // Notify VSCode that webview is ready
    sendMessage({ type: 'ready' });
  }, [sendMessage]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type === 'keyboardFocus' &&
        typeof (message as { focused?: unknown }).focused === 'boolean'
      ) {
        setKeyboardFocused((message as { focused: boolean }).focused);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setKeyboardFocused]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full bg-vscode-bg">
        <div className="text-center text-vscode-description">
          <div className="text-lg mb-2">Loading project...</div>
          <div className="text-sm opacity-75">Waiting for project data</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative flex h-full bg-vscode-bg"
      data-neko-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {engineDiagnostic ? (
        <div
          className="absolute left-3 right-3 top-3 z-50 border border-vscode-warning bg-vscode-editor-bg px-3 py-2 text-sm text-vscode-fg shadow-md"
          data-diagnostic-code={engineDiagnostic.code}
          role="alert"
        >
          {engineDiagnostic.message}
        </div>
      ) : null}
      <CreativeWorkbenchShell
        className="cut-workbench-shell"
        bodyClassName="cut-workbench-body"
        mainClassName="cut-main-panel"
        mainKind="preview-timeline"
        main={
          <div ref={containerRef} className="cut-preview-timeline-panel">
            <div
              className="flex flex-col overflow-hidden min-h-0"
              style={{ flex: isFullscreen ? 1 : previewRatio }}
            >
              <div className="flex-1 min-h-0 overflow-hidden">
                <PreviewPanel onCaptureScreenshot={handleCaptureScreenshot} />
              </div>
              <PreviewControls
                currentTime={currentTime}
                totalDuration={getTotalDuration()}
                isPlaying={isPlaying}
                playbackSpeed={playbackSpeed}
                seek={seek}
                togglePlayback={togglePlayback}
                setPlaybackSpeed={setPlaybackSpeed}
                previewQuality={previewQuality}
                setPreviewQuality={setPreviewQuality}
                previewVolume={previewVolume}
                previewMuted={previewMuted}
                setPreviewVolume={setPreviewVolume}
                togglePreviewMute={togglePreviewMute}
                resolution={project.resolution}
                fps={project.fps}
                isFullscreen={isFullscreen}
                onFullscreenToggle={toggleFullscreen}
                onCaptureScreenshot={handleCaptureScreenshot}
                isCapturingScreenshot={isCapturingScreenshot}
              />
            </div>

            {!isFullscreen && (
              <ResizeHandle
                handleProps={previewResizeHandleProps}
                className={`h-1 flex-shrink-0 cursor-ns-resize border-t border-vscode-panel-border transition-colors ${
                  isResizing ? 'bg-vscode-accent' : 'hover:bg-vscode-accent/50'
                }`}
              />
            )}

            {!isFullscreen && (
              <div
                className="overflow-hidden flex flex-col min-h-0"
                style={{ flex: 1 - previewRatio }}
              >
                <Timeline
                  propertyPanelVisible={propertyPanelVisible}
                  onOpenPackage={handleOpenPackage}
                  onTogglePropertyPanel={togglePropertyPanel}
                />
              </div>
            )}
          </div>
        }
        rightDock={
          propertyPanelVisible
            ? {
                id: 'cut-property-panel',
                className: 'cut-property-panel-shell',
                contentClassName:
                  'cut-property-panel-content flex h-full min-h-0 flex-col overflow-hidden',
                resizeHandleClassName:
                  'cut-property-panel-resize-handle h-full w-1 flex-shrink-0 cursor-ew-resize transition-colors',
                size: propertyPanelWidth,
                minSize: CUT_PROPERTY_PANEL_WIDTH_BOUNDS.minSize,
                maxSize: CUT_PROPERTY_PANEL_WIDTH_BOUNDS.maxSize,
                onSizeChange: setPropertyPanelWidth,
                groups: {
                  label: t('rightDock.mode.label'),
                  activeId: rightDockMode,
                  onActiveIdChange: (id) => setRightDockMode(toCutRightDockMode(id)),
                  items: [
                    {
                      id: 'basic',
                      label: t('rightDock.mode.basic'),
                      description: t('rightDock.mode.basic.description'),
                    },
                    {
                      id: 'professional',
                      label: t('rightDock.mode.professional'),
                      description: t('rightDock.mode.professional.description'),
                    },
                  ],
                },
                children: <PropertyPanelInline mode={rightDockMode} />,
              }
            : undefined
        }
      />
    </div>
  );
}

function toCutRightDockMode(id: string): CutRightDockMode {
  return id === 'professional' ? 'professional' : 'basic';
}

export default App;
