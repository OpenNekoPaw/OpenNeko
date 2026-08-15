import type { AgentAuthoringTargetRef, AgentEntryTargetReceipt } from '@neko/agent-contracts';
import { describe, expect, it, vi } from 'vitest';
import { createAgentAuthoringMutationAuthority } from './agent-authoring-mutation-authority';

describe('Agent authoring mutation authority', () => {
  it.each([
    ['content-document', { kind: 'content-document', documentId: 'documents/story.md' }, 'content'],
    [
      'character-project',
      { kind: 'character-project', characterProjectId: 'character-1' },
      'character',
    ],
    ['world-project', { kind: 'world-project', worldProjectId: 'world-1' }, 'world'],
  ] as const)('routes %s authority to only its exact owner', async (kind, target, owner) => {
    const fixture = createFixture();
    const receipt = authoringReceipt(target);

    await expect(
      fixture.authority.authorize({ receipt, expectedTargetKind: kind }),
    ).resolves.toEqual(receipt.binding);
    expect(fixture[owner].validate).toHaveBeenCalledOnce();
    for (const sibling of ['content', 'character', 'world'] as const) {
      if (sibling !== owner) expect(fixture[sibling].validate).not.toHaveBeenCalled();
    }
  });

  it('revalidates the same exact Character authority for an Assistant operation receipt', async () => {
    const fixture = createFixture();
    const receipt = {
      ...authoringReceipt({
        kind: 'character-project' as const,
        characterProjectId: 'character-1',
      }),
      mode: 'assistant' as const,
    };

    await expect(
      fixture.authority.authorize({
        receipt,
        expectedTargetKind: 'character-project',
      }),
    ).resolves.toEqual(receipt.binding);
    expect(fixture.character.validate).toHaveBeenCalledOnce();
  });

  it('rejects cross-target and runtime receipts without touching any owner', async () => {
    const fixture = createFixture();
    const character = authoringReceipt({
      kind: 'character-project',
      characterProjectId: 'character-1',
    });
    await expect(
      fixture.authority.authorize({
        receipt: character,
        expectedTargetKind: 'content-document',
      }),
    ).rejects.toThrow("cannot use 'character-project' authority");

    const dialogue: AgentEntryTargetReceipt = {
      targetReceiptId: 'target-dialogue',
      draftId: 'draft-1',
      connectionId: 'connection-1',
      mode: 'character-dialogue',
      binding: {
        kind: 'character-dialogue',
        mode: 'companion',
        participants: [
          { globalCharacterId: 'character-1', characterVersionId: 'character-version-1' },
        ],
      },
    };
    await expect(
      fixture.authority.authorize({ receipt: dialogue, expectedTargetKind: 'character-project' }),
    ).rejects.toThrow('requires an exact Authoring target receipt');

    const experience: AgentEntryTargetReceipt = {
      targetReceiptId: 'target-world-experience',
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
    };
    await expect(
      fixture.authority.authorize({ receipt: experience, expectedTargetKind: 'world-project' }),
    ).rejects.toThrow('requires an exact Authoring target receipt');

    expect(fixture.content.validate).not.toHaveBeenCalled();
    expect(fixture.character.validate).not.toHaveBeenCalled();
    expect(fixture.world.validate).not.toHaveBeenCalled();
  });

  it.each([
    'prompt',
    'mention',
    'selectedRow',
    'mountedSurface',
    'currentProject',
    'recentProject',
  ])("rejects inferred authority field '%s' before owner routing", async (field) => {
    const fixture = createFixture();
    const receipt = {
      ...authoringReceipt({ kind: 'content-document', documentId: 'documents/story.md' }),
      [field]: 'content-1',
    } as unknown as AgentEntryTargetReceipt;

    await expect(
      fixture.authority.authorize({ receipt, expectedTargetKind: 'content-document' }),
    ).rejects.toThrow(`unsupported field '${field}'`);
    expect(fixture.content.validate).not.toHaveBeenCalled();
    expect(fixture.character.validate).not.toHaveBeenCalled();
    expect(fixture.world.validate).not.toHaveBeenCalled();
  });
});

function createFixture() {
  const content = { validate: vi.fn(async () => undefined) };
  const character = { validate: vi.fn(async () => undefined) };
  const world = { validate: vi.fn(async () => undefined) };
  return {
    content,
    character,
    world,
    authority: createAgentAuthoringMutationAuthority({ content, character, world }),
  };
}

function authoringReceipt(target: AgentAuthoringTargetRef): AgentEntryTargetReceipt {
  return {
    targetReceiptId: 'target-authoring-1',
    draftId: 'draft-1',
    connectionId: 'connection-1',
    mode: 'authoring',
    binding: {
      kind: 'authoring',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
      authority: { kind: 'project', projectId: 'project-1' },
      target,
    },
  };
}
