import { describe, expect, it } from 'vitest';
import { assertProjectEntityInspectorIntent } from './project-entity-inspector';

describe('Project Entity Inspector intents', () => {
  it('parses revisioned semantic and binding operations', () => {
    expect(
      assertProjectEntityInspectorIntent({
        type: 'confirm',
        expectedRevision: 4,
        candidateId: 'candidate-nova',
        accepted: {
          kind: 'character',
          names: { canonical: 'Nova', aliases: [] },
          facts: { role: 'lead' },
        },
      }),
    ).toMatchObject({ type: 'confirm', expectedRevision: 4, candidateId: 'candidate-nova' });
    expect(
      assertProjectEntityInspectorIntent({
        type: 'bind',
        expectedRevision: 4,
        entityId: 'character-nova',
        binding: {
          role: 'portrait',
          target: { kind: 'workspace-file', path: 'nova.png' },
        },
      }),
    ).toMatchObject({ type: 'bind', binding: { role: 'portrait' } });
  });

  it('parses exact owner identities for interaction operations', () => {
    expect(
      assertProjectEntityInspectorIntent({
        type: 'character-dialogue',
        entityId: 'character-nova',
        characterId: 'character-runtime-nova',
        conversationId: 'conversation-nova',
      }),
    ).toEqual({
      type: 'character-dialogue',
      entityId: 'character-nova',
      characterId: 'character-runtime-nova',
      conversationId: 'conversation-nova',
    });
    expect(() =>
      assertProjectEntityInspectorIntent({
        type: 'room-open',
        entityId: 'character-nova',
      }),
    ).toThrow('identity is invalid');
  });

  it('rejects renderer-owned paths, extra fields, and malformed revisions', () => {
    for (const intent of [
      { type: 'publish', expectedRevision: -1, entityId: 'character-nova' },
      {
        type: 'reference',
        entityId: 'character-nova',
        conversationId: 'conversation-nova',
        slashCommand: '/character nova',
      },
      {
        type: 'instantiate',
        expectedRevision: 1,
        asset: { assetId: 'asset-nova', revision: '2', digest: 'bad' },
      },
    ]) {
      expect(() => assertProjectEntityInspectorIntent(intent)).toThrow();
    }
  });
});
