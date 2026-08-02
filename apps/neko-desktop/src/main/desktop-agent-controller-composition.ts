import { join } from 'node:path';

import { createSystemPromptBuilder } from '@neko-agent/runtime/prompt/system-prompt-builder';
import { createConversationId } from '@neko-agent/runtime/session/conversation-id';
import {
  PiToolConfirmationRegistry,
  registerOpenNekoPiProvider,
  resolveAgentModelPolicy,
  resolvePiToolPermissionAction,
  type AgentModelPolicy,
  type OpenNekoPiModelConfig,
  type OpenNekoPiProtocolProfile,
  type PiProductEventSink,
  type PiProductAgentEvent,
  type PiToolPermissionPolicy,
} from '@neko-agent/runtime/pi';
import {
  type AgentHostRouteEffectContext,
  type AgentConversationControllerTurnRequest,
  createAgentContentEffects,
  type AgentContentInteractionPort,
} from '@neko-agent/runtime/runtime/host-controller';
import {
  createAgentConversationMessageQueue,
  type AgentConversationMessageQueue,
} from '@neko-agent/runtime/runtime/session/agent-message-queue';
import {
  createConversationProjectionAttachmentServer,
  type ConversationProjectionAttachmentServer,
} from '@neko-agent/runtime/runtime/projection/conversation-projection-attachment-server';
import { projectPiConversationEntries } from '@neko-agent/runtime/runtime/projection/pi-conversation-history-projector';
import {
  AGENT_WEBVIEW_PROTOCOL_VERSION,
  buildAgentStateSnapshotMessage,
  buildConfigStateMessage,
  buildGlobalErrorMessage,
  buildHistoryClearedMessage,
  buildMessageQueueSnapshotMessage,
  buildQueuedMessageEditRequestedMessage,
  buildTabStateMessage,
  type OpenTab,
  type ProjectionAttachmentKey,
  type SettingsDataMessage,
  type TabState,
} from '@neko-agent/contracts';
import { ConfigManager } from '@neko/host/settings';
import { FileUserConfigManager } from '@neko/host/settings';
import {
  buildAssistantSettingsDataMessage,
  buildAssistantSettingsUpdatedMessage,
  type AssistantConfigState,
  type AssistantSettingsData,
} from '@neko/host/settings';
import { projectLlmParameters } from '@neko/host/settings';
import {
  createEffectiveAgentConfigurationProjection,
  type EffectiveAgentWorkspaceConfigSnapshot,
} from '@neko/host/settings';
import type { ModelConfig as Model, ProviderConfig as Provider } from '@neko-ai/contracts';
import type { NekoHostPorts } from '@neko/host/ports';
import type {
  DesktopAgentTurnConfigurationSnapshot,
  DesktopAgentTurnInput,
  DesktopAgentWorkspaceRuntime,
} from './desktop-agent-app-host-composition';
import type { DesktopAgentCredentialRuntime } from './desktop-agent-credential-runtime';
import type {
  DesktopAgentControllerComposition,
  DesktopAgentControllerEffects,
} from './desktop-agent-bridge-runtime';
import type { DesktopAgentConnectionIdentity } from '@neko-agent/contracts';
import {
  createDesktopAgentFactsProjector,
  createAgentResourceDisplayProjector,
  type DesktopAgentFactsProjector,
  type AgentResourceDisplayRegistrationPort,
  type AgentResourceDisplayProjector,
} from '@neko-agent/runtime/runtime';

export interface DesktopAgentConfigInteractionPort {
  openUserConfig(input: {
    readonly identity: AgentHostRouteEffectContext['identity'];
    readonly absolutePath: string;
  }): Promise<void>;
  openWorkspaceConfig(input: {
    readonly identity: AgentHostRouteEffectContext['identity'];
    readonly absolutePath: string;
  }): Promise<void>;
}

export interface CreateDesktopAgentControllerCompositionOptions {
  readonly host: Pick<NekoHostPorts, 'files' | 'paths' | 'accessPolicy' | 'external'>;
  readonly userHome: string;
  readonly credentialRuntime: DesktopAgentCredentialRuntime;
  readonly contentInteraction: AgentContentInteractionPort;
  readonly configInteraction: DesktopAgentConfigInteractionPort;
  readonly resources: AgentResourceDisplayRegistrationPort;
  readonly reportError: (error: Error) => void;
}

export function createDesktopAgentControllerComposition(
  options: CreateDesktopAgentControllerCompositionOptions,
): DesktopAgentControllerComposition {
  return new DefaultDesktopAgentControllerComposition(options);
}

class DefaultDesktopAgentControllerComposition implements DesktopAgentControllerComposition {
  readonly requirements = Object.freeze({
    'conversation-effects': true,
    'config-effects': true,
    'skill-effects': true,
    'content-effects': true,
    'projection-effects': true,
  } as const);

  private readonly configs = new Map<string, ConfigManager>();
  private readonly queues = new Map<string, AgentConversationMessageQueue>();
  private readonly confirmations = new Map<string, PiToolConfirmationRegistry>();
  private readonly pendingDisposals = new Set<Promise<void>>();

  constructor(private readonly options: CreateDesktopAgentControllerCompositionOptions) {}

