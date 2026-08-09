import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentContextPayload } from '@neko/agent-contracts';
import { type Message, type SettingsState } from '@neko/agent-contracts';
import type { ChatWorkspaceProps } from './ChatWorkspace';
import { ChatWorkspace } from './ChatWorkspace';
import type { ComposerMenuState } from './ChatView/InputArea/types';
import { createTabRenderRuntime } from '../render-runtime/tab-render-runtime';

const hostMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  refreshConfigSnapshot: vi.fn(),
  searchProjectFiles: vi.fn(),
  getContextTokenCount: vi.fn(),
  getMessageQueue: vi.fn(),
  clearHistory: vi.fn(),
  compressContext: vi.fn(),
  cancelMessage: vi.fn(),
  promoteQueuedMessage: vi.fn(),
  cancelQueuedMessage: vi.fn(),
  editQueuedMessage: vi.fn(),
  clearActiveSkill: vi.fn(),
}));

vi.mock('../host-runtime-context', () => ({
  useAgentHostMessages: () => hostMocks,
}));

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./ChatView/InputAreaContext', () => ({
  InputAreaProvider: (props: {
    children: ReactNode;
    sessionMode?: 'agent';
    onSessionModeChange?: (mode: 'agent') => void;
    mediaModelSelection?: { image: string; video: string; audio: string };
    onCompressContext?: () => Promise<void>;
    selectedModel?: string;
    onModelSelect?: (modelId: string) => void;
    contextChips?: readonly AgentContextPayload[];
    onAddContextChip?: (payload: AgentContextPayload) => void;
    onRemoveContextChip?: (id: string) => void;
  }) => (
    <div>
      <span data-testid="session-mode">{props.sessionMode ?? 'agent'}</span>
      <span data-testid="media-model-selection">
        {Object.values(props.mediaModelSelection ?? {}).join('|')}
      </span>
      <span data-testid="selected-model">{props.selectedModel ?? 'none'}</span>
      <span data-testid="context-chips">
        {props.contextChips?.map((chip) => chip.label).join('|') ?? ''}
      </span>
      <button
        type="button"
        data-testid="add-context-chip"
        onClick={() => props.onAddContextChip?.(contextPayload('ctx-a', 'Context A'))}
      />
      <button
        type="button"
        data-testid="remove-context-chip"
        onClick={() => props.onRemoveContextChip?.('ctx-a')}
      />
      <button
        type="button"
        data-testid="set-model-b"
        onClick={() => props.onModelSelect?.('model-b')}
      />
      <button
        type="button"
        data-testid="compress-context"
        onClick={() => void props.onCompressContext?.()}
      />
      {props.children}
    </div>
  ),
}));

