import { describe, expect, it, vi } from 'vitest';
import type { CutExportTaskSnapshot } from '@neko-cut/domain';
import { CutExportTaskRegistry, createInMemoryExportJobStore } from '@neko-cut/node';

describe('CutExportTaskRegistry', () => {
  it('owns an export after the Webview request returns and publishes terminal state', async () => {
    let finish: (() => void) | undefined;
    const updates = vi.fn();
    const registry = createRegistry(updates);

    const task = await registry.start({
      documentUri: 'file:///workspace/demo.otio',
      sessionId: 'session-1',
      sourceRevision: 4,
      settings: {
        outputName: 'Project',
        container: 'mp4',
        width: 1920,
        height: 1080,
        framesPerSecond: 30,
        videoBitrate: 8_000_000,
        includeAudio: true,
        audioBitrate: 192_000,
        audioSampleRate: 48_000,
      },
      outputWorkspaceRelativePath: 'exports/demo.mp4',
      run: () => new Promise<void>((resolve) => (finish = resolve)),
    });

    expect(task.status).toBe('running');
    expect(registry.list('file:///workspace/demo.otio')).toHaveLength(1);
    await vi.waitFor(() => expect(finish).toBeDefined());
    finish?.();
    await vi.waitFor(() => expect(registry.get('job-1')?.status).toBe('completed'));
    expect(updates).toHaveBeenLastCalledWith(
      expect.objectContaining({ jobId: 'job-1', status: 'completed' }),
    );
  });

  it('cancels only the explicit job owned by the requested document', async () => {
    const registry = createRegistry(() => undefined);
    let signal: AbortSignal | undefined;
    await registry.start({
      documentUri: 'file:///workspace/demo.otio',
      sessionId: 'session-1',
      sourceRevision: 1,
      settings: {
        outputName: 'Project',
        container: 'mp4',
        width: 1920,
        height: 1080,
        framesPerSecond: 30,
        videoBitrate: 8_000_000,
        includeAudio: true,
        audioBitrate: 192_000,
        audioSampleRate: 48_000,
      },
      outputWorkspaceRelativePath: 'exports/demo.mp4',
      run: (nextSignal) => {
        signal = nextSignal;
        return new Promise<void>(() => undefined);
      },
    });

    await expect(registry.cancel('file:///workspace/other.otio', 'job-1')).rejects.toThrow(
      'does not belong',
    );
    await vi.waitFor(() => expect(signal).toBeDefined());
    await registry.cancel('file:///workspace/demo.otio', 'job-1');
    expect(signal?.aborted).toBe(true);
    expect(registry.get('job-1')?.status).toBe('cancelled');
  });

  it('publishes a structured failure diagnostic without exposing the raw provider message', async () => {
    const registry = createRegistry(() => undefined);
    await registry.start({
      documentUri: 'file:///workspace/demo.otio',
      sessionId: 'session-1',
      sourceRevision: 1,
      settings: {
        outputName: 'Project',
        container: 'mp4',
        width: 1920,
        height: 1080,
        framesPerSecond: 30,
        videoBitrate: 8_000_000,
        includeAudio: true,
        audioBitrate: 192_000,
        audioSampleRate: 48_000,
      },
      outputWorkspaceRelativePath: 'exports/demo.mp4',
      run: async () => {
        throw new Error('codec exploded');
      },
    });

    await vi.waitFor(() => expect(registry.get('job-1')?.status).toBe('failed'));
    expect(registry.get('job-1')).toMatchObject({
      diagnostic: { code: 'export-failed' },
    });
    expect(registry.get('job-1')).not.toHaveProperty('error');
  });
});

function createRegistry(onUpdate: (task: CutExportTaskSnapshot) => void): CutExportTaskRegistry {
  return new CutExportTaskRegistry({
    store: createInMemoryExportJobStore(),
    onUpdate,
    createJobId: () => 'job-1',
    pollIntervalMs: 1,
  });
}
