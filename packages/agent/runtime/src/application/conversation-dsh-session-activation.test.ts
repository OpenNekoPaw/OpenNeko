import { describe, expect, it, vi } from 'vitest';

import type { ConversationDshSessionBindingService } from './conversation-dsh-session-binding';
import { createConversationDshSessionActivation } from './conversation-dsh-session-activation';

const conversationId = 'conversation:one';
const dshSessionId = 'dsh-session:one';

describe('Conversation DSH Session activation', () => {
  it('coalesces concurrent load for one exact binding', async () => {
    const loadSession = vi.fn(async () => ({}));
    const activation = createConversationDshSessionActivation({
      binding: bindingFor(dshSessionId),
      client: { loadSession },
    });

    await expect(
      Promise.all([
        activation.ensureLoaded(conversationId),
        activation.ensureLoaded(conversationId),
      ]),
    ).resolves.toEqual([dshSessionId, dshSessionId]);
    expect(loadSession).toHaveBeenCalledOnce();
    expect(loadSession).toHaveBeenCalledWith({ sessionId: dshSessionId, mcpServers: [] });
  });

  it('does not reload a marked Session until the DSH runtime state is reset', async () => {
    const loadSession = vi.fn(async () => ({}));
    const activation = createConversationDshSessionActivation({
      binding: bindingFor(dshSessionId),
      client: { loadSession },
    });
    activation.markLoaded(dshSessionId);

    await activation.ensureLoaded(conversationId);
    expect(loadSession).not.toHaveBeenCalled();

    activation.reset();
    await activation.ensureLoaded(conversationId);
    expect(loadSession).toHaveBeenCalledOnce();
  });

  it('keeps a failed load retryable without selecting a sibling Session', async () => {
    const loadSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('session/load failed'))
      .mockResolvedValueOnce({});
    const activation = createConversationDshSessionActivation({
      binding: bindingFor(dshSessionId),
      client: { loadSession },
    });

    await expect(activation.ensureLoaded(conversationId)).rejects.toThrow('session/load failed');
    await expect(activation.ensureLoaded(conversationId)).resolves.toBe(dshSessionId);
    expect(loadSession).toHaveBeenCalledTimes(2);
    expect(loadSession).toHaveBeenLastCalledWith({ sessionId: dshSessionId, mcpServers: [] });
  });

  it('fails before transport when the exact binding is unavailable', async () => {
    const loadSession = vi.fn();
    const activation = createConversationDshSessionActivation({
      binding: {
        ...bindingFor(dshSessionId),
        async resolve(requestedConversationId) {
          return {
            ok: false as const,
            code: 'CONVERSATION_BINDING_MISSING' as const,
            conversationId: requestedConversationId,
            message: 'Exact binding is missing.',
          };
        },
      },
      client: { loadSession },
    });

    await expect(activation.ensureLoaded(conversationId)).rejects.toThrow(
      /CONVERSATION_BINDING_MISSING/u,
    );
    expect(loadSession).not.toHaveBeenCalled();
  });
});

function bindingFor(sessionId: string): ConversationDshSessionBindingService {
  return {
    bind: vi.fn(),
    unbind: vi.fn(),
    async resolve(requestedConversationId) {
      return {
        ok: true,
        binding: { conversationId: requestedConversationId, dshSessionId: sessionId },
      };
    },
  };
}
