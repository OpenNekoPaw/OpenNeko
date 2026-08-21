import type { ContentLocator } from '@neko/content';
import type {
  AssetIdentityCapability,
  CanvasPreviewRole,
  CanvasPreviewVariant,
  DelegateAction,
} from '@neko/canvas-domain';

export interface PreviewSourceDescriptor {
  id: string;
  nodeId?: string;
  outputId?: string;
  contentLocator?: ContentLocator;
  /** Content freshness only; never used as durable identity or persisted location. */
  sourceFingerprint?: string;
  asset?: AssetIdentityCapability;
  role: CanvasPreviewRole;
  variants?: CanvasPreviewVariant[];
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface PreviewPlaybackProgressEvent {
  sourceId: string;
  currentTime: number;
  duration: number;
}

export interface PreviewPlaybackEndedEvent extends PreviewPlaybackProgressEvent {
  mediaType: PreviewPlaybackKind;
}

export interface PreviewPlaybackControl {
  requestId: string;
  state: 'playing' | 'paused' | 'stopped';
  startTimeSeconds?: number;
  onTimeUpdate?: (event: PreviewPlaybackProgressEvent) => void;
  onEnded?: (event: PreviewPlaybackEndedEvent) => void;
}

export type PreviewPlaybackKind = 'audio' | 'video';

export interface PreviewDelegateRequest {
  action: DelegateAction;
  asset?: AssetIdentityCapability;
}
