// =============================================================================
// NKA Format SDK — Validator
//
// Pure-function, zero-dependency validator for NKA audio project data.
// Produces field-path-based errors and warnings.
// =============================================================================

import type { ValidationResult, ValidationError } from '../config/config-adapter';
import { isEngineAudioEffectType, isKnownAudioEffectType } from '../types/audioMix';
import type { AudioEffectConfig } from '../types/audioMix';
import { getAudioEffectParameterMetadata } from '../types/audioEffectParams';

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
// Allowed values (reuse NKV track types for audio tracks)
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
// Validate options
// =============================================================================

export interface NkaValidateOptions {
  /** When true, treat warnings as errors */
  strict?: boolean;
  /** When true, skip element-level validation within tracks */
  skipElements?: boolean;
}

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

  // sampleRate — required positive number
  if (!isNumber(data['sampleRate']) || data['sampleRate'] <= 0) {
    errors.push({ field: 'sampleRate', message: 'must be a positive number', severity: 'error' });
  } else if (
    data['sampleRate'] !== 44100 &&
    data['sampleRate'] !== 48000 &&
    data['sampleRate'] !== 96000
  ) {
    warnings.push({
      field: 'sampleRate',
      message: 'uncommon sample rate (expected 44100, 48000, or 96000)',
      severity: 'warning',
    });
  }

  // channels — required positive integer
  if (!isNumber(data['channels']) || data['channels'] <= 0 || !Number.isInteger(data['channels'])) {
    errors.push({ field: 'channels', message: 'must be a positive integer', severity: 'error' });
  }

  // tracks — required array
  if (!isArray(data['tracks'])) {
    errors.push({ field: 'tracks', message: 'must be an array', severity: 'error' });
  }

  // masterEffectsChain — required array
  if (!isArray(data['masterEffectsChain'])) {
    errors.push({ field: 'masterEffectsChain', message: 'must be an array', severity: 'error' });
  }

  // markers — required array
  if (!isArray(data['markers'])) {
    errors.push({ field: 'markers', message: 'must be an array', severity: 'error' });
  }

  if (data['bpm'] !== undefined) {
    if (!isNumber(data['bpm'])) {
      errors.push({ field: 'bpm', message: 'must be a number', severity: 'error' });
    } else if (data['bpm'] < 20 || data['bpm'] > 300) {
      errors.push({ field: 'bpm', message: 'must be between 20 and 300', severity: 'error' });
    }
  }

  if (data['masterVolume'] !== undefined) {
    if (!isNumber(data['masterVolume'])) {
      errors.push({ field: 'masterVolume', message: 'must be a number', severity: 'error' });
    } else if (data['masterVolume'] < 0 || data['masterVolume'] > 2) {
      errors.push({
        field: 'masterVolume',
        message: 'must be between 0 and 2',
        severity: 'error',
      });
    }
  }

  if (data['tempoMap'] !== undefined) {
    validateTempoMap(data['tempoMap'], 'tempoMap', errors);
  }
}

function validateTrack(
  track: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
  options: NkaValidateOptions,
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

  // Boolean fields
  const boolFields = ['muted', 'hidden', 'locked'] as const;
  for (const field of boolFields) {
    const val = element[field];
    if (val !== undefined && !isBoolean(val)) {
      errors.push({ field: `${path}.${field}`, message: 'must be a boolean', severity: 'error' });
    }
  }
}