vi.mock('./ChatView', () => ({
  ChatView: (props: {
    composerDisabled?: boolean;
    activeConversationId: string | null;
    inputValue: string;
    onInputChange: (value: string) => void;
    attachedFiles?: readonly unknown[];
    selectedFileReferences?: readonly unknown[];
    onSend: (input?: { messageText?: string; displayMessageText?: string }) => void;
    onClearActiveSkill?: (recordId?: string) => void;
    onCancelTask?: (taskId: string) => void;
    onRetryTask?: (taskId: string) => void;
    onViewTaskResult?: (taskId: string, resultRef?: string) => void;
    onPromoteQueuedMessage?: (queueItemId: string) => void;
    onCancelQueuedMessage?: (queueItemId: string) => void;
    onEditQueuedMessage?: (queueItemId: string) => void;
    entryPromptMenu?: 'roleplay' | null;
    onEntryPromptMenuChange?: (menu: 'roleplay' | null) => void;
    isComposing?: boolean;
    onCompositionChange?: (isComposing: boolean) => void;
    focusRequestOwner?: string;
    focusRequestTarget?: 'none' | 'input';
    focusRequestId?: string;
    viewport?: {
      followMode: 'follow-tail' | 'detached';
      anchorMessageId?: string;
      anchorOffset?: number;
    };
    onViewportChange?: (viewport: {
      followMode: 'follow-tail' | 'detached';
      anchorMessageId?: string;
      anchorOffset?: number;
    }) => void;
    composerMenuState?: ComposerMenuState;
    onComposerMenuStateChange?: (state: ComposerMenuState) => void;
    messages?: readonly Message[];
  }) => (
    <div>
      <button
        type="button"
        data-testid="set-draft"
        onClick={() => props.onInputChange('draft-a')}
      />
      <button
        type="button"
        data-testid="send"
        disabled={props.composerDisabled}
        onClick={() =>
          props.onSend({
            messageText: 'hello from tabless state',
            displayMessageText: 'hello from tabless state',
          })
        }
      >
        {props.activeConversationId ?? 'no-conversation'}
      </button>
      <button
        type="button"
        data-testid="entry-close"
        onClick={() => props.onEntryPromptMenuChange?.(null)}
      />
      <button
        type="button"
        data-testid="clear-active-skill"
        onClick={() => props.onClearActiveSkill?.('record-1')}
      />
      <button
        type="button"
        data-testid="promote-queued"
        onClick={() => props.onPromoteQueuedMessage?.('queued-1')}
      />
      <button
        type="button"
        data-testid="cancel-queued"
        onClick={() => props.onCancelQueuedMessage?.('queued-1')}
      />
      <button
        type="button"
        data-testid="edit-queued"
        onClick={() => props.onEditQueuedMessage?.('queued-1')}
      />
      <button
        type="button"
        data-testid="composition-start"
        onClick={() => props.onCompositionChange?.(true)}
      />
      <button
        type="button"
        data-testid="composition-end"
        onClick={() => props.onCompositionChange?.(false)}
      />
      <span data-testid="entry-menu">{props.entryPromptMenu ?? 'none'}</span>
      <span data-testid="input-value">{props.inputValue}</span>
      <span data-testid="composition-state">{String(props.isComposing ?? false)}</span>
      <span data-testid="focus-request">
        {props.focusRequestOwner ?? 'none'}:{props.focusRequestTarget ?? 'none'}:
        {props.focusRequestId ?? 'none'}
      </span>
      <span data-testid="viewport-state">
        {props.viewport?.followMode ?? 'none'}:{props.viewport?.anchorMessageId ?? 'none'}:
        {props.viewport?.anchorOffset ?? 0}
      </span>
      <span data-testid="composer-menu-state">
        {String(props.composerMenuState?.slash.open ?? false)}:
        {props.composerMenuState?.slash.filter ?? ''}:
        {props.composerMenuState?.slash.selectedIndex ?? 0}
      </span>
      <span data-testid="control-menu-state">
        {props.composerMenuState?.controls.openMenu ?? 'none'}:
        {props.composerMenuState?.controls.configCategory ?? 'llm'}
      </span>
      <span data-testid="visible-messages">
        {props.messages?.map((message) => `${message.role}:${message.content}`).join('|') ?? ''}
      </span>
      <button
        type="button"
        data-testid="open-slash-menu"
        onClick={() =>
          props.composerMenuState &&
          props.onComposerMenuStateChange?.({
            ...props.composerMenuState,
            slash: { open: true, filter: 'sto', selectedIndex: 2 },
          })
        }
      />
      <button
        type="button"
        data-testid="open-control-menu"
        onClick={() =>
          props.composerMenuState &&
          props.onComposerMenuStateChange?.({
            ...props.composerMenuState,
            controls: {
              openMenu: 'composer-config',
              configCategory: 'image',
              configSection: 'model',
            },
          })
        }
      />
      <button
        type="button"
        data-testid="detach-viewport"
        onClick={() =>
          props.onViewportChange?.({
            followMode: 'detached',
            anchorMessageId: `anchor-${props.focusRequestOwner ?? 'none'}`,
            anchorOffset: 25,
          })
        }
      />
      <span data-testid="attachment-count">{props.attachedFiles?.length ?? 0}</span>
      <span data-testid="reference-count">{props.selectedFileReferences?.length ?? 0}</span>
    </div>
  ),
}));

const keyboardMocks = vi.hoisted(() => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  COMMON_SHORTCUTS: {
    focusInput: (handler: () => void) => ({ id: 'focusInput', handler }),
    clearConversation: (handler: () => void) => ({ id: 'clearConversation', handler }),
    newConversation: (handler: () => void) => ({ id: 'newConversation', handler }),
    copyLastResponse: (handler: () => void) => ({ id: 'copyLastResponse', handler }),
    cancel: (handler: () => void) => ({ id: 'cancel', handler }),
  },
  useKeyboardShortcuts: keyboardMocks.useKeyboardShortcuts,
}));

