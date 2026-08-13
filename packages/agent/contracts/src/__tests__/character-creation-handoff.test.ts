import { describe, expect, it } from 'vitest';
import {
  createCharacterCreationHandoffIntent,
  parseCharacterCreationHandoffIntent,
} from '../character-creation-handoff';

describe('Character creation handoff', () => {
  it('preserves the exact builtin identity, prompt and authorized references', () => {
    const reference = {
      type: 'asset' as const,
      id: 'reference-1',
      label: 'Portrait',
      summary: 'A brass clockmaker portrait.',
      data: {
        catalogEntryId: 'reference:asset:portrait-1',
        ownerKind: 'assistant',
        ownerId: 'assistant-space:local-user',
        bindingReceiptId: 'binding-receipt:portrait-1',
      },
      intent: 'Use the visible scar as source evidence.',
    };
    const handoff = createCharacterCreationHandoffIntent({
      intentId: 'character-creation-1',
      prompt: 'Preserve the complete prompt.',
      references: [reference],
    });

    expect(parseCharacterCreationHandoffIntent(handoff)).toEqual({
      kind: 'character-creation',
      intentId: 'character-creation-1',
      skill: {
        name: 'character-creator',
        source: { kind: 'builtin' },
      },
      prompt: 'Preserve the complete prompt.',
      references: [reference],
      returnTarget: { kind: 'character-management' },
    });
  });

  it.each([
    { kind: 'personal', ownerId: 'user-1' },
    { kind: 'project', workspaceId: 'workspace-1' },
  ])('rejects a same-name $kind Skill source', (source) => {
    expect(() =>
      parseCharacterCreationHandoffIntent({
        kind: 'character-creation',
        intentId: 'character-creation-1',
        skill: { name: 'character-creator', source },
        prompt: '',
        references: [],
        returnTarget: { kind: 'character-management' },
      }),
    ).toThrow();
  });

  it('rejects a catalog fingerprint leaking into the logical builtin identity', () => {
    expect(() =>
      parseCharacterCreationHandoffIntent({
        ...createCharacterCreationHandoffIntent({ intentId: 'character-creation-1' }),
        skill: {
          name: 'character-creator',
          source: { kind: 'builtin', sourceId: 'sha256:catalog-fingerprint' },
        },
      }),
    ).toThrow('unsupported or missing fields');
  });

  it('rejects unsupported fields and return destinations', () => {
    expect(() =>
      parseCharacterCreationHandoffIntent({
        ...createCharacterCreationHandoffIntent({ intentId: 'character-creation-1' }),
        toolName: 'chara.character.fillDraft',
      }),
    ).toThrow('unsupported or missing fields');
    expect(() =>
      parseCharacterCreationHandoffIntent({
        ...createCharacterCreationHandoffIntent({ intentId: 'character-creation-1' }),
        returnTarget: { kind: 'character-studio' },
      }),
    ).toThrow('must be Character Management');
  });
});
