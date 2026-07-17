/**
 * Timeline Component (Refactored)
 * 时间线主组件 - 组合所有提取的 Hooks 和 UI 组件
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { ExportPanel } from './export';
import { ContextMenu } from '../ContextMenu';
import { TimelineControls } from './TimelineControls';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrackList } from './TimelineTrackList';
import { TimelineMinimap } from './TimelineMinimap';
import { PIXELS_PER_SECOND, TRACK_LABEL_WIDTH } from '../../constants';

// Import custom hooks
import { useTimelineScroll } from '../../hooks/useTimelineScroll';
import { useTimelineSelection } from '../../hooks/useTimelineSelection';
import { useTrackReordering } from '../../hooks/useTrackReordering';
import { useTrackNameEditing } from '../../hooks/useTrackNameEditing';
import { useTimelineDragDrop } from '../../hooks/useTimelineDragDrop';
import { useTimelineContextMenu } from '../../hooks/useTimelineContextMenu';
import { useTimelineActions } from '../../hooks/useTimelineActions';
import { useToast } from '../Toast';

export interface TimelineProps {
  readonly propertyPanelVisible: boolean;
  readonly onOpenPackage: () => void;
  readonly onTogglePropertyPanel: () => void;
}

export function Timeline({
  propertyPanelVisible,
  onOpenPackage,
  onTogglePropertyPanel,
}: TimelineProps) {
  const { showToast } = useToast();

  // Get state and actions from store
  const {
    project,
    currentTime,
    isPlaying,
    seek,
    zoomLevel,
    setZoomLevel,
    getTotalDuration,
    selectedElements,
    updateTrack,
    clearSelectedElements,
    addMediaElement,
    addMediaElementWithAudio,
    addElement,
    snapIndicatorTime,
    dragTargetTrackId,
    setSelectedElements,
    addTrack,
    snappingEnabled,
    toggleSnapping,
    rippleEditingEnabled,
    toggleRippleEditing,
    frameAlignEnabled,
    toggleFrameAlign,
    showClipThumbnails,
    toggleClipThumbnails,
    reorderTrack,
    clipboard,
    showMinimap,
    toggleMinimap,
  } = useEditorStore();

  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const [showExportPanel, setShowExportPanel] = useState(false);

  // Calculate derived values
  const tracks = project?.tracks || [];
  const totalDuration = getTotalDuration();
  const timelineWidth = Math.max((totalDuration + 10) * PIXELS_PER_SECOND * zoomLevel, 800);

  // ==================== Custom Hooks ====================

  // 1. Timeline actions (delete, copy, paste, split, track actions)
  const {
    handleDelete,
    handleCopy,
    handlePaste,
    handleSplit,
    handleToggleMute,
    handleToggleLocked,
    handleToggleHidden,
    handleDeleteTrack,
    handleExecuteAIAction,
  } = useTimelineActions({ selectedElements });

  // 2. Context menu
  const {
    contextMenu,
    handleTrackLabelContextMenu,
    handleTimelineContextMenu,
    closeContextMenu,
    getContextMenuItems,
  } = useTimelineContextMenu({
    tracks,
    currentTime,
    onToggleMute: handleToggleMute,
    onToggleLocked: handleToggleLocked,
    onToggleHidden: handleToggleHidden,
    onDeleteTrack: handleDeleteTrack,
  });

  // 3. Scroll management
  const { visibleRange, scrollToTime } = useTimelineScroll({
    zoomLevel,
    currentTime,
    isPlaying,
    tracksRef,
  });

  // 4. Selection box
  const { selectionBoxRect, handleSelectionMouseDown } = useTimelineSelection({
    tracksRef,
    tracks,
    zoomLevel,
    clearSelectedElements,
    setSelectedElements,
  });

  // 5. Track reordering
  const {
    draggingTrackId,
    dragOverTrackIndex,
    handleTrackDragStart,
    handleTrackDragOver,
    handleTrackDragLeave,
    handleTrackDrop,
    handleTrackDragEnd,
  } = useTrackReordering({
    reorderTrack,
  });

  // 6. Track name editing
  const {
    editingTrackId,
    editingTrackName,
    trackNameInputRef,
    setEditingTrackName,
    handleTrackNameDoubleClick,
    handleSaveTrackName,
    handleCancelTrackNameEdit,
  } = useTrackNameEditing({
    project,
    updateTrack,
  });

  // 7. File drag & drop
  const {
    isDragOver,
    handleDragOver: handleDragOverFile,
    handleDragLeave: handleDragLeaveFile,
    handleDrop: handleDropFile,
  } = useTimelineDragDrop({
    timelineRef,
    tracksRef,
    project,
    tracks,
    zoomLevel,
    addMediaElement,
    addMediaElementWithAudio,
    addElement,
    addTrack,
    // Read live store state instead of the stale React-closure snapshot.
    // Required to prevent duplicate track creation across multi-file drops.
    getCurrentTracks: useCallback(() => useEditorStore.getState().project?.tracks ?? [], []),
    onError: (message) => showToast(message, 'error'),
  });

  useEffect(() => {
    const handleShowExportPanel = () => {
      setShowExportPanel(true);
    };

    window.addEventListener('showExportPanel', handleShowExportPanel);
    return () => {
      window.removeEventListener('showExportPanel', handleShowExportPanel);
    };
  }, []);

  // ==================== Event Handlers ====================

  // Timeline click handler
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.timeline-element')) return;

      const rect = tracksRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + (tracksRef.current?.scrollLeft || 0) - TRACK_LABEL_WIDTH;
      const time = x / (PIXELS_PER_SECOND * zoomLevel);
      seek(Math.max(0, Math.min(totalDuration, time)));
    },
    [zoomLevel, seek, totalDuration],
  );

  // ==================== Render ====================

  return (
    <div ref={timelineRef} className="h-full flex flex-col bg-vscode-editor-bg">
      <TimelineControls
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        snappingEnabled={snappingEnabled}
        rippleEditingEnabled={rippleEditingEnabled}
        frameAlignEnabled={frameAlignEnabled}
        showClipThumbnails={showClipThumbnails}
        showMinimap={showMinimap}
        toggleSnapping={toggleSnapping}
        toggleRippleEditing={toggleRippleEditing}
        toggleFrameAlign={toggleFrameAlign}
        toggleClipThumbnails={toggleClipThumbnails}
        toggleMinimap={toggleMinimap}
        addTrack={addTrack}
        hasSelection={selectedElements.length > 0}
        hasClipboard={clipboard !== null && clipboard.items.length > 0}
        onSplit={handleSplit}
        onDelete={handleDelete}
        onCopy={handleCopy}
        onPaste={handlePaste}
        propertyPanelVisible={propertyPanelVisible}
        onOpenPackage={onOpenPackage}
        onTogglePropertyPanel={onTogglePropertyPanel}
        onExport={() => setShowExportPanel(true)}
      />

      {/* Minimap (if enabled) */}
      {showMinimap && project && (
        <div id="cut-timeline-minimap">
          <TimelineMinimap
            totalDuration={totalDuration}
            currentTime={currentTime}
            visibleStart={visibleRange.startTime}
            visibleEnd={visibleRange.endTime}
            zoomLevel={zoomLevel}
            project={project}
            onScrollToTime={scrollToTime}
          />
        </div>
      )}

      {/* Ruler — canvas redraws based on tracksRef scroll, no separate scroll container needed */}
      <TimelineRuler
        totalDuration={totalDuration}
        zoomLevel={zoomLevel}
        timelineWidth={timelineWidth}
        scrollRef={tracksRef}
        seek={seek}
      />

      {/* Track List (includes Playhead, SelectionBox, SnapIndicator) */}
      <TimelineTrackList
        tracks={tracks}
        timelineWidth={timelineWidth}
        zoomLevel={zoomLevel}
        currentTime={currentTime}
        selectedElements={selectedElements}
        visibleRange={visibleRange}
        dragTargetTrackId={dragTargetTrackId}
        snapIndicatorTime={snapIndicatorTime}
        selectionBoxRect={selectionBoxRect}
        isDragOver={isDragOver}
        tracksRef={tracksRef}
        trackNameInputRef={trackNameInputRef}
        editingTrackId={editingTrackId}
        editingTrackName={editingTrackName}
        setEditingTrackName={setEditingTrackName}
        handleTrackNameDoubleClick={handleTrackNameDoubleClick}
        handleSaveTrackName={handleSaveTrackName}
        handleCancelTrackNameEdit={handleCancelTrackNameEdit}
        handleToggleMute={handleToggleMute}
        handleToggleLocked={handleToggleLocked}
        handleToggleHidden={handleToggleHidden}
        handleDeleteTrack={handleDeleteTrack}
        updateTrack={updateTrack}
        draggingTrackId={draggingTrackId}
        dragOverTrackIndex={dragOverTrackIndex}
        handleTrackDragStart={handleTrackDragStart}
        handleTrackDragOver={handleTrackDragOver}
        handleTrackDragLeave={handleTrackDragLeave}
        handleTrackDrop={handleTrackDrop}
        handleTrackDragEnd={handleTrackDragEnd}
        handleTrackLabelContextMenu={handleTrackLabelContextMenu}
        handleTimelineClick={handleTimelineClick}
        handleSelectionMouseDown={handleSelectionMouseDown}
        handleTimelineContextMenu={handleTimelineContextMenu}
        handleDragOverFile={handleDragOverFile}
        handleDragLeaveFile={handleDragLeaveFile}
        handleDropFile={handleDropFile}
        onExecuteAIAction={handleExecuteAIAction}
      />

      <ExportPanel isOpen={showExportPanel} onClose={() => setShowExportPanel(false)} />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
