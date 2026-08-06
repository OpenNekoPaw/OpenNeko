import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabRenderRuntimeRegistry } from '../tab-render-runtime';
import {
  createTabRenderRealmStateCoordinator,
  parseTabRenderRealmState,
  type TabRenderDraftSnapshot,
  type TabRenderRealmStateHost,
} from '../tab-render-realm-state';

afterEach(() => vi.useRealTimers());

describe('Tab render realm state', () => {
  it('restores drafts by complete Tab binding and coalesces subsequent writes', () => {
    vi.useFakeTimers();
    const host = createHost({
      drafts: [draft('tab-a', 'conv-a', 'draft-a'), draft('tab-b', 'conv-b', 'draft-b')],
    });
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const coordinator = createTabRenderRealmStateCoordinator(host.adapter, registry);

    coordinator.reconcile([
      { tabId: 'tab-a', conversationId: 'conv-a' },
      { tabId: 'tab-b', conversationId: 'conv-b' },
    ]);

    expect(registry.require('tab-a').store.getSnapshot().state.inputValue).toBe('draft-a');
    expect(registry.require('tab-b').store.getSnapshot().state.inputValue).toBe('draft-b');
    expect(host.setState).not.toHaveBeenCalled();

    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-b',
    );
    expect(host.setState).not.toHaveBeenCalled();

    registry.require('tab-a').store.updateState({ inputValue: 'draft-a-1' });
    registry.require('tab-a').store.updateState({ inputValue: 'draft-a-2' });
    expect(host.setState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(host.setState).toHaveBeenCalledTimes(1);
    expect(host.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        drafts: expect.arrayContaining([
          expect.objectContaining({
            tabId: 'tab-a',
            conversationId: 'conv-a',
            inputValue: 'draft-a-2',
          }),
          expect.objectContaining({
            tabId: 'tab-b',
            conversationId: 'conv-b',
            inputValue: 'draft-b',
          }),
        ]),
      }),
    );

    coordinator.dispose();
    registry.dispose();
  });

  it('rejects only a persisted draft owned by another conversation', () => {
    const host = createHost({
      drafts: [draft('tab-a', 'conv-stale', 'stale'), draft('tab-b', 'conv-b', 'valid')],
    });
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const coordinator = createTabRenderRealmStateCoordinator(host.adapter, registry);

    expect(() =>
      coordinator.reconcile([
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ]),
    ).not.toThrow();
    expect(registry.require('tab-a').store.getSnapshot().state.inputValue).toBe('');
    expect(registry.require('tab-b').store.getSnapshot().state.inputValue).toBe('valid');
    expect(coordinator.getDiagnostics()).toEqual([
      expect.objectContaining({ code: 'draft-owner-mismatch', tabId: 'tab-a' }),
    ]);

    coordinator.dispose();
    registry.dispose();
  });

  it('removes only a closed Tab draft and flushes pending state during disposal', () => {
    vi.useFakeTimers();
    const host = createHost({
      drafts: [draft('tab-a', 'conv-a', 'draft-a'), draft('tab-b', 'conv-b', 'draft-b')],
    });
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const coordinator = createTabRenderRealmStateCoordinator(host.adapter, registry);
    coordinator.reconcile([
      { tabId: 'tab-a', conversationId: 'conv-a' },
      { tabId: 'tab-b', conversationId: 'conv-b' },
    ]);

    registry.reconcile([{ tabId: 'tab-b', conversationId: 'conv-b' }], 'tab-b');
    coordinator.reconcile([{ tabId: 'tab-b', conversationId: 'conv-b' }]);
    coordinator.dispose();

    expect(host.setState).toHaveBeenCalledTimes(1);
    expect(host.setState).toHaveBeenCalledWith({
      drafts: [expect.objectContaining({ tabId: 'tab-b', conversationId: 'conv-b' })],
    });
    registry.dispose();
  });

  it('rejects one malformed draft while restoring valid siblings', () => {
    const parsed = parseTabRenderRealmState({
      drafts: [
        { ...draft('tab-a', 'conv-a', 'draft'), generationCategory: 'document' },
        draft('tab-b', 'conv-b', 'valid'),
      ],
    });

    expect(parsed.state).toEqual({ drafts: [draft('tab-b', 'conv-b', 'valid')] });
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-draft',
        draftIndex: 0,
        tabId: 'tab-a',
        message: expect.stringContaining('generationCategory has an unsupported value'),
      }),
    ]);
  });

  it('leaves an unrelated historical state untouched and reports a realm-local diagnostic', () => {
    const persistedState = { unrelatedState: [{ marker: 'opaque' }] };
    const host = createHost(persistedState);
    const registry = createTabRenderRuntimeRegistry();

    const coordinator = createTabRenderRealmStateCoordinator(host.adapter, registry);

    expect(host.setState).not.toHaveBeenCalled();
    expect(host.reportStateDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'invalid-realm-state' }),
    );
    expect(coordinator.getDiagnostics()).toHaveLength(1);
    coordinator.dispose();
    registry.dispose();
  });

  it('keeps the surface available for invalid top-level state', () => {
    expect(parseTabRenderRealmState({ openTabs: [] })).toEqual({
      state: { drafts: [] },
      diagnostics: [
        {
          code: 'invalid-realm-state',
          message: 'Agent Tab render realm state drafts must be an array.',
        },
      ],
    });
  });
});

function createHost(state: unknown): {
  readonly adapter: TabRenderRealmStateHost;
  readonly setState: ReturnType<typeof vi.fn>;
  readonly reportStateDiagnostic: ReturnType<typeof vi.fn>;
} {
  const setState = vi.fn();
  const reportStateDiagnostic = vi.fn();
  return {
    setState,
    reportStateDiagnostic,
    adapter: {
      getState: () => state,
      setState,
      reportStateDiagnostic,
    },
  };
}

function draft(tabId: string, conversationId: string, inputValue: string): TabRenderDraftSnapshot {
  return {
    tabId,
    conversationId,
    inputValue,
    selectedModel: 'provider:model',
    mediaModelSelection: { image: 'none', video: 'none', audio: 'none' },
    mediaUnderstandingSelection: { image: 'auto', video: 'auto', audio: 'auto' },
    sessionMode: 'agent',
    executionMode: 'ask',
    generationCategory: 'image',
    generationParams: {
      ratio: '16:9',
      resolution: '1080p',
      videoDuration: 'auto',
      videoFps: 24,
      audioDuration: 'auto',
      audioType: 'sfx',
    },
  };
}
