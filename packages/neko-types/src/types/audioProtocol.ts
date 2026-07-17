// =============================================================================
// Audio Protocol DTOs — Webview ↔ Extension control plane
// =============================================================================

import type { EditOperation } from '../operations/types';
import type { AudioProjectData } from './audioProject';
import type { AudioEffectConfig } from './audioMix';

export type AudioTargetMode = 'single-file' | 'project';
export type AudioAnalysisKind = 'loudness' | 'silence';
export type AudioExportFormat = 'wav' | 'mp3' | 'flac' | 'ogg' | 'aac' | 'm4a' | 'opus';

export interface AudioRequestBase {
  type:
    | 'audio:playback'
    | 'audio:trim'
    | 'audio:effects'
    | 'audio:analyze'
    | 'audio:export'
    | 'audio:recording';
  requestId?: string;
  documentUri?: string;
  mode?: AudioTargetMode;
}

export interface AudioPlaybackRequestMessage extends AudioRequestBase {
  type: 'audio:playback';
  action: 'play' | 'pause' | 'resume' | 'stop' | 'seek' | 'setSpeed' | 'setLoop';
  startTime?: number;
  time?: number;
  speed?: number;
  loop?: boolean;
  streamId?: string;
}

export interface AudioTrimRequestMessage extends AudioRequestBase {
  type: 'audio:trim';
  startTime: number;
  endTime: number;
  outputPath?: string;
}

export interface AudioEffectsRequestMessage extends AudioRequestBase {
  type: 'audio:effects';
  effects: AudioEffectConfig[];
  outputPath?: string;
}

export interface AudioAnalyzeRequestMessage extends AudioRequestBase {
  type: 'audio:analyze';
  kind: AudioAnalysisKind;
}

export interface AudioExportRequestMessage extends AudioRequestBase {
  type: 'audio:export';
  outputPath?: string;
  format?: AudioExportFormat;
  codec?: string;
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
}

export interface AudioRecordingRequestMessage extends AudioRequestBase {
  type: 'audio:recording';
  action: 'listDevices' | 'start' | 'stop' | 'saveBlob';
  deviceId?: string;
  streamId?: string;
  outputPath?: string;
  format?: AudioExportFormat;
  data?: string;
  mimeType?: string;
}

export type AudioRequestMessage =
  | AudioPlaybackRequestMessage
  | AudioTrimRequestMessage
  | AudioEffectsRequestMessage
  | AudioAnalyzeRequestMessage
  | AudioExportRequestMessage
  | AudioRecordingRequestMessage;

export interface AudioResponseBase {
  type:
    | 'audio:init'
    | 'audio:waveform'
    | 'audio:playbackReady'
    | 'audio:playbackResult'
    | 'audio:trimResult'
    | 'audio:effectsResult'
    | 'audio:analysisResult'
    | 'audio:exportResult'
    | 'audio:recordingResult'
    | 'audio:error';
  requestId?: string;
  documentUri?: string;
  warnings?: string[];
}

export interface AudioInfoMessage {
  duration: number;
  codec: string;
  sampleRate: number;
  channels: number;
  bitrate?: number;
  format: string;
}

export interface WaveformDataMessage {
  /** Downmixed mono peaks kept for compatibility with older Webview callers. */
  peaks: number[];
  /** Optional per-channel peaks: channelPeaks[channel][sampleIndex]. */
  channelPeaks?: number[][];
  duration: number;
  sampleRate: number;
  channels?: number;
  peaksPerSecond?: number;
}

export interface AudioInitMessage extends AudioResponseBase {
  type: 'audio:init';
  filePath: string | null;
  fileName: string;
  audioInfo: AudioInfoMessage | null;
}

export interface AudioWaveformMessage extends AudioResponseBase {
  type: 'audio:waveform';
  waveform: WaveformDataMessage;
}

export interface AudioPlaybackReadyMessage extends AudioResponseBase {
  type: 'audio:playbackReady';
  streamId: string;
  wsUrl: string;
}

export interface AudioPlaybackResultMessage extends AudioResponseBase {
  type: 'audio:playbackResult';
  success: boolean;
  streamId?: string;
}

export interface AudioTrimResultMessage extends AudioResponseBase {
  type: 'audio:trimResult';
  success: boolean;
  outputPath?: string;
  error?: string;
}

export interface AudioEffectsResultMessage extends AudioResponseBase {
  type: 'audio:effectsResult';
  success: boolean;
  outputPath?: string;
  error?: string;
}

export interface AudioAnalysisResultMessage extends AudioResponseBase {
  type: 'audio:analysisResult';
  kind: AudioAnalysisKind;
  result: Record<string, unknown>;
}

export interface AudioExportResultMessage extends AudioResponseBase {
  type: 'audio:exportResult';
  success: boolean;
  outputPath?: string;
  error?: string;
}

export interface AudioRecordingResultMessage extends AudioResponseBase {
  type: 'audio:recordingResult';
  success: boolean;
  action: AudioRecordingRequestMessage['action'];
  devices?: Array<{
    id: string;
    name: string;
    sampleRates: number[];
    channels: number[];
    isDefault: boolean;
  }>;
  streamId?: string;
  monitorUrl?: string;
  outputPath?: string;
  durationSeconds?: number;
  error?: string;
}

export interface AudioErrorResponseMessage extends AudioResponseBase {
  type: 'audio:error';
  success: false;
  error: string;
}

export type AudioResponseMessage =
  | AudioInitMessage
  | AudioWaveformMessage
  | AudioPlaybackReadyMessage
  | AudioPlaybackResultMessage
  | AudioTrimResultMessage
  | AudioEffectsResultMessage
  | AudioAnalysisResultMessage
  | AudioExportResultMessage
  | AudioRecordingResultMessage
  | AudioErrorResponseMessage;

export interface ProjectSyncMessage {
  type: 'project:sync';
  documentUri?: string;
  projectData: AudioProjectData;
  operation?: EditOperation;
  reason?: 'agent-edit' | 'reload' | 'revert' | 'save' | 'external-change';
  warnings?: string[];
}
