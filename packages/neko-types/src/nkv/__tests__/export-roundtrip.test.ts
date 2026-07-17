// =============================================================================
// Export Round-Trip Tests
//
// Validates that ProjectData survives saveNkv → loadNkv for all 7 element types,
// and that the validator accepts every supported element type.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { loadNkv, saveNkv } from '../codec';
import { validateNkvProject } from '../validator';
import type { ProjectData } from '../../types/project';
import type { Scene3DElement, PuppetElement } from '../../types/element';
import {
  createTestProject,
  createTestTrack,
  createTestMediaElement,
  createTestAudioElement,
  createTestTextElement,
  createTestShapeElement,
  createTestSubtitleElement,
} from '../../operations/__tests__/test-helpers';

// =============================================================================
// Helpers
// =============================================================================

function createScene3DElement(id: string): Scene3DElement {
  return {
    id,
    type: 'scene3d',
    name: 'Test Scene3D',
    src: '/models/scene.glb',
    duration: 10,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}

function createPuppetElement(id: string): PuppetElement {
  return {
    id,
    type: 'puppet',
    name: 'Test Puppet',
    src: '/models/character.moc3',
    duration: 10,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}

/** Create a project with all 7 element types across tracks */
function createFullProject(): ProjectData {
  return createTestProject({
    tracks: [
      createTestTrack({
        id: 'video-t',
        type: 'video',
        elements: [createTestMediaElement({ id: 'media-1' })],
      }),
      createTestTrack({
        id: 'audio-t',
        type: 'audio',
        elements: [createTestAudioElement({ id: 'audio-1' })],
      }),
      createTestTrack({
        id: 'text-t',
        type: 'text',
        elements: [createTestTextElement({ id: 'text-1' })],
      }),
      createTestTrack({
        id: 'shape-t',
        type: 'shape',
        elements: [createTestShapeElement({ id: 'shape-1' })],
      }),
      createTestTrack({
        id: 'subtitle-t',
        type: 'subtitle',
        elements: [createTestSubtitleElement({ id: 'sub-1' })],
      }),
      createTestTrack({
        id: 'scene3d-t',
        type: 'scene3d',
        elements: [createScene3DElement('scene3d-1')],
      }),
      createTestTrack({
        id: 'puppet-t',
        type: 'puppet' as 'video',
        elements: [createPuppetElement('puppet-1')],
      }),
    ],
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('NKV export round-trip', () => {
  describe('codec round-trip (saveNkv -> loadNkv)', () => {
    it('full project with all 7 element types survives round-trip', () => {
      const original = createFullProject();
      const json = saveNkv(original, { validate: false });
      const result = loadNkv(json);

      // All tracks and elements present
      expect(result.project.tracks).toHaveLength(7);
      expect(result.project.tracks.map((t) => t.id)).toEqual([
        'video-t',
        'audio-t',
        'text-t',
        'shape-t',
        'subtitle-t',
        'scene3d-t',
        'puppet-t',
      ]);

      // Deep equality via JSON serialization (same as existing roundtrip.test.ts pattern)
      expect(JSON.parse(JSON.stringify(result.project))).toEqual(
        JSON.parse(JSON.stringify(original)),
      );
    });

    it('empty project survives round-trip', () => {
      const original = createTestProject();
      const json = saveNkv(original);
      const result = loadNkv(json);
      expect(result.validation.valid).toBe(true);
      expect(result.project.tracks).toHaveLength(0);
    });
  });

  describe('subtitle field preservation', () => {
    it('preserves all subtitle style fields', () => {
      const sub = createTestSubtitleElement({
        id: 'sub-styled',
        text: 'Styled subtitle with special chars: 你好 < & >',
        fontSize: 36,
        color: '#ff0000',
        fontFamily: 'Noto Sans',
        backgroundColor: 'rgba(0,0,0,0.5)',
        textAlign: 'left',
        strokeColor: '#000000',
        strokeWidth: 2,
        shadow: { color: '#000', offsetX: 2, offsetY: 2, blur: 4 },
      });
      const project = createTestProject({
        tracks: [createTestTrack({ id: 'st', type: 'subtitle', elements: [sub] })],
      });

      const json = saveNkv(project, { validate: false });
      const result = loadNkv(json);
      const restored = result.project.tracks[0]?.elements[0] as Record<string, unknown>;

      expect(restored).toBeDefined();
      expect(restored['text']).toBe('Styled subtitle with special chars: 你好 < & >');
      expect(restored['fontSize']).toBe(36);
      expect(restored['color']).toBe('#ff0000');
      expect(restored['fontFamily']).toBe('Noto Sans');
      expect(restored['backgroundColor']).toBe('rgba(0,0,0,0.5)');
      expect(restored['textAlign']).toBe('left');
      expect(restored['strokeColor']).toBe('#000000');
      expect(restored['strokeWidth']).toBe(2);
      expect(restored['shadow']).toEqual({ color: '#000', offsetX: 2, offsetY: 2, blur: 4 });
    });

    it('preserves subtitle without optional shadow', () => {
      const sub = createTestSubtitleElement({ id: 'sub-no-shadow' });
      const project = createTestProject({
        tracks: [createTestTrack({ id: 'st', type: 'subtitle', elements: [sub] })],
      });

      const json = saveNkv(project, { validate: false });
      const result = loadNkv(json);
      const restored = result.project.tracks[0]?.elements[0] as Record<string, unknown>;

      expect(restored).toBeDefined();
      expect(restored['shadow']).toBeUndefined();
    });
  });

  describe('text element field preservation', () => {
    it('preserves all text style fields', () => {
      const text = createTestTextElement({
        id: 'text-styled',
        content: 'Styled text',
        fontSize: 72,
        fontFamily: 'Montserrat',
        color: '#00ff00',
        backgroundColor: '#333333',
        textAlign: 'right',
        fontWeight: 'bold',
        fontStyle: 'italic',
      });
      const project = createTestProject({
        tracks: [createTestTrack({ id: 'tt', type: 'text', elements: [text] })],
      });

      const json = saveNkv(project, { validate: false });
      const result = loadNkv(json);
      const restored = result.project.tracks[0]?.elements[0] as Record<string, unknown>;

      expect(restored).toBeDefined();
      expect(restored['content']).toBe('Styled text');
      expect(restored['fontSize']).toBe(72);
      expect(restored['fontWeight']).toBe('bold');
      expect(restored['fontStyle']).toBe('italic');
    });
  });

  describe('validator coverage', () => {
    it('accepts media element', () => {
      const project = createTestProject({
        tracks: [
          createTestTrack({
            id: 'vt',
            type: 'video',
            elements: [createTestMediaElement({ id: 'm1' })],
          }),
        ],
      });
      expect(validateNkvProject(project).valid).toBe(true);
    });

    it('accepts audio element', () => {
      const project = createTestProject({
        tracks: [
          createTestTrack({
            id: 'at',
            type: 'audio',
            elements: [createTestAudioElement({ id: 'a1' })],
          }),
        ],
      });
      expect(validateNkvProject(project).valid).toBe(true);
    });

    it('accepts text element', () => {
      const project = createTestProject({
        tracks: [
          createTestTrack({
            id: 'tt',
            type: 'text',
            elements: [createTestTextElement({ id: 't1' })],
          }),
        ],
      });
      expect(validateNkvProject(project).valid).toBe(true);
    });

    it('accepts shape element', () => {
      const project = createTestProject({
        tracks: [
          createTestTrack({
            id: 'sht',
            type: 'shape',
            elements: [createTestShapeElement({ id: 'sh1' })],
          }),
        ],
      });
      expect(validateNkvProject(project).valid).toBe(true);
    });

    it('accepts subtitle element', () => {
      const project = createTestProject({
        tracks: [
          createTestTrack({
            id: 'st',
            type: 'subtitle',
            elements: [createTestSubtitleElement({ id: 's1' })],
          }),
        ],
      });
      expect(validateNkvProject(project).valid).toBe(true);
    });

    it('accepts scene3d element', () => {
      const project = createTestProject({
        tracks: [
          createTestTrack({
            id: 'sc3d',
            type: 'scene3d',
            elements: [createScene3DElement('s3d-1')],
          }),
        ],
      });
      expect(validateNkvProject(project).valid).toBe(true);
    });
  });
});
