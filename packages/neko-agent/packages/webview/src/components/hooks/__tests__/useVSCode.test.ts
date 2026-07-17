import type { TaskRunScope } from '@neko/shared';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const { mockPostMessage, mockGetState, mockSetState, mockVSCodeApi } = vi.hoisted(() => {
  const postMessage = vi.fn();
  const getState = vi.fn();
  const setState = vi.fn();
  return {
    mockPostMessage: postMessage,
    mockGetState: getState,
    mockSetState: setState,
    mockVSCodeApi: { postMessage, getState, setState },
  };
});

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => mockVSCodeApi,
  postMessage: mockPostMessage,
  getState: mockGetState,
  setState: mockSetState,
}));

// Dynamic import to ensure mock is set up first
let postMessage: typeof import('../../../messages').postMessage;
let AgentHostMessages: typeof import('../../../messages').AgentHostMessages;
let vscode: typeof import('../../../messages').vscode;
let getAgentHostRuntimeAdapter: typeof import('../../../messages').getAgentHostRuntimeAdapter;
let setAgentHostRuntimeAdapter: typeof import('../../../messages').setAgentHostRuntimeAdapter;
let createVSCodeAgentHostRuntimeAdapter: typeof import('../../../messages').createVSCodeAgentHostRuntimeAdapter;

beforeAll(async () => {
  const module = await import('../../../messages');
  postMessage = module.postMessage;
  AgentHostMessages = module.AgentHostMessages;
  vscode = module.vscode;
  getAgentHostRuntimeAdapter = module.getAgentHostRuntimeAdapter;
  setAgentHostRuntimeAdapter = module.setAgentHostRuntimeAdapter;
  createVSCodeAgentHostRuntimeAdapter = module.createVSCodeAgentHostRuntimeAdapter;
});

