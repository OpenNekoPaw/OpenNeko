import { describe, expect, it } from 'vitest';
import type { TimelineView } from '@neko-cut/domain';
import { freezeCutExportRequest } from './cutExportRequest';

const view: TimelineView = {
  documentUri: 'file:///workspace/project.otio',
  sessionId: 'session-1',
  revision: 7,
  name: 'Project',
  profile: {
    profile: '1080p30',
    editRateNumerator: 30,
    editRateDenominator: 1,
    width: 1920,
    height: 1080,
  },
  durationSeconds: 5,
  tracks: [],
};

describe('freezeCutExportRequest', () => {
  it('freezes the accepted Host revision and immutable job settings', () => {
    const frozen = freezeCutExportRequest(
      view,
      {
        documentUri: view.documentUri,
        sessionId: view.sessionId,
        expectedRevision: view.revision,
      },
      settings({ width: 1280, height: 720, framesPerSecond: 24 }),
    );

    expect(frozen).toMatchObject({
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      sourceRevision: 7,
      settings: {
        outputName: 'Project',
        container: 'mp4',
        width: 1280,
        height: 720,
        framesPerSecond: 24,
        videoBitrate: 8_000_000,
        includeAudio: true,
        audioBitrate: 192_000,
        audioSampleRate: 48_000,
      },
    });
    expect(frozen.timeline).not.toBe(view);
    expect(Object.isFrozen(frozen.timeline)).toBe(true);
    expect(Object.isFrozen(frozen.settings)).toBe(true);
  });

  it('rejects stale identity and invalid output settings visibly', () => {
    expect(() =>
      freezeCutExportRequest(
        view,
        { documentUri: view.documentUri, sessionId: view.sessionId, expectedRevision: 6 },
        settings(),
      ),
    ).toThrow('revision');
    expect(() =>
      freezeCutExportRequest(
        view,
        { documentUri: view.documentUri, sessionId: view.sessionId, expectedRevision: 7 },
        settings({ width: 0 }),
      ),
    ).toThrow('width');
  });
});

function settings(overrides: Partial<import('@neko-cut/domain').CutExportSettings> = {}) {
  return {
    outputName: 'Project',
    container: 'mp4' as const,
    width: 1920,
    height: 1080,
    framesPerSecond: 30,
    videoBitrate: 8_000_000,
    includeAudio: true,
    audioBitrate: 192_000,
    audioSampleRate: 48_000 as const,
    ...overrides,
  };
}
