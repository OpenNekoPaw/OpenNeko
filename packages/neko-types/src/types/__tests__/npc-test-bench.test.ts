import { describe, expect, it } from 'vitest';
import {
  CHARACTER_ROLE_TEST_ARTIFACT_DIR,
  NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND,
  NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
  NPC_TEST_BENCH_AS_SLASH_COMMAND,
  NPC_TEST_BENCH_EXIT_AS_SLASH_COMMAND,
  NPC_TRANSCRIPT_ARTIFACT_VERSION,
  isNpcAgentWorkflowRequest,
  isNpcEvaluationReport,
  isNpcEvaluationSuggestion,
  isNpcProfileFact,
  isNpcProfileSource,
  isNpcTestBenchLaunchRequest,
  isNpcTranscriptArtifact,
  type NpcEvaluationReport,
  type NpcAgentWorkflowRequest,
  type NpcProfileSource,
  type NpcTestBenchLaunchRequest,
  type NpcTranscriptArtifact,
} from '../npc-test-bench';

const entityRef = {
  entityId: 'char-xiaoju',
  entityKind: 'character',
  projectRoot: '${workspaceFolder}',
  source: 'neko-entity',
} as const;

const profile: NpcProfileSource = {
  entityRef,
  displayName: '小橘',
  aliases: ['Xiaoju'],
  sparsity: 'partial',
  sparsityScore: {
    level: 'partial',
    score: 0.62,
    confirmedFactCount: 4,
    suggestedFactCount: 1,
    relationshipCount: 1,
    dialogueSampleCount: 1,
    missingFactKeys: ['speech-pattern'],
  },
  facts: [
    {
      key: 'role',
      value: 'protagonist',
      source: 'registry',
      authority: 'confirmed',
      confidence: 1,
      sourceRef: 'characters.json',
    },
    {
      key: 'speech-pattern',
      value: 'short, curious replies',
      source: 'agent-inferred',
      authority: 'suggested',
      confidence: 0.7,
    },
  ],
  relationships: [
    {
      key: 'friend',
      value: {
        name: '老张',
        relation: 'mentor',
        entityRef: { entityId: 'char-laozhang', entityKind: 'character' },
      },
      source: 'relationship-graph',
      authority: 'confirmed',
    },
  ],
  representationBindings: [
    {
      role: 'portrait',
      representation: { kind: 'workspace-file', path: 'neko/assets/xiaoju-portrait.png' },
      isDefault: true,
    },
  ],
  dialogueSamples: ['小橘：我想先看看那里有什么。'],
  sceneAppearances: ['scene-1'],
};

const evaluation: NpcEvaluationReport = {
  version: NPC_TRANSCRIPT_ARTIFACT_VERSION,
  createdAt: '2026-06-01T00:00:00.000Z',
  entityRef,
  summary: 'Persona is mostly consistent, with one relationship gap.',
  scores: [
    {
      dimension: 'persona-consistency',
      score: 0.8,
      summary: 'Stayed in role.',
    },
  ],
  findings: [
    {
      id: 'finding-1',
      dimension: 'relationship-coverage',
      severity: 'warning',
      message: 'NPC hesitated when 老张 was mentioned.',
      transcriptMessageIds: ['m2'],
      factKeys: ['friend'],
    },
  ],
  suggestions: [
    {
      id: 'suggestion-1',
      kind: 'entity-metadata',
      status: 'suggested',
      title: 'Add a speech pattern note',
      rationale: 'The transcript shows a repeated concise speaking style.',
      proposedValue: 'short, curious replies',
      applyTarget: {
        kind: 'entity-metadata',
        entityRef,
        metadataKey: 'speechPattern',
      },
      authority: 'suggested',
      requiresUserConfirmation: true,
      confidence: 0.72,
      sourceFindingIds: ['finding-1'],
    },
  ],
};

const artifact: NpcTranscriptArtifact = {
  version: NPC_TRANSCRIPT_ARTIFACT_VERSION,
  createdAt: '2026-06-01T00:05:00.000Z',
  entityRef,
  mode: 'roleplay',
  profileSnapshot: profile,
  transcript: [
    {
      id: 'm1',
      role: 'user',
      content: '你好，小橘',
      createdAt: '2026-06-01T00:01:00.000Z',
      turnIndex: 0,
    },
    {
      id: 'm2',
      role: 'npc',
      content: '你好，我在。',
      createdAt: '2026-06-01T00:01:01.000Z',
      turnIndex: 1,
      speakerName: '小橘',
    },
  ],
  evaluation,
  profileHash: 'profile-hash-1',
  sessionId: 'npc-session-1',
};

