import { useCallback, useEffect, useRef, useState, memo, useMemo } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { TimelineElementContent } from './TimelineElementContent';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { KeyframeIndicator } from '../KeyframeIndicator';
import { useTranslation } from '../../i18n/I18nContext';
import { isImageFile } from '../../utils';
import { getActionsForElementType, mapElementTypeToAIType } from '../../types';
import type { TimelineTrack as TrackType, TimelineElement, AIQuickAction } from '../../types';
import type { EditOperation } from '@neko/shared';
import { createMeta } from '../../stores/utils/operation-helpers';
import { getLogger } from '../../utils/logger';
import { getDuplicateInsertTime } from './timelineDuplicateActions';
import { buildTimelineReverseUpdates, buildTimelineSpeedUpdates } from './timelineSpeedActions';
import { buildTrimToPlayheadUpdates, collectTimelineRippleOps } from './timelineTrimActions';

const logger = getLogger('TimelineTrack');

interface TimelineTrackProps {
  track: TrackType;
  index: number;
  zoomLevel: number;
  pixelsPerSecond: number;
  trackHeight: number;
  selectedElements: Array<{ trackId: string; elementId: string }>;
  tracksContainerRef?: React.RefObject<HTMLDivElement>;
  sortedTracks?: TrackType[];
  visibleRange?: { startTime: number; endTime: number };
  onExecuteAIAction?: (actionId: string, elementIds: string[]) => void;
}

type ResizeDirection = 'left' | 'right' | null;

interface DragState {
  isDragging: boolean;
  isResizing: boolean;
  resizeDirection: ResizeDirection;
  elementId: string | null;
  startX: number;
  startLeft: number;
  startWidth: number;
  startTrimStart: number;
  startTrimEnd: number;
}

const idleDragState: DragState = {
  isDragging: false,
  isResizing: false,
  resizeDirection: null,
  elementId: null,
  startX: 0,
  startLeft: 0,
  startWidth: 0,
  startTrimStart: 0,
  startTrimEnd: 0,
};

interface ActivePointerDrag {
  cancel: () => void;
  dispose: () => void;
}

