import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentContextPayload } from '@neko/shared';
import type {
  AgentQueuedMessageItem,
  AgentState,
  AgentWorkItem,
  ConversationSummary,
  Message,
  SettingsState,
} from '@neko-agent/types';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import {
  createAgentMarkdownSessionKey,
  getAgentMarkdownSessionRegistry,
} from '@/markdown/agent-markdown-session-registry';
import { ConversationRenderCoordinator } from '@/render-lifecycle/conversation-render-coordinator';
import type { TabRenderStore } from '@/render-runtime/tab-render-runtime';
import { useTabRenderStore } from '@/render-runtime/useTabRenderStore';
import { ConversationController } from './ConversationController';

const vscodeMocks = vi.hoisted(() => ({
  getConversations: vi.fn(),
  getActiveConversation: vi.fn(),
  refreshConfigSnapshot: vi.fn(),
  getAgentStates: vi.fn(),
  getSkills: vi.fn(),
  getTabState: vi.fn(),
  updateTabState: vi.fn(),
  newConversation: vi.fn(),
  activateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  searchProjectFiles: vi.fn(),
  getSettings: vi.fn(),
  getConversationSnapshot: vi.fn(),
  getContextTokenCount: vi.fn(),
  getTasks: vi.fn(),
  getMessageQueue: vi.fn(),
}));

vi.mock('@/messages', () => ({
  AgentHostMessages: vscodeMocks,
  VSCodeMessages: vscodeMocks,
  getAgentHostRuntimeAdapter: () => ({
    getState: () => undefined,
    setState: vi.fn(),
  }),
}));

vi.mock('@/host-runtime-context', () => ({
  useAgentHostRuntimeAdapter: () => ({
    hostKind: 'vscode',
    runtimeId: 'conversation-controller-test',
    send: vi.fn(),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    getState: () => undefined,
    setState: vi.fn(),
  }),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    locale: 'en',
    t: (key: string) =>
      ({
        'chat.emptyState.title': 'OpenNeko Creative Assistant',
        'chat.emptyState.description': 'Create stories, characters, scenes, and materials.',
        'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
        'chat.emptyState.entry.startChat': 'Start Chat',
        'chat.emptyState.entry.generateAssets': 'Generate Assets',
        'chat.emptyState.entry.roleplay': 'Roleplay',
        'chat.emptyState.entry.startChatHelper': 'Chat helper',
        'chat.emptyState.entry.generateAssetsHelper': 'Asset helper',
        'chat.emptyState.entry.roleplayHelper': 'Roleplay helper',
        'chat.input.placeholder': 'Type anything...',
        'chat.input.thinkingPlaceholder': 'Type next message...',
        'chat.input.queuePlaceholder': '{count} queued...',
        'chat.input.attach': 'Attach',
        'chat.input.commands': 'Commands',
        'chat.input.send': 'Send',
        'chat.input.queue': 'Queue',
        'chat.input.control.mode': 'Mode and model',
        'chat.input.control.params': 'Tool parameters',
        'chat.autoMode': 'Auto',
        'chat.selectModel': 'Select model',
        'chat.noModelsAvailable': 'No available models',
        'chat.sessionMode.sections.agent': 'Direct Agent Collaboration',
        'chat.sessionMode.sections.media': 'Media Generation',
        'chat.sessionMode.agent': 'Creative Collaboration',
        'chat.sessionMode.agentDesc': 'Refine ideas.',
        'chat.sessionMode.short.agent': 'Agent',
        'chat.sessionMode.summary.agent': 'Refine ideas.',
        'chat.sessionMode.image': 'Image Generation',
        'chat.sessionMode.imageDesc': 'Create images.',
        'chat.sessionMode.short.image': 'Image',
        'chat.sessionMode.summary.image': 'Create images.',
        'chat.sessionMode.video': 'Video Generation',
        'chat.sessionMode.videoDesc': 'Create videos.',
        'chat.sessionMode.short.video': 'Video',
        'chat.sessionMode.summary.video': 'Create videos.',
        'chat.sessionMode.audio': 'Sound Generation',
        'chat.sessionMode.audioDesc': 'Create sounds.',
        'chat.sessionMode.short.audio': 'Audio',
        'chat.sessionMode.summary.audio': 'Create sounds.',
        'chat.sessionMode.badge.agent': 'Chat',
        'chat.sessionMode.badge.image': 'Image',
        'chat.sessionMode.badge.video': 'Video',
        'chat.sessionMode.badge.audio': 'Sound',
        'chat.generation.category.image': 'Image',
        'chat.generation.category.video': 'Video',
        'chat.generation.category.audio': 'Audio',
        'chat.generation.model.none': 'Do not use',
        'chat.generation.model.noneShort': 'none',
        'chat.generation.model.select': 'Select {category} model',
        'chat.generation.model.unconfigured': 'No {category} model',
        'chat.generation.param.ratio': 'Ratio',
        'chat.generation.param.resolution': 'Resolution',
      })[key] ?? key,
  }),
}));

