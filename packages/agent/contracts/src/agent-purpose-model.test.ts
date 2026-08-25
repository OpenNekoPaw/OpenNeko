import { describe, expect, it } from 'vitest';

import { parseAgentFlatPurposeModelRefs } from './agent-purpose-model';

describe('Agent purpose model bindings', () => {
  it('accepts exact generation bindings', () => {
    expect(
      parseAgentFlatPurposeModelRefs({
        'image.generate': {
          providerId: 'media-provider',
          modelId: 'image-model',
          category: 'image',
        },
      }),
    ).toEqual({
      'image.generate': {
        providerId: 'media-provider',
        modelId: 'image-model',
        category: 'image',
      },
    });
  });

  it('rejects purposes outside the Agent purpose contract', () => {
    expect(() =>
      parseAgentFlatPurposeModelRefs({
        'media.analysis': {
          providerId: 'chat-provider',
          modelId: 'multimodal-model',
          category: 'llm',
        },
      }),
    ).toThrow("Unknown Agent model purpose 'media.analysis'.");
  });
});
