/**
 * NKV Format SDK — Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { validateNkv, validateNkvProject } from '../validator';
import type { ProjectData } from '../../types/project';

// =============================================================================
// Fixtures
// =============================================================================

const VALID_PROJECT = {
  version: '2.0',
  name: 'Test Project',
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  tracks: [
    {
      id: 'track-1',
      name: 'Main',
      type: 'media' as const,
      elements: [],
      muted: false,
      locked: false,
      hidden: false,
      isMain: true,
    },
  ],
};

const VALID_MEDIA_ELEMENT = {
  id: 'el-1',
  name: 'Clip',
  type: 'media',
  duration: 5,
  startTime: 0,
  trimStart: 0,
  trimEnd: 0,
  opacity: 1,
  muted: false,
  hidden: false,
  locked: false,
  src: '/path/to/video.mp4',
  transform: {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    anchorX: 0,
    anchorY: 0,
  },
  effects: [],
  blendMode: 'normal',
};

// =============================================================================
// Tests
// =============================================================================

describe('validateNkv', () => {
  it('should accept valid minimal project data', () => {
    const result = validateNkv(VALID_PROJECT);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject non-object data', () => {
    const result = validateNkv('not an object');

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: '', message: 'data must be an object' }),
    );
  });

  describe('missing required fields', () => {
    it('should error when version is missing', () => {
      const data = { ...VALID_PROJECT, version: undefined };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'version', severity: 'error' }),
      );
    });

    it('should error when name is missing', () => {
      const data = { ...VALID_PROJECT, name: undefined };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'name', severity: 'error' }),
      );
    });

    it('should error when resolution is missing', () => {
      const data = { ...VALID_PROJECT, resolution: undefined };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'resolution', severity: 'error' }),
      );
    });

    it('should error when fps is missing', () => {
      const data = { ...VALID_PROJECT, fps: undefined };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'fps', severity: 'error' }),
      );
    });

    it('should error when tracks is missing', () => {
      const data = { ...VALID_PROJECT, tracks: undefined };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'tracks', severity: 'error' }),
      );
    });
  });

  describe('invalid types', () => {
    it('should error when version is a number', () => {
      const data = { ...VALID_PROJECT, version: 2 };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'version', message: 'must be a string' }),
      );
    });

    it('should error when fps is a string', () => {
      const data = { ...VALID_PROJECT, fps: '30' };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'fps', message: 'must be a positive number' }),
      );
    });

    it('should error when resolution has non-integer width', () => {
      const data = { ...VALID_PROJECT, resolution: { width: 19.5, height: 1080 } };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'resolution.width',
          message: 'must be a positive integer',
        }),
      );
    });
  });

  describe('track validation', () => {
    it('should error on invalid track structure (not an object)', () => {
      const data = { ...VALID_PROJECT, tracks: ['not-a-track'] };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'tracks[0]', message: 'must be an object' }),
      );
    });

    it('should error with correct field paths for missing track fields', () => {
      const data = {
        ...VALID_PROJECT,
        tracks: [{ id: 'track-1' }],
      };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.objectContaining({ field: 'tracks[0].name' }));
      expect(result.errors).toContainEqual(expect.objectContaining({ field: 'tracks[0].type' }));
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'tracks[0].elements' }),
      );
    });

    it('should error on invalid track type', () => {
      const data = {
        ...VALID_PROJECT,
        tracks: [{ ...VALID_PROJECT.tracks[0], type: 'unknown-type' }],
      };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'tracks[0].type',
          message: expect.stringContaining('invalid track type'),
        }),
      );
    });
  });

  describe('element validation', () => {
    it('should error on invalid element type discriminator', () => {
      const data = {
        ...VALID_PROJECT,
        tracks: [
          {
            ...VALID_PROJECT.tracks[0],
            elements: [{ ...VALID_MEDIA_ELEMENT, type: 'invalid-type' }],
          },
        ],
      };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'tracks[0].elements[0].type',
          message: expect.stringContaining('invalid element type'),
        }),
      );
    });

    it('should error when media element is missing src', () => {
      const { src, ...noSrc } = VALID_MEDIA_ELEMENT;
      const data = {
        ...VALID_PROJECT,
        tracks: [{ ...VALID_PROJECT.tracks[0], elements: [noSrc] }],
      };
      const result = validateNkv(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'tracks[0].elements[0].src' }),
      );
    });
  });

  describe('complete project with all element types', () => {
    it('should accept a project with media, audio, text, shape, subtitle, scene3d elements', () => {
      const baseElement = {
        id: 'e',
        name: 'E',
        duration: 1,
        startTime: 0,
        trimStart: 0,
        trimEnd: 0,
        opacity: 1,
        muted: false,
        hidden: false,
        locked: false,
        effects: [],
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 },
      };

      const data = {
        ...VALID_PROJECT,
        tracks: [
          {
            ...VALID_PROJECT.tracks[0],
            elements: [
              { ...baseElement, id: 'e1', type: 'media', src: '/video.mp4' },
              { ...baseElement, id: 'e2', type: 'audio', src: '/audio.wav' },
              { ...baseElement, id: 'e3', type: 'text', content: 'Hello' },
              { ...baseElement, id: 'e4', type: 'shape', shapeType: 'rectangle' },
              { ...baseElement, id: 'e5', type: 'subtitle', text: 'Sub' },
              { ...baseElement, id: 'e6', type: 'scene3d', src: '/model.glb' },
            ],
          },
        ],
      };

      const result = validateNkv(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('transform validation', () => {
    it('should warn on missing transform fields', () => {
      const data = {
        ...VALID_PROJECT,
        tracks: [
          {
            ...VALID_PROJECT.tracks[0],
            elements: [
              {
                ...VALID_MEDIA_ELEMENT,
                transform: { x: 0 }, // missing y, scaleX, scaleY, rotation, anchorX, anchorY
              },
            ],
          },
        ],
      };
      const result = validateNkv(data);

      // Missing transform fields produce warnings, not errors
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: expect.stringContaining('transform.y'),
          severity: 'warning',
        }),
      );
    });

    it('should error when transform field is wrong type', () => {
      const data = {
        ...VALID_PROJECT,
        tracks: [
          {
            ...VALID_PROJECT.tracks[0],
            elements: [
              {
                ...VALID_MEDIA_ELEMENT,
                transform: {
                  x: 'not-a-number',
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  anchorX: 0,
                  anchorY: 0,
                },
              },
            ],
          },
        ],
      };
      const result = validateNkv(data);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'tracks[0].elements[0].transform.x',
          message: 'must be a number',
          severity: 'error',
        }),
      );
    });
  });

  describe('options', () => {
    it('should promote warnings to errors in strict mode', () => {
      // Create data that produces warnings but no errors
      const data = {
        ...VALID_PROJECT,
        tracks: [
          {
            id: 'track-1',
            name: 'Main',
            type: 'media',
            elements: [],
            // missing boolean fields: muted, locked, hidden, isMain -> warnings
          },
        ],
      };

      const normalResult = validateNkv(data);
      expect(normalResult.warnings.length).toBeGreaterThan(0);
      expect(normalResult.valid).toBe(true);

      const strictResult = validateNkv(data, { strict: true });
      expect(strictResult.valid).toBe(false);
      expect(strictResult.warnings).toHaveLength(0);
    });

    it('should skip element validation with skipElements option', () => {
      const data = {
        ...VALID_PROJECT,
        tracks: [
          {
            ...VALID_PROJECT.tracks[0],
            elements: [{ broken: true }], // invalid element
          },
        ],
      };

      const withElements = validateNkv(data);
      expect(withElements.valid).toBe(false);

      const withSkip = validateNkv(data, { skipElements: true });
      // Should not have element-level errors
      const elementErrors = withSkip.errors.filter((e) => e.field.includes('elements['));
      expect(elementErrors).toHaveLength(0);
    });
  });
});

describe('validateNkvProject', () => {
  it('should delegate to validateNkv for typed ProjectData', () => {
    const project: ProjectData = {
      version: '2.0',
      name: 'Test',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [],
    };

    const result = validateNkvProject(project);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
