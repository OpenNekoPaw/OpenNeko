// =============================================================================
// NKV Format SDK — Validator
//
// Pure-function, zero-dependency validator for NKV project data.
// Produces field-path-based errors and warnings.
// =============================================================================

import type { ValidationResult, ValidationError } from '../config/config-adapter';
import type { ProjectData } from '../types/project';
import type { NkvValidateOptions } from './types';

// =============================================================================
// Type Guards (internal helpers)
// =============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

// =============================================================================
// Allowed values
// =============================================================================

const ALLOWED_TRACK_TYPES = new Set([
  'video',
  'audio',
  'text',
  'effect',
  'subtitle',
  'shape',
  'scene3d',
  'puppet',
  'media',
]);

const ALLOWED_ELEMENT_TYPES = new Set([
  'media',
  'audio',
  'text',
  'shape',
  'subtitle',
  'scene3d',
  'puppet',
]);

// =============================================================================
// Internal validators
// =============================================================================

function validateRoot(
  data: Record<string, unknown>,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  // version — required string
  if (!isString(data['version'])) {
    errors.push({ field: 'version', message: 'must be a string', severity: 'error' });
  }

  // name — required string
  if (!isString(data['name'])) {
    errors.push({ field: 'name', message: 'must be a string', severity: 'error' });
  }

  // resolution — required object with width/height positive integers
  const resolution = data['resolution'];
  if (!isRecord(resolution)) {
    errors.push({ field: 'resolution', message: 'must be an object', severity: 'error' });
  } else {
    if (
      !isNumber(resolution['width']) ||
      resolution['width'] <= 0 ||
      !Number.isInteger(resolution['width'])
    ) {
      errors.push({
        field: 'resolution.width',
        message: 'must be a positive integer',
        severity: 'error',
      });
    }
    if (
      !isNumber(resolution['height']) ||
      resolution['height'] <= 0 ||
      !Number.isInteger(resolution['height'])
    ) {
      errors.push({
        field: 'resolution.height',
        message: 'must be a positive integer',
        severity: 'error',
      });
    }
  }

  // fps — required positive number
  if (!isNumber(data['fps']) || data['fps'] <= 0) {
    errors.push({ field: 'fps', message: 'must be a positive number', severity: 'error' });
  } else if (data['fps'] < 1 || data['fps'] > 240) {
    warnings.push({
      field: 'fps',
      message: 'value outside suggested range (1-240)',
      severity: 'warning',
    });
  }

  // tracks — required array
  if (!isArray(data['tracks'])) {
    errors.push({ field: 'tracks', message: 'must be an array', severity: 'error' });
  }
}

