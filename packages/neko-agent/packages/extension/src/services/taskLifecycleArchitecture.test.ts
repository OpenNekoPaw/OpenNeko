import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../..');

describe('agent async task lifecycle architecture guards', () => {
  it('keeps shared lifecycle task types free of host dependencies', () => {
    const source = readRepoFile('packages/neko-types/src/types/task.ts');

    expect(source).toContain('TaskLifecycleMetadata');
    expect(source).not.toMatch(/from ['"]vscode['"]/);
    expect(source).not.toMatch(/from ['"]react['"]/);
    expect(source).not.toMatch(/@neko\/agent/);
  });

  it('lets platform report cost phase without importing agent internals', () => {
    const source = readRepoFile(
      'packages/neko-agent/packages/platform/src/media/media-task-executor.ts',
    );

    expect(source).toContain('reportLifecycle');
    expect(source).toContain('external-wait');
    expect(source).not.toMatch(/from ['"]@neko\/agent/);
  });

  it('keeps lifecycle coordinator compose-only in the extension bridge', () => {
    const source = readRepoFile(
      'packages/neko-agent/packages/extension/src/services/taskLifecycleCoordinator.ts',
    );

    expect(source).toContain('TaskLifecycleCoordinator');
    expect(source).not.toContain('saveRecoveryInfo');
    expect(source).not.toContain('updateLifecycle');
    expect(source).not.toContain('DashboardTask');
  });
});

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}
