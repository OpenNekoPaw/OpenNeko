import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectWorkspaceStorage } from '../node-workspace-storage-inspection';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Workspace storage inspection', () => {
  it('inventories legacy metadata, misplaced facts, managed files, and explicit personal content', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'neko-workspace-storage-inspection-'));
    temporaryDirectories.push(workDir);
    await writeWorkspaceFile(workDir, '.neko/neko-local.db', 'legacy database');
    await writeWorkspaceFile(workDir, '.neko/.cache/resources/manifest.json', '{}');
    await writeWorkspaceFile(workDir, '.neko/.cache/blob.bin', 'large cache bytes');
    await writeWorkspaceFile(workDir, '.neko/entity-bindings.json', '{}');
    await writeWorkspaceFile(workDir, '.neko/logs/events.jsonl', '{"event":"test"}\n');
    await writeWorkspaceFile(workDir, '.neko/recordings/preview.mp4', 'preview');
    await writeWorkspaceFile(workDir, '.neko/imports/models/hero.glb', 'model');
    await writeWorkspaceFile(workDir, '.neko/tmp/import.partial', 'partial');
    await mkdir(join(workDir, '.neko', 'hooks'), { recursive: true });
    await mkdir(join(workDir, '.neko', 'skills'), { recursive: true });

    const report = await inspectWorkspaceStorage({
      workDir,
      largeCacheThresholdBytes: 10,
      contentObservations: [
        {
          relativePath: '.neko/processors/upscale.neko-processor.json',
          kind: 'processor',
          intendedScope: 'personal',
        },
        {
          relativePath: '.neko/prompts/project-review.md',
          kind: 'prompt',
          intendedScope: 'project',
        },
      ],
    });

    expect(report.workspaceRoot).toBe(workDir);
    expect(report.totalCacheBytes).toBeGreaterThanOrEqual(10);
    expect(report.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'retired-workspace-database',
          relativePath: '.neko/neko-local.db',
          kind: 'legacy-database',
        }),
        expect.objectContaining({
          code: 'legacy-workspace-metadata',
          relativePath: '.neko/.cache/resources/manifest.json',
          kind: 'legacy-manifest',
        }),
        expect.objectContaining({
          code: 'misplaced-project-fact',
          relativePath: '.neko/entity-bindings.json',
          suggestedTarget: 'neko/entity-bindings.json',
        }),
        expect.objectContaining({
          code: 'large-workspace-cache',
          relativePath: '.neko/.cache',
          kind: 'large-cache',
        }),
        expect.objectContaining({ code: 'workspace-logs-present', relativePath: '.neko/logs' }),
        expect.objectContaining({
          code: 'preview-recordings-present',
          relativePath: '.neko/recordings',
        }),
        expect.objectContaining({
          code: 'import-staging-present',
          relativePath: '.neko/imports',
        }),
        expect.objectContaining({
          code: 'temporary-storage-present',
          relativePath: '.neko/tmp',
        }),
        expect.objectContaining({
          code: 'deprecated-hook-catalog',
          relativePath: '.neko/hooks',
        }),
        expect.objectContaining({
          code: 'deprecated-workspace-directory',
          relativePath: '.neko/skills',
          suggestedTarget: '.agents/skills',
        }),
        expect.objectContaining({
          code: 'misplaced-personal-content',
          relativePath: '.neko/processors/upscale.neko-processor.json',
          suggestedTarget: '~/.neko/processors',
        }),
      ]),
    );
    expect(report.entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relativePath: '.neko/prompts/project-review.md' }),
      ]),
    );
  });

  it('does not follow symbolic links while calculating workspace cache size', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'neko-workspace-cache-boundary-'));
    const outsideDir = await mkdtemp(join(tmpdir(), 'neko-workspace-cache-outside-'));
    temporaryDirectories.push(workDir, outsideDir);
    await mkdir(join(workDir, '.neko', '.cache'), { recursive: true });
    await writeFile(join(outsideDir, 'valuable.bin'), 'outside workspace bytes', 'utf8');
    await symlink(outsideDir, join(workDir, '.neko', '.cache', 'outside-link'));

    const report = await inspectWorkspaceStorage({ workDir, largeCacheThresholdBytes: 1 });

    expect(report.totalCacheBytes).toBe(0);
    expect(report.entries).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'large-workspace-cache' })]),
    );
  });
});

async function writeWorkspaceFile(
  workDir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const path = join(workDir, relativePath);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
}
