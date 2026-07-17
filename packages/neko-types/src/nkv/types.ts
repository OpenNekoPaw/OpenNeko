// =============================================================================
// NKV Format SDK — Types
//
// SDK-specific types for loading, saving, validating, and migrating .nkv files.
// Reuses ValidationResult/ValidationError from config-adapter to avoid duplication.
// =============================================================================

import type { ValidationResult, ValidationError } from '../config/config-adapter';
import type { ProjectData } from '../types/project';

export type { ValidationResult, ValidationError };

/** Supported NKV format versions */
export type NkvVersion = '1.0' | '2.0';

/** Current NKV format version */
export const CURRENT_NKV_VERSION: NkvVersion = '2.0';

/** Options for NKV validation */
export interface NkvValidateOptions {
  /** When true, treat warnings as errors */
  strict?: boolean;
  /** When true, skip element-level validation */
  skipElements?: boolean;
}

/** Result of a version migration */
export interface MigrationResult {
  /** Migrated project data */
  data: ProjectData;
  /** Version before migration */
  fromVersion: NkvVersion;
  /** Version after migration */
  toVersion: NkvVersion;
  /** List of applied migration step descriptions */
  appliedMigrations: string[];
  /** Non-blocking warnings encountered during migration */
  warnings: string[];
}

/** Result of loading an NKV file */
export interface NkvLoadResult {
  /** Parsed and optionally migrated project data */
  project: ProjectData;
  /** Validation result */
  validation: ValidationResult;
  /** Migration result, present only if migration was applied */
  migration?: MigrationResult;
}

/** Options for saving an NKV file */
export interface NkvSaveOptions {
  /** Whether to validate before saving (default: true) */
  validate?: boolean;
  /** JSON indentation (default: 2) */
  indent?: number;
}
