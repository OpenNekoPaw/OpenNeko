import { describe, expect, it, vi } from 'vitest';
import type {
  CreativeEntityRef,
  NpcEvaluationReport,
  NpcProfileSource,
  NpcTranscriptArtifact,
} from '@neko/shared';
import {
  appendCharacterDialogueUserSupplement,
  createCharacterDialogueRuntimeService,
  createFallbackCharacterDialogueEvaluationReport,
  evaluateCharacterDialogueTranscript,
} from '../character-dialogue-runtime';
import type { CharacterDialogueResponder } from '../character-dialogue-session';
import type { CharacterEvidenceBundle, CharacterEvidenceRequest } from '../character-evidence';

const entityRef: CreativeEntityRef = {
  entityId: 'char-lin',
  entityKind: 'character',
  projectRoot: '/project',
  source: 'neko-entity',
};

const thinProfile: NpcProfileSource = {
  entityRef,
  displayName: 'Lin',
  aliases: [],
  facts: [
    {
      key: 'identity.name',
      value: 'Lin',
      source: 'registry',
      authority: 'confirmed',
    },
  ],
  sparsity: 'thin',
};

describe('CharacterDialogueRuntimeService', () => {
  it('prepares thin profiles through injected policy, enrichment, and manual supplement ports', async () => {
    const enrichedProfile: NpcProfileSource = {
      ...thinProfile,
      facts: [
        ...thinProfile.facts,
        {
          key: 'speech.sample',
          value: 'Quiet.',
          source: 'script-extraction',
          authority: 'suggested',
        },
      ],
      sparsity: 'partial',
    };
    const runtime = createCharacterDialogueRuntimeService({
      ports: {
        createResponder: asyncResponder('ok'),
        chooseThinProfileAction: vi.fn(async () => 'enrich-project' as const),
        enrichProfile: vi.fn(async () => ({ profile: enrichedProfile })),
      },
    });

    await expect(
      runtime.prepareProfileForLaunch({
        profile: thinProfile,
        projectRoot: '/project',
        request: { entityRef, source: 'slash-command', enrichment: 'ask' },
      }),
    ).resolves.toEqual({ status: 'ready', profile: enrichedProfile });

    expect(appendCharacterDialogueUserSupplement(thinProfile, '  keeps secrets  ').facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'userSupplement.notes',
          value: 'keeps secrets',
          authority: 'suggested',
        }),
      ]),
    );
  });

  it('runs headless dialogue probes with turn-scoped evidence from injected ports', async () => {
    const responder: CharacterDialogueResponder = vi.fn(async (input) => ({
      content: input.systemPrompt.includes('Lin only knows public evidence.')
        ? `bounded:${input.userMessage.content}`
        : 'missing-evidence',
    }));
    const evidenceLoader = {
      loadEvidence: vi.fn(async (request: CharacterEvidenceRequest) =>
        makeEvidenceBundle(request, 'Lin only knows public evidence.'),
      ),
    };
    const runtime = createCharacterDialogueRuntimeService({
      ports: {
        createResponder: () => responder,
        createEvidenceLoader: () => evidenceLoader,
      },
      now: () => '2026-06-01T00:00:00.000Z',
      createSessionId: () => 'probe-session',
      createMessageId: (role, turnIndex) => `msg-${turnIndex}-${role}`,
    });

    const artifact = await runtime.runHeadlessDialogueProbe({
      entityRef,
      profile: thinProfile,
      messages: ['hello'],
      projectRoot: '/project',
    });

    expect(evidenceLoader.loadEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        entityRef,
        mode: 'character-validation',
        query: 'hello',
        projectRoot: '/project',
      }),
    );
    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        turnEvidence: expect.objectContaining({
          chunks: [expect.objectContaining({ text: 'Lin only knows public evidence.' })],
        }),
        systemPrompt: expect.stringContaining('Lin only knows public evidence.'),
      }),
    );
    expect(artifact.transcript.map((message) => message.content)).toEqual([
      'hello',
      'bounded:hello',
    ]);
  });

  it('evaluates, saves, and applies suggestions through narrow ports with fallback defaults', async () => {
    const runtime = createCharacterDialogueRuntimeService({
      ports: {
        createResponder: asyncResponder('ok'),
        chooseSavePolicy: vi.fn(async () => 'always' as const),
        saveTranscriptArtifact: vi.fn(async () => ({ path: '.neko/character-tests/lin.json' })),
        confirmSuggestionApply: vi.fn(async () => true),
        applySuggestion: vi.fn(async () => ({ applied: true })),
      },
      now: () => '2026-06-01T00:00:00.000Z',
    });
    const artifact = makeArtifact();

    const evaluated = await runtime.evaluateArtifact({ artifact, projectRoot: '/project' });
    const saved = await runtime.maybeSaveArtifact({
      artifact: evaluated,
      projectRoot: '/project',
      reason: 'user',
    });
    const applied = await runtime.applySuggestionWithConfirmation({
      suggestion: {
        id: 'suggestion-1',
        kind: 'profile-fact',
        status: 'suggested',
        title: 'Update note',
        rationale: 'test',
        proposedValue: 'quiet',
        applyTarget: {
          kind: 'profile-fact',
          entityRef,
          factKey: 'personality',
        },
        authority: 'suggested',
        requiresUserConfirmation: true,
      },
      projectRoot: '/project',
    });

    expect(evaluated.evaluation).toEqual(
      createFallbackCharacterDialogueEvaluationReport(artifact, '2026-06-01T00:00:00.000Z'),
    );
    expect(saved).toEqual({ path: '.neko/character-tests/lin.json' });
    expect(applied).toEqual({ applied: true });
  });

  it('evaluates transcripts through the injected service in runtime', async () => {
    const artifact = makeArtifact();
    const report: NpcEvaluationReport = {
      version: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
      entityRef,
      summary: 'Lin stayed in character.',
      scores: [
        {
          dimension: 'persona-consistency',
          score: 0.9,
          summary: 'Consistent.',
        },
      ],
      findings: [],
      suggestions: [],
    };
    const evaluator = vi.fn(async () => report);

    await expect(
      evaluateCharacterDialogueTranscript(artifact, {
        evaluator,
        now: () => '2026-06-01T00:00:00.000Z',
      }),
    ).resolves.toEqual(report);

    expect(evaluator).toHaveBeenCalledWith(artifact, {});
  });

  it('propagates semantic evaluator failures without a fallback success path', async () => {
    const artifact = makeArtifact();

    await expect(
      evaluateCharacterDialogueTranscript(artifact, {
        evaluator: vi.fn(async () => {
          throw new Error('offline');
        }),
        now: () => '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('offline');
  });
});

function asyncResponder(content: string): () => CharacterDialogueResponder {
  return () => async () => ({ content });
}

function makeArtifact(): NpcTranscriptArtifact {
  return {
    version: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    entityRef,
    mode: 'roleplay' as const,
    profileSnapshot: thinProfile,
    sessionId: 'session-1',
    transcript: [
      {
        id: 'm1',
        role: 'user' as const,
        content: 'hello',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  };
}

function makeEvidenceBundle(
  request: CharacterEvidenceRequest,
  text: string,
): CharacterEvidenceBundle {
  return {
    entityRef: request.entityRef,
    mode: request.mode,
    query: request.query,
    chunks: [
      {
        id: 'evidence-1',
        text,
        sourceRefs: [
          {
            id: 'source-1',
            kind: 'entity-occurrence',
            projectRelativePath: 'cases/test.fountain',
            lineStart: 1,
            lineEnd: 1,
            freshness: 'fresh',
          },
        ],
        authority: 'confirmed',
        relevance: { score: 1, signals: [] },
        freshness: 'fresh',
      },
    ],
    omitted: [],
    freshness: 'fresh',
    budget: request.budget,
  };
}
