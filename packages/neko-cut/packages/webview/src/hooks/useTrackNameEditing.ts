import { useCallback, useRef, useState } from 'react';
import type { TimelineTrackView } from '@neko-cut/domain';

export function useTrackNameEditing(input: {
  readonly onRename: (trackId: string, name: string) => void;
}) {
  const [editingTrackId, setEditingTrackId] = useState<string>();
  const [editingTrackName, setEditingTrackName] = useState('');
  const trackNameInputRef = useRef<HTMLInputElement>(null);

  const begin = useCallback((track: TimelineTrackView) => {
    setEditingTrackId(track.trackId);
    setEditingTrackName(track.name);
    queueMicrotask(() => trackNameInputRef.current?.focus());
  }, []);
  const save = useCallback(
    (track: TimelineTrackView) => {
      const name = editingTrackName.trim();
      if (name && name !== track.name) input.onRename(track.trackId, name);
      setEditingTrackId(undefined);
      setEditingTrackName('');
    },
    [editingTrackName, input],
  );
  const cancel = useCallback(() => {
    setEditingTrackId(undefined);
    setEditingTrackName('');
  }, []);

  return {
    editingTrackId,
    editingTrackName,
    trackNameInputRef,
    setEditingTrackName,
    begin,
    save,
    cancel,
  };
}
