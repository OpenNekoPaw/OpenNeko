import { describe, expect, it, vi } from 'vitest';

import { SkillHandler } from '../skillHandler';

describe('SkillHandler', () => {
  it('projects the Pi Skill catalog without activation state', async () => {
    const postMessage = vi.fn(async () => true);
    const handler = new SkillHandler({
      listSkills: async () => [
        {
          name: 'storyboard',
          description: 'Build a storyboard.',
          source: { kind: 'project' },
          trusted: true,
          enabled: true,
          fingerprint: 'fp-1',
          locator: { kind: 'skill', value: '/__neko_skills/fp-1/SKILL.md', fingerprint: 'fp-1' },
        },
      ],
    });

    await handler.sendSkillsList({ postMessage } as never);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'skillsList',
      skills: [
        expect.objectContaining({
          name: 'storyboard',
          source: 'project',
          enabled: true,
        }),
      ],
    });
  });

  it('submits an explicit Pi Skill turn', async () => {
    const invoke = vi.fn(async () => undefined);
    const handler = new SkillHandler({ invoke });
    const webview = { postMessage: vi.fn() } as never;

    await handler.handleSkillInvocation(webview, 'storyboard', 'conv-1', 'focus on pacing');

    expect(invoke).toHaveBeenCalledWith(webview, {
      conversationId: 'conv-1',
      messageText: '$storyboard focus on pacing',
      sessionMode: 'agent',
    });
  });
});
