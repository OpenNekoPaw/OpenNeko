import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { describe, expect, it } from 'vitest';
import type {
  CharacterDialogueSessionProjection,
  ExtensionToWebviewMessage,
  OpenTab,
} from '@neko-agent/types';
import type { Message } from '@neko-agent/types';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import { ConversationRenderCoordinator } from '@/render-lifecycle/conversation-render-coordinator';
import { characterDialogueSessionHandlers } from '../character-dialogue-session-handlers';
import type { HandlerRegistration, MessageHandlerContext, StreamingState } from '../types';

describe('Character Dialogue session handlers', () => {
  it('opens Character Dialogue tabs without rebinding the shared foreground projection', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });
    const session = createCharacterDialogueSessionProjection();
    const tab: OpenTab = {
      id: 'tab-npc',
      title: 'Character Dialogue: 小橘',
      conversationId: session.sessionId,
      kind: 'character-dialogue',
      characterDialogueSession: session,
    };

    dispatch(
      characterDialogueSessionHandlers,
      { type: 'characterDialogueSessionStarted', tab, session },
      harness.context,
    );

    expect(harness.activeConversationId()).toBe('conv-a');
    expect(harness.context.activeConversationIdRef.current).toBe('conv-a');
    expect(harness.messages()).toEqual([
      { id: 'old', role: 'assistant', content: 'old', timestamp: 1 },
    ]);
    expect(harness.streaming()).toEqual({
      isThinking: true,
      streamingMessageId: 'old-stream',
      queuedMessageCount: 0,
    });
    expect(harness.context.conversationMessagesRef.current.has('conv-a')).toBe(false);
    expect(harness.context.conversationStreamingRef.current.has('conv-a')).toBe(false);
    expect(harness.openTabs()).toEqual([tab]);
    expect(harness.activeTabId()).toBe('tab-npc');
    expect(harness.reconciliations()).toEqual([
      { bindings: [{ tabId: 'tab-npc', conversationId: 'npc-session-1' }], activeTabId: 'tab-npc' },
    ]);
  });

  it('marks exited Character Dialogue tabs without removing transcript cache', () => {
    const session = createCharacterDialogueSessionProjection();
    const harness = createContextHarness({
      activeConversationId: session.sessionId,
      openTabs: [
        {
          id: 'tab-npc',
          title: 'Character Dialogue: 小橘',
          conversationId: session.sessionId,
          kind: 'character-dialogue',
          characterDialogueSession: session,
        },
      ],
    });

    dispatch(
      characterDialogueSessionHandlers,
      { type: 'characterDialogueSessionExited', sessionId: session.sessionId },
      harness.context,
    );

    expect(harness.openTabs()[0]?.characterDialogueSession?.status).toBe('exited');
  });
});

function dispatch(
  handlers: readonly HandlerRegistration[],
  message: ExtensionToWebviewMessage,
  context: MessageHandlerContext,
): void {
  const registration = handlers.find((handler) => handler.type === message.type);
  expect(registration).toBeDefined();
  registration?.handler(message, context);
}

function createCharacterDialogueSessionProjection(): CharacterDialogueSessionProjection {
  return {
    sessionId: 'npc-session-1',
    entityId: 'char-xiaoju',
    displayName: '小橘',
    mode: 'roleplay',
    profile: {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      displayName: '小橘',
      aliases: ['Xiaoju'],
      facts: [
        {
          key: 'identity.name',
          value: '小橘',
          source: 'registry',
          authority: 'confirmed',
        },
      ],
      sparsity: 'thin',
    },
    summary: 'protagonist',
    startedAt: '2026-06-01T00:00:00.000Z',
    projectRoot: '/workspace/project-a',
    status: 'active',
  };
}

interface ContextHarnessOptions {
  activeConversationId: string;
  openTabs?: OpenTab[];
}

interface ContextHarness {
  context: MessageHandlerContext;
  activeConversationId(): string | null;
  activeTabId(): string | null;
  messages(): Message[];
  openTabs(): OpenTab[];
  streaming(): StreamingState;
  reconciliations(): readonly TabRuntimeReconciliation[];
}

