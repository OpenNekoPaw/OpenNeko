import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  projectTargetMembershipRelativePath,
  serializeProjectTargetMembershipFact,
} from '@neko/project/contracts';
import { ProjectCompositionCommitService } from '@neko/project/application';
import { ProjectMembershipRepository } from './project-membership-repository';

const authority = { workspaceId: 'workspace-1', projectId: 'project-1' };
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ProjectMembershipRepository', () => {
  it('atomically commits local memberships and exact global references', async () => {
    const repository = new ProjectMembershipRepository(await fixture(), authority);
    const service = new ProjectCompositionCommitService({ repository });
    await service.addTarget({
      projectId: authority.projectId,
      target: { kind: 'character-project', characterProjectId: 'character-project-1' },
    });
    await service.addGlobalReference({
      projectId: authority.projectId,
      reference: {
        kind: 'character-version',
        globalCharacterId: 'global-character-1',
        characterVersionId: 'character-version-1',
      },
    });
    await service.addGlobalReference({
      projectId: authority.projectId,
      reference: {
        kind: 'world-version',
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-1',
      },
    });

    await expect(repository.read()).resolves.toMatchObject({
      authority,
      targets: [
        {
          projectId: authority.projectId,
          target: { kind: 'character-project', characterProjectId: 'character-project-1' },
        },
      ],
      globalReferences: [
        {
          projectId: authority.projectId,
          reference: {
            kind: 'character-version',
            globalCharacterId: 'global-character-1',
            characterVersionId: 'character-version-1',
          },
        },
        {
          projectId: authority.projectId,
          reference: {
            kind: 'world-version',
            globalWorldId: 'global-world-1',
            worldVersionId: 'world-version-1',
          },
        },
      ],
      diagnostics: [],
    });

    await service.updateGlobalReference({
      previous: {
        projectId: authority.projectId,
        reference: {
          kind: 'world-version',
          globalWorldId: 'global-world-1',
          worldVersionId: 'world-version-1',
        },
      },
      next: {
        projectId: authority.projectId,
        reference: {
          kind: 'world-version',
          globalWorldId: 'global-world-1',
          worldVersionId: 'world-version-2',
        },
      },
    });
    await service.removeGlobalReference({
      projectId: authority.projectId,
      reference: {
        kind: 'character-version',
        globalCharacterId: 'global-character-1',
        characterVersionId: 'character-version-1',
      },
    });
    await expect(repository.read()).resolves.toMatchObject({
      globalReferences: [
        {
          reference: {
            kind: 'world-version',
            globalWorldId: 'global-world-1',
            worldVersionId: 'world-version-2',
          },
        },
      ],
    });
  });

  it('rejects another Project authority before writing', async () => {
    const repository = new ProjectMembershipRepository(await fixture(), authority);
    await expect(
      repository.commitGlobalReference({
        projectId: 'project-other',
        reference: {
          kind: 'world-version',
          globalWorldId: 'global-world-1',
          worldVersionId: 'world-version-1',
        },
      }),
    ).rejects.toThrow('another Project');
    await expect(repository.read()).resolves.toMatchObject({
      targets: [],
      globalReferences: [],
      diagnostics: [],
    });
  });

  it('does not read obsolete output records', async () => {
    const workspaceRoot = await fixture();
    const repository = new ProjectMembershipRepository(workspaceRoot, authority);
    const obsoleteDirectory = path.join(workspaceRoot, 'neko/project-membership/outputs');
    await import('node:fs/promises').then(({ mkdir }) =>
      mkdir(obsoleteDirectory, { recursive: true }),
    );
    await writeFile(
      path.join(obsoleteDirectory, 'obsolete.json'),
      JSON.stringify({ installedDependencies: [] }),
      'utf8',
    );

    await expect(repository.read()).resolves.toMatchObject({
      targets: [],
      globalReferences: [],
      diagnostics: [],
    });
  });

  it('preserves invalid bytes and returns valid sibling records with a local diagnostic', async () => {
    const workspaceRoot = await fixture();
    const repository = new ProjectMembershipRepository(workspaceRoot, authority);
    const valid = {
      projectId: authority.projectId,
      target: { kind: 'character-project' as const, characterProjectId: 'character-project-1' },
    };
    await repository.commitTarget(valid);
    const invalidRelativePath = projectTargetMembershipRelativePath({
      kind: 'world-project',
      worldProjectId: 'world-project-broken',
    });
    const invalidPath = path.join(workspaceRoot, ...invalidRelativePath.split('/'));
    await writeFile(invalidPath, '{not-json', 'utf8');

    await expect(repository.read()).resolves.toMatchObject({
      targets: [valid],
      diagnostics: [{ code: 'invalid-project-target-membership' }],
    });
    await expect(readFile(invalidPath, 'utf8')).resolves.toBe('{not-json');
    const validPath = path.join(
      workspaceRoot,
      ...projectTargetMembershipRelativePath(valid.target).split('/'),
    );
    await expect(readFile(validPath, 'utf8')).resolves.toBe(
      serializeProjectTargetMembershipFact(valid),
    );
  });
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-project-membership-'));
  roots.push(root);
  return root;
}
