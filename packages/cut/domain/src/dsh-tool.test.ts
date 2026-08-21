import { describe, expect, it } from 'vitest';

import type { CutProjectSnapshot } from './cut-project-authoring-service';
import {
  CUT_DSH_MAX_ITEMS_PER_TRACK,
  CUT_DSH_MAX_TRACKS,
  CUT_DSH_TOOL_NAME,
  decodeCutDshToolInput,
  projectCutDshToolFacts,
} from './dsh-tool';

describe('Cut DSH tool contract', () => {
  it('accepts exact query and bounded semantic edit commands', () => {
    expect(CUT_DSH_TOOL_NAME).toBe('openneko.cut');
    expect(decodeCutDshToolInput('query', { documentPath: 'cuts/story.otio' })).toEqual({
      operation: 'query',
      input: { documentPath: 'cuts/story.otio' },
    });
    expect(
      decodeCutDshToolInput('apply', {
        documentPath: 'cuts/story.otio',
        commands: [
          { type: 'split', clipId: 'clip-1', offsetFrames: 12, rightClipId: 'clip-2' },
          { type: 'set-audio', clipId: 'clip-1', settings: { muted: false, gainDb: -3 } },
        ],
      }),
    ).toMatchObject({
      operation: 'apply',
      input: {
        documentPath: 'cuts/story.otio',
        commands: [{ type: 'split' }, { type: 'set-audio' }],
      },
    });
  });

  it('rejects raw paths, retired fingerprint, unknown fields, unsupported media links and invalid semantics', () => {
    expect(() => decodeCutDshToolInput('query', { documentPath: '/tmp/story.otio' })).toThrow(
      /normalized Workspace-relative \.otio path/,
    );
    expect(() => decodeCutDshToolInput('query', { documentPath: 'cuts/story.json' })).toThrow(
      /normalized Workspace-relative \.otio path/,
    );
    expect(() =>
      decodeCutDshToolInput('apply', {
        documentPath: 'cuts/story.otio',
        expectedFingerprint: { strategy: 'sha256', value: '' },
        commands: [{ type: 'trim-trailing-gaps' }],
      }),
    ).toThrow(/expectedFingerprint is not supported/);
    expect(() =>
      decodeCutDshToolInput('apply', {
        documentPath: 'cuts/story.otio',
        commands: [{ type: 'link-media', targetUrl: '/tmp/video.mp4' }],
      }),
    ).toThrow(/not supported by the Cut DSH tool/);
    expect(() =>
      decodeCutDshToolInput('apply', {
        documentPath: 'cuts/story.otio',
        commands: [{ type: 'split', clipId: 'clip-1', offsetFrames: 0, rightClipId: 'clip-2' }],
      }),
    ).toThrow(/must be positive/);
    expect(() =>
      decodeCutDshToolInput('query', { documentPath: 'cuts/story.otio', activeView: true }),
    ).toThrow(/activeView is not supported/);
  });

  it('projects bounded timeline facts without media target URLs or full OTIO bytes', () => {
    const snapshot = cutSnapshot(CUT_DSH_MAX_TRACKS + 1, CUT_DSH_MAX_ITEMS_PER_TRACK + 1);
    const facts = projectCutDshToolFacts(snapshot);

    expect(facts.trackCount).toBe(CUT_DSH_MAX_TRACKS + 1);
    expect(facts.tracks).toHaveLength(CUT_DSH_MAX_TRACKS);
    expect(facts.tracksTruncated).toBe(true);
    expect(facts.tracks[0]?.items).toHaveLength(CUT_DSH_MAX_ITEMS_PER_TRACK);
    expect(facts.tracks[0]?.itemsTruncated).toBe(true);
    expect(JSON.stringify(facts)).not.toContain('target_url');
    expect(JSON.stringify(facts)).not.toContain('file:///');
    expect(facts).not.toHaveProperty('timeline');
    expect(facts).not.toHaveProperty('fingerprint');
  });

  it('accepts bounded export operations and rejects path escapes', () => {
    const settings = exportSettings();
    expect(
      decodeCutDshToolInput('export-submit', {
        documentPath: 'cuts/story.otio',
        sessionId: 'cut-session:one',
        outputWorkspaceRelativePath: 'exports/story.mp4',
        settings,
      }),
    ).toMatchObject({ operation: 'export-submit', input: { settings } });
    expect(
      decodeCutDshToolInput('export-describe', {
        documentPath: 'cuts/story.otio',
        jobId: 'job:one',
      }),
    ).toEqual({
      operation: 'export-describe',
      input: { documentPath: 'cuts/story.otio', jobId: 'job:one' },
    });
    expect(() =>
      decodeCutDshToolInput('export-submit', {
        documentPath: 'cuts/story.otio',
        sessionId: 'cut-session:one',
        outputWorkspaceRelativePath: '../exports/story.mp4',
        settings,
      }),
    ).toThrow(/Workspace-relative/);
    expect(() =>
      decodeCutDshToolInput('export-submit', {
        documentPath: 'cuts/story.otio',
        sessionId: 'cut-session:one',
        outputWorkspaceRelativePath: 'exports/story.mov',
        settings,
      }),
    ).toThrow(/selected container/);
  });
});

function cutSnapshot(trackCount: number, itemCount: number): CutProjectSnapshot {
  return {
    documentPath: 'cuts/story.otio',
    fingerprint: { strategy: 'sha256', value: 'fingerprint' },
    timeline: {
      documentUri: 'cuts/story.otio',
      name: 'Story',
      durationSeconds: itemCount,
      tracks: Array.from({ length: trackCount }, (_track, trackIndex) => ({
        trackId: `track-${trackIndex}`,
        name: `Track ${trackIndex}`,
        kind: 'Video' as const,
        enabled: true,
        locked: false,
        audioMuted: false,
        items: Array.from({ length: itemCount }, (_item, itemIndex) => ({
          kind: 'clip' as const,
          clipId: `clip-${trackIndex}-${itemIndex}`,
          name: `Clip ${itemIndex}`,
          targetUrl: 'file:///private/source.mp4',
          startSeconds: itemIndex,
          durationSeconds: 1,
          sourceStartSeconds: 0,
          playbackRate: 1,
          enabled: true,
          locked: false,
          audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
        })),
      })),
    },
  };
}

function exportSettings() {
  return {
    outputName: 'story',
    container: 'mp4' as const,
    width: 1920,
    height: 1080,
    framesPerSecond: 30,
    videoBitrate: 8_000_000,
    includeAudio: false,
    audioBitrate: 192_000,
    audioSampleRate: 48_000 as const,
  };
}
