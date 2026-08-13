import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { type AgentInputCatalogMessage } from '@neko/agent-contracts';
import { useChatActions } from '../useChatActions';

const hostMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  invokeAgentInput: vi.fn(),
  cancelMessage: vi.fn(),
}));

vi.mock('../../host-runtime-context', () => ({
  useAgentHostMessages: () => ({
    sendMessage: hostMocks.sendMessage,
    invokeAgentInput: hostMocks.invokeAgentInput,
    cancelMessage: hostMocks.cancelMessage,
  }),
}));

function createSessionInputCatalog(
  entries: AgentInputCatalogMessage['entries'],
  bindingKind: AgentInputCatalogMessage['bindingKind'] = 'assistant',
): AgentInputCatalogMessage {
  return {
    type: 'agentInputCatalog',
    conversationId: bindingKind === 'character' ? 'role-session-1' : 'conv-1',
    phase: 'session',
    bindingKind,
    entries,
  };
}

describe('useChatActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an acceptance receipt and does not consume a send while the Conversation switches', () => {
    const clearInput = vi.fn();
    const setAttachedFiles = vi.fn();
    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-1');
      return useChatActions({
        inputValue: 'keep this draft',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-1',
        activeConversationIdRef,
        isConversationSwitching: true,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages: vi.fn(),
        setIsThinking: vi.fn(),
        setStreamingMessageId: vi.fn(),
        setActiveTab: vi.fn(),
        clearInput,
        setAttachedFiles,
      });
    });

    let accepted = true;
    act(() => {
      accepted = result.current.handleSend();
    });

    expect(accepted).toBe(false);
    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
    expect(clearInput).not.toHaveBeenCalled();
    expect(setAttachedFiles).not.toHaveBeenCalled();
  });

  it('keeps an unowned draft and reports the missing exact Conversation creator', () => {
    const reportInputDiagnostic = vi.fn();
    const clearInput = vi.fn();
    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>(null);
      return useChatActions({
        inputValue: 'do not lose me',
        isThinking: false,
        reportInputDiagnostic,
        selectedModel: 'model-a',
        activeConversationId: null,
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages: vi.fn(),
        setIsThinking: vi.fn(),
        setStreamingMessageId: vi.fn(),
        setActiveTab: vi.fn(),
        clearInput,
        setAttachedFiles: vi.fn(),
      });
    });

    let accepted = true;
    act(() => {
      accepted = result.current.handleSend();
    });

    expect(accepted).toBe(false);
    expect(reportInputDiagnostic).toHaveBeenCalledWith(
      'Agent message cannot be sent before the exact Conversation creator is available.',
    );
    expect(clearInput).not.toHaveBeenCalled();
  });

  it('returns the exact Conversation creator receipt for a tabless first submit', () => {
    const ensureConversationForSend = vi.fn(() => false);
    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>(null);
      return useChatActions({
        inputValue: 'first submit',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: null,
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages: vi.fn(),
        setIsThinking: vi.fn(),
        setStreamingMessageId: vi.fn(),
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        ensureConversationForSend,
      });
    });

    let accepted = true;
    act(() => {
      accepted = result.current.handleSend();
    });

    expect(accepted).toBe(false);
    expect(ensureConversationForSend).toHaveBeenCalledWith(
      expect.objectContaining({ messageText: 'first submit' }),
    );
  });

  it('returns true for an active-run send accepted by the Host queue and rejects a duplicate', () => {
    const clearInput = vi.fn();
    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-queue');
      return useChatActions({
        inputValue: 'queue this message',
        isThinking: true,
        selectedModel: 'model-a',
        activeConversationId: 'conv-queue',
        activeConversationIdRef,
        streamingMessageIdRef: { current: 'streaming-a' },
        messages: [],
        setMessages: vi.fn(),
        setIsThinking: vi.fn(),
        setStreamingMessageId: vi.fn(),
        setActiveTab: vi.fn(),
        clearInput,
        setAttachedFiles: vi.fn(),
      });
    });

    let firstAccepted = false;
    let duplicateAccepted = true;
    act(() => {
      firstAccepted = result.current.handleSend();
      duplicateAccepted = result.current.handleSend();
    });

    expect(firstAccepted).toBe(true);
    expect(duplicateAccepted).toBe(false);
    expect(hostMocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-queue',
        message: 'queue this message',
      }),
    );
    expect(clearInput).toHaveBeenCalledTimes(1);
  });

  it('routes a direct command through the exact Session catalog identity', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const setActiveTab = vi.fn();
    const clearInput = vi.fn();
    const setAttachedFiles = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-1');
      const streamingMessageIdRef = useRef<string | null>(null);
      return useChatActions({
        inputValue: '/as @小明 --consult hello',
        isThinking: false,
        inputCatalog: createSessionInputCatalog([
          {
            id: 'command:builtin:as',
            name: 'as',
            description: 'Start a role interaction',
            trigger: 'command',
            prefix: '/',
            phaseRequirement: 'session',
            bindingRequirement: 'any',
            source: { kind: 'builtin', sourceId: 'as' },
            availability: { status: 'available' },
            executable: { kind: 'command', commandId: 'as', handlerId: 'builtin:as' },
          },
        ]),
        selectedModel: 'model-a',
        activeConversationId: 'conv-1',
        activeConversationIdRef,
        streamingMessageIdRef,
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab,
        clearInput,
        setAttachedFiles,
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(hostMocks.invokeAgentInput).toHaveBeenCalledWith(
      {
        kind: 'command',
        catalogEntryId: 'command:builtin:as',
        commandId: 'as',
        handlerId: 'builtin:as',
        args: '@小明 --consult hello',
      },
      'conv-1',
    );
    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setStreamingMessageId).not.toHaveBeenCalled();
    expect(clearInput).toHaveBeenCalledTimes(1);
    expect(setAttachedFiles).toHaveBeenCalledWith([]);
  });

  it('routes /compact only through the exact Session command receipt', () => {
    const clearInput = vi.fn();
    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-1');
      return useChatActions({
        inputValue: '/compact',
        isThinking: false,
        inputCatalog: createSessionInputCatalog([
          {
            id: 'command:builtin:compact',
            name: 'compact',
            description: 'Compact the exact Conversation',
            trigger: 'command',
            prefix: '/',
            phaseRequirement: 'session',
            bindingRequirement: 'any',
            source: { kind: 'builtin', sourceId: 'compact' },
            availability: { status: 'available' },
            executable: {
              kind: 'command',
              commandId: 'compact',
              handlerId: 'builtin:compact',
            },
          },
        ]),
        selectedModel: 'model-a',
        activeConversationId: 'conv-1',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages: vi.fn(),
        setIsThinking: vi.fn(),
        setStreamingMessageId: vi.fn(),
        setActiveTab: vi.fn(),
        clearInput,
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => result.current.handleSend());

    expect(hostMocks.invokeAgentInput).toHaveBeenCalledWith(
      {
        kind: 'command',
        catalogEntryId: 'command:builtin:compact',
        commandId: 'compact',
        handlerId: 'builtin:compact',
      },
      'conv-1',
    );
    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
    expect(clearInput).toHaveBeenCalledTimes(1);
  });

  it('reports unknown slash text without sending it as a normal chat message', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const streamingMessageIdRef = { current: 'streaming-1' };
    const onUserMessageSent = vi.fn();
    const reportInputDiagnostic = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-1');
      return useChatActions({
        inputValue: '/not-a-builtin hello',
        isThinking: false,
        inputCatalog: createSessionInputCatalog([]),
        reportInputDiagnostic,
        selectedModel: 'model-a',
        activeConversationId: 'conv-1',
        activeConversationIdRef,
        streamingMessageIdRef,
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        onUserMessageSent,
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(hostMocks.invokeAgentInput).not.toHaveBeenCalled();
    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
    expect(reportInputDiagnostic).toHaveBeenCalledWith(
      "Agent input '/not-a-builtin' is unknown or stale.",
    );
    expect(setMessages).not.toHaveBeenCalled();
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setStreamingMessageId).not.toHaveBeenCalled();
    expect(streamingMessageIdRef.current).toBe('streaming-1');
    expect(onUserMessageSent).not.toHaveBeenCalled();
  });

  it('routes direct dollar skill invocations without persisting them as chat messages', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const clearInput = vi.fn();
    const setAttachedFiles = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-1');
      return useChatActions({
        inputValue: '$quality-review changed files',
        isThinking: false,
        inputCatalog: createSessionInputCatalog(
          [
            {
              id: 'skill:project:quality-review',
              name: 'quality-review',
              description: 'Review changed files',
              trigger: 'skill',
              prefix: '$',
              phaseRequirement: 'any',
              bindingRequirement: 'workspace',
              source: { kind: 'project', workspaceId: 'workspace-1', sourceId: 'skill-source-1' },
              availability: { status: 'available' },
              executable: {
                kind: 'skill',
                skillName: 'quality-review',
                activationId: 'skill:project:skill:skill-source-1',
              },
            },
          ],
          'workspace',
        ),
        selectedModel: 'model-a',
        activeConversationId: 'conv-1',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput,
        setAttachedFiles,
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(hostMocks.invokeAgentInput).toHaveBeenCalledWith(
      {
        kind: 'skill',
        catalogEntryId: 'skill:project:quality-review',
        skillName: 'quality-review',
        activationId: 'skill:project:skill:skill-source-1',
        args: 'changed files',
      },
      'conv-1',
    );
    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setStreamingMessageId).not.toHaveBeenCalled();
    expect(clearInput).toHaveBeenCalledTimes(1);
    expect(setAttachedFiles).toHaveBeenCalledWith([]);
  });

  it('does not send the stale active conversation while a foreground conversation is pending', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const onUserMessageSent = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('role-session-1');
      return useChatActions({
        inputValue: '你好',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'role-session-1',
        activeConversationIdRef,
        isConversationSwitching: true,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        onUserMessageSent,
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setStreamingMessageId).not.toHaveBeenCalled();
    expect(onUserMessageSent).not.toHaveBeenCalled();
  });

  it('requests a conversation instead of dropping a send when no conversation is active', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const ensureConversationForSend = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>(null);
      return useChatActions({
        inputValue: '从这里开始一个默认 Agent 对话',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: null,
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        ensureConversationForSend,
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(ensureConversationForSend).toHaveBeenCalledWith({
      messageText: '从这里开始一个默认 Agent 对话',
      displayMessageText: '从这里开始一个默认 Agent 对话',
    });
    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setStreamingMessageId).not.toHaveBeenCalled();
  });

  it('requests a conversation for externally triggered sends when no conversation is active', () => {
    const ensureConversationForSend = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>(null);
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: null,
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages: vi.fn(),
        setIsThinking: vi.fn(),
        setStreamingMessageId: vi.fn(),
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        ensureConversationForSend,
      });
    });

    act(() => {
      result.current.triggerSend('Use this selected clip');
    });

    expect(ensureConversationForSend).toHaveBeenCalledWith({
      messageText: 'Use this selected clip',
      displayMessageText: 'Use this selected clip',
    });
    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('does not let Character raw command text bypass its exact catalog policy', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const reportInputDiagnostic = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('role-session-1');
      return useChatActions({
        inputValue: '/as @小明 --consult hello',
        isThinking: false,
        inputCatalog: createSessionInputCatalog([], 'character'),
        reportInputDiagnostic,
        selectedModel: 'model-a',
        activeConversationId: 'role-session-1',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(hostMocks.invokeAgentInput).not.toHaveBeenCalled();
    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
    expect(reportInputDiagnostic).toHaveBeenCalledWith("Agent input '/as' is unknown or stale.");
    expect(setMessages).not.toHaveBeenCalled();
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setStreamingMessageId).not.toHaveBeenCalled();
  });

  it('resolves selected chat models from model options instead of parsing the option id', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-deepseek');
      return useChatActions({
        inputValue: '你好',
        isThinking: false,
        selectedModel: 'deepseek-pro',
        availableModels: [
          {
            id: 'deepseek-pro',
            label: 'DeepSeek V4 Pro',
            providerId: 'deepseek-chat',
            modelId: 'deepseek-pro',
            category: 'llm',
          },
        ],
        activeConversationId: 'conv-deepseek',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-deepseek',
        message: '你好',
        chatModel: {
          providerId: 'deepseek-chat',
          modelId: 'deepseek-pro',
          category: 'llm',
        },
      }),
    );
  });

  it('sends a music-only audio selection with the music generation purpose', () => {
    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-music');
      return useChatActions({
        inputValue: '写一段轻快的配乐',
        isThinking: false,
        selectedModel: 'openai:gpt-4.1',
        availableModels: [
          {
            id: 'openai:gpt-4.1',
            label: 'OpenAI / GPT 4.1',
            providerId: 'openai',
            modelId: 'gpt-4.1',
            category: 'llm',
          },
          {
            id: 'nekoapi-media:suno_music',
            label: 'NekoAPI / Suno Music',
            providerId: 'nekoapi-media',
            modelId: 'suno_music',
            category: 'audio',
            capabilities: ['text_to_music'],
          },
        ],
        sessionMode: 'agent',
        agentMediaModels: {
          audio: {
            providerId: 'nekoapi-media',
            modelId: 'suno_music',
            category: 'audio',
          },
        },
        activeConversationId: 'conv-music',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages: vi.fn(),
        setIsThinking: vi.fn(),
        setStreamingMessageId: vi.fn(),
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-music',
        purposeModels: {
          'audio.music.generate': {
            providerId: 'nekoapi-media',
            modelId: 'suno_music',
            category: 'audio',
          },
        },
      }),
    );
    expect(hostMocks.sendMessage.mock.calls[0]?.[0]?.purposeModels).not.toHaveProperty([
      'audio.generate',
    ]);
  });

  it('gives the explicit Agent primary model precedence for LLM routing', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-agent-model');
      return useChatActions({
        inputValue: '继续生成',
        isThinking: false,
        selectedModel: 'deepseek-pro',
        availableModels: [
          {
            id: 'deepseek-pro',
            label: 'DeepSeek V4 Pro',
            providerId: 'deepseek-chat',
            modelId: 'deepseek-pro',
            category: 'llm',
          },
          {
            id: 'configured-gateway:gpt-5.5',
            label: 'GPT 5.5',
            providerId: 'configured-gateway',
            modelId: 'gpt-5.5',
            category: 'llm',
          },
        ],
        sessionMode: 'agent',
        activeConversationId: 'conv-agent-model',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend({
        messageText: '继续生成',
        sessionMode: 'agent',
        agentModels: {
          primary: {
            providerId: 'configured-gateway',
            modelId: 'gpt-5.5',
            category: 'llm',
          },
        },
      });
    });

    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-agent-model',
        message: '继续生成',
        sessionMode: 'agent',
        agentModels: {
          primary: {
            providerId: 'configured-gateway',
            modelId: 'gpt-5.5',
            category: 'llm',
          },
        },
      }),
    );
    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.not.objectContaining({
        chatModel: expect.anything(),
      }),
    );
  });

  it('does not attach hidden mode context when sending a normal message', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-embody');
      return useChatActions({
        inputValue: '我现在应该知道天台的秘密吗？',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-embody',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-embody',
        message: '我现在应该知道天台的秘密吗？',
      }),
    );
    expect(hostMocks.sendMessage.mock.calls[0]?.[0]).not.toHaveProperty('contextPayloads');
  });

  it('projects selected file references once and sends them separately from message text', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const setSelectedFileReferences = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-files');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-files',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        setSelectedFileReferences,
      });
    });

    act(() => {
      result.current.handleSend({
        messageText: '参考',
        displayMessageText: '参考',
        fileReferences: [
          {
            id: 'file-ref:assets/ref file.zip',
            label: 'ref file.zip',
            contentLocator: { kind: 'workspace-file', path: 'assets/ref file.zip' },
          },
        ],
      });
    });

    expect(setMessages).toHaveBeenCalledWith(expect.any(Function));
    const updater = setMessages.mock.calls[0]?.[0] as (messages: unknown[]) => unknown[];
    expect(updater([])).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '参考',
        contextReferences: [
          expect.objectContaining({
            id: 'file-ref:assets/ref file.zip',
            label: 'ref file.zip',
            type: 'file',
            summary: 'assets/ref file.zip',
            contentLocator: { kind: 'workspace-file', path: 'assets/ref file.zip' },
          }),
        ],
      }),
    ]);
    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-files',
        message: '参考',
        fileReferences: [
          {
            id: 'file-ref:assets/ref file.zip',
            label: 'ref file.zip',
            contentLocator: {
              kind: 'workspace-file',
              path: 'assets/ref file.zip',
            },
          },
        ],
      }),
    );
    expect(setSelectedFileReferences).toHaveBeenCalledWith([]);
  });

  it('sends selected document references without file attachments or text rewriting', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-doc');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-doc',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend({
        messageText: '分析',
        displayMessageText: '分析',
        fileReferences: [
          {
            id: 'file-ref:books/story.epub',
            label: 'story.epub',
            contentLocator: { kind: 'workspace-file', path: 'books/story.epub' },
            mediaType: 'document',
          },
        ],
      });
    });

    const updater = setMessages.mock.calls[0]?.[0] as (messages: unknown[]) => unknown[];
    expect(updater([])).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '分析',
        contextReferences: [
          expect.objectContaining({
            id: 'file-ref:books/story.epub',
            label: 'story.epub',
            type: 'file',
            summary: 'books/story.epub',
            mediaType: 'document',
            contentLocator: { kind: 'workspace-file', path: 'books/story.epub' },
          }),
        ],
      }),
    ]);
    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.not.objectContaining({
        attachments: expect.any(Array),
      }),
    );
    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-doc',
        message: '分析',
        fileReferences: [
          {
            id: 'file-ref:books/story.epub',
            label: 'story.epub',
            contentLocator: {
              kind: 'workspace-file',
              path: 'books/story.epub',
            },
            mediaType: 'document',
          },
        ],
      }),
    );
  });

  it('sends selected document references even when the visible input is empty', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-doc-only');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-doc-only',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend({
        messageText: '',
        displayMessageText: '',
        fileReferences: [
          {
            id: 'file-ref:books/story.epub',
            label: 'story.epub',
            contentLocator: { kind: 'workspace-file', path: 'books/story.epub' },
            mediaType: 'document',
          },
        ],
      });
    });

    const updater = setMessages.mock.calls[0]?.[0] as (messages: unknown[]) => unknown[];
    expect(updater([])).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '',
        contextReferences: [
          expect.objectContaining({
            id: 'file-ref:books/story.epub',
            label: 'story.epub',
            summary: 'books/story.epub',
            contentLocator: { kind: 'workspace-file', path: 'books/story.epub' },
          }),
        ],
      }),
    ]);
    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-doc-only',
        message: '',
        fileReferences: [
          {
            id: 'file-ref:books/story.epub',
            label: 'story.epub',
            contentLocator: { kind: 'workspace-file', path: 'books/story.epub' },
            mediaType: 'document',
          },
        ],
      }),
    );
  });

  it('sends selected media references as locators without synthesizing attachments', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-media');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-media',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend({
        messageText: '参考',
        displayMessageText: '参考',
        fileReferences: [
          {
            id: 'file-ref:assets/1.png',
            label: '1.png',
            contentLocator: { kind: 'workspace-file', path: 'assets/1.png' },
            mediaType: 'image',
          },
          {
            id: 'file-ref:cases/1080P.mp4',
            label: '1080P.mp4',
            contentLocator: { kind: 'workspace-file', path: 'cases/1080P.mp4' },
            mediaType: 'video',
          },
        ],
      });
    });

    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-media',
        message: '参考',
        fileReferences: [
          expect.objectContaining({ id: 'file-ref:assets/1.png', mediaType: 'image' }),
          expect.objectContaining({ id: 'file-ref:cases/1080P.mp4', mediaType: 'video' }),
        ],
      }),
    );
    expect(hostMocks.sendMessage.mock.calls[0]?.[0]).not.toHaveProperty('attachments');
  });

  it('does not infer attachment semantics from a selected locator path', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-video');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-video',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend({
        messageText: '参考',
        displayMessageText: '参考',
        fileReferences: [
          {
            id: 'file-ref:cases/1080P.mp4',
            label: '1080P.mp4',
            contentLocator: { kind: 'workspace-file', path: 'cases/1080P.mp4' },
          },
        ],
      });
    });

    const updater = setMessages.mock.calls[0]?.[0] as (messages: unknown[]) => unknown[];
    expect(updater([])).toEqual([
      expect.objectContaining({
        contextReferences: [
          expect.objectContaining({
            label: '1080P.mp4',
            contentLocator: { kind: 'workspace-file', path: 'cases/1080P.mp4' },
          }),
        ],
      }),
    ]);
    expect(hostMocks.sendMessage.mock.calls[0]?.[0]).not.toHaveProperty('attachments');
  });

  it('notifies user message sent for externally triggered sends', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const setActiveTab = vi.fn();
    const onUserMessageSent = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-trigger');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'model-a',
        activeConversationId: 'conv-trigger',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab,
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        onUserMessageSent,
      });
    });

    act(() => {
      result.current.triggerSend('Use this selected clip');
    });

    expect(onUserMessageSent).toHaveBeenCalledWith({
      conversationId: 'conv-trigger',
      message: expect.objectContaining({
        role: 'user',
        content: 'Use this selected clip',
      }),
    });
    expect(setActiveTab).toHaveBeenCalledWith('chat');
    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-trigger',
        message: 'Use this selected clip',
      }),
    );
  });

  it('queues text sends while preserving the active streaming assistant message', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const clearInput = vi.fn();
    const setAttachedFiles = vi.fn();
    const onUserMessageSent = vi.fn();
    const streamingMessageIdRef = { current: 'assistant-streaming' };

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-queue');
      return useChatActions({
        inputValue: '继续这个方向',
        isThinking: true,
        selectedModel: 'model-a',
        activeConversationId: 'conv-queue',
        activeConversationIdRef,
        streamingMessageIdRef,
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput,
        setAttachedFiles,
        onUserMessageSent,
      });
    });

    act(() => {
      result.current.handleSend();
    });

    expect(setMessages).not.toHaveBeenCalled();
    expect(onUserMessageSent).toHaveBeenCalledWith({
      conversationId: 'conv-queue',
      message: expect.objectContaining({
        role: 'user',
        content: '继续这个方向',
        isQueued: true,
      }),
    });
    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-queue',
        message: '继续这个方向',
        sessionMode: 'agent',
      }),
    );
    expect(setStreamingMessageId).not.toHaveBeenCalled();
    expect(streamingMessageIdRef.current).toBe('assistant-streaming');
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(clearInput).toHaveBeenCalledTimes(1);
    expect(setAttachedFiles).toHaveBeenCalledWith([]);
  });

  it('queues rich sends without dropping their attachments while the Agent turn is running', () => {
    const setMessages = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-queue');
      return useChatActions({
        inputValue: '参考素材继续',
        isThinking: true,
        selectedModel: 'model-a',
        activeConversationId: 'conv-queue',
        activeConversationIdRef,
        streamingMessageIdRef: { current: 'assistant-streaming' },
        messages: [],
        setMessages,
        setIsThinking: vi.fn(),
        setStreamingMessageId: vi.fn(),
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSend({
        messageText: '参考素材继续',
        attachments: [{ id: 'file-1', name: 'ref.png', type: 'image' }],
      });
    });

    expect(hostMocks.sendMessage).toHaveBeenCalledWith({
      conversationId: 'conv-queue',
      message: '参考素材继续',
      sessionMode: 'agent',
      attachments: [{ id: 'file-1', name: 'ref.png', type: 'image' }],
    });
    expect(setMessages).not.toHaveBeenCalled();
  });

  it('queues externally triggered text sends without resetting the current stream', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();
    const setActiveTab = vi.fn();
    const onUserMessageSent = vi.fn();
    const streamingMessageIdRef = { current: 'assistant-streaming' };

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-trigger-queue');
      return useChatActions({
        inputValue: '',
        isThinking: true,
        selectedModel: 'model-a',
        activeConversationId: 'conv-trigger-queue',
        activeConversationIdRef,
        streamingMessageIdRef,
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab,
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
        onUserMessageSent,
      });
    });

    act(() => {
      result.current.triggerSend('Continue from selection');
    });

    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-trigger-queue',
        message: 'Continue from selection',
      }),
    );
    expect(setMessages).not.toHaveBeenCalled();
    expect(onUserMessageSent).toHaveBeenCalledWith({
      conversationId: 'conv-trigger-queue',
      message: expect.objectContaining({
        role: 'user',
        content: 'Continue from selection',
        isQueued: true,
      }),
    });
    expect(setStreamingMessageId).not.toHaveBeenCalled();
    expect(streamingMessageIdRef.current).toBe('assistant-streaming');
    expect(setIsThinking).not.toHaveBeenCalled();
    expect(setActiveTab).toHaveBeenCalledWith('chat');
  });

  it('resolves triggerSend chat models from model options', () => {
    const setMessages = vi.fn();
    const setIsThinking = vi.fn();
    const setStreamingMessageId = vi.fn();

    const { result } = renderHook(() => {
      const activeConversationIdRef = useRef<string | null>('conv-trigger-model');
      return useChatActions({
        inputValue: '',
        isThinking: false,
        selectedModel: 'deepseek-pro',
        availableModels: [
          {
            id: 'deepseek-pro',
            label: 'DeepSeek V4 Pro',
            providerId: 'deepseek-chat',
            modelId: 'deepseek-pro',
            category: 'llm',
          },
        ],
        activeConversationId: 'conv-trigger-model',
        activeConversationIdRef,
        streamingMessageIdRef: { current: null },
        messages: [],
        setMessages,
        setIsThinking,
        setStreamingMessageId,
        setActiveTab: vi.fn(),
        clearInput: vi.fn(),
        setAttachedFiles: vi.fn(),
      });
    });

    act(() => {
      result.current.triggerSend('Use this selected clip');
    });

    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-trigger-model',
        message: 'Use this selected clip',
        chatModel: {
          providerId: 'deepseek-chat',
          modelId: 'deepseek-pro',
          category: 'llm',
        },
      }),
    );
  });
});
