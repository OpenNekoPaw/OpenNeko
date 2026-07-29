/**
 * Agent Message Turn Handler
 *
 * Bridges user-message runtime contracts to VSCode host services.
 * Runtime owns dispatch sequencing; this layer injects webview, workspace,
 * media, and agent-turn adapters.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { buildFountainScriptIndex } from '@neko/content';
import type { AssistantRuntimeSettingsSnapshot, Platform } from '@neko/platform';
import {
  AGENT_RESOLVED_ENTITY_CONTEXT_KIND,
  AGENT_RESOLVED_ENTITY_CONTEXT_SCHEMA_VERSION,
  ENTITY_FACADE_COMMANDS,
  isAgentResolvedEntityContextData,
  isCreativeEntity,
  isCreativeEntityKind,
  isEntityFacadeCommandError,
  type AgentContextPayload,
  type CreativeEntityKind,
  type GeneratedAsset,
  type GeneratedOutputContentLocator,
  type NekoCanvasAPI,
} from '@neko/shared';
import type { GenerationJobPort } from '@neko/generation';
import { buildErrorMessage, buildGlobalErrorMessage } from '@neko-agent/types';
import type { IAgentManager } from '../ai/agentManager';
import { getCanvasSelection } from '../services/canvasAmbientContext';
import type { IEditorRegistry } from '../editor/common/editorRegistry';
import { SettingsManager } from './settingsManager';
import { ProviderManager } from './providerManager';
import { ConversationBridge } from './conversationBridge';
import { AttachmentProcessor } from './message/attachmentProcessor';
import { createPiAgentStreamSession } from './message/piAgentStreamProcessor';
import { MediaPreprocessor } from './message/mediaPreprocessor';
import {
  executeAgentProjectFileSearch,
  createAgentMessageId,
  createAgentStateRuntime,
  createWorkspaceInputProcessorRuntime,
  runAgentMessageTurnRuntime,
  type AgentProjectFileSearchPurpose,
  type AgentStateRuntime,
  type AgentStateRuntimeEntry,
  type AgentMessageRuntimeRequest,
  type WorkspaceInputProcessorRuntime,
} from '@neko/agent/runtime';
import { createInputProcessor, getConversationWorkDirHash, type InputProcessor } from '@neko/agent';
import { getLogger } from '../base';
import {
  getAgentMediaRuntimeProvider,
  type IAgentMediaRuntimeProvider,
} from '../services/mediaRuntimeProvider';
import { MediaTurnBridge } from '../services/mediaTurnBridge';
import { WorkspaceBoardProjectionHost } from '../services/workspaceBoardProjectionHost';
import type { AgentLocalResourceAccess } from '../services/localResourceAccess';
import { createVSCodeWorkspaceFileReader } from '../services/workspaceFileReader';
import { searchVSCodeProjectFiles } from '../services/workspaceProjectSearch';
import { searchProjectMentionCandidates } from '../services/projectMentionSearch';
import { AgentTurnBridge } from './message/agentTurnBridge';
import {
  formatAgentLlmConfigDiagnostics,
  resolveAgentLlmConfigForTurn,
} from './agentLlmConfigResolver';
import { getCapabilityRuntimeBindings } from '../bootstrap/capabilityBootstrap';

const logger = getLogger('AgentMessageTurnHandler');

export interface AgentMessageTurnHandlerOptions {
  readonly canvas: NekoCanvasAPI;
  readonly workspaceId?: string;
  readonly generationJobs?: GenerationJobPort;
  readonly resolveGenerationResult?: (locator: GeneratedOutputContentLocator) => {
    readonly path: string;
    readonly asset: GeneratedAsset;
  };
}

export class AgentMessageTurnHandler {
  private readonly _agentStateRuntime: AgentStateRuntime = createAgentStateRuntime();
  private readonly _inputProcessorRuntime: WorkspaceInputProcessorRuntime =
    createWorkspaceInputProcessorRuntime({
      createProcessor: (workspaceRoot) =>
        createInputProcessor({
          workspaceRoot,
          fileReader: createVSCodeWorkspaceFileReader(workspaceRoot),
        }),
    });
  private readonly _attachmentProcessor: AttachmentProcessor;
  private readonly _mediaTurnBridge: MediaTurnBridge;
  private readonly _workspaceBoardProjection: WorkspaceBoardProjectionHost;
  private readonly _agentTurnBridge: AgentTurnBridge;
  private readonly _disposables: vscode.Disposable[] = [];
  private _lastTextEditorUri: vscode.Uri | undefined = vscode.window.activeTextEditor?.document.uri;

  constructor(
    private readonly _settings: SettingsManager,
    private readonly _providers: ProviderManager,
    private readonly _conversations: ConversationBridge,
    private readonly _agentManager: IAgentManager | undefined,
    private readonly _editorRegistry: IEditorRegistry | undefined,
    private readonly _getSystemPrompt: (
      conversationId: string,
      executionMode: 'auto' | 'ask' | 'plan',
    ) => string,
    private readonly _options: AgentMessageTurnHandlerOptions,
    private readonly _platform?: Platform,
    private readonly _mediaRuntimeProvider: IAgentMediaRuntimeProvider = getAgentMediaRuntimeProvider(),
    private readonly _localResourceAccess?: AgentLocalResourceAccess,
  ) {
    this._workspaceBoardProjection = new WorkspaceBoardProjectionHost({
      workspaceId: this._options.workspaceId,
      getCanvasApi: async () => this._options.canvas,
    });
    this._attachmentProcessor = new AttachmentProcessor({
      contentAccessRuntime: getCapabilityRuntimeBindings().contentAccessRuntime,
    });

    this._mediaTurnBridge = new MediaTurnBridge({
      generationJobs: this._options.generationJobs,
      contentAccessRuntime: getCapabilityRuntimeBindings().contentAccessRuntime,
      resolveGenerationResult: this._options.resolveGenerationResult,
      getConversationProjection: (conversationId) => {
        if (!this._agentManager) {
          throw new Error('Direct media Timeline projection requires AgentManager.');
        }
        return this._agentManager.getOrCreateProjection(conversationId);
      },
      workspaceBoardProjection: this._workspaceBoardProjection,
      checkpointExternalTurn: (input) => this._conversations.checkpointExternalTurn(input),
      now: () => Date.now(),
    });

    const agentManager = this._agentManager;
    this._agentTurnBridge = new AgentTurnBridge({
      providers: this._providers,
      agentManager: this._agentManager,
      getSystemPrompt: this._getSystemPrompt,
      createPiStream: (conversationId, messageId, onPhaseChange) => {
        if (!agentManager) {
          throw new Error(
            `Agent stream ${conversationId} requires a conversation runtime projection owner.`,
          );
        }
        return createPiAgentStreamSession({
          conversationId,
          messageId,
          projection: agentManager.getOrCreateProjection(conversationId),
          onPhaseChange,
        });
      },
      terminalArtifactDelivery: this._workspaceBoardProjection,
      onPhaseChange: ({ conversationId, phase, toolName, timestamp }) =>
        this._updateAgentState(conversationId, phase, toolName, timestamp),
      generateMessageId: () => createAgentMessageId(),
    });
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.uri) {
          this._lastTextEditorUri = editor.document.uri;
        }
      }),
    );
  }

  /**
   * Get or create InputProcessor for the current workspace
   */
  private _getInputProcessor(): InputProcessor | null {
    return this._inputProcessorRuntime.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
  }

  getAgentStateSnapshot(): AgentStateRuntimeEntry[] {
    return this._agentStateRuntime.snapshot();
  }

  clearAgentState(conversationId: string): void {
    this._agentStateRuntime.clear(conversationId);
    this._agentTurnBridge.clearPendingTurns(conversationId);
  }

  /**
   * Handle incoming user message
   */
  async handleUserMessage(
    webview: vscode.Webview,
    request: AgentMessageRuntimeRequest,
  ): Promise<void> {
    const localizedRequest: AgentMessageRuntimeRequest = {
      ...request,
      locale: request.locale ?? vscode.env.language,
    };
    const groundedRequest = await this._resolveEntityContextPayloads(localizedRequest);
    const turnSettings = this._settings.snapshotForConversation(groundedRequest.conversationId);
    const resolvedRequest = this._resolveAgentTurnRequest(webview, groundedRequest, turnSettings);
    if (!resolvedRequest) {
      return;
    }
    await runAgentMessageTurnRuntime({
      request: resolvedRequest,
      beforePrepareAgentTurn: async ({ conversationId, userInput }) => {
        await this._conversations.initializeTitleFromUserInput(conversationId, userInput);
      },
      inputProcessor: this._getInputProcessor(),
      processAttachments: (attachments, options) =>
        this._attachmentProcessor.processAttachments(
          attachments ? [...attachments] : undefined,
          options,
        ),
      processContextImageResources: (resources) =>
        this._attachmentProcessor.processContextImageResources(resources),
      createReferencedMediaProcessor: async () =>
        new MediaPreprocessor(
          this._mediaRuntimeProvider.getRuntime(),
          getCapabilityRuntimeBindings().contentAccessRuntime,
        ),
      onReferenceError: (error) => {
        logger.warn(`Could not read file: ${error.reference}`, error.error);
      },
      onFileReferenceProcessingError: (error) => {
        logger.error('InputProcessor error:', error);
      },
      onReferencedMediaProcessed: ({ filePath, mediaType, metadata }) => {
        if (metadata) {
          logger.debug(`Preprocessed ${filePath}: ${mediaType}`, metadata);
        }
      },
      onReferencedMediaError: ({ filePath, error }) => {
        logger.warn(`Failed to preprocess media: ${filePath}`, error);
      },
      persistUserMessage: (conversationId, message) => {
        this._conversations.addMessageToConversation(conversationId, message);
      },
      removeUserMessage: (conversationId, messageId) => {
        this._conversations.removeMessageFromConversation(conversationId, messageId);
      },
      persistErrorMessage: (conversationId, message) => {
        this._conversations.addMessageToConversation(conversationId, message);
      },
      postMessage: (message) => {
        void webview.postMessage(message);
      },
      executeMediaTurn:
        this._options.generationJobs && this._options.resolveGenerationResult
          ? ({
              conversationId,
              prompt,
              mediaModel,
              userMessage,
              threeReferenceControls,
              selectedFileReferences,
            }) =>
              this._mediaTurnBridge.execute({
                webview,
                conversationId,
                prompt,
                mediaModel,
                userMessage,
                ...(threeReferenceControls ? { threeReferenceControls } : {}),
                ...(selectedFileReferences ? { selectedFileReferences } : {}),
              })
          : undefined,
      executeAgentTurn:
        this._agentManager && this._platform
          ? ({
              conversationId,
              message,
              pendingMessageSource,
              chatModel,
              llmRuntimeOptions,
              purposeModels,
              imageAttachments,
              executionOverrides,
              locale,
            }) =>
              this._agentTurnBridge
                .execute({
                  webview,
                  conversationId,
                  message,
                  ...(pendingMessageSource ? { pendingMessageSource } : {}),
                  chatModel,
                  llmRuntimeOptions,
                  purposeModels,
                  imageAttachments,
                  executionOverrides,
                  locale,
                  settings: turnSettings,
                })
                .then((result) => {
                  if (result.status === 'completed') return { status: 'completed' as const };
                  if (result.status === 'queued') {
                    return { status: 'queued' as const, pendingCount: result.pendingCount ?? 0 };
                  }
                  if (result.status === 'precondition-unmet') {
                    return {
                      status: 'precondition-unmet' as const,
                      reason: 'missing-chat-model' as const,
                    };
                  }
                  return { status: 'failed' as const, error: result.error };
                })
          : undefined,
      onMissingConversationId: () => {
        logger.warn('Rejected user message without conversationId');
      },
      generateMessageId: () => createAgentMessageId(),
      now: () => Date.now(),
    });
  }

  private _resolveAgentTurnRequest(
    webview: vscode.Webview,
    request: AgentMessageRuntimeRequest,
    settings: AssistantRuntimeSettingsSnapshot,
  ): AgentMessageRuntimeRequest | null {
    const resolved = resolveAgentLlmConfigForTurn({
      sessionMode: request.sessionMode,
      chatModel: request.chatModel,
      agentModels: request.agentModels,
      llmConfig: request.llmConfig,
      attachments: request.attachments,
      understandingModels: request.understandingModels,
      mediaModels: request.mediaModels,
      purposeModels: request.purposeModels,
      settings,
      providers: this._providers,
      platform: this._platform,
    });

    if (!resolved.ok) {
      const message = formatAgentLlmConfigDiagnostics(resolved.diagnostics);
      logger.warn('Rejected Agent turn LLM configuration', {
        conversationId: request.conversationId,
        diagnostics: resolved.diagnostics,
      });
      void webview.postMessage(
        request.conversationId
          ? buildErrorMessage({
              conversationId: request.conversationId,
              message,
            })
          : buildGlobalErrorMessage(message),
      );
      return null;
    }

    if (request.sessionMode !== 'agent') {
      return request;
    }

    return {
      ...request,
      chatModel: resolved.chatModel,
      agentModels: resolved.agentModels,
      understandingModels: resolved.understandingModels ?? request.understandingModels,
      llmConfig: resolved.llmConfig,
      llmRuntimeOptions: resolved.llmRuntimeOptions,
      purposeModels: resolved.purposeModels,
    };
  }

  private async _resolveEntityContextPayloads(
    request: AgentMessageRuntimeRequest,
  ): Promise<AgentMessageRuntimeRequest> {
    if (!request.contextPayloads?.some((payload) => payload.type === 'entity')) {
      return request;
    }

    const projectRoot = this._resolveEntityContextProjectRoot(request.conversationId);
    const contextPayloads: AgentContextPayload[] = [];
    for (const payload of request.contextPayloads) {
      if (payload.type !== 'entity') {
        contextPayloads.push(payload);
        continue;
      }
      const entityRef = isAgentResolvedEntityContextData(payload.data)
        ? payload.data.entityRef
        : readEntityMentionRef(payload);
      const result = await vscode.commands.executeCommand<unknown>(
        ENTITY_FACADE_COMMANDS.getEntity,
        { projectRoot, entityRef },
      );
      if (isEntityFacadeCommandError(result)) {
        throw new Error(
          `Agent Entity context resolution failed: ${result.code}: ${result.message}`,
        );
      }
      if (!isCreativeEntity(result)) {
        throw new Error(`Agent Entity context was not found: ${entityRef.entityId}`);
      }
      if (result.id !== entityRef.entityId || result.kind !== entityRef.entityKind) {
        throw new Error(
          `Agent Entity context identity mismatch: expected ${entityRef.entityKind}:${entityRef.entityId}, received ${result.kind}:${result.id}`,
        );
      }
      if (result.status !== 'confirmed') {
        throw new Error(`Agent Entity context is not confirmed: ${result.id}`);
      }
      contextPayloads.push({
        ...payload,
        data: {
          schemaVersion: AGENT_RESOLVED_ENTITY_CONTEXT_SCHEMA_VERSION,
          kind: AGENT_RESOLVED_ENTITY_CONTEXT_KIND,
          entityRef,
          entity: result,
        },
      });
    }
    return { ...request, contextPayloads };
  }

  private _resolveEntityContextProjectRoot(conversationId: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const conversationHash = conversationId.slice(0, 8);
    const matchingFolders = workspaceFolders.filter(
      (folder) => getConversationWorkDirHash(folder.uri.fsPath) === conversationHash,
    );
    if (matchingFolders.length === 1) {
      return matchingFolders[0]!.uri.fsPath;
    }
    if (matchingFolders.length > 1) {
      throw new Error(`Agent Entity context workspace is ambiguous: ${conversationId}`);
    }
    if (workspaceFolders.length === 1) {
      return workspaceFolders[0]!.uri.fsPath;
    }
    throw new Error(`Agent Entity context workspace cannot be resolved: ${conversationId}`);
  }

  private _updateAgentState(
    conversationId: string,
    phase: AgentStateRuntimeEntry['phase'],
    toolName: string | undefined,
    startedAt: number,
  ): void {
    this._agentStateRuntime.update({
      conversationId,
      phase,
      toolName,
      startedAt,
    });
  }

  /**
   * Search project files for @ reference.
   * Also appends canvas ambient nodes as mention extras so the webview can
   * show them as context-chip candidates alongside file results.
   */
  async searchProjectFiles(
    webview: vscode.Webview,
    filter: string,
    conversationId: string | undefined,
    options: { readonly purpose?: AgentProjectFileSearchPurpose } = {},
  ): Promise<void> {
    const searchContextUri = this._resolveSearchContextUri();
    const projectRoot = this._resolveSearchProjectRoot(conversationId, searchContextUri);
    const message = await executeAgentProjectFileSearch({
      conversationId,
      filter,
      purpose: options.purpose,
      searchProjectFiles: searchVSCodeProjectFiles,
      getMentionCandidates: (plan) =>
        searchProjectMentionCandidates(plan, {
          contextFilePath: searchContextUri?.fsPath,
          contextUri: searchContextUri?.toString(),
          projectRoot,
        }),
      getCanvasNodes: (id) => getCanvasSelection(id),
      getCharacters: async () => {
        try {
          if (!projectRoot) return [];
          const entities = await vscode.commands.executeCommand<unknown>(
            ENTITY_FACADE_COMMANDS.listEntities,
            { projectRoot, query: { kind: 'character' } },
          );
          if (!Array.isArray(entities)) return [];
          return entities.filter(isCreativeEntity).map((entity) => ({
            id: entity.id,
            name: entity.canonicalName,
            role:
              typeof entity.metadata?.['role'] === 'string' ? entity.metadata['role'] : undefined,
          }));
        } catch (error) {
          logger.warn('Failed to load retained Entity character projection', error);
          return [];
        }
      },
      getScenes: async () => {
        try {
          const editor = vscode.window.activeTextEditor;
          if (!editor || !editor.document.fileName.toLowerCase().endsWith('.fountain')) return [];
          const index = buildFountainScriptIndex({
            uri: editor.document.uri.toString(),
            content: editor.document.getText(),
          });
          return index.scenes.map((s) => ({
            id: s.sceneId,
            title: s.sceneTitle || s.heading,
            heading: s.heading,
          }));
        } catch (error) {
          logger.warn('Failed to project active Fountain scenes', error);
          return [];
        }
      },
      onSearchError: (error) => {
        logger.error('Error searching project files:', error);
      },
    });

    webview.postMessage(this._projectProjectFilesMessageForWebview(webview, message));
  }

  private _resolveSearchContextUri(): vscode.Uri | undefined {
    const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
    if (activeEditorUri) {
      this._lastTextEditorUri = activeEditorUri;
      return activeEditorUri;
    }
    return this._lastTextEditorUri;
  }

  private _resolveSearchProjectRoot(
    conversationId: string | undefined,
    contextUri: vscode.Uri | undefined,
  ): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (contextUri?.fsPath) {
      const fromContext = workspaceFolders.find((folder) =>
        isPathInsideWorkspace(contextUri.fsPath, folder.uri.fsPath),
      )?.uri.fsPath;
      if (fromContext) return fromContext;
    }

    if (conversationId) {
      const fromConversation = workspaceFolders.find(
        (folder) => getConversationWorkDirHash(folder.uri.fsPath) === conversationId.slice(0, 8),
      )?.uri.fsPath;
      if (fromConversation) return fromConversation;
    }

    return workspaceFolders[0]?.uri.fsPath;
  }

  private _projectProjectFilesMessageForWebview(
    webview: vscode.Webview,
    message: Awaited<ReturnType<typeof executeAgentProjectFileSearch>>,
  ): Awaited<ReturnType<typeof executeAgentProjectFileSearch>> {
    if (!this._localResourceAccess || !message.mentionExtras) {
      return message;
    }

    return {
      ...message,
      mentionExtras: message.mentionExtras.map((extra) => {
        if (!extra.thumbnailUri) return extra;
        const thumbnailUri =
          this._localResourceAccess?.toWebviewUri(
            webview,
            extra.thumbnailUri,
            'neko-agent.project-search-thumbnail',
          ) ?? extra.thumbnailUri;
        return { ...extra, thumbnailUri };
      }),
    };
  }

  /**
   * Dispose resources. Flushes asset index to disk.
   */
  dispose(): void {
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables.length = 0;
  }
}

function readEntityMentionRef(payload: AgentContextPayload): {
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
} {
  const data = readRecord(payload.data);
  const navigationData = readRecord(data?.['navigationData']);
  const entityId = readNonEmptyString(navigationData?.['sourceId']);
  const entityKind = navigationData?.['sourceKind'];
  if (
    data?.['source'] !== 'entity-graph' ||
    navigationData?.['partition'] !== 'creative-entities' ||
    !entityId ||
    !isCreativeEntityKind(entityKind)
  ) {
    throw new Error(`Agent Entity mention identity is invalid: ${payload.id}`);
  }
  return { entityId, entityKind };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isPathInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
  const relative = path.relative(workspaceRoot, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