describe('messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('vscode API', () => {
    it('should acquire VSCode API', () => {
      expect(vscode).toBeDefined();
      expect(vscode).toBe(mockVSCodeApi);
    });
  });

  describe('postMessage()', () => {
    it('should call vscode.postMessage with message', () => {
      const message = { type: 'test', data: 'value' };
      postMessage(message);
      expect(mockPostMessage).toHaveBeenCalledWith(message);
    });

    it('should handle complex message objects', () => {
      const message = {
        type: 'complex',
        nested: { key: 'value' },
        array: [1, 2, 3],
      };
      postMessage(message);
      expect(mockPostMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('AgentHostMessages', () => {
    it('creates the default VSCode host runtime adapter around the shared bridge', () => {
      const adapter = createVSCodeAgentHostRuntimeAdapter({
        runtimeId: 'agent-vscode-test',
      });

      adapter.send({ type: 'getSettings', conversationId: 'conversation-1' });
      adapter.setState({ openTabs: [] });

      expect(adapter.hostKind).toBe('vscode');
      expect(adapter.runtimeId).toBe('agent-vscode-test');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'getSettings',
        conversationId: 'conversation-1',
      });
      expect(mockVSCodeApi.setState).toHaveBeenCalledWith({ openTabs: [] });
    });

    it('delegates message builders to the injected host runtime adapter', () => {
      const sent: unknown[] = [];
      const subscription = setAgentHostRuntimeAdapter({
        hostKind: 'electron',
        runtimeId: 'agent-test-runtime',
        send(message) {
          sent.push(message);
        },
        subscribe() {
          return { dispose: vi.fn() };
        },
        getState<T>() {
          return { source: 'fake-host' } as T;
        },
        setState: vi.fn(),
      });

      AgentHostMessages.getSettings('conversation-1');

      expect(sent).toEqual([{ type: 'getSettings', conversationId: 'conversation-1' }]);
      expect(mockPostMessage).not.toHaveBeenCalled();
      expect(getAgentHostRuntimeAdapter().getState()).toEqual({ source: 'fake-host' });
      subscription.dispose();
    });

    it('supports subscribe/dispose through the injected host runtime adapter', () => {
      const listenerDisposers: Array<() => void> = [];
      const delivered: unknown[] = [];
      let listener: ((message: { type: 'globalError'; message: string }) => void) | undefined;
      const subscription = setAgentHostRuntimeAdapter({
        hostKind: 'electron',
        runtimeId: 'agent-test-runtime',
        send: vi.fn(),
        subscribe(next) {
          listener = next as typeof listener;
          const dispose = vi.fn();
          listenerDisposers.push(dispose);
          return { dispose };
        },
        getState: vi.fn(),
        setState: vi.fn(),
      });

      const hostSubscription = getAgentHostRuntimeAdapter().subscribe((message) => {
        delivered.push(message);
      });
      listener?.({ type: 'globalError', message: 'host diagnostic' });
      hostSubscription.dispose();

      expect(delivered).toEqual([{ type: 'globalError', message: 'host diagnostic' }]);
      expect(listenerDisposers[0]).toHaveBeenCalled();
      subscription.dispose();
    });

    describe('sendMessage()', () => {
      it('should post sendMessage with basic params', () => {
        AgentHostMessages.sendMessage({
          conversationId: 'conv-1',
          message: 'Hello AI',
          sessionMode: 'agent',
        });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'sendMessage',
          conversationId: 'conv-1',
          message: 'Hello AI',
          sessionMode: 'agent',
        });
      });

      it('should post sendMessage with all params', () => {
        const attachments = [{ id: '1', name: 'test.txt', type: 'file' as const }];
        AgentHostMessages.sendMessage({
          conversationId: 'conv-1',
          message: 'Hello',
          sessionMode: 'agent',
          chatModel: { providerId: 'openai', modelId: 'gpt-4', category: 'llm' },
          purposeModels: {
            'image.generate': {
              providerId: 'openai',
              modelId: 'gpt-image-1',
              category: 'image',
            },
          },
          attachments,
          promptId: 'prompt-1',
        });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'sendMessage',
          conversationId: 'conv-1',
          message: 'Hello',
          sessionMode: 'agent',
          chatModel: { providerId: 'openai', modelId: 'gpt-4', category: 'llm' },
          purposeModels: {
            'image.generate': {
              providerId: 'openai',
              modelId: 'gpt-image-1',
              category: 'image',
            },
          },
          attachments,
          promptId: 'prompt-1',
        });
      });
    });

    describe('conversation management', () => {
      it('should post newConversation', () => {
        AgentHostMessages.newConversation();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'newConversation' });
      });

      it('should post an atomic activateConversation request', () => {
        AgentHostMessages.activateConversation({
          activationId: 4,
          conversationId: 'conv-123',
          tabId: 'tab-123',
          expectedTabStateRevision: 7,
          tabState: {
            openTabs: [{ id: 'tab-123', title: 'Chat', conversationId: 'conv-123' }],
            activeTabId: 'tab-123',
          },
        });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'activateConversation',
          activationId: 4,
          conversationId: 'conv-123',
          tabId: 'tab-123',
          expectedTabStateRevision: 7,
          tabState: {
            openTabs: [{ id: 'tab-123', title: 'Chat', conversationId: 'conv-123' }],
            activeTabId: 'tab-123',
          },
        });
      });

      it('should post deleteConversation with ID', () => {
        AgentHostMessages.deleteConversation('conv-456');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'deleteConversation',
          conversationId: 'conv-456',
        });
      });

      it('should post getConversations', () => {
        AgentHostMessages.getConversations();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getConversations' });
      });

      it('should post getActiveConversation', () => {
        AgentHostMessages.getActiveConversation();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getActiveConversation' });
      });
    });

    describe('settings', () => {
      it('should post getSettings', () => {
        AgentHostMessages.getSettings('conversation-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'getSettings',
          conversationId: 'conversation-1',
        });
      });

      it('should post lifecycle config snapshot refresh', () => {
        AgentHostMessages.refreshConfigSnapshot();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'refreshConfigSnapshot' });
      });

      it('should post updateSettings with data', () => {
        AgentHostMessages.updateSettings({ executionMode: 'auto' }, 'conversation-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'updateSettings',
          settings: { executionMode: 'auto' },
          conversationId: 'conversation-1',
        });
      });

      it('should post clearHistory', () => {
        AgentHostMessages.clearHistory('conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'clearHistory',
          conversationId: 'conv-1',
        });
      });

      it('rejects session-scoped builders with empty conversationId', () => {
        expect(() => AgentHostMessages.clearHistory('')).toThrow(
          'clearHistory requires non-empty conversationId',
        );
        expect(mockPostMessage).not.toHaveBeenCalled();
      });
    });

    describe('task management', () => {
      it('should post getTasks', () => {
        AgentHostMessages.getTasks('conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'getTasks',
          conversationId: 'conv-1',
        });
      });

      it('should post getAgentStates', () => {
        AgentHostMessages.getAgentStates();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getAgentStates' });
      });

      it('should post cancelTask with complete owner scope', () => {
        const taskScope = createTaskRunScope();
        AgentHostMessages.cancelTask(taskScope);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'cancelTask',
          taskScope,
        });
      });

      it('should post viewTaskResult with complete owner scope', () => {
        const taskScope = createTaskRunScope();
        AgentHostMessages.viewTaskResult(taskScope, 'generated-assets/asset-1.png');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'viewTaskResult',
          taskScope,
          resultRef: 'generated-assets/asset-1.png',
        });
      });

      it('should post retryTask with complete owner scope', () => {
        const taskScope = createTaskRunScope();
        AgentHostMessages.retryTask(taskScope);
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'retryTask',
          taskScope,
        });
      });
    });

    describe('config management', () => {
      it('should post getConfig', () => {
        AgentHostMessages.getConfig();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getConfig' });
      });

      it('should post getSkills', () => {
        AgentHostMessages.getSkills();
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getSkills' });
      });

      it('should post searchProjectFiles', () => {
        AgentHostMessages.searchProjectFiles('*.ts', 'conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'searchProjectFiles',
          filter: '*.ts',
          conversationId: 'conv-1',
        });
      });

      it('should post roleplay project search purpose', () => {
        AgentHostMessages.searchProjectFiles('', undefined, { purpose: 'roleplay' });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'searchProjectFiles',
          filter: '',
          purpose: 'roleplay',
        });
      });

      it('should post entry project search purpose without conversation scope', () => {
        AgentHostMessages.searchProjectFiles('hero', undefined, { purpose: 'entry' });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'searchProjectFiles',
          filter: 'hero',
          purpose: 'entry',
        });
      });

      it('should post character dialogue launch args without creating an ordinary conversation', () => {
        AgentHostMessages.startCharacterDialogueFromSlash('entity:char-xiaoju --roleplay');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'startCharacterDialogueFromSlash',
          args: 'entity:char-xiaoju --roleplay',
        });
      });

      it('should post confirmTool', () => {
        AgentHostMessages.confirmTool('tool-1', true, 'conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'confirmTool',
          toolCallId: 'tool-1',
          approved: true,
          conversationId: 'conv-1',
        });
      });

      it('should post cancelMessage with conversationId', () => {
        AgentHostMessages.cancelMessage('conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'cancelMessage',
          conversationId: 'conv-1',
        });
      });

      it('should post message queue commands with explicit queue item scope', () => {
        AgentHostMessages.getMessageQueue('conv-1');
        AgentHostMessages.promoteQueuedMessage('conv-1', 'queue-1');
        AgentHostMessages.cancelQueuedMessage('conv-1', 'queue-1');
        AgentHostMessages.editQueuedMessage('tab-1', 'conv-1', 'queue-1');

        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'getMessageQueue',
          conversationId: 'conv-1',
        });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'promoteQueuedMessage',
          conversationId: 'conv-1',
          queueItemId: 'queue-1',
        });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'cancelQueuedMessage',
          conversationId: 'conv-1',
          queueItemId: 'queue-1',
        });
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'editQueuedMessage',
          tabId: 'tab-1',
          conversationId: 'conv-1',
          queueItemId: 'queue-1',
        });
      });

      it('should post exitCharacterDialogueSession with session scope', () => {
        AgentHostMessages.exitCharacterDialogueSession('npc-session-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'exitCharacterDialogueSession',
          sessionId: 'npc-session-1',
        });
      });

      it('should post invokePluginSlashCommand with conversationId', () => {
        AgentHostMessages.invokePluginSlashCommand('neko.canvas', 'batch', 'conv-1', 'scene 1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'invokePluginSlashCommand',
          extensionId: 'neko.canvas',
          commandId: 'batch',
          conversationId: 'conv-1',
          args: 'scene 1',
        });
      });

      it('should post invokeSkill with conversationId', () => {
        AgentHostMessages.invokeSkill('quality-review', 'changed files', 'conv-1');
        expect(mockPostMessage).toHaveBeenCalledWith({
          type: 'invokeSkill',
          skillName: 'quality-review',
          conversationId: 'conv-1',
          args: 'changed files',
        });
      });
    });
  });
});

function createTaskRunScope(): TaskRunScope {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'parent-run-1',
    childRunId: 'task-123',
    childKind: 'task',
  };
}
