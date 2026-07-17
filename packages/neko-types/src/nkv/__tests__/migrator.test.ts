/**
 * NKV Format SDK — Migrator Tests
 */

import { describe, it, expect } from 'vitest';
import { detectNkvVersion, migrateNkv } from '../migrator';

// =============================================================================
// detectNkvVersion
// =============================================================================

describe('detectNkvVersion', () => {
  it('should return "2.0" for data with version "2.0"', () => {
    expect(detectNkvVersion({ version: '2.0' })).toBe('2.0');
  });

  it('should return "1.0" for data with no version field', () => {
    expect(detectNkvVersion({ name: 'No Version' })).toBe('1.0');
  });

  it('should return "1.0" for data with version "1.0"', () => {
    expect(detectNkvVersion({ version: '1.0' })).toBe('1.0');
  });

  it('should return "1.0" for non-object data', () => {
    expect(detectNkvVersion(null)).toBe('1.0');
    expect(detectNkvVersion('string')).toBe('1.0');
    expect(detectNkvVersion(42)).toBe('1.0');
  });

  it('should return "1.0" for unrecognised version string', () => {
    expect(detectNkvVersion({ version: '3.0' })).toBe('1.0');
  });
});

// =============================================================================
// migrateNkv
// =============================================================================

describe('migrateNkv', () => {
  it('should migrate v1 data to v2 with defaults filled', () => {
    const v1Data = {
      // no version, no name, no resolution, no fps, no tracks
    };

    const result = migrateNkv(v1Data);

    expect(result.fromVersion).toBe('1.0');
    expect(result.toVersion).toBe('2.0');
    expect(result.data.version).toBe('2.0');
    expect(result.data.name).toBe('Untitled Project');
    expect(result.data.resolution).toEqual({ width: 1920, height: 1080 });
    expect(result.data.fps).toBe(30);
    expect(result.appliedMigrations.length).toBeGreaterThan(0);
  });

  it('should ensure a main track exists after migration', () => {
    const v1Data = {
      tracks: [{ id: 't1', name: 'Track 1', type: 'audio', elements: [], isMain: false }],
    };

    const result = migrateNkv(v1Data);
    const tracks = result.data.tracks;

    // Should have added a main track
    const mainTrack = tracks.find((t) => t.isMain === true);
    expect(mainTrack).toBeDefined();
    expect(result.appliedMigrations).toContainEqual(expect.stringContaining('main track'));
  });

  it('should not add main track if one already exists', () => {
    const v1Data = {
      tracks: [{ id: 't1', name: 'Main', type: 'media', elements: [], isMain: true }],
    };

    const result = migrateNkv(v1Data);
    const mainTracks = result.data.tracks.filter((t) => t.isMain === true);

    expect(mainTracks).toHaveLength(1);
  });

  it('should return empty appliedMigrations for already-v2 data', () => {
    const v2Data = {
      version: '2.0',
      name: 'Test',
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

    const result = migrateNkv(v2Data);

    expect(result.fromVersion).toBe('2.0');
    expect(result.toVersion).toBe('2.0');
    expect(result.appliedMigrations).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should not mutate the original input data (immutability)', () => {
    const original = {
      name: 'Original',
      tracks: [{ id: 't1', name: 'T', type: 'media', elements: [] }],
    };

    // Deep snapshot before migration
    const snapshot = JSON.parse(JSON.stringify(original));

    migrateNkv(original);

    // Original object must remain unchanged
    expect(original).toEqual(snapshot);
  });

  it('should fill element defaults during migration', () => {
    const v1Data = {
      tracks: [
        {
          id: 't1',
          name: 'Track',
          type: 'media',
          elements: [{ id: 'el-1', name: 'Clip', type: 'media', src: '/video.mp4' }],
          isMain: true,
        },
      ],
    };

    const result = migrateNkv(v1Data);
    const element = result.data.tracks.find((t) => t.id === 't1')?.elements[0];

    expect(element).toBeDefined();
    // Migrator should have filled numeric defaults
    const el = element as unknown as Record<string, unknown>;
    expect(el['opacity']).toBe(1);
    expect(el['trimStart']).toBe(0);
    expect(el['trimEnd']).toBe(0);
    expect(el['startTime']).toBe(0);
    expect(el['duration']).toBe(0);
  });
});