vi.mock('../hooks/useSlashCommands', () => ({
  useSlashCommands: () => ({
    handleSlashCommand: vi.fn(),
  }),
}));

describe('ChatWorkspace pending send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replays a pending entry send through the newly bound Tab runtime', () => {
    const onPendingSendRequestConsumed = vi.fn();
    const runtime = createTabRenderRuntime({ tabId: 'tab-new', conversationId: 'conv-new' });

    const { rerender } = render(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtime.store,
          pendingSendRequest: {
            id: 1,
            input: {
              messageText: 'hello from tabless state',
              displayMessageText: 'hello from tabless state',
            },
          },
          onPendingSendRequestConsumed,
        })}
      />,
    );

    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
    expect(onPendingSendRequestConsumed).not.toHaveBeenCalled();
    expect(screen.getByTestId('visible-messages').textContent).toBe(
      'user:hello from tabless state',
    );

    act(() => {
      runtime.store.updateState({
        modelConfigurationInitialized: true,
        selectedModel: 'test-model',
      });
    });

    expect(hostMocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-new',
        message: 'hello from tabless state',
        sessionMode: 'agent',
      }),
    );
    expect(onPendingSendRequestConsumed).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('visible-messages').textContent).toBe(
      'user:hello from tabless state',
    );

    rerender(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtime.store,
          pendingSendRequest: {
            id: 1,
            input: {
              messageText: 'hello from tabless state',
              displayMessageText: 'hello from tabless state',
            },
          },
          onPendingSendRequestConsumed,
        })}
      />,
    );

    expect(hostMocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('projects hydrated Agent media defaults into the pending send turn policy', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-new', conversationId: 'conv-new' });
    const settings = createSettingsWithAgentMediaModels();

    render(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtime.store,
          settings,
          pendingSendRequest: {
            id: 2,
            input: {
              messageText: 'submit one detached image generation',
              displayMessageText: 'submit one detached image generation',
            },
          },
        })}
      />,
    );

    expect(hostMocks.sendMessage).not.toHaveBeenCalled();

    act(() => {
      runtime.store.updateState({
        modelConfigurationInitialized: true,
        selectedModel: 'test-model',
        mediaModelSelection: {
          image: 'image-provider:image-model',
          video: 'video-provider:video-model',
          audio: 'audio-provider:audio-model',
        },
      });
    });

    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-new',
        sessionMode: 'agent',
        purposeModels: {
          'image.generate': {
            providerId: 'image-provider',
            modelId: 'image-model',
            category: 'image',
          },
          'video.generate': {
            providerId: 'video-provider',
            modelId: 'video-model',
            category: 'video',
          },
          'audio.generate': {
            providerId: 'audio-provider',
            modelId: 'audio-model',
            category: 'audio',
          },
        },
      }),
    );
  });

  it('keeps running-turn queued sends out of transcript messages', () => {
    const setMessages = vi.fn();
    const onUserMessageSent = vi.fn();
    const { getByTestId } = render(
      <ChatWorkspace
        {...createProps({
          isThinking: true,
          setMessages,
          onUserMessageSent,
          streamingMessageIdRef: createRefWithCurrent<string | null>('assistant-streaming'),
        })}
      />,
    );

    fireEvent.click(getByTestId('send'));

    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        message: 'hello from tabless state',
      }),
    );
    expect(setMessages).not.toHaveBeenCalled();
    expect(onUserMessageSent).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      message: expect.objectContaining({
        role: 'user',
        content: 'hello from tabless state',
        isQueued: true,
      }),
    });
  });

  it('prefills entry text after a new conversation is activated', () => {
    const onInitialInputRequestConsumed = vi.fn();
    const onMentionSearchFilterChange = vi.fn();
    render(
      <ChatWorkspace
        {...createProps({
          initialInputRequest: { id: 3, messageText: '@hero' },
          onInitialInputRequestConsumed,
          onMentionSearchFilterChange,
        })}
      />,
    );

    expect(screen.getByTestId('input-value').textContent).toBe('@hero');
    expect(onMentionSearchFilterChange).toHaveBeenCalledWith('hero');
    expect(hostMocks.searchProjectFiles).toHaveBeenCalledWith('hero', 'conv-1');
    expect(onInitialInputRequestConsumed).toHaveBeenCalledWith(3);
  });

  it('restores a queued edit from its owning Tab store into an empty composer', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-1', conversationId: 'conv-1' });
    runtime.store.updateState({
      queuedEdit: {
        requestId: 7,
        item: {
          id: 'queued-1',
          conversationId: 'conv-1',
          content: '重新整理这条消息',
          createdAt: 1,
          source: 'composer',
        },
      },
    });

    render(<ChatWorkspace {...createProps({ tabRenderStore: runtime.store })} />);

    expect(screen.getByTestId('input-value').textContent).toBe('重新整理这条消息');
    expect(runtime.store.getSnapshot().state.queuedEdit).toBeNull();
  });

  it('keeps an existing draft and records a Tab-local diagnostic for queued edit conflict', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-1', conversationId: 'conv-1' });
    runtime.store.updateState({
      queuedEdit: {
        requestId: 7,
        item: {
          id: 'queued-1',
          conversationId: 'conv-1',
          content: '被移除的排队消息',
          createdAt: 1,
          source: 'composer',
        },
      },
    });

    render(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtime.store,
          initialInputRequest: { id: 1, messageText: '已有草稿' },
        })}
      />,
    );

    expect(screen.getByTestId('input-value').textContent).toBe('已有草稿');
    expect(runtime.store.getSnapshot().state.queuedEdit).toBeNull();
    expect(runtime.store.getSnapshot().state.diagnostics.at(-1)).toMatchObject({
      code: 'queued-edit-draft-conflict',
      conversationId: 'conv-1',
      tabId: 'tab-1',
    });
  });

  it('routes queued message controls through the Desktop host facade', () => {
    const { getByTestId } = render(<ChatWorkspace {...createProps()} />);

    fireEvent.click(getByTestId('promote-queued'));
    expect(hostMocks.promoteQueuedMessage).toHaveBeenCalledWith('conv-1', 'queued-1');
    fireEvent.click(getByTestId('cancel-queued'));
    expect(hostMocks.cancelQueuedMessage).toHaveBeenCalledWith('conv-1', 'queued-1');
    fireEvent.click(getByTestId('edit-queued'));
    expect(hostMocks.editQueuedMessage).toHaveBeenCalledWith('tab-1', 'conv-1', 'queued-1');
  });

  it('keeps model selection in its owning Tab store while switching', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });
    runtimeA.store.updateState({ selectedModel: 'model-a' });
    runtimeB.store.updateState({ selectedModel: 'test-model' });
    const onModelSelect = vi.fn();
    const { getByTestId, rerender } = render(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtimeA.store,
          onModelSelect,
        })}
      />,
    );

    expect(getByTestId('selected-model').textContent).toBe('model-a');
    fireEvent.click(getByTestId('set-model-b'));
    expect(runtimeA.store.getSnapshot().state.selectedModel).toBe('model-b');
    expect(onModelSelect).toHaveBeenCalledWith('model-b');

    rerender(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtimeB.store,
          onModelSelect,
        })}
      />,
    );

    expect(getByTestId('selected-model').textContent).toBe('test-model');
    expect(runtimeB.store.getSnapshot().state.selectedModel).toBe('test-model');
  });

  it('keeps composer menus in their owning Tab store while switching', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });
    const propsFor = (runtime: typeof runtimeA) =>
      createProps({
        tabRenderStore: runtime.store,
      });
    const { getByTestId, rerender } = render(<ChatWorkspace {...propsFor(runtimeA)} />);

    fireEvent.click(getByTestId('open-slash-menu'));
    fireEvent.click(getByTestId('open-control-menu'));
    expect(getByTestId('composer-menu-state').textContent).toBe('true:sto:2');
    expect(getByTestId('control-menu-state').textContent).toBe('composer-config:image');

    rerender(<ChatWorkspace {...propsFor(runtimeB)} />);
    expect(getByTestId('composer-menu-state').textContent).toBe('false::0');
    expect(getByTestId('control-menu-state').textContent).toBe('none:llm');

    rerender(<ChatWorkspace {...propsFor(runtimeA)} />);
    expect(getByTestId('composer-menu-state').textContent).toBe('true:sto:2');
    expect(getByTestId('control-menu-state').textContent).toBe('composer-config:image');
  });

  it('keeps context references in their owning Tab store while switching', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-a' });
    const { getByTestId, rerender } = render(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtimeA.store,
        })}
      />,
    );

    fireEvent.click(getByTestId('add-context-chip'));
    expect(getByTestId('context-chips').textContent).toBe('Context A');
    expect(runtimeA.store.getSnapshot().state.contextReferences).toHaveLength(1);

    rerender(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtimeB.store,
        })}
      />,
    );

    expect(getByTestId('context-chips').textContent).toBe('');
    expect(runtimeB.store.getSnapshot().state.contextReferences).toEqual([]);

    rerender(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtimeA.store,
        })}
      />,
    );
    fireEvent.click(getByTestId('remove-context-chip'));
    expect(runtimeA.store.getSnapshot().state.contextReferences).toEqual([]);
  });

  it('keeps composer state in its owning Tab store while switching', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });
    runtimeA.store.updateState({
      attachedFiles: [{ id: 'asset-a', name: 'a.png', type: 'image', preview: 'data-a' }],
      selectedFileReferences: [
        {
          id: 'file-a',
          contentLocator: { kind: 'workspace-file', path: 'a.md' },
          label: 'a.md',
        },
      ],
    });
    const { getByTestId, rerender } = render(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtimeA.store,
        })}
      />,
    );

    fireEvent.click(getByTestId('set-draft'));
    expect(getByTestId('input-value').textContent).toBe('draft-a');
    expect(getByTestId('attachment-count').textContent).toBe('1');
    expect(getByTestId('reference-count').textContent).toBe('1');

    rerender(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtimeB.store,
        })}
      />,
    );

    expect(getByTestId('input-value').textContent).toBe('');
    expect(getByTestId('attachment-count').textContent).toBe('0');
    expect(getByTestId('reference-count').textContent).toBe('0');
    expect(runtimeA.store.getSnapshot().state.inputValue).toBe('draft-a');
  });

  it('keeps every visible conversation on the canonical Agent mode', () => {
    const storeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' }).store;
    const storeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' }).store;
    const { getByTestId, rerender } = render(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: storeA,
          settings: createSettingsWithImageModel(),
        })}
      />,
    );

    expect(getByTestId('session-mode').textContent).toBe('agent');

    rerender(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: storeB,
          settings: createSettingsWithImageModel(),
        })}
      />,
    );

    expect(getByTestId('session-mode').textContent).toBe('agent');

    rerender(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: storeA,
          settings: createSettingsWithImageModel(),
        })}
      />,
    );

    expect(getByTestId('session-mode').textContent).toBe('agent');
  });

  it('keeps hidden Tab workspaces mounted but non-interactive', () => {
    const { getByTestId } = render(
      <ChatWorkspace
        {...createProps({
          isVisible: false,
        })}
      />,
    );

    const keyboardOptions = keyboardMocks.useKeyboardShortcuts.mock.calls.at(-1)?.[0] as
      { enabled?: boolean } | undefined;
    expect(keyboardOptions?.enabled).toBe(false);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'injectContext', conversationId: 'conv-1' },
        }),
      );
    });
    fireEvent.click(getByTestId('send'));

    expect(hostMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('projects a retained session diagnostic only while its owning Tab is visible', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-1', conversationId: 'conv-1' });
    runtime.store.updateState({
      diagnostics: [
        {
          type: 'sessionDiagnostic',
          code: 'active-tab-mismatch',
          severity: 'error',
          action: 'session-mutation',
          message: 'The exact conversation is no longer active.',
        },
      ],
    });
    const props = createProps({ tabRenderStore: runtime.store, isVisible: false });
    const { rerender } = render(<ChatWorkspace {...props} />);

    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<ChatWorkspace {...props} isVisible />);

    const alert = screen.getByRole('alert');
    expect(alert.parentElement).toBe(document.body);
    expect(alert.textContent).toContain('active-tab-mismatch');
    expect(alert.textContent).toContain('The exact conversation is no longer active.');
  });

  it('routes visible mutations through the immutable Tab runtime binding', () => {
    const clearMessages = vi.fn();
    const setAmbientNodes = vi.fn();
    const runtime = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });
    runtime.store.updateState({
      modelConfigurationInitialized: true,
      selectedModel: 'test-model',
    });
    const target = render(
      <ChatWorkspace
        {...createProps({
          tabRenderStore: runtime.store,
          clearMessages,
          setAmbientNodes,
        })}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'ambientCanvasUpdate',
            nodes: [{ nodeId: 'node-b', type: 'group', summary: 'Tab B group' }],
          },
        }),
      );
    });
    fireEvent.click(target.getByTestId('send'));
    fireEvent.click(target.getByTestId('compress-context'));
    fireEvent.click(target.getByTestId('promote-queued'));
    fireEvent.click(target.getByTestId('cancel-queued'));
    fireEvent.click(target.getByTestId('edit-queued'));

    runRegisteredShortcut('clearConversation');

    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-b' }),
    );
    expect(hostMocks.clearHistory).toHaveBeenCalledWith('conv-b');
    expect(hostMocks.compressContext).toHaveBeenCalledWith('conv-b');
    expect(hostMocks.promoteQueuedMessage).toHaveBeenCalledWith('conv-b', 'queued-1');
    expect(hostMocks.cancelQueuedMessage).toHaveBeenCalledWith('conv-b', 'queued-1');
    expect(hostMocks.editQueuedMessage).toHaveBeenCalledWith('tab-b', 'conv-b', 'queued-1');
    expect(clearMessages).toHaveBeenCalledTimes(1);
    expect(setAmbientNodes).toHaveBeenCalledWith([
      { nodeId: 'node-b', type: 'group', summary: 'Tab B group' },
    ]);
  });

  it('keeps viewport and scroll intent isolated by Tab store', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-a' });
    const { rerender } = render(
      <ChatWorkspace {...createProps({ tabRenderStore: runtimeA.store })} />,
    );

    fireEvent.click(screen.getByTestId('detach-viewport'));
    expect(runtimeA.store.getSnapshot().state.viewport).toEqual({
      followMode: 'detached',
      anchorMessageId: 'anchor-tab-a',
      anchorOffset: 25,
    });

    rerender(<ChatWorkspace {...createProps({ tabRenderStore: runtimeB.store })} />);
    expect(screen.getByTestId('viewport-state').textContent).toContain('follow-tail:none:0');
    fireEvent.click(screen.getByTestId('detach-viewport'));
    expect(runtimeB.store.getSnapshot().state.viewport).toEqual({
      followMode: 'detached',
      anchorMessageId: 'anchor-tab-b',
      anchorOffset: 25,
    });
    expect(runtimeA.store.getSnapshot().state.viewport.anchorMessageId).toBe('anchor-tab-a');
  });

  it('keeps composition and focus requests isolated by Tab store', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });
    const { rerender } = render(
      <ChatWorkspace {...createProps({ tabRenderStore: runtimeA.store })} />,
    );

    fireEvent.click(screen.getByTestId('composition-start'));
    runRegisteredShortcut('focusInput');
    expect(runtimeA.store.getSnapshot().state.composition).toEqual({ isComposing: true });
    expect(runtimeA.store.getSnapshot().state.focus).toEqual({
      target: 'input',
      requestId: expect.any(String),
    });
    const runtimeAFocusRequestId = runtimeA.store.getSnapshot().state.focus.requestId;

    rerender(<ChatWorkspace {...createProps({ tabRenderStore: runtimeB.store })} />);
    expect(screen.getByTestId('composition-state').textContent).toBe('false');
    expect(screen.getByTestId('focus-request').textContent).toContain('tab-b:none:none');

    fireEvent.click(screen.getByTestId('composition-start'));
    runRegisteredShortcut('focusInput');
    expect(runtimeB.store.getSnapshot().state.composition).toEqual({ isComposing: true });
    expect(runtimeB.store.getSnapshot().state.focus).toEqual({
      target: 'input',
      requestId: expect.any(String),
    });
    expect(runtimeB.store.getSnapshot().state.focus.requestId).not.toBe(runtimeAFocusRequestId);
    expect(runtimeA.store.getSnapshot().state.composition).toEqual({ isComposing: true });
    expect(runtimeA.store.getSnapshot().state.focus.requestId).toBe(runtimeAFocusRequestId);
  });

  it('does not require a host active-conversation owner to mutate the visible Tab', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });
    runtime.store.updateState({
      modelConfigurationInitialized: true,
      selectedModel: 'test-model',
    });
    const { getByTestId } = render(
      <ChatWorkspace {...createProps({ tabRenderStore: runtime.store })} />,
    );

    fireEvent.click(getByTestId('send'));
    expect(hostMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-b',
        message: 'hello from tabless state',
      }),
    );
  });
});

