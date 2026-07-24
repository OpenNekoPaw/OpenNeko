import { describe, expect, it } from 'vitest';

import { rejectLegacyActiveContentMessage } from '../useMessageHandler';

describe('legacy active-content protocol rejection', () => {
  it.each([
    'streamText',
    'streamThinking',
    'streamComplete',
    'toolCall',
    'toolResult',
    'toolConfirmation',
  ] as const)('rejects %s instead of mutating a parallel Message authority', (type) => {
    expect(() =>
      rejectLegacyActiveContentMessage({
        type,
        conversationId: 'conversation-a',
      }),
    ).toThrow(new RegExp(`Legacy active-content message ${type} is forbidden`));
  });
});
