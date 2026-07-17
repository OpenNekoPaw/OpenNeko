import { describe, expect, it, vi } from 'vitest';
import { createAgentMarkdownSessionKey } from '@/markdown/agent-markdown-session-registry';
import { createTabRenderRuntime, createTabRenderRuntimeRegistry } from '../tab-render-runtime';

describe('TabRenderRuntime', () => {
  it('owns independent composer, configuration, viewport, and diagnostic state', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });
    const diagnostic = {
      type: 'sessionDiagnostic' as const,
      code: 'active-tab-mismatch' as const,
      severity: 'error' as const,
      action: 'session-mutation',
      message: 'A only',
    };

    runtimeA.store.updateState((state) => ({
      inputValue: 'draft-a',
      attachedFiles: [{ id: 'asset-a', name: 'a.png', type: 'image', data: 'data-a' }],
      selectedModel: 'model-a',
      generationParams: { ...state.generationParams, resolution: '4K' },
      llmConfig: { ...state.llmConfig, reasoningPreset: 'deep' },
      composition: { isComposing: true },
      focus: { target: 'input', requestRevision: state.focus.requestRevision + 1 },
      viewport: { followMode: 'detached', anchorMessageId: 'message-a', anchorOffset: 12 },
      menus: { ...state.menus, entryPrompt: 'generate-assets' },
      diagnostics: [diagnostic],
    }));

    expect(runtimeA.store.getSnapshot().state).toMatchObject({
      inputValue: 'draft-a',
      selectedModel: 'model-a',
      generationParams: { resolution: '4K' },
      llmConfig: { reasoningPreset: 'deep' },
      composition: { isComposing: true },
      focus: { target: 'input', requestRevision: 1 },
      viewport: { followMode: 'detached', anchorMessageId: 'message-a', anchorOffset: 12 },
      menus: { entryPrompt: 'generate-assets' },
    });
    expect(runtimeB.store.getSnapshot().state).toMatchObject({
      inputValue: '',
      attachedFiles: [],
      selectedModel: '',
      composition: { isComposing: false },
      focus: { target: 'none', requestRevision: 0 },
      viewport: { followMode: 'follow-tail' },
      llmConfig: {
        reasoningPreset: 'balanced',
        verbosityPreset: 'standard',
        creativityPreset: 'creative',
      },
      menus: {
        entryPrompt: null,
        composer: {
          slash: { open: false, filter: '', selectedIndex: 0 },
          skill: { open: false, filter: '', selectedIndex: 0 },
          mention: { open: false, filter: '', selectedIndex: 0 },
          controls: {
            openMenu: null,
            agentConfigCategory: 'llm',
            understandingCategory: null,
          },
          queueExpanded: false,
        },
      },
      diagnostics: [],
    });
  });

  it('publishes retention changes only when composition or dirty input protection changes', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const listener = vi.fn();
    runtime.store.subscribeRetention(listener);

    expect(runtime.store.getRetentionSnapshot()).toEqual({
      isComposing: false,
      hasDirtyInput: false,
      revision: 0,
    });

    runtime.store.updateState({ selectedModel: 'model-a' });
    runtime.store.updateState({ inputValue: 'draft-a' });
    runtime.store.updateState({ inputValue: 'draft-a-updated' });
    runtime.store.updateState({ composition: { isComposing: true } });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(runtime.store.getRetentionSnapshot()).toEqual({
      isComposing: true,
      hasDirtyInput: true,
      revision: 2,
    });

    runtime.store.updateState({ inputValue: '', composition: { isComposing: false } });
    expect(listener).toHaveBeenCalledTimes(3);
    expect(runtime.store.getRetentionSnapshot()).toEqual({
      isComposing: false,
      hasDirtyInput: false,
      revision: 3,
    });
  });

  it('owns an independent store and explicit lifecycle per Tab binding', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });

    expect(runtimeA.store).not.toBe(runtimeB.store);
    expect(runtimeA.lifecycle).toBe('attaching');
    runtimeA.markReady();
    runtimeA.setVisible(true);

    expect(runtimeA.lifecycle).toBe('ready');
    expect(runtimeA.store.getSnapshot()).toMatchObject({
      tabId: 'tab-a',
      conversationId: 'conv-a',
      visibility: 'visible',
      revision: 1,
    });
    expect(runtimeB.store.getSnapshot()).toMatchObject({
      tabId: 'tab-b',
      conversationId: 'conv-b',
      visibility: 'hidden',
      revision: 0,
    });
  });

  it('publishes attaching lifecycle protection independently from store changes', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const listener = vi.fn();
    runtime.subscribeRetention(listener);

    expect(runtime.getRetentionSnapshot()).toMatchObject({ lifecycle: 'attaching', revision: 0 });
    runtime.markReady();
    runtime.detach();
    runtime.beginAttach();

    expect(listener).toHaveBeenCalledTimes(3);
    expect(runtime.getRetentionSnapshot()).toMatchObject({ lifecycle: 'attaching', revision: 3 });
  });

  it('fails visibly for invalid lifecycle transitions and disposed store mutation', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });

    expect(() => runtime.beginAttach()).toThrow(/cannot begin attaching from attaching/);
    runtime.markReady();
    expect(() => runtime.markReady()).toThrow(/cannot become ready from ready/);
    runtime.detach();
    runtime.beginAttach();
    runtime.markReady();
    runtime.dispose();

    expect(() => runtime.setVisible(true)).toThrow(/is disposed/);
    expect(() => runtime.store.setVisibility('visible')).toThrow(/is disposed/);
  });
});

