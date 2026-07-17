/**
 * Asset Health Check Types
 *
 * Types for file accessibility checking and health monitoring.
 * Follows the MetadataExtractor injection pattern — the core library
 * defines the function type, the extension layer provides the implementation.
 */

import type { AssetFileStatus } from '@neko/shared';

/**
 * Check if a file is accessible at the given path.
 * Injected into core library from extension host.
 */
export type FileAccessChecker = (filePath: string) => Promise<AssetFileStatus>;

/** Result of a file health check */
export interface FileHealthResult {
  /** File ID */
  fileId: string;
  /** Parent variant ID */
  variantId: string;
  /** Parent entity ID */
  entityId: string;
  /** Entity display name */
  entityName: string;
  /** File path that was checked */
  path: string;
  /** Determined status */
  status: AssetFileStatus;
  /** Status before this check */
  previousStatus?: AssetFileStatus;
}

/** Progress callback for batch validation */
export type HealthCheckProgress = (checked: number, total: number) => void;

/** Path variable map: re-exported from @neko/shared */
export type { PathVariableMap } from '@neko/shared';
