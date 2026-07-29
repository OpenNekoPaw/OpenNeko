import { describe, expect, it, vi } from 'vitest';

import { submitVSCodeAgentTurn } from '../conversationControllerEffects';

vi.mock('vscode', () => ({ env: { language: 'en' } }));

describe('VS Code conversation controller effects', () => {
  it('handles an Agent turn rejection at the Webview Host boundary', async () => {
    const error = new Error('turn projection failed');
    const postMessage = vi.fn(async () => true);
    const handleUserMessage = vi.fn(async () => {
      throw error;
    });

    submitVSCodeAgentTurn(
      {
        webview: { postMessage },
        messages: { handleUserMessage },
      } as never,
      {
        source: 'user-message',
        conversationId: 'conversation-1',
        messageText: 'hello',
        sessionMode: 'agent',
      },
    );

    expect(handleUserMessage).toHaveBeenCalledWith(expect.anything(), {
      conversationId: 'conversation-1',
      messageText: 'hello',
      sessionMode: 'agent',
      locale: 'en',
    });
    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'globalError', message: 'turn projection failed' }),
      ),
    );
  });
});
