import { describe, expect, it } from 'vitest';
import {
  createDshComposerPresentationSnapshotStore,
  createDshComposerSessionPresentationSnapshotStore,
} from './presentation-snapshot';

describe('DSH composer presentation snapshot store', () => {
  it('isolates Canvas selection by exact Draft and Workspace', () => {
    const store = createDshComposerPresentationSnapshotStore();
    const first = {
      agentSurfaceId: 'surface-1',
      workspaceId: 'workspace-1',
    };
    store.select(first, 'neko/boards/story.nkc');

    expect(store.read(first)).toBe('neko/boards/story.nkc');
    expect(store.read({ ...first, agentSurfaceId: 'surface-2' })).toBeUndefined();
    expect(store.read({ ...first, workspaceId: 'workspace-2' })).toBeUndefined();
  });

  it('restores an exact Draft selection when the page snapshot store is recreated', () => {
    let serialized: string | null = null;
    const storage = {
      getItem: () => serialized,
      setItem: (_key: string, value: string) => {
        serialized = value;
      },
    };
    const scope = {
      agentSurfaceId: 'surface-before-page-reopen',
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
      }),
    ).toBe('neko/boards/story.nkc');
    expect(reopened.read({ ...scope, agentSurfaceId: 'surface-sibling' })).toBeUndefined();
  });

  it('discards one invalid persisted entry with a diagnostic while retaining its sibling', () => {
    const diagnostics: string[] = [];
    const validScopeKey = JSON.stringify(['draft', 'surface-valid', 'workspace-1']);
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
        workspaceId: 'workspace-1',
      }),
    ).toBe('neko/boards/valid.nkc');
    expect(diagnostics).toEqual(['invalid-entry']);
  });
});
