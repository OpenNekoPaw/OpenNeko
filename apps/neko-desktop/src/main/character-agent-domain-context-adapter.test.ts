import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';

import { resolveCharacterAgentTurnContext } from './character-agent-domain-context-adapter';

describe('Character Agent domain context adapter', () => {
  it('freezes the exact prepared Chara context before projecting the standard Agent turn payload', async () => {
    const prepared = {
      primaryAgentSessionId: 'conversation:character:run-1',
      characterRunId: 'run-1',
      mode: 'companion',
      context: {
        characterVersion: {
          characterVersionId: 'character-version:1',
          characterProjectId: 'character:1',
          label: 'Neko',
          definition: {
            summary: 'A concise character.',
            backgroundStory: createEmptyCharacterBackgroundStory(),
            originSetting: createEmptyCharacterOriginSetting(),
            canon: [],
            knowledgeBoundary: [],
            behaviorPolicy: [],
            expressionPolicy: [],
            representationRefs: [],
          },
          acceptedEvidenceIds: [],
          publishedAt: '2026-08-12T00:00:00.000Z',
        },
      },
    } as const;
    const interactions = {
      prepareTurn: vi.fn(async () => prepared),
      freezePreparedTurn: vi.fn(async () => undefined),
    };

    await expect(
      resolveCharacterAgentTurnContext({
        interactions,
        characterRunId: 'run-1',
        dialogueRunId: 'dialogue-1',
        turnId: 'turn-1',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'character',
        id: 'run-1',
        label: 'Neko',
      }),
    ]);
    expect(interactions.prepareTurn).toHaveBeenCalledWith(
      {
        topology: 'dialogue',
        dialogueRunId: 'dialogue-1',
        characterRunId: 'run-1',
      },
      undefined,
    );
    expect(interactions.freezePreparedTurn).toHaveBeenCalledWith(prepared, 'turn-1', undefined);
  });
});
