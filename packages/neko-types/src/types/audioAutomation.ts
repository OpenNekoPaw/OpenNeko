// =============================================================================
// Audio Automation Types — persisted tick-based lane contracts
// =============================================================================

export const AUDIO_AUTOMATION_CURVES = ['linear', 'hold', 'exponential'] as const;

export type AudioAutomationCurve = (typeof AUDIO_AUTOMATION_CURVES)[number];

export interface TrackVolumeAutomationTarget {
  kind: 'track-volume';
}

export interface TrackPanAutomationTarget {
  kind: 'track-pan';
}

export interface EffectParameterAutomationTarget {
  kind: 'effect-param';
  effectId: string;
  param: string;
}

export type AutomationTarget =
  TrackVolumeAutomationTarget | TrackPanAutomationTarget | EffectParameterAutomationTarget;

export interface AutomationPoint {
  /** Musical position in TempoMap PPQ ticks. */
  ticks: number;
  value: number;
  curve: AudioAutomationCurve;
}

export interface AudioAutomationLane {
  id: string;
  target: AutomationTarget;
  enabled: boolean;
  points: AutomationPoint[];
}