  createEffects(input: {
    readonly workspace: DesktopAgentWorkspaceRuntime;
    readonly identity: DesktopAgentConnectionIdentity;
  }): DesktopAgentControllerEffects {
    const config = this.getConfig(input.workspace);
    const state: ConnectionState = {
      activeConversationId: null,
      tabState: { openTabs: [], activeTabId: null },
      tabStateRevision: 0,
    };
    let post: AgentHostRouteEffectContext['post'] | undefined;
    const facts = createDesktopAgentFactsProjector({ connection: input.identity });
    const resourceDisplay = createAgentResourceDisplayProjector({
      identity: input.identity,
      workspace: input.workspace.workspace,
      resources: this.options.resources,
      recordProjection: (fact) => facts.recordResourceDisplayProjection(fact),
    });
    const projection = createConversationProjectionAttachmentServer({
      endpointEpoch: input.identity.connectionId,
      resolveProjection: (conversationId) => ({
        conversationId,
        get projectionVersion() {
          return input.workspace.readConversationProjection(conversationId).projectionVersion;
        },
        apply: () => {
          throw new Error('Desktop projection attachment exposes a read-only projection view.');
        },
        snapshot: () => input.workspace.readConversationProjection(conversationId),
        subscribe: (listener) =>
          input.workspace.subscribeConversationProjection(conversationId, listener),
        dispose: () => {
          throw new Error('Desktop connection cannot dispose a workspace-owned projection.');
        },
      }),
      postMessage: async (message) => {
        if (!post)
          throw new Error('Desktop projection endpoint has no bound connection post port.');
        await post(await resourceDisplay.project(message));
        return true;
      },
      reportError: (error, key) => {
        resourceDisplay.releaseAttachment(key.attachmentId);
        this.options.reportError(error);
        if (post) {
          this.track(
            Promise.resolve(
              post({
                type: 'sessionDiagnostic',
                code: 'projection-attachment-protocol-fatal',
                severity: 'error',
                message: error.message,
                action: 'projection-attachment',
                conversationId: key.conversationId,
                tabId: key.tabId,
              }),
            ).then(() => undefined),
          );
        }
      },
    });

    const bind = (context: AgentHostRouteEffectContext): void => {
      if (context.identity.connectionId !== input.identity.connectionId) {
        throw new Error('Desktop Agent effect context does not match its connection owner.');
      }
      post = context.post;
    };
    let disposal: Promise<void> | undefined;
    const disposeOwned = (): Promise<void> => {
      disposal ??= Promise.resolve().then(async () => {
        try {
          resourceDisplay.dispose();
          await projection.abandon();
          facts.dispose();
        } catch (error) {
          facts.failDisposal();
          throw error;
        }
      });
      return disposal;
    };
    const effects: DesktopAgentControllerEffects = {
      conversation: this.createConversationEffects(input.workspace, config, state, bind, facts),
      config: this.createConfigEffects(input.workspace, config, state, bind),
      skill: this.createSkillEffects(input.workspace, config, bind, facts),
      content: createAgentContentEffects({
        workspace: input.workspace.workspace,
        host: this.options.host,
        interaction: this.options.contentInteraction,
      }),
      projection: this.createProjectionEffects(projection, resourceDisplay, bind),
      automation: {
        waitForIdle: async (conversationId, timeoutMs) => {
          const deadline = Date.now() + timeoutMs;
          while (input.workspace.readActiveTurn(conversationId)) {
            if (Date.now() >= deadline) {
              throw new Error(
                `Desktop Agent conversation '${conversationId}' did not reach terminal idle within ${timeoutMs}ms.`,
              );
            }
            await waitForFactsPoll();
          }
          const identity = facts.readLatestIdentity(conversationId);
          if (!identity) {
            throw new Error(
              `Desktop Agent conversation '${conversationId}' has no observed turn identity.`,
            );
          }
          return {
            conversationId: identity.conversationId,
            turnId: identity.turnId,
            runId: identity.runId,
          };
        },
        readLatestTurnIdentity: (conversationId) => facts.readLatestIdentity(conversationId),
        readFacts: (identity) => facts.readFacts(identity),
        disposeAndReadFacts: async (identity) => {
          await disposeOwned();
          return facts.readFacts(identity);
        },
      },
      dispose: () => {
        this.track(disposeOwned());
      },
    };
    return effects;
  }

