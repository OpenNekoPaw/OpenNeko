import { join } from 'node:path';

import { createSystemPromptBuilder } from '@neko/agent-runtime/prompt/system-prompt-builder';
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
} from '@neko/agent-runtime/pi';
import {
  type AgentHostControllerEffectPorts,
  type AgentHostRouteEffectContext,
  type AgentConversationControllerTurnRequest,
  createAgentContentEffects,
  type AgentLinkedMediaLibraryFileSearchInput,
  type AgentContentInteractionPort,
} from '@neko/agent-runtime/runtime/host-controller';
import {
  createConversationProjectionAttachmentServer,
  type ConversationProjectionAttachmentServer,
} from '@neko/agent-runtime/runtime/projection/conversation-projection-attachment-server';
import { projectPiConversationEntries } from '@neko/agent-runtime/runtime/projection/pi-conversation-history-projector';
import {
  buildAgentInputCatalogMessage,
  buildErrorMessage,
  buildAgentSessionDiagnosticMessage,
  buildAgentStateSnapshotMessage,
  buildConfigStateMessage,
  buildHistoryClearedMessage,
  buildInjectContextMessage,
  buildMessageQueueSnapshotMessage,
  buildQueuedMessageEditRequestedMessage,
  buildTabStateMessage,
  type DesktopAgentNeutralFacts,
  type AgentBoundDomainBinding,
  type AgentConfigurationPolicyProjection,
  type AgentConfigurationRequest,
  type AgentConversationConfiguration,
  type AgentConversationTurnConfigurationSnapshot,
  type AgentContextPayload,
  type AgentFileReference,
  type AgentMessageQueueSnapshot,
  type OpenTab,
  type Message,
  type ProjectionAttachmentKey,
  type SettingsDataMessage,
  type TabState,
  isAgentInputCatalogEntryExecutable,
  parseAgentConfigurationRequest,
  type AgentConfigurationFieldProjection,
} from '@neko/agent-contracts';
import type { ConfigManager } from '@neko/host/settings';
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
import type { ModelConfig as Model, ProviderConfig as Provider } from '@neko/ai-contracts';
import type { NekoHostPorts } from '@neko/host/ports';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type { WorkspaceFileContentLocator } from '@neko/content';
import {
  AgentQueuedTurnCancellationError,
  type AgentTurnConfigurationSnapshot,
  type AgentTurnInput,
  type AgentVisiblePresentationBinding,
  type AgentWorkspaceRuntime,
} from './agent-app-host';
import type { AgentCredentialRuntime } from '@neko/agent-runtime/pi';
import type { DesktopAgentConnectionIdentity } from '@neko/agent-contracts';
import {
  createAgentStateRuntime,
  createDesktopAgentFactsProjector,
  createAgentResourceDisplayProjector,
  type AgentStateRuntime,
  type DesktopAgentFactsProjector,
  type AgentResourceDisplayRegistrationPort,
  type AgentResourceDisplayProjector,
} from '@neko/agent-runtime/runtime';
import {
  assertAgentConfigurationPolicyAllowsRequest,
  projectAgentConfigurationPolicy,
  projectAgentInputCatalog,
  projectAgentModelCatalog,
} from './agent-launch-service';

const SESSION_COMMAND_HANDLER_IDS = new Set(['builtin:clear', 'builtin:compact']);

export interface AgentControllerEffects extends AgentHostControllerEffectPorts {
  injectContext(payload: AgentContextPayload): Promise<void>;
  readonly automation?: {
    waitForIdle(
      conversationId: string,
      timeoutMs: number,
      afterIdentity?: { readonly turnId: string; readonly runId: string },
    ): Promise<{
      readonly conversationId: string;
      readonly turnId: string;
      readonly runId: string;
    }>;
    readLatestTurnIdentity(conversationId: string):
      | {
          readonly conversationId: string;
          readonly turnId: string;
          readonly runId: string;
        }
      | undefined;
    readFacts(identity: {
      readonly conversationId: string;
      readonly turnId: string;
      readonly runId: string;
    }): DesktopAgentNeutralFacts;
    disposeAndReadFacts(identity: {
      readonly conversationId: string;
      readonly turnId: string;
      readonly runId: string;
    }): Promise<DesktopAgentNeutralFacts>;
  };
  dispose(): void;
}

export interface AgentControllerComposition {
  readonly requirements: Readonly<
    Partial<
      Record<
        | 'conversation-effects'
        | 'config-effects'
        | 'skill-effects'
        | 'content-effects'
        | 'projection-effects'
        | 'pi-runtime',
        true
      >
    >
  >;
  createEffects(input: {
    readonly workspace: AgentWorkspaceRuntime;
    readonly identity: DesktopAgentConnectionIdentity;
    readonly initialConversationId?: string;
    readonly initialConversationMessage?: Message;
    readonly readConversationContext?: (conversationId: string) => Promise<AgentBoundDomainBinding>;
    readonly readConversationConfiguration?: (
      conversationId: string,
    ) => Promise<AgentConversationConfiguration>;
    readonly updateConversationConfiguration?: (input: {
      readonly conversationId: string;
      readonly request: AgentConfigurationRequest;
      readonly projection: AgentConfigurationPolicyProjection;
    }) => Promise<AgentConversationConfiguration>;
    readonly readGlobalSkillCatalog?: () => Promise<import('./agent-app-host').AgentSkillCatalog>;
    readonly personalSkillOwnerId?: string;
  }): AgentControllerEffects;
  readonly startInitialTurn?: (input: {
    readonly workspace: AgentWorkspaceRuntime;
    readonly conversationId: string;
    readonly turnId: string;
    readonly messageText: string;
    readonly presentationText?: string;
    readonly configuration: AgentConversationTurnConfigurationSnapshot;
    readonly context: AgentBoundDomainBinding;
    readonly locale: 'en' | 'zh';
    readonly contextPayloads?: readonly AgentContextPayload[];
    readonly skillName?: string;
    readonly skillActivationId?: string;
    readonly additionalInstructions?: string;
  }) => Promise<void>;
  dispose?(): Promise<void>;
}

export interface AgentConfigInteractionPort {
  openUserConfig(input: {
    readonly identity: AgentHostRouteEffectContext['identity'];
    readonly absolutePath: string;
  }): Promise<void>;
}

export interface AgentConversationReferenceResolutionPort {
  resolve(input: {
    readonly conversationId: string;
    readonly context: AgentBoundDomainBinding;
    readonly references: readonly AgentFileReference[];
  }): Promise<readonly AgentContextPayload[]>;
}

