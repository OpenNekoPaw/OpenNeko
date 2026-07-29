import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabRenderRuntimeRegistry } from '../tab-render-runtime';
import {
  createTabRenderRealmStateCoordinator,
  parseTabRenderRealmState,
  TAB_RENDER_REALM_STATE_VERSION,
  type TabRenderDraftSnapshot,
  type TabRenderRealmState,
  type TabRenderRealmStateHost,
} from '../tab-render-realm-state';

afterEach(() => vi.useRealTimers());

describe('Tab render realm state', () => {
  it('restores drafts by complete Tab binding and coalesces subsequent writes', () => {
    vi.useFakeTimers();
    const host = createHost({
      schemaVersion: TAB_RENDER_REALM_STATE_VERSION,
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
    registry.require('tab-a').store.updateState((state) => ({
      llmConfig: { ...state.llmConfig, creativityPreset: 'wild' },
    }));
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
            llmConfig: expect.objectContaining({ creativityPreset: 'wild' }),
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

  it('rejects a persisted draft owned by another conversation', () => {
    const host = createHost({
      schemaVersion: TAB_RENDER_REALM_STATE_VERSION,
      drafts: [draft('tab-a', 'conv-stale', 'stale')],
    });
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile([{ tabId: 'tab-a', conversationId: 'conv-a' }], 'tab-a');
    const coordinator = createTabRenderRealmStateCoordinator(host.adapter, registry);

    expect(() => coordinator.reconcile([{ tabId: 'tab-a', conversationId: 'conv-a' }])).toThrow(
      'belongs to conv-stale, not conv-a',
    );

    coordinator.dispose();
    registry.dispose();
  });

  it('removes only a closed Tab draft and flushes pending state during disposal', () => {
    vi.useFakeTimers();
    const host = createHost({
      schemaVersion: TAB_RENDER_REALM_STATE_VERSION,
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
      schemaVersion: TAB_RENDER_REALM_STATE_VERSION,
      drafts: [expect.objectContaining({ tabId: 'tab-b', conversationId: 'conv-b' })],
    });
    registry.dispose();
  });

  it('fails visibly for unknown schemas and malformed draft fields', () => {
    expect(() => parseTabRenderRealmState({ schemaVersion: 'unknown', drafts: [] })).toThrow(
      'Unsupported Agent Tab render realm state schema',
    );
    expect(() =>
      parseTabRenderRealmState({
        schemaVersion: TAB_RENDER_REALM_STATE_VERSION,
        drafts: [{ ...draft('tab-a', 'conv-a', 'draft'), generationCategory: 'document' }],
      }),
    ).toThrow('generationCategory has an unsupported value');
  });

  it('migrates the retired timeline recovery projection to the canonical v1 state', () => {
    const host = createHost({
      agentTurnTimelineRecoveries: [
        {
          connectionEpoch: 'epoch-1',
          conversationId: 'conv-a',
          turnId: 'turn-a',
          messageId: 'message-a',
          lastAppliedDeliveryRevision: 1,
        },
      ],
    } as never);
    const registry = createTabRenderRuntimeRegistry();

    const coordinator = createTabRenderRealmStateCoordinator(host.adapter, registry);

    expect(host.setState).toHaveBeenCalledWith({
      schemaVersion: TAB_RENDER_REALM_STATE_VERSION,
      drafts: [],
    });
    coordinator.dispose();
    registry.dispose();
  });

  it('does not treat arbitrary schema-less state as a legacy migration', () => {
    expect(() => parseTabRenderRealmState({ openTabs: [] })).toThrow(
      'Unsupported Agent Tab render realm state schema',
    );
    expect(() =>
      parseTabRenderRealmState({
        agentTurnTimelineRecoveries: [
          {
            connectionEpoch: 'epoch-1',
            conversationId: 'conv-a',
            turnId: 'turn-a',
            messageId: 'message-a',
            lastAppliedDeliveryRevision: 0,
          },
        ],
      }),
    ).toThrow('Unsupported Agent Tab render realm state schema');
  });
});

function createHost(state: TabRenderRealmState | undefined): {
  readonly adapter: TabRenderRealmStateHost;
  readonly setState: ReturnType<typeof vi.fn>;
} {
  const setState = vi.fn();
  return {
    setState,
    adapter: {
      getState: () => state,
      setState,
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
    llmConfig: {
      reasoningPreset: 'balanced',
      verbosityPreset: 'standard',
      creativityPreset: 'creative',
    },
  };
}
