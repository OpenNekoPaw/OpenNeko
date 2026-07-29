import type {
  AssetIdentityCapability,
  CanvasPreviewRole,
  CanvasPreviewVariant,
  DelegateAction,
} from '@neko/shared';

export interface PreviewSourceDescriptor {
  id: string;
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
  requestId?: string;
  state?: 'playing' | 'paused';
  startTimeSeconds?: number;
  onTimeUpdate?: (event: PreviewPlaybackProgressEvent) => void;
  onEnded?: (event: PreviewPlaybackEndedEvent) => void;
}

export interface RuntimePreviewVariant extends CanvasPreviewVariant {
  runtimeUrl?: string;
  runtimeToken?: string;
}

export interface PreviewResolveRequest {
  source: PreviewSourceDescriptor;
  role?: CanvasPreviewRole;
}

export interface PreviewResolver {
  resolve(request: PreviewResolveRequest): Promise<RuntimePreviewVariant>;
  dispose?: () => void;
}

export interface PreviewRuntimeRecord {
  id: string;
  variant?: RuntimePreviewVariant;
  cleanup?: () => void;
}

export type PreviewPlaybackKind = 'audio' | 'video';

export interface PreviewPlaybackRecord {
  id: string;
  kind: PreviewPlaybackKind;
  stop: () => void;
}

export interface PreviewDelegateRequest {
  action: DelegateAction;
  asset?: AssetIdentityCapability;
}
