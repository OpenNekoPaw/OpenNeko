import { describe, expect, it } from 'vitest';
import { assertProjectEntityInspectorIntent } from './project-entity-inspector';

describe('Project Entity Inspector intents', () => {
  it('parses semantic and binding operations without renderer-owned concurrency state', () => {
    expect(
      assertProjectEntityInspectorIntent({
        type: 'confirm',
        candidateId: 'candidate-nova',
        accepted: {
          kind: 'character',
          names: { canonical: 'Nova', aliases: [] },
        },
      }),
    ).toMatchObject({ type: 'confirm', candidateId: 'candidate-nova' });
    expect(
      assertProjectEntityInspectorIntent({
        type: 'bind',
        entityId: 'character-nova',
        binding: {
          role: 'portrait',
          target: { file: { authority: 'workspace', path: 'nova.png' } },
        },
      }),
    ).toMatchObject({ type: 'bind', binding: { role: 'portrait' } });
  });

  it('rejects removed Asset and Character interaction operations plus renderer-owned fields', () => {
    for (const intent of [
      {
        type: 'publish',
        entityId: 'character-nova',
      },
      {
        type: 'reference',
        entityId: 'character-nova',
        conversationId: 'conversation-nova',
        slashCommand: '/character nova',
      },
      {
        type: 'instantiate',
        asset: { assetId: 'asset-nova' },
      },
      {
        type: 'character-dialogue',
        entityId: 'character-nova',
        characterId: 'character-runtime-nova',
      },
      {
        type: 'room-open',
        entityId: 'character-nova',
        roomId: 'room-nova',
      },
      {
        type: 'character-embody',
        entityId: 'character-nova',
        characterId: 'character-runtime-nova',
        conversationId: 'conversation-nova',
      },
    ]) {
      expect(() => assertProjectEntityInspectorIntent(intent)).toThrow();
    }
  });
});