export const TimelineTrack = memo(function TimelineTrack({
  track,
  zoomLevel,
  pixelsPerSecond,
  trackHeight,
  selectedElements,
  tracksContainerRef,
  sortedTracks,
  visibleRange,
  onExecuteAIAction,
}: TimelineTrackProps) {
  const { t } = useTranslation();

  // Only subscribe to states that affect rendering
  const {
    selectElement,
    updateElement,
    dispatch,
    dispatchBatch,
    pushOperation,
    showClipThumbnails,
    project,
    setSnapIndicatorTime,
    setDragTargetTrackId,
    moveElement,
    removeElement,
    splitAtPlayhead,
    splitAndKeepLeft,
    splitAndKeepRight,
    toggleElementHidden,
    toggleElementMuted,
    copySelected,
    pasteAtTime,
    currentTime,
    separateVideoAudio,
    unseparateVideoAudio,
    rippleEditingEnabled,
  } = useEditorStore();

  // Get snappingEnabled via getState() to avoid re-render on toggle
  const getSnappingEnabled = useCallback(() => useEditorStore.getState().snappingEnabled, []);

  const [dragState, setDragState] = useState<DragState>(idleDragState);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    element: TimelineElement;
  } | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);

  // Cache snap points data - only recalculate when project tracks change
  // Returns a Map of elementId -> [startTime, endTime] for efficient filtering
  const snapPointsCache = useMemo(() => {
    if (!project) return { allPoints: [0], elementPoints: new Map<string, number[]>() };

    const elementPoints = new Map<string, number[]>();
    const allPointsSet = new Set<number>([0]); // Always include 0

    for (const t of project.tracks) {
      for (const el of t.elements) {
        const effectiveDuration = el.duration - el.trimStart - el.trimEnd;
        const startTime = el.startTime;
        const endTime = el.startTime + effectiveDuration;

        // Store points for each element (for exclusion during drag)
        elementPoints.set(el.id, [startTime, endTime]);

        // Add to all points set
        allPointsSet.add(startTime);
        allPointsSet.add(endTime);
      }
    }

    // Pre-sort once
    const allPoints = [...allPointsSet].sort((a, b) => a - b);
    return { allPoints, elementPoints };
  }, [project?.tracks]);

  // Get snap points, optionally excluding current dragging element
  const getSnapPoints = useCallback((): number[] => {
    if (!getSnappingEnabled()) return [];

    const { allPoints, elementPoints } = snapPointsCache;

    // If not dragging, return all points
    if (!dragState.elementId) return allPoints;

    // Exclude points from dragging element
    const excludePoints = elementPoints.get(dragState.elementId);
    if (!excludePoints) return allPoints;

    // Filter out excluded points (typically just 2 points to exclude)
    return allPoints.filter((p) => !excludePoints.includes(p));
  }, [snapPointsCache, getSnappingEnabled, dragState.elementId]);

  // Find nearest snap point within threshold
  const findSnapPoint = useCallback(
    (time: number, threshold: number = 0.1): { time: number; snapped: boolean } => {
      const snapPoints = getSnapPoints();

      // Binary search for performance with many snap points
      if (snapPoints.length > 20) {
        let low = 0;
        let high = snapPoints.length - 1;
        let nearest = snapPoints[0] ?? time;
        let nearestDist = Math.abs(time - nearest);

        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const point = snapPoints[mid] ?? time;
          const dist = Math.abs(time - point);

          if (dist < nearestDist) {
            nearest = point;
            nearestDist = dist;
          }

          if (point < time) {
            low = mid + 1;
          } else if (point > time) {
            high = mid - 1;
          } else {
            return { time: point, snapped: true };
          }
        }

        if (nearestDist < threshold) {
          return { time: nearest, snapped: true };
        }
        return { time, snapped: false };
      }

      // Linear search for small arrays
      for (const point of snapPoints) {
        if (Math.abs(time - point) < threshold) {
          return { time: point, snapped: true };
        }
      }
      return { time, snapped: false };
    },
    [getSnapPoints],
  );

  const handleElementClick = useCallback(
    (e: React.MouseEvent, element: TimelineElement) => {
      e.stopPropagation();
      if (dragState.isDragging || dragState.isResizing) return;
      const multi = e.metaKey || e.ctrlKey;
      selectElement(track.id, element.id, multi);
    },
    [track.id, selectElement, dragState.isDragging, dragState.isResizing],
  );

  // Pointer ID for tracking captured pointer
  const capturedPointerIdRef = useRef<number | null>(null);
  const dragElementRef = useRef<HTMLElement | null>(null);
  const activePointerDragRef = useRef<ActivePointerDrag | null>(null);

  useEffect(() => {
    return () => {
      activePointerDragRef.current?.dispose();
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.PointerEvent, element: TimelineElement, resizeDir: ResizeDirection = null) => {
      e.stopPropagation();
      e.preventDefault();

      const target = e.currentTarget as HTMLElement;
      activePointerDragRef.current?.cancel();

      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Window-level listeners still keep the drag lifecycle recoverable.
      }
      capturedPointerIdRef.current = e.pointerId;
      dragElementRef.current = target;

      const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
      const left = element.startTime * pixelsPerSecond * zoomLevel;
      const width = effectiveDuration * pixelsPerSecond * zoomLevel;

      // Record original state for undo (will be committed as operation on drag end)
      const originalElement = {
        startTime: element.startTime,
        trimStart: element.trimStart,
        trimEnd: element.trimEnd,
        duration: element.duration,
      };

      setDragState({
        isDragging: !resizeDir,
        isResizing: !!resizeDir,
        resizeDirection: resizeDir,
        elementId: element.id,
        startX: e.clientX,
        startLeft: left,
        startWidth: width,
        startTrimStart: element.trimStart,
        startTrimEnd: element.trimEnd,
      });

      // Select element if not already selected
      const isSelected = selectedElements.some(
        (s) => s.trackId === track.id && s.elementId === element.id,
      );
      if (!isSelected) {
        selectElement(track.id, element.id, false);
      }

      // For batch move: store original positions of all selected elements
      const originalPositions = new Map<string, { trackId: string; startTime: number }>();
      if (!resizeDir && project) {
        // Get currently selected elements (including this one if just selected)
        const elementsToMove = isSelected
          ? selectedElements
          : [{ trackId: track.id, elementId: element.id }];

        for (const sel of elementsToMove) {
          const selTrack = project.tracks.find((t) => t.id === sel.trackId);
          const selElement = selTrack?.elements.find((el) => el.id === sel.elementId);
          if (selElement) {
            originalPositions.set(sel.elementId, {
              trackId: sel.trackId,
              startTime: selElement.startTime,
            });
          }
        }
      }

      let hasEnded = false;
      const eventOptions = { capture: true };

      function cleanupListeners() {
        window.removeEventListener('pointermove', handlePointerMove, eventOptions);
        window.removeEventListener('pointerup', handlePointerUp, eventOptions);
        window.removeEventListener('pointercancel', handlePointerCancel, eventOptions);
        window.removeEventListener('blur', handleWindowBlur, eventOptions);
        document.removeEventListener('visibilitychange', handleVisibilityChange, eventOptions);
        target.removeEventListener('lostpointercapture', handleLostPointerCapture, eventOptions);
      }

      function releasePointerCapture() {
        if (capturedPointerIdRef.current === null) {
          return;
        }

        const capturedElement = dragElementRef.current;
        if (capturedElement?.hasPointerCapture(capturedPointerIdRef.current)) {
          try {
            capturedElement.releasePointerCapture(capturedPointerIdRef.current);
          } catch {
            // Ignore errors if pointer was already released by the host.
          }
        }

        capturedPointerIdRef.current = null;
        dragElementRef.current = null;
      }

      function resetDragUi() {
        setSnapIndicatorTime(null);
        setDragTargetTrackId(null);
        setDragState(idleDragState);
      }

      function commitDragOperation() {
        const latestProject = useEditorStore.getState().project;
        if (!latestProject) {
          return;
        }

        const currentElement = latestProject.tracks
          .find((t) => t.id === track.id)
          ?.elements.find((candidate) => candidate.id === element.id);

        if (!currentElement) {
          return;
        }

        const hasChanged =
          currentElement.startTime !== originalElement.startTime ||
          currentElement.trimStart !== originalElement.trimStart ||
          currentElement.trimEnd !== originalElement.trimEnd ||
          currentElement.duration !== originalElement.duration;

        if (!hasChanged) {
          return;
        }

        // Build update/before diff for changed properties
        const updates: Record<string, unknown> = {};
        const beforeUpdates: Record<string, unknown> = {};

        if (currentElement.startTime !== originalElement.startTime) {
          updates.startTime = currentElement.startTime;
          beforeUpdates.startTime = originalElement.startTime;
        }
        if (currentElement.trimStart !== originalElement.trimStart) {
          updates.trimStart = currentElement.trimStart;
          beforeUpdates.trimStart = originalElement.trimStart;
        }
        if (currentElement.trimEnd !== originalElement.trimEnd) {
          updates.trimEnd = currentElement.trimEnd;
          beforeUpdates.trimEnd = originalElement.trimEnd;
        }
        if (currentElement.duration !== originalElement.duration) {
          updates.duration = currentElement.duration;
          beforeUpdates.duration = originalElement.duration;
        }

        const op: EditOperation = {
          type: 'element.update',
          meta: createMeta('user', 'Drag element'),
          payload: {
            trackId: track.id,
            elementId: element.id,
            updates,
          },
          before: { updates: beforeUpdates },
        };

        const latestTrack = latestProject.tracks.find((candidate) => candidate.id === track.id);

        const shouldRipple = rippleEditingEnabled && originalPositions.size === 1 && !resizeDir;

        const isRightResizeRipple = rippleEditingEnabled && resizeDir === 'right';

        if (shouldRipple || isRightResizeRipple) {
          const originalEffectiveDuration =
            originalElement.duration - originalElement.trimStart - originalElement.trimEnd;
          const currentEffectiveDuration =
            currentElement.duration - currentElement.trimStart - currentElement.trimEnd;
          const originalEnd = originalElement.startTime + originalEffectiveDuration;
          const delta = !resizeDir
            ? currentElement.startTime - originalElement.startTime
            : currentEffectiveDuration - originalEffectiveDuration;

          const rippleOps: EditOperation[] =
            latestTrack?.elements
              .filter(
                (candidate) => candidate.id !== element.id && candidate.startTime >= originalEnd,
              )
              .map((candidate) => {
                const nextStartTime = Math.max(0, candidate.startTime + delta);

                if (nextStartTime === candidate.startTime) {
                  return null;
                }

                updateElement(track.id, candidate.id, {
                  startTime: nextStartTime,
                });

                const rippleOp: EditOperation = {
                  type: 'element.update' as const,
                  meta: createMeta('user', 'Ripple edit'),
                  payload: {
                    trackId: track.id,
                    elementId: candidate.id,
                    updates: {
                      startTime: nextStartTime,
                    },
                  },
                  before: {
                    updates: {
                      startTime: candidate.startTime,
                    },
                  },
                };
                return rippleOp;
              })
              .filter((candidate) => candidate !== null) ?? [];

          if (rippleOps.length > 0) {
            pushOperation({
              type: 'batch',
              meta: createMeta('user', 'Ripple edit'),
              payload: {
                operations: [op, ...rippleOps],
              },
            });
          } else {
            pushOperation(op);
          }
        } else {
          pushOperation(op);
        }
      }

      function cancelDrag() {
        if (hasEnded) {
          return;
        }

        hasEnded = true;
        cleanupListeners();
        releasePointerCapture();
        commitDragOperation();
        resetDragUi();
        activePointerDragRef.current = null;
      }

      function disposeDrag() {
        if (hasEnded) {
          return;
        }

        hasEnded = true;
        cleanupListeners();
        releasePointerCapture();
        activePointerDragRef.current = null;
      }

      function handlePointerMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== e.pointerId) {
          return;
        }

        moveEvent.preventDefault();
        const deltaX = moveEvent.clientX - e.clientX;
        const deltaTime = deltaX / (pixelsPerSecond * zoomLevel);

        if (resizeDir === 'left') {
          // Resizing from left
          // Check if this is an image - images can have their duration extended freely
          const isImage = element.type === 'media' && 'src' in element && isImageFile(element.src);

          if (isImage) {
            // For images: adjust startTime and duration (keep end time fixed)
            const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
            const currentEndTime = element.startTime + effectiveDuration;
            const newStartTime = Math.max(0, element.startTime + deltaTime);

            // Apply snapping to start point
            const snapResult = findSnapPoint(newStartTime);

            // Calculate new duration to keep end time fixed
            const newDuration = Math.max(0.1, currentEndTime - snapResult.time);

            // Show snap indicator if snapped
            setSnapIndicatorTime(snapResult.snapped ? snapResult.time : null);

            updateElement(track.id, element.id, {
              startTime: snapResult.time,
              duration: newDuration,
              trimStart: 0, // Reset trimStart for images
            });
          } else {
            // For video/audio: allow free duration extension (no source boundary limit)
            // Playback will stop when reaching the end of source media
            // element values are captured at mousedown, so they represent initial state
            const initialStartTime = element.startTime;
            const initialDuration = element.duration;
            const initialTrimStart = element.trimStart;
            const initialTrimEnd = element.trimEnd;
            const initialEffectiveDuration = initialDuration - initialTrimStart - initialTrimEnd;
            const currentEndTime = initialStartTime + initialEffectiveDuration;

            // Calculate new start time based on drag delta
            const newStartTime = Math.max(0, initialStartTime + deltaTime);

            // Apply snapping to the new start time
            const snapResult = findSnapPoint(newStartTime);

            // Calculate new duration to keep end time fixed
            const newDuration = Math.max(
              0.1,
              currentEndTime - snapResult.time + initialTrimStart + initialTrimEnd,
            );

            // Show snap indicator if snapped
            setSnapIndicatorTime(snapResult.snapped ? snapResult.time : null);

            updateElement(track.id, element.id, {
              startTime: snapResult.time,
              duration: newDuration,
            });
          }
        } else if (resizeDir === 'right') {
          // Resizing from right
          // element values are captured at mousedown, so they represent initial state
          const initialTrimStart = element.trimStart;
          const initialTrimEnd = element.trimEnd;
          const initialDuration = element.duration;
          const initialEffectiveDuration = initialDuration - initialTrimStart - initialTrimEnd;

          // Check if this is an image - images can have their duration extended freely
          const isImage = element.type === 'media' && 'src' in element && isImageFile(element.src);

          if (isImage) {
            // For images: directly modify duration (no trimEnd needed)
            const newEffectiveDuration = Math.max(0.1, initialEffectiveDuration + deltaTime);
            const endTime = element.startTime + newEffectiveDuration;
            const snapResult = findSnapPoint(endTime);
            const snappedDuration = Math.max(0.1, snapResult.time - element.startTime);

            // Show snap indicator if snapped
            setSnapIndicatorTime(snapResult.snapped ? snapResult.time : null);

            updateElement(track.id, element.id, {
              duration: snappedDuration,
              trimEnd: 0, // Reset trimEnd for images
            });
          } else {
            // For video/audio: allow free duration extension (no source boundary limit)
            // Playback will stop when reaching the end of source media
            const newEffectiveDuration = Math.max(0.1, initialEffectiveDuration + deltaTime);
            const newEndTime = element.startTime + newEffectiveDuration;

            // Apply snapping to end point
            const snapResult = findSnapPoint(newEndTime);

            // Calculate new duration based on snapped end time
            const snappedEffectiveDuration = Math.max(0.1, snapResult.time - element.startTime);
            const newDuration = snappedEffectiveDuration + initialTrimStart + initialTrimEnd;

            // Show snap indicator if snapped
            setSnapIndicatorTime(snapResult.snapped ? snapResult.time : null);

            updateElement(track.id, element.id, {
              duration: newDuration,
            });
          }
        } else {
          // Moving element(s) (with cross-track support and batch move)
          const originalPos = originalPositions.get(element.id);
          const newBaseTime = Math.max(
            0,
            (originalPos?.startTime ?? element.startTime) + deltaTime,
          );
          const snapResult = findSnapPoint(newBaseTime);

          // Show snap indicator if snapped
          setSnapIndicatorTime(snapResult.snapped ? snapResult.time : null);

          // Calculate the actual delta based on snap result
          const actualDelta = snapResult.time - (originalPos?.startTime ?? element.startTime);

          // Move all selected elements by the same delta
          if (originalPositions.size > 1) {
            // Batch move: update all selected elements
            for (const [elemId, origPos] of originalPositions) {
              const newTime = Math.max(0, origPos.startTime + actualDelta);
              updateElement(origPos.trackId, elemId, {
                startTime: newTime,
              });
            }
          } else {
            // Single element move
            updateElement(track.id, element.id, {
              startTime: snapResult.time,
            });
          }

          // Determine target track based on Y position (only for single element drag)
          if (originalPositions.size === 1 && tracksContainerRef?.current && sortedTracks) {
            const containerRect = tracksContainerRef.current.getBoundingClientRect();
            const relativeY =
              moveEvent.clientY - containerRect.top + tracksContainerRef.current.scrollTop;
            const targetTrackIndex = Math.floor(relativeY / trackHeight);
            const clampedIndex = Math.max(0, Math.min(sortedTracks.length - 1, targetTrackIndex));
            const targetTrack = sortedTracks[clampedIndex];

            // Only allow moving to tracks of the same type
            if (targetTrack && targetTrack.id !== track.id && targetTrack.type === track.type) {
              setDragTargetTrackId(targetTrack.id);
            } else {
              setDragTargetTrackId(null);
            }
          }
        }
      }

      function handlePointerUp(upEvent: PointerEvent) {
        if (upEvent.pointerId !== e.pointerId || hasEnded) {
          return;
        }

        hasEnded = true;
        cleanupListeners();
        releasePointerCapture();

        // Clear snap indicator
        setSnapIndicatorTime(null);

        // Commit drag operation to history for undo/redo before any cross-track move.
        // updateElement uses raw set() during drag, so this also syncs Extension state.
        commitDragOperation();

        // Handle cross-track move if not resizing and single element
        if (
          !resizeDir &&
          originalPositions.size === 1 &&
          tracksContainerRef?.current &&
          sortedTracks
        ) {
          const containerRect = tracksContainerRef.current.getBoundingClientRect();
          const relativeY =
            upEvent.clientY - containerRect.top + tracksContainerRef.current.scrollTop;
          const targetTrackIndex = Math.floor(relativeY / trackHeight);
          const clampedIndex = Math.max(0, Math.min(sortedTracks.length - 1, targetTrackIndex));
          const targetTrack = sortedTracks[clampedIndex];

          // Only allow moving to tracks of the same type
          if (targetTrack && targetTrack.id !== track.id && targetTrack.type === track.type) {
            // Move element to the new track
            moveElement(track.id, targetTrack.id, element.id);
          }
        }

        // Clear drag target
        setDragTargetTrackId(null);

        setDragState(idleDragState);
        activePointerDragRef.current = null;
      }

      function handlePointerCancel(cancelEvent: PointerEvent) {
        if (cancelEvent.pointerId === e.pointerId) {
          cancelDrag();
        }
      }

      function handleLostPointerCapture(lostEvent: PointerEvent) {
        if (lostEvent.pointerId === e.pointerId) {
          cancelDrag();
        }
      }

      function handleWindowBlur() {
        cancelDrag();
      }

      function handleVisibilityChange() {
        if (document.visibilityState === 'hidden') {
          cancelDrag();
        }
      }

      window.addEventListener('pointermove', handlePointerMove, eventOptions);
      window.addEventListener('pointerup', handlePointerUp, eventOptions);
      window.addEventListener('pointercancel', handlePointerCancel, eventOptions);
      window.addEventListener('blur', handleWindowBlur, eventOptions);
      document.addEventListener('visibilitychange', handleVisibilityChange, eventOptions);
      target.addEventListener('lostpointercapture', handleLostPointerCapture, eventOptions);

      activePointerDragRef.current = {
        cancel: cancelDrag,
        dispose: disposeDrag,
      };
    },
    [
      track.id,
      pixelsPerSecond,
      zoomLevel,
      trackHeight,
      updateElement,
      pushOperation,
      selectElement,
      selectedElements,
      findSnapPoint,
      setSnapIndicatorTime,
      setDragTargetTrackId,
      moveElement,
      tracksContainerRef,
      sortedTracks,
      project,
      rippleEditingEnabled,
    ],
  );

  // Handle element right-click
  const handleElementContextMenu = useCallback(
    (e: React.MouseEvent, element: TimelineElement) => {
      e.preventDefault();
      e.stopPropagation();
      // Select the element if not already selected
      const isSelected = selectedElements.some(
        (s) => s.trackId === track.id && s.elementId === element.id,
      );
      if (!isSelected) {
        selectElement(track.id, element.id);
      }
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        element,
      });
    },
    [track.id, selectedElements, selectElement],
  );

  const commitElementUpdate = useCallback(
    (element: TimelineElement, updates: Partial<TimelineElement>, description: string) => {
      const beforeUpdates: Record<string, unknown> = {};
      const changedUpdates: Record<string, unknown> = {};
      const elementRecord = element as unknown as Record<string, unknown>;
      const updatesRecord = updates as Record<string, unknown>;

      for (const [key, value] of Object.entries(updatesRecord)) {
        const previousValue = elementRecord[key];
        if (JSON.stringify(previousValue) === JSON.stringify(value)) {
          continue;
        }
        beforeUpdates[key] = previousValue;
        changedUpdates[key] = value;
      }

      if (Object.keys(changedUpdates).length === 0) {
        return;
      }

      dispatch({
        type: 'element.update',
        meta: createMeta('user', description),
        payload: {
          trackId: track.id,
          elementId: element.id,
          updates: changedUpdates as Partial<TimelineElement>,
        },
        before: {
          updates: beforeUpdates as Partial<TimelineElement>,
        },
      });
    },
    [dispatch, track.id],
  );

  // Generate context menu items for an element
  const getElementContextMenuItems = useCallback(
    (element: TimelineElement): MenuItem[] => {
      const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
      const elementStart = element.startTime;
      const elementEnd = elementStart + effectiveDuration;
      const canSplit = currentTime > elementStart && currentTime < elementEnd;

      const items: MenuItem[] = [
        // Basic edit operations
        {
          label: t('timeline.contextMenu.copy'),
          shortcut: '⌘C',
          onClick: () => copySelected(),
        },
        {
          label: t('timeline.contextMenu.cut'),
          shortcut: '⌘X',
          onClick: () => {
            copySelected();
            removeElement(track.id, element.id);
          },
        },
        {
          label: t('timeline.contextMenu.duplicate'),
          shortcut: '⌘D',
          onClick: () => {
            copySelected();
            pasteAtTime(getDuplicateInsertTime(project, selectedElements, element));
          },
        },
        { label: '', separator: true, onClick: () => {} },
        // Split and trim
        {
          label: t('timeline.contextMenu.splitAtPlayhead'),
          shortcut: 'S',
          onClick: () => splitAtPlayhead(track.id, element.id),
          disabled: !canSplit,
        },
        {
          label: t('timeline.contextMenu.splitKeepLeft'),
          shortcut: 'Q',
          onClick: () => splitAndKeepLeft(track.id, element.id),
          disabled: !canSplit,
        },
        {
          label: t('timeline.contextMenu.splitKeepRight'),
          shortcut: 'W',
          onClick: () => splitAndKeepRight(track.id, element.id),
          disabled: !canSplit,
        },
        {
          label: t('timeline.contextMenu.trimToPlayhead'),
          onClick: () => {
            const updates = buildTrimToPlayheadUpdates(element, currentTime);
            if (!updates) {
              return;
            }

            const trimOp: EditOperation = {
              type: 'element.update',
              meta: createMeta('user', 'Trim to playhead'),
              payload: {
                trackId: track.id,
                elementId: element.id,
                updates,
              },
              before: {
                updates: {
                  trimEnd: element.trimEnd,
                },
              },
            };

            if (!rippleEditingEnabled) {
              dispatch(trimOp);
              return;
            }

            const updatedTrimEnd =
              typeof updates.trimEnd === 'number' ? updates.trimEnd : element.trimEnd;
            const originalEffectiveDuration =
              element.duration - element.trimStart - element.trimEnd;
            const updatedEffectiveDuration = element.duration - element.trimStart - updatedTrimEnd;
            const rippleOps = collectTimelineRippleOps(
              track.id,
              track.elements,
              element.id,
              elementEnd,
              updatedEffectiveDuration - originalEffectiveDuration,
            );

            if (rippleOps.length === 0) {
              dispatch(trimOp);
              return;
            }

            dispatchBatch([trimOp, ...rippleOps]);
          },
          disabled: currentTime <= elementStart || currentTime >= elementEnd,
        },
        { label: '', separator: true, onClick: () => {} },
        // Speed submenu
        {
          label: t('timeline.contextMenu.speed'),
          onClick: () => {},
          submenu: [
            {
              label: t('timeline.contextMenu.speed05x'),
              onClick: () => {
                commitElementUpdate(
                  element,
                  buildTimelineSpeedUpdates(element, 0.5),
                  'Set timeline speed to 0.5x',
                );
              },
            },
            {
              label: t('timeline.contextMenu.speed1x'),
              onClick: () => {
                commitElementUpdate(
                  element,
                  buildTimelineSpeedUpdates(element, 1),
                  'Set timeline speed to 1x',
                );
              },
            },
            {
              label: t('timeline.contextMenu.speed2x'),
              onClick: () => {
                commitElementUpdate(
                  element,
                  buildTimelineSpeedUpdates(element, 2),
                  'Set timeline speed to 2x',
                );
              },
            },
            {
              label: t('timeline.contextMenu.reverse'),
              onClick: () => {
                commitElementUpdate(
                  element,
                  buildTimelineReverseUpdates(element),
                  'Toggle reverse playback',
                );
              },
            },
          ],
        },
        { label: '', separator: true, onClick: () => {} },
        // Visibility
        {
          label: element.hidden ? t('timeline.contextMenu.show') : t('timeline.contextMenu.hide'),
          shortcut: 'H',
          onClick: () => toggleElementHidden(track.id, element.id),
        },
        {
          label: element.muted ? t('timeline.contextMenu.unmute') : t('timeline.contextMenu.mute'),
          shortcut: 'M',
          onClick: () => toggleElementMuted(track.id, element.id),
        },
      ];

      // Media-specific options
      if (element.type === 'media') {
        const hasLinkedAudio = Boolean(element.linkedAudioId);

        items.push({ label: '', separator: true, onClick: () => {} });

        if (hasLinkedAudio) {
          items.push({
            label: t('timeline.contextMenu.unseparateAudio'),
            onClick: () => unseparateVideoAudio(track.id, element.id),
          });
        } else {
          items.push({
            label: t('timeline.contextMenu.separateAudio'),
            onClick: async () => {
              const result = await separateVideoAudio(track.id, element.id);
              if (!result.success) {
                logger.error('Failed to separate audio:', result.error);
              }
            },
          });
        }

        // AI Operations for media
        items.push({ label: '', separator: true, onClick: () => {} });

        // Get AI actions based on element type
        const isImage = element.src && isImageFile(element.src);
        const aiType = mapElementTypeToAIType(element.type, isImage ? 'image' : 'video');
        const aiActions = getActionsForElementType(aiType);

        if (aiActions.length > 0) {
          items.push({
            label: t('timeline.contextMenu.aiOperations'),
            onClick: () => {},
            submenu: aiActions.map((action: AIQuickAction) => ({
              label: t(action.label),
              onClick: () => {
                if (onExecuteAIAction) {
                  onExecuteAIAction(action.id, [element.id]);
                }
              },
            })),
          });
        }
      }

      // Text-specific AI options
      if (element.type === 'text') {
        items.push({ label: '', separator: true, onClick: () => {} });

        // Get AI actions for text elements
        const textAiActions = getActionsForElementType('text');

        if (textAiActions.length > 0) {
          items.push({
            label: t('timeline.contextMenu.aiOperations'),
            onClick: () => {},
            submenu: textAiActions.map((action: AIQuickAction) => ({
              label: t(action.label),
              onClick: () => {
                if (onExecuteAIAction) {
                  onExecuteAIAction(action.id, [element.id]);
                }
              },
            })),
          });
        }
      }

      // Audio-specific AI options
      if (element.type === 'audio') {
        items.push({ label: '', separator: true, onClick: () => {} });

        // Get AI actions for audio elements
        const audioAiActions = getActionsForElementType('audio');

        if (audioAiActions.length > 0) {
          items.push({
            label: t('timeline.contextMenu.aiOperations'),
            onClick: () => {},
            submenu: audioAiActions.map((action: AIQuickAction) => ({
              label: t(action.label),
              onClick: () => {
                if (onExecuteAIAction) {
                  onExecuteAIAction(action.id, [element.id]);
                }
              },
            })),
          });
        }
      }

      // Delete option (always last)
      items.push({ label: '', separator: true, onClick: () => {} });
      items.push({
        label: t('timeline.contextMenu.delete'),
        shortcut: '⌫',
        danger: true,
        onClick: () => removeElement(track.id, element.id),
      });

      return items;
    },
    [
      track.id,
      currentTime,
      copySelected,
      splitAtPlayhead,
      splitAndKeepLeft,
      splitAndKeepRight,
      toggleElementHidden,
      toggleElementMuted,
      separateVideoAudio,
      unseparateVideoAudio,
      removeElement,
      pasteAtTime,
      dispatch,
      dispatchBatch,
      t,
      onExecuteAIAction,
      commitElementUpdate,
      rippleEditingEnabled,
      project,
      selectedElements,
      track.elements,
    ],
  );

  // Get element color based on track type (not element type)
  const getElementColor = (): string => {
    switch (track.type) {
      case 'media':
        return 'bg-blue-600 border-blue-400';
      case 'text':
        return 'bg-yellow-600 border-yellow-400';
      case 'audio':
        return 'bg-transparent border-green-400'; // Transparent to show waveform
      default:
        return 'bg-gray-600 border-gray-400';
    }
  };

  // Get element style classes based on track state
  const getTrackStateClasses = (): string => {
    const classes: string[] = [];

    // Hidden track: reduced opacity
    if (track.hidden) {
      classes.push('opacity-30');
    }

    // Muted track: grayscale effect
    if (track.muted) {
      classes.push('grayscale');
    }

    // Locked track: pointer events disabled
    if (track.locked) {
      classes.push('pointer-events-none');
    }

    return classes.join(' ');
  };

  // Get element border style based on track state
  const getElementBorderStyle = (): string => {
    if (track.hidden) {
      return 'border-dashed';
    }
    return '';
  };

  return (
    <div
      ref={trackRef}
      className={`relative border-b border-vscode-panel-border ${track.locked ? 'cursor-not-allowed' : ''}`}
      style={{
        height: trackHeight,
      }}
    >
      {/* Track background */}
      <div
        className={`absolute inset-0 ${track.locked ? 'bg-vscode-sidebar-bg/70' : 'bg-vscode-sidebar-bg/50'}`}
      >
        {/* Locked track stripe pattern overlay */}
        {track.locked && (
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 4px, currentColor 4px, currentColor 5px)',
            }}
          />
        )}
      </div>

      {/* Elements container with track state effects */}
      <div className={`relative h-full ${getTrackStateClasses()}`}>
        {/* Elements - virtualized: only render visible elements */}
        {track.elements
          .filter((element) => {
            // Always render if no visibleRange (fallback) or if element is being dragged
            if (!visibleRange) return true;
            if (dragState.elementId === element.id) return true;

            // Check if element overlaps with visible range
            const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
            const elementEnd = element.startTime + effectiveDuration;
            return (
              elementEnd >= visibleRange.startTime && element.startTime <= visibleRange.endTime
            );
          })
          .map((element) => {
            const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
            const left = element.startTime * pixelsPerSecond * zoomLevel;
            const width = effectiveDuration * pixelsPerSecond * zoomLevel;
            const isSelected = selectedElements.some(
              (s) => s.trackId === track.id && s.elementId === element.id,
            );
            const isDragging =
              dragState.elementId === element.id && (dragState.isDragging || dragState.isResizing);

            return (
              <div
                key={element.id}
                className={`timeline-element absolute top-1 bottom-1 rounded border ${track.locked ? 'cursor-not-allowed' : 'cursor-grab'}
              ${getElementColor()}
              ${getElementBorderStyle()}
              ${isSelected ? 'ring-2 ring-vscode-accent ring-offset-1 ring-offset-vscode-bg' : ''}
              ${element.hidden ? 'opacity-40' : ''}
              ${isDragging ? 'cursor-grabbing opacity-90' : ''}
            `}
                style={{
                  left,
                  width: Math.max(width, 4),
                  zIndex: isDragging ? 100 : isSelected ? 10 : 1,
                  touchAction: 'none', // Required for pointer capture
                }}
                onClick={(e) => !track.locked && handleElementClick(e, element)}
                onPointerDown={(e) => !track.locked && handleMouseDown(e, element, null)}
                onContextMenu={(e) => handleElementContextMenu(e, element)}
              >
                {/* Element content */}
                <TimelineElementContent
                  element={element}
                  width={Math.max(width, 4)}
                  height={trackHeight - 8}
                  trackType={track.type}
                  showThumbnails={showClipThumbnails}
                  pixelsPerSecond={pixelsPerSecond}
                  zoomLevel={zoomLevel}
                  visibleRange={visibleRange}
                />

                {/* Track state indicators */}
                <div className="absolute top-0.5 right-0.5 flex gap-0.5">
                  {track.muted && (
                    <div
                      className="w-3 h-3 bg-black/50 rounded-sm flex items-center justify-center"
                      title="Muted"
                    >
                      <svg className="w-2 h-2 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                  {track.locked && (
                    <div
                      className="w-3 h-3 bg-black/50 rounded-sm flex items-center justify-center"
                      title="Locked"
                    >
                      <svg
                        className="w-2 h-2 text-yellow-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Keyframe indicators - only show for media/text with transform */}
                {element.transform && (element.type === 'media' || element.type === 'text') && (
                  <KeyframeIndicator element={element} zoomLevel={zoomLevel} />
                )}

                {/* Left trim handle - disabled when locked */}
                {!track.locked && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 bg-white/0 hover:bg-white/30 cursor-ew-resize transition-colors"
                    onPointerDown={(e) => handleMouseDown(e, element, 'left')}
                  />
                )}

                {/* Right trim handle - disabled when locked */}
                {!track.locked && (
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 bg-white/0 hover:bg-white/30 cursor-ew-resize transition-colors"
                    onPointerDown={(e) => handleMouseDown(e, element, 'right')}
                  />
                )}
              </div>
            );
          })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getElementContextMenuItems(contextMenu.element)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});