export async function resolveAgentConversationTurnContext(input: {
  readonly resolver: AgentConversationReferenceResolutionPort;
  readonly conversationId: string;
  readonly context: AgentBoundDomainBinding;
  readonly contextPayloads?: readonly AgentContextPayload[];
  readonly fileReferences?: readonly AgentFileReference[];
}): Promise<readonly AgentContextPayload[]> {
  const referencePayloads = input.fileReferences?.length
    ? await input.resolver.resolve({
        conversationId: input.conversationId,
        context: input.context,
        references: input.fileReferences,
      })
    : [];
  return [...(input.contextPayloads ?? []), ...referencePayloads];
}

export interface CreateAgentControllerCompositionOptions {
  readonly host: Pick<NekoHostPorts, 'files' | 'paths' | 'accessPolicy' | 'external'>;
  readonly userHome: string;
  readonly credentialRuntime: AgentCredentialRuntime;
  readonly resolveWorkspaceConfig: (workspace: {
    readonly workspaceId: string;
    readonly workspacePath: string;
  }) => ConfigManager;
  readonly contentInteraction: AgentContentInteractionPort;
  readonly searchLinkedMediaLibraryFiles?: (
    workspace: AssetWorkspaceResolution,
    input: AgentLinkedMediaLibraryFileSearchInput,
  ) => Promise<readonly WorkspaceFileContentLocator[]>;
  readonly configInteraction: AgentConfigInteractionPort;
  readonly conversationReferences?: AgentConversationReferenceResolutionPort;
  readonly resources: AgentResourceDisplayRegistrationPort;
  readonly reportError: (error: Error) => void;
}

export function createAgentControllerComposition(
  options: CreateAgentControllerCompositionOptions,
): AgentControllerComposition {
  return new DefaultAgentControllerComposition(options);
}

class DefaultAgentControllerComposition implements AgentControllerComposition {
  readonly requirements = Object.freeze({
    'conversation-effects': true,
    'config-effects': true,
    'skill-effects': true,
    'content-effects': true,
    'projection-effects': true,
  } as const);

  private readonly confirmations = new Map<string, PiToolConfirmationRegistry>();
  private readonly agentStates = new Map<string, AgentStateRuntime>();
  private readonly pendingDisposals = new Set<Promise<void>>();

  constructor(private readonly options: CreateAgentControllerCompositionOptions) {}