  async dispose(): Promise<void> {
    for (const confirmation of this.confirmations.values()) confirmation.cancelAll();
    this.confirmations.clear();
    this.queues.clear();
    this.configs.clear();
    const results = await Promise.allSettled(this.pendingDisposals);
    this.pendingDisposals.clear();
    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to dispose Desktop Agent controller effects.');
    }
  }

  private createConversationEffects(
    workspace: DesktopAgentWorkspaceRuntime,
    config: ConfigManager,
    state: ConnectionState,
    bind: (context: AgentHostRouteEffectContext) => void,
    facts: DesktopAgentFactsProjector,
  ): DesktopAgentControllerEffects['conversation'] {
    const postConversationList = async (context: AgentHostRouteEffectContext): Promise<void> => {
      bind(context);
      const conversations = await Promise.all(
        workspace.listConversations().map(async (record) => ({
          id: record.conversationId,
          title: record.title,
          messageCount: (await workspace.readConversationEntries(record.conversationId)).filter(
            (entry) => entry.type === 'message' && entry.message.role !== 'toolResult',
          ).length,
          updatedAt: Date.parse(record.updatedAt),
        })),
      );
      await context.post({ type: 'conversationList', conversations });
    };
    const postConversation = async (
      conversationId: string | null,
      context: AgentHostRouteEffectContext,
      activation?: { readonly activationId: number; readonly tabStateRevision: number },
    ): Promise<void> => {
      bind(context);
      if (!conversationId) {
        await context.post({
          type: 'activeConversation',
          ...(activation ? { activation } : {}),
        });
        return;
      }
      const record = workspace
        .listConversations()
        .find((candidate) => candidate.conversationId === conversationId);
      if (!record)
        throw new Error(`Desktop Agent conversation '${conversationId}' does not exist.`);
      await context.post({
        type: 'activeConversation',
        ...(activation ? { activation } : {}),
        conversation: {
          id: conversationId,
          title: record.title,
          messages: projectPiConversationEntries(
            await workspace.readConversationEntries(conversationId),
          ),
        },
      });
    };

    const submit = (
      request: AgentConversationControllerTurnRequest,
      context: AgentHostRouteEffectContext,
      skillName?: string,
      additionalInstructions?: string,
    ): void => {
      bind(context);
      const operation = this.executeTurn({
        workspace,
        config,
        request,
        context,
        facts,
        ...(skillName ? { skillName } : {}),
        ...(additionalInstructions ? { additionalInstructions } : {}),
      });
      this.track(
        operation.catch(async (error: unknown) => {
          await context.post(buildGlobalErrorMessage(describeError(error)));
          throw error;
        }),
      );
    };

    return {
      submitTurn: (request, context) => submit(request, context),
      confirmTool: ({ conversationId, toolCallId, approved }, context) => {
        bind(context);
        this.getConfirmation(workspace.workspaceId, conversationId).resolve(toolCallId, approved);
      },
      cancelTurn: (conversationId, context) => {
        bind(context);
        const active = workspace.readActiveTurn(conversationId);
        if (!active)
          throw new Error(`Desktop Agent conversation '${conversationId}' is not running.`);
        workspace.cancelTurn(conversationId, active);
      },
      createConversation: async (context) => {
        bind(context);
        const conversationId = createConversationId(workspace.workspace.workspacePath);
        await workspace.createConversation(conversationId);
        state.activeConversationId = conversationId;
        const tab: OpenTab = {
          id: `tab-${conversationId}`,
          title: 'New conversation',
          conversationId,
        };
        state.tabState = {
          openTabs: [...state.tabState.openTabs, tab],
          activeTabId: tab.id,
        };
        state.tabStateRevision += 1;
        await postConversationList(context);
        await context.post(buildTabStateMessage(state.tabState, state.tabStateRevision));
        await postConversation(conversationId, context);
      },
      activateConversation: async (message, context) => {
        bind(context);
        if (message.expectedTabStateRevision !== state.tabStateRevision) {
          throw new Error(
            `Desktop Agent Tab revision ${message.expectedTabStateRevision} is stale; current revision is ${state.tabStateRevision}.`,
          );
        }
        const tab = message.tabState.openTabs.find((candidate) => candidate.id === message.tabId);
        if (!tab || tab.conversationId !== message.conversationId) {
          throw new Error('Desktop Agent conversation activation does not match its Tab identity.');
        }
        if (
          !workspace
            .listConversations()
            .some((record) => record.conversationId === message.conversationId)
        ) {
          throw new Error(`Desktop Agent conversation '${message.conversationId}' does not exist.`);
        }
        state.activeConversationId = message.conversationId;
        state.tabState = cloneTabState(message.tabState);
        state.tabStateRevision += 1;
        await context.post(buildTabStateMessage(state.tabState, state.tabStateRevision));
        await postConversation(message.conversationId, context, {
          activationId: message.activationId,
          tabStateRevision: state.tabStateRevision,
        });
      },
      deleteConversation: async ({ conversationId, activateNext }, context) => {
        bind(context);
        await workspace.deleteConversation(conversationId);
        this.queues.delete(ownerKey(workspace.workspaceId, conversationId));
        this.confirmations.get(ownerKey(workspace.workspaceId, conversationId))?.cancelAll();
        this.confirmations.delete(ownerKey(workspace.workspaceId, conversationId));
        state.tabState = {
          openTabs: state.tabState.openTabs.filter((tab) => tab.conversationId !== conversationId),
          activeTabId:
            state.tabState.openTabs.find((tab) => tab.id === state.tabState.activeTabId)
              ?.conversationId === conversationId
              ? null
              : state.tabState.activeTabId,
        };
        if (state.activeConversationId === conversationId) {
          state.activeConversationId =
            activateNext === false ? null : (state.tabState.openTabs[0]?.conversationId ?? null);
          state.tabState = {
            ...state.tabState,
            activeTabId:
              state.tabState.openTabs.find(
                (tab) => tab.conversationId === state.activeConversationId,
              )?.id ?? null,
          };
        }
        state.tabStateRevision += 1;
        await postConversationList(context);
        await context.post(buildTabStateMessage(state.tabState, state.tabStateRevision));
        if (activateNext !== false) {
          await postConversation(state.activeConversationId, context);
        }
      },
      listConversations: postConversationList,
      readActiveConversation: (context) => postConversation(state.activeConversationId, context),
      readAgentStates: async (context) => {
        bind(context);
        await context.post(
          buildAgentStateSnapshotMessage(
            workspace
              .listConversations()
              .flatMap((record) =>
                workspace.readActiveTurn(record.conversationId)
                  ? [{ conversationId: record.conversationId, phase: 'thinking' as const }]
                  : [],
              ),
          ),
        );
      },
      readConversationSnapshot: async (conversationId, context) => {
        bind(context);
        const record = workspace
          .listConversations()
          .find((candidate) => candidate.conversationId === conversationId);
        if (!record)
          throw new Error(`Desktop Agent conversation '${conversationId}' does not exist.`);
        await context.post({
          type: 'conversationSnapshot',
          conversation: {
            id: conversationId,
            title: record.title,
            messages: projectPiConversationEntries(
              await workspace.readConversationEntries(conversationId),
            ),
          },
        });
      },
      readMessageQueue: async (conversationId, context) => {
        bind(context);
        await context.post(
          buildMessageQueueSnapshotMessage(
            this.getQueue(workspace.workspaceId, conversationId).snapshot(),
          ),
        );
      },
      promoteQueuedMessage: async ({ conversationId, queueItemId }, context) => {
        bind(context);
        const queue = this.getQueue(workspace.workspaceId, conversationId);
        queue.promote(queueItemId);
        await context.post(buildMessageQueueSnapshotMessage(queue.snapshot()));
      },
      cancelQueuedMessage: async ({ conversationId, queueItemId }, context) => {
        bind(context);
        const queue = this.getQueue(workspace.workspaceId, conversationId);
        queue.remove(queueItemId);
        await context.post(buildMessageQueueSnapshotMessage(queue.snapshot()));
      },
      editQueuedMessage: async ({ tabId, conversationId, queueItemId }, context) => {
        bind(context);
        const queue = this.getQueue(workspace.workspaceId, conversationId);
        const item = queue.snapshot().items.find((candidate) => candidate.id === queueItemId);
        if (!item) throw new Error(`Queued message '${queueItemId}' does not exist.`);
        await context.post(
          buildQueuedMessageEditRequestedMessage({
            tabId,
            conversationId,
            item,
            snapshot: queue.snapshot(),
          }),
        );
      },
      clearHistory: async (conversationId, context) => {
        bind(context);
        const projection = workspace.readConversationProjection(conversationId);
        if (projection.turns.length > 0) {
          throw new Error(
            'Desktop Agent cannot clear a projected conversation until projection reset is attached.',
          );
        }
        await workspace.clearContext(conversationId);
        this.getQueue(workspace.workspaceId, conversationId).clear();
        await context.post(buildHistoryClearedMessage(conversationId));
      },
      clearAllConversations: async (context) => {
        bind(context);
        await workspace.clearAllConversations();
        state.activeConversationId = null;
        state.tabState = { openTabs: [], activeTabId: null };
        state.tabStateRevision += 1;
        await postConversationList(context);
        await context.post(buildTabStateMessage(state.tabState, state.tabStateRevision));
        await postConversation(null, context);
      },
    };
  }

  private createConfigEffects(
    workspace: DesktopAgentWorkspaceRuntime,
    config: ConfigManager,
    state: ConnectionState,
    bind: (context: AgentHostRouteEffectContext) => void,
  ): DesktopAgentControllerEffects['config'] {
    const safeConfig = (): AssistantConfigState =>
      projectDesktopAgentSecretSafeConfig(config.getAssistantConfigState());
    const safeSettings = (): AssistantSettingsData =>
      projectDesktopAgentSecretSafeSettings(config.getAssistantSettingsData());
    return {
      readSettings: async (conversationId, context) => {
        bind(context);
        await context.post(projectSettingsMessage(safeSettings(), conversationId));
      },
      readConfig: async (context) => {
        bind(context);
        await context.post(buildConfigStateMessage(safeConfig()));
      },
      refreshConfig: async (context) => {
        bind(context);
        config.reloadConfig();
        await context.post({ type: 'configChanged' });
        await context.post(buildConfigStateMessage(safeConfig()));
      },
      openUserConfig: async (context) => {
        bind(context);
        await this.options.configInteraction.openUserConfig({
          identity: context.identity,
          absolutePath: join(this.options.userHome, '.neko', 'config.toml'),
        });
      },
      openHostConfig: async (context) => {
        bind(context);
        await this.options.configInteraction.openWorkspaceConfig({
          identity: context.identity,
          absolutePath: join(workspace.workspace.workspacePath, '.neko', 'config.toml'),
        });
      },
      readTabState: async (context) => {
        bind(context);
        await context.post(buildTabStateMessage(state.tabState, state.tabStateRevision));
      },
      updateSettings: async ({ conversationId, settings }, context) => {
        bind(context);
        try {
          await config.applyRuntimeAssistantSettingsFromWebview(settings);
          await context.post(buildAssistantSettingsUpdatedMessage({ success: true }));
          await context.post(projectSettingsMessage(safeSettings(), conversationId));
        } catch (error) {
          await context.post(
            buildAssistantSettingsUpdatedMessage({
              success: false,
              error: describeError(error),
            }),
          );
          throw error;
        }
      },
      updateTabState: async (message, context) => {
        bind(context);
        if (message.expectedTabStateRevision !== state.tabStateRevision) {
          throw new Error(
            `Desktop Agent Tab revision ${message.expectedTabStateRevision} is stale; current revision is ${state.tabStateRevision}.`,
          );
        }
        const active = message.activeTabId
          ? message.openTabs.find((tab) => tab.id === message.activeTabId)
          : undefined;
        if (active && active.conversationId !== state.activeConversationId) {
          throw new Error(
            'Desktop ordinary conversation activation must use activateConversation.',
          );
        }
        state.tabState = {
          openTabs: message.openTabs.map(cloneTab),
          activeTabId: message.activeTabId,
        };
        state.tabStateRevision += 1;
        await context.post(buildTabStateMessage(state.tabState, state.tabStateRevision));
      },
    };
  }

  private createSkillEffects(
    workspace: DesktopAgentWorkspaceRuntime,
    config: ConfigManager,
    bind: (context: AgentHostRouteEffectContext) => void,
    facts: DesktopAgentFactsProjector,
  ): DesktopAgentControllerEffects['skill'] {
    return {
      listSkills: async (context) => {
        bind(context);
        const catalog = await workspace.readSkillCatalog(true);
        await context.post({
          type: 'skillsList',
          skills: catalog.records.map((skill) => ({
            name: skill.name,
            description: skill.description,
            source: skill.source.kind,
            enabled: skill.enabled,
            type: 'skill',
          })),
        });
      },
      invokeSlashCommand: async ({ conversationId, command, args }, context) => {
        bind(context);
        if (command === 'clear') {
          await workspace.clearContext(conversationId);
          await context.post(buildHistoryClearedMessage(conversationId));
          return;
        }
        await context.post({
          type: 'slashCommandResult',
          conversationId,
          command,
          success: false,
          error: `Desktop Agent slash command '/${command}' is not implemented.`,
          ...(args ? { data: { args } } : {}),
        });
      },
      invokeSkill: ({ conversationId, skillName, args }, context) => {
        bind(context);
        const request: AgentConversationControllerTurnRequest = {
          source: 'user-message',
          conversationId,
          messageText: args ?? '',
          sessionMode: 'agent',
          locale: 'en',
        };
        const operation = this.executeTurn({
          workspace,
          config,
          request,
          context,
          facts,
          skillName,
          ...(args ? { additionalInstructions: args } : {}),
        });
        this.track(operation);
      },
      readContextTokenCount: async (conversationId, context) => {
        bind(context);
        await context.post({
          type: 'contextTokenCount',
          conversationId,
          tokenCount: await workspace.readContextTokenCount(conversationId),
        });
      },
      compressContext: async (conversationId, context) => {
        bind(context);
        const settings = config.getAssistantRuntimeSettingsSnapshot();
        const { policy } = await this.resolveModelPolicy(workspace, config, {}, settings);
        const result = await workspace.compactContext(
          conversationId,
          policy['agent.main'].model.contextWindow,
        );
        await context.post({
          type: 'compressionResult',
          conversationId,
          compressedTokens: result.compressedTokens,
        });
      },
    };
  }

  private createProjectionEffects(
    projection: ConversationProjectionAttachmentServer,
    resourceDisplay: AgentResourceDisplayProjector,
    bind: (context: AgentHostRouteEffectContext) => void,
  ): DesktopAgentControllerEffects['projection'] {
    const run = async (
      operation: () => Promise<void>,
      key: ProjectionAttachmentKey,
      context: AgentHostRouteEffectContext,
    ): Promise<void> => {
      bind(context);
      try {
        await operation();
      } catch (error) {
        await context.post({
          type: 'sessionDiagnostic',
          code: 'projection-attachment-protocol-fatal',
          severity: 'error',
          message: describeError(error),
          action: 'projection-attachment',
          conversationId: key.conversationId,
          tabId: key.tabId,
        });
        throw error;
      }
    };
    return {
      discoverEndpoint: async (message, context) => {
        bind(context);
        if (message.protocolVersion !== AGENT_WEBVIEW_PROTOCOL_VERSION) {
          throw new Error(
            `Unsupported Desktop Agent projection protocol ${message.protocolVersion}.`,
          );
        }
        await context.post({
          type: 'projectionEndpointReady',
          protocolVersion: AGENT_WEBVIEW_PROTOCOL_VERSION,
          realmId: message.realmId,
          endpointEpoch: context.identity.connectionId,
        });
      },
      attach: (message, context) => run(() => projection.attach(message), message.key, context),
      acknowledge: (message, context) =>
        run(() => projection.acknowledge(message), message.key, context),
      detach: (message, context) =>
        run(
          async () => {
            await projection.detach(message);
            resourceDisplay.releaseAttachment(message.key.attachmentId);
          },
          message.key,
          context,
        ),
    };
  }

  private async executeTurn(input: {
    readonly workspace: DesktopAgentWorkspaceRuntime;
    readonly config: ConfigManager;
    readonly request: AgentConversationControllerTurnRequest;
    readonly context: AgentHostRouteEffectContext;
    readonly facts: DesktopAgentFactsProjector;
    readonly skillName?: string;
    readonly additionalInstructions?: string;
  }): Promise<void> {
    if (input.request.sessionMode !== 'agent') {
      throw new Error(
        `Desktop Agent does not support session mode '${input.request.sessionMode}'.`,
      );
    }
    if (
      input.request.attachments?.length ||
      input.request.contextPayloads?.length ||
      input.request.fileReferences?.length
    ) {
      throw new Error(
        'Desktop Agent attachment/context preprocessing is not connected to the Pi turn yet.',
      );
    }
    const record = input.workspace
      .listConversations()
      .find((candidate) => candidate.conversationId === input.request.conversationId);
    if (!record) {
      throw new Error(
        `Desktop Agent conversation '${input.request.conversationId}' does not exist.`,
      );
    }
    const settings = input.config.getAssistantRuntimeSettingsSnapshot();
    const resolved = await this.resolveModelPolicy(
      input.workspace,
      input.config,
      input.request,
      settings,
    );
    const locale = normalizeLocale(input.request.locale);
    const promptBuilder = createSystemPromptBuilder({
      locale,
      executionMode: settings.executionMode,
    });
    await promptBuilder.loadAgentsFile(
      input.workspace.workspace.workspacePath,
      join(this.options.userHome, '.neko'),
    );
    const systemPrompt = [
      promptBuilder.buildForExecutionMode(settings.executionMode),
      settings.customSystemPrompt.trim(),
    ]
      .filter(Boolean)
      .join('\n\n# User Instructions\n\n');
    await input.workspace.openConversation({
      conversationId: input.request.conversationId,
      models: input.workspace.models,
      initialModelPolicy: resolved.policy,
      baseSystemPrompt: systemPrompt,
    });
    const turnInput: DesktopAgentTurnInput = {
      conversationId: input.request.conversationId,
      prompt: input.request.messageText,
      modelPolicy: resolved.policy,
      configuration: resolved.configuration,
      permissionPolicy: (events) =>
        this.createPermissionPolicy(
          input.workspace,
          input.request.conversationId,
          settings.executionMode,
          events,
        ),
      workspaceTrusted: true,
      locale,
      systemPrompt,
      ...(input.skillName ? { skillName: input.skillName } : {}),
      ...(input.additionalInstructions
        ? { additionalInstructions: input.additionalInstructions }
        : {}),
    };
    const factsEvents = createDeferredDesktopAgentFactsEvents();
    const observedTurnInput: DesktopAgentTurnInput = {
      ...turnInput,
      events: factsEvents.events,
    };
    const operation = input.workspace.startTurn(observedTurnInput);
    factsEvents.bind(input.facts.beginTurn({ identity: operation.identity, systemPrompt }));
    await input.context.post({
      type: 'agentPhase',
      conversationId: input.request.conversationId,
      phase: 'thinking',
      timestamp: Date.now(),
    });
    try {
      const turn = await operation.completion;
      input.facts.completeTurn({
        conversation: input.workspace.readConversationEvidence(input.request.conversationId),
        turn,
      });
    } finally {
      await input.context.post({
        type: 'agentPhase',
        conversationId: input.request.conversationId,
        phase: 'idle',
        timestamp: Date.now(),
      });
    }
  }

  private async resolveModelPolicy(
    workspace: DesktopAgentWorkspaceRuntime,
    config: ConfigManager,
    request: Partial<AgentConversationControllerTurnRequest>,
    settings: ReturnType<ConfigManager['getAssistantRuntimeSettingsSnapshot']>,
  ): Promise<{
    readonly policy: AgentModelPolicy;
    readonly configuration: DesktopAgentTurnConfigurationSnapshot;
  }> {
    const selected =
      request.agentModels?.primary ??
      request.chatModel ??
      (settings.selectedProviderId && settings.selectedModelId
        ? {
            providerId: settings.selectedProviderId,
            modelId: settings.selectedModelId,
            category: 'llm' as const,
          }
        : undefined);
    if (!selected) {
      throw new Error('Choose a configured Desktop Agent provider and model before sending.');
    }
    const selectionIsRequestOwned =
      request.agentModels?.primary !== undefined || request.chatModel !== undefined;
    const requestedSnapshot = config.getEffectiveAgentWorkspaceConfigSnapshot(
      selectionIsRequestOwned
        ? {
            selectedProviderId: selected.providerId,
            selectedModelId: selected.modelId,
          }
        : {},
    );
    const requestedConfiguration = createEffectiveAgentConfigurationProjection(requestedSnapshot);
    const provider = config.getProvider(selected.providerId);
    const model = config.getModel(selected.modelId);
    validateModelSelection(provider, model, selected.providerId, selected.modelId);
    if (!provider || !model)
      throw new Error('Validated Desktop Agent model selection disappeared.');
    if (provider.apiKey) {
      await this.options.credentialRuntime.credentials.replace(
        provider.id,
        { type: 'api_key', key: provider.apiKey },
        'user-config-import',
      );
    }
    const projection = registerOpenNekoPiProvider(workspace.models, {
      id: provider.id,
      name: provider.displayName,
      baseUrl: provider.apiUrl,
      protocol: requireProtocol(model.protocolProfile ?? provider.protocolProfile),
      requiresApiKey: provider.requiresApiKey !== false,
      auth: resolveAuth(provider, model),
      models: [projectPiModel(model)],
    });
    let credential = await this.options.credentialRuntime.credentials.read(provider.id);
    if (provider.requiresApiKey !== false && credential === undefined) {
      await this.options.credentialRuntime.auth.login({
        provider: projection.provider,
        method: 'api-key',
        interaction: this.options.credentialRuntime.interaction,
      });
      credential = await this.options.credentialRuntime.credentials.read(provider.id);
    }
    const projectedModel = projection.models.find((candidate) => candidate.id === model.name);
    if (!projectedModel) {
      throw new Error(`Desktop Pi model '${provider.id}/${model.name}' was not registered.`);
    }
    const parameters = projectLlmParameters({
      provider,
      model,
      llmConfig: request.llmConfig,
      runtimeDefaults: {
        temperature: settings.temperature,
        maxOutputTokens: settings.maxTokens,
        thinkingBudget: settings.thinkingBudget,
      },
    });
    const blocking = parameters.diagnostics.find(
      (diagnostic) => diagnostic.code === 'invalid-anthropic-thinking-sampling-combination',
    );
    if (blocking) throw new Error(blocking.message);
    const policy = resolveAgentModelPolicy({
      catalog: [
        {
          model: projectedModel,
          capabilities: [...new Set([...model.capabilities, 'llm.chat', 'agent.main'])],
          credentialState:
            provider.requiresApiKey === false
              ? 'not-required'
              : credential === undefined
                ? 'missing'
                : 'configured',
        },
      ],
      userBindings: {
        'agent.main': {
          providerId: provider.id,
          modelId: model.name,
          parameters: {
            ...(parameters.chatOptions.temperature === undefined
              ? {}
              : { temperature: parameters.chatOptions.temperature }),
            ...(parameters.chatOptions.topP === undefined
              ? {}
              : { topP: parameters.chatOptions.topP }),
            ...(parameters.chatOptions.maxTokens === undefined
              ? {}
              : { maxTokens: parameters.chatOptions.maxTokens }),
            ...(parameters.chatOptions.thinkingBudget && parameters.chatOptions.thinkingBudget > 0
              ? {
                  thinkingLevel: 'medium',
                  thinkingBudgets: { medium: parameters.chatOptions.thinkingBudget },
                }
              : {}),
          },
        },
      },
      requirements: { 'agent.main': { capabilities: ['llm.chat'] } },
    });
    const effectiveSnapshot: EffectiveAgentWorkspaceConfigSnapshot = {
      ...requestedSnapshot,
      temperature: parameters.chatOptions.temperature ?? requestedSnapshot.temperature,
      maxTokens: parameters.chatOptions.maxTokens ?? requestedSnapshot.maxTokens,
      thinkingBudget: parameters.chatOptions.thinkingBudget ?? requestedSnapshot.thinkingBudget,
      sources: {
        ...requestedSnapshot.sources,
        ...(parameters.chatOptions.temperature === undefined ||
        parameters.chatOptions.temperature === requestedSnapshot.temperature
          ? {}
          : { temperature: 'runtime' as const }),
        ...(parameters.chatOptions.maxTokens === undefined ||
        parameters.chatOptions.maxTokens === requestedSnapshot.maxTokens
          ? {}
          : { maxTokens: 'runtime' as const }),
        ...(parameters.chatOptions.thinkingBudget === undefined ||
        parameters.chatOptions.thinkingBudget === requestedSnapshot.thinkingBudget
          ? {}
          : { thinkingBudget: 'runtime' as const }),
      },
    };
    const configuration: DesktopAgentTurnConfigurationSnapshot = Object.freeze({
      requested: requestedConfiguration,
      effective: createEffectiveAgentConfigurationProjection(effectiveSnapshot),
      diagnostics: Object.freeze(
        parameters.diagnostics.map((diagnostic) =>
          Object.freeze({ code: diagnostic.code, message: diagnostic.message }),
        ),
      ),
    });
    return { policy, configuration };
  }

  private createPermissionPolicy(
    workspace: DesktopAgentWorkspaceRuntime,
    conversationId: string,
    mode: 'auto' | 'ask' | 'plan',
    events: PiProductEventSink,
  ): PiToolPermissionPolicy {
    const confirmations = this.getConfirmation(workspace.workspaceId, conversationId);
    return {
      preflight: async ({ tool, args, identity, signal }) => {
        const action = resolvePiToolPermissionAction(
          mode,
          tool.requiresConfirmation,
          tool.isReadOnly,
        );
        if (action === 'deny') {
          return { allowed: false, reason: 'Tool execution is disabled in plan mode.' };
        }
        if (action === 'allow') return { allowed: true };
        const confirmationId = `confirmation:${identity.toolCallId}`;
        const allowed = await confirmations.request(
          identity.toolCallId,
          () =>
            events.emit({
              type: 'confirmation.required',
              identity,
              timestamp: Date.now(),
              confirmationId,
              toolCallId: identity.toolCallId,
              toolName: tool.name,
              summary: summarizeToolConfirmation(tool.name, args),
            }),
          signal,
        );
        await events.emit({
          type: 'confirmation.resolved',
          identity,
          timestamp: Date.now(),
          confirmationId,
          toolCallId: identity.toolCallId,
          toolName: tool.name,
          approved: allowed,
        });
        return allowed
          ? { allowed: true }
          : { allowed: false, reason: `User denied tool ${tool.name}.` };
      },
    };
  }

  private getConfig(workspace: DesktopAgentWorkspaceRuntime): ConfigManager {
    const existing = this.configs.get(workspace.workspaceId);
    if (existing) return existing;
    const config = new ConfigManager({
      userConfigManager: new FileUserConfigManager({
        filePath: join(this.options.userHome, '.neko', 'config.toml'),
      }),
      workspacePath: workspace.workspace.workspacePath,
    });
    this.configs.set(workspace.workspaceId, config);
    return config;
  }

  private getQueue(workspaceId: string, conversationId: string): AgentConversationMessageQueue {
    const key = ownerKey(workspaceId, conversationId);
    const existing = this.queues.get(key);
    if (existing) return existing;
    const queue = createAgentConversationMessageQueue({ conversationId });
    this.queues.set(key, queue);
    return queue;
  }

  private getConfirmation(workspaceId: string, conversationId: string): PiToolConfirmationRegistry {
    const key = ownerKey(workspaceId, conversationId);
    const existing = this.confirmations.get(key);
    if (existing) return existing;
    const confirmations = new PiToolConfirmationRegistry();
    this.confirmations.set(key, confirmations);
    return confirmations;
  }

  private track(operation: Promise<void>): void {
    this.pendingDisposals.add(operation);
    void operation.then(
      () => this.pendingDisposals.delete(operation),
      (error: unknown) => {
        this.pendingDisposals.delete(operation);
        this.options.reportError(toError(error));
      },
    );
  }
}

