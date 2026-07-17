/**
 * useTimelineActions Hook
 * Manages timeline editing actions (delete, copy, paste, split)
 */

import { useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { sendAIAction } from '../utils/vscodeApi';
import { getLogger } from '../utils/logger';

const logger = getLogger('TimelineActions');

export interface TimelineActionsOptions {
  selectedElements: Array<{ trackId: string; elementId: string }>;
}

export function useTimelineActions({ selectedElements }: TimelineActionsOptions) {
  // Get actions from store
  const {
    currentTime,
    removeElement,
    clearSelectedElements,
    copySelected,
    pasteAtTime,
    splitAtPlayhead,
    updateTrack,
    removeTrack,
    toggleTrackLocked,
    toggleTrackHidden,
  } = useEditorStore();

  // Delete all selected elements
  const handleDelete = useCallback(() => {
    selectedElements.forEach(({ trackId, elementId }) => {
      removeElement(trackId, elementId);
    });
    clearSelectedElements();
  }, [selectedElements, removeElement, clearSelectedElements]);

  // Copy selected elements
  const handleCopy = useCallback(() => {
    copySelected();
  }, [copySelected]);

  // Paste at current time
  const handlePaste = useCallback(() => {
    pasteAtTime(currentTime);
  }, [pasteAtTime, currentTime]);

  // Split all selected elements at playhead
  const handleSplit = useCallback(() => {
    selectedElements.forEach(({ trackId, elementId }) => {
      splitAtPlayhead(trackId, elementId);
    });
  }, [selectedElements, splitAtPlayhead]);

  // Track actions
  const handleToggleMute = useCallback(
    (trackId: string, currentMuted: boolean) => {
      updateTrack(trackId, { muted: !currentMuted });
    },
    [updateTrack],
  );

  const handleToggleLocked = useCallback(
    (trackId: string) => {
      toggleTrackLocked(trackId);
    },
    [toggleTrackLocked],
  );

  const handleToggleHidden = useCallback(
    (trackId: string) => {
      toggleTrackHidden(trackId);
    },
    [toggleTrackHidden],
  );

  const handleDeleteTrack = useCallback(
    (trackId: string) => {
      removeTrack(trackId);
    },
    [removeTrack],
  );

  // AI Action handler
  const handleExecuteAIAction = useCallback((actionId: string, elementIds: string[]) => {
    sendAIAction(actionId, elementIds);
    logger.info('AI Action sent: ' + actionId, { elementIds });
  }, []);

  return {
    // Edit actions
    handleDelete,
    handleCopy,
    handlePaste,
    handleSplit,
    // Track actions
    handleToggleMute,
    handleToggleLocked,
    handleToggleHidden,
    handleDeleteTrack,
    // AI actions
    handleExecuteAIAction,
  };
}
