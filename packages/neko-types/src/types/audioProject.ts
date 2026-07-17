// =============================================================================
// Audio Project Types — .nka file format
//
// Multi-track audio project. Reuses TimelineTrack from the timeline system.
// =============================================================================

import type { TimelineTrack } from './timelineTrack';
import type { AudioEffectSnapshot, AudioMarkerSnapshot } from '../operations/types';
import type { AudioEffectConfig } from './audioMix';
import type { AudioAutomationLane } from './audioAutomation';
import type { TempoMap } from './audioTempo';

/** Per-track mix state persisted in project (v2.1) */
export interface AudioTrackMixState {
  volume: number;
  pan: number;
  solo: boolean;
  effectChain: AudioEffectConfig[];
  /** Tick-based automation lanes persisted in project (v2.2) */
  automation?: AudioAutomationLane[];
}

/** Audio project data — .nka file format */
export interface AudioProjectData {
  version: string;
  name: string;
  /** Project sample rate (default 48000) */
  sampleRate: number;
  /** Project channels (default 2) */
  channels: number;
  /** Timeline tracks (reuses from neko-types) */
  tracks: TimelineTrack[];
  /** Master bus effects chain */
  masterEffectsChain: AudioEffectSnapshot[];
  /** Project-level markers */
  markers: AudioMarkerSnapshot[];
  /** Project tempo in BPM (v2.1) */
  bpm?: number;
  /** Beat-grid tempo map (v2.2 source of truth when present) */
  tempoMap?: TempoMap;
  /** Per-track mix state keyed by track ID (v2.1) */
  trackMix?: Record<string, AudioTrackMixState>;
  /** Master bus volume (v2.1, default 1.0) */
  masterVolume?: number;
}
