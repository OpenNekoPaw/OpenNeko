import type {
  PreviewManifest,
  PreviewVariant,
  PreviewVariantRequest,
  RegisterPreviewAssetRequest,
  UpdatePreviewAssetMetadataRequest,
} from '@neko/shared';

export interface MediaInfo {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly codec: string;
  readonly format: string;
  readonly bitrate?: number;
  readonly hasAudio: boolean;
  readonly audioCodec?: string;
  readonly audioSampleRate?: number;
  readonly audioChannels?: number;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly coverArt?: { readonly mimeType: string; readonly dataBase64: string };
}

export interface NekoPreviewAPI {
  readonly isAvailable: boolean;
  probeMedia(filePath: string): Promise<MediaInfo>;
  captureFrame(filePath: string, time: number, quality?: number): Promise<string>;
  registerPreviewAsset(request: RegisterPreviewAssetRequest): Promise<PreviewManifest>;
  requestPreviewVariant(assetId: string, request: PreviewVariantRequest): Promise<PreviewVariant>;
  updatePreviewAssetMetadata(
    assetId: string,
    request: UpdatePreviewAssetMetadataRequest,
  ): Promise<PreviewManifest>;
  unregisterPreviewAsset(assetIdOrToken: string): Promise<void>;
}
