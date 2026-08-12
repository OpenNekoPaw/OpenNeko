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
      entityCharacterAssociations: [],
    });
    await expect(repository.read()).resolves.toMatchObject({
      contentProjectId: 'content-project-1',
    });
    const source = await readFile(join(root, PROJECT_COMPOSITION_RELATIVE_PATH), 'utf8');
    expect(JSON.parse(source)).toEqual({
      contentProjectId: 'content-project-1',
      localTargets: [{ kind: 'world-project', worldProjectId: 'world-1' }],
      dependencies: [],
      entityCharacterAssociations: [],
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

  it('preserves one invalid association document without disabling a sibling Project', async () => {
    const invalidRoot = await workspace();
    const siblingRoot = await workspace();
    const invalidPath = join(invalidRoot, PROJECT_COMPOSITION_RELATIVE_PATH);
    await mkdir(join(invalidRoot, 'neko'), { recursive: true });
    const invalidBytes = `${JSON.stringify({
      contentProjectId: 'content-project-invalid',
      localTargets: [{ kind: 'character-project', characterProjectId: 'character-1' }],
      dependencies: [],
      entityCharacterAssociations: [
        {
          entityId: 'entity-1',
          characterProjectId: 'character-1',
          latestCharacterVersionId: 'character-version-latest',
        },
      ],
    })}\n`;
    await writeFile(invalidPath, invalidBytes, 'utf8');
    const invalid = createProjectCompositionFileRepository({ workspaceRoot: invalidRoot });
    const sibling = createProjectCompositionFileRepository({ workspaceRoot: siblingRoot });

    await expect(invalid.read()).rejects.toMatchObject({ code: 'project-composition-invalid' });
    await expect(readFile(invalidPath, 'utf8')).resolves.toBe(invalidBytes);
    await sibling.save({
      contentProjectId: 'content-project-sibling',
      localTargets: [],
      dependencies: [],
      entityCharacterAssociations: [],
    });
    await expect(sibling.read()).resolves.toMatchObject({
      contentProjectId: 'content-project-sibling',
      entityCharacterAssociations: [],
    });
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
        entityCharacterAssociations: [],
      }),
    ).rejects.toMatchObject({ code: 'project-workspace-path-escape' });
  });
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-project-'));
  roots.push(root);
  return root;
}
