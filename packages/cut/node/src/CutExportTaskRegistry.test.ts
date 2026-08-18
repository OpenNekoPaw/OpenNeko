import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import type { CutExportRequest, TimelineView } from '@neko/cut-domain';
import { createInMemoryExportJobStore } from './export-job/store';
import { CutExportTaskRegistry } from './CutExportTaskRegistry';

const workspaceRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    workspaceRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('CutExportTaskRegistry', () => {
  it('persists frozen timeline facts without the physical Workspace path', async () => {
    const store = createInMemoryExportJobStore();
    const workspacePath = await createWorkspaceFixture();
    const exportCalls: CutExportRequest[] = [];
    const registry = new CutExportTaskRegistry({
      store,
      workspacePath,
      pollIntervalMs: 1,
      createMediaAdapter: () => ({
        export: async (request) => {
          exportCalls.push(request);
          return { outputWorkspaceRelativePath: request.outputWorkspaceRelativePath };
        },
        dispose: async () => undefined,
      }),
      onUpdate: () => undefined,
    });

    const timeline = timelineView();
    const task = await registry.start({
      documentUri: timeline.documentUri,
      sessionId: timeline.sessionId,
      sourceSnapshotId: 'snapshot-1',
      timeline,
      settings: exportSettings(),
      outputWorkspaceRelativePath: 'exports/story.mp4',
    });

    await waitFor(() => registry.get(task.jobId)?.status === 'completed');
    const persisted = await store.get({ kind: 'export', jobId: task.jobId });
    expect(JSON.stringify(persisted)).not.toContain(workspacePath);
    expect(persisted.request.executionConfig).toMatchObject({
      sessionId: 'cut-session-1',
      sourceSnapshotId: 'snapshot-1',
      timeline: { documentUri: 'cuts/story.otio' },
    });
    expect(exportCalls).toHaveLength(1);
    expect(exportCalls[0]?.timeline.documentUri).toBe(
      pathToFileURL(await realpath(join(workspacePath, 'cuts/story.otio'))).href,
    );
    await registry.dispose();
  });

  it('isolates a recovered Job when the previous executor identity is unavailable', async () => {
    const store = createInMemoryExportJobStore();
    const workspacePath = await createWorkspaceFixture();
    let rejectExport: ((error: Error) => void) | undefined;
    const createMediaAdapter = () => ({
      export: (_request: CutExportRequest, signal?: AbortSignal) =>
        new Promise<{ readonly outputWorkspaceRelativePath: string }>((_resolve, reject) => {
          rejectExport = reject;
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
      dispose: async () => undefined,
    });
    const first = new CutExportTaskRegistry({
      store,
      workspacePath,
      createMediaAdapter,
      onUpdate: () => undefined,
    });
    const task = await first.start({
      documentUri: 'cuts/story.otio',
      sessionId: 'cut-session-1',
      sourceSnapshotId: 'snapshot-1',
      timeline: timelineView(),
      settings: exportSettings(),
      outputWorkspaceRelativePath: 'exports/story.mp4',
    });
    await waitFor(async () => {
      const snapshot = await store.get({ kind: 'export', jobId: task.jobId });
      return snapshot.phase === 'running' && snapshot.executionId !== undefined;
    });
    await first.dispose();
    rejectExport?.(new Error('aborted'));

    const second = new CutExportTaskRegistry({
      store,
      workspacePath,
      createMediaAdapter,
      onUpdate: () => undefined,
    });
    await second.recover();
    await waitFor(
      async () =>
        (await store.get({ kind: 'export', jobId: task.jobId })).phase === 'outcome-unknown',
    );
    expect(await store.get({ kind: 'export', jobId: task.jobId })).toMatchObject({
      phase: 'outcome-unknown',
      failure: { code: 'export-outcome-unknown' },
    });
    await second.dispose();
  });
});

function timelineView(): TimelineView {
  return {
    documentUri: 'cuts/story.otio',
    sessionId: 'cut-session-1',
    name: 'Story',
    durationSeconds: 1,
    tracks: [],
  };
}

async function createWorkspaceFixture(): Promise<string> {
  const workspacePath = await mkdtemp(join(tmpdir(), 'openneko-cut-export-owner-'));
  workspaceRoots.push(workspacePath);
  await mkdir(join(workspacePath, 'cuts'), { recursive: true });
  await writeFile(join(workspacePath, 'cuts/story.otio'), '{}', 'utf8');
  return workspacePath;
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

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 2_000) {
  const startedAt = Date.now();
  while (!(await condition())) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error('Timed out waiting for Export Job.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
