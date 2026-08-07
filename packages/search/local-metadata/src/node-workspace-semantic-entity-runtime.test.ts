import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeWorkspaceSemanticEntityMetadataBinding } from './node-workspace-semantic-entity-metadata-binding';
import { createNodeWorkspaceSemanticEntityRuntime } from './node-workspace-semantic-entity-runtime';

describe('Node Workspace Semantic Entity runtime', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('reconciles structural candidates and removes projections when the source disappears', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-semantic-runtime-'));
    roots.push(root);
    const homedir = path.join(root, 'home');
    const workspacePath = path.join(root, 'workspace');
    await Promise.all([
      mkdir(homedir, { recursive: true }),
      mkdir(workspacePath, { recursive: true }),
    ]);
    const sourcePath = path.join(workspacePath, 'episode.fountain');
    await writeFile(sourcePath, 'MIO\nHello.\n', 'utf8');
    const binding = await createNodeWorkspaceSemanticEntityMetadataBinding({
      homedir,
      workDir: workspacePath,
      createWorkspaceId: () => WORKSPACE_ID,
      now: () => NOW,
    });
    const runtime = await createNodeWorkspaceSemanticEntityRuntime({
      workspace: { workspaceId: WORKSPACE_ID, workspacePath },
      projection: binding,
      getEntitySnapshot: async () => ({ entities: [] }),
      now: () => NOW,
    });

    await expect(runtime.refresh()).resolves.toMatchObject({ processed: 1, diagnosticCount: 0 });
    await expect(binding.listCandidateProjections()).resolves.toEqual([
      expect.objectContaining({
        kind: 'character',
        proposedNames: { canonical: 'MIO', aliases: [] },
        evidence: [expect.objectContaining({ owner: 'workspace' })],
      }),
    ]);

    await rm(sourcePath);
    await expect(runtime.refresh()).resolves.toMatchObject({ deleted: 1, diagnosticCount: 0 });
    await expect(binding.listCandidateProjections()).resolves.toEqual([]);

    runtime.dispose();
    await binding.dispose();
  });
});

const NOW = '2026-08-05T04:00:00.000Z';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
