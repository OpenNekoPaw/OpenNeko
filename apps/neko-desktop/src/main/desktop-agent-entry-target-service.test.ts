import { describe, expect, it, vi } from 'vitest';
import type { AgentLaunchConnectionIdentity } from '@neko/agent-contracts';
import { createDesktopAgentEntryTargetService } from './desktop-agent-entry-target-service';

const connection: AgentLaunchConnectionIdentity = {
  applicationInstanceId: 'app-1',
  windowId: 'window-1',
  workbenchInstanceId: 'workbench-1',
  agentSurfaceId: 'surface-1',
  viewId: 'view-1',
  draftId: 'draft-1',
  connectionId: 'connection-1',
};

describe('Desktop Agent Entry target service', () => {
  it('issues a receipt only for the exact registered Project, Content document, and Workspace grant', async () => {
    const fixture = createFixture();
    const binding = authoring({ kind: 'content-document', documentId: 'documents/story.md' });

    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'authoring',
        binding,
      }),
    ).resolves.toMatchObject({
      mode: 'authoring',
      targetReceipt: { draftId: 'draft-1', connectionId: 'connection-1', binding },
    });

    fixture.resolveWorkspace.mockResolvedValueOnce({
      workspace: { root: 'other' },
      workspaceId: 'workspace-other',
    });
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'authoring',
        binding,
      }),
    ).rejects.toThrow('another Workspace');
  });

  it('requires project membership before delegating Character and World validation', async () => {
    const fixture = createFixture();
    const character = authoring(
      {
        kind: 'character-project',
        characterProjectId: 'character-1',
      },
      { kind: 'project', projectId: 'project-1' },
    );
    const world = authoring(
      { kind: 'world-project', worldProjectId: 'world-1' },
      { kind: 'project', projectId: 'project-1' },
    );

    await fixture.service.configure({
      connection,
      draftId: 'draft-1',
      mode: 'authoring',
      binding: character,
    });
    await fixture.service.configure({
      connection,
      draftId: 'draft-1',
      mode: 'authoring',
      binding: world,
    });

    expect(fixture.requireProjectTarget).toHaveBeenNthCalledWith(1, {
      workspace: { root: 'project' },
      projectId: 'project-1',
      target: character.target,
    });
    expect(fixture.validateCharacterProject).toHaveBeenCalledWith({
      workspace: { root: 'project' },
      projectId: 'project-1',
      characterProjectId: 'character-1',
    });
    expect(fixture.validateWorldProject).toHaveBeenCalledWith({
      workspace: { root: 'project' },
      projectId: 'project-1',
      worldProjectId: 'world-1',
    });
  });

  it('rejects a project-local target when the exact Content Project is unavailable', async () => {
    const fixture = createFixture({ projects: [] });
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'authoring',
        binding: authoring(
          { kind: 'character-project', characterProjectId: 'character-1' },
          { kind: 'project', projectId: 'project-missing' },
        ),
      }),
    ).rejects.toThrow(
      "Project 'project-missing' is not registered for the exact Workspace.",
    );

    expect(fixture.requireProjectTarget).not.toHaveBeenCalled();
    expect(fixture.validateCharacterProject).not.toHaveBeenCalled();
  });

  it('delegates Character Dialogue target validation to the exact Chara owner', async () => {
    const fixture = createFixture();
    const binding = {
      kind: 'character-dialogue' as const,
      mode: 'companion' as const,
      participants: [{ globalCharacterId: 'global-character-1', characterVersionId: 'version-1' }],
    };
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'character-dialogue',
        binding,
      }),
    ).resolves.toMatchObject({
      mode: 'character-dialogue',
      targetReceipt: { binding },
    });
    expect(fixture.validateCharacterDialogue).toHaveBeenCalledWith(binding);

    fixture.validateCharacterDialogue.mockRejectedValueOnce(
      new Error("CharacterVersion 'version-stale' is unavailable."),
    );
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'character-dialogue',
        binding: {
          kind: 'character-dialogue',
          mode: 'companion',
          participants: [
            { globalCharacterId: 'global-character-1', characterVersionId: 'version-stale' },
          ],
        },
      }),
    ).rejects.toThrow('[character/agent-character-dialogue-target-unavailable]');
  });

  it('delegates the exact global World and Character participants to the World owner', async () => {
    const fixture = createFixture();
    const binding = {
      kind: 'world-experience' as const,
      globalWorldId: 'global-world-1',
      worldVersionId: 'world-version-1',
      participants: [
        { globalCharacterId: 'global-character-1', characterVersionId: 'character-version-1' },
      ],
      launch: { kind: 'new' as const },
    };
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'world-experience',
        binding,
      }),
    ).resolves.toMatchObject({ mode: 'world-experience', targetReceipt: { binding } });
    expect(fixture.validateWorldExperience).toHaveBeenCalledWith(binding);

    fixture.validateWorldExperience.mockRejectedValueOnce(new Error('WorldVersion is stale.'));
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'world-experience',
        binding,
      }),
    ).rejects.toThrow('[world/agent-world-experience-target-unavailable]');
  });
});

function createFixture(input: { readonly projects?: readonly ProjectRef[] } = {}) {
  const resolveWorkspace = vi.fn(async () => ({
    workspace: { root: 'project' },
    workspaceId: 'workspace-1',
  }));
  const requireProjectTarget = vi.fn(async () => undefined);
  const validateCharacterProject = vi.fn(async () => true);
  const validateWorldProject = vi.fn(async () => true);
  const validateCharacterDialogue = vi.fn(async () => undefined);
  const validateWorldExperience = vi.fn(async () => undefined);
  return {
    resolveWorkspace,
    requireProjectTarget,
    validateCharacterProject,
    validateWorldProject,
    validateCharacterDialogue,
    validateWorldExperience,
    service: createDesktopAgentEntryTargetService({
      resolveWorkspace,
      readProjects: async () =>
        input.projects ?? [
          { projectId: 'project-1', workspaceId: 'workspace-1', unavailable: false },
        ],
      requireProjectTarget,
      validateCharacterProject,
      validateWorldProject,
      validateCharacterDialogue,
      validateWorldExperience,
      createIdentity: () => 'receipt-1',
    }),
  };
}

interface ProjectRef {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly unavailable?: unknown;
}

function authoring(
  target: import('@neko/agent-contracts').AgentAuthoringTargetRef,
  authority?: import('@neko/agent-contracts').AgentAuthoringAuthority,
): import('@neko/agent-contracts').AgentAuthoringBinding {
  return {
    kind: 'authoring',
    workspaceId: 'workspace-1',
    workspaceGrantId: 'grant-1',
    authority:
      authority ?? { kind: 'project', projectId: 'project-1' },
    target,
  };
}
