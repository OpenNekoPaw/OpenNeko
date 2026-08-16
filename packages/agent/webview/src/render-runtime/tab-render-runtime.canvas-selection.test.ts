import { describe, expect, it } from 'vitest';
import { createTabRenderRuntime } from './tab-render-runtime';

describe('TabRenderStore workspace canvas selection', () => {
  it('isolates workspaceCanvasSelectionId per conversation store', () => {
    const first = createTabRenderRuntime({ tabId: 'tab-1', conversationId: 'conv-1' });
    const second = createTabRenderRuntime({ tabId: 'tab-2', conversationId: 'conv-2' });

    first.store.updateState({ workspaceCanvasSelectionId: 'neko/boards/a.nkc' });
    expect(first.store.getSnapshot().state.workspaceCanvasSelectionId).toBe('neko/boards/a.nkc');
    expect(second.store.getSnapshot().state.workspaceCanvasSelectionId).toBe('workspace-board');

    second.store.updateState({ workspaceCanvasSelectionId: 'neko/boards/b.nkc' });
    expect(second.store.getSnapshot().state.workspaceCanvasSelectionId).toBe('neko/boards/b.nkc');
    expect(first.store.getSnapshot().state.workspaceCanvasSelectionId).toBe('neko/boards/a.nkc');

    first.dispose();
    second.dispose();
  });
});
