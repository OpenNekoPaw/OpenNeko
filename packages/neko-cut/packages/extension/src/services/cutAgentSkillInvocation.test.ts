import { describe, expect, it } from 'vitest';
import { buildCutAgentSkillInvocation } from './cutAgentSkillInvocation';

describe('buildCutAgentSkillInvocation', () => {
  it.each([
    ['video', 'Generate a video clip for the active timeline'],
    ['subtitle', 'Transcribe the selected clip to subtitles'],
  ])('builds the canonical %s Skill invocation', (skillName, intent) => {
    expect(buildCutAgentSkillInvocation(skillName, intent)).toEqual({
      skillName,
      intent,
      skill: {
        name: 'NekoCut',
        description: 'NekoCut timeline AI workflow',
      },
    });
  });

  it('poisons the removed ai-generate Skill identity', () => {
    expect(() => buildCutAgentSkillInvocation('ai-generate', 'Generate a clip')).toThrow(
      'unsupported-cut-agent-skill: ai-generate',
    );
  });

  it('rejects an empty intent instead of forwarding a no-op request', () => {
    expect(() => buildCutAgentSkillInvocation('video', '  ')).toThrow(
      'invalid-cut-agent-intent: intent must not be empty',
    );
  });
});
