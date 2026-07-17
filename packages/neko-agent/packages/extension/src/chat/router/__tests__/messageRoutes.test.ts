import { describe, expect, it, vi } from 'vitest';

import { tryHandleMessageRoute } from '../messageRoutes';

vi.mock('vscode', () => ({ env: { language: 'en' } }));

describe('message routes', () => {
  it('handles an Agent turn rejection at the Webview Host boundary', async () => {
    const error = new Error('turn projection failed');
    const postMessage = vi.fn(async () => true);
    const handleUserMessage = vi.fn(async () => {
      throw error;
    });

    expect(
      tryHandleMessageRoute(
        {
          type: 'sendMessage',
          conversationId: 'conversation-1',
          message: 'hello',
          sessionMode: 'agent',
        },
        {
          webview: { postMessage },
          messages: { handleUserMessage },
        } as never,
      ),
    ).toBe(true);

    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'globalError', message: 'turn projection failed' }),
      ),
    );
  });
});
