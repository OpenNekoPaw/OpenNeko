import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsState } from '@neko-agent/types';
import { createTabRenderRuntime } from '@/render-runtime/tab-render-runtime';
import { MarkdownRenderer } from '@/components/ChatView/MessageContent';
import { createAgentMarkdownSessionKey } from '@/markdown/agent-markdown-session-registry';
import {
  ConversationTabRuntimeView,
  type ConversationTabRuntimeViewProps,
} from './ConversationTabRuntimeView';

const { chatWorkspaceSpy, renderChatWorkspace } = vi.hoisted(() => ({
  chatWorkspaceSpy: vi.fn(),
  renderChatWorkspace: vi.fn((_props: unknown): ReactNode => null),
}));

vi.mock('./ChatWorkspace', () => ({
  ChatWorkspace: (props: unknown) => {
    chatWorkspaceSpy(props);
    return renderChatWorkspace(props);
  },
}));

afterEach(() => {
  chatWorkspaceSpy.mockClear();
  renderChatWorkspace.mockReset();
  renderChatWorkspace.mockImplementation((_props: unknown): ReactNode => null);
});

describe('ConversationTabRuntimeView', () => {
  it('does not render non-Timeline active Markdown through an empty initial snapshot', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    runtime.attachProjection({
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-a',
      send: vi.fn(),
      reportError: vi.fn(),
    });
    const messageId = 'izbh0142-01KXQPB5JCJPXJY9Y5ZGPCCPYA1784280356465-l8ckmir20';
    const blockId = 'block-1784280356465-l8ckmir20';
    renderChatWorkspace.mockImplementation((value: unknown) => {
      if (!isChatWorkspaceRenderInput(value)) {
        throw new Error('Expected ChatWorkspace render input.');
      }
      const message = value.messages.find((candidate) => candidate.id === messageId);
      const block = message?.contentBlocks?.find((candidate) => candidate.type === 'text');
      if (!block || block.type !== 'text') return null;
      return (
        <MarkdownRenderer
          content={block.content ?? ''}
          isStreaming={block.isStreaming === true}
          sessionKey={createAgentMarkdownSessionKey({
            conversationId: 'conv-a',
            messageId,
            itemId: block.id,
          })}
        />
      );
    });
    const props: ConversationTabRuntimeViewProps = {
      ...createProps(runtime),
      messages: [
        {
          id: messageId,
          role: 'assistant',
          content: 'partial',
          timestamp: 1,
          isStreaming: true,
          contentBlocks: [
            {
              id: blockId,
              type: 'text',
              timestamp: 1,
              content: 'partial',
              isStreaming: true,
            },
          ],
        },
      ],
      isThinking: true,
      streamingMessageId: messageId,
    };

    expect(() => render(<ConversationTabRuntimeView {...props} />)).not.toThrow();
    expect(chatWorkspaceSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: [],
        isThinking: true,
        streamingMessageId: null,
        streamingMessageIdRef: { current: null },
      }),
    );

    expect(() =>
      act(() => {
        runtime.acceptProjectionFrame({
          type: 'projectionSnapshot',
          key: {
            endpointEpoch: 'endpoint-1',
            attachmentId: 'attachment-a',
            tabId: 'tab-a',
            conversationId: 'conv-a',
          },
          sequence: 0,
          projectionVersion: 1,
          projection: {
            conversationId: 'conv-a',
            projectionVersion: 1,
            turns: [],
          },
        });
      }),
    ).not.toThrow();
    expect(chatWorkspaceSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: [],
        isThinking: true,
        streamingMessageId: null,
        streamingMessageIdRef: { current: null },
      }),
    );

    act(() => {
      runtime.acceptProjectionFrame({
        type: 'projectionPatch',
        key: {
          endpointEpoch: 'endpoint-1',
          attachmentId: 'attachment-a',
          tabId: 'tab-a',
          conversationId: 'conv-a',
        },
        sequence: 1,
        baseProjectionVersion: 1,
        projectionVersion: 2,
        patch: {
          type: 'conversationProjectionPatch',
          conversationId: 'conv-a',
          baseProjectionVersion: 1,
          projectionVersion: 2,
          turnId: 'turn-1',
          messageId,
          operations: [
            {
              operation: 'append',
              item: {
                conversationId: 'conv-a',
                turnId: 'turn-1',
                messageId,
                itemId: 'text-1',
                sequence: 1,
                itemRevision: 1,
                kind: 'assistant_text',
                status: 'streaming',
                payload: { content: 'partial', format: 'markdown', sourceGeneration: 1 },
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
        },
      });
    });

    expect(runtime.markdownSessions.metrics().activeSessions).toBe(1);
    expect(chatWorkspaceSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ id: messageId, content: 'partial' })],
        isThinking: true,
        streamingMessageId: messageId,
        streamingMessageIdRef: { current: messageId },
      }),
    );
  });

  it('renders from its own projection replica without rebinding on visibility changes', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    runtime.attachProjection({
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-a',
      send: vi.fn(),
      reportError: vi.fn(),
    });
    const props = createProps(runtime);
    const view = render(<ConversationTabRuntimeView {...props} />);

    expect(chatWorkspaceSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ id: 'history-1', content: 'history' })],
        isThinking: false,
        streamingMessageId: null,
      }),
    );

    act(() => {
      runtime.acceptProjectionFrame({
        type: 'projectionSnapshot',
        key: {
          endpointEpoch: 'endpoint-1',
          attachmentId: 'attachment-a',
          tabId: 'tab-a',
          conversationId: 'conv-a',
        },
        sequence: 0,
        projectionVersion: 1,
        projection: {
          conversationId: 'conv-a',
          projectionVersion: 1,
          turns: [
            {
              turnId: 'turn-1',
              messageId: 'message-1',
              items: [projectionTextItem('tab-owned answer')],
            },
          ],
        },
      });
    });

    expect(chatWorkspaceSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({ id: 'history-1', content: 'history' }),
          expect.objectContaining({ id: 'message-1', content: 'tab-owned answer' }),
        ],
        isThinking: true,
        streamingMessageId: 'message-1',
        tabRenderStore: runtime.store,
      }),
    );

    view.rerender(<ConversationTabRuntimeView {...props} visible={false} />);

    expect(runtime.projectionReplica.getSnapshot().projection?.projectionVersion).toBe(1);
    expect(runtime.markdownSessions.metrics().activeSessions).toBe(1);
    expect(
      view.container.querySelector('[data-agent-tab-runtime="tab-a"]')?.hasAttribute('hidden'),
    ).toBe(true);
  });

  it('keeps two retained views of the same conversation on independent replicas', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-a' });
    runtimeA.projectionReplica.installSnapshot(projectionSnapshot('tab A'));
    runtimeB.projectionReplica.installSnapshot(projectionSnapshot('tab B'));

    render(
      <>
        <ConversationTabRuntimeView {...createProps(runtimeA)} />
        <ConversationTabRuntimeView {...createProps(runtimeB)} visible={false} />
      </>,
    );

    expect(chatWorkspaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ content: 'tab A' })]),
        tabRenderStore: runtimeA.store,
      }),
    );
    expect(chatWorkspaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ content: 'tab B' })]),
        tabRenderStore: runtimeB.store,
      }),
    );
  });
});

