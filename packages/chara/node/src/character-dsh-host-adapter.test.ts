import { describe, expect, it, vi } from 'vitest';

import { CharacterDshHostAdapter } from './character-dsh-host-adapter';

describe('Character DSH Host adapter', () => {
  it('checks the package-owned operation effect before resolving the authoring service', async () => {
    const resolveService = vi.fn();
    const checkAccess = vi.fn(() => ({
      outcome: 'failure' as const,
      diagnostic: { code: 'DSH_DOMAIN_TOOL_READ_ONLY', message: 'Write access is required.' },
    }));
    const adapter = new CharacterDshHostAdapter(resolveService, checkAccess);

    await expect(
      adapter.execute({
        sessionId: 'session-1',
        turn: 1,
        toolCallId: 'call-1',
        sandboxMode: 'read-only',
        tool: 'openneko_character',
        operation: 'fill-draft',
        input: {
          characterProjectId: 'character-1',
          displayName: 'Aster',
          definition: emptyDefinition(),
        },
      }),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'DSH_DOMAIN_TOOL_READ_ONLY' },
    });
    expect(checkAccess).toHaveBeenCalledWith(expect.anything(), 'write');
    expect(resolveService).not.toHaveBeenCalled();
  });

  it('strictly decodes and projects Character results through one service', async () => {
    const facts = characterFacts();
    const service = {
      query: vi.fn(async () => facts),
      fillDraft: vi.fn(async () => facts),
    };
    const checkAccess = vi.fn(() => undefined);
    const adapter = new CharacterDshHostAdapter(service, checkAccess);

    await expect(
      adapter.execute({
        sessionId: 'session-1',
        turn: 1,
        toolCallId: 'call-1',
        sandboxMode: 'read-only',
        tool: 'openneko_character',
        operation: 'query',
        input: { characterProjectId: 'character-1' },
      }),
    ).resolves.toMatchObject({
      outcome: 'success',
      result: { characterProjectId: 'character-1', displayName: 'Aster' },
    });
    expect(checkAccess).toHaveBeenCalledWith(expect.anything(), 'read');
    expect(service.query).toHaveBeenCalledOnce();
  });

  it('rejects the wrong Tool and unknown input before service access', async () => {
    const service = { query: vi.fn(), fillDraft: vi.fn() };
    const adapter = new CharacterDshHostAdapter(
      service,
      vi.fn(() => undefined),
    );

    await expect(
      adapter.execute({
        sessionId: 'session-1',
        turn: 1,
        toolCallId: 'call-1',
        sandboxMode: 'read-only',
        tool: 'openneko_canvas',
        operation: 'query',
        input: {},
      }),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'CHARACTER_DSH_TOOL_MISMATCH' },
    });
    await expect(
      adapter.execute({
        sessionId: 'session-1',
        turn: 1,
        toolCallId: 'call-2',
        sandboxMode: 'read-only',
        tool: 'openneko_character',
        operation: 'query',
        input: { characterProjectId: 'character-1', unexpected: true },
      }),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'CHARACTER_DSH_TOOL_INVALID_INPUT' },
    });
    expect(service.query).not.toHaveBeenCalled();
  });
});

function characterFacts() {
  return {
    characterProjectId: 'character-1',
    displayName: 'Aster',
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
}

function emptyDefinition() {
  return {
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
  };
}
