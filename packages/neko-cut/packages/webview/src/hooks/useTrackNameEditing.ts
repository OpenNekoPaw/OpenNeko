/**
 * useTrackNameEditing Hook
 * 管理轨道名称编辑
 */

import { useCallback, useRef, useState } from 'react';
import type { ProjectData } from '../types';

export interface TrackNameEditingOptions {
  project: ProjectData | null;
  updateTrack: (trackId: string, updates: Partial<{ name: string }>) => void;
}

export function useTrackNameEditing({ project, updateTrack }: TrackNameEditingOptions) {
  // Track name editing state
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrackName, setEditingTrackName] = useState('');
  const trackNameInputRef = useRef<HTMLInputElement>(null);

  // Start editing track name on double-click
  const handleTrackNameDoubleClick = useCallback((trackId: string, currentName: string) => {
    setEditingTrackId(trackId);
    setEditingTrackName(currentName);
    // Focus input after state update
    setTimeout(() => trackNameInputRef.current?.focus(), 0);
  }, []);

  // Save track name edit
  const handleSaveTrackName = useCallback(
    (trackId: string) => {
      if (
        editingTrackName.trim() &&
        editingTrackName !== project?.tracks.find((t) => t.id === trackId)?.name
      ) {
        updateTrack(trackId, { name: editingTrackName.trim() });
      }
      setEditingTrackId(null);
      setEditingTrackName('');
    },
    [editingTrackName, updateTrack, project],
  );

  // Cancel track name edit
  const handleCancelTrackNameEdit = useCallback(() => {
    setEditingTrackId(null);
    setEditingTrackName('');
  }, []);

  return {
    editingTrackId,
    editingTrackName,
    trackNameInputRef,
    setEditingTrackName,
    handleTrackNameDoubleClick,
    handleSaveTrackName,
    handleCancelTrackNameEdit,
  };
}