interface ConnectionState {
  activeConversationId: string | null;
  tabState: TabState;
  tabStateRevision: number;
}

export function projectDesktopAgentSecretSafeConfig(
  config: AssistantConfigState,
): AssistantConfigState {
  return {
    ...config,
    providers: config.providers.map((provider) => ({ ...provider })),
    configuredProviders: config.configuredProviders.map(({ apiKey: _apiKey, ...provider }) => ({
      ...provider,
    })),
  };
}

function projectDesktopAgentSecretSafeSettings(
  settings: AssistantSettingsData,
): AssistantSettingsData {
  return {
    ...settings,
    providers: settings.providers.map((provider) => ({ ...provider })),
    configuredProviders: settings.configuredProviders.map(({ apiKey: _apiKey, ...provider }) => ({
      ...provider,
    })),
  };
}

function projectSettingsMessage(
  settings: AssistantSettingsData,
  conversationId: string,
): SettingsDataMessage {
  const configuredProviderIds = new Set(
    settings.configuredProviders.map((provider) => provider.id),
  );
  const message = buildAssistantSettingsDataMessage(settings);
  return {
    ...message,
    conversationId,
    providers: settings.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      isConfigured: configuredProviderIds.has(provider.id),
      models: provider.models.map((model) => ({
        id: model.id,
        name: model.name,
        description: '',
      })),
    })),
    configuredProviders: settings.configuredProviders.map(({ apiKey: _apiKey, ...provider }) => ({
      ...provider,
    })),
  };
}

