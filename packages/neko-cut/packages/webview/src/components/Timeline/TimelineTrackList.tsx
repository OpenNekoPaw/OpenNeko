/**
 * TimelineTrackList Component
 * 轨道列表 - 包含轨道标签和轨道内容区域
 */

import { RefObject, memo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { TimelineTrack } from './TimelineTrack';
import { Playhead } from './Playhead';
import type { TimelineTrack as TimelineTrackType } from '../../types';
import { PIXELS_PER_SECOND, TRACK_HEIGHT, TRACK_LABEL_WIDTH } from '../../constants';

interface SelectionBoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TimelineTrackListProps {
  // Track data
  tracks: TimelineTrackType[];

  // Dimensions
  timelineWidth: number;
  zoomLevel: number;
  currentTime: number;

  // Selection and visibility
  selectedElements: Array<{ trackId: string; elementId: string }>;
  visibleRange: { startTime: number; endTime: number };
  dragTargetTrackId: string | null;
  snapIndicatorTime: number | null;
  selectionBoxRect: SelectionBoxRect | null;

  // Drag over state (for file drop)
  isDragOver: boolean;

  // Refs
  tracksRef: RefObject<HTMLDivElement>;
  trackNameInputRef: RefObject<HTMLInputElement>;

  // Track name editing state
  editingTrackId: string | null;
  editingTrackName: string;
  setEditingTrackName: (name: string) => void;

  // Track name editing actions
  handleTrackNameDoubleClick: (trackId: string, currentName: string) => void;
  handleSaveTrackName: (trackId: string) => void;
  handleCancelTrackNameEdit: () => void;

  // Track actions
  handleToggleMute: (trackId: string, currentMuted: boolean) => void;
  handleToggleLocked: (trackId: string) => void;
  handleToggleHidden: (trackId: string) => void;
  handleDeleteTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<{ muted: boolean }>) => void;

  // Track reordering state
  draggingTrackId: string | null;
  dragOverTrackIndex: number | null;

  // Track reordering actions
  handleTrackDragStart: (e: React.DragEvent, trackId: string) => void;
  handleTrackDragOver: (e: React.DragEvent, trackIndex: number) => void;
  handleTrackDragLeave: () => void;
  handleTrackDrop: (e: React.DragEvent, targetIndex: number) => void;
  handleTrackDragEnd: () => void;

  // Context menu
  handleTrackLabelContextMenu: (e: React.MouseEvent, trackId: string, trackIndex: number) => void;

  // Timeline interactions
  handleTimelineClick: (e: React.MouseEvent) => void;
  handleSelectionMouseDown: (e: React.MouseEvent) => void;
  handleTimelineContextMenu: (e: React.MouseEvent) => void;

  // File drop handlers
  handleDragOverFile: (e: React.DragEvent) => void;
  handleDragLeaveFile: (e: React.DragEvent) => void;
  handleDropFile: (e: React.DragEvent) => void;

  // AI Action callback
  onExecuteAIAction?: (actionId: string, elementIds: string[]) => void;
}

