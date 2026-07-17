import type { MessageBundle } from '@neko/shared';

export const speed = {
  'speed.title': 'Speed Control',
  'speed.playbackSpeed': 'Playback Speed',
  'speed.reverse': 'Reverse',
  'speed.preservePitch': 'Preserve Pitch',
  'speed.pitchPreserved': '(pitch unchanged)',
  'speed.pitchVaried': '(pitch varies with speed)',
  'speed.originalDuration': 'Original duration',
  'speed.adjustedDuration': 'Adjusted duration',
  'speed.timeRemap': 'Time Remap',
  'speed.enableTimeRemap': 'Enable Time Remap',
  'speed.reset': 'Reset',
  'speed.instructions.doubleClick': 'Double-click to add keyframe',
  'speed.instructions.drag': 'Drag to move keyframe',
  'speed.instructions.steeper': 'Steeper curve = faster speed',

  'speed.preset.quarterSpeed': '0.25x',
  'speed.preset.halfSpeed': '0.5x',
  'speed.preset.threeQuarterSpeed': '0.75x',
  'speed.preset.normalSpeed': '1x',
  'speed.preset.oneAndQuarterSpeed': '1.25x',
  'speed.preset.oneAndHalfSpeed': '1.5x',
  'speed.preset.doubleSpeed': '2x',
  'speed.preset.quadrupleSpeed': '4x',
} as const satisfies MessageBundle;
