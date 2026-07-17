import { describe, expect, it, vi } from 'vitest';
import type { CreativeEntityRef, NpcProfileSource } from '@neko/shared';
import {
  CharacterDialogueSession,
  type CharacterDialogueResponder,
} from '../character-dialogue-session';

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
  sparsity: 'thin',
};

describe('CharacterDialogueSession', () => {
  it('keeps multi-turn Character Dialogue transcript in memory with no-tool defaults', async () => {
    let nowIndex = 0;
    const responder: CharacterDialogueResponder = vi.fn(async (input) => ({
      content: `Character:${input.userMessage.content}:${input.transcript.length}`,
    }));
    const session = new CharacterDialogueSession({
      id: 'npc-session-1',
      entityRef,
      profileSnapshot: profile,
      mode: 'roleplay',
      responder,
      now: () => `2026-06-01T00:00:0${++nowIndex}.000Z`,
    });

    const first = await session.sendUserMessage('hello');
    const second = await session.sendUserMessage('again');

    expect(session.config.toolPolicy).toEqual({ kind: 'none' });
    expect(session.config.modelTier).toBe('balanced');
    expect(first.npcMessage.content).toBe('Character:hello:1');
    expect(second.npcMessage.content).toBe('Character:again:3');
    expect(session.getTranscript().map((message) => [message.role, message.content])).toEqual([
      ['user', 'hello'],
      ['npc', 'Character:hello:1'],
      ['user', 'again'],
      ['npc', 'Character:again:3'],
    ]);
  });

  it('sends localized Chinese system prompts to the responder', async () => {
    const responder: CharacterDialogueResponder = vi.fn(async (input) => ({
      content: input.systemPrompt.includes('## 会话模式') ? '中文提示' : 'english prompt',
    }));
    const session = new CharacterDialogueSession({
      id: 'npc-session-zh',
      entityRef,
      profileSnapshot: profile,
      mode: 'roleplay',
      locale: 'zh-CN',
      responder,
    });

    const turn = await session.sendUserMessage('你好', {
      turnEvidence: makeEvidenceBundle('Lin only knows this clue.'),
    });

    expect(turn.npcMessage.content).toBe('中文提示');
    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'zh-CN',
        systemPrompt: expect.stringContaining('## 会话模式'),
      }),
    );
    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.not.stringContaining('## Session Mode'),
      }),
    );
    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('仅将这些证据用于当前角色会话回合'),
      }),
    );
  });

  it('passes turn-scoped evidence without persisting it into transcript or snapshot prompt', async () => {
    const responder: CharacterDialogueResponder = vi.fn(async (input) => ({
      content: input.systemPrompt.includes('Lin only knows the public clue.')
        ? 'bounded'
        : 'missing',
    }));
    const session = new CharacterDialogueSession({
      id: 'npc-session-evidence',
      entityRef,
      profileSnapshot: profile,
      mode: 'roleplay',
      responder,
    });

    await session.sendUserMessage('what do you know?', {
      turnEvidence: makeEvidenceBundle('Lin only knows the public clue.'),
    });

    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        turnEvidence: expect.objectContaining({
          chunks: [expect.objectContaining({ text: 'Lin only knows the public clue.' })],
        }),
        systemPrompt: expect.stringContaining('Turn-scoped project evidence'),
      }),
    );
    expect(session.getTranscript().map((message) => message.content)).toEqual([
      'what do you know?',
      'bounded',
    ]);
    expect(session.snapshot().systemPrompt).not.toContain('Lin only knows the public clue.');
  });

  it('rolls back a failed user turn and rejects sends after dispose', async () => {
    const session = new CharacterDialogueSession({
      id: 'npc-session-3',
      entityRef,
      profileSnapshot: profile,
      mode: 'roleplay',
      responder: async () => {
        throw new Error('model failed');
      },
    });

    await expect(session.sendUserMessage('hello')).rejects.toThrow('model failed');
    expect(session.getTranscript()).toEqual([]);

    session.dispose();
    await expect(session.sendUserMessage('after')).rejects.toThrow('disposed');
  });

  it('exports transcript artifacts without turning the profile snapshot into source truth', async () => {
    const session = new CharacterDialogueSession({
      id: 'npc-session-4',
      entityRef,
      profileSnapshot: profile,
      mode: 'roleplay',
      responder: async () => ({ content: 'Hello.' }),
      now: () => '2026-06-01T12:00:00.000Z',
    });

    await session.sendUserMessage('hello');

    expect(session.toArtifact({ profileHash: 'hash-1' })).toEqual(
      expect.objectContaining({
        version: 1,
        createdAt: '2026-06-01T12:00:00.000Z',
        entityRef,
        mode: 'roleplay',
        profileSnapshot: profile,
        sessionId: 'npc-session-4',
        profileHash: 'hash-1',
        transcript: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'hello' }),
          expect.objectContaining({ role: 'npc', content: 'Hello.' }),
        ]),
      }),
    );
  });
});

function makeEvidenceBundle(text: string) {
  return {
    entityRef,
    mode: 'character-dialogue' as const,
    query: 'what do you know?',
    chunks: [
      {
        id: 'evidence-1',
        text,
        sourceRefs: [
          {
            id: 'source-1',
            kind: 'dashboard-detail' as const,
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
