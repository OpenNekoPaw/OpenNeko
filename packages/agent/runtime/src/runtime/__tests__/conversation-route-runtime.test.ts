import { describe, expect, it } from 'vitest';
import { resolveRequiredConversationRoute } from '../conversation-route-runtime';

describe('conversation route runtime', () => {
  it('resolves explicit conversation ids', () => {
    expect(
      resolveRequiredConversationRoute({
        message: { conversationId: 'conv-1' },
        action: 'cancel message',
      }),
    ).toEqual({
      status: 'resolved',
      conversationId: 'conv-1',
    });
  });

  it('builds a scoped error when conversation id is missing', () => {
    expect(
      resolveRequiredConversationRoute({
        message: {},
        action: 'cancel message',
      }),
    ).toEqual({
      status: 'missing',
      message: {
        type: 'globalError',
        message: 'Cannot cancel message without an explicit conversationId.',
      },
    });
  });
});
