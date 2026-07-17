// =============================================================================
// Keyframe Editor Types — Shared mini-timeline for puppet/model editors
//
// Used by the shared KeyframeTimeline component in @neko/shared/components.
// Both neko-puppet (2D parameter keyframes) and neko-model (3D bone/morph
// keyframes) consume these types through adapter components.
//
// Aligned with engine-kernel animation/keyframe.rs EasingType + InterpolationMode.
// =============================================================================

import type { EasingType, CubicBezierParams } from './easing';

// ── Keyframe Data ────────────────────────────────────────────────────────────

/** A single keyframe in the editor mini-timeline */
export interface EditorKeyframe {
  /** Unique identifier (UUID v4) */
  readonly id: string;
  /** Time position in milliseconds relative to clip start */
  timeMs: number;
  /** Parameter/property value at this keyframe */
  value: number;
  /** Easing function to the next keyframe */
  easing: EasingType;
  /** Custom bezier handles (only when easing === 'bezier') */
  bezierParams?: CubicBezierParams;
}

/** A keyframe track for a single parameter or property */
export interface EditorKeyframeTrack {
  /** Parameter name or property path (e.g., 'mouth_open', 'translation.x') */
  readonly property: string;
  /** Human-readable display label */
  readonly label: string;
  /** Value range minimum (for clamping and slider visualization) */
  readonly min: number;
  /** Value range maximum */
  readonly max: number;
  /** Default/neutral value */
  readonly defaultValue: number;
  /** Sorted keyframes (by timeMs ascending) */
  keyframes: EditorKeyframe[];
}

// ── Keyframe Operations (sent to engine) ─────────────────────────────────────

/** Type-safe editor keyframe CRUD operations */
export type EditorKeyframeOperation =
  | {
      readonly type: 'add';
      readonly trackProperty: string;
      readonly timeMs: number;
      readonly value: number;
      readonly easing?: EasingType;
    }
  | {
      readonly type: 'remove';
      readonly trackProperty: string;
      readonly keyframeId: string;
    }
  | {
      readonly type: 'update';
      readonly trackProperty: string;
      readonly keyframeId: string;
      readonly timeMs?: number;
      readonly value?: number;
      readonly easing?: EasingType;
    }
  | {
      readonly type: 'move';
      readonly trackProperty: string;
      readonly keyframeId: string;
      readonly newTimeMs: number;
    };

// ── Mini-Timeline State ──────────────────────────────────────────────────────

/** State of the embedded keyframe mini-timeline */
export interface MiniTimelineState {
  /** Active animation clip name (null if no clip selected) */
  readonly clipName: string | null;
  /** Total clip duration in milliseconds */
  durationMs: number;
  /** Current playhead position in milliseconds */
  currentTimeMs: number;
  /** All keyframe tracks */
  tracks: EditorKeyframeTrack[];
  /** Whether playback is active */
  isPlaying: boolean;
  /** Currently selected keyframe IDs */
  selectedKeyframeIds: ReadonlySet<string>;
}

// ── Engine Response Types (from Rust API) ────────────────────────────────────

/** Serialized keyframe info returned by engine API */
export interface KeyframeInfo {
  id: string;
  time_ms: number;
  value: number;
  easing: string;
}

/** Serialized parameter curve info (puppet) */
export interface ParameterCurveInfo {
  param_name: string;
  keyframes: KeyframeInfo[];
}

/** Serialized animation channel info (scene) */
export interface ChannelKeyframeInfo {
  target_node: string;
  property: string;
  keyframes: Array<{
    id: string;
    timestamp: number;
    values: number[];
    easing: string;
  }>;
}

/** Blend layer info returned by engine API */
export interface BlendLayerInfo {
  clip_name: string;
  elapsed_ms: number;
  weight: number;
  looping: boolean;
}

/** Scene blend layer info */
export interface SceneBlendLayerInfo {
  clip_name: string;
  current_time: number;
  weight: number;
  looping: boolean;
}
