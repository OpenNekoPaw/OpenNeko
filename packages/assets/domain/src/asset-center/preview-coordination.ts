import type { ContentLocator } from '@neko/content-domain';
import type { PreviewMediaDescriptor } from '@neko/preview-domain';
import type { AuthorizedPreviewSessionProjection } from '@neko/preview-domain/authorized-session';
import type { AssetCenterSelectionProjection, AssetCenterSessionIdentity } from './contract';

export type AssetCenterPreviewAuthorizationResult =
  | { readonly status: 'ready'; readonly descriptor: PreviewMediaDescriptor }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: {
        readonly code: 'preview-unsupported-kind' | 'preview-source-unavailable';
        readonly message: string;
      };
    };

export interface AssetCenterContentAuthorizationPort {
  authorize(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly owner: AssetCenterSelectionProjection['owner'];
    readonly itemId: string;
    readonly contentLocator: ContentLocator;
  }): Promise<AssetCenterPreviewAuthorizationResult>;
}

export interface AssetCenterPreviewSessionPort {
  create(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly selection: AssetCenterSelectionProjection;
    readonly descriptor: PreviewMediaDescriptor;
  }): Promise<AuthorizedPreviewSessionProjection>;
  release(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly previewSessionId: string;
  }): Promise<void>;
}

export interface AssetCenterPreviewCoordinationPorts {
  readonly contentAuthorization: AssetCenterContentAuthorizationPort;
  readonly previewSessions: AssetCenterPreviewSessionPort;
}
