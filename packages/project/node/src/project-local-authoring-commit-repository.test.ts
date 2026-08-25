import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { characterProjectPath } from '@neko/chara-node';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterProject,
} from '@neko/chara-domain/contracts';
import {
  PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH,
  encodeProjectEntityDocument,
  type ProjectEntityDocument,
} from '@neko/entity-domain';
import {
  projectEntityCharacterAssociationRelativePath,
  projectTargetMembershipRelativePath,
} from '@neko/project-domain/contracts';
import { worldProjectPath } from '@neko/world-node';
import type { WorldProject } from '@neko/world-domain/contracts';
import { ProjectLocalAuthoringCommitRepository } from './project-local-authoring-commit-repository';

const authority = { workspaceId: 'workspace-1', projectId: 'project-1' };
const timestamp = '2026-08-16T00:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ProjectLocalAuthoringCommitRepository', () => {
  it('commits Character, Entity association and membership as one Project operation', async () => {
    const workspaceRoot = await fixture();
    const previous = entityDocument([]);
    const next = entityDocument([
      {
        entityId: 'entity-1',
        kind: 'character',
        names: { canonical: 'Aster', display: 'Aster', aliases: [] },
        representations: [],
        lifecycle: { state: 'active' },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    const repository = new ProjectLocalAuthoringCommitRepository(workspaceRoot, authority);
    await repository.commitCharacter({
      authority,
      project: characterProject(),
      entityDocument: { previous, next },
      association: {
        projectId: authority.projectId,
        entityId: 'entity-1',
        characterProjectId: 'character-1',
      },
      membership: {
        projectId: authority.projectId,
        target: { kind: 'character-project', characterProjectId: 'character-1' },
      },
    });

    await expect(
      readJson(workspaceRoot, characterProjectPath('character-1')),
    ).resolves.toMatchObject({
      characterProjectId: 'character-1',
    });
    await expect(readJson(workspaceRoot, PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH)).resolves.toEqual(
      next,
    );
    await expect(
      readJson(workspaceRoot, projectEntityCharacterAssociationRelativePath('entity-1')),
    ).resolves.toMatchObject({ entityId: 'entity-1', characterProjectId: 'character-1' });
    await expect(
      readJson(
        workspaceRoot,
        projectTargetMembershipRelativePath({
          kind: 'character-project',
          characterProjectId: 'character-1',
        }),
      ),
    ).resolves.toMatchObject({ projectId: authority.projectId });
  });

  it('rejects a conflicting Character target before mutating Entity or membership facts', async () => {
    const workspaceRoot = await fixture();
    const previous = entityDocument([]);
    await writeRelative(
      workspaceRoot,
      PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH,
      encodeProjectEntityDocument(previous),
    );
    await writeRelative(workspaceRoot, characterProjectPath('character-1'), '{"occupied":true}\n');
    const repository = new ProjectLocalAuthoringCommitRepository(workspaceRoot, authority);
    await expect(
      repository.commitCharacter({
        authority,
        project: characterProject(),
        entityDocument: {
          previous,
          next: entityDocument([
            {
              entityId: 'entity-1',
              kind: 'character',
              names: { canonical: 'Aster', display: 'Aster', aliases: [] },
              representations: [],
              lifecycle: { state: 'active' },
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ]),
        },
        association: {
          projectId: authority.projectId,
          entityId: 'entity-1',
          characterProjectId: 'character-1',
        },
        membership: {
          projectId: authority.projectId,
          target: { kind: 'character-project', characterProjectId: 'character-1' },
        },
      }),
    ).rejects.toThrow('already exists');

    await expect(readJson(workspaceRoot, PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH)).resolves.toEqual(
      previous,
    );
    await expect(
      readFile(absolute(workspaceRoot, projectEntityCharacterAssociationRelativePath('entity-1'))),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(
        absolute(
          workspaceRoot,
          projectTargetMembershipRelativePath({
            kind: 'character-project',
            characterProjectId: 'character-1',
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('commits a World and its exact Project membership together', async () => {
    const workspaceRoot = await fixture();
    const repository = new ProjectLocalAuthoringCommitRepository(workspaceRoot, authority);
    await repository.commitWorld({
      authority,
      project: worldProject(),
      membership: {
        projectId: authority.projectId,
        target: { kind: 'world-project', worldProjectId: 'world-1' },
      },
    });
    await expect(readJson(workspaceRoot, worldProjectPath('world-1'))).resolves.toMatchObject({
      worldProjectId: 'world-1',
    });
    await expect(
      readJson(
        workspaceRoot,
        projectTargetMembershipRelativePath({
          kind: 'world-project',
          worldProjectId: 'world-1',
        }),
      ),
    ).resolves.toMatchObject({ projectId: authority.projectId });
  });
});

function characterProject(): CharacterProject {
  return {
    characterProjectId: 'character-1',
    displayName: 'Aster',
    draft: {
      summary: '',
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function worldProject(): WorldProject {
  return {
    worldProjectId: 'world-1',
    title: 'Atrium',
    draft: {
      background: '',
      worldBook: [],
      locations: [],
      organizations: [],
      rules: [],
      initialFacts: [],
    },
    sourceRefs: [],
    reviewStatus: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function entityDocument(entities: ProjectEntityDocument['entities']): ProjectEntityDocument {
  return { projectId: authority.projectId, entities };
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-project-local-authoring-'));
  roots.push(root);
  return root;
}

async function writeRelative(root: string, relativePath: string, content: string): Promise<void> {
  const destination = absolute(root, relativePath);
  await import('node:fs/promises').then(({ mkdir }) =>
    mkdir(path.dirname(destination), { recursive: true }),
  );
  await writeFile(destination, content, 'utf8');
}

async function readJson(root: string, relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(absolute(root, relativePath), 'utf8'));
}

function absolute(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split('/'));
}
