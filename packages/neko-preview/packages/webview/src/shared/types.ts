/**
 * Preview message protocol types
 *
 * Defines the postMessage contract between Extension and Webview.
 */

import type { DocumentExtensionMessage, DocumentWebviewMessage } from './document-types';
import type {
  PanoramaCoverageAngle,
  PanoramaViewState,
  PreviewManifest,
  PreviewProjectionType,
  PreviewVariant,
  PreviewVariantRequest,
} from '@neko/shared';
import type {
  HtmlVideoDescriptor,
  HtmlVideoNativeCapabilities,
  PcmStreamDescriptor,
} from '@neko/media';

// =============================================================================
// Media Info (from Extension probe)
// =============================================================================

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  format: string;
  bitrate?: number;
  hasAudio: boolean;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  metadata?: Record<string, string>;
  coverArt?: { mimeType: string; dataBase64: string };
}

// =============================================================================
// Extension → Webview Messages
// =============================================================================

export interface PreviewInitMessage {
  type: 'preview:init';
  payload: {
    mediaInfo: MediaInfo;
    displayName: string;
  };
}

export interface PreviewPlaybackReadyMessage {
  type: 'preview:playbackReady';
  payload: {
    video?: HtmlVideoDescriptor;
    audio?: PcmStreamDescriptor;
    startTime: number;
    playbackRate: number;
  };
}

export interface PreviewFrameDataMessage {
  type: 'preview:frameData';
  payload: {
    imageDataUrl: string;
  };
}

export type PreviewOperation = 'captureFrame' | 'playback' | 'protocol';

export type PreviewOperationDiagnosticCode =
  | 'hardware-decoder-unavailable'
  | 'hardware-preview-unavailable'
  | 'hdr-poster-unavailable'
  | 'frame-capture-failed'
  | 'playback-failed'
  | 'protocol-failed';

export interface PreviewOperationFailedMessage {
  type: 'preview:operationFailed';
  payload: {
    operation: PreviewOperation;
    code: PreviewOperationDiagnosticCode;
  };
}

export interface PreviewWaveformMessage {
  type: 'preview:waveform';
  payload: {
    peaks: number[];
    duration: number;
    sampleRate: number;
  };
}

export interface PreviewLyricsMessage {
  type: 'preview:lyrics';
  payload: {
    lrcContent: string;
  };
}

export interface PanoramaInitMessage {
  type: 'panorama:init';
  payload: {
    manifest: PreviewManifest;
  };
}

export interface PanoramaVariantReadyMessage {
  type: 'panorama:variantReady';
  payload: {
    variant: PreviewVariant;
  };
}

export interface PanoramaErrorMessage {
  type: 'panorama:error';
  payload: {
    message: string;
  };
}

export type ExtensionMessage =
  | PreviewInitMessage
  | PreviewPlaybackReadyMessage
  | PreviewFrameDataMessage
  | PreviewOperationFailedMessage
  | PreviewWaveformMessage
  | PreviewLyricsMessage
  | PanoramaInitMessage
  | PanoramaVariantReadyMessage
  | PanoramaErrorMessage
  | DocumentExtensionMessage;

// =============================================================================
// Webview → Extension Messages
// =============================================================================

export interface ReadyMessage {
  type: 'ready';
  nativeVideoCapabilities?: HtmlVideoNativeCapabilities;
}

export interface PlayMessage {
  type: 'preview:play';
  startTime?: number;
  speed?: number;
}

export interface PauseMessage {
  type: 'preview:pause';
}

export interface ResumeMessage {
  type: 'preview:resume';
}

export interface StopMessage {
  type: 'preview:stop';
}

export interface SeekMessage {
  type: 'preview:seek';
  time: number;
  speed?: number;
}

export interface SpeedMessage {
  type: 'preview:speed';
  speed: number;
}

export interface StatusUpdateMessage {
  type: 'preview:statusUpdate';
  playbackState: 'playing' | 'paused' | 'stopped';
  currentTime: number;
}

export interface EofMessage {
  type: 'preview:eof';
}

export interface PanoramaConfirmProjectionMessage {
  type: 'panorama:confirmProjection';
  assetId: string;
  projectionType: PreviewProjectionType;
}

export interface PanoramaSaveDefaultViewMessage {
  type: 'panorama:saveDefaultView';
  assetId: string;
  viewState: PanoramaViewState;
}

export interface PanoramaUpdateAssetMessage {
  type: 'panorama:updateAsset';
  assetId: string;
  projectionType?: PreviewProjectionType;
  coverageAngle?: PanoramaCoverageAngle;
  defaultViewState?: PanoramaViewState;
}

export interface PanoramaRequestVariantMessage {
  type: 'panorama:requestVariant';
  assetId: string;
  request: PreviewVariantRequest;
}

export type WebviewMessage =
  | ReadyMessage
  | PlayMessage
  | PauseMessage
  | ResumeMessage
  | StopMessage
  | SeekMessage
  | SpeedMessage
  | StatusUpdateMessage
  | EofMessage
  | PanoramaConfirmProjectionMessage
  | PanoramaSaveDefaultViewMessage
  | PanoramaUpdateAssetMessage
  | PanoramaRequestVariantMessage
  | DocumentWebviewMessage;