function validateModelSelection(
  provider: Provider | undefined,
  model: Model | undefined,
  providerId: string,
  modelId: string,
): void {
  if (!provider || provider.enabled === false) {
    throw new Error(`Desktop Agent provider '${providerId}' is missing or disabled.`);
  }
  if (!model || model.enabled === false) {
    throw new Error(`Desktop Agent model '${modelId}' is missing or disabled.`);
  }
  if (model.providerId !== provider.id) {
    throw new Error(
      `Desktop Agent model '${model.id}' belongs to '${model.providerId}', not '${provider.id}'.`,
    );
  }
  if (model.type !== undefined && model.type !== 'llm') {
    throw new Error(`Desktop Agent model '${model.id}' is not an LLM.`);
  }
  if (!provider.apiUrl) {
    throw new Error(`Desktop Agent provider '${provider.id}' has no API URL.`);
  }
  if (!model.contextWindow || !model.maxOutputTokens) {
    throw new Error(
      `Desktop Agent model '${provider.id}/${model.id}' requires contextWindow and maxOutputTokens.`,
    );
  }
}

function projectPiModel(model: Model): OpenNekoPiModelConfig {
  if (!model.contextWindow || !model.maxOutputTokens) {
    throw new Error(`Desktop Agent model '${model.id}' lacks Pi token limits.`);
  }
  return {
    id: model.name,
    name: model.displayName ?? model.name,
    ...(model.protocolProfile ? { protocol: requireProtocol(model.protocolProfile) } : {}),
    input: model.capabilities.some((capability) =>
      ['vision', 'llm.vision', 'image.understand'].includes(capability),
    )
      ? ['text', 'image']
      : ['text'],
    reasoning: model.capabilities.includes('reasoning'),
    contextWindow: model.contextWindow,
    maxTokens: model.maxOutputTokens,
    cost: {
      ...(model.inputCostPer1k === undefined ? {} : { input: model.inputCostPer1k }),
      ...(model.outputCostPer1k === undefined ? {} : { output: model.outputCostPer1k }),
    },
  };
}