vi.mock('@/components/ChatWorkspace', () => ({
  ChatWorkspace: (props: {
    tabRenderStore: TabRenderStore;
    messages?: Message[];
    settings?: SettingsState;
    setMessages?: (value: Message[] | ((current: Message[]) => Message[])) => void;
    isThinking?: boolean;
    streamingMessageId?: string | null;
    agentState?: AgentState | null;
    foregroundConversationAvailability?: {
      kind: 'ready' | 'loading' | 'unavailable';
      diagnostic?: string;
    };
    queuedMessages?: readonly AgentQueuedMessageItem[];
    activationProgress?: readonly ActivationProgressTimeline[];
    activeSkill?: { skillName: string } | null;
    contextTokenCount?: number;
    workItems?: readonly AgentWorkItem[];
    handleMessage?: (event: MessageEvent) => void;
    pendingSendRequest?: {
      id: number;
      input: { messageText?: string; contextPayloads?: AgentContextPayload[] };
    } | null;
    initialInputRequest?: { id: number; messageText: string } | null;
    initialEntryPromptMenuRequest?: { id: number; menu: 'generate-assets' | 'roleplay' } | null;
    onInitialEntryPromptMenuRequestConsumed?: (id: number) => void;
    isVisible?: boolean;
  }) => {
    const tabRenderSnapshot = useTabRenderStore(props.tabRenderStore);
    const [instanceId] = useState(() => crypto.randomUUID());
    const [localRevision, setLocalRevision] = useState(0);
    const isVisible = props.isVisible ?? true;
    const testId = (name: string) =>
      isVisible ? name : `${name}-${tabRenderSnapshot.snapshot.tabId}`;

    const handleMessage = props.handleMessage;
    useEffect(() => {
      if (!handleMessage || !isVisible) return;
      const listener = (event: MessageEvent) => handleMessage(event);
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    }, [handleMessage, isVisible]);

    return (
      <div
        data-testid={`workspace-runtime-${tabRenderSnapshot.snapshot.tabId}`}
        data-instance-id={instanceId}
        data-visible={String(isVisible)}
      >
        {isVisible ? <span data-testid="chat-workspace" /> : null}
        <span data-testid={testId('workspace-local-state')}>{localRevision}</span>
        <button
          type="button"
          data-testid={testId('increment-workspace-local-state')}
          onClick={() => setLocalRevision((current) => current + 1)}
        />
        <span data-testid={testId('workspace-conversation')}>
          {tabRenderSnapshot.snapshot.conversationId}
        </span>
        <span data-testid={testId('workspace-selected-model')}>
          {tabRenderSnapshot.snapshot.state.selectedModel}
        </span>
        <span data-testid={testId('workspace-execution-mode')}>
          {tabRenderSnapshot.snapshot.state.executionMode}
        </span>
        <span data-testid={testId('workspace-media-models')}>
          {Object.values(tabRenderSnapshot.snapshot.state.mediaModelSelection).join('|')}
        </span>
        <span data-testid={testId('workspace-model-options')}>
          {props.settings?.chatModelOptions.map((option) => option.id).join('|') ?? ''}
        </span>
        <span data-testid={testId('workspace-diagnostics')}>
          {tabRenderSnapshot.snapshot.state.diagnostics
            .map((diagnostic) => diagnostic.message)
            .join('|')}
        </span>
        <span data-testid={testId('workspace-queued-edit')}>
          {tabRenderSnapshot.snapshot.state.queuedEdit?.item.content ?? ''}
        </span>
        <span data-testid={testId('workspace-tab-conversation')}>
          {tabRenderSnapshot.snapshot.conversationId}
        </span>
        <span data-testid={testId('workspace-messages')}>
          {props.messages?.map((message) => message.content).join('|') ?? ''}
        </span>
        <button
          type="button"
          data-testid={testId('append-workspace-message')}
          onClick={() =>
            props.setMessages?.((current) => [
              ...current,
              {
                id: `local-${tabRenderSnapshot.snapshot.tabId}`,
                role: 'assistant',
                content: `local ${tabRenderSnapshot.snapshot.conversationId}`,
                timestamp: 1,
              },
            ])
          }
        />
        <span data-testid={testId('workspace-streaming-flags')}>
          {props.messages
            ?.map((message) => {
              const textBlock = message.contentBlocks?.find((block) => block.type === 'text');
              return `${message.isStreaming === true}:${textBlock?.type === 'text' && textBlock.isStreaming === true}`;
            })
            .join('|') ?? ''}
        </span>
        <span data-testid={testId('workspace-switching')}>idle</span>
        <span data-testid={testId('workspace-availability')}>
          {props.foregroundConversationAvailability?.kind ?? 'ready'}
          {props.foregroundConversationAvailability?.diagnostic
            ? `:${props.foregroundConversationAvailability.diagnostic}`
            : ''}
        </span>
        <span data-testid={testId('workspace-composer-mode')}>
          {props.isThinking || props.streamingMessageId ? 'queue-enabled' : 'send-enabled'}
        </span>
        <span data-testid={testId('workspace-agent-state')}>
          {props.agentState
            ? `${props.agentState.phase}:${props.agentState.startedAt}:${props.agentState.toolName ?? 'none'}`
            : 'none'}
        </span>
        <span data-testid={testId('workspace-activation-progress')}>
          {props.activationProgress?.map((timeline) => timeline.name).join(',') ?? 'none'}
        </span>
        <span data-testid={testId('workspace-queued-messages')}>
          {props.queuedMessages?.map((item) => item.content).join('|') ?? ''}
        </span>
        <span data-testid={testId('workspace-active-skill')}>
          {props.activeSkill?.skillName ?? 'none'}
        </span>
        <span data-testid={testId('workspace-context-chips')}>
          {tabRenderSnapshot.snapshot.state.contextReferences.map((chip) => chip.label).join('|')}
        </span>
        <span data-testid={testId('workspace-input')}>
          {tabRenderSnapshot.snapshot.state.inputValue}
        </span>
        <span data-testid={testId('workspace-token-count')}>{props.contextTokenCount ?? 0}</span>
        <span data-testid={testId('workspace-work-items')}>
          {props.workItems?.map((item) => item.title).join('|') ?? ''}
        </span>
        <span data-testid={testId('workspace-viewport')}>
          {tabRenderSnapshot.snapshot.state.viewport.followMode}:
          {tabRenderSnapshot.snapshot.state.viewport.anchorMessageId ?? 'none'}:
          {tabRenderSnapshot.snapshot.state.viewport.anchorOffset ?? 0}
        </span>
        <button
          type="button"
          data-testid={testId('detach-viewport')}
          onClick={() =>
            tabRenderSnapshot.updateState({
              viewport: {
                followMode: 'detached',
                anchorMessageId: `anchor-${tabRenderSnapshot.snapshot.tabId}`,
                anchorOffset: 25,
              },
            })
          }
        />
        <button
          type="button"
          data-testid={testId('add-context-chip')}
          onClick={() =>
            tabRenderSnapshot.updateState((state) => ({
              contextReferences: [...state.contextReferences, contextPayload('ctx-a', 'A context')],
            }))
          }
        />
        <span data-testid={testId('entry-menu')}>
          {props.initialEntryPromptMenuRequest?.menu ?? 'none'}
        </span>
        <span data-testid={testId('pending-send')}>
          {props.pendingSendRequest?.input.messageText ?? 'none'}
        </span>
        <span data-testid={testId('pending-send-context')}>
          {props.pendingSendRequest?.input.contextPayloads
            ?.map((payload) => payload.label)
            .join('|') ?? 'none'}
        </span>
        <span data-testid={testId('initial-input')}>
          {props.initialInputRequest?.messageText ?? 'none'}
        </span>
      </div>
    );
  },
}));

