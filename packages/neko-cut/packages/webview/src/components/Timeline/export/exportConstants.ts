/**
 * Export panel constants and type definitions.
 * Extracted from ExportPanel.tsx.
 */

export type ExportFormat = 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi' | 'ts';

export interface ExportProgress {
  stage:
    | 'initializing'
    | 'rendering'
    | 'encoding'
    | 'muxing'
    | 'finalizing'
    | 'completed'
    | 'error'
    | 'cancelled';
  percent: number;
  message?: string;
  currentFrame: number;
  totalFrames: number;
  elapsedTime: number;
  estimatedTimeRemaining: number;
  currentFps: number;
  performanceStats?: {
    avgDecodeTime?: number;
    avgRenderTime?: number;
    avgEncodeTime?: number;
    memoryUsedMB?: number;
    vramUsedMB?: number;
    cpuUsage?: number;
    gpuUsage?: number;
    pipelineMode?: boolean;
  };
}

export interface ExportPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RESOLUTIONS = [
  { label: '4K (3840x2160)', width: 3840, height: 2160 },
  { label: '2K (2560x1440)', width: 2560, height: 1440 },
  { label: '1080p (1920x1080)', width: 1920, height: 1080 },
  { label: '720p (1280x720)', width: 1280, height: 720 },
] as const;

export type Resolution = { label: string; width: number; height: number };

export const QUALITY_OPTIONS = [
  { label: '高', value: 'high' as const },
  { label: '中', value: 'medium' as const },
  { label: '低', value: 'low' as const },
];

export const FPS_OPTIONS = [24, 25, 30, 50, 60];

export const FORMAT_OPTIONS: Array<{ label: string; value: ExportFormat }> = [
  { label: 'MP4', value: 'mp4' },
  { label: 'WebM', value: 'webm' },
  { label: 'MOV', value: 'mov' },
  { label: 'MKV', value: 'mkv' },
  { label: 'AVI', value: 'avi' },
  { label: 'MPEG-TS', value: 'ts' },
];

export const VIDEO_CODEC_OPTIONS = [
  { label: 'H.264 (AVC)', value: 'h264' as const },
  { label: 'H.265 (HEVC)', value: 'h265' as const },
  { label: 'VP9', value: 'vp9' as const },
  { label: 'AV1', value: 'av1' as const },
  { label: 'ProRes', value: 'prores' as const },
];

export const AUDIO_CODEC_OPTIONS = [
  { label: 'AAC', value: 'aac' as const },
  { label: 'Opus', value: 'opus' as const },
  { label: 'MP3', value: 'mp3' as const },
  { label: 'FLAC', value: 'flac' as const },
  { label: 'Vorbis', value: 'vorbis' as const },
  { label: 'PCM', value: 'pcm' as const },
];

/** Container → compatible video codecs (from Rust codec_ext.rs) */
export const CONTAINER_VIDEO_CODECS: Record<string, string[]> = {
  mp4: ['h264', 'h265', 'av1', 'prores'],
  mov: ['h264', 'h265', 'av1', 'prores'],
  webm: ['vp9', 'av1'],
  mkv: ['h264', 'h265', 'vp9', 'av1', 'prores'],
  avi: ['h264', 'h265'],
  ts: ['h264', 'h265'],
};

/** Container → compatible audio codecs */
export const CONTAINER_AUDIO_CODECS: Record<string, string[]> = {
  mp4: ['aac', 'mp3', 'flac'],
  mov: ['aac', 'mp3', 'flac', 'pcm'],
  webm: ['opus', 'vorbis'],
  mkv: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm'],
  avi: ['mp3', 'aac'],
  ts: ['aac', 'mp3'],
};

/** Container → default codecs */
export const DEFAULT_CODECS: Record<string, { video: string; audio: string }> = {
  mp4: { video: 'h264', audio: 'aac' },
  mov: { video: 'h264', audio: 'aac' },
  webm: { video: 'vp9', audio: 'opus' },
  mkv: { video: 'h264', audio: 'aac' },
  avi: { video: 'h264', audio: 'mp3' },
  ts: { video: 'h264', audio: 'aac' },
};
