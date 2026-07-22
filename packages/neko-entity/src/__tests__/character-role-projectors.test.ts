import { describe, expect, it } from 'vitest';
import type { NpcProfileSource } from '@neko/shared';
import { projectCharacterDialogueSystemPrompt } from '../character-dialogue-profile-projector';

const entityRef = {
  entityId: 'char_xiaoju',
  entityKind: 'character',
  projectRoot: '${workspaceFolder}',
} as const;

const richProfile: NpcProfileSource = {
  entityRef,
  displayName: '小橘',
  aliases: ['Xiaoju'],
  sparsity: 'rich',
  facts: [
    {
      key: 'metadata.role',
      value: 'protagonist',
      source: 'registry',
      authority: 'confirmed',
    },
    {
      key: 'speech.catchphrase',
      value: '我先看看',
      source: 'agent-inferred',
      authority: 'suggested',
      confidence: 0.72,
    },
  ],
  relationships: [
    {
      key: 'relationship.char_laozhang.mentor',
      value: {
        name: '老张',
        relation: 'mentor',
        summary: 'strong',
      },
      source: 'relationship-graph',
      authority: 'confirmed',
    },
  ],
  dialogueSamples: ['小橘：我会自己确认。'],
  sceneAppearances: ['story/test.fountain:12'],
  representationBindings: [
    {
      role: 'portrait',
      representation: { kind: 'workspace-file', path: 'neko/assets/xiaoju-portrait.png' },
      isDefault: true,
    },
  ],
};

describe('character role prompt projectors', () => {
  it('renders roleplay mode with confirmed and suggested facts separated', () => {
    const prompt = projectCharacterDialogueSystemPrompt(richProfile, { mode: 'roleplay' });

    expect(prompt).toContain('Roleplay mode');
    expect(prompt).toContain('## Confirmed Facts');
    expect(prompt).toContain('- metadata.role: protagonist [registry]');
    expect(prompt).toContain('## Suggested / Uncertain Facts');
    expect(prompt).toContain('- speech.catchphrase: 我先看看 (confidence 72%) [agent-inferred]');
    expect(prompt).toContain('- 老张: mentor (strong)');
    expect(prompt).toContain('- portrait: neko/assets/xiaoju-portrait.png (default)');
  });

  it('renders consult mode as in-character advice without pretending uncertainty is confirmed', () => {
    const prompt = projectCharacterDialogueSystemPrompt(richProfile, { mode: 'consult' });

    expect(prompt).toContain('Consult mode');
    expect(prompt).toContain(
      'Suggested facts are uncertain; do not present them as confirmed truth.',
    );
  });

  it('renders Chinese character dialogue prompts without English wrapper drift', () => {
    const prompt = projectCharacterDialogueSystemPrompt(richProfile, {
      mode: 'roleplay',
      locale: 'zh-CN',
    });

    expect(prompt).toContain('你是 小橘。');
    expect(prompt).toContain('## 会话模式');
    expect(prompt).toContain('## 已确认事实');
    expect(prompt).toContain('## 建议 / 不确定事实');
    expect(prompt).toContain('- speech.catchphrase: 我先看看 (置信度 72%) [agent-inferred]');
    expect(prompt).toContain('- portrait: neko/assets/xiaoju-portrait.png (默认)');
    expect(prompt).not.toContain('## Session Mode');
    expect(prompt).not.toContain('## Confirmed Facts');
    expect(prompt).not.toContain('Suggested facts are uncertain');
  });

  it('renders thin profiles with explicit missing context boundaries', () => {
    const prompt = projectCharacterDialogueSystemPrompt(
      {
        entityRef,
        displayName: '小橘',
        aliases: [],
        facts: [
          {
            key: 'identity.name',
            value: '小橘',
            source: 'registry',
            authority: 'confirmed',
          },
        ],
        sparsity: 'thin',
      },
      { mode: 'roleplay' },
    );

    expect(prompt).toContain('Profile sparsity: thin');
    expect(prompt).toContain('If a fact is missing, stay in character and express uncertainty.');
    expect(prompt).toContain('## Relationships\n- None');
    expect(prompt).toContain('## Dialogue Samples\n- None');
  });
});
