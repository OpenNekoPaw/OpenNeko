import { describe, expect, it } from 'vitest';
import {
  createDshComposerPresentationSnapshotStore,
  createDshComposerSessionPresentationSnapshotStore,
} from './presentation-snapshot';

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

  it('restores an exact Conversation selection when the page snapshot store is recreated', () => {
    let serialized: string | null = null;
    const storage = {
      getItem: () => serialized,
      setItem: (_key: string, value: string) => {
        serialized = value;
      },
    };
    const scope = {
      agentSurfaceId: 'surface-before-page-reopen',
      conversationId: 'conversation-1',
      workspaceId: 'workspace-1',
    };
    createDshComposerSessionPresentationSnapshotStore(storage).select(
      scope,
      'neko/boards/story.nkc',
    );

    const reopened = createDshComposerSessionPresentationSnapshotStore(storage);

    expect(
      reopened.read({
        ...scope,
        agentSurfaceId: 'surface-after-page-reopen',
      }),
    ).toBe('neko/boards/story.nkc');
    expect(reopened.read({ ...scope, conversationId: 'conversation-sibling' })).toBeUndefined();
  });

  it('discards one invalid persisted entry with a diagnostic while retaining its sibling', () => {
    const diagnostics: string[] = [];
    const validScopeKey = JSON.stringify(['conversation', 'conversation-valid', 'workspace-1']);
    const store = createDshComposerPresentationSnapshotStore({
      persistence: {
        read: () => ({
          [validScopeKey]: 'neko/boards/valid.nkc',
          'not-a-scope': 'neko/boards/invalid.nkc',
        }),
        write: () => undefined,
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });

    expect(
      store.read({
        agentSurfaceId: 'surface-valid',
        conversationId: 'conversation-valid',
        workspaceId: 'workspace-1',
      }),
    ).toBe('neko/boards/valid.nkc');
    expect(diagnostics).toEqual(['invalid-entry']);
  });
});
