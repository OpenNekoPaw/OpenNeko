import { describe, expect, it } from 'vitest';
import { projectExportJobActivity } from './activity';
import type { ExportJobSnapshot } from './contracts';

describe('Export Job Activity projection', () => {
  it('excludes document, output and Engine-private identities', () => {
    const activity = projectExportJobActivity(snapshot());

    expect(activity).toEqual({
      jobKind: 'export',
      jobId: 'export-1',
      phase: 'running',
      jobRevision: 3,
      createdAt: 100,
      updatedAt: 120,
      label: 'MP4 export',
      format: 'mp4',
      progress: { stage: 'waiting-engine', percent: 35 },
      supportedCommands: ['cancel', 'reconcile'],
    });
    const serialized = JSON.stringify(activity);
    expect(serialized).not.toContain('file:///private/project.nkv');
    expect(serialized).not.toContain('/private/output.mp4');
    expect(serialized).not.toContain('engine-export-1');
  });
});

function snapshot(): ExportJobSnapshot {
  return {
    ref: { kind: 'export', jobId: 'export-1' },
    phase: 'running',
    revision: 3,
    createdAt: 100,
    updatedAt: 120,
    request: {
      documentUri: 'file:///private/project.nkv',
      config: {
        outputPath: '/private/output.mp4',
        format: 'mp4',
        width: 1920,
        height: 1080,
        fps: 30,
        quality: 'high',
        audioBitrate: 192,
      },
      engineConfig: {},
    },
    progress: {
      stage: 'waiting-engine',
      percent: 35,
      currentFrame: 35,
      totalFrames: 100,
      elapsedMs: 1_000,
      estimatedRemainingMs: 2_000,
      currentFps: 30,
    },
    engineJobId: 'engine-export-1',
  };
}
