// =============================================================================
// NKC Format SDK — Codec
//
// High-level API for loading and saving .nkc canvas files.
// All functions are pure — no side effects.
// =============================================================================

import type { CanvasData } from '../types/canvas';
import type { ValidationResult } from './validator';
import { validateNkc } from './validator';

/** Result of loading an NKC file */
export interface NkcLoadResult {
  /** Parsed canvas data */
  data: CanvasData;
  /** Validation result */
  validation: ValidationResult;
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

  const validation = validateNkc(parsed);
  if (!isCanvasRoot(parsed)) {
    return {
      data: createEmptyCanvas(),
      validation,
    };
  }

  // Step 2: Return the parsed document unchanged. Invalid fields are reported locally.
  return {
    data: parsed,
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
    name: '',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [],
    connections: [],
  };
}

function isCanvasRoot(value: unknown): value is CanvasData {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)['name'] === 'string' &&
    Array.isArray((value as Record<string, unknown>)['nodes']) &&
    Array.isArray((value as Record<string, unknown>)['connections'])
  );
}