vi.mock('@/components/ChatView/InputArea', async () => {
  const { useInputAreaContext } = await vi.importActual<
    typeof import('@/components/ChatView/InputAreaContext')
  >('@/components/ChatView/InputAreaContext');
  return {
    InputArea: (props: {
      inputValue: string;
      onInputChange: (value: string) => void;
      onSend: () => void;
      disabled?: boolean;
      entryPromptMenu?: 'generate-assets' | 'roleplay' | null;
    }) => {
      const {
        isBusy,
        modelCatalogStatus,
        onRequestFiles,
        selectedModel,
        mediaModelSelection,
        contextChips,
        onAddContextChip,
        onRemoveContextChip,
      } = useInputAreaContext();
      return (
        <div>
          <span data-testid="entry-selected-model">{selectedModel}</span>
          <span data-testid="entry-config-state">{`${modelCatalogStatus}:${String(isBusy)}`}</span>
          <span data-testid="entry-media-models">
            {Object.values(mediaModelSelection).join('|')}
          </span>
          <input
            placeholder="Type anything..."
            value={props.inputValue}
            disabled={props.disabled}
            onChange={(event) => {
              const value = event.currentTarget.value;
              props.onInputChange(value);
              if (value.startsWith('@')) {
                onRequestFiles?.(value.slice(1));
              }
            }}
          />
          <button type="button" disabled={props.disabled} onClick={() => props.onSend()}>
            Send
          </button>
          <button
            type="button"
            onClick={() =>
              onAddContextChip?.({
                type: 'entity',
                id: 'entity:character:xiaoju',
                label: '小橘',
                summary: 'Entity · character',
                data: { entityId: 'xiaoju', entityKind: 'character' },
              })
            }
          >
            Select Entity Mention
          </button>
          <button type="button" onClick={() => onRemoveContextChip('entity:character:xiaoju')}>
            Remove Entity Mention
          </button>
          <span data-testid="entry-context-chips">
            {contextChips.map((payload) => payload.label).join('|')}
          </span>
          <span data-testid="entry-page-menu">{props.entryPromptMenu ?? 'none'}</span>
        </div>
      );
    },
  };
});

