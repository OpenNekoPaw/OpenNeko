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

  it.each(['image.understand', 'video.understand', 'audio.understand'])(
    'rejects retired perception purpose %s',
    (purpose) => {
      expect(() =>
        parseAgentFlatPurposeModelRefs({
          [purpose]: {
            providerId: 'chat-provider',
            modelId: 'multimodal-model',
            category: 'llm',
          },
        }),
      ).toThrow(`Unknown Agent model purpose '${purpose}'.`);
    },
  );
});
