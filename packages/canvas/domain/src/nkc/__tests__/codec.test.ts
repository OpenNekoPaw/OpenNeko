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
        contentLocator: {
          kind: 'workspace-file',
          path: 'assets/video.mp4',
        },
        mediaType: 'video',
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
      type: 'reference',
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

  it('loads path-only material nodes as degraded content without inferring a locator', () => {
    const result = loadNkc(
      JSON.stringify({
        ...VALID_CANVAS,
        nodes: [
          {
            ...VALID_CANVAS.nodes[0],
            data: {
              assetPath: 'media/path-only.mp4',
              mediaType: 'video',
            },
          },
        ],
      }),
    );

    expect(result.validation.valid).toBe(true);
    expect(result.data.nodes[0]).toMatchObject({
      type: 'media',
      data: {
        assetPath: 'media/path-only.mp4',
        mediaType: 'video',
      },
    });
    expect(result.data.nodes[0]?.data).not.toHaveProperty('contentLocator');
    expect(result.validation.warnings).toContainEqual(
      expect.objectContaining({
        field: 'nodes[0].data.contentLocator',
        message: expect.stringContaining('canvas-material-content-locator-required'),
      }),
    );
  });

  it('preserves path-only File nodes and their connections', () => {
    const result = loadNkc(
      JSON.stringify({
        ...VALID_CANVAS,
        nodes: [
          {
            id: 'file-1',
            type: 'file',
            position: { x: 40, y: 80 },
            size: { width: 260, height: 180 },
            zIndex: 2,
            data: {
              path: 'documents/path-only.md',
              title: 'Path-only notes',
              mediaKind: 'document',
              mediaType: 'text/markdown',
            },
          },
          VALID_CANVAS.nodes[0],
        ],
        connections: [
          {
            id: 'path-only-connection',
            sourceId: 'file-1',
            targetId: 'node-1',
            sourceEndpoint: { nodeId: 'file-1', scope: 'node' },
            targetEndpoint: { nodeId: 'node-1', scope: 'node' },
            type: 'reference',
          },
        ],
      }),
    );

    expect(result.validation.valid).toBe(true);
    expect(result.data.nodes[0]).toMatchObject({
      id: 'file-1',
      data: { path: 'documents/path-only.md' },
    });
    expect(result.data.nodes[0]?.data).not.toHaveProperty('contentLocator');
    expect(result.data.connections).toHaveLength(1);
  });

  it('keeps non-portable material paths invalid', () => {
    const result = loadNkc(
      JSON.stringify({
        ...VALID_CANVAS,
        nodes: [
          {
            ...VALID_CANVAS.nodes[0],
            data: {
              assetPath: 'https://example.test/runtime-only.mp4',
              mediaType: 'video',
            },
          },
        ],
      }),
    );

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        field: 'nodes[0].data.contentLocator',
      }),
    );
  });

  it('rejects persisted loopback projection URLs even when a locator is present', () => {
    const result = loadNkc(
      JSON.stringify({
        ...VALID_CANVAS,
        nodes: [
          {
            ...VALID_CANVAS.nodes[0],
            data: {
              ...VALID_CANVAS.nodes[0]!.data,
              assetPath: 'http://127.0.0.1:43125/resources/runtime-token',
            },
          },
        ],
      }),
    );

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        field: 'nodes[0].data.assetPath',
      }),
    );
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

  it('keeps an invalid document local while a valid sibling remains readable', () => {
    const invalid = loadNkc(JSON.stringify({ name: 'Incomplete', nodes: [] }));
    const sibling = loadNkc(JSON.stringify({ ...VALID_CANVAS, name: 'Sibling' }));

    expect(invalid.validation.valid).toBe(false);
    expect(invalid.validation.errors).toContainEqual(
      expect.objectContaining({ field: 'connections' }),
    );
    expect(sibling.validation.valid).toBe(true);
    expect(sibling.data.name).toBe('Sibling');
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
    const invalidCanvas = { name: 'Incomplete' } as unknown as CanvasData;

    // With validation enabled, should throw
    expect(() => saveNkc(invalidCanvas)).toThrow();

    // With validation disabled, should succeed
    const json = saveNkc(invalidCanvas, { validate: false });
    expect(json).toBe(JSON.stringify(invalidCanvas, null, 2));
  });

  it('should throw on validation failure with error details', () => {
    const invalidCanvas = { name: 'Incomplete' } as unknown as CanvasData;

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
