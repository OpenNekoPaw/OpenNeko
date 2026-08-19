import {
  AGENT_AUTHORING_BINDING_METADATA_KEY,
  TOOL_NAMES_WORLD,
  type AgentCapabilityContext,
} from '@neko/agent-contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createWorldAuthoringCapabilityProvider,
  createGlobalWorldCreationCapabilityProvider,
  type WorldCreationProposal,
} from '@neko/world/application';
import type { WorldProject } from '@neko/world/contracts';

describe('WorldAuthoringCapabilityProvider', () => {
  it('creates a global World in Assistant authority without a Project binding', async () => {
    const createGlobal = vi.fn(async ({ proposal }) => ({
      globalWorld: {
        globalWorldId: 'global-world-lantern-archive',
        title: proposal.title,
        currentWorldVersionId: 'world-version-lantern-archive-1',
      },
      worldVersion: {
        worldVersionId: 'world-version-lantern-archive-1',
        globalWorldId: 'global-world-lantern-archive',
      },
    }));
    const provider = createGlobalWorldCreationCapabilityProvider(createGlobal);
    expect(provider.requirements).toBeUndefined();
    expect(provider.getPromptFragments?.({ hostContext: null })?.[0]?.content).toContain(
      'directly as a global World',
    );
    const [tool] = provider.getTools({ hostContext: null });
    expect(tool?.requirements).toBeUndefined();
    expect(tool?.requiresConfirmation).toBe(true);

    await expect(tool!.execute(proposalArgs())).resolves.toEqual({
      success: true,
      data: {
        placement: 'global',
        globalWorldId: 'global-world-lantern-archive',
        worldVersionId: 'world-version-lantern-archive-1',
        title: 'The Lantern Archive',
        sourceFacts: ['The notes establish a city built around a sealed tower.'],
        inferredSuggestions: ['A dusk-only opening creates a useful dramatic rule.'],
      },
    });
    expect(createGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: expect.objectContaining({ title: 'The Lantern Archive' }),
      }),
    );
  });

  it('fills only the exact WorldProject binding through a confirmation-gated Tool', async () => {
    const fillDraft = vi.fn(async ({ binding, proposal }) =>
      project(binding.target.worldProjectId, proposal),
    );
    const provider = createWorldAuthoringCapabilityProvider(fillDraft);
    const promptFragments = provider.getPromptFragments?.({ hostContext: null });
    expect(promptFragments?.[0]?.content).toContain('single mutation confirmation');
    expect(promptFragments?.[0]?.content).toContain('no writable workspace World target');
    expect(promptFragments?.[0]?.content).toContain('never synchronizes a WorldVersion');
    expect(promptFragments?.[0]?.content).toContain('do not expose internal WorldProject');
    const [tool] = provider.getTools({ hostContext: null } satisfies AgentCapabilityContext);
    expect(tool?.name).toBe(TOOL_NAMES_WORLD.FILL_WORLD_DRAFT);
    expect(tool?.requiresConfirmation).toBe(true);
    expect(tool?.safetyKind).toBe('confirmation-gated');
    expect(tool?.requirements).toEqual({
      writableProject: true,
      authoringTargetKind: 'world-project',
    });

    const result = await tool!.execute(proposalArgs(), {
      metadata: {
        [AGENT_AUTHORING_BINDING_METADATA_KEY]: {
          kind: 'authoring',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          authority: { kind: 'project', projectId: 'project-1' },
          target: { kind: 'world-project', worldProjectId: 'world-1' },
        },
      },
    });

    expect(result).toEqual({
      success: true,
      data: {
        placement: 'workspace',
        title: 'The Lantern Archive',
        sourceFacts: ['The notes establish a city built around a sealed tower.'],
        inferredSuggestions: ['A dusk-only opening creates a useful dramatic rule.'],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /worldVersionId|worldRunId|worldSaveId|branchId|event/u,
    );
    expect(fillDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({
          authority: { kind: 'project', projectId: 'project-1' },
          target: { kind: 'world-project', worldProjectId: 'world-1' },
        }),
        proposal: expect.objectContaining({
          title: 'The Lantern Archive',
          draft: expect.objectContaining({
            background: 'An archive city built around a sealed tower.',
            worldBook: [
              expect.objectContaining({
                worldBookEntryId: 'sealed-tower',
                sourceRefIds: [],
              }),
            ],
          }),
        }),
      }),
    );
  });

  it('rejects missing and wrong-target bindings without a World write', async () => {
    const fillDraft = vi.fn();
    const [tool] = createWorldAuthoringCapabilityProvider(fillDraft).getTools({
      hostContext: null,
    });

    await expect(tool!.execute(proposalArgs())).resolves.toEqual({
      success: false,
      error: expect.stringContaining('missing its exact target binding'),
    });
    await expect(
      tool!.execute(proposalArgs(), {
        metadata: {
          [AGENT_AUTHORING_BINDING_METADATA_KEY]: {
            kind: 'authoring',
            workspaceId: 'workspace-1',
            workspaceGrantId: 'grant-1',
            authority: { kind: 'project', projectId: 'project-1' },
            target: { kind: 'character-project', characterProjectId: 'character-1' },
          },
        },
      }),
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining('requires an exact WorldProject target'),
    });
    expect(fillDraft).not.toHaveBeenCalled();
  });

  it('keeps the exact target observable when the canonical World write fails', async () => {
    const fillDraft = vi.fn(async () => {
      throw new Error('World draft write interrupted.');
    });
    const [tool] = createWorldAuthoringCapabilityProvider(fillDraft).getTools({
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
            target: { kind: 'world-project', worldProjectId: 'world-failed' },
          },
        },
      }),
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining('World draft write interrupted.'),
    });
    expect(fillDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({
          target: { kind: 'world-project', worldProjectId: 'world-failed' },
        }),
      }),
    );
  });
});

function proposalArgs(): Record<string, unknown> {
  return {
    title: 'The Lantern Archive',
    background: 'An archive city built around a sealed tower.',
    world_book: [
      {
        worldBookEntryId: 'sealed-tower',
        title: 'The sealed tower',
        content: 'The tower opens only at dusk.',
        tags: ['tower'],
        visibility: { kind: 'public' },
      },
    ],
    locations: [
      {
        definitionId: 'archive-plaza',
        name: 'Archive Plaza',
        description: 'A public square surrounding the tower.',
      },
    ],
    organizations: [],
    rules: [{ ruleId: 'dusk-opening', statement: 'The tower opens only at dusk.' }],
    initial_facts: [
      {
        factId: 'tower-open',
        key: 'tower.open',
        value: false,
        visibility: { kind: 'public' },
        knownByActorIds: [],
      },
    ],
    source_facts: ['The notes establish a city built around a sealed tower.'],
    inferred_suggestions: ['A dusk-only opening creates a useful dramatic rule.'],
  };
}

function project(worldProjectId: string, proposal: WorldCreationProposal): WorldProject {
  return {
    worldProjectId,
    title: proposal.title,
    draft: proposal.draft,
    sourceRefs: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  };
}
