import type { MessageBundle } from '@neko/shared';

export const preview = {
  'preview.noProjectLoaded': 'No project loaded',
  'preview.quality': 'Quality:',
  'preview.playing': '▶ Playing',
  'preview.loading': 'Loading {name}...',
  'preview.loadFailed': 'Failed to load: {name}',
  'preview.muted': 'Muted',
  'preview.qualityOptions.full': 'Full',
  'preview.qualityOptions.high': 'High',
  'preview.qualityOptions.medium': 'Medium',
  'preview.qualityOptions.low': 'Low',

  'preview.resolution.label': 'Resolution',
  'preview.resolution.720p': '720P (1280×720)',
  'preview.resolution.1080p': '1080P (1920×1080)',
  'preview.resolution.4k': '4K (3840×2160)',

  'preview.fps.30': '30 fps',
  'preview.fps.60': '60 fps',
  'preview.fps.label': 'Frame Rate',

  'preview.gpuInitFailed': 'Failed to initialize GPU rendering',
  'preview.gpuRequired': 'GPU rendering is required for preview',
  'preview.loadingGpu': 'Loading GPU preview...',
  'preview.initializingGpu': 'Initializing GPU...',
  'preview.rendering': 'Rendering...',
} as const satisfies MessageBundle;
