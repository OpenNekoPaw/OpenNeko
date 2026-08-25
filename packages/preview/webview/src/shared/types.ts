/**
 * Preview message protocol types
 *
 * Defines the message contract between the Desktop host and Webview.
 */

import type { DocumentHostMessage, DocumentWebviewMessage } from './document-types';
import type {
  PanoramaCoverageAngle,
  PanoramaViewState,
  PreviewManifest,
  PreviewProjectionType,
  PreviewVariant,
  PreviewVariantRequest,
} from '@neko/preview-domain';
import type { HtmlVideoNativeCapabilities } from '@neko/media';

// =============================================================================
// Desktop host → Webview messages
// =============================================================================

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

export type HostMessage =
  PanoramaInitMessage | PanoramaVariantReadyMessage | PanoramaErrorMessage | DocumentHostMessage;

// =============================================================================
// Webview → Desktop host messages
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
