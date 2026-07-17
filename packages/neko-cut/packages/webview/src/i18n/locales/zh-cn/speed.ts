import type { MessageBundle } from '@neko/shared';

export const speed = {
  'speed.title': '速度控制',
  'speed.playbackSpeed': '播放速度',
  'speed.reverse': '倒放',
  'speed.preservePitch': '保持音调',
  'speed.pitchPreserved': '(音调不变)',
  'speed.pitchVaried': '(音调随速度变化)',
  'speed.originalDuration': '原始时长',
  'speed.adjustedDuration': '变速后时长',
  'speed.timeRemap': '时间重映射',
  'speed.enableTimeRemap': '启用时间重映射',
  'speed.reset': '重置',
  'speed.instructions.doubleClick': '双击添加关键帧',
  'speed.instructions.drag': '拖拽移动关键帧',
  'speed.instructions.steeper': '曲线越陡 = 速度越快',

  'speed.preset.quarterSpeed': '0.25x',
  'speed.preset.halfSpeed': '0.5x',
  'speed.preset.threeQuarterSpeed': '0.75x',
  'speed.preset.normalSpeed': '1x',
  'speed.preset.oneAndQuarterSpeed': '1.25x',
  'speed.preset.oneAndHalfSpeed': '1.5x',
  'speed.preset.doubleSpeed': '2x',
  'speed.preset.quadrupleSpeed': '4x',
} as const satisfies MessageBundle;
