// =============================================================================
// NKV Format SDK — Migrator
//
// Immutable, pipeline-based version migration for NKV project data.
// Returns new objects — never mutates the input.
// =============================================================================

import type { ProjectData } from '../types/project';
import type { NkvVersion, MigrationResult } from './types';
import { CURRENT_NKV_VERSION } from './types';

// =============================================================================
// Type guards
// =============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

// =============================================================================
// Version detection
// =============================================================================

/**
 * Detect the NKV format version of raw data.
 *
 * Returns '1.0' if version field is missing or unrecognised,
 * otherwise returns the declared version.
 */
export function detectNkvVersion(data: unknown): NkvVersion {
  if (!isRecord(data)) {
    return '1.0';
  }
  const version = data['version'];
  if (version === '2.0') {
    return '2.0';
  }
  return '1.0';
}

// =============================================================================
// V1 -> V2 migration
// =============================================================================

function migrateV1toV2(raw: Record<string, unknown>): {
  data: Record<string, unknown>;
  steps: string[];
  warnings: string[];
} {
  const steps: string[] = [];
  const warnings: string[] = [];

  // Deep clone to avoid mutation
  const data = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  // Fill missing version
  if (data['version'] !== '2.0') {
    data['version'] = '2.0';
    steps.push('Set version to "2.0"');
  }

  // Fill missing name
  if (!isString(data['name']) || data['name'] === '') {
    data['name'] = 'Untitled Project';
    steps.push('Set default project name to "Untitled Project"');
  }

  // Fill missing resolution
  if (!isRecord(data['resolution'])) {
    data['resolution'] = { width: 1920, height: 1080 };
    steps.push('Set default resolution to 1920x1080');
  } else {
    const res = data['resolution'] as Record<string, unknown>;
    if (typeof res['width'] !== 'number' || res['width'] <= 0) {
      res['width'] = 1920;
      steps.push('Set default resolution width to 1920');
    }
    if (typeof res['height'] !== 'number' || res['height'] <= 0) {
      res['height'] = 1080;
      steps.push('Set default resolution height to 1080');
    }
  }

  // Fill missing fps
  if (typeof data['fps'] !== 'number' || data['fps'] <= 0) {
    data['fps'] = 30;
    steps.push('Set default fps to 30');
  }

  // Ensure tracks array
  if (!isArray(data['tracks'])) {
    data['tracks'] = [];
    steps.push('Initialized empty tracks array');
  }

  const tracks = data['tracks'] as unknown[];

  // Ensure main track exists
  const hasMainTrack = tracks.some((t) => isRecord(t) && t['isMain'] === true);
  if (!hasMainTrack) {
    const mainTrack: Record<string, unknown> = {
      id: `migrated-main-${Date.now()}`,
      name: 'Main Track',
      type: 'media',
      elements: [],
      muted: false,
      locked: false,
      hidden: false,
      isMain: true,
    };
    tracks.unshift(mainTrack);
    steps.push('Added default main track');
  }

  // Migrate each track
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (!isRecord(track)) {
      warnings.push(`tracks[${i}]: not an object, skipped`);
      continue;
    }

    // Fill missing track boolean fields
    if (typeof track['locked'] !== 'boolean') {
      track['locked'] = false;
      steps.push(`tracks[${i}]: set locked to false`);
    }
    if (typeof track['hidden'] !== 'boolean') {
      track['hidden'] = false;
      steps.push(`tracks[${i}]: set hidden to false`);
    }
    if (typeof track['muted'] !== 'boolean') {
      track['muted'] = false;
      steps.push(`tracks[${i}]: set muted to false`);
    }
    if (typeof track['isMain'] !== 'boolean') {
      track['isMain'] = false;
      steps.push(`tracks[${i}]: set isMain to false`);
    }

    // Ensure elements array
    if (!isArray(track['elements'])) {
      track['elements'] = [];
      steps.push(`tracks[${i}]: initialized empty elements array`);
      continue;
    }

    // Migrate each element
    const elements = track['elements'] as unknown[];
    for (let j = 0; j < elements.length; j++) {
      const el = elements[j];
      if (!isRecord(el)) {
        warnings.push(`tracks[${i}].elements[${j}]: not an object, skipped`);
        continue;
      }

      migrateElement(el, `tracks[${i}].elements[${j}]`, steps);
    }
  }

  return { data, steps, warnings };
}

function migrateElement(el: Record<string, unknown>, path: string, steps: string[]): void {
  // Fill missing numeric fields with defaults
  const numericDefaults: Array<[string, number]> = [
    ['trimStart', 0],
    ['trimEnd', 0],
    ['opacity', 1],
    ['startTime', 0],
    ['duration', 0],
  ];

  for (const [field, defaultVal] of numericDefaults) {
    if (typeof el[field] !== 'number') {
      el[field] = defaultVal;
      steps.push(`${path}: set ${field} to ${defaultVal}`);
    }
  }

  // Fill missing boolean fields
  const boolDefaults: Array<[string, boolean]> = [
    ['muted', false],
    ['hidden', false],
    ['locked', false],
  ];

  for (const [field, defaultVal] of boolDefaults) {
    if (typeof el[field] !== 'boolean') {
      el[field] = defaultVal;
      steps.push(`${path}: set ${field} to ${String(defaultVal)}`);
    }
  }

  // Fill missing blendMode
  if (!isString(el['blendMode'])) {
    el['blendMode'] = 'normal';
    steps.push(`${path}: set blendMode to "normal"`);
  }

  // Fill missing effects array
  if (!isArray(el['effects'])) {
    el['effects'] = [];
    steps.push(`${path}: initialized empty effects array`);
  }

  // Fill missing transform with engine defaults
  if (!isRecord(el['transform'])) {
    el['transform'] = {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0,
      anchorY: 0,
    };
    steps.push(`${path}: set default transform`);
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Migrate raw NKV data to the current version.
 *
 * Returns a new object; the input is never mutated.
 * If data is already at current version, returns it with an empty migration list.
 */
export function migrateNkv(data: unknown): MigrationResult {
  const fromVersion = detectNkvVersion(data);

  // Already at current version — deep clone and return
  if (fromVersion === CURRENT_NKV_VERSION) {
    const cloned = JSON.parse(JSON.stringify(data)) as ProjectData;
    return {
      data: cloned,
      fromVersion,
      toVersion: CURRENT_NKV_VERSION,
      appliedMigrations: [],
      warnings: [],
    };
  }

  // V1 -> V2 migration
  const raw = isRecord(data) ? data : {};
  const result = migrateV1toV2(raw);

  return {
    data: result.data as unknown as ProjectData,
    fromVersion,
    toVersion: CURRENT_NKV_VERSION,
    appliedMigrations: result.steps,
    warnings: result.warnings,
  };
}