export const TimelineTrackList = memo(function TimelineTrackList({
  tracks,
  timelineWidth,
  zoomLevel,
  currentTime,
  selectedElements,
  visibleRange,
  dragTargetTrackId,
  snapIndicatorTime,
  selectionBoxRect,
  isDragOver,
  tracksRef,
  trackNameInputRef,
  editingTrackId,
  editingTrackName,
  setEditingTrackName,
  handleTrackNameDoubleClick,
  handleSaveTrackName,
  handleCancelTrackNameEdit,
  handleToggleMute,
  handleToggleLocked,
  handleToggleHidden,
  handleDeleteTrack,
  draggingTrackId,
  dragOverTrackIndex,
  handleTrackDragStart,
  handleTrackDragOver,
  handleTrackDragLeave,
  handleTrackDrop,
  handleTrackDragEnd,
  handleTrackLabelContextMenu,
  handleTimelineClick,
  handleSelectionMouseDown,
  handleTimelineContextMenu,
  handleDragOverFile,
  handleDragLeaveFile,
  handleDropFile,
  onExecuteAIAction,
}: TimelineTrackListProps) {
  const { t } = useTranslation();

  // Generate compact track label (V1, V2, T1, A1, C1, S1, etc.)
  const getCompactTrackLabel = (track: TimelineTrackType, trackIndex: number): string => {
    const prefixMap: Record<string, string> = {
      media: 'V',
      text: 'T',
      audio: 'A',
      subtitle: 'C',
      shape: 'S',
    };
    const prefix = prefixMap[track.type] || 'X';
    // Count tracks of the same type up to current index
    const sameTypeTracks = tracks.filter((t, i) => t.type === track.type && i <= trackIndex);
    return `${prefix}${sameTypeTracks.length}`;
  };

  return (
    <div className="flex-1 overflow-hidden">
      {/* Tracks Content with horizontal scroll */}
      <div
        ref={tracksRef}
        className={`h-full overflow-auto relative transition-colors ${
          isDragOver ? 'bg-vscode-accent/10 ring-2 ring-vscode-accent/50 ring-inset' : ''
        }`}
        onClick={handleTimelineClick}
        onMouseDown={handleSelectionMouseDown}
        onContextMenu={handleTimelineContextMenu}
        onDragOver={handleDragOverFile}
        onDragLeave={handleDragLeaveFile}
        onDrop={handleDropFile}
      >
        {/* Drop zone indicator */}
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
            <div className="bg-vscode-accent/20 border-2 border-dashed border-vscode-accent rounded-lg px-6 py-4">
              <span className="text-vscode-accent font-medium">{t('timeline.dropMediaHere')}</span>
            </div>
          </div>
        )}

        {/* Combined track rows - labels and content together */}
        <div
          className="relative flex"
          style={{
            minWidth: timelineWidth + TRACK_LABEL_WIDTH,
            width: '100%',
            minHeight: tracks.length * TRACK_HEIGHT,
          }}
        >
          {/* Track Labels - Sticky on the left */}
          <div
            className="sticky left-0 z-30 bg-vscode-sidebar-bg border-r border-vscode-panel-border shrink-0"
            style={{ width: TRACK_LABEL_WIDTH }}
          >
            {tracks.map((track, trackIndex) => (
              <div
                key={`label-${track.id}`}
                draggable
                onDragStart={(e) => handleTrackDragStart(e, track.id)}
                onDragOver={(e) => handleTrackDragOver(e, trackIndex)}
                onDragLeave={handleTrackDragLeave}
                onDrop={(e) => handleTrackDrop(e, trackIndex)}
                onDragEnd={handleTrackDragEnd}
                onContextMenu={(e) => handleTrackLabelContextMenu(e, track.id, trackIndex)}
                className={`track-label flex items-center justify-between px-2 border-b border-vscode-panel-border group cursor-grab active:cursor-grabbing transition-colors ${
                  draggingTrackId === track.id
                    ? 'opacity-50 bg-vscode-list-hover'
                    : dragOverTrackIndex === trackIndex && draggingTrackId !== track.id
                      ? 'bg-vscode-accent/20 border-t-2 border-t-vscode-accent'
                      : 'bg-vscode-sidebar-bg hover:bg-vscode-list-hover'
                }`}
                style={{ height: TRACK_HEIGHT }}
              >
                <div className="flex items-center gap-1 min-w-0">
                  {/* Track type icon */}
                  {track.type === 'media' && (
                    <svg
                      className="w-3 h-3 text-blue-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    </svg>
                  )}
                  {track.type === 'text' && (
                    <svg
                      className="w-3 h-3 text-yellow-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v2H6V4zm8 4H6v2h8V8zm-4 4H6v2h4v-2z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {track.type === 'audio' && (
                    <svg
                      className="w-3 h-3 text-green-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                    </svg>
                  )}
                  {track.type === 'subtitle' && (
                    <svg
                      className="w-3 h-3 text-purple-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M18 3H2c-.55 0-1 .45-1 1v12c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zm-1 12H3V5h14v10zM4 12h2v2H4v-2zm0-3h8v2H4V9zm10 3h2v2h-2v-2zm-4 0h3v2h-3v-2z" />
                    </svg>
                  )}
                  {track.type === 'shape' && (
                    <svg
                      className="w-3 h-3 text-cyan-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M10 2L2 7l8 5 8-5-8-5zM2 13l8 5 8-5M2 10l8 5 8-5" />
                    </svg>
                  )}

                  {/* Compact track label (V1, T1, A1) */}
                  {editingTrackId === track.id ? (
                    <input
                      ref={trackNameInputRef}
                      type="text"
                      value={editingTrackName}
                      onChange={(e) => setEditingTrackName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveTrackName(track.id);
                        } else if (e.key === 'Escape') {
                          handleCancelTrackNameEdit();
                        }
                      }}
                      onBlur={() => handleSaveTrackName(track.id)}
                      className="text-[10px] px-1 py-0.5 bg-vscode-input-bg text-vscode-input-fg border border-vscode-focus-border rounded outline-none w-12"
                    />
                  ) : (
                    <span
                      className="text-[10px] font-medium text-vscode-fg cursor-pointer hover:text-vscode-accent"
                      onDoubleClick={() => handleTrackNameDoubleClick(track.id, track.name)}
                      title={`${track.name} - ${t('timeline.doubleClickToRename')}`}
                    >
                      {getCompactTrackLabel(track, trackIndex)}
                    </span>
                  )}
                </div>

                {/* Track controls */}
                <div className="flex items-center">
                  {/* Hidden/Visible button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleHidden(track.id);
                    }}
                    className={`p-0.5 rounded transition-colors ${
                      track.hidden
                        ? 'text-vscode-error'
                        : 'text-vscode-description hover:text-vscode-fg'
                    }`}
                    title={track.hidden ? t('timeline.track.show') : t('timeline.track.hide')}
                  >
                    {track.hidden ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                          clipRule="evenodd"
                        />
                        <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path
                          fillRule="evenodd"
                          d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>

                  {/* Lock/Unlock button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleLocked(track.id);
                    }}
                    className={`p-0.5 rounded transition-colors ${
                      track.locked
                        ? 'text-vscode-warning'
                        : 'text-vscode-description hover:text-vscode-fg'
                    }`}
                    title={track.locked ? t('timeline.track.unlock') : t('timeline.track.lock')}
                  >
                    {track.locked ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                      </svg>
                    )}
                  </button>

                  {/* Mute button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleMute(track.id, track.muted || false);
                    }}
                    className={`p-0.5 rounded transition-colors ${
                      track.muted
                        ? 'text-vscode-error'
                        : 'text-vscode-description hover:text-vscode-fg'
                    }`}
                    title={
                      track.muted
                        ? t('timeline.contextMenu.unmuteTrack')
                        : t('timeline.contextMenu.muteTrack')
                    }
                  >
                    {track.muted ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTrack(track.id);
                    }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-vscode-description hover:text-vscode-error"
                    title={t('timeline.controls.deleteTrackUndo')}
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Track content area - positioned after labels */}
          <div className="relative flex-1" style={{ minWidth: timelineWidth }}>
            {tracks.map((track, index) => (
              <TimelineTrack
                key={track.id}
                track={track}
                index={index}
                zoomLevel={zoomLevel}
                pixelsPerSecond={PIXELS_PER_SECOND}
                trackHeight={TRACK_HEIGHT}
                selectedElements={selectedElements}
                tracksContainerRef={tracksRef}
                sortedTracks={tracks}
                visibleRange={visibleRange}
                onExecuteAIAction={onExecuteAIAction}
              />
            ))}

            {/* Cross-track drag target indicator */}
            {dragTargetTrackId && (
              <div
                className="absolute left-0 right-0 border-2 border-dashed border-green-400 bg-green-400/10 pointer-events-none z-40"
                style={{
                  top: tracks.findIndex((t) => t.id === dragTargetTrackId) * TRACK_HEIGHT,
                  height: TRACK_HEIGHT,
                }}
              />
            )}

            {/* Playhead */}
            <Playhead
              currentTime={currentTime}
              zoomLevel={zoomLevel}
              pixelsPerSecond={PIXELS_PER_SECOND}
              height={tracks.length * TRACK_HEIGHT}
            />

            {/* Snap indicator line */}
            {snapIndicatorTime !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-yellow-400 pointer-events-none z-50"
                style={{
                  left: snapIndicatorTime * PIXELS_PER_SECOND * zoomLevel,
                  boxShadow: '0 0 4px 1px rgba(250, 204, 21, 0.5)',
                }}
              />
            )}

            {/* Selection box */}
            {selectionBoxRect && (
              <div
                className="absolute border border-vscode-accent bg-vscode-accent/20 pointer-events-none z-50"
                style={{
                  left: selectionBoxRect.left,
                  top: selectionBoxRect.top,
                  width: selectionBoxRect.width,
                  height: selectionBoxRect.height,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
