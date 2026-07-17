import { describe, it, expect } from 'vitest';
import {
  parseJviDocument,
  findSrcNodeAtOffset,
  findLinkedIdAtOffset,
  findElementIdRange,
} from '../JviParser';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const VALID_JVI = JSON.stringify(
  {
    name: 'Test Project',
    version: '1.0.0',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'track-1',
        name: 'Video Track',
        track_type: 'video',
        elements: [
          {
            Media: {
              id: 'el-1',
              name: 'Clip 1',
              src: 'media/clip1.mp4',
              duration: 10.5,
              start_time: 0,
            },
          },
          {
            Audio: {
              id: 'el-2',
              name: 'Audio 1',
              src: 'audio/track1.wav',
              duration: 30,
              start_time: 5,
              linked_video_id: 'el-1',
            },
          },
        ],
      },
      {
        id: 'track-2',
        name: 'Text Track',
        track_type: 'text',
        elements: [
          {
            Text: {
              id: 'el-3',
              name: 'Title',
              duration: 5,
              start_time: 0,
            },
          },
        ],
      },
    ],
  },
  null,
  2,
);

const EMPTY_JVI = JSON.stringify(
  {
    name: 'Empty',
    version: '1.0.0',
    resolution: { width: 1920, height: 1080 },
    fps: 24,
    tracks: [],
  },
  null,
  2,
);

// ─── parseJviDocument ───────────────────────────────────────────────────────

describe('parseJviDocument', () => {
  it('parses a valid JVI document', () => {
    const project = parseJviDocument(VALID_JVI);

    expect(project.parseError).toBeUndefined();
    expect(project.name).toBe('Test Project');
    expect(project.version).toBe('1.0.0');
    expect(project.resolution).toEqual({ width: 1920, height: 1080 });
    expect(project.fps).toBe(30);
    expect(project.tracks).toHaveLength(2);
  });

  it('parses tracks correctly', () => {
    const project = parseJviDocument(VALID_JVI);
    const track1 = project.tracks[0]!;

    expect(track1.id).toBe('track-1');
    expect(track1.name).toBe('Video Track');
    expect(track1.trackType).toBe('video');
    expect(track1.elements).toHaveLength(2);
  });

  it('parses Media elements', () => {
    const project = parseJviDocument(VALID_JVI);
    const el = project.tracks[0]!.elements[0]!;

    expect(el.id).toBe('el-1');
    expect(el.name).toBe('Clip 1');
    expect(el.type).toBe('media');
    expect(el.src).toBe('media/clip1.mp4');
    expect(el.duration).toBe(10.5);
    expect(el.startTime).toBe(0);
    expect(el.srcRange).toBeDefined();
  });

  it('parses Audio elements with linked IDs', () => {
    const project = parseJviDocument(VALID_JVI);
    const el = project.tracks[0]!.elements[1]!;

    expect(el.id).toBe('el-2');
    expect(el.type).toBe('audio');
    expect(el.linkedVideoId).toBe('el-1');
    expect(el.linkedVideoIdRange).toBeDefined();
  });

  it('parses Text elements', () => {
    const project = parseJviDocument(VALID_JVI);
    const el = project.tracks[1]!.elements[0]!;

    expect(el.id).toBe('el-3');
    expect(el.type).toBe('text');
    expect(el.src).toBeUndefined();
  });

  it('handles empty tracks list', () => {
    const project = parseJviDocument(EMPTY_JVI);

    expect(project.parseError).toBeUndefined();
    expect(project.tracks).toHaveLength(0);
  });

  it('handles malformed JSON gracefully (jsonc-parser is lenient)', () => {
    // jsonc-parser tolerates malformed JSON and returns partial results
    const project = parseJviDocument('{ invalid json');

    // Should not crash; returns empty project with no tracks
    expect(project.tracks).toHaveLength(0);
    expect(project.name).toBe('');
  });

  it('returns parseError for non-object root', () => {
    const project = parseJviDocument('"just a string"');

    expect(project.parseError).toBe('Root is not a JSON object');
  });

  it('provides correct line positions', () => {
    const project = parseJviDocument(VALID_JVI);

    // Project name range should be on a line after the first
    expect(project.nameRange).toBeDefined();
    expect(project.nameRange!.startLine).toBeGreaterThan(0);
  });
});

// ─── findSrcNodeAtOffset ────────────────────────────────────────────────────

describe('findSrcNodeAtOffset', () => {
  it('finds src value at cursor position', () => {
    const srcIdx = VALID_JVI.indexOf('"media/clip1.mp4"');
    expect(srcIdx).toBeGreaterThan(-1);

    // Position cursor inside the src value string
    const result = findSrcNodeAtOffset(VALID_JVI, srcIdx + 1);

    expect(result).not.toBeNull();
    expect(result!.value).toBe('media/clip1.mp4');
  });

  it('returns null for non-src string values', () => {
    const nameIdx = VALID_JVI.indexOf('"Clip 1"');
    expect(nameIdx).toBeGreaterThan(-1);

    const result = findSrcNodeAtOffset(VALID_JVI, nameIdx + 1);

    expect(result).toBeNull();
  });

  it('returns null for offset outside strings', () => {
    const result = findSrcNodeAtOffset(VALID_JVI, 0);

    expect(result).toBeNull();
  });
});

// ─── findLinkedIdAtOffset ───────────────────────────────────────────────────

describe('findLinkedIdAtOffset', () => {
  it('finds linked_video_id at cursor position', () => {
    // Find the value "el-1" that appears after "linked_video_id"
    const linkedIdx = VALID_JVI.indexOf('"linked_video_id"');
    expect(linkedIdx).toBeGreaterThan(-1);
    // The value is after the key + colon + space + quote
    const valueIdx = VALID_JVI.indexOf('"el-1"', linkedIdx);
    expect(valueIdx).toBeGreaterThan(-1);

    const result = findLinkedIdAtOffset(VALID_JVI, valueIdx + 1);

    expect(result).not.toBeNull();
    expect(result!.field).toBe('linked_video_id');
    expect(result!.value).toBe('el-1');
  });

  it('returns null for non-linked-id strings', () => {
    const nameIdx = VALID_JVI.indexOf('"Clip 1"');
    const result = findLinkedIdAtOffset(VALID_JVI, nameIdx + 1);

    expect(result).toBeNull();
  });
});

// ─── findElementIdRange ─────────────────────────────────────────────────────

describe('findElementIdRange', () => {
  it('finds element ID range by value', () => {
    const range = findElementIdRange(VALID_JVI, 'el-1');

    expect(range).not.toBeNull();
    expect(range!.startLine).toBeGreaterThan(0);
  });

  it('returns null for non-existent element ID', () => {
    const range = findElementIdRange(VALID_JVI, 'non-existent');

    expect(range).toBeNull();
  });
});
