import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionToWebviewMessage } from '@neko-agent/types';
import type { Message } from '@neko-agent/types';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import { setLocale } from '@/i18n';
import { commandHandlers } from '../command-handlers';
import type { HandlerRegistration, MessageHandlerContext, StreamingState } from '../types';

describe('command handlers conversation isolation', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('routes slash command assistant messages to the result conversation', () => {
    const visibleMessage = message('visible-message', 'assistant', '当前会话内容');
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      currentMessages: [visibleMessage],
    });

    dispatch(
      commandHandlers,
      {
        type: 'slashCommandResult',
        conversationId: 'conv-a',
        command: 'status',
        success: true,
        message: 'A 会话命令结果',
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([visibleMessage]);
    expect(harness.conversationMessages().get('conv-a')).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'A 会话命令结果',
      }),
    ]);
    expect(harness.conversationMessages().get('conv-b')).toBeUndefined();
  });

  it('does not close the visible tab for an exit result from a non-current conversation', () => {
    const setOpenTabs = vi.fn();
    const setActiveTabId = vi.fn();
    const setActiveConversationId = vi.fn();
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      currentMessages: [],
      overrides: {
        setOpenTabs,
        setActiveTabId,
        setActiveConversationId,
      },
    });

    dispatch(
      commandHandlers,
      {
        type: 'slashCommandResult',
        conversationId: 'conv-a',
        command: 'exit',
        success: true,
        action: 'exit',
        message: '退出 A',
      },
      harness.context,
    );

    expect(setOpenTabs).not.toHaveBeenCalled();
    expect(setActiveTabId).not.toHaveBeenCalled();
    expect(setActiveConversationId).not.toHaveBeenCalled();
    expect(harness.conversationMessages().get('conv-a')).toEqual([
      expect.objectContaining({
        content: '退出 A',
      }),
    ]);
  });

  it('keeps the active conversation ref aligned when exit closes the current tab', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      currentMessages: [],
    });

    dispatch(
      commandHandlers,
      {
        type: 'slashCommandResult',
        conversationId: 'conv-b',
        command: 'exit',
        success: true,
        action: 'exit',
      },
      harness.context,
    );

    expect(harness.context.activeConversationId).toBe('conv-a');
    expect(harness.context.activeConversationIdRef.current).toBe('conv-a');
  });

  it('appends Canvas lifecycle capability diagnostics to the result conversation', () => {
    setLocale('zh-cn');
    const visibleMessage = message('visible-message', 'assistant', '当前会话内容');
    const harness = createContextHarness({
      activeConversationId: 'conv-b',
      currentMessages: [visibleMessage],
    });

    dispatch(
      commandHandlers,
      {
        type: 'agentCapabilityLifecycleResult',
        requestId: 'req-1',
        conversationId: 'conv-a',
        success: false,
        lifecycleResult: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          status: 'blocked',
          diagnostics: [
            {
              severity: 'error',
              code: 'canvas-markdown-missing-resource-token',
              message: 'Markdown resource token "P1" does not match a known resource.',
              token: 'P1',
            },
          ],
          actions: [
            {
              actionId: 'repair-resource',
              label: 'Repair resource references',
              capabilityId: 'canvas.ingestMarkdown',
              phase: 'review',
              requiresApproval: false,
            },
          ],
        },
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([visibleMessage]);
    expect(harness.conversationMessages().get('conv-a')).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: expect.stringContaining('canvas-markdown-missing-resource-token'),
        contentBlocks: [
          expect.objectContaining({
            type: 'canvas_lifecycle',
            canvasLifecycle: expect.objectContaining({
              requestId: 'req-1',
              success: false,
              result: expect.objectContaining({
                capabilityId: 'canvas.ingestMarkdown',
                actions: [
                  expect.objectContaining({
                    actionId: 'repair-resource',
                    capabilityId: 'canvas.ingestMarkdown',
                  }),
                ],
              }),
            }),
          }),
        ],
      }),
    ]);
    const content = harness.conversationMessages().get('conv-a')?.[0]?.content ?? '';
    expect(content).toContain('Canvas 生命周期动作 已阻止');
    expect(content).toContain('诊断');
    expect(content).toContain('Markdown 资源标记 "P1" 未匹配到已知资源。');
    expect(content).toContain('可用 Canvas 生命周期动作');
    expect(content).toContain('repair-resource');
    expect(content).not.toContain('Repair resource references');
    expect(content).not.toContain('Available Canvas lifecycle actions');
    expect(content).not.toContain('Markdown resource token');
    expect(harness.conversationMessages().get('conv-a')?.[0]?.content).not.toContain(
      'Next actions',
    );
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

interface ContextHarnessOptions {
  activeConversationId: string;
  currentMessages: Message[];
  overrides?: Partial<
    Pick<MessageHandlerContext, 'setOpenTabs' | 'setActiveTabId' | 'setActiveConversationId'>
  >;
}

interface ContextHarness {
  context: MessageHandlerContext;
  messages(): Message[];
  conversationMessages(): Map<string, Message[]>;
}

function createContextHarness(options: ContextHarnessOptions): ContextHarness {
  let activeConversationId: string | null = options.activeConversationId;
  const messages = options.currentMessages;
  const streaming: StreamingState = {
    isThinking: false,
    streamingMessageId: null,
    queuedMessageCount: 0,
  };
  let workItems: AgentWorkItemStore = new Map();
  let pluginsAvailable: PluginsAvailable = {};
  const activeConversationIdRef = ref<string | null>(options.activeConversationId);
  const streamingMessageIdRef = ref<string | null>(streaming.streamingMessageId);
  const conversationMessagesRef = ref(new Map<string, Message[]>());
  const conversationStreamingRef = ref(new Map<string, StreamingState>());
  const isTablessConversationViewRef = ref(false);

  const context: MessageHandlerContext = {
    messages,
    isThinking: streaming.isThinking,
    streamingMessageId: streaming.streamingMessageId,
    queuedMessageCount: streaming.queuedMessageCount,
    streamingMessageIdRef,
    activeConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    openTabs: [
      { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
    ],
    activeTabId: 'tab-b',
    isTablessConversationViewRef,
    setOpenTabs: options.overrides?.setOpenTabs ?? noopDispatch(),
    setActiveTabId: options.overrides?.setActiveTabId ?? noopDispatch(),
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
    reportConversationDiagnostic: vi.fn(),
    conversationTokenCountRef: ref(new Map()),
    conversationCompressingRef: ref(new Map()),
    forceUpdate: () => undefined,
    isCurrentConversation: (conversationId?: string) =>
      conversationId === activeConversationIdRef.current,
    updateConversationRenderState: (conversationId, updater) => {
      const existingMessages = conversationMessagesRef.current.get(conversationId) ?? [];
      const existingStreaming = conversationStreamingRef.current.get(conversationId) ?? {
        isThinking: false,
        streamingMessageId: null,
        queuedMessageCount: 0,
      };
      const result = updater(existingMessages, existingStreaming);
      conversationMessagesRef.current.set(conversationId, result.messages);
      conversationStreamingRef.current.set(conversationId, result.streaming);
    },
    setConversations: noopDispatch(),
    setActiveConversationId:
      options.overrides?.setActiveConversationId ??
      createSetter(
        () => activeConversationId,
        (next) => {
          activeConversationId = next;
          context.activeConversationId = next;
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
  };

  return {
    context,
    messages: () => messages,
    conversationMessages: () => conversationMessagesRef.current,
  };
}

function message(id: string, role: Message['role'], content: string): Message {
  return { id, role, content, timestamp: 1 };
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
