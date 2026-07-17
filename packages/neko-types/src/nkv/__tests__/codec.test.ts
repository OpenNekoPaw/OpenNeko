/**
 * NKV Format SDK — Codec Tests
 */

import { describe, it, expect } from 'vitest';
import { loadNkv, saveNkv, isValidNkv } from '../codec';
import type { ProjectData } from '../../types/project';

// =============================================================================
// Fixtures
// =============================================================================

const VALID_PROJECT: ProjectData = {
  version: '2.0',
  name: 'Test Project',
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  tracks: [
    {
      id: 'track-1',
      name: 'Main',
      type: 'media',
      elements: [],
      muted: false,
      locked: false,
      hidden: false,
      isMain: true,
    },
  ],
};

// =============================================================================
// loadNkv
// =============================================================================

describe('loadNkv', () => {
  it('should load valid JSON and return a valid result', () => {
    const json = JSON.stringify(VALID_PROJECT);
    const result = loadNkv(json);

    expect(result.validation.valid).toBe(true);
    expect(result.project.name).toBe('Test Project');
    expect(result.migration).toBeUndefined();
  });

  it('should return error result for invalid JSON', () => {
    const result = loadNkv('{ broken json!!!');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('JSON parse error'),
      }),
    );
  });

  it('should return error result for empty string', () => {
    const result = loadNkv('');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it('should migrate v1 data and include migration info', () => {
    const v1Data = {
      name: 'Legacy Project',
      tracks: [],
    };
    const json = JSON.stringify(v1Data);
    const result = loadNkv(json);

    expect(result.migration).toBeDefined();
    expect(result.migration?.fromVersion).toBe('1.0');
    expect(result.migration?.toVersion).toBe('2.0');
    expect(result.migration?.appliedMigrations.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// saveNkv
// =============================================================================

describe('saveNkv', () => {
  it('should produce valid JSON with default indent of 2', () => {
    const json = saveNkv(VALID_PROJECT);
    const parsed = JSON.parse(json) as unknown;

    expect(parsed).toEqual(VALID_PROJECT);
    // Check indent: second line should start with 2 spaces
    const lines = json.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1]).toMatch(/^ {2}"/);
  });

  it('should respect custom indent option', () => {
    const json = saveNkv(VALID_PROJECT, { indent: 4 });
    const lines = json.split('\n');
    expect(lines[1]).toMatch(/^ {4}"/);
  });

  it('should skip validation when validate=false', () => {
    // Invalid project data (missing required fields)
    const invalidProject = { version: '2.0' } as unknown as ProjectData;

    // With validation enabled, should throw
    expect(() => saveNkv(invalidProject)).toThrow();

    // With validation disabled, should succeed
    const json = saveNkv(invalidProject, { validate: false });
    expect(json).toBe(JSON.stringify(invalidProject, null, 2));
  });

  it('should throw on validation failure with error details', () => {
    const invalidProject = { version: '2.0' } as unknown as ProjectData;

    expect(() => saveNkv(invalidProject)).toThrow('NKV validation failed');
  });
});

// =============================================================================
// Roundtrip
// =============================================================================

describe('loadNkv + saveNkv roundtrip', () => {
  it('should produce valid JSON that can be loaded back', () => {
    const json1 = saveNkv(VALID_PROJECT);
    const loaded = loadNkv(json1);

    expect(loaded.validation.valid).toBe(true);

    const json2 = saveNkv(loaded.project);
    expect(JSON.parse(json1)).toEqual(JSON.parse(json2));
  });
});

// =============================================================================
// isValidNkv
// =============================================================================

describe('isValidNkv', () => {
  it('should return true for valid project data', () => {
    expect(isValidNkv(VALID_PROJECT)).toBe(true);
  });

  it('should return false for invalid data', () => {
    expect(isValidNkv({ broken: true })).toBe(false);
  });

  it('should return false for non-object data', () => {
    expect(isValidNkv(null)).toBe(false);
    expect(isValidNkv('string')).toBe(false);
  });
});
