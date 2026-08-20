import type { WorkspaceFileContentLocator } from '@neko/content';

export const WORKSPACE_ASSET_DIRECTORY = 'assets';

export interface WorkspaceAssetMaterializationRequest {
  readonly assetId: string;
}

export type WorkspaceAssetMaterializationDiagnosticCode =
  | 'asset-membership-missing'
  | 'asset-membership-removed'
  | 'asset-source-missing'
  | 'asset-source-unauthorized'
  | 'asset-source-unsupported'
  | 'workspace-target-unavailable'
  | 'workspace-copy-failed';

export type WorkspaceAssetMaterializationResult =
  | {
      readonly status: 'materialized';
      readonly assetId: string;
      readonly label: string;
      readonly contentLocator: WorkspaceFileContentLocator;
    }
  | {
      readonly status: 'unavailable';
      readonly assetId: string;
      readonly diagnostic: {
        readonly code: WorkspaceAssetMaterializationDiagnosticCode;
        readonly message: string;
      };
    };

export function assertWorkspaceAssetMaterializationRequest(
  value: WorkspaceAssetMaterializationRequest,
): void {
  if (value.assetId.length === 0 || value.assetId !== value.assetId.trim()) {
    throw new Error('Workspace Asset materialization requires an exact Asset identity.');
  }
}