interface TabRuntimeReconciliation {
  readonly bindings: readonly { readonly tabId: string; readonly conversationId: string }[];
  readonly activeTabId: string | null;
}

function createContextHarness(options: ContextHarnessOptions): ContextHarness {
  let activeConversationId: string | null = options.activeConversationId;
  let activeTabId: string | null = options.openTabs?.[0]?.id ?? null;
  const messages: Message[] = [{ id: 'old', role: 'assistant', content: 'old', timestamp: 1 }];
  let openTabs: OpenTab[] = options.openTabs ?? [];
  const streaming: StreamingState = {
    isThinking: true,
    streamingMessageId: 'old-stream',
    queuedMessageCount: 0,
  };
  const activeConversationIdRef = ref<string | null>(options.activeConversationId);
  const streamingMessageIdRef = ref<string | null>(streaming.streamingMessageId);
  const isTablessConversationViewRef = ref(false);
  const conversationMessagesRef = ref(new Map<string, Message[]>());
  const conversationStreamingRef = ref(new Map<string, StreamingState>());
  const conversationRenderCoordinator = new ConversationRenderCoordinator();
  let workItems: AgentWorkItemStore = new Map();
  let pluginsAvailable: PluginsAvailable = {};
  const reconciliations: TabRuntimeReconciliation[] = [];

  const context = {
    messages,
    isThinking: streaming.isThinking,
    queuedMessageCount: streaming.queuedMessageCount,
    streamingMessageId: streaming.streamingMessageId,
    streamingMessageIdRef,
    activeConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    conversationRenderCoordinator,
    openTabs,
    activeTabId,
    isTablessConversationViewRef,
    setOpenTabs: createSetter(
      () => openTabs,
      (next) => {
        openTabs = next;
        context.openTabs = next;
      },
    ),
    setActiveTabId: createSetter(
      () => activeTabId,
      (next) => {
        activeTabId = next;
      },
    ),
    setActiveTab: noopDispatch(),
    setSettings: noopDispatch(),
    hydrateConversationSettings: () => undefined,
    updateSettings: () => undefined,
    setAgentState: noopDispatch(),
    conversationAgentStateRef: ref(new Map()),
    forceAgentStateUpdate: () => undefined,
    setSkills: noopDispatch(),
    setActivationProgressByConversation: noopDispatch(),
    setGlobalError: noopDispatch(),
    reportConversationDiagnostic: () => undefined,
    conversationTokenCountRef: ref(new Map()),
    conversationCompressingRef: ref(new Map()),
    forceUpdate: () => undefined,
    reconcileTabRenderRuntimes: (bindings, nextActiveTabId) => {
      reconciliations.push({ bindings, activeTabId: nextActiveTabId });
    },
    isCurrentConversation: (conversationId?: string) =>
      conversationId === activeConversationIdRef.current,
    updateConversationRenderState: () => undefined,
    setConversations: noopDispatch(),
    setActiveConversationId: createSetter(
      () => activeConversationId,
      (next) => {
        activeConversationId = next;
      },
    ),
    setWorkItemsByConversation: createSetter(
      () => workItems,
      (next) => {
        workItems = next;
      },
    ),
    setProjectFiles: noopDispatch(),
    mentionSearchFilter: '',
    setMentionItems: noopDispatch(),
    setPluginCommands: noopDispatch(),
    setPluginsAvailable: createSetter(
      () => pluginsAvailable,
      (next) => {
        pluginsAvailable = next;
      },
    ),
    setShowOnboarding: noopDispatch(),
  } satisfies MessageHandlerContext;

  return {
    context,
    activeConversationId: () => activeConversationId,
    activeTabId: () => activeTabId,
    messages: () => messages,
    openTabs: () => openTabs,
    streaming: () => streaming,
    reconciliations: () => reconciliations,
  };
}

function createSetter<T>(read: () => T, write: (next: T) => void): Dispatch<SetStateAction<T>> {
  return (action) => {
    write(typeof action === 'function' ? (action as (previous: T) => T)(read()) : action);
  };
}

function noopDispatch<T>(): Dispatch<SetStateAction<T>> {
  return () => undefined;
}

function ref<T>(current: T): MutableRefObject<T> {
  return { current };
}
