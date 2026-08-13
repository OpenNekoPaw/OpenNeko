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
  it('issues a receipt only for the exact registered Content Project and Workspace grant', async () => {
    const fixture = createFixture();
    const binding = authoring({ kind: 'content-project', contentProjectId: 'content-1' });

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
      { kind: 'content-project', contentProjectId: 'content-1' },
    );
    const world = authoring(
      { kind: 'world-project', worldProjectId: 'world-1' },
      { kind: 'content-project', contentProjectId: 'content-1' },
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

    expect(fixture.requireProjectLocalTarget).toHaveBeenNthCalledWith(1, {
      workspace: { root: 'project' },
      contentProjectId: 'content-1',
      target: character.target,
    });
    expect(fixture.validateCharacterProject).toHaveBeenCalledWith({
      workspace: { root: 'project' },
      contentProjectId: 'content-1',
      characterProjectId: 'character-1',
    });
    expect(fixture.validateWorldProject).toHaveBeenCalledWith({
      workspace: { root: 'project' },
      contentProjectId: 'content-1',
      worldProjectId: 'world-1',
    });
  });

  it('delegates standalone targets without fabricating a Content Project scope', async () => {
    const fixture = createFixture({ projects: [] });
    await fixture.service.configure({
      connection,
      draftId: 'draft-1',
      mode: 'authoring',
      binding: authoring({
        kind: 'character-project',
        characterProjectId: 'standalone-character-1',
      }),
    });

    expect(fixture.requireProjectLocalTarget).not.toHaveBeenCalled();
    expect(fixture.validateCharacterProject).toHaveBeenCalledWith({
      workspace: { root: 'project' },
      characterProjectId: 'standalone-character-1',
    });
  });

  it('delegates Character Dialogue target validation to the exact Chara owner', async () => {
    const fixture = createFixture();
    const binding = {
      kind: 'character-dialogue' as const,
      mode: 'companion' as const,
      participants: [{ characterProjectId: 'character-1', characterVersionId: 'version-1' }],
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
            { characterProjectId: 'character-1', characterVersionId: 'version-stale' },
          ],
        },
      }),
    ).rejects.toThrow('[character/agent-character-dialogue-target-unavailable]');
  });

  it('keeps the unqualified World Experience owner unavailable without Assistant fallback', async () => {
    const fixture = createFixture();
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'world-experience',
        binding: {
          kind: 'world-experience',
          worldExperienceId: 'world-experience-1',
          worldExperienceVersionId: 'world-experience-version-1',
          launch: { kind: 'new', participantId: 'participant-1', roleScopeId: 'role-1' },
        },
      }),
    ).rejects.toThrow('[world/agent-world-experience-provider-unavailable]');
  });
});

function createFixture(input: { readonly projects?: readonly ProjectRef[] } = {}) {
  const resolveWorkspace = vi.fn(async () => ({
    workspace: { root: 'project' },
    workspaceId: 'workspace-1',
  }));
  const requireProjectLocalTarget = vi.fn(async () => undefined);
  const validateCharacterProject = vi.fn(async () => true);
  const validateWorldProject = vi.fn(async () => true);
  const validateCharacterDialogue = vi.fn(async () => undefined);
  return {
    resolveWorkspace,
    requireProjectLocalTarget,
    validateCharacterProject,
    validateWorldProject,
    validateCharacterDialogue,
    service: createDesktopAgentEntryTargetService({
      resolveWorkspace,
      readContentProjects: async () =>
        input.projects ?? [
          { projectId: 'content-1', workspaceId: 'workspace-1', unavailable: false },
        ],
      requireProjectLocalTarget,
      validateCharacterProject,
      validateWorldProject,
      validateCharacterDialogue,
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
      authority ??
      (target.kind === 'content-project'
        ? { kind: 'content-project', contentProjectId: target.contentProjectId }
        : {
            kind: 'standalone-library',
            library: target.kind === 'character-project' ? 'character' : 'world',
          }),
    target,
  };
}
