import { describe, expect, it } from 'vitest';
import { createConversationStore } from '../conversation-store';

describe('conversation TODO projection', () => {
  it('derives display-only TODO state when an assistant message completes', () => {
    const store = createConversationStore();
    store.getState().startAssistantMessage();
    store
      .getState()
      .completeMessage('## TODO 状态\n\n- [x] validate generated output\n- [ ] deliver');

    expect(store.getState().messages.at(-1)?.todos).toEqual([
      { content: 'validate generated output', status: 'completed' },
      { content: 'deliver', status: 'pending' },
    ]);
  });
});
