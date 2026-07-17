/**
 * English translations for neko-tools webview
 */
import type { MessageBundle } from '@neko/shared';

const mediaDiff: MessageBundle = {
  'mediaDiff.cancel': 'Cancel',
  'mediaDiff.retry': 'Retry',
  'mediaDiff.identical': 'Identical',
  'mediaDiff.similarity': 'Similarity:',
  'mediaDiff.compareWith': 'Compare with:',
  'mediaDiff.cancelAnalysis': 'Cancel analysis',
  'mediaDiff.analyzing': 'Analyzing...',
  'mediaDiff.apply': 'Apply',
  'mediaDiff.reset': 'Reset',
  'mediaDiff.range': 'Range:',
  'mediaDiff.startTimeHint': 'Start time (e.g. 0:05.0 or 5)',
  'mediaDiff.endTimeHint': 'End time (e.g. 1:30.0 or 90)',
  'mediaDiff.applyRange': 'Re-analyze with selected time range',
  'mediaDiff.resetRange': 'Reset to full duration',
  'mediaDiff.zoom': 'Zoom',
  'mediaDiff.opacity': 'Opacity',
  // View modes
  'mediaDiff.viewMode.sideBySide': 'Side by Side',
  'mediaDiff.viewMode.slider': 'Slider',
  'mediaDiff.viewMode.overlay': 'Overlay',
  'mediaDiff.viewMode.onionSkin': 'Onion Skin',
  // Video frame labels
  'mediaDiff.previous': 'Previous',
  'mediaDiff.current': 'Current',
  'mediaDiff.differenceHeatmap': 'Difference Heatmap',
  'mediaDiff.webglNotAvailable': 'WebGL not available — using fallback view',
  // Video diff
  'mediaDiff.video.fetchingPrevious': 'Fetching previous version…',
  'mediaDiff.video.seek': 'Seek',
  'mediaDiff.video.analyzing': 'Analyzing video...',
  'mediaDiff.video.playTitle': 'Play video diff',
  'mediaDiff.video.streamError': 'Stream error: {error}',
  'mediaDiff.video.startingStreams': 'Starting video streams...',
  'mediaDiff.video.duration': 'Duration',
  'mediaDiff.video.resolution': 'Resolution',
  'mediaDiff.video.frameRate': 'Frame Rate',
  'mediaDiff.video.codec': 'Codec',
  'mediaDiff.video.keyframeSimilarities': 'Keyframe Similarities',
  // Audio diff
  'mediaDiff.audio.previous': 'Previous',
  'mediaDiff.audio.current': 'Current',
  'mediaDiff.audio.playPrevious': 'Previous',
  'mediaDiff.audio.playBoth': 'Both',
  'mediaDiff.audio.playCurrent': 'Current',
  'mediaDiff.audio.fetchingPrevious': 'Fetching previous version…',
  'mediaDiff.audio.seek': 'Seek',
  'mediaDiff.audio.loading': 'Loading audio files...',
  'mediaDiff.audio.zoom': 'Zoom: {level}x',
  'mediaDiff.audio.wheelHint': 'Ctrl+Wheel: zoom · Wheel: scroll',
  'mediaDiff.audio.duration': 'Duration',
  'mediaDiff.audio.sampleRate': 'Sample Rate',
  'mediaDiff.audio.channels': 'Channels',
  'mediaDiff.audio.mono': 'Mono',
  'mediaDiff.audio.stereo': 'Stereo',
  'mediaDiff.audio.bitrate': 'Bitrate',
  'mediaDiff.audio.silentRegions': 'Silent Regions Detected',
  'mediaDiff.audio.trackPrevious': 'A (Previous)',
  'mediaDiff.audio.trackCurrent': 'B (Current)',
  'mediaDiff.audio.trackDiff': 'Diff |A-B|',
  // Git
  'mediaDiff.loadGitHistory': 'Load Git History',
  'mediaDiff.flicker': 'Flicker: {version}',
};

const assetDiff: MessageBundle = {
  'assetDiff.title': 'Asset Variant Diff',
  'assetDiff.loading': 'Loading...',
  'assetDiff.analyzing': 'Analyzing...',
  'assetDiff.retry': 'Retry',
  'assetDiff.similar': 'Similar',
  'assetDiff.attributes': 'Attributes',
  'assetDiff.noChanges': 'No changes',
  'assetDiff.viewMode.sideBySide': 'Side by Side',
  'assetDiff.viewMode.slider': 'Slider',
  'assetDiff.viewMode.overlay': 'Overlay',
  'assetDiff.tabs.media': 'Media',
  'assetDiff.tabs.attributes': 'Attributes',
  'assetDiff.tabs.ai': 'AI Analysis',
  'assetDiff.aiAnalysis': 'AI Analysis',
  'assetDiff.requestAI': 'Generate AI Summary',
  'assetDiff.noFile': 'No preview file',
};

export const bundles: Record<string, MessageBundle> = {
  assetDiff,
  mediaDiff,
};
