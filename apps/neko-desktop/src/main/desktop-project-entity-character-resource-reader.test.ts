import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import { CharacterAuthoringService } from '@neko/chara/application';
import { createCharacterAuthoringFileRepository } from '@neko/chara-node';
import { ProjectCompositionService } from '@neko/project/application';
import { createProjectCompositionFileRepository } from '@neko/project-node';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopProjectEntityCharacterResourceReader } from './desktop-project-entity-character-resource-reader';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop Project Entity Character resource reader', () => {
  it('reads exact Project composition and project-local Chara records through their repositories', async () => {
    const workspace = await createWorkspace();
    const compositions = new ProjectCompositionService(
      createProjectCompositionFileRepository({ workspaceRoot: workspace.workspacePath }),
    );
    await compositions.create('content-project-1');
    await compositions.addLocalTarget('content-project-1', {
      kind: 'character-project',
      characterProjectId: 'character-project-rin',
    });
    await compositions.associateEntityCharacter('content-project-1', {
      entityId: 'entity-rin',
      characterProjectId: 'character-project-rin',
    });
    const characters = createCharacterAuthoringFileRepository({
      workspaceRoot: workspace.workspacePath,
      scope: { kind: 'content-project', contentProjectId: 'content-project-1' },
    });
    await new CharacterAuthoringService({
      repository: characters,
      now: () => '2026-08-12T00:00:00.000Z',
    }).createProject({
      characterProjectId: 'character-project-rin',
      displayName: 'Rin',
      draft: {
        summary: 'A careful project-local character.',
        backgroundStory: createEmptyCharacterBackgroundStory(),
        originSetting: createEmptyCharacterOriginSetting(),
        canon: [],
        knowledgeBoundary: [],
        behaviorPolicy: [],
        expressionPolicy: [],
        representationRefs: [],
      },
    });

    await expect(
      createDesktopProjectEntityCharacterResourceReader()({
        identity: identity('content-project-1'),
        workspace,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        entityId: 'entity-rin',
        characterProjectId: 'character-project-rin',
        displayName: 'Rin',
        availability: 'available',
      }),
    ]);
  });

  it('rejects a Project identity that does not own the Workspace composition', async () => {
    const workspace = await createWorkspace();
    await new ProjectCompositionService(
      createProjectCompositionFileRepository({ workspaceRoot: workspace.workspacePath }),
    ).create('content-project-1');

    await expect(
      createDesktopProjectEntityCharacterResourceReader()({
        identity: identity('content-project-other'),
        workspace,
      }),
    ).rejects.toThrow(
      "Resource Browser Project 'content-project-other' does not match Content Project 'content-project-1'.",
    );
  });
});

async function createWorkspace() {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-character-resource-reader-'));
  roots.push(workspacePath);
  return {
    workspaceId: 'workspace-1',
    workspacePath,
    displayName: 'Workspace',
    locator: { kind: 'relative' as const, value: 'workspace' },
  };
}

function identity(projectId: string) {
  return {
    projectId,
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'resource-browser:view-1',
    viewInstanceId: 'view-instance-1',
    rendererSessionId: 'endpoint-1',
  };
}
