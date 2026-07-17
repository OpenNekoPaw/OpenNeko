import type { BundleEntryLocator, MediaAssetStorageMode } from './bundle-locator';
import type { CharacterAssetDimension, CharacterAssetMediaKind } from './media-import';

// =============================================================================
// Project Asset Dependency Manifest
// =============================================================================

export type ProjectAssetDependencySourceKind = 'import' | 'market' | 'workspace';

export interface ProjectAssetDependencyBase {
  readonly id: string;
  readonly sourceKind: ProjectAssetDependencySourceKind;
  readonly mediaKind: CharacterAssetMediaKind;
  readonly dimensions: readonly CharacterAssetDimension[];
  readonly storageMode: MediaAssetStorageMode;
  readonly assetEntityId?: string;
  readonly variantId?: string;
}
export interface ProjectImportAssetDependency extends ProjectAssetDependencyBase {
  readonly sourceKind: 'import';
  /** Original import source, stored as relative path or ${VAR}/path when persisted. */
  readonly originalFile: string;
  readonly contentHash?: string;
  readonly importDestination?: string;
  readonly files?: readonly string[];
  readonly bundleEntries?: readonly BundleEntryLocator[];
}

export interface ProjectMarketAssetDependency extends ProjectAssetDependencyBase {
  readonly sourceKind: 'market';
  readonly packageId: string;
  readonly version?: string;
  readonly contentHash?: string;
}

export interface ProjectWorkspaceAssetDependency extends ProjectAssetDependencyBase {
  readonly sourceKind: 'workspace';
  readonly workspacePath: string;
  readonly contentHash?: string;
}

export type ProjectAssetDependency =
  | ProjectImportAssetDependency
  | ProjectMarketAssetDependency
  | ProjectWorkspaceAssetDependency;

export interface ProjectAssetDependencyManifest {
  readonly version: 1;
  readonly projectRoot?: string;
  readonly generatedAt: string;
  readonly dependencies: readonly ProjectAssetDependency[];
}
