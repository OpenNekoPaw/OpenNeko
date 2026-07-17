import type {
  EnvironmentPlacement,
  OPEN_PANORAMIC_IMAGE_COMMAND,
  OPEN_PANORAMIC_VIDEO_COMMAND,
  PANORAMIC_IMAGE_VIEW_TYPE,
  PANORAMIC_VIDEO_VIEW_TYPE,
  PanoramaViewState,
  PreviewManifest,
  PreviewVariant,
  PreviewVariantRequest,
  RegisterPreviewAssetRequest,
  UpdatePreviewAssetMetadataRequest,
} from '@neko/shared';

export interface PanoramicPreviewApi {
  registerPreviewAsset(request: RegisterPreviewAssetRequest): Promise<PreviewManifest>;
  requestPreviewVariant(assetId: string, request: PreviewVariantRequest): Promise<PreviewVariant>;
  updatePreviewAssetMetadata(
    assetId: string,
    request: UpdatePreviewAssetMetadataRequest,
  ): Promise<PreviewManifest>;
  unregisterPreviewAsset(assetIdOrToken: string): Promise<void>;
  openPanoramicPreview(sourceUri: string, kind?: 'image' | 'video'): Promise<void>;
  saveDefaultPanoramaView(assetId: string, viewState: PanoramaViewState): Promise<void>;
}

export interface PanoramicModelApi {
  useEnvironment(placement: EnvironmentPlacement): Promise<void>;
}

export interface PanoramicPreviewCommandBoundary {
  executeCommand<T>(command: string, ...args: readonly unknown[]): Promise<T>;
}

export {
  PANORAMIC_IMAGE_VIEW_TYPE,
  PANORAMIC_VIDEO_VIEW_TYPE,
  OPEN_PANORAMIC_IMAGE_COMMAND,
  OPEN_PANORAMIC_VIDEO_COMMAND,
} from '@neko/shared';
export const USE_AS_MODEL_ENVIRONMENT_COMMAND = 'neko.model.useEnvironment';
