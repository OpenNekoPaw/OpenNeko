import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SerializableTask, TaskRunScope } from '@neko/shared';
import { createExtensionLocalMetadata } from '../../chat/extensionLocalMetadata';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('Extension Agent persistence bootstrap', () => {
  it('assembles the canonical SQLite Task stores without a migration facade', async () => {
    const homedir = mkdtempSync(join(tmpdir(), 'neko-agent-extension-home-'));
    const workDir = join(homedir, 'workspace');
    mkdirSync(workDir);
    tempRoots.push(homedir);
    const task = createSerializableTask('workspace-task');
    const binding = await createExtensionLocalMetadata({ homedir, workDir });

    expect(binding).not.toHaveProperty('taskMigration');
    await binding.taskStorage.save(task);
    await expect(binding.taskStorage.load(task.scope)).resolves.toEqual(task);
    expect(binding.resourceCacheMigrationReport).toMatchObject({ sourceStatus: 'absent' });
    expect(binding.proxyMigrationReport).toMatchObject({ sourceStatus: 'absent' });
    await expect(binding.workspaceResourceCacheManifestStore.load()).resolves.toMatchObject({
      projectRoot: workDir,
      entries: {},
    });

    await binding.disposeHost();
  });
});

function createSerializableTask(id: string): SerializableTask {
  return {
    scope: taskScope(id),
    id,
    type: 'custom',
    status: 'running',
    input: { type: 'custom', payload: {} },
    progress: 50,
    createdAt: 1,
    updatedAt: 2,
  };
}

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-extension-task',
    runId: 'run-extension-task',
    parentRunId: 'run-extension-task',
    childRunId,
    childKind: 'task',
  };
}
