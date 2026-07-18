import { describe, expect, it, vi } from 'vitest';
import type { CreativeEntityRef, NpcProfileSource } from '@neko/shared';
import {
  EMBODY_CHARACTER_BLOCKED_TOOL_NAMES,
  EmbodyCharacterSession,
  buildEmbodyCharacterTurnSystemPrompt,
  isToolAllowedForEmbodyCharacter,
  projectEmbodyCharacterFeedbackPrompt,
  type EmbodyCharacterEvidenceSnapshot,
  type EmbodyCharacterResponder,
} from '../embody-character-session';

const entityRef: CreativeEntityRef = {
  entityId: 'char-lin',
  entityKind: 'character',
  projectRoot: '/project',
  source: 'neko-entity',
};

const profile: NpcProfileSource = {
  entityRef,
  displayName: 'Lin',
  aliases: ['L'],
  facts: [
    {
      key: 'identity.name',
      value: 'Lin',
      source: 'registry',
      authority: 'confirmed',
    },
  ],
  sparsity: 'partial',
};

const evidence: EmbodyCharacterEvidenceSnapshot = {
  relationships: [],
  occurrences: [],
  representationHints: [],
  scriptContextFacts: [],
};

describe('EmbodyCharacterSession', () => {
  it('keeps feedback transcript with read-only no-tool defaults', async () => {
    let nowIndex = 0;
    const responder: EmbodyCharacterResponder = vi.fn(async (input) => ({
      content: `Feedback:${input.userMessage.content}:${input.config.capabilityPolicy.kind}`,
      classifications: ['mode-boundary'] as const,
    }));
    const session = new EmbodyCharacterSession({
      id: 'embody-session-1',
      entityRef,
      profileSnapshot: profile,
      evidenceSnapshot: evidence,
      responder,
      now: () => `2026-06-02T00:00:0${++nowIndex}.000Z`,
    });

    const turn = await session.sendUserMessage('记录今天的日记');

    expect(session.config.toolPolicy).toEqual({ kind: 'none' });
    expect(session.config.capabilityPolicy).toEqual({ kind: 'character-feedback-readonly' });
    expect(turn.feedbackMessage.role).toBe('evaluator');
    expect(turn.feedbackMessage.content).toContain('character-feedback-readonly');
    expect(turn.feedbackMessage.metadata).toEqual(
      expect.objectContaining({
        capabilityPolicy: 'character-feedback-readonly',
        toolPolicy: 'none',
        classifications: 'mode-boundary',
      }),
    );
    expect(session.getTranscript().map((message) => [message.role, message.content])).toEqual([
      ['user', '记录今天的日记'],
      ['evaluator', 'Feedback:记录今天的日记:character-feedback-readonly'],
    ]);
  });

  it('passes turn-scoped evidence to feedback prompt without persisting it', async () => {
    const responder: EmbodyCharacterResponder = vi.fn(async (input) => ({
      content: input.systemPrompt.includes('Lin only knows public evidence.')
        ? 'supported feedback'
        : 'missing feedback',
      classifications: ['confirmed'] as const,
    }));
    const session = new EmbodyCharacterSession({
      id: 'embody-session-evidence',
      entityRef,
      profileSnapshot: profile,
      evidenceSnapshot: evidence,
      responder,
    });

    await session.sendUserMessage('I only know public evidence.', {
      turnEvidence: makeEvidenceBundle('Lin only knows public evidence.'),
    });

    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        turnEvidence: expect.objectContaining({
          chunks: [expect.objectContaining({ text: 'Lin only knows public evidence.' })],
        }),
        systemPrompt: expect.stringContaining('Turn-scoped project evidence'),
      }),
    );
    expect(session.getTranscript().map((message) => message.content)).toEqual([
      'I only know public evidence.',
      'supported feedback',
    ]);
    expect(session.snapshot().systemPrompt).not.toContain('Lin only knows public evidence.');
  });

  it('rolls back a failed user turn and rejects sends after dispose', async () => {
    const session = new EmbodyCharacterSession({
      id: 'embody-session-3',
      entityRef,
      profileSnapshot: profile,
      evidenceSnapshot: evidence,
      responder: async () => {
        throw new Error('model failed');
      },
    });

    await expect(session.sendUserMessage('hello')).rejects.toThrow('model failed');
    expect(session.getTranscript()).toEqual([]);

    session.dispose();
    await expect(session.sendUserMessage('after')).rejects.toThrow('disposed');
  });

  it('blocks skill activation and creative authoring tools by policy', () => {
    expect(EMBODY_CHARACTER_BLOCKED_TOOL_NAMES).toContain('ActivateSkill');
    expect(isToolAllowedForEmbodyCharacter('ActivateSkill')).toBe(false);
    expect(isToolAllowedForEmbodyCharacter('GenerateImage')).toBe(false);
    expect(isToolAllowedForEmbodyCharacter('CreateTask')).toBe(false);
    expect(isToolAllowedForEmbodyCharacter('ReadCharacterEvidence')).toBe(true);
  });

  it('keeps thin profiles and missing evidence bounded to feedback semantics', () => {
    const thinProfile: NpcProfileSource = {
      ...profile,
      facts: [],
      sparsity: 'thin',
    };

    const prompt = projectEmbodyCharacterFeedbackPrompt({
      profile: thinProfile,
      evidence,
      prompt: 'Only check what the project already supports.',
    });

    expect(prompt).toContain('read-only character embodiment coach');
    expect(prompt).toContain('must not play, impersonate');
    expect(prompt).toContain('normal conversation partner');
    expect(prompt).toContain('Do not repeat the embodied identity on every turn');
    expect(prompt).toContain('Do not lead with labels');
    expect(prompt).toContain('Prefer one short paragraph for simple knowledge questions');
    expect(prompt).toContain('Identity/current-role questions');
    expect(prompt).toContain('Character knowledge questions');
    expect(prompt).toContain('Roleplay consistency checks');
    expect(prompt).toContain('Do not activate skills');
    expect(prompt).toContain('Creative execution or project-state requests');
    expect(prompt).toContain('Confirmed facts:\n- none');
    expect(prompt).toContain('Relationships available: 0.');
    expect(prompt).toContain('Occurrences available: 0.');
    expect(prompt).toContain('Script context facts available: 0.');
  });

  it('renders Chinese feedback prompts without English wrapper drift', () => {
    const prompt = projectEmbodyCharacterFeedbackPrompt({
      profile,
      evidence,
      prompt: '只检查项目证据支持的内容。',
      locale: 'zh-CN',
    });

    expect(prompt).toContain('你是 Lin 的只读角色代入反馈教练。');
    expect(prompt).toContain('请求处理：');
    expect(prompt).toContain('已确认事实：');
    expect(prompt).toContain('用户设置说明：只检查项目证据支持的内容。');
    expect(prompt).not.toContain('read-only character embodiment coach');
    expect(prompt).not.toContain('Request handling:');

    const turnPrompt = buildEmbodyCharacterTurnSystemPrompt({
      baseSystemPrompt: prompt,
      turnEvidence: makeEvidenceBundle('Lin stays with the team.'),
      locale: 'zh',
    });
    expect(turnPrompt).toContain('仅将这些证据用于当前用户角色扮演回合的只读反馈');
    expect(turnPrompt).not.toContain('Use this evidence only for read-only feedback');
  });

  it('includes script context fact content in feedback prompt evidence', () => {
    const prompt = projectEmbodyCharacterFeedbackPrompt({
      profile,
      evidence: {
        ...evidence,
        scriptContextFacts: [
          {
            key: 'script.context.1',
            value: 'Script file: cases/test.fountain\n220: Lin decides to stay with the team.',
            source: 'script-extraction',
            authority: 'confirmed',
            sourceRef: 'cases/test.fountain:200-230',
          },
        ],
      },
    });

    expect(prompt).toContain('Script context facts available: 1.');
    expect(prompt).toContain('script.context.1');
    expect(prompt).toContain('Lin decides to stay with the team.');
  });
});

function makeEvidenceBundle(text: string) {
  return {
    entityRef,
    mode: 'embody-character' as const,
    query: 'feedback',
    chunks: [
      {
        id: 'evidence-1',
        text,
        sourceRefs: [
          {
            id: 'source-1',
            kind: 'entity-occurrence' as const,
            projectRelativePath: 'cases/test.fountain',
            lineStart: 10,
            lineEnd: 12,
            freshness: 'fresh' as const,
          },
        ],
        authority: 'confirmed' as const,
        relevance: { score: 10, signals: [] },
        freshness: 'fresh' as const,
      },
    ],
    omitted: [],
    freshness: 'fresh' as const,
    budget: { maxChunks: 2, maxCharacters: 1000, perChunkMaxCharacters: 1000 },
  };
}
