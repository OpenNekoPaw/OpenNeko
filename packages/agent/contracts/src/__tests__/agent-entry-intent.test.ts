import { describe, expect, it } from 'vitest';
import {
  AGENT_ENTRY_MODES,
  parseAgentCharacterDialogueTargetOptions,
  parseAgentEntryIntentProjection,
  parseAgentEntryTargetReceipt,
  parseAgentWorldExperienceTargetOptions,
} from '../agent-entry-intent';

describe('Agent Entry intent contract', () => {
  it('defines only the four intent-qualified modes', () => {
    expect(AGENT_ENTRY_MODES).toEqual([
      'assistant',
      'authoring',
      'character-dialogue',
      'world-experience',
    ]);
    expect(AGENT_ENTRY_MODES).not.toContain('workspace');
    expect(AGENT_ENTRY_MODES).not.toContain('character');
    expect(AGENT_ENTRY_MODES).not.toContain('world');
  });

  it.each([
    {
      mode: 'authoring' as const,
      binding: {
        kind: 'authoring' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
        authority: { kind: 'project' as const, projectId: 'project-1' },
        target: null,
      },
    },
    {
      mode: 'assistant' as const,
      binding: {
        kind: 'authoring' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
        authority: { kind: 'project' as const, projectId: 'project-1' },
        target: { kind: 'character-project' as const, characterProjectId: 'character-project-1' },
      },
    },
    {
      mode: 'authoring' as const,
      binding: {
        kind: 'authoring' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
        authority: { kind: 'project' as const, projectId: 'project-1' },
        target: { kind: 'character-project' as const, characterProjectId: 'character-project-1' },
      },
    },
    {
      mode: 'character-dialogue' as const,
      binding: {
        kind: 'character-dialogue' as const,
        mode: 'companion' as const,
        participants: [
          {
            globalCharacterId: 'character-project-1',
            characterVersionId: 'character-version-1',
          },
        ],
      },
    },
    {
      mode: 'world-experience' as const,
      binding: {
        kind: 'world-experience' as const,
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-1',
        participants: [],
        launch: { kind: 'new' as const },
      },
    },
  ])('parses an exact $mode receipt', ({ mode, binding }) => {
    expect(
      parseAgentEntryIntentProjection({
        mode,
        targetReceipt: {
          targetReceiptId: `target-receipt:${mode}`,
          draftId: 'draft-1',
          connectionId: 'connection-1',
          mode,
          binding,
        },
      }),
    ).toMatchObject({ mode, targetReceipt: { mode, binding } });
  });

  it('rejects runtime launch authorities from Assistant operation receipts', () => {
    expect(() =>
      parseAgentEntryTargetReceipt({
        targetReceiptId: 'target-receipt-assistant-dialogue',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'assistant',
        binding: {
          kind: 'character-dialogue',
          mode: 'companion',
          participants: [
            {
              globalCharacterId: 'character-project-1',
              characterVersionId: 'character-version-1',
            },
          ],
        },
      }),
    ).toThrow('does not match');
  });

  it('rejects the removed Skill-specific authoring receipt shape', () => {
    expect(() =>
      parseAgentEntryTargetReceipt({
        targetReceiptId: 'removed-skill-target',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'assistant',
        binding: { kind: 'skill-authoring', destination: { kind: 'personal' } },
      }),
    ).toThrow("Unknown Agent Entry target binding 'skill-authoring'");
  });

  it('keeps mutable authoring targets distinct from published runtime launch targets', () => {
    expect(() =>
      parseAgentEntryTargetReceipt({
        targetReceiptId: 'target-receipt-1',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'character-dialogue',
        binding: {
          kind: 'authoring',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          authority: { kind: 'project', projectId: 'project-1' },
          target: { kind: 'character-project', characterProjectId: 'character-project-1' },
        },
      }),
    ).toThrow('does not match');
    expect(() =>
      parseAgentEntryIntentProjection({
        mode: 'authoring',
        targetReceipt: {
          targetReceiptId: 'target-receipt-2',
          draftId: 'draft-1',
          connectionId: 'connection-1',
          mode: 'world-experience',
          binding: {
            kind: 'world-experience',
            globalWorldId: 'global-world-1',
            worldVersionId: 'world-version-1',
            participants: [],
            launch: { kind: 'new' },
          },
        },
      }),
    ).toThrow('does not match');
  });

  it('rejects the retired standalone authoring authority without a compatibility decoder', () => {
    expect(() =>
      parseAgentEntryTargetReceipt({
        targetReceiptId: 'target-receipt-standalone',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'authoring',
        binding: {
          kind: 'authoring',
          workspaceId: 'character-library',
          workspaceGrantId: 'grant-character-library',
          authority: { kind: 'standalone-library', library: 'character' },
          target: { kind: 'character-project', characterProjectId: 'character-project-1' },
        },
      }),
    ).toThrow("Unknown Agent authoring authority 'standalone-library'");
  });

  it('rejects contentProjectId-as-Project and the retired Content Project target shape', () => {
    const binding = {
      kind: 'authoring',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      authority: { kind: 'content-project', contentProjectId: 'project-1' },
      target: { kind: 'content-document', documentId: 'documents/story.md' },
    };
    expect(() =>
      parseAgentEntryTargetReceipt({
        targetReceiptId: 'target-receipt-old-authority',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'authoring',
        binding,
      }),
    ).toThrow("Unknown Agent authoring authority 'content-project'");

    expect(() =>
      parseAgentEntryTargetReceipt({
        targetReceiptId: 'target-receipt-old-target',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'authoring',
        binding: {
          ...binding,
          authority: { kind: 'project', projectId: 'project-1' },
          target: { kind: 'content-project', contentProjectId: 'project-1' },
        },
      }),
    ).toThrow("Unknown Agent authoring target 'content-project'");
  });

  it('rejects duplicate CharacterVersions and internal contract generation fields', () => {
    const receipt = {
      targetReceiptId: 'target-receipt-1',
      draftId: 'draft-1',
      connectionId: 'connection-1',
      mode: 'character-dialogue',
      binding: {
        kind: 'character-dialogue',
        mode: 'companion',
        participants: [
          { globalCharacterId: 'character-1', characterVersionId: 'version-1' },
          { globalCharacterId: 'character-2', characterVersionId: 'version-1' },
        ],
      },
    };
    expect(() => parseAgentEntryTargetReceipt(receipt)).toThrow('unique CharacterVersions');
    expect(() =>
      parseAgentEntryTargetReceipt({
        ...receipt,
        binding: {
          ...receipt.binding,
          participants: [
            { globalCharacterId: 'character-1', characterVersionId: 'version-1' },
            { globalCharacterId: 'character-1', characterVersionId: 'version-2' },
          ],
        },
      }),
    ).toThrow('at most one version of each Character');
    expect(() => parseAgentEntryTargetReceipt({ ...receipt, schemaVersion: 1 })).toThrow(
      'unsupported field',
    );
  });

  it('preserves exact Character Conversation mode and participant Storyline nodes', () => {
    expect(
      parseAgentEntryTargetReceipt({
        targetReceiptId: 'target-receipt-narrative',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'character-dialogue',
        binding: {
          kind: 'character-dialogue',
          mode: 'narrative',
          participants: [
            {
              globalCharacterId: 'character-project-1',
              characterVersionId: 'character-version-1',
              storyline: {
                characterStorylineId: 'storyline-1',
                characterStorylineVersionId: 'storyline-version-1',
                storylineNodeId: 'storyline-node-1',
              },
            },
          ],
        },
      }).binding,
    ).toEqual({
      kind: 'character-dialogue',
      mode: 'narrative',
      participants: [
        {
          globalCharacterId: 'character-project-1',
          characterVersionId: 'character-version-1',
          storyline: {
            characterStorylineId: 'storyline-1',
            characterStorylineVersionId: 'storyline-version-1',
            storylineNodeId: 'storyline-node-1',
          },
        },
      ],
    });
  });

  it('rejects removed Character launch fields instead of reconstructing mode', () => {
    expect(() =>
      parseAgentEntryTargetReceipt({
        targetReceiptId: 'target-receipt-old',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'character-dialogue',
        binding: {
          kind: 'character-dialogue',
          participants: [
            { globalCharacterId: 'character-project-1', characterVersionId: 'version-1' },
          ],
          storylineVersionId: 'storyline-version-1',
        },
      }),
    ).toThrow(/unsupported field|missing field 'mode'/u);

    expect(() =>
      parseAgentEntryTargetReceipt({
        targetReceiptId: 'target-receipt-cross-mode',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'character-dialogue',
        binding: {
          kind: 'character-dialogue',
          mode: 'companion',
          participants: [
            {
              globalCharacterId: 'character-project-1',
              characterVersionId: 'version-1',
              storyline: {
                characterStorylineId: 'storyline-1',
                characterStorylineVersionId: 'storyline-version-1',
                storylineNodeId: 'node-1',
              },
            },
          ],
        },
      }),
    ).toThrow(/unsupported field 'storyline'/u);
  });

  it('parses a compact secret-free Character Dialogue target catalog', () => {
    expect(
      parseAgentCharacterDialogueTargetOptions([
        {
          globalCharacterId: 'character-project-1',
          characterVersionId: 'character-version-1',
          displayName: 'Lin',
          versionLabel: 'Published Lin',
          lineage: {
            coverage: 'complete',
            state: 'declared-root',
            isHead: true,
            path: [{ characterVersionId: 'character-version-1', label: 'Published Lin' }],
          },
          storylines: [{ storylineVersionId: 'storyline-version-1', label: 'Archive arc' }],
        },
      ]),
    ).toEqual([
      {
        globalCharacterId: 'character-project-1',
        characterVersionId: 'character-version-1',
        displayName: 'Lin',
        versionLabel: 'Published Lin',
        lineage: {
          coverage: 'complete',
          state: 'declared-root',
          isHead: true,
          path: [{ characterVersionId: 'character-version-1', label: 'Published Lin' }],
        },
        storylines: [{ storylineVersionId: 'storyline-version-1', label: 'Archive arc' }],
      },
    ]);
    expect(() =>
      parseAgentCharacterDialogueTargetOptions([
        {
          globalCharacterId: 'character-project-1',
          characterVersionId: 'character-version-1',
          displayName: 'Lin',
          versionLabel: 'Published Lin',
          lineage: {
            coverage: 'complete',
            state: 'declared-root',
            isHead: true,
            path: [{ characterVersionId: 'character-version-1', label: 'Published Lin' }],
          },
          storylines: [],
          definition: { secret: true },
        },
      ]),
    ).toThrow('unsupported field');
  });

  it('parses exact World Experience versions and rejects duplicate versions', () => {
    const target = {
      globalWorldId: 'global-world-1',
      worldVersionId: 'world-version-1',
      displayName: 'Rain Station',
      versionLabel: 'Published v1',
    };
    const targets = [target];
    expect(parseAgentWorldExperienceTargetOptions(targets)).toEqual(targets);
    expect(() =>
      parseAgentWorldExperienceTargetOptions([
        ...targets,
        { ...target, globalWorldId: 'global-world-2' },
      ]),
    ).toThrow('unique WorldVersions');
    expect(() => parseAgentWorldExperienceTargetOptions([{ ...target, latest: true }])).toThrow(
      'unsupported field',
    );
  });
});