function runRegisteredShortcut(id: string): void {
  const options = keyboardMocks.useKeyboardShortcuts.mock.calls.at(-1)?.[0] as
    { shortcuts?: Array<{ id: string; handler: () => void }> } | undefined;
  const shortcut = options?.shortcuts?.find((candidate) => candidate.id === id);
  expect(shortcut).toBeDefined();
  act(() => {
    shortcut?.handler();
  });
}

function createProps(overrides: Partial<ChatWorkspaceProps> = {}): ChatWorkspaceProps {
  const noop = vi.fn();
  const runtime = createTabRenderRuntime({ tabId: 'tab-1', conversationId: 'conv-1' });
  runtime.store.updateState({
    modelConfigurationInitialized: true,
    selectedModel: 'test-model',
  });
  return {
    tabRenderStore: runtime.store,
    messages: [],
    setMessages: noop as React.Dispatch<React.SetStateAction<Message[]>>,
    isThinking: false,
    setIsThinking: noop as React.Dispatch<React.SetStateAction<boolean>>,
    streamingMessageId: null,
    queuedMessageCount: 0,
    setStreamingMessageId: noop as React.Dispatch<React.SetStateAction<string | null>>,
    streamingMessageIdRef: createRefWithCurrent<string | null>(null),
    conversationKind: 'chat',
    queuedMessages: [],
    clearMessages: noop,
    settings: createSettings(),
    onModelSelect: noop,
    mentionItems: [],
    onMentionSearchFilterChange: noop,
    workItems: [],
    pluginsAvailable: {},
    setActiveTab: noop as React.Dispatch<
      React.SetStateAction<import('@neko/agent-contracts').TabType>
    >,
    conversationCompressingRef: createRefWithCurrent(new Map()),
    contextTokenCount: 0,
    isCompressing: false,
    mediaModelCallCount: 0,
    ambientNodes: [],
    agentState: null,
    setAmbientNodes: noop as React.Dispatch<
      React.SetStateAction<import('@neko/agent-contracts').AmbientCanvasNode[]>
    >,
    onNewChat: noop,
    queuedEditDraftConflictMessage: 'Queued edit draft conflict',
    ...overrides,
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

function createSettingsWithImageModel(): SettingsState {
  const settings = createSettings();
  return {
    ...settings,
    chatModelOptions: [
      ...settings.chatModelOptions,
      {
        id: 'image-model',
        providerId: 'test-image',
        modelId: 'image-model',
        label: 'Image Model',
        category: 'image',
        capabilities: ['text_to_image'],
      },
    ],
  };
}

function createSettingsWithAgentMediaModels(): SettingsState {
  const settings = createSettings();
  return {
    ...settings,
    defaultMediaModels: {
      image: 'image-provider:image-model',
      video: 'video-provider:video-model',
      audio: 'audio-provider:audio-model',
    },
    chatModelOptions: [
      ...settings.chatModelOptions,
      {
        id: 'image-provider:image-model',
        providerId: 'image-provider',
        modelId: 'image-model',
        label: 'Image Model',
        category: 'image',
        capabilities: ['text_to_image'],
      },
      {
        id: 'video-provider:video-model',
        providerId: 'video-provider',
        modelId: 'video-model',
        label: 'Video Model',
        category: 'video',
        capabilities: ['text_to_video'],
      },
      {
        id: 'audio-provider:audio-model',
        providerId: 'audio-provider',
        modelId: 'audio-model',
        label: 'Audio Model',
        category: 'audio',
        capabilities: ['text_to_audio'],
      },
    ],
  };
}

function contextPayload(id: string, label: string): AgentContextPayload {
  return {
    id,
    label,
    type: 'canvas-node',
    summary: label,
    data: {},
  };
}

function createRefWithCurrent<T>(current: T): React.MutableRefObject<T> {
  const ref = createRef<T>() as React.MutableRefObject<T>;
  ref.current = current;
  return ref;
}