describe('ConversationController entry state', () => {
  it('keeps the tabless composer pending until the global config snapshot arrives', () => {
    render(<ConversationController {...createProps({ hasConfigSnapshot: false })} />);

    expect(screen.getByTestId('entry-config-state').textContent).toBe('loading:true');
    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true);
  });

  it('hydrates the tabless composer from global config defaults', () => {
    render(
      <ConversationController
        {...createProps({
          settings: {
            ...createSettings(),
            selectedProviderId: 'nekoapi-chat',
            selectedModelId: 'gpt-5.5',
            chatModelOptions: [
              {
                id: 'nekoapi-chat:gpt-5.5',
                label: 'GPT 5.5',
                providerId: 'nekoapi-chat',
                modelId: 'gpt-5.5',
                category: 'llm',
              },
              {
                id: 'nekoapi-media:gpt-image-2',
                label: 'GPT Image 2',
                providerId: 'nekoapi-media',
                modelId: 'gpt-image-2',
                category: 'image',
              },
            ],
            defaultMediaModels: { image: 'nekoapi-media:gpt-image-2' },
          },
        })}
      />,
    );

    expect(screen.getByTestId('entry-selected-model').textContent).toBe('nekoapi-chat:gpt-5.5');
    expect(screen.getByTestId('entry-media-models').textContent).toBe(
      'nekoapi-media:gpt-image-2|none|none',
    );
  });

  it('shows entry content only when no tabs are open and opens asset prompts from the entry button', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    expect(screen.getByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeTruthy();
    expect(screen.queryByTestId('chat-workspace')).toBeNull();
    expect(vscodeMocks.getTabState).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Generate Assets/ }));
    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.queryByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeNull();
    expect(screen.getByTestId('entry-menu').textContent).toBe('generate-assets');
  });

  it('opens a new chat tab from the start chat entry button', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Start Chat/ }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.queryByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeNull();
    expect(screen.getByTestId('entry-menu').textContent).toBe('none');
    expect(screen.getByTestId('pending-send').textContent).toBe('none');
    expect(screen.getByTestId('initial-input').textContent).toBe('none');
    expect(vscodeMocks.getSettings).toHaveBeenCalledWith('conv-new');
  });

  it('opens roleplay prompts from the entry button', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Roleplay/ }));

    expect(vscodeMocks.newConversation).not.toHaveBeenCalled();
    expect(vscodeMocks.searchProjectFiles).toHaveBeenCalledWith('', undefined, {
      purpose: 'roleplay',
    });
    expect(screen.getByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeTruthy();
    expect(screen.getByTestId('entry-page-menu').textContent).toBe('roleplay');
  });

  it('disables entry controls while the new tab is being activated', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Generate Assets/ }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Generate Assets/ }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByPlaceholderText('Type anything...').hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Roleplay/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);
  });

  it('starts a new tab and sends entry text in chat mode', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.change(screen.getByPlaceholderText('Type anything...'), {
      target: { value: 'develop the city mood' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.getByTestId('pending-send').textContent).toBe('develop the city mood');
    expect(screen.getByTestId('initial-input').textContent).toBe('none');
  });

  it('runs entry-page mention search without opening a chat tab', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.change(screen.getByPlaceholderText('Type anything...'), {
      target: { value: '@hero' },
    });

    expect(vscodeMocks.newConversation).not.toHaveBeenCalled();
    expect(vscodeMocks.searchProjectFiles).toHaveBeenCalledWith('hero', undefined, {
      purpose: 'entry',
    });
    expect(screen.getByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.getByTestId('pending-send').textContent).toBe('@hero');
    expect(screen.getByTestId('initial-input').textContent).toBe('none');
  });

  it('attaches a selected Entity mention in the tabless composer and carries it into send', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Entity Mention' }));

    expect(screen.getByTestId('entry-context-chips').textContent).toBe('小橘');

    fireEvent.change(screen.getByPlaceholderText('Type anything...'), {
      target: { value: 'continue with this character' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.getByTestId('pending-send-context').textContent).toBe('小橘');
  });

  it('returns to the entry page after closing the last tab and keeps entry mention search tabless', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Start Chat/ }));
    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'Draft Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.queryByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeNull();
    expect(screen.getByTestId('chat-workspace')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close Draft Chat' }));

    expect(screen.getByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeTruthy();
    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText('Type anything...'), {
      target: { value: '@hero' },
    });

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.searchProjectFiles).toHaveBeenCalledWith('hero', undefined, {
      purpose: 'entry',
    });
  });

  it('starts a new tab with asset prompt and preserves existing entry text as initial input', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.change(screen.getByPlaceholderText('Type anything...'), {
      target: { value: 'make a rain scene' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Generate Assets/ }));

    expect(vscodeMocks.newConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-new', title: 'New Chat', messages: [] },
          },
        }),
      );
    });

    expect(screen.getByTestId('entry-menu').textContent).toBe('generate-assets');
    expect(screen.getByTestId('initial-input').textContent).toBe('make a rain scene');
    expect(screen.getByTestId('pending-send').textContent).toBe('none');
  });

  it('does not project activation progress from a different conversation into the active tab', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Start Chat/ }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-a', title: 'Skill chat', messages: [] },
          },
        }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'agentCapabilityActivationProgress',
            conversationId: 'conv-a',
            events: [createActivationEvent('conv-a', 'image')],
          },
        }),
      );
    });
    expect(screen.getByTestId('workspace-activation-progress').textContent).toBe('image');
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Skill chat', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Clean chat', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-b',
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-activation-progress').textContent).toBe('');
  });

  it('projects session UI state from the visible conversation instead of stale conversation events', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps({
          history: [
            { id: 'conv-a', title: 'Storyboard A', messageCount: 1, updatedAt: 2 },
            { id: 'conv-b', title: 'Storyboard B', messageCount: 1, updatedAt: 1 },
          ],
          workItemsByConversation: new Map([
            ['conv-a', new Map([['work-a', createWorkItem('conv-a', 'A render task')]])],
          ]),
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Storyboard A' }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'messageQueueSnapshot',
            snapshot: {
              conversationId: 'conv-a',
              items: [queuedMessage('conv-a', 'queued for A')],
              pendingCount: 1,
              version: 1,
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'skillInjection',
            conversationId: 'conv-a',
            skillName: 'storyboard',
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'agentCapabilityActivationProgress',
            conversationId: 'conv-a',
            events: [createActivationEvent('conv-a', 'storyboard')],
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'contextTokenCount',
            conversationId: 'conv-a',
            tokenCount: 42,
          },
        }),
      );
    });
    fireEvent.click(screen.getByTestId('add-context-chip'));

    expect(screen.getByTestId('workspace-queued-messages').textContent).toBe('queued for A');
    expect(screen.getByTestId('workspace-active-skill').textContent).toBe('none');
    expect(screen.getByTestId('workspace-activation-progress').textContent).toBe('storyboard');
    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('A context');
    expect(screen.getByTestId('workspace-token-count').textContent).toBe('42');
    expect(screen.getByTestId('workspace-work-items').textContent).toBe('A render task');

    fireEvent.click(screen.getByRole('button', { name: 'Open Storyboard B' }));

    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-queued-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-active-skill').textContent).toBe('none');
    expect(screen.getByTestId('workspace-activation-progress').textContent).toBe('');
    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('');
    expect(screen.getByTestId('workspace-token-count').textContent).toBe('0');
    expect(screen.getByTestId('workspace-work-items').textContent).toBe('');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'messageQueueSnapshot',
            snapshot: {
              conversationId: 'conv-a',
              items: [queuedMessage('conv-a', 'late queued for A')],
              pendingCount: 1,
              version: 2,
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'skillInjection',
            conversationId: 'conv-a',
            skillName: 'late-storyboard',
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'agentCapabilityActivationProgress',
            conversationId: 'conv-a',
            events: [createActivationEvent('conv-a', 'late-storyboard')],
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'contextTokenCount',
            conversationId: 'conv-a',
            tokenCount: 99,
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-queued-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-active-skill').textContent).toBe('none');
    expect(screen.getByTestId('workspace-activation-progress').textContent).toBe('');
    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('');
    expect(screen.getByTestId('workspace-token-count').textContent).toBe('0');
    expect(screen.getByTestId('workspace-work-items').textContent).toBe('');
  });

  it('keeps Tab activation out of the conversation render coordinator', () => {
    vi.clearAllMocks();
    expect('prepareActivation' in ConversationRenderCoordinator.prototype).toBe(false);
    render(<ConversationController {...createProps()} />);

    const openTabs = [
      { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      {
        id: 'tab-role',
        title: 'Role C',
        conversationId: 'conv-role',
        kind: 'character-dialogue' as const,
      },
    ];
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: { openTabs, activeTabId: 'tab-b' },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-b', title: 'Chat B', messages: [] },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: { openTabs, activeTabId: 'tab-a' },
          },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch Role C' }));

    expect('prepareActivation' in ConversationRenderCoordinator.prototype).toBe(false);
  });

  it('retains independent keyed workspace instances for different conversations while switching visibility', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    const workspaceA = screen.getByTestId('workspace-runtime-tab-a');
    const workspaceB = screen.getByTestId('workspace-runtime-tab-b');
    const instanceA = workspaceA.getAttribute('data-instance-id');
    const instanceB = workspaceB.getAttribute('data-instance-id');
    expect(instanceA).not.toBe(instanceB);
    expect(workspaceA.getAttribute('data-visible')).toBe('true');
    expect(workspaceB.getAttribute('data-visible')).toBe('false');
    fireEvent.click(screen.getByTestId('increment-workspace-local-state'));
    expect(screen.getByTestId('workspace-local-state').textContent).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat B' }));

    expect(screen.getByTestId('workspace-local-state').textContent).toBe('0');
    expect(screen.getByTestId('workspace-runtime-tab-a')).toBe(workspaceA);
    expect(screen.getByTestId('workspace-runtime-tab-b')).toBe(workspaceB);
    expect(workspaceA.getAttribute('data-instance-id')).toBe(instanceA);
    expect(workspaceB.getAttribute('data-instance-id')).toBe(instanceB);
    expect(workspaceA.getAttribute('data-visible')).toBe('false');
    expect(workspaceB.getAttribute('data-visible')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A' }));
    expect(screen.getByTestId('workspace-local-state').textContent).toBe('1');
  });

  it('bounds clean inactive workspace trees and remounts from the retained Tab store', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = Array.from({ length: 6 }, (_, index) => ({
      id: `tab-${index + 1}`,
      title: `Chat ${index + 1}`,
      conversationId: `conv-${index + 1}`,
    }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-6' } },
        }),
      );
    });

    expect(screen.queryByTestId('workspace-runtime-tab-1')).toBeNull();
    expect(screen.getByTestId('workspace-runtime-tab-6').getAttribute('data-visible')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat 1' }));

    const remountedTabOne = screen.getByTestId('workspace-runtime-tab-1');
    expect(remountedTabOne.getAttribute('data-visible')).toBe('true');
    expect(screen.queryByTestId('workspace-runtime-tab-2')).toBeNull();
    expect(screen.getByTestId('workspace-runtime-tab-6')).toBeTruthy();
  });

  it('keeps an inactive dirty-input Tab tree outside the clean retention budget', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = Array.from({ length: 6 }, (_, index) => ({
      id: `tab-${index + 1}`,
      title: `Chat ${index + 1}`,
      conversationId: `conv-${index + 1}`,
    }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-6' } },
        }),
      );
    });
    expect(screen.queryByTestId('workspace-runtime-tab-1')).toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'injectContext',
            tabId: 'tab-1',
            conversationId: 'conv-1',
            payload: contextPayload('ctx-tab-1', 'Retained Tab context'),
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-runtime-tab-1').getAttribute('data-visible')).toBe(
      'false',
    );
  });

  it('keeps a background running Tab tree outside the clean retention budget', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = Array.from({ length: 6 }, (_, index) => ({
      id: `tab-${index + 1}`,
      title: `Chat ${index + 1}`,
      conversationId: `conv-${index + 1}`,
    }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-6' } },
        }),
      );
    });
    expect(screen.queryByTestId('workspace-runtime-tab-1')).toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'agentStateSnapshot',
            agentStates: [{ conversationId: 'conv-1', phase: 'streaming', startedAt: 10 }],
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-runtime-tab-1').getAttribute('data-visible')).toBe(
      'false',
    );
  });

  it('retains independent keyed workspace instances for two tabs bound to one conversation', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A1', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat A2', conversationId: 'conv-a' },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    const workspaceA = screen.getByTestId('workspace-runtime-tab-a');
    const workspaceB = screen.getByTestId('workspace-runtime-tab-b');
    const instanceA = workspaceA.getAttribute('data-instance-id');
    const instanceB = workspaceB.getAttribute('data-instance-id');
    expect(instanceA).not.toBe(instanceB);

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A2' }));

    expect(screen.getByTestId('workspace-runtime-tab-a')).toBe(workspaceA);
    expect(screen.getByTestId('workspace-runtime-tab-b')).toBe(workspaceB);
    expect(workspaceA.getAttribute('data-instance-id')).toBe(instanceA);
    expect(workspaceB.getAttribute('data-instance-id')).toBe(instanceB);
    expect(workspaceA.getAttribute('data-visible')).toBe('false');
    expect(workspaceB.getAttribute('data-visible')).toBe('true');
  });

  it('unmounts only the closed Tab workspace and retains the remaining instance', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    const workspaceB = screen.getByTestId('workspace-runtime-tab-b');
    const instanceB = workspaceB.getAttribute('data-instance-id');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat A' }));

    expect(screen.queryByTestId('workspace-runtime-tab-a')).toBeNull();
    expect(screen.getByTestId('workspace-runtime-tab-b')).toBe(workspaceB);
    expect(workspaceB.getAttribute('data-instance-id')).toBe(instanceB);
  });

  it('scopes retained Tab message mutations to the owning conversation', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-b',
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-messages').textContent).toBe('');
    fireEvent.click(screen.getByTestId('append-workspace-message-tab-a'));

    expect(screen.getByTestId('workspace-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-messages-tab-a').textContent).toBe('local conv-a');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A' }));

    expect(screen.getByTestId('workspace-messages').textContent).toBe('local conv-a');
    expect(screen.getByTestId('workspace-messages-tab-b').textContent).toBe('');
  });

  it('withholds cached non-Timeline Markdown when an ordinary Tab becomes visible', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: {
              id: 'conv-b',
              title: 'Chat B',
              messages: [streamingMessage('message-b', 'partial B')],
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat B' }));

    expect(screen.getByTestId('workspace-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-streaming-flags').textContent).toBe('');
  });

  it('switches running status and elapsed baseline with the active conversation snapshot', () => {
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-b',
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'agentPhase',
            conversationId: 'conv-a',
            phase: 'acting',
            toolName: 'ReadFile',
            timestamp: 1_000,
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-agent-state').textContent).toBe('none');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-agent-state').textContent).toBe('acting:1000:ReadFile');
  });

  it('disposes only the deleted background conversation render resources', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps({
          history: [
            { id: 'conv-a', title: 'Chat A', messageCount: 1, updatedAt: 2 },
            { id: 'conv-b', title: 'Chat B', messageCount: 1, updatedAt: 1 },
          ],
        })}
      />,
    );

    const registry = getAgentMarkdownSessionRegistry();
    registry
      .commitProjectionSnapshot(projectionSnapshot('conv-a', 'message-a', 'markdown A'))
      .publish();
    registry
      .commitProjectionSnapshot(projectionSnapshot('conv-b', 'message-b', 'markdown B'))
      .publish();
    const keyA = createAgentMarkdownSessionKey({
      conversationId: 'conv-a',
      messageId: 'message-a',
      itemId: 'text-1',
    });
    const keyB = createAgentMarkdownSessionKey({
      conversationId: 'conv-b',
      messageId: 'message-b',
      itemId: 'text-1',
    });
    expect(registry.getSnapshot(keyA)).toBeDefined();
    expect(registry.getSnapshot(keyB)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Chat A' }));

    expect(vscodeMocks.deleteConversation).toHaveBeenCalledWith('conv-a');
    expect(registry.getSnapshot(keyA)).toBeUndefined();
    expect(registry.getSnapshot(keyB)?.source).toBe('markdown B');
  });

  it('withholds cached non-Timeline Markdown when a character-role Tab becomes visible', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: {
              id: 'conv-role',
              title: 'Role B',
              messages: [streamingMessage('message-role', 'partial role')],
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                {
                  id: 'tab-role',
                  title: 'Role B',
                  conversationId: 'conv-role',
                  kind: 'character-dialogue',
                },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch Role B' }));

    expect(screen.getByTestId('workspace-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-streaming-flags').textContent).toBe('');
  });

  it('hydrates model and execution settings only into Tabs for the owning conversation', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = [
      { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
    ];

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-b' } },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'settingsData',
            conversationId: 'conv-a',
            selectedProviderId: 'provider-a',
            selectedModelId: 'model-a',
            executionMode: 'auto',
            chatModelOptions: [
              {
                id: 'provider-a:model-a',
                label: 'Model A',
                providerId: 'provider-a',
                modelId: 'model-a',
                category: 'llm',
              },
            ],
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'settingsData',
            conversationId: 'conv-b',
            selectedProviderId: 'provider-b',
            selectedModelId: 'model-b',
            executionMode: 'plan',
            chatModelOptions: [
              {
                id: 'provider-b:model-b',
                label: 'Model B',
                providerId: 'provider-b',
                modelId: 'model-b',
                category: 'llm',
              },
              {
                id: 'provider-b:image-b',
                label: 'Image B',
                providerId: 'provider-b',
                modelId: 'image-b',
                category: 'image',
              },
            ],
            defaultMediaModels: { image: 'provider-b:image-b' },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-selected-model').textContent).toBe('provider-b:model-b');
    expect(screen.getByTestId('workspace-execution-mode').textContent).toBe('plan');
    expect(screen.getByTestId('workspace-model-options').textContent).toBe(
      'provider-b:model-b|provider-b:image-b',
    );
    expect(screen.getByTestId('workspace-media-models').textContent).toBe(
      'provider-b:image-b|none|none',
    );
    expect(screen.getByTestId('workspace-selected-model-tab-a').textContent).toBe(
      'provider-a:model-a',
    );
    expect(screen.getByTestId('workspace-execution-mode-tab-a').textContent).toBe('auto');
    expect(screen.getByTestId('workspace-model-options-tab-a').textContent).toBe(
      'provider-a:model-a',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A' }));

    expect(screen.getByTestId('workspace-selected-model').textContent).toBe('provider-a:model-a');
    expect(screen.getByTestId('workspace-execution-mode').textContent).toBe('auto');
    expect(screen.getByTestId('workspace-model-options').textContent).toBe('provider-a:model-a');
    expect(screen.getByTestId('workspace-selected-model-tab-b').textContent).toBe(
      'provider-b:model-b',
    );
    expect(screen.getByTestId('workspace-execution-mode-tab-b').textContent).toBe('plan');
    expect(screen.getByTestId('workspace-model-options-tab-b').textContent).toBe(
      'provider-b:model-b|provider-b:image-b',
    );
  });

  it('routes diagnostics to every Tab store for the owning conversation only', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = [
      { id: 'tab-a-1', title: 'Chat A1', conversationId: 'conv-a' },
      { id: 'tab-a-2', title: 'Chat A2', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
    ];

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-b' } },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'sessionDiagnostic',
            code: 'conversation-durability-failed',
            severity: 'error',
            conversationId: 'conv-a',
            message: 'Conversation A only.',
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-diagnostics').textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A1' }));
    expect(screen.getByTestId('workspace-diagnostics').textContent).toContain(
      'Conversation A only.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A2' }));
    expect(screen.getByTestId('workspace-diagnostics').textContent).toContain(
      'Conversation A only.',
    );
  });

  it('routes injected context and intent to the exact Tab runtime', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = [
      { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-a' },
    ];

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-b' } },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'injectContext',
            tabId: 'tab-a',
            conversationId: 'conv-a',
            payload: {
              ...contextPayload('ctx-tab-a', 'Tab A context'),
              intent: 'Continue in Tab A',
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('');
    expect(screen.getByTestId('workspace-input').textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A' }));
    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('Tab A context');
    expect(screen.getByTestId('workspace-input').textContent).toBe('Continue in Tab A');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat B' }));
    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('');
    expect(screen.getByTestId('workspace-input').textContent).toBe('');
  });

  it('routes queued edit responses to the exact requesting Tab runtime', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = [
      { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-a' },
    ];

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-b' } },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'queuedMessageEditRequested',
            tabId: 'tab-a',
            conversationId: 'conv-a',
            item: {
              id: 'queue-a',
              conversationId: 'conv-a',
              content: 'Tab A queued edit',
              createdAt: 10,
              source: 'composer',
            },
            snapshot: {
              conversationId: 'conv-a',
              pendingCount: 0,
              version: 2,
              items: [],
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-queued-edit').textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A' }));
    expect(screen.getByTestId('workspace-queued-edit').textContent).toBe('Tab A queued edit');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat B' }));
    expect(screen.getByTestId('workspace-queued-edit').textContent).toBe('');
  });

  it('keeps activation rejection diagnostics scoped to the requested conversation', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps({
          history: [
            { id: 'conv-a', title: 'Conversation A', messageCount: 1, updatedAt: 2 },
            { id: 'conv-b', title: 'Conversation B', messageCount: 1, updatedAt: 1 },
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Conversation A' }));
    expect(screen.getByTestId('workspace-availability').textContent).toBe('loading');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'sessionDiagnostic',
            code: 'stale-tab-state-revision',
            severity: 'error',
            action: 'activate-conversation',
            conversationId: 'conv-a',
            message: 'Activation revision was stale.',
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-availability').textContent).toContain('unavailable');
    expect(screen.getByTestId('workspace-availability').textContent).toContain(
      'stale-tab-state-revision',
    );
    expect(screen.queryByText('全局错误')).toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'sessionDiagnostic',
            code: 'conversation-durability-failed',
            severity: 'error',
            conversationId: 'conv-b',
            message: 'Background persistence failed.',
          },
        }),
      );
    });

    expect(screen.queryByText('Background persistence failed.')).toBeNull();
  });

  it('does not display the previous conversation transcript after opening a history conversation', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps({
          history: [
            { id: 'conv-a', title: '分析前10页，生成分镜表', messageCount: 1, updatedAt: 2 },
            { id: 'conv-b', title: '生成猫猫玩耍的图片', messageCount: 1, updatedAt: 1 },
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open 分析前10页，生成分镜表' }));
    expect(vscodeMocks.activateConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-a' }),
    );
    const activationA = vscodeMocks.activateConversation.mock.calls.at(-1)?.[0] as {
      activationId: number;
      expectedTabStateRevision: number;
    };
    expect(screen.getByTestId('workspace-availability').textContent).toBe('loading');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            activation: {
              activationId: activationA.activationId,
              tabStateRevision: activationA.expectedTabStateRevision + 1,
            },
            conversation: {
              id: 'conv-a',
              title: '分析前10页，生成分镜表',
              messages: [message('message-a', '分析前10页，生成分镜表')],
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-conversation').textContent).toBe('conv-a');
    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-a');
    expect(screen.getByTestId('workspace-messages').textContent).toBe('分析前10页，生成分镜表');

    fireEvent.click(screen.getByRole('button', { name: 'Open 生成猫猫玩耍的图片' }));

    expect(vscodeMocks.activateConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-b' }),
    );
    const activationB = vscodeMocks.activateConversation.mock.calls.at(-1)?.[0] as {
      activationId: number;
      expectedTabStateRevision: number;
    };
    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-switching').textContent).toBe('idle');
    expect(screen.getByTestId('workspace-messages').textContent).toBe('');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            activation: {
              activationId: activationB.activationId,
              tabStateRevision: activationB.expectedTabStateRevision + 1,
            },
            conversation: {
              id: 'conv-b',
              title: '生成猫猫玩耍的图片',
              messages: [message('message-b', '生成猫猫玩耍的图片')],
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-switching').textContent).toBe('idle');
    expect(screen.getByTestId('workspace-messages').textContent).toBe('生成猫猫玩耍的图片');
  });

  it('caches every restored Tab snapshot across the tabless-to-tabs listener transition', () => {
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            revision: 1,
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-b',
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'conversationSnapshot',
            conversation: {
              id: 'conv-a',
              title: 'A',
              messages: [message('message-a', 'background A')],
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'conversationSnapshot',
            conversation: {
              id: 'conv-b',
              title: 'B',
              messages: [message('message-b', 'visible B')],
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-messages').textContent).toBe('visible B');
    expect(screen.getByTestId('workspace-messages-tab-a').textContent).toBe('background A');
  });
});

function createActivationEvent(conversationId: string, name: string) {
  return {
    id: `${conversationId}-event-1`,
    activationId: `${conversationId}-activation-1`,
    conversationId,
    target: 'skill',
    action: 'activate',
    name,
    step: 'active',
    status: 'succeeded',
    source: 'agent-tool',
    requestedBy: 'agent',
    at: 1,
  };
}

interface CreatePropsOptions {
  readonly history?: readonly ConversationSummary[];
  readonly workItemsByConversation?: Map<string, Map<string, AgentWorkItem>>;
  readonly settings?: SettingsState;
  readonly hasConfigSnapshot?: boolean;
}

function createProps(
  options: CreatePropsOptions = {},
): React.ComponentProps<typeof ConversationController> {
  return {
    settings: options.settings ?? createSettings(),
    hasConfigSnapshot: options.hasConfigSnapshot ?? true,
    setSettings: vi.fn(),
    setHasConfigSnapshot: vi.fn(),
    setProjectFiles: vi.fn(),
    mentionItems: [],
    setMentionItems: vi.fn(),
    mentionSearchFilter: '',
    setMentionSearchFilter: vi.fn(),
    pluginCommands: [],
    setPluginCommands: vi.fn(),
    updateSettings: vi.fn(),
    workItemsByConversation: options.workItemsByConversation ?? new Map(),
    setWorkItemsByConversation: vi.fn(),
    pluginsAvailable: {},
    setPluginsAvailable: vi.fn(),
    setShowOnboarding: vi.fn(),
    renderHeader: (props) => (
      <div data-testid="header">
        <button type="button" onClick={props.onNewChat}>
          New
        </button>
        {props.tabs.map((tab) => (
          <div key={tab.id}>
            <button type="button" onClick={() => props.onSwitchTab(tab.id)}>
              Switch {tab.title}
            </button>
            <button type="button" onClick={() => props.onCloseTab(tab.id)}>
              Close {tab.title}
            </button>
            <span data-testid={`tab-status-${tab.id}`}>{tab.displayStatus ?? 'none'}</span>
          </div>
        ))}
        {options.history?.map((conversation) => (
          <div key={conversation.id}>
            <button
              type="button"
              onClick={() => props.onOpenConversation(conversation.id, conversation.title)}
            >
              Open {conversation.title}
            </button>
            <button type="button" onClick={() => props.onDeleteConversation(conversation.id)}>
              Delete {conversation.title}
            </button>
          </div>
        ))}
        <span data-testid="tab-count">{props.tabs.length}</span>
      </div>
    ),
  };
}

function message(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    timestamp: 1,
  };
}

function projectionSnapshot(conversationId: string, messageId: string, content: string) {
  return {
    conversationId,
    projectionVersion: 1,
    turns: [
      {
        turnId: `turn-${conversationId}`,
        messageId,
        items: [
          {
            conversationId,
            turnId: `turn-${conversationId}`,
            messageId,
            itemId: 'text-1',
            sequence: 1,
            itemRevision: 1,
            kind: 'assistant_text' as const,
            status: 'streaming' as const,
            payload: { content, format: 'markdown' as const, sourceGeneration: 1 },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    ],
  };
}

function streamingMessage(id: string, content: string): Message {
  return {
    id,
    role: 'assistant',
    content,
    timestamp: 1,
    isStreaming: true,
    contentBlocks: [
      {
        id: `block-${id}`,
        type: 'text',
        timestamp: 1,
        content,
        isStreaming: true,
      },
    ],
  };
}

function queuedMessage(conversationId: string, content: string): AgentQueuedMessageItem {
  return {
    id: `${conversationId}-queued`,
    conversationId,
    content,
    createdAt: 1,
    source: 'composer',
  };
}

function contextPayload(id: string, label: string): AgentContextPayload {
  return {
    type: 'file',
    id,
    label,
    summary: label,
    data: { path: `${id}.md` },
  };
}

function createWorkItem(conversationId: string, title: string): AgentWorkItem {
  const childRunId = `${conversationId}-work`;
  return {
    scope: {
      conversationId,
      runId: `run:${conversationId}`,
      parentRunId: 'agent-main',
      childRunId,
      childKind: 'subagent',
    },
    id: childRunId,
    conversationId,
    kind: 'subagent',
    parentMessageId: null,
    parentToolCallId: null,
    title,
    status: 'processing',
    progress: 0.5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    subAgent: {
      parentAgentId: 'agent-main',
      runMode: 'background',
    },
  };
}

function createSettings(): SettingsState {
  return {
    providers: [],
    configuredProviders: [],
    selectedProviderId: 'test',
    selectedModelId: 'test-model',
    systemPrompt: '',
    autoExecuteTools: false,
    streamResponses: true,
    showToolCalls: true,
    temperature: 0.2,
    maxTokens: 8192,
    executionMode: 'ask',
    chatModelOptions: [
      {
        id: 'test-model',
        providerId: 'test',
        modelId: 'test-model',
        label: 'Test Model',
        category: 'llm',
      },
    ],
    modelGroups: [],
  };
}
