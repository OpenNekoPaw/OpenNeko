import type { MessageBundle } from '@neko/shared';

export const exportBundle = {
  'export.title': '导出视频',
  'export.start': '开始导出',
  'export.fps': '帧率',
  'export.background': '后台运行',
  'export.progress.title': '导出进度',
  'export.format': '格式',
  'export.resolution': '分辨率',
  'export.quality': '质量',
  'export.frameRate': '帧率：',
  'export.processing': '处理中...',
  'export.noMediaFound': '未找到可导出的媒体元素',
  'export.ffmpegNotice': '导出前需要加载 FFmpeg，可能需要一些时间。',
  'export.loadFFmpeg': '加载 FFmpeg',
  'export.loadingFFmpeg': '正在加载 FFmpeg...',
  'export.extensionFFmpegReady': '使用系统 FFmpeg 进行导出',
  'export.resolutions.1080p': '1080p (1920x1080)',
  'export.resolutions.720p': '720p (1280x720)',
  'export.resolutions.480p': '480p (854x480)',
  'export.resolutions.360p': '360p (640x360)',

  'export.qualityOptions.high': '高',
  'export.qualityOptions.medium': '中',
  'export.qualityOptions.low': '低',

  'export.formats.mp4': 'MP4 (H.264)',
  'export.formats.webm': 'WebM (VP9)',
  'export.formats.gif': '动态 GIF',
  'export.formats.pngSequence': 'PNG 序列',
  'export.formats.jpegSequence': 'JPEG 序列',
  'export.formats.webpSequence': 'WebP 序列',

  'export.audioBitrate': '音频比特率',
  'export.preset.label': '预设',
  'export.preset.custom': '自定义',
  'export.preset.builtin': '内置预设',
  'export.preset.user': '我的预设',

  'export.gifSettings.colors': '颜色数',
  'export.gifSettings.quality': '质量',
  'export.gifSettings.dither': '启用抖动',

  'export.imageSettings.quality': '图像质量',
  'export.imageSettings.padding': '帧编号填充',

  'export.errors.noProject': '没有可导出的项目',
  'export.errors.ffmpegNotLoaded': 'FFmpeg 尚未加载，请先加载 FFmpeg。',
  'export.errors.exportFailed': '导出失败：{error}',
  'export.errors.canvasError': '创建渲染画布失败',
  'export.errors.fileWriteError': '文件写入失败',
  'export.errors.encodingError': '视频编码失败',

  'export.success.completed': '导出成功完成',
  'export.success.downloadStarted': '下载已开始',

  'export.progress.saving': '正在保存文件...',
} as const satisfies MessageBundle;