function requireProtocol(protocol: string | undefined): OpenNekoPiProtocolProfile {
  if (
    protocol === 'newapi' ||
    protocol === 'openai-chat' ||
    protocol === 'openai-responses' ||
    protocol === 'anthropic' ||
    protocol === 'google' ||
    protocol === 'ollama'
  ) {
    return protocol;
  }
  throw new Error(`Desktop Agent provider protocol '${String(protocol)}' is unsupported.`);
}

function resolveAuth(
  provider: Provider,
  model: Model,
):
  | { readonly type: 'provider-default' }
  | { readonly type: 'bearer' }
  | { readonly type: 'api-key' }
  | { readonly type: 'custom-header'; readonly header: string } {
  if (model.useBearerAuth ?? provider.useBearerAuth) return { type: 'bearer' };
  if (provider.protocolVariant?.authType === 'bearer') return { type: 'bearer' };
  if (provider.protocolVariant?.authType === 'api-key') return { type: 'api-key' };
  if (provider.protocolVariant?.authType === 'custom-header') {
    const header = provider.protocolVariant.authHeader;
    if (!header) throw new Error(`Desktop Agent provider '${provider.id}' lacks auth header.`);
    return { type: 'custom-header', header };
  }
  return { type: 'provider-default' };
}

function cloneTabState(tabState: TabState): TabState {
  return {
    openTabs: tabState.openTabs.map(cloneTab),
    activeTabId: tabState.activeTabId,
  };
}

