import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES,
  handleChatWebviewMessage,
  type ChatWebviewMessageRouterDeps,
} from '../chatWebviewMessageRouter';
import {
  createAgentHostRouteCoverageDiagnostics,
  WEBVIEW_TO_EXTENSION_MESSAGE_TYPES,
  type WebviewToExtensionMessage,
} from '@neko-agent/types';
import type { AgentCapabilityLifecycleDescriptor, TaskRunScope } from '@neko/shared';
import { CONFIG_BRIDGE_MESSAGE_TYPES } from '../../services/configBridge';
import { sendGeneratedAssetToPlugin } from '../../services/pluginTransferBridge';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

vi.mock('../../services/pluginTransferBridge', () => ({
  sendGeneratedAssetToPlugin: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

type RoutedWebviewMessageType =
  (typeof CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES)[number] | (typeof CONFIG_BRIDGE_MESSAGE_TYPES)[number];
type UnroutedWebviewMessageType = Exclude<
  WebviewToExtensionMessage['type'],
  RoutedWebviewMessageType
>;
type DuplicateBridgeMessageType = Extract<
  (typeof CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES)[number],
  (typeof CONFIG_BRIDGE_MESSAGE_TYPES)[number]
>;
type AssertNever<T extends never> = T;
type _AllWebviewMessagesRouted = AssertNever<UnroutedWebviewMessageType>;
type _NoBridgeMessageOverlap = AssertNever<DuplicateBridgeMessageType>;

function createCanvasLifecycleDescriptor(capabilityId: string): AgentCapabilityLifecycleDescriptor {
  return {
    capabilityId,
    providerId: 'neko-canvas',
    displayName: capabilityId,
    description: `${capabilityId} descriptor`,
    phases:
      capabilityId === 'canvas.createStoryboardFromMarkdown'
        ? ['validate', 'review', 'apply']
        : ['review'],
    inputSchema: { id: 'canvas.markdown.input', version: 1 },
    resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
    accepts: ['Markdown', 'GfmTable'],
    produces: ['canvas-node-ref'],
    risk: 'medium',
    requiresApproval: capabilityId === 'canvas.createStoryboardFromMarkdown',
    safetyKind:
      capabilityId === 'canvas.createStoryboardFromMarkdown'
        ? 'confirmation-gated'
        : 'read-only-query',
  };
}

function createDeps(): ChatWebviewMessageRouterDeps {
  return {
    webview: { postMessage: vi.fn().mockResolvedValue(true) } as any,
    projectionAttachments: {
      attach: vi.fn().mockResolvedValue(undefined),
      acknowledge: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
      abandon: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    },
    announceProjectionEndpoint: vi.fn(),
    reportProjectionProtocolError: vi.fn(),
    messages: {
      handleUserMessage: vi.fn(),
      searchProjectFiles: vi.fn(),
    } as any,
    characterDialogue: {
      hasSession: vi.fn(() => false),
      routeUserMessage: vi.fn(),
      launchFromSlash: vi.fn(),
      cancel: vi.fn(() => false),
      exit: vi.fn(),
    } as any,
    embodyCharacter: {
      hasSession: vi.fn(() => false),
      routeUserMessage: vi.fn(),
      cancel: vi.fn(() => false),
      exit: vi.fn(),
    } as any,
    taskHandler: {
      sendTasks: vi.fn(),
      handleCancelTask: vi.fn(),
      handleRetryTask: vi.fn(),
      handleViewTaskResult: vi.fn(),
    } as any,
    skillHandler: {
      sendSkillsList: vi.fn(),
      handleSkillInvocation: vi.fn().mockResolvedValue({ applied: true }),
    } as any,
    fileOperationHandler: {
      handleOpenFile: vi.fn(),
      handleRevealDocumentLocator: vi.fn(),
      handleRevealFile: vi.fn(),
      handleRevealAsset: vi.fn(),
      handleOpenConfigFile: vi.fn(),
      handleOpenUrl: vi.fn(),
      handleDownloadSvg: vi.fn(),
    } as any,
    settingsHandler: {
      sendSettings: vi.fn(),
      handleUpdateSettings: vi.fn(),
    } as any,
    contextHandler: {
      getTokenCount: vi.fn(),
      compressContext: vi.fn(),
    } as any,
    slashCommandHandler: {
      handleCommand: vi.fn(),
    } as any,
    conversationMessageHandler: {
      handleConfirmTool: vi.fn(),
      handleCancelMessage: vi.fn(),
      handleNewConversation: vi.fn(),
      handleSwitchConversation: vi.fn(),
      handleDeleteConversation: vi.fn(),
      sendConversationList: vi.fn(),
      sendActiveConversation: vi.fn(),
      sendConversationSnapshot: vi.fn(),
      sendAgentStateSnapshot: vi.fn(),
      sendMessageQueueSnapshot: vi.fn(),
      handlePromoteQueuedMessage: vi.fn(),
      handleCancelQueuedMessage: vi.fn(),
      handleEditQueuedMessage: vi.fn(),
      handleClearHistory: vi.fn(),
      handleClearAllConversations: vi.fn(),
    } as any,
    dndBroker: {
      setPayload: vi.fn(),
    } as any,
    refreshConfigSnapshot: vi.fn(),
    sendTabState: vi.fn(),
    activateConversation: vi.fn(),
    updateTabState: vi.fn(),
    syncCanvasAmbientScopeFromActiveConversation: vi.fn(),
    resolveLifecycleCapabilityDescriptor: vi.fn((capabilityId: string) =>
      capabilityId.startsWith('canvas.')
        ? createCanvasLifecycleDescriptor(capabilityId)
        : undefined,
    ),
  };
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('handleChatWebviewMessage', () => {
  it('keeps every webview-to-extension message assigned to exactly one bridge', () => {
    const chatTypes = new Set<string>(CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES);
    const configTypes = new Set<string>(CONFIG_BRIDGE_MESSAGE_TYPES);
    const duplicated = [...chatTypes].filter((type) => configTypes.has(type));
    const covered = new Set([...chatTypes, ...configTypes]);
    const missing = WEBVIEW_TO_EXTENSION_MESSAGE_TYPES.filter((type) => !covered.has(type));

    expect(duplicated).toEqual([]);
    expect(missing).toEqual([]);
    expect(configTypes.has('getSkills')).toBe(false);
    expect(chatTypes.has('getSkills')).toBe(true);
  });

  it('classifies every VSCode Agent host route as implemented', () => {
    const implementedRoutes: Partial<Record<WebviewToExtensionMessage['type'], 'implemented'>> = {};
    for (const type of [...CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES, ...CONFIG_BRIDGE_MESSAGE_TYPES]) {
      implementedRoutes[type] = 'implemented';
    }

    expect(
      createAgentHostRouteCoverageDiagnostics({
        hostKind: 'vscode',
        routes: implementedRoutes,
      }),
    ).toEqual([]);
  });

  it('routes explicit conversation snapshot reads without foreground activation', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      { type: 'getConversationSnapshot', conversationId: 'conv-background' },
      deps,
    );

    expect(deps.conversationMessageHandler.sendConversationSnapshot).toHaveBeenCalledWith(
      'conv-background',
    );
    expect(deps.activateConversation).not.toHaveBeenCalled();
  });

  it('routes sendMessage to the message handler with explicit conversation state', () => {
    const deps = createDeps();
    const agentModels = {
      primary: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' as const },
    };
    const llmConfig = {
      reasoningPreset: 'balanced' as const,
      verbosityPreset: 'standard' as const,
      creativityPreset: 'creative' as const,
    };

    handleChatWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        agentModels,
        llmConfig,
        contextPayloads: [
          {
            type: 'document-selection',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected text',
            data: { selectedText: 'hello' },
          },
        ],
      },
      deps,
    );

    expect(deps.messages?.handleUserMessage).toHaveBeenCalledWith(
      deps.webview,
      expect.objectContaining({
        conversationId: 'conv-1',
        messageText: 'hello',
        sessionMode: 'agent',
        agentModels,
        llmConfig,
        contextPayloads: [
          {
            type: 'document-selection',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected text',
            data: { selectedText: 'hello' },
          },
        ],
      }),
    );
    expect(deps.messages?.handleUserMessage).toHaveBeenCalledTimes(1);
    expect(deps.slashCommandHandler.handleCommand).not.toHaveBeenCalled();
    expect(deps.taskHandler.sendTasks).not.toHaveBeenCalled();
  });

  it('routes message queue commands with explicit conversation scope', () => {
    const deps = createDeps();

    handleChatWebviewMessage({ type: 'getMessageQueue', conversationId: 'conv-1' }, deps);
    handleChatWebviewMessage(
      {
        type: 'promoteQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      },
      deps,
    );
    handleChatWebviewMessage(
      {
        type: 'cancelQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      },
      deps,
    );
    handleChatWebviewMessage(
      {
        type: 'editQueuedMessage',
        tabId: 'tab-1',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      },
      deps,
    );

    expect(deps.conversationMessageHandler.sendMessageQueueSnapshot).toHaveBeenCalledWith(
      deps.webview,
      'conv-1',
    );
    expect(deps.conversationMessageHandler.handlePromoteQueuedMessage).toHaveBeenCalledWith(
      deps.webview,
      'conv-1',
      'queue-1',
    );
    expect(deps.conversationMessageHandler.handleCancelQueuedMessage).toHaveBeenCalledWith(
      deps.webview,
      'conv-1',
      'queue-1',
    );
    expect(deps.conversationMessageHandler.handleEditQueuedMessage).toHaveBeenCalledWith(
      deps.webview,
      'tab-1',
      'conv-1',
      'queue-1',
    );
  });

  it('routes Character Dialogue sendMessage to the Character Dialogue controller without ordinary conversation persistence', () => {
    const deps = createDeps();
    vi.mocked(deps.characterDialogue!.hasSession).mockReturnValue(true);

    handleChatWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'npc-session-1',
        message: 'hello',
        sessionMode: 'agent',
      },
      deps,
    );

    expect(deps.characterDialogue?.routeUserMessage).toHaveBeenCalledWith('npc-session-1', 'hello');
    expect(deps.messages?.handleUserMessage).not.toHaveBeenCalled();
  });

  it('routes Embody Character sendMessage to the Embody controller without ordinary conversation persistence', () => {
    const deps = createDeps();
    vi.mocked(deps.embodyCharacter!.hasSession).mockReturnValue(true);

    handleChatWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'embody-session-1',
        message: '记录今天的日记',
        sessionMode: 'agent',
      },
      deps,
    );

    expect(deps.embodyCharacter?.routeUserMessage).toHaveBeenCalledWith(
      'embody-session-1',
      '记录今天的日记',
    );
    expect(deps.messages?.handleUserMessage).not.toHaveBeenCalled();
  });

  it('routes roleplay candidate search without requiring an ordinary conversation', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'searchProjectFiles',
        filter: '',
        purpose: 'roleplay',
      },
      deps,
    );

    expect(deps.messages?.searchProjectFiles).toHaveBeenCalledWith(deps.webview, '', undefined, {
      purpose: 'roleplay',
    });
    expect(deps.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'globalError' }),
    );
  });

  it('routes entry mention search without requiring an ordinary conversation', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'searchProjectFiles',
        filter: 'hero',
        purpose: 'entry',
      },
      deps,
    );

    expect(deps.messages?.searchProjectFiles).toHaveBeenCalledWith(
      deps.webview,
      'hero',
      undefined,
      {
        purpose: 'entry',
      },
    );
    expect(deps.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'globalError' }),
    );
  });

  it('routes entry roleplay launches directly to Character Dialogue without an ordinary tab', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'startCharacterDialogueFromSlash',
        args: 'entity:char-xiaoju --roleplay --skip-enrich',
      },
      deps,
    );

    expect(deps.characterDialogue?.launchFromSlash).toHaveBeenCalledWith({
      args: 'entity:char-xiaoju --roleplay --skip-enrich',
    });
    expect(deps.slashCommandHandler.handleCommand).not.toHaveBeenCalled();
    expect(deps.messages?.handleUserMessage).not.toHaveBeenCalled();
  });

  it('routes Character Dialogue exit events to the Character Dialogue controller', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      { type: 'exitCharacterDialogueSession', sessionId: 'npc-session-1' },
      deps,
    );

    expect(deps.characterDialogue?.exit).toHaveBeenCalledWith('npc-session-1');
  });

  it('routes Embody Character exit events to the Embody controller', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      { type: 'exitEmbodyCharacterSession', sessionId: 'embody-session-1' },
      deps,
    );

    expect(deps.embodyCharacter?.exit).toHaveBeenCalledWith('embody-session-1');
  });

  it('routes Task actions with the complete owner scope unchanged', () => {
    const deps = createDeps();
    const scope = taskScope('task-1');

    handleChatWebviewMessage({ type: 'cancelTask', taskScope: scope }, deps);
    handleChatWebviewMessage({ type: 'retryTask', taskScope: scope }, deps);
    handleChatWebviewMessage(
      { type: 'viewTaskResult', taskScope: scope, resultRef: 'generated-assets/result.png' },
      deps,
    );

    expect(deps.taskHandler.handleCancelTask).toHaveBeenCalledWith(deps.webview, scope);
    expect(deps.taskHandler.handleRetryTask).toHaveBeenCalledWith(deps.webview, scope);
    expect(deps.taskHandler.handleViewTaskResult).toHaveBeenCalledWith(
      scope,
      'generated-assets/result.png',
    );
  });

  it('routes ordinary conversation switches through atomic activation', () => {
    const deps = createDeps();
    const message = {
      type: 'activateConversation' as const,
      activationId: 2,
      conversationId: 'conv-2',
      tabId: 'tab-2',
      expectedTabStateRevision: 4,
      tabState: {
        openTabs: [{ id: 'tab-2', title: 'Chat 2', conversationId: 'conv-2' }],
        activeTabId: 'tab-2',
      },
    };

    handleChatWebviewMessage(message, deps);

    expect(deps.activateConversation).toHaveBeenCalledWith(message);
    expect(deps.conversationMessageHandler.handleSwitchConversation).not.toHaveBeenCalled();
  });

  it('routes delete conversation activation intent to the conversation handler', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      { type: 'deleteConversation', conversationId: 'conv-2', activateNext: false },
      deps,
    );

    expect(deps.conversationMessageHandler.handleDeleteConversation).toHaveBeenCalledWith(
      'conv-2',
      { activateNext: false },
    );
    expect(deps.syncCanvasAmbientScopeFromActiveConversation).toHaveBeenCalledTimes(1);
  });

  it('routes plugin slash commands with explicit conversation context', () => {
    const deps = createDeps();
    vi.mocked(vscode.commands.executeCommand).mockClear();

    handleChatWebviewMessage(
      {
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
        conversationId: 'conv-1',
        args: 'scene 1',
      },
      deps,
    );

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.canvas.slashCommand.batch', {
      extensionId: 'neko.canvas',
      commandId: 'batch',
      conversationId: 'conv-1',
      args: 'scene 1',
    });
  });

  it('routes builtin slash commands with explicit conversation context', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'invokeSlashCommand',
        command: 'as',
        args: '@小橘 --consult',
        conversationId: 'conv-1',
      },
      deps,
    );

    expect(deps.slashCommandHandler.handleCommand).toHaveBeenCalledWith(
      deps.webview,
      'as',
      '@小橘 --consult',
      'conv-1',
    );
  });

  it('routes explicit skill invocations without reusing slash command dispatch', () => {
    const deps = createDeps();
    vi.mocked(vscode.commands.executeCommand).mockClear();

    handleChatWebviewMessage(
      {
        type: 'invokeSkill',
        skillName: 'quality-review',
        args: 'changed files',
        conversationId: 'conv-1',
      },
      deps,
    );

    expect(deps.skillHandler.handleSkillInvocation).toHaveBeenCalledWith(
      deps.webview,
      'quality-review',
      'conv-1',
      'changed files',
    );
    expect(deps.slashCommandHandler.handleCommand).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('routes sendToPlugin with the media type hint intact', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'sendToPlugin',
        target: 'canvas',
        assetPath: '/tmp/frame.png',
        mediaType: 'image',
      },
      deps,
    );

    expect(sendGeneratedAssetToPlugin).toHaveBeenCalledWith(
      'canvas',
      '/tmp/frame.png',
      'image',
      undefined,
    );
  });

  it('routes structured sendToPlugin payloads intact', () => {
    const deps = createDeps();
    const payload = {
      kind: 'assetBatch' as const,
      assets: [
        { path: '/tmp/frame-1.png', mediaType: 'image' as const },
        { path: '/tmp/frame-2.png', mediaType: 'image' as const },
      ],
    };

    handleChatWebviewMessage(
      {
        type: 'sendToPlugin',
        target: 'cut',
        payload,
      },
      deps,
    );

    expect(sendGeneratedAssetToPlugin).toHaveBeenCalledWith('cut', undefined, undefined, payload);
  });

  it('routes unspecified storyboard Markdown as a normal document without structured fallback', async () => {
    const deps = createDeps();
    const invoke = vi.fn();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-canvas',
      isActive: true,
      exports: {
        markdown: { invoke },
      },
      activate: vi.fn(),
    } as any);

    handleChatWebviewMessage(
      {
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'req-1',
        conversationId: 'conv-1',
        sourceKind: 'markdown',
        content:
          '| scene | shot id | visual | image |\\n| --- | --- | --- | --- |\\n| S1 | 1 | open | P1 |',
        title: 'Assistant Markdown',
        sourceFormat: 'gfm-table',
        resources: [{ token: 'P1', sourcePath: '${PROJECT}/assets/panel-1.png' }],
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
        targetHints: {
          sourceFormat: 'gfm-table',
          declaredIntentHint: 'creative-table',
          declaredProfileHint: 'storyboard',
        },
      },
      deps,
    );

    await flushAsyncWork();

    expect(invoke).not.toHaveBeenCalled();
    expect(sendGeneratedAssetToPlugin).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(deps.messages?.handleUserMessage).toHaveBeenCalledWith(
      deps.webview,
      expect.objectContaining({
        conversationId: 'conv-1',
        sessionMode: 'agent',
        locale: 'zh-cn',
        messageText: expect.stringContaining('应该使用哪个 Canvas capability/tool'),
        contextPayloads: [
          expect.objectContaining({
            type: 'document-selection',
            id: 'req-1',
            label: 'Canvas 创作交接: Assistant Markdown',
            summary: 'gfm-table, 1 个稳定 resource ref, 0 个稳定语义 ref, 0 个 handoff diagnostic',
            intent: '通过 Agent 工具选择把这段内容发送到 Canvas。',
            data: expect.objectContaining({
              kind: 'canvas-authoring-handoff',
              sourceKind: 'markdown',
              content:
                '| scene | shot id | visual | image |\\n| --- | --- | --- | --- |\\n| S1 | 1 | open | P1 |',
              resources: [{ token: 'P1', sourcePath: '${PROJECT}/assets/panel-1.png' }],
              targetHints: {
                sourceFormat: 'gfm-table',
                declaredIntentHint: 'creative-table',
                declaredProfileHint: 'storyboard',
              },
            }),
          }),
        ],
      }),
    );
    const routedRequest = (deps.messages?.handleUserMessage as any).mock.calls[0]?.[1];
    expect(routedRequest.messageText).toContain('Canvas authoring handoff intent');
    expect(routedRequest.messageText).toContain('普通 Storyboard Markdown 文档交接');
    expect(routedRequest.messageText).toContain('不创建专用 storyboard/table/scene/shot 节点');
    expect(routedRequest.messageText).toContain('只有用户明确要求创建结构化生产节点时才升级');
    expect(routedRequest.messageText).not.toContain('canvas.createStoryboardFromMarkdown');
    expect(routedRequest.messageText).not.toContain('mode=create-nodes');
    expect(routedRequest.messageText).not.toContain('scene.basic + shot.basic');
    expect(routedRequest.messageText).not.toContain('canvas.ingestMarkdown');
    expect(routedRequest.messageText).toContain('documentResourceRef');
    expect(routedRequest.messageText).not.toContain('Decide whether to call Canvas');
    expect(routedRequest.messageText).not.toContain('Do not assume a generic table');
    const handoffData = routedRequest.contextPayloads[0].data;
    expect(JSON.stringify(handoffData)).not.toContain('capabilityId');
    expect(JSON.stringify(handoffData)).not.toContain('neko.canvas.importAsset');
    expect(JSON.stringify(handoffData)).not.toContain('canvas.ingestMarkdown');
    expect(JSON.stringify(handoffData)).not.toContain('canvas.createStoryboardFromMarkdown');
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'canvas_create_node',
    );
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'canvas_create_composite',
    );
  });

  it('routes canonical Storyboard handoff with nested scene, shot, prompt, revision, and media ownership intact', async () => {
    const deps = createDeps();
    const canonicalStoryboard = createCanonicalStoryboardHandoffFixture();

    handleChatWebviewMessage(
      {
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'req-canonical-storyboard',
        conversationId: 'conv-1',
        sourceKind: 'structured-content',
        sourceFormat: 'composite-artifact',
        content: 'Canonical Storyboard: Cats (1 scenes, 1 shots)',
        title: 'Cats',
        canonicalStoryboard,
        userIntent:
          'Create Canvas storyboard production nodes from this canonical Storyboard without Markdown reconstruction or asset flattening.',
        targetHints: {
          declaredProfileHint: 'storyboard',
          operationHint: 'canvas.createStoryboardFromMarkdown',
        },
      },
      deps,
    );

    await flushAsyncWork();

    expect(sendGeneratedAssetToPlugin).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(deps.messages?.handleUserMessage).toHaveBeenCalledTimes(1);
    const routedRequest = (deps.messages?.handleUserMessage as any).mock.calls[0]?.[1];
    const handoffData = routedRequest.contextPayloads[0].data;
    expect(handoffData).toEqual(
      expect.objectContaining({
        kind: 'canvas-authoring-handoff',
        sourceKind: 'structured-content',
        sourceFormat: 'composite-artifact',
        canonicalStoryboard: expect.objectContaining({
          revision: expect.objectContaining({ revisionId: 'storyboard-rev-1' }),
          scenes: [
            expect.objectContaining({
              sceneId: 'scene-1',
              shots: [
                expect.objectContaining({
                  shotId: 'shot-1',
                  imagePrompt: 'cat keyframe',
                  videoPrompt: 'cat scene motion',
                  sourceMediaRefs: [
                    expect.objectContaining({
                      refId: 'source-image-1',
                      resourceRef: expect.objectContaining({ id: 'source-image-resource' }),
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      }),
    );
    expect(routedRequest.messageText).toContain('canonicalStoryboard 原样传给');
    expect(routedRequest.messageText).toContain('不得压平为 asset batch');
    expect(routedRequest.messageText).toContain('scene 容器与其所属 shot 子节点');
    expect(JSON.stringify(handoffData)).not.toContain('assetBatch');
    expect(JSON.stringify(handoffData)).not.toContain('capabilityId');
    expect(JSON.stringify(handoffData)).not.toContain('toolName');
  });

  it('treats Markdown wording as normal document intent rather than structured production', async () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'req-markdown-source-format',
        conversationId: 'conv-1',
        sourceKind: 'markdown',
        sourceFormat: 'gfm-table',
        title: '前 10 页分镜表',
        content:
          '| scene | shot | source | videoPrompt |\\n| --- | --- | --- | --- |\\n| S1 | 1 | P1 | scene prompt |',
        userIntent: '作为 Markdown 发送到 Canvas',
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
        targetHints: {
          sourceFormat: 'gfm-table',
          declaredIntentHint: 'creative-table',
          declaredProfileHint: 'storyboard',
        },
      },
      deps,
    );

    await flushAsyncWork();

    const routedRequest = (deps.messages?.handleUserMessage as any).mock.calls[0]?.[1];
    expect(routedRequest.messageText).toContain('普通 Storyboard Markdown 文档交接');
    expect(routedRequest.messageText).toContain('只有用户明确要求创建结构化生产节点时才升级');
    expect(routedRequest.messageText).not.toContain('canvas.createStoryboardFromMarkdown');
    expect(routedRequest.messageText).not.toContain('canvas.ingestMarkdown');
    expect(routedRequest.messageText).not.toContain('scene.basic + shot.basic');
  });

  it('routes general Canvas authoring handoff through Agent context without choosing Canvas tools', async () => {
    const deps = createDeps();
    const invoke = vi.fn();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-canvas',
      isActive: true,
      exports: {
        markdown: { invoke },
      },
      activate: vi.fn(),
    } as any);

    handleChatWebviewMessage(
      {
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'authoring-1',
        conversationId: 'conv-1',
        sourceKind: 'structured-content',
        sourceFormat: 'json',
        content: '{"kind":"semantic-storyboard-review","rows":[]}',
        title: 'Storyboard Review',
        stableRefs: [
          { kind: 'character', id: 'character-rin', namespace: 'entity', token: '@Rin' },
        ],
        diagnostics: [
          {
            severity: 'warning',
            code: 'prompt-span-needs-review',
            message: 'Prompt span needs review.',
            token: '@Rin',
          },
        ],
        promptSpans: [
          {
            kind: 'character',
            range: { start: 0, end: 4 },
            fieldId: 'character.ref',
            label: 'Rin',
            ref: { kind: 'character', id: 'character-rin', namespace: 'entity' },
          },
        ],
        targetHints: { declaredProfileHint: 'storyboard' },
      },
      deps,
    );

    await flushAsyncWork();

    expect(invoke).not.toHaveBeenCalled();
    expect(sendGeneratedAssetToPlugin).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(deps.messages?.handleUserMessage).toHaveBeenCalledWith(
      deps.webview,
      expect.objectContaining({
        conversationId: 'conv-1',
        sessionMode: 'agent',
        messageText: expect.stringContaining('Canvas authoring handoff intent'),
        contextPayloads: [
          expect.objectContaining({
            type: 'document-selection',
            id: 'authoring-1',
            label: 'Canvas 创作交接: Storyboard Review',
            summary: 'json, 0 个稳定 resource ref, 1 个稳定语义 ref, 1 个 handoff diagnostic',
            data: expect.objectContaining({
              kind: 'canvas-authoring-handoff',
              sourceKind: 'structured-content',
              content: '{"kind":"semantic-storyboard-review","rows":[]}',
              stableRefs: [
                { kind: 'character', id: 'character-rin', namespace: 'entity', token: '@Rin' },
              ],
              diagnostics: [
                {
                  severity: 'warning',
                  code: 'prompt-span-needs-review',
                  message: 'Prompt span needs review.',
                  token: '@Rin',
                },
              ],
              promptSpans: [
                {
                  kind: 'character',
                  range: { start: 0, end: 4 },
                  fieldId: 'character.ref',
                  label: 'Rin',
                  ref: { kind: 'character', id: 'character-rin', namespace: 'entity' },
                },
              ],
              targetHints: { declaredProfileHint: 'storyboard' },
            }),
          }),
        ],
      }),
    );
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'canvas_create_node',
    );
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'canvas_create_composite',
    );
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'neko.canvas.importAsset',
    );
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'canvas.ingestMarkdown',
    );
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'canvas.createStoryboardFromMarkdown',
    );
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'capabilityId',
    );
  });

  it('keeps Markdown projection hints as Agent handoff metadata instead of Canvas validation authority', async () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'markdown-projection-1',
        conversationId: 'conv-1',
        sourceKind: 'markdown',
        sourceFormat: 'gfm-table',
        content: [
          '| scene | shot | character | voice | imagePrompt | unknown review field |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | @Rin | whisper | quiet corridor ![panel](P1#panel_2) | keep as note |',
        ].join('\\n'),
        title: 'Prompt-first Storyboard Table',
        resources: [
          {
            token: 'P1',
            label: 'Panel 1',
            role: 'source',
            sourcePath: '${PROJECT}/assets/panel-1.png',
          },
        ],
        stableRefs: [
          {
            kind: 'character',
            id: 'character-rin',
            namespace: 'entity',
            token: '@Rin',
          },
        ],
        diagnostics: [
          {
            severity: 'warning',
            code: 'unknown-creative-table-column',
            message: 'Unknown Markdown column is preserved for Canvas review.',
            token: 'unknown review field',
          },
        ],
        promptSpans: [
          {
            kind: 'character',
            range: { start: 178, end: 182 },
            fieldId: 'character.ref',
            label: 'Rin',
            ref: {
              kind: 'character',
              id: 'character-rin',
              namespace: 'entity',
              token: '@Rin',
            },
            tone: 'character',
          },
          {
            kind: 'voice',
            range: { start: 185, end: 192 },
            fieldId: 'voice.cue',
            label: 'whisper',
            tone: 'voice',
          },
        ],
        userIntent: 'Review this Markdown projection in Canvas if useful.',
        targetHints: {
          sourceFormat: 'gfm-table',
          declaredIntentHint: 'creative-table',
          declaredProfileHint: 'storyboard',
        },
      },
      deps,
    );

    await flushAsyncWork();

    expect(deps.resolveLifecycleCapabilityDescriptor).not.toHaveBeenCalled();
    expect(deps.skillHandler.handleSkillInvocation).not.toHaveBeenCalled();
    expect(sendGeneratedAssetToPlugin).not.toHaveBeenCalled();
    expect(vscode.extensions.getExtension).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();

    const routedRequest = (deps.messages?.handleUserMessage as any).mock.calls[0]?.[1];
    const contextPayload = routedRequest?.contextPayloads?.[0];
    const handoffData = contextPayload?.data;
    expect(routedRequest).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        sessionMode: 'agent',
        messageText: expect.stringContaining('Agent 可见的 Canvas authoring handoff intent'),
      }),
    );
    expect(contextPayload).toEqual(
      expect.objectContaining({
        type: 'document-selection',
        id: 'markdown-projection-1',
        label: 'Canvas 创作交接: Prompt-first Storyboard Table',
        intent: 'Review this Markdown projection in Canvas if useful.',
      }),
    );
    expect(handoffData).toEqual(
      expect.objectContaining({
        kind: 'canvas-authoring-handoff',
        requestId: 'markdown-projection-1',
        sourceKind: 'markdown',
        sourceFormat: 'gfm-table',
        resources: [
          {
            token: 'P1',
            label: 'Panel 1',
            role: 'source',
            sourcePath: '${PROJECT}/assets/panel-1.png',
          },
        ],
        stableRefs: [
          {
            kind: 'character',
            id: 'character-rin',
            namespace: 'entity',
            token: '@Rin',
          },
        ],
        diagnostics: [
          {
            severity: 'warning',
            code: 'unknown-creative-table-column',
            message: 'Unknown Markdown column is preserved for Canvas review.',
            token: 'unknown review field',
          },
        ],
        promptSpans: [
          expect.objectContaining({
            kind: 'character',
            fieldId: 'character.ref',
            label: 'Rin',
          }),
          expect.objectContaining({
            kind: 'voice',
            fieldId: 'voice.cue',
            label: 'whisper',
          }),
        ],
        targetHints: {
          sourceFormat: 'gfm-table',
          declaredIntentHint: 'creative-table',
          declaredProfileHint: 'storyboard',
        },
      }),
    );

    expect(handoffData).not.toHaveProperty('capabilityId');
    expect(handoffData).not.toHaveProperty('input');
    expect(handoffData).not.toHaveProperty('intentHint');
    expect(handoffData).not.toHaveProperty('profileHint');
    expect(handoffData).not.toHaveProperty('fields');
    expect(handoffData).not.toHaveProperty('fieldValues');
    expect(handoffData).not.toHaveProperty('validatedFields');
    expect(JSON.stringify(handoffData)).not.toContain('canvas.ingestMarkdown');
    expect(JSON.stringify(handoffData)).not.toContain('canvas.createStoryboardFromMarkdown');
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'canvas_create_node',
    );
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'canvas_create_composite',
    );
    expect(JSON.stringify((deps.messages?.handleUserMessage as any).mock.calls)).not.toContain(
      'neko.canvas.importAsset',
    );
  });

  it('blocks unapproved Markdown production apply before Canvas API mutation', async () => {
    const deps = createDeps();
    const invoke = vi.fn();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-canvas',
      isActive: true,
      exports: {
        markdown: { invoke },
      },
      activate: vi.fn(),
    } as any);

    handleChatWebviewMessage(
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'req-apply',
        conversationId: 'conv-1',
        invocation: {
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'apply',
          payload: {
            capabilityId: 'canvas.createStoryboardFromMarkdown',
            markdown: '| visual |\\n| --- |\\n| open |',
            sourceFormat: 'gfm-table',
            mode: 'create-nodes',
          },
          provenance: { source: 'webview' },
        },
      },
      deps,
    );

    await flushAsyncWork();

    expect(invoke).not.toHaveBeenCalled();
    expect(deps.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCapabilityLifecycleResult',
        requestId: 'req-apply',
        conversationId: 'conv-1',
        success: false,
        lifecycleResult: expect.objectContaining({
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'apply',
          status: 'waiting-approval',
          diagnostics: [
            expect.objectContaining({
              code: 'agent-capability-lifecycle-approval-required',
              fieldKey: 'approval',
            }),
          ],
        }),
      }),
    );
  });

  it('fails visibly when no provider lifecycle descriptor is registered', async () => {
    const deps = {
      ...createDeps(),
      resolveLifecycleCapabilityDescriptor: vi.fn(() => undefined),
    };
    const invoke = vi.fn();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-canvas',
      isActive: true,
      exports: {
        markdown: { invoke },
      },
      activate: vi.fn(),
    } as any);

    handleChatWebviewMessage(
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'req-no-descriptor',
        conversationId: 'conv-1',
        invocation: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          payload: {
            capabilityId: 'canvas.ingestMarkdown',
            markdown: '| visual |\\n| --- |\\n| open |',
            sourceFormat: 'gfm-table',
          },
        },
      },
      deps,
    );

    await flushAsyncWork();

    expect(invoke).not.toHaveBeenCalled();
    expect(deps.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCapabilityLifecycleResult',
        requestId: 'req-no-descriptor',
        success: false,
        lifecycleResult: expect.objectContaining({
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          status: 'blocked',
          diagnostics: [
            expect.objectContaining({
              code: 'agent-capability-lifecycle-unknown-capability',
              fieldKey: 'capabilityId',
            }),
          ],
        }),
      }),
    );
  });

  it('fails visibly when Canvas Markdown lifecycle returns an invalid result', async () => {
    const deps = createDeps();
    const invoke = vi.fn().mockResolvedValue({});
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-canvas',
      isActive: true,
      exports: {
        markdown: { invoke },
      },
      activate: vi.fn(),
    } as any);

    handleChatWebviewMessage(
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'req-invalid-canvas-result',
        conversationId: 'conv-1',
        invocation: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          payload: {
            capabilityId: 'canvas.ingestMarkdown',
            markdown: '| visual |\\n| --- |\\n| open |',
            sourceFormat: 'gfm-table',
          },
          provenance: { source: 'webview' },
        },
      },
      deps,
    );

    await flushAsyncWork();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(deps.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCapabilityLifecycleResult',
        requestId: 'req-invalid-canvas-result',
        conversationId: 'conv-1',
        success: false,
        lifecycleResult: expect.objectContaining({
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          status: 'blocked',
          diagnostics: [
            expect.objectContaining({
              severity: 'error',
              code: 'canvas-markdown-invalid-result',
            }),
          ],
        }),
      }),
    );
  });

  it('fails visibly when Canvas Markdown lifecycle mutation returns no Canvas refs', async () => {
    const deps = createDeps();
    const invoke = vi.fn().mockResolvedValue({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'created',
      diagnostics: [],
    });
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-canvas',
      isActive: true,
      exports: {
        markdown: { invoke },
      },
      activate: vi.fn(),
    } as any);

    handleChatWebviewMessage(
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'req-missing-canvas-refs',
        conversationId: 'conv-1',
        invocation: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          payload: {
            capabilityId: 'canvas.ingestMarkdown',
            markdown:
              '| scene | shot | source | imagePrompt |\\n| --- | --- | --- | --- |\\n| S1 | 1 | P1 | prep |',
            sourceFormat: 'gfm-table',
            intentHint: 'creative-table',
            profileHint: 'storyboard',
          },
          provenance: { source: 'webview' },
        },
      },
      deps,
    );

    await flushAsyncWork();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(deps.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCapabilityLifecycleResult',
        requestId: 'req-missing-canvas-refs',
        conversationId: 'conv-1',
        success: false,
        lifecycleResult: expect.objectContaining({
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          status: 'blocked',
          diagnostics: [
            expect.objectContaining({
              severity: 'error',
              code: 'canvas-markdown-mutation-result-missing-ref',
            }),
          ],
        }),
      }),
    );
  });

  it('routes approved Markdown production apply through Canvas lifecycle backend', async () => {
    const deps = createDeps();
    const invoke = vi.fn().mockResolvedValue({
      capabilityId: 'canvas.createStoryboardFromMarkdown',
      status: 'created',
      diagnostics: [],
      nodeIds: ['scene-1', 'shot-1'],
    });
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-canvas',
      isActive: true,
      exports: {
        markdown: { invoke },
      },
      activate: vi.fn(),
    } as any);

    handleChatWebviewMessage(
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'req-apply-approved',
        conversationId: 'conv-1',
        invocation: {
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'apply',
          payload: {
            capabilityId: 'canvas.createStoryboardFromMarkdown',
            markdown: '| visual |\\n| --- |\\n| open |',
            sourceFormat: 'gfm-table',
            mode: 'create-nodes',
          },
          approval: { source: 'user-confirmation', approvedAt: 123 },
          provenance: { source: 'webview' },
        },
      },
      deps,
    );

    await flushAsyncWork();

    expect(invoke).toHaveBeenCalledWith({
      capabilityId: 'canvas.createStoryboardFromMarkdown',
      markdown: '| visual |\\n| --- |\\n| open |',
      sourceFormat: 'gfm-table',
      mode: 'create-nodes',
      approval: { source: 'user-confirmation', approvedAt: 123 },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sendGeneratedAssetToPlugin).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(deps.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCapabilityLifecycleResult',
        requestId: 'req-apply-approved',
        conversationId: 'conv-1',
        success: true,
        lifecycleResult: expect.objectContaining({
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'apply',
          status: 'applied',
          changedRefs: [
            expect.objectContaining({ kind: 'node', id: 'scene-1', packageId: 'neko-canvas' }),
            expect.objectContaining({ kind: 'node', id: 'shot-1', packageId: 'neko-canvas' }),
          ],
        }),
      }),
    );
  });

  it('projects Canvas review actions to runnable lifecycle payloads', async () => {
    const deps = createDeps();
    const invoke = vi.fn().mockResolvedValue({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'needs-review',
      resolvedKind: 'creative-table',
      profileId: 'storyboard',
      diagnostics: [],
      tableNodeId: 'table-1',
      actions: [
        {
          actionId: 'create-storyboard-nodes',
          label: 'Create storyboard nodes',
          capabilityId: 'canvas.createStoryboardFromMarkdown',
        },
      ],
    });
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-canvas',
      isActive: true,
      exports: {
        markdown: { invoke },
      },
      activate: vi.fn(),
    } as any);

    handleChatWebviewMessage(
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'req-review',
        conversationId: 'conv-1',
        invocation: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          payload: {
            capabilityId: 'canvas.ingestMarkdown',
            markdown: '| visual |\\n| --- |\\n| open |',
            sourceFormat: 'gfm-table',
            profileHint: 'storyboard',
          },
          provenance: { source: 'webview' },
        },
      },
      deps,
    );

    await flushAsyncWork();

    expect(deps.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCapabilityLifecycleResult',
        requestId: 'req-review',
        lifecycleResult: expect.objectContaining({
          actions: [
            expect.objectContaining({
              actionId: 'create-storyboard-nodes',
              capabilityId: 'canvas.createStoryboardFromMarkdown',
              payload: expect.objectContaining({
                capabilityId: 'canvas.createStoryboardFromMarkdown',
                markdown: '| visual |\\n| --- |\\n| open |',
                sourceFormat: 'gfm-table',
                profileHint: 'storyboard',
                mode: 'create-nodes',
              }),
            }),
          ],
        }),
      }),
    );
  });

  it('routes approved follow-up actions through Agent capability lifecycle backend', async () => {
    const deps = createDeps();
    const invoke = vi.fn().mockResolvedValue({
      capabilityId: 'canvas.createStoryboardFromMarkdown',
      status: 'created',
      diagnostics: [],
      nodeIds: ['scene-1'],
    });
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-canvas',
      isActive: true,
      exports: {
        markdown: { invoke },
      },
      activate: vi.fn(),
    } as any);

    handleChatWebviewMessage(
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'follow-up-approved',
        conversationId: 'conv-1',
        invocation: {
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'apply',
          payload: {
            capabilityId: 'canvas.createStoryboardFromMarkdown',
            markdown: '| visual |\\n| --- |\\n| open |',
            sourceFormat: 'gfm-table',
            mode: 'create-nodes',
          },
          approval: { source: 'user-confirmation', approvedAt: 456 },
          provenance: { source: 'webview' },
        },
      },
      deps,
    );

    await flushAsyncWork();

    expect(invoke).toHaveBeenCalledWith({
      capabilityId: 'canvas.createStoryboardFromMarkdown',
      markdown: '| visual |\\n| --- |\\n| open |',
      sourceFormat: 'gfm-table',
      mode: 'create-nodes',
      approval: { source: 'user-confirmation', approvedAt: 456 },
    });
    expect(sendGeneratedAssetToPlugin).not.toHaveBeenCalled();
    expect(deps.messages?.handleUserMessage).not.toHaveBeenCalled();
    expect(deps.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCapabilityLifecycleResult',
        requestId: 'follow-up-approved',
        conversationId: 'conv-1',
        success: true,
        lifecycleResult: expect.objectContaining({
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'apply',
          status: 'applied',
        }),
      }),
    );
  });

  it('routes document locator reveals to the file operation handler', () => {
    const deps = createDeps();
    const locator = { kind: 'page' as const, pageNumber: 2, pageIndex: 1 };

    handleChatWebviewMessage(
      {
        type: 'revealDocumentLocator',
        filePath: '/books/a.pdf',
        locator,
        source: { filePath: '/books/a.pdf', format: 'pdf' },
      },
      deps,
    );

    expect(deps.fileOperationHandler.handleRevealDocumentLocator).toHaveBeenCalledWith({
      filePath: '/books/a.pdf',
      locator,
      source: { filePath: '/books/a.pdf', format: 'pdf' },
    });
  });

  it('routes explicit asset reveals to the file operation handler', () => {
    const deps = createDeps();

    handleChatWebviewMessage({ type: 'revealAsset', assetId: 'asset-1' }, deps);

    expect(deps.fileOperationHandler.handleRevealAsset).toHaveBeenCalledWith('asset-1');
  });

  it('routes asset context source reveals through asset-library navigation data', () => {
    const deps = createDeps();

    handleChatWebviewMessage(
      {
        type: 'revealContextSource',
        contextType: 'asset',
        contextId: 'asset:asset-1',
        navigationData: {
          partition: 'asset-library',
          sourceId: 'asset-1',
          filePath: '${ASSETS}/hero.png',
        },
      },
      deps,
    );

    expect(deps.fileOperationHandler.handleRevealAsset).toHaveBeenCalledWith('asset-1');
    expect(deps.fileOperationHandler.handleOpenFile).not.toHaveBeenCalled();
  });

  it('routes media library context source reveals to the media library tree', () => {
    const deps = createDeps();
    vi.mocked(vscode.commands.executeCommand).mockClear();

    handleChatWebviewMessage(
      {
        type: 'revealContextSource',
        contextType: 'media',
        contextId: 'media-1',
        navigationData: {
          partition: 'media-library',
          filePath: '${REFS}/hero.png',
          resolvedPath: '/refs/hero.png',
        },
      },
      deps,
    );

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'neko.assets.revealMediaLibraryFile',
      '/refs/hero.png',
    );
    expect(deps.fileOperationHandler.handleOpenFile).not.toHaveBeenCalled();
  });

  it('rejects plugin slash commands without an explicit conversationId', () => {
    const deps = createDeps();
    vi.mocked(vscode.commands.executeCommand).mockClear();

    handleChatWebviewMessage(
      {
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
      } as WebviewToExtensionMessage,
      deps,
    );

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(deps.webview.postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'Cannot invoke plugin slash command without an explicit conversationId.',
    });
  });

  it('routes getSkills to the chat skill handler', () => {
    const deps = createDeps();

    handleChatWebviewMessage({ type: 'getSkills' }, deps);

    expect(deps.skillHandler.sendSkillsList).toHaveBeenCalledWith(deps.webview);
  });

  it('routes lifecycle config snapshot refresh without calling settings directly', () => {
    const deps = createDeps();

    handleChatWebviewMessage({ type: 'refreshConfigSnapshot' }, deps);

    expect(deps.refreshConfigSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.settingsHandler.sendSettings).not.toHaveBeenCalled();
  });
});

