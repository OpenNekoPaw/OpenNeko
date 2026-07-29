import type { MessageBundle } from '@neko/shared';

export const preview = {
  'preview.noProjectLoaded': '未加载项目',
  'preview.quality': '质量：',
  'preview.playing': '▶ 播放中',
  'preview.loading': '加载中 {name}...',
  'preview.loadFailed': '加载失败：{name}',
  'preview.muted': '已静音',
  'preview.qualityOptions.full': '完整',
  'preview.qualityOptions.high': '高',
  'preview.qualityOptions.medium': '中',
  'preview.qualityOptions.low': '低',

  'preview.resolution.label': '分辨率',
  'preview.resolution.720p': '720P (1280×720)',
  'preview.resolution.1080p': '1080P (1920×1080)',
  'preview.resolution.4k': '4K (3840×2160)',

  'preview.fps.30': '30 fps',
  'preview.fps.60': '60 fps',
  'preview.fps.label': '帧率',

  'preview.gpuInitFailed': 'GPU 渲染初始化失败',
  'preview.gpuRequired': '预览需要 GPU 渲染支持',
  'preview.loadingGpu': '加载 GPU 预览...',
  'preview.initializingGpu': '初始化 GPU...',
  'preview.rendering': '渲染中...',
} as const satisfies MessageBundle;