function cloneTab(tab: OpenTab): OpenTab {
  return structuredClone(tab);
}

function normalizeLocale(locale: string | undefined): 'en' | 'zh' {
  return locale?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function ownerKey(workspaceId: string, conversationId: string): string {
  return `${workspaceId}\u0000${conversationId}`;
}

function createDeferredDesktopAgentFactsEvents(): {
  readonly events: PiProductEventSink;
  bind(sink: PiProductEventSink): void;
} {
  const buffered: PiProductAgentEvent[] = [];
  let target: PiProductEventSink | undefined;
  return {
    events: {
      emit(event) {
        if (!target) {
          buffered.push(event);
          return;
        }
        return target.emit(event);
      },
    },
    bind(sink) {
      if (target) throw new Error('Desktop Agent facts event sink is already bound.');
      target = sink;
      for (const event of buffered.splice(0)) {
        const result = target.emit(event);
        if (result instanceof Promise) {
          throw new Error(
            'Desktop Agent facts projector must consume buffered events synchronously.',
          );
        }
      }
    },
  };
}

function waitForFactsPoll(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

function summarizeToolConfirmation(toolName: string, args: unknown): string {
  const keys =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? Object.keys(args).sort().slice(0, 8)
      : [];
  return keys.length === 0 ? `Run ${toolName}` : `Run ${toolName} with ${keys.join(', ')}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
