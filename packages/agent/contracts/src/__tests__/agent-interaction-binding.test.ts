import { describe, expect, it } from 'vitest';
import {
  createAgentDraftInteraction,
  createAgentSessionInteraction,
  parseAgentDraftInteractionProjection,
  parseAgentDomainBinding,
} from '../agent-interaction-binding';

describe('Agent interaction binding contract', () => {
  it('keeps phase orthogonal to an unbound Draft', () => {
    expect(
      createAgentDraftInteraction({ draftId: 'draft-1', binding: { kind: 'unbound' } }),
    ).toEqual({
      phase: 'draft',
      draftId: 'draft-1',
      binding: { kind: 'unbound' },
      bindingReceipt: null,
    });
  });

  it('preserves legitimate Character and World domain version identities', () => {
    const character = parseAgentDomainBinding({
      kind: 'character',
      characterId: 'character-rin',
      characterVersionId: 'character-version-rin-7',
      characterRunId: 'character-run-2',
      roleProfileId: 'role-profile-dialogue',
    });
    const world = parseAgentDomainBinding({
      kind: 'world',
      worldExperienceId: 'world-experience-1',
      worldExperienceVersionId: 'world-experience-version-4',
      worldRunId: 'world-run-9',
      participantId: 'participant-user',
      roleScopeId: 'world-role-participant',
    });
    if (character.kind !== 'character' || world.kind !== 'world') {
      throw new Error('Fixture bindings did not retain their exact domain kinds.');
    }

    expect(
      createAgentSessionInteraction({ conversationId: 'conversation-1', binding: character }),
    ).toMatchObject({ binding: { characterVersionId: 'character-version-rin-7' } });
    expect(
      createAgentSessionInteraction({ conversationId: 'conversation-2', binding: world }),
    ).toMatchObject({ binding: { worldExperienceVersionId: 'world-experience-version-4' } });
  });

  it('rejects a stale or cross-Draft binding receipt locally', () => {
    expect(() =>
      parseAgentDraftInteractionProjection({
        phase: 'draft',
        draftId: 'draft-current',
        binding: {
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'workspace-grant-1',
        },
        bindingReceipt: {
          bindingReceiptId: 'binding-old',
          draftId: 'draft-old',
          connectionId: 'connection-old',
          binding: {
            kind: 'workspace',
            workspaceId: 'workspace-1',
            workspaceGrantId: 'workspace-grant-1',
          },
        },
      }),
    ).toThrow('belongs to another Draft');
  });

  it('requires exact Character Run and World Run identities only after Session commit', () => {
    expect(() =>
      createAgentSessionInteraction({
        conversationId: 'conversation-character',
        binding: {
          kind: 'character',
          characterId: 'character-rin',
          characterVersionId: 'character-version-rin-7',
          roleProfileId: 'role-profile-dialogue',
        },
      }),
    ).toThrow('Character Run');
    expect(() =>
      createAgentSessionInteraction({
        conversationId: 'conversation-world',
        binding: {
          kind: 'world',
          worldExperienceId: 'world-experience-1',
          worldExperienceVersionId: 'world-experience-version-4',
          participantId: 'participant-user',
          roleScopeId: 'world-role-participant',
        },
      }),
    ).toThrow('World Run');
  });
});
