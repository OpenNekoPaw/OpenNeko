import { describe, expect, it, vi } from 'vitest';
import type { ExtensionToWebviewMessage } from '@neko-agent/types';
import type { AgentCapabilityActivationProgressEvent } from '@neko/shared';
import { activationProgressHandlers } from '../activation-progress-handlers';
import type { MessageHandlerContext } from '../types';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';

describe('activationProgressHandlers', () => {
  it('merges activation progress events into per-conversation timelines', () => {
    const context = createContext();
    const event = createActivationEvent('event-1', 'requested', 1);

    dispatch(
      {
        type: 'agentCapabilityActivationProgress',
        conversationId: 'conv-1',
        events: [event],
      },
      context,
    );

    expect(context.setActivationProgressByConversation).toHaveBeenCalledTimes(1);
    const setActivationProgressByConversation = context.setActivationProgressByConversation as
      ReturnType<typeof vi.fn> | undefined;
    const updater = setActivationProgressByConversation?.mock.calls[0]?.[0];
    expect(typeof updater).toBe('function');
    const next = (
      updater as (
        current: Map<string, readonly ActivationProgressTimeline[]>,
      ) => Map<string, readonly ActivationProgressTimeline[]>
    )(new Map());

    expect(next.get('conv-1')).toEqual([
      expect.objectContaining({
        conversationId: 'conv-1',
        activationId: 'activation-1',
        target: 'skill',
        action: 'activate',
        name: 'quality-review',
        source: 'agent-tool',
        requestedBy: 'agent',
        status: 'succeeded',
        events: [event],
      }),
    ]);
  });
});

function dispatch(message: ExtensionToWebviewMessage, context: MessageHandlerContext): void {
  const registration = activationProgressHandlers.find((handler) => handler.type === message.type);
  expect(registration).toBeDefined();
  registration?.handler(message, context);
}

function createActivationEvent(
  id: string,
  step: AgentCapabilityActivationProgressEvent['step'],
  at: number,
): AgentCapabilityActivationProgressEvent {
  return {
    id,
    activationId: 'activation-1',
    conversationId: 'conv-1',
    target: 'skill',
    action: 'activate',
    name: 'quality-review',
    step,
    status: 'succeeded',
    source: 'agent-tool',
    requestedBy: 'agent',
    at,
  };
}

function createContext(): MessageHandlerContext {
  return {
    messages: [],
    isThinking: false,
    streamingMessageId: null,
    queuedMessageCount: 0,
    streamingMessageIdRef: { current: null },
    activeConversationId: null,
    activeConversationIdRef: { current: null },
    conversationMessagesRef: { current: new Map() },
    conversationStreamingRef: { current: new Map() },
    openTabs: [],
    activeTabId: null,
    isTablessConversationViewRef: { current: false },
    setOpenTabs: vi.fn(),
    setActiveTabId: vi.fn(),
    setActiveTab: vi.fn(),
    requestConfigSnapshot: vi.fn(),
    setSettings: vi.fn(),
    setHasConfigSnapshot: vi.fn(),
    hydrateConversationSettings: vi.fn(),
    updateSettings: vi.fn(),
    setAgentState: vi.fn(),
    conversationAgentStateRef: { current: new Map() },
    forceAgentStateUpdate: vi.fn(),
    setSkills: vi.fn(),
    setActivationProgressByConversation: vi.fn(),
    setGlobalError: vi.fn(),
    reportConversationDiagnostic: vi.fn(),
    conversationTokenCountRef: { current: new Map() },
    conversationCompressingRef: { current: new Map() },
    forceUpdate: vi.fn(),
    isCurrentConversation: () => true,
    updateConversationRenderState: vi.fn(),
    setConversations: vi.fn(),
    setActiveConversationId: vi.fn(),
    setWorkItemsByConversation: vi.fn(),
    setProjectFiles: vi.fn(),
    mentionSearchFilter: '',
    setMentionItems: vi.fn(),
    setPluginCommands: vi.fn(),
    setPluginsAvailable: vi.fn(),
    setShowOnboarding: vi.fn(),
  };
}
