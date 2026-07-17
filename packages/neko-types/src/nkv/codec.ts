// =============================================================================
// NKV Format SDK — Codec
//
// High-level API combining validator + migrator for loading and saving .nkv files.
// All functions are pure — no side effects.
// =============================================================================

import type { ProjectData } from '../types/project';
import type { NkvLoadResult, NkvSaveOptions } from './types';
import { CURRENT_NKV_VERSION } from './types';
import { validateNkv, validateNkvProject } from './validator';
import { detectNkvVersion, migrateNkv } from './migrator';

/**
 * Load and validate an NKV project from a JSON string.
 *
 * Pipeline:
 * 1. JSON.parse (catch SyntaxError -> error result)
 * 2. Validate structure
 * 3. If version != current, migrate then re-validate
 * 4. Return NkvLoadResult
 */
export function loadNkv(json: string): NkvLoadResult {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : 'Invalid JSON';
    return {
      project: createEmptyProject(),
      validation: {
        valid: false,
        errors: [{ field: '', message: `JSON parse error: ${message}`, severity: 'error' }],
        warnings: [],
      },
    };
  }

  // Step 2: Validate
  const initialValidation = validateNkv(parsed);

  // If structural errors prevent further processing, return early
  if (!initialValidation.valid && initialValidation.errors.length > 0) {
    // Check if the errors are too severe to attempt migration
    const hasCriticalErrors = initialValidation.errors.some(
      (e) => e.field === '' || e.field === 'tracks',
    );
    if (hasCriticalErrors) {
      return {
        project: createEmptyProject(),
        validation: initialValidation,
      };
    }
  }

  // Step 3: Migrate if needed
  const detectedVersion = detectNkvVersion(parsed);
  if (detectedVersion !== CURRENT_NKV_VERSION) {
    const migrationResult = migrateNkv(parsed);
    const postMigrationValidation = validateNkv(migrationResult.data as unknown);

    return {
      project: migrationResult.data,
      validation: postMigrationValidation,
      migration: migrationResult,
    };
  }

  // Step 4: Return result (current version, no migration needed)
  return {
    project: parsed as ProjectData,
    validation: initialValidation,
  };
}

/**
 * Serialize a ProjectData to JSON string.
 *
 * Optionally validates before saving. Throws if validation fails and validate=true.
 */
export function saveNkv(project: ProjectData, options: NkvSaveOptions = {}): string {
  const { validate = true, indent = 2 } = options;

  if (validate) {
    const result = validateNkvProject(project);
    if (!result.valid) {
      const errorMessages = result.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`NKV validation failed: ${errorMessages}`);
    }
  }

  return JSON.stringify(project, null, indent);
}

/**
 * Type guard: check whether unknown data is a valid ProjectData.
 */
export function isValidNkv(data: unknown): data is ProjectData {
  const result = validateNkv(data);
  return result.valid;
}

// =============================================================================
// Internal helper
// =============================================================================

function createEmptyProject(): ProjectData {
  return {
    version: CURRENT_NKV_VERSION,
    name: '',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [],
  };
}