describe('TabRenderRuntimeRegistry', () => {
  it('reconciles open Tabs by tabId and activation changes visibility only', () => {
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const runtimeA = registry.require('tab-a');
    const runtimeB = registry.require('tab-b');
    const storeA = runtimeA.store;
    const storeB = runtimeB.store;

    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-b',
    );

    expect(registry.require('tab-a')).toBe(runtimeA);
    expect(registry.require('tab-b')).toBe(runtimeB);
    expect(runtimeA.store).toBe(storeA);
    expect(runtimeB.store).toBe(storeB);
    expect(storeA.getSnapshot().visibility).toBe('hidden');
    expect(storeB.getSnapshot().visibility).toBe('visible');
  });

  it('preserves Tab-owned input, attachments, configuration, focus, and scroll during rapid activation churn', () => {
    const registry = createTabRenderRuntimeRegistry();
    const bindings = [
      { tabId: 'tab-a', conversationId: 'conv-a' },
      { tabId: 'tab-b', conversationId: 'conv-b' },
      { tabId: 'tab-c', conversationId: 'conv-c' },
    ] as const;
    registry.reconcile(bindings, 'tab-a');

    const runtimeA = registry.require('tab-a');
    const runtimeB = registry.require('tab-b');
    const runtimeC = registry.require('tab-c');

    runtimeA.store.updateState((state) => ({
      inputValue: 'draft-a',
      attachedFiles: [{ id: 'asset-a', name: 'a.png', type: 'image', data: 'data-a' }],
      selectedModel: 'model-a',
      generationParams: { ...state.generationParams, resolution: '4K' },
      llmConfig: { ...state.llmConfig, reasoningPreset: 'deep' },
      composition: { isComposing: true },
      focus: { target: 'input', requestRevision: 3 },
      viewport: { followMode: 'detached', anchorMessageId: 'message-a', anchorOffset: 12 },
    }));
    runtimeB.store.updateState((state) => ({
      inputValue: 'draft-b',
      attachedFiles: [{ id: 'asset-b', name: 'b.wav', type: 'audio', data: 'data-b' }],
      selectedModel: 'model-b',
      generationParams: { ...state.generationParams, resolution: '1080p' },
      llmConfig: { ...state.llmConfig, verbosityPreset: 'detailed' },
      focus: { target: 'input', requestRevision: 7 },
      viewport: { followMode: 'detached', anchorMessageId: 'message-b', anchorOffset: 24 },
    }));
    runtimeC.store.updateState((state) => ({
      inputValue: 'draft-c',
      selectedModel: 'model-c',
      llmConfig: { ...state.llmConfig, creativityPreset: 'wild' },
      viewport: { followMode: 'follow-tail' },
    }));

    const stateA = runtimeA.store.getSnapshot().state;
    const stateB = runtimeB.store.getSnapshot().state;
    const stateC = runtimeC.store.getSnapshot().state;
    const activationOrder = ['tab-b', 'tab-c', 'tab-a', 'tab-c', 'tab-b', 'tab-a'] as const;

    for (let cycle = 0; cycle < 20; cycle += 1) {
      for (const activeTabId of activationOrder) {
        registry.reconcile(bindings, activeTabId);
      }
    }

    expect(registry.require('tab-a')).toBe(runtimeA);
    expect(registry.require('tab-b')).toBe(runtimeB);
    expect(registry.require('tab-c')).toBe(runtimeC);
    expect(runtimeA.store.getSnapshot().state).toEqual(stateA);
    expect(runtimeB.store.getSnapshot().state).toEqual(stateB);
    expect(runtimeC.store.getSnapshot().state).toEqual(stateC);
    expect(runtimeA.store.getSnapshot().visibility).toBe('visible');
    expect(runtimeB.store.getSnapshot().visibility).toBe('hidden');
    expect(runtimeC.store.getSnapshot().visibility).toBe('hidden');
  });

  it('queries every independent Tab runtime attached to one conversation', () => {
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a-1', conversationId: 'conv-a' },
        { tabId: 'tab-a-2', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a-1',
    );

    expect(registry.getByConversation('conv-a').map((runtime) => runtime.tabId)).toEqual([
      'tab-a-1',
      'tab-a-2',
    ]);
    expect(registry.getByConversation('conv-b').map((runtime) => runtime.tabId)).toEqual(['tab-b']);
    expect(registry.getByConversation('conv-missing')).toEqual([]);
    expect(() => registry.getByConversation('')).toThrow(/Conversation ID is required/);
  });

  it('disposes closed Tabs without touching retained runtimes', () => {
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const runtimeA = registry.require('tab-a');
    const runtimeB = registry.require('tab-b');
    const listenerB = vi.fn();
    runtimeB.store.subscribe(listenerB);

    registry.reconcile([{ tabId: 'tab-b', conversationId: 'conv-b' }], 'tab-b');

    expect(runtimeA.lifecycle).toBe('disposed');
    expect(registry.get('tab-a')).toBeUndefined();
    expect(registry.require('tab-b')).toBe(runtimeB);
    expect(runtimeB.lifecycle).toBe('ready');
    expect(listenerB).toHaveBeenCalledOnce();
  });

  it('rejects duplicate, missing-active, and conversation-rebinding paths', () => {
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile([{ tabId: 'tab-a', conversationId: 'conv-a' }], 'tab-a');

    expect(() =>
      registry.reconcile(
        [
          { tabId: 'tab-a', conversationId: 'conv-a' },
          { tabId: 'tab-a', conversationId: 'conv-a' },
        ],
        'tab-a',
      ),
    ).toThrow(/Duplicate Tab render binding/);
    expect(() =>
      registry.reconcile([{ tabId: 'tab-a', conversationId: 'conv-a' }], 'tab-missing'),
    ).toThrow(/has no open render binding/);
    expect(() =>
      registry.reconcile([{ tabId: 'tab-a', conversationId: 'conv-b' }], 'tab-a'),
    ).toThrow(/cannot rebind/);
  });

  it('owns an independent projection replica and attachment client per Tab runtime', () => {
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conversation-shared' },
        { tabId: 'tab-b', conversationId: 'conversation-shared' },
      ],
      'tab-a',
    );
    const runtimeA = registry.require('tab-a');
    const runtimeB = registry.require('tab-b');
    const messagesA: unknown[] = [];
    const messagesB: unknown[] = [];
    runtimeA.attachProjection({
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-a',
      send: (message) => messagesA.push(message),
      reportError: vi.fn(),
    });
    runtimeB.attachProjection({
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-b',
      send: (message) => messagesB.push(message),
      reportError: vi.fn(),
    });

    runtimeA.acceptProjectionFrame({
      type: 'projectionSnapshot',
      key: {
        endpointEpoch: 'endpoint-1',
        attachmentId: 'attachment-a',
        tabId: 'tab-a',
        conversationId: 'conversation-shared',
      },
      sequence: 0,
      projectionVersion: 0,
      projection: {
        conversationId: 'conversation-shared',
        projectionVersion: 0,
        turns: [
          {
            turnId: 'turn-1',
            messageId: 'message-1',
            items: [projectionTextItem('initial', 1)],
          },
        ],
      },
    });
    runtimeA.acceptProjectionFrame({
      type: 'projectionPatch',
      key: {
        endpointEpoch: 'endpoint-1',
        attachmentId: 'attachment-a',
        tabId: 'tab-a',
        conversationId: 'conversation-shared',
      },
      sequence: 1,
      baseProjectionVersion: 0,
      projectionVersion: 1,
      patch: {
        type: 'conversationProjectionPatch',
        conversationId: 'conversation-shared',
        baseProjectionVersion: 0,
        projectionVersion: 1,
        turnId: 'turn-1',
        messageId: 'message-1',
        operations: [{ operation: 'append', item: projectionTextItem(' update', 2) }],
      },
    });

    const markdownKey = createAgentMarkdownSessionKey({
      conversationId: 'conversation-shared',
      messageId: 'message-1',
      itemId: 'text-1',
    });
    expect(runtimeA.projectionReplica).not.toBe(runtimeB.projectionReplica);
    expect(runtimeA.markdownSessions).not.toBe(runtimeB.markdownSessions);
    expect(runtimeA.projectionReplica.getSnapshot().projection?.projectionVersion).toBe(1);
    expect(runtimeB.projectionReplica.getSnapshot().projection).toBeNull();
    expect(runtimeA.markdownSessions.getSnapshot(markdownKey)?.source).toBe('initial update');
    expect(runtimeB.markdownSessions.getSnapshot(markdownKey)).toBeUndefined();
    expect(messagesA).toHaveLength(2);
    expect(messagesB).toHaveLength(1);
  });

  it('keeps projection and Markdown identities isolated during rapid visibility switching', () => {
    const registry = createTabRenderRuntimeRegistry();
    const bindings = [
      { tabId: 'tab-a', conversationId: 'conversation-shared' },
      { tabId: 'tab-b', conversationId: 'conversation-shared' },
    ] as const;
    registry.reconcile(bindings, 'tab-a');
    const runtimeA = registry.require('tab-a');
    const runtimeB = registry.require('tab-b');
    const replicaA = runtimeA.projectionReplica;
    const replicaB = runtimeB.projectionReplica;
    const markdownA = runtimeA.markdownSessions;
    const markdownB = runtimeB.markdownSessions;
    const keyA = {
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-a',
      tabId: 'tab-a',
      conversationId: 'conversation-shared',
    } as const;
    const keyB = {
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-b',
      tabId: 'tab-b',
      conversationId: 'conversation-shared',
    } as const;
    runtimeA.attachProjection({
      endpointEpoch: keyA.endpointEpoch,
      attachmentId: keyA.attachmentId,
      send: vi.fn(),
      reportError: vi.fn(),
    });
    runtimeB.attachProjection({
      endpointEpoch: keyB.endpointEpoch,
      attachmentId: keyB.attachmentId,
      send: vi.fn(),
      reportError: vi.fn(),
    });
    runtimeA.acceptProjectionFrame({
      type: 'projectionSnapshot',
      key: keyA,
      sequence: 0,
      projectionVersion: 0,
      projection: {
        conversationId: 'conversation-shared',
        projectionVersion: 0,
        turns: [{ turnId: 'turn-1', messageId: 'message-1', items: [projectionTextItem('A0', 1)] }],
      },
    });
    runtimeB.acceptProjectionFrame({
      type: 'projectionSnapshot',
      key: keyB,
      sequence: 0,
      projectionVersion: 0,
      projection: {
        conversationId: 'conversation-shared',
        projectionVersion: 0,
        turns: [{ turnId: 'turn-1', messageId: 'message-1', items: [projectionTextItem('B0', 1)] }],
      },
    });

    for (let revision = 1; revision <= 20; revision += 1) {
      registry.reconcile(bindings, revision % 2 === 0 ? 'tab-b' : 'tab-a');
      for (const [runtime, key, prefix] of [
        [runtimeA, keyA, 'A'],
        [runtimeB, keyB, 'B'],
      ] as const) {
        runtime.acceptProjectionFrame({
          type: 'projectionPatch',
          key,
          sequence: revision,
          baseProjectionVersion: revision - 1,
          projectionVersion: revision,
          patch: {
            type: 'conversationProjectionPatch',
            conversationId: 'conversation-shared',
            baseProjectionVersion: revision - 1,
            projectionVersion: revision,
            turnId: 'turn-1',
            messageId: 'message-1',
            operations: [
              {
                operation: 'append',
                item: projectionTextItem(` ${prefix}${revision}`, revision + 1),
              },
            ],
          },
        });
      }
    }

    const markdownKey = createAgentMarkdownSessionKey({
      conversationId: 'conversation-shared',
      messageId: 'message-1',
      itemId: 'text-1',
    });
    expect(registry.require('tab-a')).toBe(runtimeA);
    expect(registry.require('tab-b')).toBe(runtimeB);
    expect(runtimeA.projectionReplica).toBe(replicaA);
    expect(runtimeB.projectionReplica).toBe(replicaB);
    expect(runtimeA.markdownSessions).toBe(markdownA);
    expect(runtimeB.markdownSessions).toBe(markdownB);
    expect(markdownA.getSnapshot(markdownKey)?.source).toBe(
      `A0${Array.from({ length: 20 }, (_, index) => ` A${index + 1}`).join('')}`,
    );
    expect(markdownB.getSnapshot(markdownKey)?.source).toBe(
      `B0${Array.from({ length: 20 }, (_, index) => ` B${index + 1}`).join('')}`,
    );
    expect(runtimeA.store.getSnapshot().visibility).toBe('hidden');
    expect(runtimeB.store.getSnapshot().visibility).toBe('visible');
  });

  it('does not mutate Tab Markdown when a projection patch fails validation', () => {
    const runtime = createTabRenderRuntime({
      tabId: 'tab-a',
      conversationId: 'conversation-shared',
    });
    const reportError = vi.fn();
    runtime.attachProjection({
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-a',
      send: vi.fn(),
      reportError,
    });
    const key = {
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-a',
      tabId: 'tab-a',
      conversationId: 'conversation-shared',
    } as const;
    runtime.acceptProjectionFrame({
      type: 'projectionSnapshot',
      key,
      sequence: 0,
      projectionVersion: 0,
      projection: {
        conversationId: 'conversation-shared',
        projectionVersion: 0,
        turns: [
          {
            turnId: 'turn-1',
            messageId: 'message-1',
            items: [projectionTextItem('initial', 1)],
          },
        ],
      },
    });
    const markdownKey = createAgentMarkdownSessionKey({
      conversationId: 'conversation-shared',
      messageId: 'message-1',
      itemId: 'text-1',
    });

    expect(() =>
      runtime.acceptProjectionFrame({
        type: 'projectionPatch',
        key,
        sequence: 1,
        baseProjectionVersion: 0,
        projectionVersion: 1,
        patch: {
          type: 'conversationProjectionPatch',
          conversationId: 'conversation-shared',
          baseProjectionVersion: 0,
          projectionVersion: 1,
          turnId: 'turn-1',
          messageId: 'message-1',
          operations: [
            {
              operation: 'append',
              item: {
                ...projectionTextItem('invalid', 2),
                conversationId: 'conversation-other',
              },
            },
          ],
        },
      }),
    ).toThrow(/rejected its live patch/);

    expect(runtime.markdownSessions.getSnapshot(markdownKey)?.source).toBe('initial');
    expect(runtime.projectionReplica.getSnapshot().projection?.projectionVersion).toBe(0);
    expect(runtime.projectionAttachment?.getSnapshot().phase).toBe('fatal');
    expect(reportError).toHaveBeenCalledOnce();
  });

  it('disposes only the closed Tab projection attachment and replica', () => {
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const runtimeA = registry.require('tab-a');
    const runtimeB = registry.require('tab-b');
    const messagesA: unknown[] = [];
    runtimeA.attachProjection({
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-a',
      send: (message) => messagesA.push(message),
      reportError: vi.fn(),
    });

    registry.reconcile([{ tabId: 'tab-b', conversationId: 'conv-b' }], 'tab-b');

    expect(messagesA.at(-1)).toMatchObject({ type: 'projectionDetach', reason: 'tab-closed' });
    expect(() => runtimeA.projectionReplica.subscribe(vi.fn())).toThrow(/disposed/);
    expect(runtimeB.lifecycle).toBe('ready');
    expect(runtimeB.projectionReplica.getSnapshot().projection).toBeNull();
  });
});

function projectionTextItem(content: string, itemRevision: number) {
  return {
    conversationId: 'conversation-shared',
    turnId: 'turn-1',
    messageId: 'message-1',
    itemId: 'text-1',
    sequence: 1,
    itemRevision,
    kind: 'assistant_text' as const,
    status: 'streaming' as const,
    payload: { content, format: 'markdown' as const, sourceGeneration: 1 },
    createdAt: 1,
    updatedAt: itemRevision,
  };
}