  createEffects(input: {
    readonly workspace: AgentWorkspaceRuntime;
    readonly identity: DesktopAgentConnectionIdentity;
    readonly initialConversationId?: string;
    readonly initialConversationMessage?: Message;
    readonly readConversationContext?: (conversationId: string) => Promise<AgentBoundDomainBinding>;
    readonly readConversationConfiguration?: (
      conversationId: string,
    ) => Promise<AgentConversationConfiguration>;
    readonly updateConversationConfiguration?: (input: {
      readonly conversationId: string;
      readonly request: AgentConfigurationRequest;
      readonly projection: AgentConfigurationPolicyProjection;
    }) => Promise<AgentConversationConfiguration>;
    readonly readGlobalSkillCatalog?: () => Promise<import('./agent-app-host').AgentSkillCatalog>;
    readonly personalSkillOwnerId?: string;
  }): AgentControllerEffects {
    const config = this.getConfig(input.workspace);
    const initialConversation =
      input.initialConversationId === undefined
        ? undefined
        : input.workspace
            .listConversations()
            .find((record) => record.conversationId === input.initialConversationId);
    if (input.initialConversationId !== undefined && initialConversation === undefined) {
      throw new Error(
        `Desktop Agent initial Conversation '${input.initialConversationId}' does not exist in Workspace '${input.workspace.workspaceId}'.`,
      );
    }
    if (input.initialConversationMessage && input.initialConversationId === undefined) {
      throw new Error('Desktop Agent initial message requires an initial Conversation identity.');
    }
    if (input.initialConversationMessage && input.initialConversationMessage.role !== 'user') {
      throw new Error('Desktop Agent initial Conversation message must belong to the user.');
    }
    const initialConversationMessage = input.initialConversationMessage
      ? { ...input.initialConversationMessage }
      : undefined;
    const initialTab = initialConversation
      ? {
          id: `tab-${initialConversation.conversationId}`,
          title: initialConversation.title,
          conversationId: initialConversation.conversationId,
        }
      : undefined;
    const state: ConnectionState = {
      activeConversationId: initialConversation?.conversationId ?? null,
      tabState: initialTab
        ? { openTabs: [initialTab], activeTabId: initialTab.id }
        : { openTabs: [], activeTabId: null },
      tabOperationTail: Promise.resolve(),
    };
    const visiblePresentation = input.workspace.bindVisiblePresentation({
      bindingId: input.identity.connectionId,
      ...(input.initialConversationId === undefined
        ? {}
        : { conversationId: input.initialConversationId }),
    });
    let post: AgentHostRouteEffectContext['post'] | undefined;
    const agentStates = this.getAgentStates(input.workspace.workspaceId);
    const unsubscribeAgentStates = agentStates.subscribe((snapshot) => {
      if (!post) return;
      this.track(
        Promise.resolve()
          .then(() => post?.(buildAgentStateSnapshotMessage([...snapshot])))
          .then(() => undefined),
      );
    });
    const facts = createDesktopAgentFactsProjector({ connection: input.identity });
    const resourceDisplay = createAgentResourceDisplayProjector({
      identity: input.identity,
      workspace: input.workspace.workspace,
      contentAssets: input.workspace,
      resources: this.options.resources,
      recordProjection: (fact) => facts.recordResourceDisplayProjection(fact),
    });
    const projection = createConversationProjectionAttachmentServer({
      resolveProjection: (conversationId) => ({
        conversationId,
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
          unsubscribeAgentStates();
          resourceDisplay.dispose();
          await projection.abandon();
          await visiblePresentation.dispose();
          facts.dispose();
        } catch (error) {
          facts.failDisposal();
          throw error;
        }
      });
      return disposal;
    };
    const searchLinkedMediaLibraryFiles = this.options.searchLinkedMediaLibraryFiles;
    const effects: AgentControllerEffects = {
      conversation: this.createConversationEffects(
        input.workspace,
        config,
        state,
        bind,
        facts,
        visiblePresentation,
        input.initialConversationId === undefined
          ? undefined
          : {
              conversationId: input.initialConversationId,
              ...(initialConversationMessage ? { message: initialConversationMessage } : {}),
            },
        input.readConversationConfiguration ?? missingConversationConfigurationDependency,
        input.readConversationContext ?? missingConversationContextDependency,
      ),
      config: this.createConfigEffects(
        input.workspace,
        config,
        state,
        bind,
        input.readConversationConfiguration ?? missingConversationConfigurationDependency,
        input.updateConversationConfiguration ?? missingConversationConfigurationUpdateDependency,
      ),
      skill: this.createSkillEffects(
        input.workspace,
        config,
        bind,
        facts,
        input.readConversationContext ?? missingConversationContextDependency,
        input.readGlobalSkillCatalog ?? missingGlobalSkillCatalogDependency,
        input.personalSkillOwnerId ?? '',
        input.readConversationConfiguration ?? missingConversationConfigurationDependency,
      ),
      content: createAgentContentEffects({
        workspace: input.workspace.workspace,
        host: this.options.host,
        interaction: this.options.contentInteraction,
        ...(searchLinkedMediaLibraryFiles
          ? {
              searchLinkedMediaLibraryFiles: (searchInput) =>
                searchLinkedMediaLibraryFiles(input.workspace.workspace, searchInput),
            }
          : {}),
        reportMentionContributorError: this.options.reportError,
      }),
      projection: this.createProjectionEffects(projection, resourceDisplay, bind),
      injectContext: async (payload) => {
        if (!post) {
          throw new Error('Desktop Agent context injection requires a bound renderer connection.');
        }
        const tabId = state.tabState.activeTabId;
        const tab = tabId
          ? state.tabState.openTabs.find((candidate) => candidate.id === tabId)
          : undefined;
        if (!tabId || !tab) {
          throw new Error('Desktop Agent context injection requires an active conversation Tab.');
        }
        await post(
          buildInjectContextMessage(payload, {
            tabId,
            conversationId: tab.conversationId,
          }),
        );
      },
      automation: {
        waitForIdle: (conversationId, timeoutMs, afterIdentity) =>
          waitForDesktopAgentIdle({
            conversationId,
            timeoutMs,
            afterIdentity,
            readActiveTurn: () => input.workspace.readActiveTurn(conversationId),
            readLatestIdentity: () => facts.readLatestIdentity(conversationId),
          }),
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

  readonly startInitialTurn = async (input: {
    readonly workspace: AgentWorkspaceRuntime;
    readonly conversationId: string;
    readonly turnId: string;
    readonly messageText: string;
    readonly presentationText?: string;
    readonly configuration: AgentConversationTurnConfigurationSnapshot;
    readonly context: AgentBoundDomainBinding;
    readonly locale: 'en' | 'zh';
    readonly contextPayloads?: readonly AgentContextPayload[];
    readonly skillName?: string;
    readonly skillActivationId?: string;
    readonly additionalInstructions?: string;
  }): Promise<void> => {
    const facts = createDesktopAgentFactsProjector({
      connection: {
        applicationInstanceId: 'agent-conversation-authority',
        windowId: `conversation:${input.conversationId}`,
        workbenchInstanceId: `conversation:${input.conversationId}`,
        agentSurfaceId: `initial-turn:${input.turnId}`,
        projectId: `conversation:${input.conversationId}`,
        workspaceId: input.workspace.workspaceId,
        viewId: `conversation:${input.conversationId}`,
        connectionId: `initial-turn:${input.turnId}`,
      },
    });
    try {
      try {
        await this.executeTurn({
          workspace: input.workspace,
          config: this.getConfig(input.workspace),
          request: {
            source: 'user-message',
            conversationId: input.conversationId,
            messageText: input.messageText,
            sessionMode: 'agent',
            locale: input.locale,
            turnId: input.turnId,
            ...(input.contextPayloads?.length ? { contextPayloads: input.contextPayloads } : {}),
          },
          context: {
            identity: {
              hostKind: 'electron',
              applicationId: 'agent-conversation-authority',
              windowId: `conversation:${input.conversationId}`,
              viewId: `conversation:${input.conversationId}`,
              workspaceId: input.workspace.workspaceId,
              connectionId: `initial-turn:${input.turnId}`,
            },
            post: () => undefined,
          },
          facts,
          configuration: input.configuration,
          conversationContext: input.context,
          ...(input.presentationText === undefined
            ? {}
            : { presentationText: input.presentationText }),
          ...(input.skillName ? { skillName: input.skillName } : {}),
          ...(input.skillActivationId ? { skillActivationId: input.skillActivationId } : {}),
          ...(input.additionalInstructions
            ? { additionalInstructions: input.additionalInstructions }
            : {}),
        });
      } catch (error) {
        await input.workspace.checkpointFailedInitialTurn({
          conversationId: input.conversationId,
          turnId: input.turnId,
          messageText: input.presentationText ?? input.messageText,
          contextPayloads: input.contextPayloads,
        });
        throw error;
      }
    } finally {
      facts.dispose();
    }
  };

  async dispose(): Promise<void> {
    for (const confirmation of this.confirmations.values()) confirmation.cancelAll();
    this.confirmations.clear();
    const results = await Promise.allSettled(this.pendingDisposals);
    this.pendingDisposals.clear();
    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to dispose Agent controller effects.');
    }
    this.agentStates.clear();
  }

  private createConversationEffects(
    workspace: AgentWorkspaceRuntime,
    config: ConfigManager,
    state: ConnectionState,
    bind: (context: AgentHostRouteEffectContext) => void,
    facts: DesktopAgentFactsProjector,
    visiblePresentation: AgentVisiblePresentationBinding,
    initialConversation?: {
      readonly conversationId: string;
      readonly message?: Message;
    },
    readConversationConfiguration: (
      conversationId: string,
    ) => Promise<AgentConversationConfiguration> = missingConversationConfigurationDependency,
    readConversationContext: (
      conversationId: string,
    ) => Promise<AgentBoundDomainBinding> = missingConversationContextDependency,
  ): AgentControllerEffects['conversation'] {
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
      activation?: { readonly activationId: number },
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
      const projectedMessages = projectPiConversationEntries(
        await workspace.readConversationEntries(conversationId),
      );
      await context.post({
        type: 'activeConversation',
        ...(activation ? { activation } : {}),
        conversation: {
          id: conversationId,
          title: record.title,
          messages: reconcileInitialConversationMessage(
            conversationId,
            projectedMessages,
            initialConversation?.conversationId,
            initialConversation?.message,
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
      const operation = Promise.all([
        readConversationConfiguration(request.conversationId),
        readConversationContext(request.conversationId),
      ]).then(([configuration, conversationContext]) =>
        this.executeTurn({
          workspace,
          config,
          request,
          context,
          facts,
          configuration,
          conversationContext,
          ...(skillName ? { skillName } : {}),
          ...(additionalInstructions ? { additionalInstructions } : {}),
        }),
      );
      this.track(
        operation.catch(async (error: unknown) => {
          await context.post(
            buildAgentConversationTurnFailureMessage(request.conversationId, error),
          );
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
      activateConversation: (message, context) => {
        bind(context);
        return enqueueTabOperation(state, async () => {
          const tab = message.tabState.openTabs.find((candidate) => candidate.id === message.tabId);
          if (!tab || tab.conversationId !== message.conversationId) {
            throw new Error(
              'Desktop Agent conversation activation does not match its Tab identity.',
            );
          }
          if (
            !workspace
              .listConversations()
              .some((record) => record.conversationId === message.conversationId)
          ) {
            throw new Error(
              `Desktop Agent conversation '${message.conversationId}' does not exist.`,
            );
          }
          state.activeConversationId = message.conversationId;
          state.tabState = cloneTabState(message.tabState);
          await visiblePresentation.updateConversation(message.conversationId);
          await context.post(buildTabStateMessage(state.tabState));
          await postConversation(message.conversationId, context, {
            activationId: message.activationId,
          });
        });
      },
      deleteConversation: ({ conversationId, activateNext }, context) => {
        bind(context);
        return enqueueTabOperation(state, async () => {
          await workspace.deleteConversation(conversationId);
          this.getAgentStates(workspace.workspaceId).clear(conversationId);
          this.confirmations.get(ownerKey(workspace.workspaceId, conversationId))?.cancelAll();
          this.confirmations.delete(ownerKey(workspace.workspaceId, conversationId));
          state.tabState = {
            openTabs: state.tabState.openTabs.filter(
              (tab) => tab.conversationId !== conversationId,
            ),
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
            await visiblePresentation.updateConversation(state.activeConversationId ?? undefined);
          }
          await postConversationList(context);
          await context.post(buildTabStateMessage(state.tabState));
          if (activateNext !== false) {
            await postConversation(state.activeConversationId, context);
          }
        });
      },
      listConversations: postConversationList,
      readActiveConversation: async (context) => {
        bind(context);
        await state.tabOperationTail;
        await postConversation(state.activeConversationId, context);
      },
      readAgentStates: async (context) => {
        bind(context);
        await context.post(
          buildAgentStateSnapshotMessage(this.getAgentStates(workspace.workspaceId).snapshot()),
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
          buildMessageQueueSnapshotMessage(workspace.readMessageQueue(conversationId)),
        );
      },
      promoteQueuedMessage: async ({ conversationId, queueItemId }, context) => {
        bind(context);
        await context.post(
          buildMessageQueueSnapshotMessage(
            workspace.promoteQueuedMessage(conversationId, queueItemId),
          ),
        );
      },
      cancelQueuedMessage: async ({ conversationId, queueItemId }, context) => {
        bind(context);
        await context.post(
          buildMessageQueueSnapshotMessage(
            await workspace.cancelQueuedMessage(conversationId, queueItemId),
          ),
        );
      },
      editQueuedMessage: async ({ tabId, conversationId, queueItemId }, context) => {
        bind(context);
        const { item, snapshot } = await workspace.takeQueuedMessageForEdit(
          conversationId,
          queueItemId,
        );
        await context.post(
          buildQueuedMessageEditRequestedMessage({
            tabId,
            conversationId,
            item,
            snapshot,
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
        await workspace.clearMessageQueue(conversationId);
        await context.post(buildHistoryClearedMessage(conversationId));
      },
      clearAllConversations: (context) => {
        bind(context);
        return enqueueTabOperation(state, async () => {
          await workspace.clearAllConversations();
          state.activeConversationId = null;
          state.tabState = { openTabs: [], activeTabId: null };
          await visiblePresentation.updateConversation();
          await postConversationList(context);
          await context.post(buildTabStateMessage(state.tabState));
          await postConversation(null, context);
        });
      },
    };
  }

  private createConfigEffects(
    workspace: AgentWorkspaceRuntime,
    config: ConfigManager,
    state: ConnectionState,
    bind: (context: AgentHostRouteEffectContext) => void,
    readConversationConfiguration: (
      conversationId: string,
    ) => Promise<AgentConversationConfiguration>,
    updateConversationConfiguration: (input: {
      readonly conversationId: string;
      readonly request: AgentConfigurationRequest;
      readonly projection: AgentConfigurationPolicyProjection;
    }) => Promise<AgentConversationConfiguration>,
  ): AgentControllerEffects['config'] {
    const safeConfig = (): AssistantConfigState =>
      projectAgentSecretSafeConfig(config.getAssistantConfigState());
    const safeSettings = (): AssistantSettingsData =>
      projectAgentSecretSafeSettings(config.getAssistantSettingsData());
    return {
      readSettings: async (conversationId, context) => {
        bind(context);
        const configuration = await readConversationConfiguration(conversationId);
        await context.post(projectSettingsMessage(safeSettings(), conversationId, configuration));
      },
      readConfig: async (context) => {
        bind(context);
        await context.post(buildConfigStateMessage(safeConfig()));
      },
      refreshConfig: async (context) => {
        bind(context);
        config.reloadConfig();
        await context.post(buildConfigStateMessage(safeConfig()));
      },
      openUserConfig: async (context) => {
        bind(context);
        await this.options.configInteraction.openUserConfig({
          identity: context.identity,
          absolutePath: join(this.options.userHome, '.neko', 'config.toml'),
        });
      },
      readTabState: async (context) => {
        bind(context);
        await state.tabOperationTail;
        await context.post(buildTabStateMessage(state.tabState));
      },
      updateSettings: async ({ conversationId, settings }, context) => {
        bind(context);
        try {
          const current = await readConversationConfiguration(conversationId);
          const request = projectConversationConfigurationRequest(
            current.request,
            settings,
            config,
          );
          assertAgentConfigurationPolicyAllowsRequest(current.projection, request);
          const projection = projectAgentConfigurationPolicy({
            models: projectAgentModelCatalog(config.getAssistantConfigState()),
            request,
            source: 'conversation',
            defaults: configurationProjectionDefaults(current.projection),
            policies: configurationProjectionPolicies(current.projection),
          });
          assertExecutableConversationConfiguration(projection);
          const updated = await updateConversationConfiguration({
            conversationId,
            request,
            projection,
          });
          await context.post(buildAssistantSettingsUpdatedMessage({ success: true }));
          await context.post(projectSettingsMessage(safeSettings(), conversationId, updated));
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
      updateTabState: (message, context) => {
        bind(context);
        return enqueueTabOperation(state, async () => {
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
          await context.post(buildTabStateMessage(state.tabState));
        });
      },
    };
  }

  private createSkillEffects(
    workspace: AgentWorkspaceRuntime,
    config: ConfigManager,
    bind: (context: AgentHostRouteEffectContext) => void,
    facts: DesktopAgentFactsProjector,
    readConversationContext: (conversationId: string) => Promise<AgentBoundDomainBinding>,
    readGlobalSkillCatalog: () => Promise<import('./agent-app-host').AgentSkillCatalog>,
    personalSkillOwnerId: string,
    readConversationConfiguration: (
      conversationId: string,
    ) => Promise<AgentConversationConfiguration>,
  ): AgentControllerEffects['skill'] {
    const readCatalog = async (conversationId: string) => {
      if (!personalSkillOwnerId.trim()) {
        throw new Error('Agent Session input catalog has no personal Skill owner identity.');
      }
      const binding = await readConversationContext(conversationId);
      if (
        (binding.kind === 'workspace' && binding.workspaceId !== workspace.workspaceId) ||
        (binding.kind === 'assistant' && binding.assistantSpaceId !== workspace.workspaceId)
      ) {
        throw new Error(
          `Agent Conversation '${conversationId}' binding does not match Workspace runtime '${workspace.workspaceId}'.`,
        );
      }
      const skills =
        binding.kind === 'assistant'
          ? await readGlobalSkillCatalog()
          : await workspace.readSkillCatalog(true);
      return {
        binding,
        entries: projectAgentInputCatalog({
          skills,
          phase: 'session',
          binding,
          personalSkillOwnerId,
          commandHandlerIds: SESSION_COMMAND_HANDLER_IDS,
        }),
      };
    };
    const executeSkillInput = (
      conversationId: string,
      input: {
        readonly skillName: string;
        readonly activationId: string;
        readonly args?: string;
      },
      context: AgentHostRouteEffectContext,
    ): void => {
      const request: AgentConversationControllerTurnRequest = {
        source: 'user-message',
        conversationId,
        messageText: input.args ?? '',
        sessionMode: 'agent',
        locale: 'en',
      };
      const operation = Promise.all([
        readConversationConfiguration(conversationId),
        readConversationContext(conversationId),
      ]).then(([configuration, conversationContext]) =>
        this.executeTurn({
          workspace,
          config,
          request,
          context,
          facts,
          configuration,
          conversationContext,
          skillName: input.skillName,
          skillActivationId: input.activationId,
          ...(input.args ? { additionalInstructions: input.args } : {}),
        }),
      );
      this.track(operation);
    };
    return {
      readInputCatalog: async (conversationId, context) => {
        bind(context);
        const catalog = await readCatalog(conversationId);
        await context.post(
          buildAgentInputCatalogMessage({
            conversationId,
            bindingKind: catalog.binding.kind,
            entries: catalog.entries,
          }),
        );
      },
      invokeInput: async ({ conversationId, input }, context) => {
        bind(context);
        const catalog = await readCatalog(conversationId);
        const entry = catalog.entries.find((candidate) => candidate.id === input.catalogEntryId);
        const executableMatches =
          input.kind === 'command'
            ? entry?.trigger === 'command' &&
              entry.executable.commandId === input.commandId &&
              entry.executable.handlerId === input.handlerId
            : entry?.trigger === 'skill' &&
              entry.executable.skillName === input.skillName &&
              entry.executable.activationId === input.activationId;
        if (
          !entry ||
          !executableMatches ||
          !isAgentInputCatalogEntryExecutable({
            entry,
            phase: 'session',
            bindingKind: catalog.binding.kind,
          })
        ) {
          throw new Error(
            `Agent Session ${input.kind} catalog entry '${input.catalogEntryId}' is stale or unavailable.`,
          );
        }
        if (input.kind === 'skill') {
          executeSkillInput(conversationId, input, context);
          return;
        }
        if (input.handlerId === 'builtin:clear') {
          await workspace.clearContext(conversationId);
          await context.post(buildHistoryClearedMessage(conversationId));
          return;
        }
        if (input.handlerId === 'builtin:compact') {
          const configuration = await readConversationConfiguration(conversationId);
          const { policy } = await this.resolveModelPolicy(workspace, config, configuration);
          const result = await workspace.compactContext(
            conversationId,
            policy['agent.main'].model.contextWindow,
          );
          await context.post({
            type: 'compressionResult',
            conversationId,
            compressedTokens: result.compressedTokens,
          });
          return;
        }
        executeSkillInput(
          conversationId,
          {
            skillName: input.commandId,
            activationId: parseCommandArtifactActivationId(input.handlerId),
            ...(input.args === undefined ? {} : { args: input.args }),
          },
          context,
        );
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
        const configuration = await readConversationConfiguration(conversationId);
        const { policy } = await this.resolveModelPolicy(workspace, config, configuration);
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
  ): AgentControllerEffects['projection'] {
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
        await context.post({
          type: 'projectionEndpointReady',
          realmId: message.realmId,
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
    readonly workspace: AgentWorkspaceRuntime;
    readonly config: ConfigManager;
    readonly request: AgentConversationControllerTurnRequest;
    readonly context: AgentHostRouteEffectContext;
    readonly facts: DesktopAgentFactsProjector;
    readonly configuration:
      AgentConversationConfiguration | AgentConversationTurnConfigurationSnapshot;
    readonly conversationContext: AgentBoundDomainBinding;
    readonly presentationText?: string;
    readonly skillName?: string;
    readonly skillActivationId?: string;
    readonly additionalInstructions?: string;
  }): Promise<void> {
    if (input.request.sessionMode !== 'agent') {
      throw new Error(
        `Desktop Agent does not support session mode '${input.request.sessionMode}'.`,
      );
    }
    if (input.request.attachments?.length) {
      throw new Error(
        'Desktop Agent binary attachment preprocessing is not connected to the Pi turn yet.',
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
    assertTurnRequestMatchesConversationConfiguration(input.request, input.configuration.request);
    const resolved = await this.resolveModelPolicy(
      input.workspace,
      input.config,
      input.configuration,
    );
    const executionMode = requireConfigurationValue(
      input.configuration.projection.fields.executionMode,
      'executionMode',
    );
    const settings = input.config.getAssistantRuntimeSettingsSnapshot();
    const locale = normalizeLocale(input.request.locale);
    const promptBuilder = createSystemPromptBuilder({
      locale,
      executionMode,
    });
    await promptBuilder.loadAgentsFile(
      input.workspace.workspace.workspacePath,
      join(this.options.userHome, '.neko'),
    );
    const systemPrompt = [
      promptBuilder.buildForExecutionMode(executionMode),
      ...input.workspace
        .readCapabilityPromptFragments(locale)
        .map((fragment) => fragment.content.trim())
        .filter(Boolean),
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
    const contextPayloads = await resolveAgentConversationTurnContext({
      resolver: this.options.conversationReferences ?? missingConversationReferenceDependency,
      conversationId: input.request.conversationId,
      context: input.conversationContext,
      contextPayloads: input.request.contextPayloads,
      fileReferences: input.request.fileReferences,
    });
    const turnInput: AgentTurnInput = {
      conversationId: input.request.conversationId,
      prompt: input.request.messageText,
      ...(input.presentationText === undefined ? {} : { presentationText: input.presentationText }),
      ...(input.request.turnId === undefined ? {} : { turnId: input.request.turnId }),
      modelPolicy: resolved.policy,
      configuration: resolved.configuration,
      permissionPolicy: (events) =>
        this.createPermissionPolicy(
          input.workspace,
          input.request.conversationId,
          executionMode,
          events,
        ),
      workspaceTrusted: true,
      locale,
      systemPrompt,
      ...(contextPayloads.length ? { contextPayloads } : {}),
      ...(input.skillName ? { skillName: input.skillName } : {}),
      ...(input.skillActivationId ? { skillActivationId: input.skillActivationId } : {}),
      ...(input.additionalInstructions
        ? { additionalInstructions: input.additionalInstructions }
        : {}),
    };
    const factsEvents = createDeferredDesktopAgentFactsEvents();
    const observedTurnInput: AgentTurnInput = {
      ...turnInput,
      events: factsEvents.events,
    };
    const operation = input.workspace.startTurn(observedTurnInput);
    factsEvents.bind(input.facts.beginTurn({ identity: operation.identity, systemPrompt }));
    this.postMessageQueueSnapshot(
      input.context,
      input.workspace.readMessageQueue(input.request.conversationId),
    );
    this.getAgentStates(input.workspace.workspaceId).update({
      conversationId: input.request.conversationId,
      phase: 'thinking',
      startedAt: Date.now(),
    });
    try {
      const turn = await operation.completion;
      input.facts.completeTurn({
        conversation: input.workspace.readConversationEvidence(input.request.conversationId),
        turn,
      });
      if (turn.artifactDelivery?.status === 'blocked') {
        await input.context.post(
          buildAgentSessionDiagnosticMessage({
            code: 'canvas-board-delivery-failed',
            message: `Workspace Board delivery was blocked (${turn.artifactDelivery.diagnostic.code}). The artifact remains available.`,
            action: 'workspace-board-delivery',
            conversationId: input.request.conversationId,
          }),
        );
      }
    } catch (error) {
      if (!(error instanceof AgentQueuedTurnCancellationError)) throw error;
    } finally {
      this.postMessageQueueSnapshot(
        input.context,
        input.workspace.readMessageQueue(input.request.conversationId),
      );
      const residency = input.workspace
        .readRuntimeResidency()
        .conversations.find(
          (conversation) => conversation.conversationId === input.request.conversationId,
        );
      this.getAgentStates(input.workspace.workspaceId).update({
        conversationId: input.request.conversationId,
        phase: residency?.running === true || residency?.queued === true ? 'thinking' : 'idle',
        startedAt: Date.now(),
      });
    }
  }

  private async resolveModelPolicy(
    workspace: AgentWorkspaceRuntime,
    config: ConfigManager,
    conversationConfiguration:
      AgentConversationConfiguration | AgentConversationTurnConfigurationSnapshot,
  ): Promise<{
    readonly policy: AgentModelPolicy;
    readonly configuration: AgentTurnConfigurationSnapshot;
  }> {
    const selected = conversationConfiguration.request;
    const catalogEntry = projectAgentModelCatalog(config.getAssistantConfigState()).find(
      (entry) =>
        entry.id === selected.modelCatalogEntryId &&
        entry.providerId === selected.providerId &&
        entry.modelId === selected.modelId,
    );
    if (!catalogEntry || catalogEntry.availability.status !== 'available') {
      throw new Error(
        `Agent Conversation model '${selected.modelCatalogEntryId}' is stale or unavailable.`,
      );
    }
    const requestedBase = config.getEffectiveAgentWorkspaceConfigSnapshot({
      selectedProviderId: selected.providerId,
      selectedModelId: selected.modelId,
    });
    const requestedSnapshot: EffectiveAgentWorkspaceConfigSnapshot = {
      ...requestedBase,
      temperature: requireConfigurationValue(
        conversationConfiguration.projection.fields.temperature,
        'temperature',
      ),
      maxTokens: requireConfigurationValue(
        conversationConfiguration.projection.fields.maximumOutputTokens,
        'maximumOutputTokens',
      ),
      thinkingBudget: requireConfigurationValue(
        conversationConfiguration.projection.fields.thinkingBudget,
        'thinkingBudget',
      ),
      executionMode: requireConfigurationValue(
        conversationConfiguration.projection.fields.executionMode,
        'executionMode',
      ),
      sources: {
        ...requestedBase.sources,
        provider: 'user',
        model: 'user',
        temperature: 'user',
        maxTokens: 'user',
        thinkingBudget: 'user',
        executionMode: 'user',
      },
    };
    const requestedConfiguration = createEffectiveAgentConfigurationProjection(requestedSnapshot);
    const provider = config.getProvider(selected.providerId);
    const model = config.getModel(selected.modelId);
    validateModelSelection(provider, model, selected.providerId, selected.modelId);
    if (!provider || !model)
      throw new Error('Validated Desktop Agent model selection disappeared.');
    const projection = registerOpenNekoPiProvider(workspace.models, {
      id: provider.id,
      name: provider.displayName,
      baseUrl: provider.apiUrl,
      protocol: requireProtocol(model.protocolProfile ?? provider.protocolProfile),
      requiresApiKey: provider.requiresApiKey !== false,
      auth: resolveAuth(provider, model),
      models: [projectPiModel(model)],
    });
    let credentialConfigured =
      (await this.options.credentialRuntime.credentials.status(provider.id)) !== undefined;
    if (provider.requiresApiKey !== false && !credentialConfigured) {
      await this.options.credentialRuntime.auth.login({
        provider: projection.provider,
        method: 'api-key',
        interaction: this.options.credentialRuntime.interaction,
      });
      credentialConfigured =
        (await this.options.credentialRuntime.credentials.status(provider.id)) !== undefined;
    }
    const projectedModel = projection.models.find((candidate) => candidate.id === model.name);
    if (!projectedModel) {
      throw new Error(`Desktop Pi model '${provider.id}/${model.name}' was not registered.`);
    }
    const parameters = projectLlmParameters({
      provider,
      model,
      llmConfig: undefined,
      runtimeDefaults: {
        temperature: requestedSnapshot.temperature,
        maxOutputTokens: requestedSnapshot.maxTokens,
        thinkingBudget: requestedSnapshot.thinkingBudget,
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
              : credentialConfigured
                ? 'configured'
                : 'missing',
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
    const turnConfiguration: AgentTurnConfigurationSnapshot = Object.freeze({
      requested: requestedConfiguration,
      effective: createEffectiveAgentConfigurationProjection(effectiveSnapshot),
      diagnostics: Object.freeze(
        parameters.diagnostics.map((diagnostic) =>
          Object.freeze({ code: diagnostic.code, message: diagnostic.message }),
        ),
      ),
    });
    return { policy, configuration: turnConfiguration };
  }

  private createPermissionPolicy(
    workspace: AgentWorkspaceRuntime,
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

  private getConfig(workspace: AgentWorkspaceRuntime): ConfigManager {
    return this.options.resolveWorkspaceConfig({
      workspaceId: workspace.workspaceId,
      workspacePath: workspace.workspace.workspacePath,
    });
  }

  private postMessageQueueSnapshot(
    context: AgentHostRouteEffectContext,
    snapshot: AgentMessageQueueSnapshot,
  ): void {
    this.track(
      Promise.resolve(context.post(buildMessageQueueSnapshotMessage(snapshot))).then(
        () => undefined,
      ),
    );
  }

  private getConfirmation(workspaceId: string, conversationId: string): PiToolConfirmationRegistry {
    const key = ownerKey(workspaceId, conversationId);
    const existing = this.confirmations.get(key);
    if (existing) return existing;
    const confirmations = new PiToolConfirmationRegistry();
    this.confirmations.set(key, confirmations);
    return confirmations;
  }

  private getAgentStates(workspaceId: string): AgentStateRuntime {
    const existing = this.agentStates.get(workspaceId);
    if (existing) return existing;
    const created = createAgentStateRuntime();
    this.agentStates.set(workspaceId, created);
    return created;
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

export function buildAgentConversationTurnFailureMessage(
  conversationId: string,
  error: unknown,
): ReturnType<typeof buildErrorMessage> {
  return buildErrorMessage({ conversationId, message: describeError(error) });
}

function reconcileInitialConversationMessage(
  conversationId: string,
  messages: readonly Message[],
  initialConversationId: string | undefined,
  initialMessage: Message | undefined,
): Message[] {
  if (conversationId !== initialConversationId || !initialMessage) return [...messages];
  if (
    messages.some(
      (message) =>
        message.role === 'user' &&
        (message.id === initialMessage.id || message.content === initialMessage.content),
    )
  ) {
    return [...messages];
  }
  const insertionIndex = messages.findIndex(
    (message) => message.timestamp >= initialMessage.timestamp,
  );
  if (insertionIndex === -1) return [...messages, initialMessage];
  return [...messages.slice(0, insertionIndex), initialMessage, ...messages.slice(insertionIndex)];
}

export async function waitForDesktopAgentIdle(input: {
  readonly conversationId: string;
  readonly timeoutMs: number;
  readonly afterIdentity?: { readonly turnId: string; readonly runId: string };
  readonly readActiveTurn: () => unknown;
  readonly readLatestIdentity: () =>
    | { readonly conversationId: string; readonly turnId: string; readonly runId: string }
    | undefined;
  readonly now?: () => number;
  readonly waitForPoll?: () => Promise<void>;
}): Promise<{ readonly conversationId: string; readonly turnId: string; readonly runId: string }> {
  const now = input.now ?? Date.now;
  const waitForPoll = input.waitForPoll ?? waitForFactsPoll;
  const deadline = now() + input.timeoutMs;
  for (;;) {
    const identity = input.readLatestIdentity();
    if (identity && !sameTurnIdentity(identity, input.afterIdentity) && !input.readActiveTurn()) {
      return {
        conversationId: identity.conversationId,
        turnId: identity.turnId,
        runId: identity.runId,
      };
    }
    if (now() >= deadline) {
      if (!identity) {
        throw new Error(
          `Desktop Agent conversation '${input.conversationId}' has no observed turn identity within ${input.timeoutMs}ms.`,
        );
      }
      throw new Error(
        `Desktop Agent conversation '${input.conversationId}' did not reach terminal idle within ${input.timeoutMs}ms.`,
      );
    }
    await waitForPoll();
  }
}

function sameTurnIdentity(
  identity: { readonly turnId: string; readonly runId: string },
  expected: { readonly turnId: string; readonly runId: string } | undefined,
): boolean {
  return (
    expected !== undefined &&
    identity.turnId === expected.turnId &&
    identity.runId === expected.runId
  );
}

interface ConnectionState {
  activeConversationId: string | null;
  tabState: TabState;
  tabOperationTail: Promise<void>;
}

function enqueueTabOperation<T>(state: ConnectionState, operation: () => Promise<T>): Promise<T> {
  const result = state.tabOperationTail.then(operation);
  state.tabOperationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function projectAgentSecretSafeConfig(config: AssistantConfigState): AssistantConfigState {
  return {
    providers: config.providers.map(projectAssistantProviderView),
    configuredProviders: config.configuredProviders.map(projectAssistantConfiguredProviderView),
    selectedProviderId: config.selectedProviderId,
    selectedModelId: config.selectedModelId,
    customSystemPrompt: config.customSystemPrompt,
    autoExecuteTools: config.autoExecuteTools,
    streamResponses: config.streamResponses,
    showToolCalls: config.showToolCalls,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    executionMode: config.executionMode,
    chatModelOptions: structuredClone(config.chatModelOptions),
    modelGroups: structuredClone(config.modelGroups),
    defaultMediaModels: { ...config.defaultMediaModels },
    ...(config.mediaUnderstandingModels === undefined
      ? {}
      : { mediaUnderstandingModels: structuredClone(config.mediaUnderstandingModels) }),
    ...(config.configDiagnostic === undefined
      ? {}
      : { configDiagnostic: { ...config.configDiagnostic } }),
  };
}

function projectAgentSecretSafeSettings(settings: AssistantSettingsData): AssistantSettingsData {
  return projectAgentSecretSafeConfig(settings);
}

function projectSettingsMessage(
  settings: AssistantSettingsData,
  conversationId: string,
  configuration: AgentConversationConfiguration,
): SettingsDataMessage {
  const configuredProviderIds = new Set(
    settings.configuredProviders.map((provider) => provider.id),
  );
  const message = buildAssistantSettingsDataMessage(settings);
  return {
    ...message,
    conversationId,
    selectedProviderId: configuration.request.providerId,
    selectedModelId: configuration.request.modelId,
    executionMode: requireConfigurationValue(
      configuration.projection.fields.executionMode,
      'executionMode',
    ),
    temperature: requireConfigurationValue(
      configuration.projection.fields.temperature,
      'temperature',
    ),
    maxTokens: requireConfigurationValue(
      configuration.projection.fields.maximumOutputTokens,
      'maximumOutputTokens',
    ),
    agentConfiguration: configuration.projection,
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
    configuredProviders: settings.configuredProviders.map(projectAssistantConfiguredProviderView),
  };
}

function projectConversationConfigurationRequest(
  current: AgentConfigurationRequest,
  updates: Readonly<Record<string, unknown>>,
  config: ConfigManager,
): AgentConfigurationRequest {
  const allowed = new Set([
    'providerId',
    'modelId',
    'executionMode',
    'temperature',
    'maxTokens',
    'thinkingBudget',
  ]);
  const unknown = Object.keys(updates).find((key) => !allowed.has(key));
  if (unknown) {
    throw new Error(`Agent Conversation configuration contains unsupported field '${unknown}'.`);
  }
  const providerId =
    typeof updates['providerId'] === 'string' ? updates['providerId'] : current.providerId;
  const modelId = typeof updates['modelId'] === 'string' ? updates['modelId'] : current.modelId;
  const model = projectAgentModelCatalog(config.getAssistantConfigState()).find(
    (entry) => entry.providerId === providerId && entry.modelId === modelId,
  );
  return parseAgentConfigurationRequest({
    modelCatalogEntryId: model?.id ?? `${providerId}:${modelId}`,
    providerId,
    modelId,
    executionMode: updates['executionMode'] ?? current.executionMode,
    temperature: updates['temperature'] ?? current.temperature,
    maximumOutputTokens: updates['maxTokens'] ?? current.maximumOutputTokens,
    thinkingBudget: updates['thinkingBudget'] ?? current.thinkingBudget,
  });
}

function configurationProjectionDefaults(projection: AgentConfigurationPolicyProjection) {
  return {
    executionMode: requireConfigurationValue(projection.fields.executionMode, 'executionMode'),
    temperature: requireConfigurationValue(projection.fields.temperature, 'temperature'),
    maximumOutputTokens: requireConfigurationValue(
      projection.fields.maximumOutputTokens,
      'maximumOutputTokens',
    ),
    thinkingBudget: requireConfigurationValue(projection.fields.thinkingBudget, 'thinkingBudget'),
  };
}

function configurationProjectionPolicies(projection: AgentConfigurationPolicyProjection) {
  return {
    model: projection.fields.model.policy,
    executionMode: projection.fields.executionMode.policy,
    temperature: projection.fields.temperature.policy,
    maximumOutputTokens: projection.fields.maximumOutputTokens.policy,
    thinkingBudget: projection.fields.thinkingBudget.policy,
  };
}

function assertExecutableConversationConfiguration(
  projection: AgentConfigurationPolicyProjection,
): void {
  for (const [field, value] of Object.entries(projection.fields)) {
    if (value.policy.status === 'unavailable') {
      throw new Error(
        `Agent Conversation configuration field '${field}' is unavailable: ${value.policy.reason}`,
      );
    }
  }
}

function requireConfigurationValue<T>(
  field: AgentConfigurationFieldProjection<T>,
  name: string,
): T {
  if (field.policy.status === 'unavailable' || field.effectiveValue === null) {
    throw new Error(`Agent Conversation configuration field '${name}' is unavailable.`);
  }
  return field.effectiveValue;
}

function assertTurnRequestMatchesConversationConfiguration(
  request: Partial<AgentConversationControllerTurnRequest>,
  configuration: AgentConfigurationRequest,
): void {
  const requestedModel = request.agentModels?.primary ?? request.chatModel;
  if (
    requestedModel &&
    (requestedModel.providerId !== configuration.providerId ||
      requestedModel.modelId !== configuration.modelId)
  ) {
    throw new Error(
      'Agent Turn model receipt does not match its exact Conversation configuration.',
    );
  }
  if (request.llmConfig !== undefined) {
    throw new Error(
      'Agent Turn parameters must be updated through the exact Conversation configuration.',
    );
  }
}

function projectAssistantProviderView(
  provider: AssistantConfigState['providers'][number],
): AssistantConfigState['providers'][number] {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    enabled: provider.enabled,
    models: provider.models.map((model) => ({
      id: model.id,
      name: model.name,
      enabled: model.enabled,
    })),
    ...(provider.connectionKind === undefined ? {} : { connectionKind: provider.connectionKind }),
    ...(provider.protocolProfile === undefined
      ? {}
      : { protocolProfile: provider.protocolProfile }),
    ...(provider.supportLevel === undefined ? {} : { supportLevel: provider.supportLevel }),
    ...(provider.requiresApiKey === undefined ? {} : { requiresApiKey: provider.requiresApiKey }),
  };
}

function projectAssistantConfiguredProviderView(
  provider: AssistantConfigState['configuredProviders'][number],
): AssistantConfigState['configuredProviders'][number] {
  return {
    ...projectAssistantProviderView(provider),
    ...(provider.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
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

function parseCommandArtifactActivationId(handlerId: string): string {
  const prefix = 'command-artifact:';
  if (!handlerId.startsWith(prefix) || handlerId.length === prefix.length) {
    throw new Error(`Agent Session command has no registered handler '${handlerId}'.`);
  }
  return handlerId.slice(prefix.length);
}

async function missingConversationContextDependency(): Promise<AgentBoundDomainBinding> {
  throw new Error('Agent Session input catalog has no Conversation context dependency.');
}

const missingConversationReferenceDependency: AgentConversationReferenceResolutionPort = {
  resolve: async () => {
    throw new Error('Agent Session has no Conversation reference resolver dependency.');
  },
};

async function missingConversationConfigurationDependency(): Promise<AgentConversationConfiguration> {
  throw new Error('Agent Session has no exact Conversation configuration dependency.');
}

async function missingConversationConfigurationUpdateDependency(): Promise<AgentConversationConfiguration> {
  throw new Error('Agent Session has no Conversation configuration update dependency.');
}

async function missingGlobalSkillCatalogDependency(): Promise<
  import('./agent-app-host').AgentSkillCatalog
> {
  throw new Error('Agent Session input catalog has no global Skill catalog dependency.');
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
