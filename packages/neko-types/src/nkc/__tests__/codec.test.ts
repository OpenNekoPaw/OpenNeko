/**
 * NKC Format SDK — Codec Tests
 */

import { describe, it, expect } from 'vitest';
import { loadNkc, saveNkc, isValidNkc } from '../codec';
import type { CanvasData } from '../../types/canvas';

// =============================================================================
// Fixtures
// =============================================================================

const VALID_CANVAS: CanvasData = {
  version: '2.1',
  name: 'Test Canvas',
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  nodes: [
    {
      id: 'node-1',
      type: 'media',
      position: { x: 100, y: 200 },
      size: { width: 300, height: 200 },
      zIndex: 1,
      data: {
        assetPath: 'assets/video.mp4',
      },
    },
  ],
  connections: [
    {
      id: 'conn-1',
      sourceId: 'node-1',
      targetId: 'node-2',
      sourceEndpoint: { nodeId: 'node-1', scope: 'node' },
      targetEndpoint: { nodeId: 'node-2', scope: 'node' },
    },
  ],
};

// =============================================================================
// loadNkc
// =============================================================================

describe('loadNkc', () => {
  it('should load valid JSON and return a valid result', () => {
    const json = JSON.stringify(VALID_CANVAS);
    const result = loadNkc(json);

    expect(result.validation.valid).toBe(true);
    expect(result.data.name).toBe('Test Canvas');
  });

  it('should return error result for invalid JSON', () => {
    const result = loadNkc('{ broken json!!!');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('JSON parse error'),
      }),
    );
  });

  it('should return error result for empty string', () => {
    const result = loadNkc('');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it('should return error result for non-object data', () => {
    const result = loadNkc('"just a string"');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        message: 'data must be an object',
      }),
    );
  });

  it('should return validation errors for missing required fields', () => {
    const result = loadNkc(JSON.stringify({ version: '2.1' }));

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.field === 'name')).toBe(true);
    expect(result.validation.errors.some((e) => e.field === 'nodes')).toBe(true);
  });
});

// =============================================================================
// saveNkc
// =============================================================================

describe('saveNkc', () => {
  it('should produce valid JSON with default indent of 2', () => {
    const json = saveNkc(VALID_CANVAS);
    const parsed = JSON.parse(json) as unknown;

    expect(parsed).toEqual(VALID_CANVAS);
    // Check indent: second line should start with 2 spaces
    const lines = json.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1]).toMatch(/^ {2}"/);
  });

  it('should respect custom indent option', () => {
    const json = saveNkc(VALID_CANVAS, { indent: 4 });
    const lines = json.split('\n');
    expect(lines[1]).toMatch(/^ {4}"/);
  });

  it('should skip validation when validate=false', () => {
    // Invalid canvas data (missing required fields)
    const invalidCanvas = { version: '1.0' } as unknown as CanvasData;

    // With validation enabled, should throw
    expect(() => saveNkc(invalidCanvas)).toThrow();

    // With validation disabled, should succeed
    const json = saveNkc(invalidCanvas, { validate: false });
    expect(json).toBe(JSON.stringify(invalidCanvas, null, 2));
  });

  it('should throw on validation failure with error details', () => {
    const invalidCanvas = { version: '1.0' } as unknown as CanvasData;

    expect(() => saveNkc(invalidCanvas)).toThrow('NKC validation failed');
  });
});

// =============================================================================
// Roundtrip
// =============================================================================

describe('loadNkc + saveNkc roundtrip', () => {
  it('should produce valid JSON that can be loaded back', () => {
    const json1 = saveNkc(VALID_CANVAS);
    const loaded = loadNkc(json1);

    expect(loaded.validation.valid).toBe(true);

    const json2 = saveNkc(loaded.data);
    expect(JSON.parse(json1)).toEqual(JSON.parse(json2));
  });
});

// =============================================================================
// isValidNkc
// =============================================================================

describe('isValidNkc', () => {
  it('should return true for valid canvas data', () => {
    expect(isValidNkc(VALID_CANVAS)).toBe(true);
  });

  it('should return false for invalid data', () => {
    expect(isValidNkc({ broken: true })).toBe(false);
  });

  it('should return false for non-object data', () => {
    expect(isValidNkc(null)).toBe(false);
    expect(isValidNkc('string')).toBe(false);
  });
});
