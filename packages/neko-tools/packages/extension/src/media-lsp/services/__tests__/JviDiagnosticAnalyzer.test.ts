import { describe, it, expect } from 'vitest';
import { checkStructure, checkReferences } from '../JviDiagnosticAnalyzer';
import { parseJviDocument } from '../JviParser';
import type { ProbeResultLike } from '../types';

// ─── Helper ─────────────────────────────────────────────────────────────────

function parse(obj: Record<string, unknown>) {
  return parseJviDocument(JSON.stringify(obj, null, 2));
}

// ─── checkStructure ─────────────────────────────────────────────────────────

describe('checkStructure', () => {
  it('returns no diagnostics for valid project', () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [
        {
          id: 't1',
          name: 'Track 1',
          track_type: 'video',
          elements: [
            { Media: { id: 'e1', name: 'Clip', src: 'a.mp4', duration: 10, start_time: 0 } },
          ],
        },
      ],
    });

    const entries = checkStructure(project);
    expect(entries).toHaveLength(0);
  });

  it('reports duplicate track names', () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [
        {
          id: 't1',
          name: 'Same Name',
          track_type: 'video',
          elements: [{ Media: { id: 'e1', name: 'a', duration: 1, start_time: 0 } }],
        },
        {
          id: 't2',
          name: 'Same Name',
          track_type: 'audio',
          elements: [{ Audio: { id: 'e2', name: 'b', duration: 1, start_time: 0 } }],
        },
      ],
    });

    const entries = checkStructure(project);
    const dupes = entries.filter((e) => e.code === 'duplicate-track-name');
    expect(dupes).toHaveLength(1);
    expect(dupes[0]!.severity).toBe('warning');
  });

  it('reports duplicate element IDs', () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [
        {
          id: 't1',
          name: 'Track',
          track_type: 'video',
          elements: [
            { Media: { id: 'same-id', name: 'a', duration: 1, start_time: 0 } },
            { Media: { id: 'same-id', name: 'b', duration: 2, start_time: 1 } },
          ],
        },
      ],
    });

    const entries = checkStructure(project);
    const dupes = entries.filter((e) => e.code === 'duplicate-element-id');
    expect(dupes.length).toBeGreaterThanOrEqual(2); // Both occurrences reported
  });

  it('reports broken linked element references', () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [
        {
          id: 't1',
          name: 'Track',
          track_type: 'video',
          elements: [
            {
              Audio: {
                id: 'a1',
                name: 'Audio',
                duration: 5,
                start_time: 0,
                linked_video_id: 'non-existent',
              },
            },
          ],
        },
      ],
    });

    const entries = checkStructure(project);
    const broken = entries.filter((e) => e.code === 'broken-element-link');
    expect(broken).toHaveLength(1);
    expect(broken[0]!.severity).toBe('error');
    expect(broken[0]!.message).toContain('non-existent');
  });

  it('reports empty tracks', () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [{ id: 't1', name: 'Empty Track', track_type: 'video', elements: [] }],
    });

    const entries = checkStructure(project);
    const empty = entries.filter((e) => e.code === 'empty-track');
    expect(empty).toHaveLength(1);
    expect(empty[0]!.severity).toBe('info');
  });

  it('reports invalid FPS', () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: -1,
      tracks: [],
    });

    const entries = checkStructure(project);
    const fpsErrors = entries.filter((e) => e.code === 'invalid-fps');
    expect(fpsErrors).toHaveLength(1);
  });

  it('reports invalid resolution', () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 0, height: 1080 },
      fps: 30,
      tracks: [],
    });

    const entries = checkStructure(project);
    const resErrors = entries.filter((e) => e.code === 'invalid-resolution');
    expect(resErrors).toHaveLength(1);
  });
});

// ─── checkReferences ────────────────────────────────────────────────────────

describe('checkReferences', () => {
  const mockProbe: ProbeResultLike = {
    duration: 10,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    format: 'mp4',
    hasAudio: true,
  };

  it('reports missing media files', async () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [
        {
          id: 't1',
          name: 'Track',
          track_type: 'video',
          elements: [
            {
              Media: { id: 'e1', name: 'Missing', src: 'missing.mp4', duration: 5, start_time: 0 },
            },
          ],
        },
      ],
    });

    const entries = await checkReferences(
      project,
      '/project',
      async () => false, // All files missing
      async () => null,
    );

    const missing = entries.filter((e) => e.code === 'missing-media-ref');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.severity).toBe('error');
  });

  it('reports duration mismatch', async () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [
        {
          id: 't1',
          name: 'Track',
          track_type: 'video',
          elements: [
            { Media: { id: 'e1', name: 'Long', src: 'clip.mp4', duration: 20, start_time: 0 } },
          ],
        },
      ],
    });

    const entries = await checkReferences(
      project,
      '/project',
      async () => true,
      async () => ({ ...mockProbe, duration: 10 }), // Source is only 10s, element claims 20s
    );

    const mismatch = entries.filter((e) => e.code === 'duration-mismatch');
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]!.severity).toBe('warning');
  });

  it('does not report duration mismatch within tolerance', async () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [
        {
          id: 't1',
          name: 'Track',
          track_type: 'video',
          elements: [
            { Media: { id: 'e1', name: 'OK', src: 'clip.mp4', duration: 10.5, start_time: 0 } },
          ],
        },
      ],
    });

    const entries = await checkReferences(
      project,
      '/project',
      async () => true,
      async () => ({ ...mockProbe, duration: 10 }), // 10.5 < 10 * 1.1 = 11
    );

    const mismatch = entries.filter((e) => e.code === 'duration-mismatch');
    expect(mismatch).toHaveLength(0);
  });

  it('reports resolution mismatch when scale ratio > 4', async () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [
        {
          id: 't1',
          name: 'Track',
          track_type: 'video',
          elements: [
            { Media: { id: 'e1', name: 'Tiny', src: 'tiny.mp4', duration: 5, start_time: 0 } },
          ],
        },
      ],
    });

    const entries = await checkReferences(
      project,
      '/project',
      async () => true,
      async () => ({ ...mockProbe, width: 320, height: 240 }), // 1920/320 = 6 > 4
    );

    const resMismatch = entries.filter((e) => e.code === 'resolution-mismatch');
    expect(resMismatch).toHaveLength(1);
    expect(resMismatch[0]!.severity).toBe('info');
  });

  it('returns empty for files without src', async () => {
    const project = parse({
      name: 'Test',
      version: '1.0.0',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [
        {
          id: 't1',
          name: 'Track',
          track_type: 'text',
          elements: [{ Text: { id: 'e1', name: 'Title', duration: 5, start_time: 0 } }],
        },
      ],
    });

    const entries = await checkReferences(
      project,
      '/project',
      async () => false,
      async () => null,
    );

    expect(entries).toHaveLength(0);
  });
});
