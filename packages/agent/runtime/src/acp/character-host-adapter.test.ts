import { describe, expect, it, vi } from 'vitest';

import { CharacterDshHostAdapter } from './character-host-adapter';

describe('CharacterDshHostAdapter', () => {
  it('strictly decodes and delegates query/fill-draft through one service', async () => {
    const facts = {
      characterProjectId: 'character-project-1',
      displayName: 'Mira',
      reviewStatus: 'draft' as const,
      isFreshTarget: true,
      draft: {
        hasSummary: false,
        hasBackground: false,
        hasOrigin: false,
        canonCount: 0,
        knowledgeBoundaryCount: 0,
        behaviorPolicyCount: 0,
        expressionPolicyCount: 0,
        representationCount: 0,
      },
      evidenceCount: 0,
      candidateCount: 0,
      versionCount: 0,
      versions: [],
      versionsTruncated: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const service = {
      query: vi.fn(async () => facts),
      fillDraft: vi.fn(async () => facts),
    };
    const adapter = new CharacterDshHostAdapter(service);

    await expect(
      adapter.execute(
        {
          sessionId: 'session-1',
          turn: 1,
          toolCallId: 'call-1',
          tool: 'openneko.character',
          operation: 'query',
          input: { characterProjectId: 'character-project-1' },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ outcome: 'success', result: facts });
    await expect(
      adapter.execute(
        {
          sessionId: 'session-1',
          turn: 1,
          toolCallId: 'call-2',
          tool: 'openneko.character',
          operation: 'fill-draft',
          input: {
            characterProjectId: 'character-project-1',
            displayName: 'Mira',
            definition: {
              summary: '',
              backgroundStory: {
                overview: '',
                origins: [],
                personalHistory: [],
                formativeEvents: [],
                establishedRelationships: [],
              },
              originSetting: {
                overview: '',
                eras: [],
                cultures: [],
                socialEnvironment: [],
                importantPlaces: [],
                organizations: [],
                believedRules: [],
              },
              canon: [],
              knowledgeBoundary: [],
              behaviorPolicy: [],
              expressionPolicy: [],
              representationRefs: [],
            },
          },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ outcome: 'success', result: facts });
    expect(service.query).toHaveBeenCalledOnce();
    expect(service.fillDraft).toHaveBeenCalledOnce();
  });

  it('rejects the wrong Tool and unknown input before service access', async () => {
    const service = { query: vi.fn(), fillDraft: vi.fn() };
    const adapter = new CharacterDshHostAdapter(service);
    await expect(
      adapter.execute(
        {
          sessionId: 'session-1',
          turn: 1,
          toolCallId: 'call-1',
          tool: 'openneko.canvas',
          operation: 'query',
          input: {},
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'CHARACTER_DSH_TOOL_MISMATCH' },
    });
    await expect(
      adapter.execute(
        {
          sessionId: 'session-1',
          turn: 1,
          toolCallId: 'call-2',
          tool: 'openneko.character',
          operation: 'query',
          input: { characterProjectId: 'character-project-1', unexpected: true },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'CHARACTER_DSH_TOOL_INVALID_INPUT' },
    });
    expect(service.query).not.toHaveBeenCalled();
  });
});
