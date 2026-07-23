import type { MessageBundle } from '@neko/shared';

export const exportBundle = {
  'export.title': 'Export Video',
  'export.start': 'Start Export',
  'export.fps': 'Frame rate',
  'export.background': 'Background',
  'export.progress.title': 'Export Progress',
  'export.format': 'Format',
  'export.resolution': 'Resolution',
  'export.quality': 'Quality',
  'export.frameRate': 'Frame rate:',
  'export.processing': 'Processing...',
  'export.noMediaFound': 'No media elements found to export',
  'export.ffmpegNotice': 'FFmpeg needs to be loaded before exporting. This may take a moment.',
  'export.loadFFmpeg': 'Load FFmpeg',
  'export.loadingFFmpeg': 'Loading FFmpeg...',
  'export.extensionFFmpegReady': 'Using system FFmpeg for export',
  'export.resolutions.1080p': '1080p (1920x1080)',
  'export.resolutions.720p': '720p (1280x720)',
  'export.resolutions.480p': '480p (854x480)',
  'export.resolutions.360p': '360p (640x360)',

  'export.qualityOptions.high': 'High',
  'export.qualityOptions.medium': 'Medium',
  'export.qualityOptions.low': 'Low',

  'export.formats.mp4': 'MP4 (H.264)',
  'export.formats.webm': 'WebM (VP9)',
  'export.formats.gif': 'Animated GIF',
  'export.formats.pngSequence': 'PNG Sequence',
  'export.formats.jpegSequence': 'JPEG Sequence',
  'export.formats.webpSequence': 'WebP Sequence',

  'export.audioBitrate': 'Audio Bitrate',
  'export.preset.label': 'Preset',
  'export.preset.custom': 'Custom',
  'export.preset.builtin': 'Built-in',
  'export.preset.user': 'My Presets',

  'export.gifSettings.colors': 'Colors',
  'export.gifSettings.quality': 'Quality',
  'export.gifSettings.dither': 'Enable Dithering',

  'export.imageSettings.quality': 'Image Quality',
  'export.imageSettings.padding': 'Frame Number Padding',

  'export.errors.noProject': 'No project to export',
  'export.errors.ffmpegNotLoaded': 'FFmpeg is not loaded. Please load FFmpeg first.',
  'export.errors.exportFailed': 'Export failed: {error}',
  'export.errors.canvasError': 'Failed to create canvas for rendering',
  'export.errors.fileWriteError': 'Failed to write file',
  'export.errors.encodingError': 'Video encoding failed',

  'export.success.completed': 'Export completed successfully',
  'export.success.downloadStarted': 'Download started',

  'export.progress.saving': 'Saving file...',
} as const satisfies MessageBundle;
