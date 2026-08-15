import {
  AGENT_AUTHORING_BINDING_METADATA_KEY,
  TOOL_NAMES_CHARA,
  type AgentCapabilityContext,
} from '@neko/agent-contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createCharacterAuthoringCapabilityProvider,
  createGlobalCharacterCreationCapabilityProvider,
  type CharacterCreationProposal,
} from '@neko/chara/application';
import type { CharacterProject } from '@neko/chara/contracts';

describe('CharacterAuthoringCapabilityProvider', () => {
  it('creates a global Character in Assistant authority without a Project binding', async () => {
    const createGlobal = vi.fn(async ({ proposal }) => ({
      globalCharacter: {
        globalCharacterId: 'global-character-aster',
        displayName: proposal.displayName,
        currentCharacterVersionId: 'character-version-aster-1',
      },
      characterVersion: {
        characterVersionId: 'character-version-aster-1',
        globalCharacterId: 'global-character-aster',
      },
    }));
    const provider = createGlobalCharacterCreationCapabilityProvider(createGlobal);
    expect(provider.requirements).toBeUndefined();
    expect(provider.getPromptFragments?.({ hostContext: null })?.[0]?.content).toContain(
      'directly as a global Character',
    );
    const [tool] = provider.getTools({ hostContext: null });
    expect(tool?.requirements).toBeUndefined();
    expect(tool?.requiresConfirmation).toBe(true);

    await expect(tool!.execute(proposalArgs())).resolves.toEqual({
      success: true,
      data: {
        placement: 'global',
        globalCharacterId: 'global-character-aster',
        characterVersionId: 'character-version-aster-1',
        displayName: 'Aster',
        sourceFacts: ['The reference says she repairs clocks.'],
        inferredSuggestions: ['A patient speaking rhythm would fit.'],
      },
    });
    expect(createGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ proposal: expect.objectContaining({ displayName: 'Aster' }) }),
    );
  });

  it('fills only the exact CharacterProject binding and keeps evidence classifications observable', async () => {
    const fillDraft = vi.fn(async ({ binding, proposal }) =>
      project(binding.target.characterProjectId, proposal),
    );
    const provider = createCharacterAuthoringCapabilityProvider(fillDraft);
    const promptFragments = provider.getPromptFragments?.({ hostContext: null });
    expect(promptFragments?.[0]?.content).toContain('single mutation confirmation');
    expect(promptFragments?.[0]?.content).toContain('without adding a text-confirmation gate');
    expect(promptFragments?.[0]?.content).toContain('no writable workspace Character target');
    expect(promptFragments?.[0]?.content).toContain(
      'do not conflate this with global CharacterVersion synchronization',
    );
    expect(promptFragments?.[0]?.content).toContain('do not expose internal CharacterProject');
    const [tool] = provider.getTools({ hostContext: null } satisfies AgentCapabilityContext);
    expect(tool?.name).toBe(TOOL_NAMES_CHARA.FILL_CHARACTER_DRAFT);
    expect(tool?.requiresConfirmation).toBe(true);
    expect(tool?.requirements).toEqual({
      writableProject: true,
      authoringTargetKind: 'character-project',
    });

    const result = await tool!.execute(proposalArgs(), {
      metadata: {
        [AGENT_AUTHORING_BINDING_METADATA_KEY]: {
          kind: 'authoring',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          authority: { kind: 'project', projectId: 'project-1' },
          target: { kind: 'character-project', characterProjectId: 'character-1' },
        },
      },
    });

    expect(result).toEqual({
      success: true,
      data: {
        placement: 'workspace',
        displayName: 'Aster',
        sourceFacts: ['The reference says she repairs clocks.'],
        inferredSuggestions: ['A patient speaking rhythm would fit.'],
        handoffs: [
          { kind: 'open-character', characterProjectId: 'character-1' },
          {
            kind: 'open-character-studio',
            characterProjectId: 'character-1',
            authority: { kind: 'project', projectId: 'project-1' },
          },
        ],
      },
    });
    expect(fillDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({
          target: { kind: 'character-project', characterProjectId: 'character-1' },
        }),
        proposal: expect.objectContaining({
          displayName: 'Aster',
          draft: expect.objectContaining({
            summary: 'A clockmaker who notices impossible details.',
            backgroundStory: expect.objectContaining({ overview: 'Raised above a repair shop.' }),
            originSetting: expect.objectContaining({ overview: 'A rain-soaked canal city.' }),
          }),
        }),
      }),
    );
  });

  it('rejects execution without an authorized runtime binding', async () => {
    const fillDraft = vi.fn();
    const [tool] = createCharacterAuthoringCapabilityProvider(fillDraft).getTools({
      hostContext: null,
    });

    await expect(tool!.execute(proposalArgs())).resolves.toEqual({
      success: false,
      error: expect.stringContaining('missing its exact target binding'),
    });
    expect(fillDraft).not.toHaveBeenCalled();
  });

  it('keeps the fresh exact target observable when filling its draft fails', async () => {
    const fillDraft = vi.fn(async () => {
      throw new Error('Character draft write interrupted.');
    });
    const [tool] = createCharacterAuthoringCapabilityProvider(fillDraft).getTools({
      hostContext: null,
    });

    await expect(
      tool!.execute(proposalArgs(), {
        metadata: {
          [AGENT_AUTHORING_BINDING_METADATA_KEY]: {
            kind: 'authoring',
            workspaceId: 'workspace-1',
            workspaceGrantId: 'grant-1',
            authority: { kind: 'project', projectId: 'project-1' },
            target: { kind: 'character-project', characterProjectId: 'character-failed' },
          },
        },
      }),
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining('Character draft write interrupted.'),
    });
    expect(fillDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({
          target: { kind: 'character-project', characterProjectId: 'character-failed' },
        }),
      }),
    );
  });
});

function proposalArgs(): Record<string, unknown> {
  return {
    display_name: 'Aster',
    summary: 'A clockmaker who notices impossible details.',
    background_overview: 'Raised above a repair shop.',
    origin_overview: 'A rain-soaked canal city.',
    canon: ['Repairs mechanical clocks.'],
    knowledge_boundary: ['Does not know modern electronics.'],
    behavior_policy: ['Investigates before making claims.'],
    expression_policy: ['Uses precise mechanical metaphors.'],
    source_facts: ['The reference says she repairs clocks.'],
    inferred_suggestions: ['A patient speaking rhythm would fit.'],
  };
}

function project(
  characterProjectId: string,
  proposal: CharacterCreationProposal,
): CharacterProject {
  return {
    characterProjectId,
    displayName: proposal.displayName,
    draft: proposal.draft,
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  };
}
