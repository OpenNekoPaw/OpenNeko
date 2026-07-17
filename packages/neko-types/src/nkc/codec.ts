// =============================================================================
// NKC Format SDK — Codec
//
// High-level API for loading and saving .nkc canvas files.
// All functions are pure — no side effects.
// =============================================================================

import type { CanvasData } from '../types/canvas';
import type { ValidationResult } from '../config/config-adapter';
import { CURRENT_NKC_VERSION, migrateNkc, type NkcMigrationResult } from './migrator';
import { validateNkc } from './validator';

/** Result of loading an NKC file */
export interface NkcLoadResult {
  /** Parsed canvas data */
  data: CanvasData;
  /** Validation result */
  validation: ValidationResult;
  /** Migration result, when a loaded canvas was upgraded in memory. */
  migration?: NkcMigrationResult;
}

/** Options for saving an NKC file */
export interface NkcSaveOptions {
  /** Whether to validate before saving (default: true) */
  validate?: boolean;
  /** JSON indentation (default: 2) */
  indent?: number;
}

/**
 * Load and validate an NKC canvas from a JSON string.
 *
 * Pipeline:
 * 1. JSON.parse (catch SyntaxError -> error result)
 * 2. Validate structure
 * 3. Return NkcLoadResult
 */
export function loadNkc(json: string): NkcLoadResult {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : 'Invalid JSON';
    return {
      data: createEmptyCanvas(),
      validation: {
        valid: false,
        errors: [{ field: '', message: `JSON parse error: ${message}`, severity: 'error' }],
        warnings: [],
      },
    };
  }

  // Step 2: Validate
  const validation = validateNkc(parsed);

  if (!validation.valid && validation.errors.length > 0) {
    const hasCriticalErrors = validation.errors.some(
      (e) => e.field === '' || e.field === 'nodes' || e.field === 'connections',
    );
    if (hasCriticalErrors) {
      return {
        data: createEmptyCanvas(),
        validation,
      };
    }
  }

  const migration = migrateNkc(parsed as CanvasData);
  if (migration.migrated) {
    const postMigrationValidation = validateNkc(migration.data as unknown);
    return {
      data: migration.data,
      validation: postMigrationValidation,
      migration,
    };
  }

  // Step 3: Return result
  return {
    data: parsed as CanvasData,
    validation,
  };
}

/**
 * Serialize a CanvasData to JSON string.
 *
 * Optionally validates before saving. Throws if validation fails and validate=true.
 */
export function saveNkc(data: CanvasData, options: NkcSaveOptions = {}): string {
  const { validate = true, indent = 2 } = options;

  if (validate) {
    const result = validateNkc(data as unknown);
    if (!result.valid) {
      const errorMessages = result.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`NKC validation failed: ${errorMessages}`);
    }
  }

  return JSON.stringify(data, null, indent);
}

/**
 * Type guard: check whether unknown data is a valid CanvasData.
 */
export function isValidNkc(data: unknown): data is CanvasData {
  const result = validateNkc(data);
  return result.valid;
}

// =============================================================================
// Internal helper
// =============================================================================

function createEmptyCanvas(): CanvasData {
  return {
    version: CURRENT_NKC_VERSION,
    name: '',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [],
    connections: [],
  };
}
