/**
 * PropertyPanelInline
 * Bridge component that connects EditorStore to PropertyPanel props.
 * Replaces PropertyPanelStandalone (which used postMessage IPC).
 */

import { memo, useCallback, useMemo, useRef } from 'react';
import { PropertyPanel } from './PropertyPanel';
import { useEditorStore } from '../../stores/editor-store';
import { createMeta } from '../../stores/utils/operation-helpers';
import type { TimelineElement, EasingType, ProjectDefaults } from '../../types';
import type { EditOperation } from '@neko/shared';

interface PropertyPanelInlineProps {
  readonly mode: 'basic' | 'professional';
}

export const PropertyPanelInline = memo(function PropertyPanelInline({
  mode,
}: PropertyPanelInlineProps) {
  const project = useEditorStore((s) => s.project);
  const selectedElements = useEditorStore((s) => s.selectedElements);
  const currentTime = useEditorStore((s) => s.currentTime);
  const updateElement = useEditorStore((s) => s.updateElement);
  const updateProject = useEditorStore((s) => s.updateProject);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const removeKeyframe = useEditorStore((s) => s.removeKeyframe);
  const executeAIAction = useEditorStore((s) => s.executeAIAction);
  const pushOperation = useEditorStore((s) => s.pushOperation);

  // Track the element state before changes begin (for undo)
  const beforeSnapshotRef = useRef<{ elementId: string; values: Partial<TimelineElement> } | null>(
    null,
  );

  // Derive selected element (same logic as former App.tsx:104-109)
  const selectedElement = useMemo((): TimelineElement | null => {
    if (!project || selectedElements.length === 0) return null;
    const { trackId, elementId } = selectedElements[0];
    const track = project.tracks.find((t) => t.id === trackId);
    return track?.elements.find((e) => e.id === elementId) ?? null;
  }, [project, selectedElements]);

  const selectedTrackId =
    selectedElements.length > 0 ? (selectedElements[0]?.trackId ?? null) : null;

  // Map callbacks: bridge PropertyPanel's signatures to store actions
  // onChange: real-time preview (raw set, no history)
  const handleElementChange = useCallback(
    (elementId: string, changes: Partial<TimelineElement>) => {
      if (!selectedTrackId) return;

      // Capture "before" snapshot on first change for undo
      if (!beforeSnapshotRef.current || beforeSnapshotRef.current.elementId !== elementId) {
        const track = project?.tracks.find((t) => t.id === selectedTrackId);
        const element = track?.elements.find((e) => e.id === elementId);
        if (element) {
          const beforeValues: Partial<TimelineElement> = {};
          const elementRecord = element as unknown as Record<string, unknown>;
          for (const key of Object.keys(changes)) {
            (beforeValues as Record<string, unknown>)[key] = elementRecord[key];
          }
          beforeSnapshotRef.current = { elementId, values: beforeValues };
        }
      }

      updateElement(selectedTrackId, elementId, changes);
    },
    [selectedTrackId, updateElement, project],
  );

  // onCommit: finalize change with EditOperation (undo/redo + Extension sync)
  const handleElementCommit = useCallback(
    (elementId: string, changes: Partial<TimelineElement>) => {
      if (!selectedTrackId) return;

      // Use the "before" snapshot captured at onChange start
      const beforeUpdates =
        beforeSnapshotRef.current?.elementId === elementId
          ? beforeSnapshotRef.current.values
          : changes; // fallback: use current changes as before (no real diff)

      const op: EditOperation = {
        type: 'element.update',
        meta: createMeta('user', 'Update property'),
        payload: {
          trackId: selectedTrackId,
          elementId,
          updates: changes,
        },
        before: { updates: beforeUpdates },
      };

      // Don't re-apply (already applied via raw set), just push to undo history
      pushOperation(op);
      beforeSnapshotRef.current = null;
    },
    [selectedTrackId, pushOperation],
  );

  const handleDefaultsChange = useCallback(
    (changes: Partial<ProjectDefaults>) => {
      if (project?.defaults) {
        updateProject({ defaults: { ...project.defaults, ...changes } });
      }
    },
    [project?.defaults, updateProject],
  );

  // PropertyPanel: onAddKeyframe(elementId, propertyPath, value, easing?)
  // Store: addKeyframe(trackId, elementId, property, time, value)
  const handleAddKeyframe = useCallback(
    (elementId: string, propertyPath: string, value: number, _easing?: EasingType) => {
      if (selectedTrackId) {
        addKeyframe(selectedTrackId, elementId, propertyPath, currentTime, value);
      }
    },
    [selectedTrackId, currentTime, addKeyframe],
  );

  // PropertyPanel: onRemoveKeyframe(elementId, propertyPath)
  // Store: removeKeyframe(trackId, elementId, property, time)
  const handleRemoveKeyframe = useCallback(
    (elementId: string, propertyPath: string) => {
      if (selectedTrackId) {
        removeKeyframe(selectedTrackId, elementId, propertyPath, currentTime);
      }
    },
    [selectedTrackId, currentTime, removeKeyframe],
  );

  // PropertyPanel: onExecuteAIAction(actionId, elementIds)
  // Store: executeAIAction(actionId, elementIds, trackIds?)
  const handleExecuteAIAction = useCallback(
    (actionId: string, elementIds: string[]) => {
      executeAIAction(actionId as Parameters<typeof executeAIAction>[0], elementIds);
    },
    [executeAIAction],
  );

  return (
    <PropertyPanel
      mode={mode}
      element={selectedElement}
      projectDefaults={project?.defaults ?? null}
      currentTime={currentTime}
      onElementChange={handleElementChange}
      onElementCommit={handleElementCommit}
      onDefaultsChange={handleDefaultsChange}
      onAddKeyframe={handleAddKeyframe}
      onRemoveKeyframe={handleRemoveKeyframe}
      onExecuteAIAction={handleExecuteAIAction}
    />
  );
});
