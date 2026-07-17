import type { MessageBundle } from '@neko/shared';

export const audio = {
  'audio.title': 'Audio',
  'audio.volume': 'Volume',
  'audio.pan': 'Pan',
  'audio.mute': 'Mute',
  'audio.unmute': 'Unmute',
  'audio.fadeIn': 'Fade In',
  'audio.fadeOut': 'Fade Out',
  'audio.gain': 'Gain',
  'audio.eq': 'Equalizer',
  'audio.lowFreq': 'Low',
  'audio.midFreq': 'Mid',
  'audio.highFreq': 'High',
  'audio.solo': 'Solo',
  'audio.master': 'Master',
  'audio.normalizeLoudness': 'Normalize Loudness',
  'audio.normalizing': 'Analyzing...',
} as const satisfies MessageBundle;
