// =============================================================================
// Transition Types — Aligned with Engine (gpu/transition_processor.rs)
//
// Authority: packages/neko-proto/timeline.proto → TransitionType
// Engine supports exactly 18 transition types.
// Unsupported types from the old TS definition have been removed.
// =============================================================================

import { EasingType } from './easing';

/**
 * Transition types supported by the engine's GPU transition processor.
 * Exactly 18 types, matching Rust TransitionType enum.
 */
export type TransitionType =
  // Basic
  | 'fade'
  | 'dissolve'
  // Wipe (4 directions)
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  // Slide (2 directions)
  | 'slide-left'
  | 'slide-right'
  // Zoom
  | 'zoom-in'
  | 'zoom-out'
  // Iris
  | 'iris-circle'
  | 'iris-rectangle'
  // Clock
  | 'clock'
  // Special effects
  | 'pixelate'
  | 'ripple'
  | 'swirl'
  | 'glitch'
  | 'flash';

/**
 * Numeric values matching the engine's TransitionType repr(u32).
 * Used for GPU shader uniform binding.
 */
export enum TransitionTypeValue {
  Fade = 0,
  WipeLeft = 1,
  WipeRight = 2,
  WipeUp = 3,
  WipeDown = 4,
  IrisCircle = 5,
  IrisRectangle = 6,
  Clock = 7,
  SlideLeft = 8,
  SlideRight = 9,
  ZoomIn = 10,
  ZoomOut = 11,
  Dissolve = 12,
  Pixelate = 13,
  Ripple = 14,
  Swirl = 15,
  Glitch = 16,
  Flash = 17,
}

/**
 * Map from TransitionType string to numeric value.
 */
export const TRANSITION_TYPE_TO_VALUE: Record<TransitionType, TransitionTypeValue> = {
  fade: TransitionTypeValue.Fade,
  dissolve: TransitionTypeValue.Dissolve,
  'wipe-left': TransitionTypeValue.WipeLeft,
  'wipe-right': TransitionTypeValue.WipeRight,
  'wipe-up': TransitionTypeValue.WipeUp,
  'wipe-down': TransitionTypeValue.WipeDown,
  'slide-left': TransitionTypeValue.SlideLeft,
  'slide-right': TransitionTypeValue.SlideRight,
  'zoom-in': TransitionTypeValue.ZoomIn,
  'zoom-out': TransitionTypeValue.ZoomOut,
  'iris-circle': TransitionTypeValue.IrisCircle,
  'iris-rectangle': TransitionTypeValue.IrisRectangle,
  clock: TransitionTypeValue.Clock,
  pixelate: TransitionTypeValue.Pixelate,
  ripple: TransitionTypeValue.Ripple,
  swirl: TransitionTypeValue.Swirl,
  glitch: TransitionTypeValue.Glitch,
  flash: TransitionTypeValue.Flash,
};

/** Transition direction */
export type TransitionDirection = 'left' | 'right' | 'up' | 'down';

/** Transition parameters */
export interface TransitionParams {
  /** Direction for directional transitions */
  direction?: TransitionDirection;
  /** Edge softness (0-1) */
  softness?: number;
  /** Color for color-based transitions */
  color?: string;
}

/** Transition definition */
export interface Transition {
  /** Unique identifier */
  id?: string;
  /** Transition type (engine-supported only) */
  type: TransitionType;
  /** Duration in seconds */
  duration: number;
  /** Easing function for progress */
  easing: EasingType;
  /** Additional parameters */
  params?: TransitionParams;
}

// -----------------------------------------------------------------------------
// Element Transition (元素间转场)
// -----------------------------------------------------------------------------

/** Placement mode for transitions between elements */
export type TransitionPlacement = 'overlap' | 'cut';

/** Transition between two adjacent elements */
export interface ElementTransition {
  /** Unique identifier */
  id: string;
  /** ID of the element before the transition */
  fromElementId: string;
  /** ID of the element after the transition */
  toElementId: string;
  /** Transition definition */
  transition: Transition;
  /** Placement mode */
  placement: TransitionPlacement;
}