function isChatWorkspaceRenderInput(
  value: unknown,
): value is Pick<ConversationTabRuntimeViewProps, 'messages'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'messages' in value &&
    Array.isArray(value.messages)
  );
}

function createProps(
  runtime: ReturnType<typeof createTabRenderRuntime>,
): ConversationTabRuntimeViewProps {
  return {
    tab: { id: runtime.tabId, title: runtime.tabId, conversationId: runtime.conversationId },
    runtime,
    visible: true,
    messages: [{ id: 'history-1', role: 'user', content: 'history', timestamp: 1 }],
    setMessages: vi.fn(),
    isThinking: false,
    setIsThinking: vi.fn(),
    streamingMessageId: null,
    queuedMessageCount: 0,
    queuedMessages: [],
    setStreamingMessageId: vi.fn(),
    conversationKind: 'chat',
    clearMessages: vi.fn(),
    settings: createSettings(),
    onModelSelect: vi.fn(),
    mentionItems: [],
    onMentionSearchFilterChange: vi.fn(),
    pluginCommands: [],
    workItems: [],
    pluginsAvailable: {},
    setActiveTab: vi.fn(),
    conversationCompressingRef: { current: new Map() },
    contextTokenCount: 0,
    isCompressing: false,
    mediaModelCallCount: 0,
    skills: [],
    ambientNodes: [],
    agentState: null,
    setAmbientNodes: vi.fn(),
    onNewChat: vi.fn(),
    queuedEditDraftConflictMessage: 'conflict',
  };
}

function createSettings(): SettingsState {
  return {
    providers: [],
    configuredProviders: [],
    selectedProviderId: null,
    selectedModelId: null,
    systemPrompt: '',
    autoExecuteTools: false,
    streamResponses: true,
    showToolCalls: true,
    temperature: 0.2,
    maxTokens: 8192,
    executionMode: 'ask',
    chatModelOptions: [],
    modelGroups: [],
  };
}

function projectionSnapshot(content: string) {
  return {
    conversationId: 'conv-a',
    projectionVersion: 1,
    turns: [
      {
        turnId: 'turn-1',
        messageId: 'message-1',
        items: [projectionTextItem(content)],
      },
    ],
  };
}

function projectionTextItem(content: string) {
  return {
    conversationId: 'conv-a',
    turnId: 'turn-1',
    messageId: 'message-1',
    itemId: 'text-1',
    sequence: 1,
    itemRevision: 1,
    kind: 'assistant_text' as const,
    status: 'streaming' as const,
    payload: { content, format: 'markdown' as const, sourceGeneration: 1 },
    createdAt: 1,
    updatedAt: 1,
  };
}