function createCanonicalStoryboardHandoffFixture() {
  return {
    schemaVersion: 1 as const,
    kind: 'storyboard-table' as const,
    contractVersion: 1 as const,
    sourceProfile: 'from-script' as const,
    revision: {
      revisionId: 'storyboard-rev-1',
      sequence: 1,
      contentDigest: 'storyboard-rev-1',
      createdAt: '2026-07-12T00:00:00.000Z',
    },
    sourceTrace: [
      {
        traceId: 'trace-1',
        sourceProfile: 'from-script' as const,
        sourceRef: {
          id: 'story-source-resource',
          scope: 'project' as const,
          provider: 'workspace',
          kind: 'document' as const,
          source: { kind: 'file' as const, projectRelativePath: 'scripts/story.md' },
          locator: { kind: 'file' as const, path: '${WORKSPACE}/scripts/story.md' },
          fingerprint: { strategy: 'hash' as const, value: 'story-source' },
        },
      },
    ],
    title: 'Cats',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Hallway',
        shots: [
          {
            shotId: 'shot-1',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'A cat enters.',
            characterAction: 'The cat walks.',
            imageStrategy: 'use-as-reference' as const,
            imagePrompt: 'cat keyframe',
            videoPrompt: 'cat scene motion',
            sourceMediaRefs: [
              {
                refId: 'source-image-1',
                role: 'source' as const,
                locator: {
                  type: 'workspace-path' as const,
                  path: '${WORKSPACE}/assets/cat.png',
                },
                resourceRef: {
                  id: 'source-image-resource',
                  scope: 'project' as const,
                  provider: 'workspace',
                  kind: 'media' as const,
                  source: { kind: 'file' as const, projectRelativePath: 'assets/cat.png' },
                  locator: { kind: 'file' as const, path: '${WORKSPACE}/assets/cat.png' },
                  fingerprint: { strategy: 'hash' as const, value: 'cat-image' },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task',
  };
}