describe('character role workflow contracts', () => {
  it('declares shared command constants', () => {
    expect(NPC_TEST_BENCH_AS_SLASH_COMMAND).toBe('/as');
    expect(NPC_TEST_BENCH_EXIT_AS_SLASH_COMMAND).toBe('/exit-as');
    expect(NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND).toBe('neko.agent.characterDialogue');
    expect(NEKO_AGENT_EMBODY_CHARACTER_COMMAND).toBe('neko.agent.embodyCharacter');
    expect(CHARACTER_ROLE_TEST_ARTIFACT_DIR).toBe('.neko/character-tests');
  });

  it('validates launch requests from Agent entry points', () => {
    const launch: NpcTestBenchLaunchRequest = {
      entityRef,
      mode: 'consult',
      enrichment: 'ask',
      source: 'agent',
      projectRoot: '${workspaceFolder}',
      initialUserMessage: '先聊一分钟',
    };

    expect(isNpcTestBenchLaunchRequest(launch)).toBe(true);
    expect(isNpcTestBenchLaunchRequest({ ...launch, mode: 'authoring' })).toBe(false);
    expect(isNpcTestBenchLaunchRequest({ ...launch, projectRoot: '' })).toBe(false);
  });

  it('validates Agent NPC workflow requests from canonical Entity actions', () => {
    const request: NpcAgentWorkflowRequest = {
      workflow: 'embody-character',
      entityRef,
      scopes: [
        {
          kind: 'occurrence',
          source: 'fountain-content',
          ref: 'cases/test.fountain:8',
          label: 'Scene 1',
        },
      ],
      prompt: 'Check knowledge leakage.',
      source: 'agent',
      projectRoot: '${workspaceFolder}',
    };

    expect(isNpcAgentWorkflowRequest(request)).toBe(true);
    expect(isNpcAgentWorkflowRequest({ ...request, workflow: 'test-npc' })).toBe(false);
    expect(isNpcAgentWorkflowRequest({ ...request, workflow: 'validate-character' })).toBe(false);
    expect(isNpcAgentWorkflowRequest({ ...request, workflow: 'improve-character' })).toBe(false);
    expect(isNpcAgentWorkflowRequest({ ...request, source: 'slash-command' })).toBe(false);
    expect(
      isNpcAgentWorkflowRequest({
        ...request,
        scopes: [{ kind: 'occurrence', source: 'fountain-content', ref: '/tmp/test.fountain' }],
      }),
    ).toBe(false);
  });

  it('validates project-scoped profile facts and sparse profile metadata', () => {
    expect(isNpcProfileSource(profile)).toBe(true);
    expect(isNpcProfileFact(profile.facts[0])).toBe(true);
    expect(isNpcProfileFact({ ...profile.facts[0], confidence: 1.2 })).toBe(false);
    expect(
      isNpcProfileSource({
        ...profile,
        relationships: [{ ...profile.relationships![0], value: { name: '老张' } }],
      }),
    ).toBe(false);
  });

  it('validates transcript artifacts with optional evaluation evidence', () => {
    expect(isNpcTranscriptArtifact(artifact)).toBe(true);
    expect(isNpcEvaluationReport(evaluation)).toBe(true);
    expect(isNpcEvaluationSuggestion(evaluation.suggestions[0])).toBe(true);
    expect(
      isNpcTranscriptArtifact({
        ...artifact,
        entityRef: { entityId: 'other', entityKind: 'character' },
      }),
    ).toBe(false);
  });

  it('requires NPC suggestions to stay suggested and user-confirmed', () => {
    expect(
      isNpcEvaluationSuggestion({
        ...evaluation.suggestions[0],
        authority: 'confirmed',
      }),
    ).toBe(false);
    expect(
      isNpcEvaluationSuggestion({
        ...evaluation.suggestions[0],
        requiresUserConfirmation: false,
      }),
    ).toBe(false);
  });
});
