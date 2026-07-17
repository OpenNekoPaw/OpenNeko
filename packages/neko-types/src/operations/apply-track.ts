// =============================================================================
// Apply Track Operations — 轨道操作的 apply 实现
// =============================================================================

import type { TrackOperation } from './types';
import type { HasTracks } from './helpers';
import { findTrack, arrayMove } from './helpers';
import { OperationError } from './errors';

export function applyTrackOperation<T extends HasTracks>(data: T, op: TrackOperation): T {
  switch (op.type) {
    case 'track.add': {
      const { track, index } = op.payload;
      const newTracks = [...data.tracks];
      if (index !== undefined) {
        newTracks.splice(index, 0, track);
      } else {
        newTracks.push(track);
      }
      return { ...data, tracks: newTracks };
    }

    case 'track.remove': {
      const { trackId } = op.payload;
      findTrack(data, trackId); // validate existence
      return { ...data, tracks: data.tracks.filter((t) => t.id !== trackId) };
    }

    case 'track.update': {
      const { trackId, updates } = op.payload;
      const { index } = findTrack(data, trackId);
      const newTracks = [...data.tracks];
      newTracks[index] = { ...newTracks[index]!, ...updates };
      return { ...data, tracks: newTracks };
    }

    case 'track.reorder': {
      const { fromIndex, toIndex } = op.payload;
      if (fromIndex < 0 || fromIndex >= data.tracks.length) {
        throw OperationError.invalidIndex(fromIndex, data.tracks.length - 1);
      }
      if (toIndex < 0 || toIndex >= data.tracks.length) {
        throw OperationError.invalidIndex(toIndex, data.tracks.length - 1);
      }
      if (fromIndex === toIndex) return data;
      return { ...data, tracks: arrayMove(data.tracks, fromIndex, toIndex) };
    }

    case 'track.toggle': {
      const { trackId, field } = op.payload;
      const { index } = findTrack(data, trackId);
      const newTracks = [...data.tracks];
      newTracks[index] = { ...newTracks[index]!, [field]: !newTracks[index]![field] };
      return { ...data, tracks: newTracks };
    }
  }
}
