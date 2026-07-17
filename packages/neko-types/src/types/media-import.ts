import type { BundleEntryLocator, MediaAssetStorageMode } from './bundle-locator';
import type { PathVariableMap } from '../path';

// =============================================================================
// Unified Media Import Contracts
// =============================================================================

export type CharacterAssetDimension = 'model' | 'motion' | 'config' | 'audio' | 'text';

export type CharacterAssetMediaKind =
  | 'puppet-model'
  | 'puppet-motion'
  | 'puppet-config'
  | 'model-3d'
  | 'model-motion'
  | 'model-config'
  | 'voice-pack'
  | 'character-pack';

export interface ImportedAssetDescriptor {
  readonly dimension: CharacterAssetDimension;
  readonly mediaKind: CharacterAssetMediaKind;
  readonly storageMode: MediaAssetStorageMode;
  /** Runtime path when storageMode resolves to a project/workspace file. */
  readonly path?: string;
  /** Bundle entry metadata when storageMode is bundle-memory. */
  readonly locator?: BundleEntryLocator;
  readonly sourceHash?: string;
  readonly metadata?: Record<string, unknown>;
}
export interface ImportPlanInput {
  readonly sourcePath: string;
  readonly documentPath?: string;
  readonly owningWorkspaceRoot?: string;
  readonly workspaceFolderPaths: readonly string[];
  readonly pathVariables?: PathVariableMap | ReadonlyMap<string, string>;
}

export type ImportPlan =
  | {
      readonly action: 'useSource';
      readonly sourcePath: string;
      readonly projectRef: string;
    }
  | {
      readonly action: 'promote';
      readonly sourcePath: string;
      readonly targetPath: string;
      readonly targetDir: string;
      readonly projectRef: string;
    }
  | {
      readonly action: 'bundle-memory';
      readonly sourcePath: string;
      readonly bundlePath: string;
      readonly projectRef: string;
    }
  | {
      readonly action: 'extract-promote';
      readonly sourcePath: string;
      readonly targetDir: string;
      readonly projectRef: string;
    };

export interface ImportValidation {
  readonly supported: boolean;
  readonly reason?: string;
  readonly detectedMediaKind?: CharacterAssetMediaKind;
}

export interface ImportResult {
  readonly projectFilePath: string;
  readonly importedAssets: readonly ImportedAssetDescriptor[];
  readonly openEditorUri?: string;
  readonly diagnostics?: readonly string[];
}

/**
 * Domain packages implement this contract; host layers own filesystem, VSCode,
 * dialog, ZIP, and command orchestration.
 */
export interface ImportHandler {
  readonly id: string;
  readonly supportedExtensions: readonly string[];
  validateFormat(filePath: string): ImportValidation;
  planImport(input: ImportPlanInput): ImportPlan;
  executeImport(plan: ImportPlan): Promise<ImportResult>;
}
