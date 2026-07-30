import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTabRenderRuntime } from '../tab-render-runtime';
import { useTabRenderStore } from '../useTabRenderStore';

describe('useTabRenderStore', () => {
  it('subscribes to exactly one Tab store and does not observe sibling updates', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });
    const { result } = renderHook(() => useTabRenderStore(runtimeA.store));

    act(() => runtimeB.store.updateState({ inputValue: 'draft-b' }));
    expect(result.current.snapshot.state.inputValue).toBe('');

    act(() => result.current.updateState({ inputValue: 'draft-a' }));
    expect(result.current.snapshot.state.inputValue).toBe('draft-a');
    expect(runtimeB.store.getSnapshot().state.inputValue).toBe('draft-b');
  });
});
