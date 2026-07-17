// =============================================================================
// Timeline Track — Aligned with Engine (domain/timeline.rs → Track)
//
// Authority: packages/neko-proto/timeline.proto → Track
// Engine fields: id, name, type, elements, muted, locked, hidden, isMain
// UI-only fields (solo, color, height, opacity, blendMode, transitions)
// have been moved to ui-state.ts → TrackUIState
// =============================================================================

import { TrackType } from './track';
import { TimelineElement } from './element';

/**
 * Timeline Track aligned with engine's Track struct.
 *
 * Only contains fields the engine recognizes.
 * UI state (solo, color, height, etc.) is in TrackUIState.
 */
export interface TimelineTrack {
  /** Track ID */
  id: string;
  /** Track name */
  name: string;
  /** Track type */
  type: TrackType;
  /** Elements in the track */
  elements: TimelineElement[];
  /** Whether track is muted */
  muted: boolean;
  /** Whether track is locked */
  locked: boolean;
  /** Whether track is hidden in preview */
  hidden: boolean;
  /** Whether this is the main track */
  isMain: boolean;
}
