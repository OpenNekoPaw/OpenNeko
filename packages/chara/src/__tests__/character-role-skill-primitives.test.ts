import {
  AGENT_AUTHORING_BINDING_METADATA_KEY,
  TOOL_NAMES_CHARA,
  type AgentCapabilityContext,
} from '@neko/agent-contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createCharacterRoleSkillCapabilityProvider,
  type CharacterCreationProposal,
} from '@neko/chara/application';
import type { CharacterProject } from '@neko/chara/contracts';

describe('CharacterRoleSkillCapabilityProvider', () => {
  it('fills only the exact CharacterProject binding and keeps evidence classifications observable', async () => {
    const fillDraft = vi.fn(async ({ binding, proposal }) =>
      project(binding.target.characterProjectId, proposal),
    );
    const provider = createCharacterRoleSkillCapabilityProvider(fillDraft);
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
          target: { kind: 'character-project', characterProjectId: 'character-1' },
        },
      },
    });

    expect(result).toEqual({
      success: true,
      data: {
        characterProjectId: 'character-1',
        reviewStatus: 'draft',
        sourceFacts: ['The reference says she repairs clocks.'],
        inferredSuggestions: ['A patient speaking rhythm would fit.'],
      },
    });
    expect(fillDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({
          target: { kind: 'character-project', characterProjectId: 'character-1' },
        }),
        proposal: expect.objectContaining({
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
    const [tool] = createCharacterRoleSkillCapabilityProvider(fillDraft).getTools({
      hostContext: null,
    });

    await expect(tool!.execute(proposalArgs())).resolves.toEqual({
      success: false,
      error: expect.stringContaining('missing its exact target binding'),
    });
    expect(fillDraft).not.toHaveBeenCalled();
  });
});

function proposalArgs(): Record<string, unknown> {
  return {
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
    displayName: 'Fixture',
    draft: proposal.draft,
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  };
}
