import type { MessageBundle } from '@neko/shared';

export const audio = {
  'audio.title': '音频',
  'audio.volume': '音量',
  'audio.pan': '声道平衡',
  'audio.mute': '静音',
  'audio.unmute': '取消静音',
  'audio.fadeIn': '淡入',
  'audio.fadeOut': '淡出',
  'audio.gain': '增益',
  'audio.eq': '均衡器',
  'audio.lowFreq': '低频',
  'audio.midFreq': '中频',
  'audio.highFreq': '高频',
  'audio.solo': '独奏',
  'audio.master': '主音量',
  'audio.normalizeLoudness': '标准化响度',
  'audio.normalizing': '分析中...',
} as const satisfies MessageBundle;
