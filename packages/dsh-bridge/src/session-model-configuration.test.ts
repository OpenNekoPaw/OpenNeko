import { describe, expect, it } from 'vitest';

import { SessionModelConfigurationOwner } from './session-model-configuration';

const deepseek = {
  provider: 'deepseek-official',
  model: 'deepseek-chat',
  maxTokens: 8_192,
} as const;
const openai = { provider: 'openai', model: 'gpt-5', maxTokens: 16_384 } as const;

describe('SessionModelConfigurationOwner', () => {
  it('applies one message-bound selection to the next assembled request', () => {
    const owner = new SessionModelConfigurationOwner(deepseek);

    owner.apply(openai);
    owner.captureMaxTokens();

    expect(owner.active()).toEqual(openai);
    expect(owner.modelSelection.current).toEqual({ provider: 'openai', model: 'gpt-5' });
    expect(owner.maxTokensForAssembledRequest()).toBe(16_384);
  });

  it('keeps the current selection unchanged until the owner applies another message binding', () => {
    const owner = new SessionModelConfigurationOwner(deepseek);

    expect(owner.active()).toEqual(deepseek);
    expect(owner.modelSelection.current).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-chat',
    });

    owner.apply(openai);
    expect(owner.active()).toEqual(openai);
    expect(owner.modelSelection.current).toEqual({ provider: 'openai', model: 'gpt-5' });
  });

  it('accepts the last exact message binding without retaining a parallel pending path', () => {
    const owner = new SessionModelConfigurationOwner(deepseek);
    const claude = { provider: 'anthropic', model: 'claude-sonnet', maxTokens: 12_000 };

    owner.apply(openai);
    owner.apply(claude);

    expect(owner.active()).toEqual(claude);
    expect(owner.modelSelection.current).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet',
    });
  });
});
