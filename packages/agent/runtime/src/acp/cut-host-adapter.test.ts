import type { DshAcpDomainToolRequest } from '@neko/agent-contracts/dsh-acp';
import type { CutProjectAuthoringService } from '@neko/cut-domain';
import { describe, expect, it, vi } from 'vitest';

import { CutDshHostAdapter } from './cut-host-adapter';

describe('Cut DSH Host adapter', () => {
  it('delegates exact fingerprint edits and returns bounded facts', async () => {
    const apply = vi.fn<Pick<CutProjectAuthoringService, 'apply'>['apply']>(async () => snapshot());
    const adapter = new CutDshHostAdapter({ query: vi.fn(), apply });

    await expect(adapter.execute(applyRequest())).resolves.toMatchObject({
      outcome: 'success',
      result: {
        documentPath: 'cuts/story.otio',
        fingerprint: { strategy: 'sha256', value: 'after' },
        trackCount: 0,
        tracks: [],
      },
    });
    expect(apply).toHaveBeenCalledWith({
      documentPath: 'cuts/story.otio',
      expectedFingerprint: { strategy: 'sha256', value: 'before' },
      commands: [{ type: 'trim-trailing-gaps' }],
    });
  });

  it('rejects schema errors before resolving a domain service', async () => {
    const resolveService = vi.fn();
    const adapter = new CutDshHostAdapter(resolveService);

    await expect(
      adapter.execute({ ...applyRequest(), input: { documentPath: '/tmp/story.otio' } }),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'CUT_DSH_TOOL_INVALID_INPUT' },
    });
    expect(resolveService).not.toHaveBeenCalled();
  });

  it('projects owning-domain CAS failure without trying another source', async () => {
    const adapter = new CutDshHostAdapter({
      query: vi.fn(),
      apply: vi.fn(async () => {
        throw Object.assign(new Error('Cut project changed.'), { code: 'stale-project' });
      }),
    });

    await expect(adapter.execute(applyRequest())).resolves.toEqual({
      outcome: 'failure',
      diagnostic: { code: 'stale-project', message: 'Cut project changed.' },
    });
  });

  it('delegates export submit/describe/cancel to the Workspace export owner', async () => {
    const submit = vi.fn(async () => exportTask('job:submit'));
    const describe = vi.fn(async () => exportTask('job:describe'));
    const cancel = vi.fn(async () => exportTask('job:cancel'));
    const adapter = new CutDshHostAdapter({
      query: vi.fn(),
      apply: vi.fn(),
      submit,
      describe,
      cancel,
    });

    await expect(adapter.execute(exportRequest('export-submit'))).resolves.toMatchObject({
      outcome: 'success',
      jobId: 'job:submit',
      result: { outputWorkspaceRelativePath: 'exports/story.mp4' },
    });
    await expect(adapter.execute(exportRequest('export-describe'))).resolves.toMatchObject({
      outcome: 'success',
      jobId: 'job:describe',
    });
    await expect(adapter.execute(exportRequest('export-cancel'))).resolves.toMatchObject({
      outcome: 'success',
      jobId: 'job:cancel',
    });
    expect(submit).toHaveBeenCalledOnce();
    expect(describe).toHaveBeenCalledWith({ documentPath: 'cuts/story.otio', jobId: 'job:one' });
    expect(cancel).toHaveBeenCalledWith({ documentPath: 'cuts/story.otio', jobId: 'job:one' });
  });

  it('returns a visible diagnostic when the export owner is not wired', async () => {
    const adapter = new CutDshHostAdapter({ query: vi.fn(), apply: vi.fn() });
    await expect(adapter.execute(exportRequest('export-describe'))).resolves.toEqual({
      outcome: 'failure',
      diagnostic: {
        code: 'CUT_DSH_EXPORT_OWNER_MISSING',
        message: 'Cut export Job owner is unavailable for this Workspace.',
      },
    });
  });
});

function applyRequest(): DshAcpDomainToolRequest {
  return {
    sessionId: 'dsh-session:one',
    turn: 1,
    toolCallId: 'call:cut',
    tool: 'openneko.cut',
    operation: 'apply',
    input: {
      documentPath: 'cuts/story.otio',
      expectedFingerprint: { strategy: 'sha256', value: 'before' },
      commands: [{ type: 'trim-trailing-gaps' }],
    },
  };
}

function snapshot() {
  return {
    documentPath: 'cuts/story.otio',
    fingerprint: { strategy: 'sha256' as const, value: 'after' },
    timeline: { documentUri: 'cuts/story.otio', name: 'Story', durationSeconds: 0, tracks: [] },
  };
}

function exportRequest(
  operation: 'export-submit' | 'export-describe' | 'export-cancel',
): DshAcpDomainToolRequest {
  return {
    sessionId: 'dsh-session:one',
    turn: 1,
    toolCallId: `call:${operation}`,
    tool: 'openneko.cut',
    operation,
    input:
      operation === 'export-submit'
        ? {
            documentPath: 'cuts/story.otio',
            sessionId: 'cut-session:one',
            outputWorkspaceRelativePath: 'exports/story.mp4',
            settings: {
              outputName: 'story',
              container: 'mp4',
              width: 1920,
              height: 1080,
              framesPerSecond: 30,
              videoBitrate: 8_000_000,
              includeAudio: false,
              audioBitrate: 192_000,
              audioSampleRate: 48_000,
            },
          }
        : { documentPath: 'cuts/story.otio', jobId: 'job:one' },
  };
}

function exportTask(jobId: string) {
  return {
    jobId,
    documentUri: 'cuts/story.otio',
    sessionId: 'cut-session:one',
    sourceSnapshotId: 'sha256:fingerprint',
    settings: {
      outputName: 'story',
      container: 'mp4' as const,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      videoBitrate: 8_000_000,
      includeAudio: false,
      audioBitrate: 192_000,
      audioSampleRate: 48_000 as const,
    },
    outputWorkspaceRelativePath: 'exports/story.mp4',
    status: 'running' as const,
    startedAt: 1,
  };
}