function validateEffect(effect: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(effect)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // id — required string
  if (!isString(effect['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  // type — required string
  if (!isString(effect['type'])) {
    errors.push({ field: `${path}.type`, message: 'must be a string', severity: 'error' });
  } else if (!isKnownAudioEffectType(effect['type'])) {
    errors.push({
      field: `${path}.type`,
      message: `invalid audio effect type: "${effect['type']}"`,
      severity: 'error',
    });
  }

  // name — required string
  if (!isString(effect['name'])) {
    errors.push({ field: `${path}.name`, message: 'must be a string', severity: 'error' });
  }

  // enabled — required boolean
  if (!isBoolean(effect['enabled'])) {
    errors.push({ field: `${path}.enabled`, message: 'must be a boolean', severity: 'error' });
  }

  // params — required object
  if (!isRecord(effect['params'])) {
    errors.push({ field: `${path}.params`, message: 'must be an object', severity: 'error' });
  }
}

function validateMixEffect(effect: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(effect)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  if (!isString(effect['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  if (!isString(effect['effectType'])) {
    errors.push({ field: `${path}.effectType`, message: 'must be a string', severity: 'error' });
  } else if (!isEngineAudioEffectType(effect['effectType'])) {
    errors.push({
      field: `${path}.effectType`,
      message: `invalid renderable effect type: "${effect['effectType']}"`,
      severity: 'error',
    });
  }

  if (!isBoolean(effect['enabled'])) {
    errors.push({ field: `${path}.enabled`, message: 'must be a boolean', severity: 'error' });
  }

  if (!isRecord(effect['params'])) {
    errors.push({ field: `${path}.params`, message: 'must be an object', severity: 'error' });
  }
}

function validateTrackMix(data: Record<string, unknown>, errors: ValidationError[]): void {
  const trackMix = data['trackMix'];
  if (trackMix === undefined) {
    return;
  }

  if (!isRecord(trackMix)) {
    errors.push({ field: 'trackMix', message: 'must be an object', severity: 'error' });
    return;
  }

  for (const [trackId, state] of Object.entries(trackMix)) {
    const statePath = `trackMix.${trackId}`;
    if (!isRecord(state)) {
      errors.push({ field: statePath, message: 'must be an object', severity: 'error' });
      continue;
    }

    if (!isNumber(state['volume'])) {
      errors.push({ field: `${statePath}.volume`, message: 'must be a number', severity: 'error' });
    } else if (state['volume'] < 0 || state['volume'] > 2) {
      errors.push({
        field: `${statePath}.volume`,
        message: 'must be between 0 and 2',
        severity: 'error',
      });
    }

    if (!isNumber(state['pan'])) {
      errors.push({ field: `${statePath}.pan`, message: 'must be a number', severity: 'error' });
    } else if (state['pan'] < -1 || state['pan'] > 1) {
      errors.push({
        field: `${statePath}.pan`,
        message: 'must be between -1 and 1',
        severity: 'error',
      });
    }

    if (!isBoolean(state['solo'])) {
      errors.push({ field: `${statePath}.solo`, message: 'must be a boolean', severity: 'error' });
    }

    if (!isArray(state['effectChain'])) {
      errors.push({
        field: `${statePath}.effectChain`,
        message: 'must be an array',
        severity: 'error',
      });
      continue;
    }

    const effectChain = state['effectChain'];
    for (let i = 0; i < effectChain.length; i++) {
      validateMixEffect(effectChain[i], `${statePath}.effectChain[${i}]`, errors);
    }

    if (state['automation'] !== undefined) {
      validateAutomationLanes(
        state['automation'],
        `${statePath}.automation`,
        effectChain.filter(isAudioEffectConfigLike),
        errors,
      );
    }
  }
}

function validateTempoMap(value: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(value)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  if (!isNumber(value['ppq']) || value['ppq'] <= 0 || !Number.isInteger(value['ppq'])) {
    errors.push({ field: `${path}.ppq`, message: 'must be a positive integer', severity: 'error' });
  }

  validateTempoEvents(value['tempoEvents'], `${path}.tempoEvents`, errors);
  validateTimeSignatureEvents(value['timeSignatureEvents'], `${path}.timeSignatureEvents`, errors);
}

function validateTempoEvents(value: unknown, path: string, errors: ValidationError[]): void {
  if (!isArray(value)) {
    errors.push({ field: path, message: 'must be an array', severity: 'error' });
    return;
  }

  if (value.length === 0) {
    errors.push({
      field: path,
      message: 'must include at least one tempo event',
      severity: 'error',
    });
    return;
  }

  let previousTicks = -1;
  let hasTickZero = false;
  for (let i = 0; i < value.length; i++) {
    const eventPath = `${path}[${i}]`;
    const event = value[i];
    if (!isRecord(event)) {
      errors.push({ field: eventPath, message: 'must be an object', severity: 'error' });
      continue;
    }

    const ticks = event['ticks'];
    if (!isNumber(ticks) || ticks < 0 || !Number.isInteger(ticks)) {
      errors.push({
        field: `${eventPath}.ticks`,
        message: 'must be a non-negative integer',
        severity: 'error',
      });
    } else {
      hasTickZero = hasTickZero || ticks === 0;
      if (ticks <= previousTicks) {
        errors.push({
          field: `${eventPath}.ticks`,
          message: 'must be strictly increasing',
          severity: 'error',
        });
      }
      previousTicks = ticks;
    }

    if (!isNumber(event['bpm']) || event['bpm'] < 20 || event['bpm'] > 300) {
      errors.push({
        field: `${eventPath}.bpm`,
        message: 'must be between 20 and 300',
        severity: 'error',
      });
    }
  }

  if (!hasTickZero) {
    errors.push({
      field: path,
      message: 'must include a tempo event at tick 0',
      severity: 'error',
    });
  }
}

function validateTimeSignatureEvents(
  value: unknown,
  path: string,
  errors: ValidationError[],
): void {
  if (!isArray(value)) {
    errors.push({ field: path, message: 'must be an array', severity: 'error' });
    return;
  }

  if (value.length === 0) {
    errors.push({
      field: path,
      message: 'must include at least one time signature event',
      severity: 'error',
    });
    return;
  }

  let previousTicks = -1;
  let hasTickZero = false;
  for (let i = 0; i < value.length; i++) {
    const eventPath = `${path}[${i}]`;
    const event = value[i];
    if (!isRecord(event)) {
      errors.push({ field: eventPath, message: 'must be an object', severity: 'error' });
      continue;
    }

    const ticks = event['ticks'];
    if (!isNumber(ticks) || ticks < 0 || !Number.isInteger(ticks)) {
      errors.push({
        field: `${eventPath}.ticks`,
        message: 'must be a non-negative integer',
        severity: 'error',
      });
    } else {
      hasTickZero = hasTickZero || ticks === 0;
      if (ticks <= previousTicks) {
        errors.push({
          field: `${eventPath}.ticks`,
          message: 'must be strictly increasing',
          severity: 'error',
        });
      }
      previousTicks = ticks;
    }

    if (
      !isNumber(event['numerator']) ||
      event['numerator'] <= 0 ||
      !Number.isInteger(event['numerator'])
    ) {
      errors.push({
        field: `${eventPath}.numerator`,
        message: 'must be a positive integer',
        severity: 'error',
      });
    }

    if (
      !isNumber(event['denominator']) ||
      event['denominator'] <= 0 ||
      !Number.isInteger(event['denominator'])
    ) {
      errors.push({
        field: `${eventPath}.denominator`,
        message: 'must be a positive integer',
        severity: 'error',
      });
    }
  }

  if (!hasTickZero) {
    errors.push({
      field: path,
      message: 'must include a time signature event at tick 0',
      severity: 'error',
    });
  }
}

function validateAutomationLanes(
  value: unknown,
  path: string,
  effectChain: AudioEffectConfig[],
  errors: ValidationError[],
): void {
  if (!isArray(value)) {
    errors.push({ field: path, message: 'must be an array', severity: 'error' });
    return;
  }

  for (let i = 0; i < value.length; i++) {
    validateAutomationLane(value[i], `${path}[${i}]`, effectChain, errors);
  }
}

function validateAutomationLane(
  lane: unknown,
  path: string,
  effectChain: AudioEffectConfig[],
  errors: ValidationError[],
): void {
  if (!isRecord(lane)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  if (!isString(lane['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  if (!isBoolean(lane['enabled'])) {
    errors.push({ field: `${path}.enabled`, message: 'must be a boolean', severity: 'error' });
  }

  const targetRange = validateAutomationTarget(
    lane['target'],
    `${path}.target`,
    effectChain,
    errors,
  );
  const points = lane['points'];
  if (!isArray(points)) {
    errors.push({ field: `${path}.points`, message: 'must be an array', severity: 'error' });
    return;
  }

  let previousTicks = -1;
  for (let i = 0; i < points.length; i++) {
    const pointPath = `${path}.points[${i}]`;
    const point = points[i];
    if (!isRecord(point)) {
      errors.push({ field: pointPath, message: 'must be an object', severity: 'error' });
      continue;
    }

    const ticks = point['ticks'];
    if (!isNumber(ticks) || ticks < 0 || !Number.isInteger(ticks)) {
      errors.push({
        field: `${pointPath}.ticks`,
        message: 'must be a non-negative integer',
        severity: 'error',
      });
    } else {
      if (ticks <= previousTicks) {
        errors.push({
          field: `${pointPath}.ticks`,
          message: 'must be strictly increasing',
          severity: 'error',
        });
      }
      previousTicks = ticks;
    }

    if (!isNumber(point['value'])) {
      errors.push({ field: `${pointPath}.value`, message: 'must be a number', severity: 'error' });
    } else if (
      targetRange &&
      (point['value'] < targetRange.min || point['value'] > targetRange.max)
    ) {
      errors.push({
        field: `${pointPath}.value`,
        message: `must be between ${targetRange.min} and ${targetRange.max}`,
        severity: 'error',
      });
    }

    if (!isAutomationCurve(point['curve'])) {
      errors.push({
        field: `${pointPath}.curve`,
        message: 'must be one of linear, hold, exponential',
        severity: 'error',
      });
    }

    if ('seconds' in point) {
      errors.push({
        field: `${pointPath}.seconds`,
        message: 'must not persist derived seconds',
        severity: 'error',
      });
    }
  }
}

function validateAutomationTarget(
  target: unknown,
  path: string,
  effectChain: AudioEffectConfig[],
  errors: ValidationError[],
): { min: number; max: number } | undefined {
  if (!isRecord(target)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return undefined;
  }

  if (target['kind'] === 'track-volume') {
    return { min: 0, max: 2 };
  }
  if (target['kind'] === 'track-pan') {
    return { min: -1, max: 1 };
  }
  if (target['kind'] !== 'effect-param') {
    errors.push({
      field: `${path}.kind`,
      message: 'must be track-volume, track-pan, or effect-param',
      severity: 'error',
    });
    return undefined;
  }

  if (!isString(target['effectId'])) {
    errors.push({ field: `${path}.effectId`, message: 'must be a string', severity: 'error' });
    return undefined;
  }
  if (!isString(target['param'])) {
    errors.push({ field: `${path}.param`, message: 'must be a string', severity: 'error' });
    return undefined;
  }
  const effectId = target['effectId'];
  const param = target['param'];

  const effect = effectChain.find((candidate) => candidate.id === effectId);
  if (!effect) {
    errors.push({
      field: `${path}.effectId`,
      message: `effect not found: ${effectId}`,
      severity: 'error',
    });
    return undefined;
  }

  const metadata = getAudioEffectParameterMetadata(effect.effectType, param);
  if (!metadata || !metadata.automatable || metadata.valueKind !== 'number') {
    errors.push({
      field: `${path}.param`,
      message: `unsupported automatable parameter: ${param}`,
      severity: 'error',
    });
    return undefined;
  }

  return {
    min: metadata.min ?? Number.NEGATIVE_INFINITY,
    max: metadata.max ?? Number.POSITIVE_INFINITY,
  };
}

function isAudioEffectConfigLike(value: unknown): value is AudioEffectConfig {
  if (!isRecord(value)) {
    return false;
  }

  const effectType = value['effectType'];

  return (
    isString(value['id']) &&
    isString(effectType) &&
    isEngineAudioEffectType(effectType) &&
    isBoolean(value['enabled']) &&
    isRecord(value['params'])
  );
}

function isAutomationCurve(value: unknown): boolean {
  return value === 'linear' || value === 'hold' || value === 'exponential';
}

function validateMarker(marker: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(marker)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // id — required string
  if (!isString(marker['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  // time — required non-negative number
  if (!isNumber(marker['time'])) {
    errors.push({ field: `${path}.time`, message: 'must be a number', severity: 'error' });
  } else if (marker['time'] < 0) {
    errors.push({ field: `${path}.time`, message: 'must be >= 0', severity: 'error' });
  }

  // label — required string
  if (!isString(marker['label'])) {
    errors.push({ field: `${path}.label`, message: 'must be a string', severity: 'error' });
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Validate raw unknown data as NKA format.
 *
 * Use this when loading from JSON.parse() result before casting to AudioProjectData.
 */
export function validateNka(data: unknown, options: NkaValidateOptions = {}): ValidationResult {
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

  // Validate masterEffectsChain if root masterEffectsChain is an array
  const effects = data['masterEffectsChain'];
  if (isArray(effects)) {
    for (let i = 0; i < effects.length; i++) {
      validateEffect(effects[i], `masterEffectsChain[${i}]`, errors);
    }
  }

  // Validate markers if root markers is an array
  const markers = data['markers'];
  if (isArray(markers)) {
    for (let i = 0; i < markers.length; i++) {
      validateMarker(markers[i], `markers[${i}]`, errors);
    }
  }

  validateTrackMix(data, errors);

  const promotedWarnings: ValidationError[] = options.strict
    ? warnings.map((warning) => ({ ...warning, severity: 'error' as const }))
    : [];
  const effectiveErrors = options.strict ? [...errors, ...promotedWarnings] : errors;

  return {
    valid: effectiveErrors.length === 0,
    errors: effectiveErrors,
    warnings: options.strict ? [] : warnings,
  };
}
