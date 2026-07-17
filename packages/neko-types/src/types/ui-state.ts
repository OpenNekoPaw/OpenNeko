/**
 * Shared editor UI state primitives.
 *
 * These types are host-agnostic contracts for persisted/editor operations. They
 * must stay independent from feature Webview implementations.
 */
// =============================================================================
// UI State Types — Separated from Engine Model
//
// These types represent UI-only state that the engine does not recognize.
// They exist only in the frontend Store and are never sent to the engine.
//
// Separation rationale:
// - Engine Track has 8 fields; UI needs additional display state
// - Engine Element has 12 core fields; editor needs animation/mask/transition state
// - Keeping these separate prevents accidental serialization to engine
// =============================================================================

import { ElementTransform } from './animation';
import { ColorCorrection } from './colorCorrection';
import { MaskInstance } from './mask';
import { BlendModeType } from './blendMode';
import { ElementTransition } from './transition';

// =============================================================================
// Track UI State
// =============================================================================

/**
 * Track UI state — only exists in frontend Store, not sent to engine.
 *
 * Keyed by track ID in the Store:
 *   Map<trackId, TrackUIState>
 */
export interface TrackUIState {
  /** Solo mode (only this track is audible/visible) */
  solo: boolean;
  /** Track color for UI display */
  color: string;
  /** Track height in UI (pixels) */
  height: number;
  /** Whether the track is collapsed in UI */
  collapsed: boolean;
  /** Track opacity (0-1) — UI-level compositing, not engine */
  opacity?: number;
  /** Track blend mode — UI-level compositing, not engine */
  blendMode?: BlendModeType;
  /** Transitions between elements in this track — UI-managed */
  transitions?: ElementTransition[];
}

/** Default UI state for a new track */
export const DEFAULT_TRACK_UI_STATE: TrackUIState = {
  solo: false,
  color: '#4A90D9',
  height: 60,
  collapsed: false,
};

// =============================================================================
// Element Edit State
// =============================================================================

/**
 * Element edit state — UI extensions the engine doesn't recognize.
 *
 * These properties are needed by the editor but are not part of the
 * engine's Element model.
 *
 * Note: speed, transitionIn, transitionOut have been migrated to engine
 * fields on BaseTimelineElement (Phase 1-2).
 *
 * Keyed by element ID in the Store:
 *   Map<elementId, ElementEditState>
 */
export interface ElementEditState {
  /** Animatable transform (supports keyframes) — pending engine migration */
  animTransform?: ElementTransform;
  /** Color correction settings — engine uses EffectParams instead */
  colorCorrection?: ColorCorrection;
  /** Mask instances — pending engine support */
  masks?: MaskInstance[];
}

/** Default edit state for a new element */
export const DEFAULT_ELEMENT_EDIT_STATE: ElementEditState = {};
