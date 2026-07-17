import { describe, expect, it } from 'vitest';
import { CURRENT_NKS_VERSION, detectNksVersion, migrateNks } from '../index';

describe('nks migrator', () => {
  it('detects known .nks versions', () => {
    expect(detectNksVersion({ version: '1.1' })).toBe('1.1');
    expect(detectNksVersion({ version: 'future' })).toBeNull();
  });

  it('migrates legacy documents to the current version without losing fields', () => {
    const result = migrateNks({
      version: '1.1',
      canvas: { width: 32, height: 16, dpi: 72, backgroundColor: '#000000' },
      layers: [{ id: 'layer-1' }],
      brushPresets: [],
      palette: ['#ffffff'],
      viewport: { panX: 1, panY: 2, zoom: 3, rotation: 0.25 },
    });

    expect(result.fromVersion).toBe('1.1');
    expect(result.toVersion).toBe(CURRENT_NKS_VERSION);
    expect(result.appliedMigrations).toEqual(['nks-1.1-to-1.2']);
    expect(result.data).toMatchObject({
      version: CURRENT_NKS_VERSION,
      canvas: { width: 32, height: 16 },
      layers: [{ id: 'layer-1' }],
      palette: ['#ffffff'],
      viewport: { zoom: 3, rotation: 0.25 },
    });
  });

  it('normalizes malformed input to a minimal current document', () => {
    const result = migrateNks(null);

    expect(result.data.version).toBe(CURRENT_NKS_VERSION);
    expect(result.data.layers).toEqual([]);
    expect(result.data.canvas.width).toBe(1920);
  });
});
