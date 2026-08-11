import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import {
  createProjectCompositionFileRepository,
  PROJECT_COMPOSITION_RELATIVE_PATH,
} from './project-composition-file-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('Project composition file repository', () => {
  it('writes and reads the one canonical workspace-relative file', async () => {
    const root = await workspace();
    const repository = createProjectCompositionFileRepository({ workspaceRoot: root });
    await repository.save({
      contentProjectId: 'content-project-1',
      localTargets: [{ kind: 'world-project', worldProjectId: 'world-1' }],
      dependencies: [],
    });
    await expect(repository.read()).resolves.toMatchObject({
      contentProjectId: 'content-project-1',
    });
    const source = await readFile(join(root, PROJECT_COMPOSITION_RELATIVE_PATH), 'utf8');
    expect(JSON.parse(source)).toEqual({
      contentProjectId: 'content-project-1',
      localTargets: [{ kind: 'world-project', worldProjectId: 'world-1' }],
      dependencies: [],
    });
  });

  it('returns fresh absence only for a missing canonical file', async () => {
    const repository = createProjectCompositionFileRepository({ workspaceRoot: await workspace() });
    await expect(repository.read()).resolves.toBeUndefined();
  });

  it('fails visibly for malformed content and preserves it', async () => {
    const root = await workspace();
    const path = join(root, PROJECT_COMPOSITION_RELATIVE_PATH);
    await mkdir(join(root, 'neko'), { recursive: true });
    await writeFile(path, '{broken', 'utf8');
    const repository = createProjectCompositionFileRepository({ workspaceRoot: root });
    await expect(repository.read()).rejects.toMatchObject({ code: 'project-composition-invalid' });
    await expect(readFile(path, 'utf8')).resolves.toBe('{broken');
  });

  it('rejects relative or unavailable roots instead of selecting another authority', async () => {
    expect(() => createProjectCompositionFileRepository({ workspaceRoot: 'relative' })).toThrow(
      'absolute Host-authorized path',
    );
    const repository = createProjectCompositionFileRepository({
      workspaceRoot: join(tmpdir(), 'missing-openneko-project-root'),
    });
    await expect(repository.read()).rejects.toMatchObject({
      code: 'project-workspace-unavailable',
    });
  });

  it('rejects a symlinked neko directory that escapes the Workspace', async () => {
    const root = await workspace();
    const outside = await workspace();
    await symlink(outside, join(root, 'neko'));
    const repository = createProjectCompositionFileRepository({ workspaceRoot: root });
    await expect(
      repository.save({
        contentProjectId: 'content-project-1',
        localTargets: [],
        dependencies: [],
      }),
    ).rejects.toMatchObject({ code: 'project-workspace-path-escape' });
  });
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-project-'));
  roots.push(root);
  return root;
}
