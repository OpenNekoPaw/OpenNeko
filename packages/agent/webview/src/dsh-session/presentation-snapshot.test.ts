import { describe, expect, it } from 'vitest';
import { createDshComposerPresentationSnapshotStore } from './presentation-snapshot';

describe('DSH composer presentation snapshot store', () => {
  it('isolates Canvas selection by exact Conversation and Workspace', () => {
    const store = createDshComposerPresentationSnapshotStore();
    const first = {
      agentSurfaceId: 'surface-1',
      conversationId: 'conversation-1',
      workspaceId: 'workspace-1',
    };
    store.select(first, 'neko/boards/story.nkc');

    expect(store.read(first)).toBe('neko/boards/story.nkc');
    expect(store.read({ ...first, conversationId: 'conversation-2' })).toBeUndefined();
    expect(store.read({ ...first, workspaceId: 'workspace-2' })).toBeUndefined();
  });

  it('transfers one mounted draft selection without overwriting Conversation state', () => {
    const store = createDshComposerPresentationSnapshotStore();
    const draft = { agentSurfaceId: 'surface-1', workspaceId: 'workspace-1' };
    const conversation = {
      ...draft,
      conversationId: 'conversation-1',
    };
    store.select(draft, 'neko/boards/draft.nkc');
    store.transferIfAbsent(draft, conversation);
    expect(store.read(conversation)).toBe('neko/boards/draft.nkc');

    store.select(conversation, 'neko/boards/conversation.nkc');
    store.select(draft, 'neko/boards/later-draft.nkc');
    store.transferIfAbsent(draft, conversation);
    expect(store.read(conversation)).toBe('neko/boards/conversation.nkc');
  });
});
