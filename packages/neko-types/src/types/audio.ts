// =============================================================================
// Audio Properties (音频属性)
//
// Engine fields derived from EngineAudioProperties (generated from proto).
// UI extensions: volume/pan support AnimatableProperty, eq is UI-only.
// fadeInCurve/fadeOutCurve/gain are now engine fields (Phase 3).
// =============================================================================

import { EasingType } from './easing';
import type { EngineAudioProperties } from '../generated/timeline.engine';

/**
 * Audio properties — engine-aligned, pure scalar values.
 *
 * Engine fields (from EngineAudioProperties): volume, pan, muted, fadeIn, fadeOut,
 *   fadeInCurve, fadeOutCurve, gain
 * UI extension: eq (not in engine)
 *
 * Note: Omit fadeInCurve/fadeOutCurve because TS EasingType is a superset of
 * EngineEasingType (includes UI shorthand values 'bezier', 'ease-in', etc.)
 */
export interface AudioProperties extends Omit<
  EngineAudioProperties,
  'fadeInCurve' | 'fadeOutCurve'
> {
  /** Fade in easing curve (engine field, Phase 3) */
  fadeInCurve?: EasingType;
  /** Fade out easing curve (engine field, Phase 3) */
  fadeOutCurve?: EasingType;
  /** @ui-only Equalizer settings */
  eq?: {
    lowGain: number;
    midGain: number;
    highGain: number;
  };
}

/** Default audio properties */
export const DEFAULT_AUDIO_PROPERTIES: AudioProperties = {
  volume: 1,
  pan: 0,
  muted: false,
  fadeIn: 0,
  fadeOut: 0,
  fadeInCurve: 'linear',
  fadeOutCurve: 'linear',
  gain: 0,
};