function validateTrack(
  track: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
  options: NkvValidateOptions,
): void {
  if (!isRecord(track)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // id — required string
  if (!isString(track['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  // name — required string
  if (!isString(track['name'])) {
    errors.push({ field: `${path}.name`, message: 'must be a string', severity: 'error' });
  }

  // type — required, must be in allowed set
  if (!isString(track['type'])) {
    errors.push({ field: `${path}.type`, message: 'must be a string', severity: 'error' });
  } else if (!ALLOWED_TRACK_TYPES.has(track['type'])) {
    errors.push({
      field: `${path}.type`,
      message: `invalid track type: "${track['type']}"`,
      severity: 'error',
    });
  }

  // elements — required array
  if (!isArray(track['elements'])) {
    errors.push({ field: `${path}.elements`, message: 'must be an array', severity: 'error' });
  } else if (!options.skipElements) {
    const elements = track['elements'];
    for (let i = 0; i < elements.length; i++) {
      validateElement(elements[i], `${path}.elements[${i}]`, errors, warnings);
    }
  }

  // boolean fields — warn if missing, error if wrong type
  const boolFields = ['muted', 'locked', 'hidden', 'isMain'] as const;
  for (const field of boolFields) {
    const val = track[field];
    if (val === undefined) {
      warnings.push({
        field: `${path}.${field}`,
        message: 'missing optional boolean field',
        severity: 'warning',
      });
    } else if (!isBoolean(val)) {
      errors.push({ field: `${path}.${field}`, message: 'must be a boolean', severity: 'error' });
    }
  }
}

function validateElement(
  element: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (!isRecord(element)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // Base fields
  if (!isString(element['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }
  if (!isString(element['name'])) {
    errors.push({ field: `${path}.name`, message: 'must be a string', severity: 'error' });
  }
  if (!isString(element['type'])) {
    errors.push({ field: `${path}.type`, message: 'must be a string', severity: 'error' });
  } else if (!ALLOWED_ELEMENT_TYPES.has(element['type'])) {
    errors.push({
      field: `${path}.type`,
      message: `invalid element type: "${element['type']}"`,
      severity: 'error',
    });
  }

  // Numeric fields
  const numericFields = ['duration', 'startTime', 'trimStart', 'trimEnd', 'opacity'] as const;
  for (const field of numericFields) {
    const val = element[field];
    if (val === undefined) {
      warnings.push({
        field: `${path}.${field}`,
        message: 'missing optional numeric field',
        severity: 'warning',
      });
    } else if (!isNumber(val)) {
      errors.push({ field: `${path}.${field}`, message: 'must be a number', severity: 'error' });
    }
  }

  // Opacity range check
  if (isNumber(element['opacity']) && (element['opacity'] < 0 || element['opacity'] > 1)) {
    warnings.push({
      field: `${path}.opacity`,
      message: 'value outside suggested range (0-1)',
      severity: 'warning',
    });
  }

  // Boolean fields
  const boolFields = ['muted', 'hidden', 'locked'] as const;
  for (const field of boolFields) {
    const val = element[field];
    if (val !== undefined && !isBoolean(val)) {
      errors.push({ field: `${path}.${field}`, message: 'must be a boolean', severity: 'error' });
    }
  }

  // Transform
  if (element['transform'] !== undefined) {
    validateTransform(element['transform'], `${path}.transform`, errors, warnings);
  }

  // Effects
  if (element['effects'] !== undefined) {
    if (!isArray(element['effects'])) {
      errors.push({ field: `${path}.effects`, message: 'must be an array', severity: 'error' });
    } else {
      const effects = element['effects'];
      for (let i = 0; i < effects.length; i++) {
        validateEffectInstance(effects[i], `${path}.effects[${i}]`, errors);
      }
    }
  }

  // Audio properties (optional)
  if (element['audio'] !== undefined) {
    validateAudioProperties(element['audio'], `${path}.audio`, errors, warnings);
  }

  // Type-specific validation
  const elementType = element['type'];
  if (isString(elementType)) {
    validateTypeSpecificFields(element, elementType, path, errors);
  }
}

function validateTransform(
  transform: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (!isRecord(transform)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  const fields = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'anchorX', 'anchorY'] as const;
  for (const field of fields) {
    const val = transform[field];
    if (val === undefined) {
      warnings.push({
        field: `${path}.${field}`,
        message: 'missing transform field',
        severity: 'warning',
      });
    } else if (!isNumber(val)) {
      errors.push({ field: `${path}.${field}`, message: 'must be a number', severity: 'error' });
    }
  }
}

function validateAudioProperties(
  audio: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (!isRecord(audio)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // volume — number, suggested 0-2
  if (audio['volume'] !== undefined) {
    if (!isNumber(audio['volume'])) {
      errors.push({ field: `${path}.volume`, message: 'must be a number', severity: 'error' });
    } else if (audio['volume'] < 0 || audio['volume'] > 2) {
      warnings.push({
        field: `${path}.volume`,
        message: 'value outside suggested range (0-2)',
        severity: 'warning',
      });
    }
  }

  // pan — number, suggested -1 to 1
  if (audio['pan'] !== undefined) {
    if (!isNumber(audio['pan'])) {
      errors.push({ field: `${path}.pan`, message: 'must be a number', severity: 'error' });
    } else if (audio['pan'] < -1 || audio['pan'] > 1) {
      warnings.push({
        field: `${path}.pan`,
        message: 'value outside suggested range (-1 to 1)',
        severity: 'warning',
      });
    }
  }

  // fadeIn / fadeOut — non-negative numbers
  for (const field of ['fadeIn', 'fadeOut'] as const) {
    if (audio[field] !== undefined) {
      if (!isNumber(audio[field])) {
        errors.push({ field: `${path}.${field}`, message: 'must be a number', severity: 'error' });
      } else if ((audio[field] as number) < 0) {
        warnings.push({
          field: `${path}.${field}`,
          message: 'should be non-negative',
          severity: 'warning',
        });
      }
    }
  }
}

function validateEffectInstance(effect: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(effect)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  if (!isString(effect['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }
  if (!isString(effect['type'])) {
    errors.push({ field: `${path}.type`, message: 'must be a string', severity: 'error' });
  }
  if (!isBoolean(effect['enabled'])) {
    errors.push({ field: `${path}.enabled`, message: 'must be a boolean', severity: 'error' });
  }
  if (!isRecord(effect['parameters'])) {
    errors.push({ field: `${path}.parameters`, message: 'must be an object', severity: 'error' });
  }
  if (!isNumber(effect['order'])) {
    errors.push({ field: `${path}.order`, message: 'must be a number', severity: 'error' });
  }
}

function validateTypeSpecificFields(
  element: Record<string, unknown>,
  elementType: string,
  path: string,
  errors: ValidationError[],
): void {
  switch (elementType) {
    case 'media':
    case 'audio': {
      if (!isString(element['src'])) {
        errors.push({ field: `${path}.src`, message: 'must be a string', severity: 'error' });
      }
      break;
    }
    case 'text': {
      if (!isString(element['content'])) {
        errors.push({ field: `${path}.content`, message: 'must be a string', severity: 'error' });
      }
      if (element['fontSize'] !== undefined && !isNumber(element['fontSize'])) {
        errors.push({ field: `${path}.fontSize`, message: 'must be a number', severity: 'error' });
      }
      if (element['fontFamily'] !== undefined && !isString(element['fontFamily'])) {
        errors.push({
          field: `${path}.fontFamily`,
          message: 'must be a string',
          severity: 'error',
        });
      }
      if (element['color'] !== undefined && !isString(element['color'])) {
        errors.push({ field: `${path}.color`, message: 'must be a string', severity: 'error' });
      }
      break;
    }
    case 'shape': {
      if (!isString(element['shapeType'])) {
        errors.push({ field: `${path}.shapeType`, message: 'must be a string', severity: 'error' });
      }
      if (element['fill'] !== undefined && !isString(element['fill'])) {
        errors.push({ field: `${path}.fill`, message: 'must be a string', severity: 'error' });
      }
      if (element['stroke'] !== undefined && !isString(element['stroke'])) {
        errors.push({ field: `${path}.stroke`, message: 'must be a string', severity: 'error' });
      }
      break;
    }
    case 'subtitle': {
      if (!isString(element['text'])) {
        errors.push({ field: `${path}.text`, message: 'must be a string', severity: 'error' });
      }
      break;
    }
    case 'scene3d': {
      if (!isString(element['src'])) {
        errors.push({ field: `${path}.src`, message: 'must be a string', severity: 'error' });
      }
      break;
    }
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Validate raw unknown data as NKV format.
 *
 * Use this when loading from JSON.parse() result before casting to ProjectData.
 */
export function validateNkv(data: unknown, options: NkvValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!isRecord(data)) {
    return {
      valid: false,
      errors: [{ field: '', message: 'data must be an object', severity: 'error' }],
      warnings: [],
    };
  }

  validateRoot(data, errors, warnings);

  // Validate tracks if root tracks is an array
  const tracks = data['tracks'];
  if (isArray(tracks)) {
    for (let i = 0; i < tracks.length; i++) {
      validateTrack(tracks[i], `tracks[${i}]`, errors, warnings, options);
    }
  }

  const effectiveErrors = options.strict ? [...errors, ...warnings] : errors;

  return {
    valid: effectiveErrors.length === 0,
    errors: effectiveErrors.filter((e) => e.severity === 'error'),
    warnings: options.strict ? [] : warnings,
  };
}

/**
 * Validate a typed ProjectData object.
 *
 * Delegates to validateNkv by treating the typed object as unknown.
 */
export function validateNkvProject(
  project: ProjectData,
  options: NkvValidateOptions = {},
): ValidationResult {
  return validateNkv(project as unknown, options);
}
