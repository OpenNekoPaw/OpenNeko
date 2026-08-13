import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageContent } from '@earendil-works/pi-ai';
import type { ILogger } from '@neko/shared/logger';
import sharp from 'sharp';

import { classifyAgentContentPath } from '../input/content-path-classification';
import {
  resolvePersonalAgentSkillsDir,
  resolveProjectAgentSkillsDir,
} from '../workspace/agent-skill-layout';

import {
  NodePiConversationAuthority,
  PiConversationRuntime,
  createOpenNekoPiModels,
  createNodePiSkillHost,
  createPiTimelineProjector,
  estimatePiConversationContextTokens,
  projectOpenNekoTools,
  resolveOpenNekoToolCallModelPurpose,
  resolveOpenNekoToolModelPurposes,
  type AgentModelPolicy,
  type OpenPiConversationRuntimeOptions,
  type PiProductEventSink,
  type PiConversationCatalogRecord,
  type PiConversationCatalogReader,
  type PiConversationTranscriptEntry,
  type PiSkillHostSnapshot,
  type SkillHostRecord,
  type PiToolPermissionPolicy,
  type PiToolRunIdentity,
  type PiUserMessagePresentation,
  type SkillSourceRoot,
  type SkillSourceKind,
} from '@neko/agent-runtime/pi';
import {
  createNodeCommandHost,
  type CommandHostRecord,
  type CommandHostSnapshot,
  type CommandSourceRoot,
} from '@neko/agent-runtime/command';
import {
  createConversationProjectionStore,
  type ConversationProjectionListener,
  type ConversationProjectionStore,
} from '@neko/agent-runtime/conversation-projection';
import { createToolRegistry } from '@neko/agent-runtime/tool-registry';
import {
  createCanvasProjectCapabilityProvider,
  createCoreTools,
  createCutProjectCapabilityProvider,
  createImageUnderstandingCapabilityProvider,
  registerMediaAgentTools,
} from '@neko/agent-runtime/tools';
import type { GenerationBinding, GenerationJobPort, GenerationOwner } from '@neko/generation/job';
import {
  buildEnhancedAgentMessage,
  projectContextReferences,
  CapabilityRegistryRuntime,
  deliverCreatorVisibleArtifactsFromTurnProjection,
  createHostAgentContentAccessRuntime,
  type AgentCreatorVisibleArtifactDeliveryOutcome,
  type AgentCreatorVisibleArtifactDeliveryPort,
  type AgentContentAccessRuntime,
} from '@neko/agent-runtime/runtime';
import { createContentReadCapabilityProvider } from '@neko/agent-runtime';
import {
  createNodeDocumentAccessService,
  createNodeDocumentLowLevelAccess,
} from '@neko/content/document/node';
import {
  CONFIGURED_AGENT_TURN_CAPABILITIES,
  AGENT_AUTHORING_BINDING_METADATA_KEY,
  isAgentAuthorizedContentReferenceContextData,
  TOOL_NAMES_PERCEPTION,
  TOOL_NAMES_QUALITY,
  TOOL_NAMES_SYSTEM,
  TOOL_NAMES_TRANSCRIBE,
  type AgentContextPayload,
  type AgentCapabilityProvider,
  type AgentEntryTargetReceipt,
  type AgentTurnCapabilityConstraint,
  type IToolRegistry,
  type PromptFragment,
  type Tool,
} from '@neko/agent-contracts';
import type { AgentAuthoringMutationAuthority } from './agent-authoring-mutation-authority';
import {
  createNodeHostContentReadService,
  NodeAuthorizedWorkspaceWriter,
} from '@neko/content/node';
import { CanvasProjectAuthoringService } from '@neko/canvas-domain';
import { CutProjectAuthoringService } from '@neko/cut-domain';
import type {
  ContentLocator,
  ContentReadService,
  ContentRepresentationLocator,
} from '@neko/content';
import type { EffectiveAgentConfigurationProjection } from '@neko/agent-contracts';
import type {
  AgentHomeActivitySummary,
  AgentHomeAttentionStatus,
  AgentHomeConversationSummary,
  AgentHomeDiagnostic,
  AgentHomeProjection,
  AgentConversationOwnerRef,
  AgentMessageQueueSnapshot,
  AgentQueuedMessageDraft,
  AgentQueuedMessageItem,
} from '@neko/agent-contracts';
import type { AgentCredentialRuntime } from '../pi/credential-runtime';
import { resolveWorkspaceContentLocator } from '@neko/assets-node';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type {
  AgentExtensionCatalogSnapshot,
  AgentExtensionRuntimeReadiness,
} from '@neko/agent-contracts';
import {
  disposeAgentPluginRuntimeChanges,
  listChangedAgentPluginRuntimeIds,
  listChangedPluginRuntimeSourceIds,
  reconcileAgentPluginRuntime,
  type AgentPluginToolAdapterPort,
  type AgentPluginRuntime,
} from '@neko/agent-runtime/extensions';
import {
  createAgentProviderTurnScheduler,
  type AgentProviderTurnScheduler,
} from './agent-provider-turn-scheduler';
import { createPiToolResultAssetLoader } from './pi-tool-result-asset-loader';
import { PiContentToolModelProtocol } from './pi-content-tool-model-protocol';
import {
  AgentMessageQueueOperationError,
  createAgentConversationMessageQueue,
  type AgentConversationMessageQueue,
} from '../runtime/session/agent-message-queue';

export interface AgentConversationOpenInput {
  readonly conversationId: string;
  readonly models: OpenPiConversationRuntimeOptions['models'];
  readonly initialModelPolicy: AgentModelPolicy;
  readonly baseSystemPrompt: string;
}

export interface AgentTurnInput {
  readonly conversationId: string;
  readonly prompt: string;
  readonly presentationText?: string;
  readonly turnId?: string;
  readonly modelPolicy: AgentModelPolicy;
  readonly configuration: AgentTurnConfigurationSnapshot;
  readonly permissionPolicy:
    PiToolPermissionPolicy | ((events: PiProductEventSink) => PiToolPermissionPolicy);
  readonly workspaceTrusted: boolean;
  readonly locale: 'en' | 'zh';
  readonly contextPayloads?: readonly AgentContextPayload[];
  readonly entryTargetReceipt?: AgentEntryTargetReceipt | null;
  readonly systemPrompt?: string;
  readonly skillName?: string;
  readonly skillActivationId?: string;
  readonly additionalInstructions?: string;
  readonly queueDraft?: AgentQueuedMessageDraft;
  readonly events?: PiProductEventSink;
  readonly capabilityConstraint?: AgentTurnCapabilityConstraint;
}

const MAX_AGENT_TURN_IMAGES = 4;
const MAX_AGENT_TURN_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AGENT_TURN_IMAGE_DIMENSION = 8_192;
const MAX_AGENT_TURN_TEXT_BYTES = 256 * 1024;

export interface AgentTurnResult {
  readonly identity: PiToolRunIdentity;
  readonly durability: NonNullable<ReturnType<NodePiConversationAuthority['getTurnDurability']>>;
  readonly projection: ReturnType<ConversationProjectionStore['snapshot']>;
  readonly configuration: AgentTurnConfigurationSnapshot;
  readonly artifactDelivery?: AgentCreatorVisibleArtifactDeliveryOutcome;
  readonly path: {
    readonly runtime: 'pi-conversation-runtime';
    readonly transcript: 'pi-session';
    readonly metadata: 'sqlite';
    readonly projection: 'conversation-projection-store';
  };
}

export interface AgentTurnConfigurationSnapshot {
  readonly requested: EffectiveAgentConfigurationProjection;
  readonly effective: EffectiveAgentConfigurationProjection;
  readonly diagnostics: readonly {
    readonly code: string;
    readonly message: string;
  }[];
}

export interface AgentTurnOperation {
  readonly identity: PiToolRunIdentity;
  readonly completion: Promise<AgentTurnResult>;
}

export class AgentQueuedTurnCancellationError extends Error {
  constructor(
    readonly conversationId: string,
    readonly queueItemId: string,
    readonly reason: 'cancelled' | 'edit' | 'cleared' | 'disposed',
  ) {
    super(`Queued Agent turn '${queueItemId}' was ${reason}.`);
    this.name = 'AgentQueuedTurnCancellationError';
  }
}

export interface AgentConversationEvidence {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly branchId: string;
  readonly piSessionId: string;
  readonly writerLeaseId: string;
}

export type AgentConversationRuntimeProtectionReason = 'queued' | 'approval' | 'question';

export interface AgentVisiblePresentationBinding {
  readonly bindingId: string;
  readonly workspaceId: string;
  readonly conversationId: string | undefined;
  updateConversation(conversationId?: string): Promise<void>;
  dispose(): Promise<void>;
}

export interface AgentConversationRuntimeProtection {
  readonly protectionId: string;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly reason: AgentConversationRuntimeProtectionReason;
  dispose(): Promise<void>;
}

export interface AgentConversationRuntimeResidency {
  readonly conversationId: string;
  readonly resident: boolean;
  readonly visibleBindingCount: number;
  readonly running: boolean;
  readonly queued: boolean;
  readonly waitingForInput: boolean;
  readonly releasable: boolean;
}

export interface AgentWorkspaceRuntimeResidency {
  readonly workspaceId: string;
  readonly visibleBindingCount: number;
  readonly releaseRequested: boolean;
  readonly releasable: boolean;
  readonly conversations: readonly AgentConversationRuntimeResidency[];
}

export interface AgentWorkspaceRuntime {
  readonly workspaceId: string;
  readonly workspace: AssetWorkspaceResolution;
  readonly models: ReturnType<typeof createOpenNekoPiModels>;
  readonly tools: IToolRegistry;
  loadDisplayAsset?(input: {
    readonly locator: ContentLocator | ContentRepresentationLocator;
    readonly maxBytes: number;
    readonly signal?: AbortSignal;
  }): Promise<
    import('../runtime/capability/agent-content-access-runtime').AgentProviderAssetResult
  >;
  createConversation(conversationId: string): Promise<void>;
  ensureConversation(conversationId: string, title: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  clearAllConversations(): Promise<void>;
  openConversation(input: AgentConversationOpenInput): Promise<void>;
  checkpointFailedInitialTurn(input: {
    readonly conversationId: string;
    readonly turnId: string;
    readonly messageText: string;
    readonly contextPayloads?: readonly AgentContextPayload[];
  }): Promise<void>;
  startTurn(input: AgentTurnInput): AgentTurnOperation;
  executeTurn(input: AgentTurnInput): Promise<AgentTurnResult>;
  readMessageQueue(conversationId: string): AgentMessageQueueSnapshot;
  sendQueuedMessageNow(conversationId: string, queueItemId: string): AgentMessageQueueSnapshot;
  cancelQueuedMessage(
    conversationId: string,
    queueItemId: string,
  ): Promise<AgentMessageQueueSnapshot>;
  takeQueuedMessageForEdit(
    conversationId: string,
    queueItemId: string,
  ): Promise<{
    readonly item: AgentQueuedMessageItem;
    readonly snapshot: AgentMessageQueueSnapshot;
  }>;
  clearMessageQueue(conversationId: string): Promise<AgentMessageQueueSnapshot>;
  cancelTurn(conversationId: string, identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>): void;
  readActiveTurn(conversationId: string): Pick<PiToolRunIdentity, 'turnId' | 'runId'> | undefined;
  readConversationEntries(
    conversationId: string,
  ): Promise<readonly PiConversationTranscriptEntry[]>;
  readContextTokenCount(conversationId: string): Promise<number>;
  clearContext(conversationId: string): Promise<void>;
  compactContext(
    conversationId: string,
    contextWindow: number,
  ): Promise<Awaited<ReturnType<PiConversationRuntime['compactContext']>>>;
  readSkillCatalog(workspaceTrusted: boolean): Promise<AgentSkillCatalog>;
  invokeCommand(name: string, activationId: string, args?: string): Promise<string>;
  readCapabilityPromptFragments(locale: 'en' | 'zh'): readonly PromptFragment[];
  listConversations(): ReturnType<NodePiConversationAuthority['listConversations']>;
  readConversationEvidence(conversationId: string): AgentConversationEvidence;
  readConversationProjection(
    conversationId: string,
  ): ReturnType<ConversationProjectionStore['snapshot']>;
  subscribeConversationProjection(
    conversationId: string,
    listener: ConversationProjectionListener,
  ): () => void;
  bindVisiblePresentation(input: {
    readonly bindingId: string;
    readonly conversationId?: string;
  }): AgentVisiblePresentationBinding;
  protectConversationRuntime(input: {
    readonly protectionId: string;
    readonly conversationId: string;
    readonly reason: AgentConversationRuntimeProtectionReason;
  }): AgentConversationRuntimeProtection;
  readRuntimeResidency(): AgentWorkspaceRuntimeResidency;
  dispose(): Promise<void>;
}

export interface AgentCommandCatalog {
  readonly records: readonly CommandHostRecord[];
  readonly diagnostics: readonly {
    readonly code: CommandHostSnapshot['diagnostics'][number]['code'];
    readonly source: CommandHostRecord['source']['kind'];
  }[];
}

export interface AgentSkillCatalog {
  readonly records: readonly SkillHostRecord[];
  readonly diagnostics: readonly {
    readonly code: PiSkillHostSnapshot['diagnostics'][number]['code'];
    readonly source: SkillSourceKind;
  }[];
  readonly warnings: readonly {
    readonly code: 'duplicate-skill';
    readonly skillName: string;
    readonly selectedSource: SkillSourceKind;
    readonly shadowedSource: SkillSourceKind;
  }[];
  readonly commands: AgentCommandCatalog;
}

export interface AgentAppHost {
  readonly credentialRuntime: AgentCredentialRuntime;
  attachWorkspace(workspace: AssetWorkspaceResolution): Promise<AgentWorkspaceRuntime>;
  getWorkspace(workspaceId: string): AgentWorkspaceRuntime | undefined;
  deleteConversation(conversationId: string): Promise<void>;
  findConversation(conversationId: string): PiConversationCatalogRecord | undefined;
  readGlobalSkillCatalog(): Promise<AgentSkillCatalog>;
  hasActiveTurns(): boolean;
  listActivePluginTurns(pluginId: string): readonly PiToolRunIdentity[];
  reconcilePluginRuntime(
    snapshot: AgentExtensionCatalogSnapshot,
  ): Promise<ReadonlyMap<string, AgentExtensionRuntimeReadiness>>;
  readHomeProjection(): AgentHomeProjection;
  readRuntimeResidency(): readonly AgentWorkspaceRuntimeResidency[];
  subscribeHomeProjection(listener: () => void): () => void;
  dispose(): Promise<void>;
}

export interface CreateAgentAppHostOptions {
  readonly userDataRoot: string;
  readonly userHome: string;
  readonly hostId: string;
  readonly credentialRuntime: AgentCredentialRuntime;
  readonly catalogReader: PiConversationCatalogReader;
  readonly assistantSpaceIds?: readonly string[];
  readonly builtinSkillRoot?: string;
  readonly createIdentity?: () => string;
  readonly createWorkspaceLogger?: (workspace: AssetWorkspaceResolution) => ILogger;
  readonly resolveGenerationJobs: (binding: GenerationBinding) => Promise<GenerationJobPort>;
  readonly creatorVisibleArtifactDelivery?: AgentCreatorVisibleArtifactDeliveryPort;
  readonly authoringMutationAuthority?: AgentAuthoringMutationAuthority;
  readonly resolveWorkspaceCapabilityProviders?: (
    workspace: AssetWorkspaceResolution,
  ) => readonly AgentCapabilityProvider[];
  readonly resolveContentReadService?: (
    workspace: AssetWorkspaceResolution,
  ) => ContentReadService | undefined;
  readonly pluginToolAdapters?: AgentPluginToolAdapterPort;
  readonly loadTransientToolResultImage?: (input: {
    readonly receiptId: string;
    readonly sessionId: string;
    readonly actionId: string;
  }) => Promise<{ readonly bytes: Uint8Array; readonly mimeType: string }>;
}

export function createAgentAppHost(options: CreateAgentAppHostOptions): AgentAppHost {
  return new DefaultAgentAppHost(options);
}

class DefaultAgentAppHost implements AgentAppHost {
  private readonly workspaces = new Map<string, DefaultAgentWorkspaceRuntime>();
  private readonly opening = new Map<string, Promise<DefaultAgentWorkspaceRuntime>>();
  private readonly closing = new Map<string, Promise<void>>();
  private readonly homeProjectionListeners = new Set<() => void>();
  private readonly assistantSpaceIds: readonly string[];
  private readonly providerTurns: AgentProviderTurnScheduler;
  private pluginRuntime: AgentPluginRuntime | undefined;
  private pluginRuntimeChanging = false;
  private disposed = false;

  constructor(private readonly options: CreateAgentAppHostOptions) {
    requireIdentity(options.hostId, 'Agent Host');
    this.assistantSpaceIds = normalizeIdentities(options.assistantSpaceIds ?? []);
    this.providerTurns = createAgentProviderTurnScheduler();
  }

  get credentialRuntime(): AgentCredentialRuntime {
    return this.options.credentialRuntime;
  }

  async attachWorkspace(workspace: AssetWorkspaceResolution): Promise<AgentWorkspaceRuntime> {
    this.requireActive();
    const closing = this.closing.get(workspace.workspaceId);
    if (closing) {
      await closing;
      this.requireActive();
    }
    const existing = this.workspaces.get(workspace.workspaceId);
    if (existing) {
      existing.assertWorkspace(workspace);
      return existing;
    }
    const pending = this.opening.get(workspace.workspaceId);
    if (pending) {
      const opened = await pending;
      opened.assertWorkspace(workspace);
      return opened;
    }
    const operation = this.openWorkspace(workspace);
    this.opening.set(workspace.workspaceId, operation);
    try {
      return await operation;
    } finally {
      this.opening.delete(workspace.workspaceId);
    }
  }

  getWorkspace(workspaceId: string): AgentWorkspaceRuntime | undefined {
    this.requireActive();
    return this.workspaces.get(workspaceId);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this.requireActive();
    requireIdentity(conversationId, 'Conversation');
    const record = this.options.catalogReader.findConversation(conversationId);
    if (!record) {
      throw new Error(`Agent conversation '${conversationId}' does not exist.`);
    }
    const workspace =
      this.workspaces.get(record.workspaceId) ?? (await this.opening.get(record.workspaceId));
    if (workspace) {
      await workspace.deleteConversation(conversationId);
      return;
    }
    const authority = await NodePiConversationAuthority.create({
      userDataRoot: this.options.userDataRoot,
      workspaceId: record.workspaceId,
      hostId: `${this.options.hostId}:conversation-cleanup:${record.workspaceId}`,
    });
    try {
      await deletePersistedConversation(authority, conversationId);
    } finally {
      await authority.dispose();
    }
    this.emitHomeProjectionChanged();
  }

  findConversation(conversationId: string): PiConversationCatalogRecord | undefined {
    this.requireActive();
    return this.options.catalogReader.findConversation(conversationId);
  }

  async readGlobalSkillCatalog(): Promise<AgentSkillCatalog> {
    this.requireActive();
    const roots = await existingGlobalSkillRoots({
      userHome: this.options.userHome,
      ...(this.options.builtinSkillRoot === undefined
        ? {}
        : { builtinSkillRoot: this.options.builtinSkillRoot }),
    });
    const [snapshot, commandSnapshot] = await Promise.all([
      createNodePiSkillHost({
        cwd: this.options.userHome,
        policy: {
          isTrusted: () => true,
          isEnabled: () => true,
        },
      }).discover([...roots, ...(this.pluginRuntime?.skillRoots ?? [])]),
      createNodeCommandHost(this.options.userHome).discover(
        await existingGlobalCommandRoots({ userHome: this.options.userHome }),
      ),
    ]);
    return projectAgentSkillCatalog(snapshot, commandSnapshot);
  }

  hasActiveTurns(): boolean {
    this.requireActive();
    return [...this.workspaces.values()].some((workspace) => workspace.hasActiveTurns());
  }

  listActivePluginTurns(pluginId: string): readonly PiToolRunIdentity[] {
    this.requireActive();
    requireIdentity(pluginId, 'Plugin');
    return Object.freeze(
      [...this.workspaces.values()]
        .flatMap((workspace) => workspace.listActivePluginTurns(pluginId))
        .sort((left, right) => left.runId.localeCompare(right.runId)),
    );
  }

  async reconcilePluginRuntime(
    snapshot: AgentExtensionCatalogSnapshot,
  ): Promise<ReadonlyMap<string, AgentExtensionRuntimeReadiness>> {
    this.requireActive();
    if (this.pluginRuntimeChanging) {
      throw new Error('Agent plugin runtime is already changing.');
    }
    this.pluginRuntimeChanging = true;
    try {
      const expectedChangedPluginIds = listChangedPluginRuntimeSourceIds(
        this.pluginRuntime,
        snapshot,
      );
      this.assertPluginRuntimeChangesIdle(expectedChangedPluginIds);
      const next = await reconcileAgentPluginRuntime(this.pluginRuntime, snapshot, {
        ...(this.options.pluginToolAdapters === undefined
          ? {}
          : { toolAdapters: this.options.pluginToolAdapters }),
      });
      const changedPluginIds = listChangedAgentPluginRuntimeIds(this.pluginRuntime, next);
      try {
        this.assertPluginRuntimeChangesIdle(changedPluginIds);
        for (const workspace of this.workspaces.values()) {
          workspace.assertPluginRuntimeCompatible(next);
        }
        for (const workspace of this.workspaces.values()) {
          workspace.applyPluginRuntime(next);
        }
      } catch (error) {
        await disposeAgentPluginRuntimeChanges(next, this.pluginRuntime);
        throw error;
      }
      const previous = this.pluginRuntime;
      this.pluginRuntime = next;
      await disposeAgentPluginRuntimeChanges(previous, next);
      return next.readiness;
    } finally {
      this.pluginRuntimeChanging = false;
    }
  }

  private assertPluginRuntimeChangesIdle(pluginIds: readonly string[]): void {
    for (const pluginId of pluginIds) {
      const turns = this.listActivePluginTurns(pluginId);
      if (turns.length > 0) {
        throw new Error(
          `Agent plugin '${pluginId}' runtime cannot change while it owns ${turns.length} Agent turn(s).`,
        );
      }
    }
  }

  readHomeProjection(): AgentHomeProjection {
    this.requireActive();
    const catalog = this.options.catalogReader.listConversations();
    const conversations: AgentHomeConversationSummary[] = [];
    const localizedDiagnosticConversationIds = new Set<string>();
    for (const record of catalog.records) {
      const workspace = this.workspaces.get(record.workspaceId);
      const catalogDiagnostic = catalog.diagnostics.find(
        (diagnostic) => diagnostic.conversationId === record.conversationId,
      );
      if (
        catalogDiagnostic === undefined &&
        record.context?.kind === 'room' &&
        record.context.scope === 'participant'
      ) {
        continue;
      }
      const ownerProjection = projectAgentConversationOwner(
        record,
        this.assistantSpaceIds,
        workspace?.hasLocalConversationProjection(record.conversationId) ?? false,
        catalogDiagnostic,
      );
      if (ownerProjection.kind === 'invalid') {
        if (catalogDiagnostic) localizedDiagnosticConversationIds.add(record.conversationId);
        conversations.push(
          projectAgentHomeConversationSummary(
            record,
            ownerProjection.displayOwner,
            undefined,
            undefined,
            {
              fieldNames: ownerProjection.fieldNames,
              message: ownerProjection.message,
            },
          ),
        );
        continue;
      }
      conversations.push(
        workspace
          ? workspace.projectHomeConversation(record, ownerProjection.owner)
          : projectAgentHomeConversationSummary(
              record,
              ownerProjection.owner,
              undefined,
              undefined,
            ),
      );
    }
    conversations.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const attention = {
      needsInput: countAttention(conversations, 'needs-input'),
      needsReview: countAttention(conversations, 'needs-review'),
      running: countAttention(conversations, 'running'),
    };
    const diagnostics = catalog.diagnostics.filter(
      (diagnostic) =>
        diagnostic.conversationId === undefined ||
        !localizedDiagnosticConversationIds.has(diagnostic.conversationId),
    );
    return freezeClone({
      conversations,
      attention,
      diagnostics,
    });
  }

  readRuntimeResidency(): readonly AgentWorkspaceRuntimeResidency[] {
    this.requireActive();
    return Object.freeze(
      [...this.workspaces.values()]
        .map((workspace) => workspace.readRuntimeResidency())
        .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId)),
    );
  }

  subscribeHomeProjection(listener: () => void): () => void {
    this.requireActive();
    this.homeProjectionListeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.homeProjectionListeners.delete(listener);
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const pending = await Promise.allSettled(this.opening.values());
    const closing = await Promise.allSettled(this.closing.values());
    const openedDuringDisposal = pending.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const workspaces = new Set([...this.workspaces.values(), ...openedDuringDisposal]);
    const results = await Promise.allSettled(
      [...workspaces].map((workspace) => workspace.dispose()),
    );
    this.workspaces.clear();
    this.opening.clear();
    this.closing.clear();
    this.homeProjectionListeners.clear();
    const pluginResult = await Promise.allSettled([
      this.pluginRuntime?.dispose() ?? Promise.resolve(),
    ]);
    this.pluginRuntime = undefined;
    let catalogError: unknown;
    try {
      this.options.catalogReader.dispose();
    } catch (error) {
      catalogError = error;
    }
    let credentialError: unknown;
    try {
      this.options.credentialRuntime.dispose();
    } catch (error) {
      credentialError = error;
    }
    let providerSchedulerError: unknown;
    try {
      this.providerTurns.dispose();
    } catch (error) {
      providerSchedulerError = error;
    }
    const errors = [
      ...pending.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ...closing.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ...results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ...pluginResult.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ...(catalogError === undefined ? [] : [catalogError]),
      ...(credentialError === undefined ? [] : [credentialError]),
      ...(providerSchedulerError === undefined ? [] : [providerSchedulerError]),
    ];
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to dispose Agent AppHost composition.');
    }
  }

  private async openWorkspace(
    workspace: AssetWorkspaceResolution,
  ): Promise<DefaultAgentWorkspaceRuntime> {
    const authority = await NodePiConversationAuthority.create({
      userDataRoot: this.options.userDataRoot,
      workspaceId: workspace.workspaceId,
      hostId: `${this.options.hostId}:${workspace.workspaceId}`,
    });
    const isAssistantSpace = this.assistantSpaceIds.includes(workspace.workspaceId);
    const owner: GenerationOwner = isAssistantSpace
      ? { kind: 'assistant', assistantSpaceId: workspace.workspaceId }
      : { kind: 'workspace', workspaceId: workspace.workspaceId };
    const generationBinding: GenerationBinding = { owner, root: workspace.workspacePath };
    const generationJobs = createDeferredGenerationJobPort(() =>
      this.options.resolveGenerationJobs(generationBinding),
    );
    if (this.disposed) {
      await authority.dispose();
      throw new Error('Agent AppHost composition was disposed during workspace attach.');
    }
    const contentReadService = this.options.resolveContentReadService?.(workspace);
    const runtime = new DefaultAgentWorkspaceRuntime({
      workspace,
      authority,
      ...(this.options.createWorkspaceLogger
        ? { logger: this.options.createWorkspaceLogger(workspace) }
        : {}),
      userHome: this.options.userHome,
      ...(this.options.builtinSkillRoot === undefined
        ? {}
        : { builtinSkillRoot: this.options.builtinSkillRoot }),
      createIdentity: this.options.createIdentity ?? randomUUID,
      credentialRuntime: this.options.credentialRuntime,
      owner,
      generationJobs,
      onHomeProjectionChanged: this.emitHomeProjectionChanged,
      canStartTurn: () => !this.pluginRuntimeChanging,
      onReleaseEligible: (candidate) => this.releaseWorkspaceIfEligible(candidate),
      providerTurnAdmission: this.providerTurns,
      structuredProjectAuthoring: !isAssistantSpace,
      ...(contentReadService ? { contentReadService } : {}),
      ...(this.options.loadTransientToolResultImage === undefined
        ? {}
        : { loadTransientToolResultImage: this.options.loadTransientToolResultImage }),
      ...(this.options.authoringMutationAuthority === undefined
        ? {}
        : { authoringMutationAuthority: this.options.authoringMutationAuthority }),
      workspaceCapabilityProviders:
        this.options.resolveWorkspaceCapabilityProviders?.(workspace) ?? [],
      ...(owner.kind === 'workspace' && this.options.creatorVisibleArtifactDelivery
        ? { creatorVisibleArtifactDelivery: this.options.creatorVisibleArtifactDelivery }
        : {}),
    });
    if (this.pluginRuntime) runtime.applyPluginRuntime(this.pluginRuntime);
    this.workspaces.set(workspace.workspaceId, runtime);
    runtime.logAttached();
    this.emitHomeProjectionChanged();
    return runtime;
  }

  private async releaseWorkspaceIfEligible(workspace: DefaultAgentWorkspaceRuntime): Promise<void> {
    if (this.disposed || this.workspaces.get(workspace.workspaceId) !== workspace) return;
    if (!workspace.isReleaseEligible()) return;
    this.workspaces.delete(workspace.workspaceId);
    const operation = workspace.dispose();
    this.closing.set(workspace.workspaceId, operation);
    this.emitHomeProjectionChanged();
    try {
      await operation;
    } finally {
      if (this.closing.get(workspace.workspaceId) === operation) {
        this.closing.delete(workspace.workspaceId);
      }
    }
  }

  private readonly emitHomeProjectionChanged = (): void => {
    if (this.disposed) return;
    for (const listener of this.homeProjectionListeners) listener();
  };

  private requireActive(): void {
    if (this.disposed) throw new Error('Agent AppHost composition is disposed.');
  }
}

function createDeferredGenerationJobPort(
  resolve: () => Promise<GenerationJobPort>,
): GenerationJobPort {
  let pending: Promise<GenerationJobPort> | undefined;
  const requirePort = (): Promise<GenerationJobPort> => {
    if (pending) return pending;
    const attempt = resolve();
    pending = attempt.catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
  return {
    submitGeneration: async (input) => (await requirePort()).submitGeneration(input),
    describeGeneration: async (ref) => (await requirePort()).describeGeneration(ref),
    observeGeneration: async function* (ref) {
      yield* (await requirePort()).observeGeneration(ref);
    },
    cancelGeneration: async (input) => (await requirePort()).cancelGeneration(input),
    retryGeneration: async (input) => (await requirePort()).retryGeneration(input),
    regenerateGeneration: async (input) => (await requirePort()).regenerateGeneration(input),
    reconcileGeneration: async (input) => (await requirePort()).reconcileGeneration(input),
  };
}

interface DefaultAgentWorkspaceRuntimeOptions {
  readonly workspace: AssetWorkspaceResolution;
  readonly authority: NodePiConversationAuthority;
  readonly logger?: ILogger;
  readonly userHome: string;
  readonly builtinSkillRoot?: string;
  readonly createIdentity: () => string;
  readonly credentialRuntime: AgentCredentialRuntime;
  readonly owner: GenerationOwner;
  readonly generationJobs: GenerationJobPort;
  readonly onHomeProjectionChanged: () => void;
  readonly canStartTurn: () => boolean;
  readonly onReleaseEligible: (workspace: DefaultAgentWorkspaceRuntime) => Promise<void>;
  readonly providerTurnAdmission: AgentProviderTurnScheduler;
  readonly structuredProjectAuthoring: boolean;
  readonly contentReadService?: ContentReadService;
  readonly creatorVisibleArtifactDelivery?: AgentCreatorVisibleArtifactDeliveryPort;
  readonly authoringMutationAuthority?: AgentAuthoringMutationAuthority;
  readonly workspaceCapabilityProviders: readonly AgentCapabilityProvider[];
  readonly loadTransientToolResultImage?: (input: {
    readonly receiptId: string;
    readonly sessionId: string;
    readonly actionId: string;
  }) => Promise<{ readonly bytes: Uint8Array; readonly mimeType: string }>;
}

interface PendingAgentTurnOperation {
  readonly queueItemId: string;
  readonly input: AgentTurnInput;
  readonly identity: PiToolRunIdentity;
  readonly pluginIds: Set<string>;
  readonly completion: Promise<AgentTurnResult>;
  readonly resolve: (result: AgentTurnResult) => void;
  readonly reject: (error: unknown) => void;
}

interface PendingAgentConversationTurns {
  readonly messages: AgentConversationMessageQueue;
  readonly operations: Map<string, PendingAgentTurnOperation>;
}

class DefaultAgentWorkspaceRuntime implements AgentWorkspaceRuntime {
  readonly tools = createToolRegistry();
  readonly models: ReturnType<typeof createOpenNekoPiModels>;
  private readonly contentAccessRuntime: AgentContentAccessRuntime;
  private readonly toolResultAssetLoader: ReturnType<typeof createPiToolResultAssetLoader>;
  private readonly contentToolModelProtocol = new PiContentToolModelProtocol();
  private readonly capabilities: CapabilityRegistryRuntime;
  private readonly conversations = new Map<string, AgentConversationOwner>();
  private readonly projections = new Map<string, ConversationProjectionStore>();
  private readonly opening = new Map<string, Promise<AgentConversationOwner>>();
  private readonly materializing = new Map<string, Promise<void>>();
  private readonly activeTurnOperations = new Map<
    Promise<AgentTurnResult>,
    PendingAgentTurnOperation
  >();
  private readonly pendingConversationTurns = new Map<string, PendingAgentConversationTurns>();
  private readonly activeConversationTurns = new Map<string, PendingAgentTurnOperation>();
  private readonly visibleBindings = new Map<string, { conversationId: string | undefined }>();
  private readonly runtimeProtections = new Map<
    string,
    {
      readonly conversationId: string;
      readonly reason: AgentConversationRuntimeProtectionReason;
    }
  >();
  private pluginSkillRoots: readonly SkillSourceRoot[] = [];
  private readonly pluginToolNames = new Set<string>();
  private pluginRuntime: AgentPluginRuntime | undefined;
  private residencyTail: Promise<void> = Promise.resolve();
  private visibilityLifecycleAttached = false;
  private releaseRequested = false;
  private disposed = false;

  constructor(private readonly options: DefaultAgentWorkspaceRuntimeOptions) {
    this.models = createOpenNekoPiModels(options.credentialRuntime.credentials);
    this.contentAccessRuntime = createAgentContentAccessRuntime(
      options.workspace,
      options.contentReadService,
    );
    this.toolResultAssetLoader = createPiToolResultAssetLoader(
      this.contentAccessRuntime,
      options.loadTransientToolResultImage,
    );
    this.capabilities = new CapabilityRegistryRuntime(
      { toolRegistry: this.tools },
      options.logger ? { logger: options.logger } : {},
    );
    for (const tool of createCoreTools({ defaultCwd: options.workspace.workspacePath })) {
      this.tools.register(tool);
    }
    const context = { hostContext: null };
    this.capabilities.registerProvider(
      createContentReadCapabilityProvider({ contentAccessRuntime: this.contentAccessRuntime }),
      context,
    );
    this.capabilities.registerProvider(
      createImageUnderstandingCapabilityProvider({
        contentAccessRuntime: this.contentAccessRuntime,
      }),
      context,
    );
    if (options.structuredProjectAuthoring) {
      const contentRead =
        options.contentReadService ??
        createNodeHostContentReadService({
          workspaceRoot: options.workspace.workspacePath,
        });
      const workspaceWriter = new NodeAuthorizedWorkspaceWriter({
        workspaceRoot: options.workspace.workspacePath,
      });
      this.capabilities.registerProvider(
        createCanvasProjectCapabilityProvider(
          new CanvasProjectAuthoringService({ contentRead, workspaceWriter }),
        ),
        context,
      );
      this.capabilities.registerProvider(
        createCutProjectCapabilityProvider(
          new CutProjectAuthoringService({ contentRead, workspaceWriter }),
        ),
        context,
      );
    }
    for (const provider of options.workspaceCapabilityProviders) {
      this.capabilities.registerProvider(provider, context);
    }
    registerMediaAgentTools(this.tools, options.generationJobs);
  }

  get workspaceId(): string {
    return this.options.workspace.workspaceId;
  }

  get workspace(): AssetWorkspaceResolution {
    return this.options.workspace;
  }

  loadDisplayAsset(input: {
    readonly locator: ContentLocator | ContentRepresentationLocator;
    readonly maxBytes: number;
    readonly signal?: AbortSignal;
  }): Promise<
    import('../runtime/capability/agent-content-access-runtime').AgentProviderAssetResult
  > {
    this.requireActive();
    if (input.locator.kind === 'content-representation') {
      const loadRepresentationAsset = this.contentAccessRuntime.loadRepresentationAsset;
      if (!loadRepresentationAsset) {
        return Promise.resolve({
          status: 'failed',
          diagnostics: [
            {
              code: 'agent-content-access-unavailable',
              severity: 'error',
              message: 'Content representation display access is unavailable.',
            },
          ],
        });
      }
      return loadRepresentationAsset.call(this.contentAccessRuntime, {
        locator: input.locator,
        maxBytes: input.maxBytes,
      });
    }
    return this.contentAccessRuntime.loadContentAsset({
      locator: input.locator,
      maxBytes: input.maxBytes,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  assertWorkspace(workspace: AssetWorkspaceResolution): void {
    if (
      workspace.workspaceId !== this.workspaceId ||
      workspace.workspacePath !== this.options.workspace.workspacePath
    ) {
      throw new Error(
        `Agent workspace '${workspace.workspaceId}' does not match its registered resolution.`,
      );
    }
  }

  logAttached(): void {
    this.options.logger?.info('Workspace runtime attached.', { workspaceId: this.workspaceId });
  }

  async createConversation(conversationId: string, title?: string): Promise<void> {
    this.requireActive();
    requireIdentity(conversationId, 'Conversation');
    const lease = this.options.authority.acquireLease(conversationId);
    try {
      await this.options.authority.createConversation({
        lease,
        conversationId,
        branchId: 'main',
        ...(title === undefined ? {} : { title }),
      });
    } finally {
      this.options.authority.releaseLease(lease);
    }
    this.requireProjection(conversationId);
    this.options.onHomeProjectionChanged();
    this.options.logger?.info('Conversation created.', {
      workspaceId: this.workspaceId,
      conversationId,
    });
  }

  async ensureConversation(conversationId: string, title: string): Promise<void> {
    this.requireActive();
    requireIdentity(conversationId, 'Conversation');
    if (this.options.authority.readConversation(conversationId)) {
      this.requireProjection(conversationId);
      return;
    }
    const pending = this.materializing.get(conversationId);
    if (pending) return pending;
    const operation = this.createConversation(conversationId, title);
    this.materializing.set(conversationId, operation);
    try {
      await operation;
    } finally {
      this.materializing.delete(conversationId);
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this.requireActive();
    requireIdentity(conversationId, 'Conversation');
    this.rejectPendingConversationTurns(conversationId, 'cleared');
    this.pendingConversationTurns.delete(conversationId);
    const owner = this.conversations.get(conversationId);
    if (owner) {
      await owner.stop();
      this.conversations.delete(conversationId);
    }
    await deletePersistedConversation(this.options.authority, conversationId);
    this.contentToolModelProtocol.releaseConversation(conversationId);
    this.projections.get(conversationId)?.dispose();
    this.projections.delete(conversationId);
    this.options.onHomeProjectionChanged();
    this.options.logger?.info('Conversation deleted.', {
      workspaceId: this.workspaceId,
      conversationId,
    });
  }

  async clearAllConversations(): Promise<void> {
    const conversationIds = this.listConversations().map((record) => record.conversationId);
    for (const conversationId of conversationIds) {
      await this.deleteConversation(conversationId);
    }
  }

  async openConversation(input: AgentConversationOpenInput): Promise<void> {
    await this.getOrOpenConversation(input);
  }

  async checkpointFailedInitialTurn(input: {
    readonly conversationId: string;
    readonly turnId: string;
    readonly messageText: string;
    readonly contextPayloads?: readonly AgentContextPayload[];
  }): Promise<void> {
    this.requireActive();
    const record = this.options.authority.readConversation(input.conversationId);
    if (!record) {
      throw new Error(`Agent conversation '${input.conversationId}' does not exist.`);
    }
    if (this.options.authority.readCheckpoint(input.conversationId, input.turnId)) return;
    const lease = this.options.authority.acquireLease(input.conversationId);
    try {
      if (
        this.options.authority.getTurnDurability(input.conversationId, input.turnId) === undefined
      ) {
        this.options.authority.startTurnDurability(input.conversationId, input.turnId);
      }
      await this.options.authority.checkpointTurn({
        lease,
        conversationId: input.conversationId,
        branchId: record.activeBranchId,
        turnId: input.turnId,
        terminalState: 'failed',
        userMessagePresentation: projectAgentUserMessagePresentation({
          turnId: input.turnId,
          content: input.messageText,
          contextPayloads: input.contextPayloads,
        }),
        messages: [
          {
            role: 'user',
            content: input.messageText,
            timestamp: Date.now(),
          },
        ],
      });
      this.options.onHomeProjectionChanged();
    } finally {
      this.options.authority.releaseLease(lease);
    }
  }

  startTurn(input: AgentTurnInput): AgentTurnOperation {
    this.requireActive();
    if (!this.options.canStartTurn()) {
      throw new Error('Agent cannot start a turn while plugin runtime is changing.');
    }
    const owner = this.requireConversation(input.conversationId);
    const identity: PiToolRunIdentity = Object.freeze({
      workspaceId: this.workspaceId,
      conversationId: input.conversationId,
      branchId: owner.branchId,
      turnId: input.turnId ?? this.options.createIdentity(),
      runId: this.options.createIdentity(),
    });
    let settlement:
      | {
          readonly resolve: (result: AgentTurnResult) => void;
          readonly reject: (error: unknown) => void;
        }
      | undefined;
    const completion = new Promise<AgentTurnResult>((resolve, reject) => {
      settlement = { resolve, reject };
    });
    if (!settlement) throw new Error('Agent turn completion could not be initialized.');
    const queue = this.getOrCreatePendingConversationTurns(input.conversationId);
    const queueItem = queue.messages.enqueue({
      content: describeQueuedTurn(input),
      source: 'composer',
      ...(input.queueDraft === undefined ? {} : { draft: input.queueDraft }),
    });
    const pending: PendingAgentTurnOperation = {
      queueItemId: queueItem.id,
      input,
      identity,
      pluginIds: new Set(this.pluginRuntime?.contributions.keys() ?? []),
      completion,
      resolve: settlement.resolve,
      reject: settlement.reject,
    };
    queue.operations.set(queueItem.id, pending);
    this.activeTurnOperations.set(completion, pending);
    this.startNextConversationTurn(input.conversationId);
    return Object.freeze({ identity, completion });
  }

  executeTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
    return this.startTurn(input).completion;
  }

  hasActiveTurns(): boolean {
    return this.activeTurnOperations.size > 0;
  }

  listActivePluginTurns(pluginId: string): readonly PiToolRunIdentity[] {
    return Object.freeze(
      [...this.activeTurnOperations.values()]
        .filter((operation) => operation.pluginIds.has(pluginId))
        .map((operation) => operation.identity),
    );
  }

  readMessageQueue(conversationId: string): AgentMessageQueueSnapshot {
    this.assertConversationExists(conversationId);
    return (
      this.pendingConversationTurns.get(conversationId)?.messages.snapshot() ??
      emptyMessageQueueSnapshot(conversationId)
    );
  }

  sendQueuedMessageNow(conversationId: string, queueItemId: string): AgentMessageQueueSnapshot {
    this.assertConversationExists(conversationId);
    const queue = this.requirePendingConversationTurns(conversationId);
    queue.messages.promote(queueItemId);
    queue.messages.resume();
    const active = this.activeConversationTurns.get(conversationId);
    if (active) {
      this.requireConversation(conversationId).cancel(active.identity);
    } else {
      this.startNextConversationTurn(conversationId);
    }
    return queue.messages.snapshot();
  }

  async cancelQueuedMessage(
    conversationId: string,
    queueItemId: string,
  ): Promise<AgentMessageQueueSnapshot> {
    return this.removeQueuedMessage(conversationId, queueItemId, 'cancelled').then(
      ({ snapshot }) => snapshot,
    );
  }

  takeQueuedMessageForEdit(
    conversationId: string,
    queueItemId: string,
  ): Promise<{
    readonly item: AgentQueuedMessageItem;
    readonly snapshot: AgentMessageQueueSnapshot;
  }> {
    return this.removeQueuedMessage(conversationId, queueItemId, 'edit');
  }

  async clearMessageQueue(conversationId: string): Promise<AgentMessageQueueSnapshot> {
    this.assertConversationExists(conversationId);
    const queue = this.pendingConversationTurns.get(conversationId);
    if (!queue) return emptyMessageQueueSnapshot(conversationId);
    this.rejectPendingConversationTurns(conversationId, 'cleared');
    await this.reconcileRuntimeResidencyIfAttached();
    return queue.messages.snapshot();
  }

  assertPluginRuntimeCompatible(pluginRuntime: AgentPluginRuntime): void {
    this.requireActive();
    const changedPluginIds = listChangedAgentPluginRuntimeIds(this.pluginRuntime, pluginRuntime);
    for (const pluginId of changedPluginIds) {
      if (this.listActivePluginTurns(pluginId).length > 0) {
        throw new Error(
          `Agent workspace '${this.workspaceId}' cannot replace plugin '${pluginId}' Tools during an owning turn.`,
        );
      }
    }
    for (const tool of pluginRuntime.tools) {
      if (this.tools.has(tool.name) && !this.pluginToolNames.has(tool.name)) {
        throw new Error(`Plugin Tool '${tool.name}' conflicts with a registered Tool.`);
      }
    }
  }

  applyPluginRuntime(pluginRuntime: AgentPluginRuntime): void {
    this.assertPluginRuntimeCompatible(pluginRuntime);
    const changedPluginIds = listChangedAgentPluginRuntimeIds(this.pluginRuntime, pluginRuntime);
    for (const pluginId of changedPluginIds) {
      for (const tool of this.pluginRuntime?.contributions.get(pluginId)?.tools ?? []) {
        this.tools.unregister(tool.name);
        this.pluginToolNames.delete(tool.name);
      }
    }
    for (const pluginId of changedPluginIds) {
      for (const tool of pluginRuntime.contributions.get(pluginId)?.tools ?? []) {
        this.tools.register(tool);
        this.pluginToolNames.add(tool.name);
      }
    }
    this.pluginRuntime = pluginRuntime;
    this.pluginSkillRoots = pluginRuntime.skillRoots;
  }

  private startNextConversationTurn(conversationId: string): void {
    if (this.disposed || this.activeConversationTurns.has(conversationId)) return;
    const queue = this.pendingConversationTurns.get(conversationId);
    if (!queue) return;
    const item = queue.messages.releaseNext();
    if (!item) return;
    const pending = queue.operations.get(item.id);
    if (!pending) {
      throw new Error(
        `Agent queued message '${item.id}' has no pending turn operation in Conversation '${conversationId}'.`,
      );
    }
    queue.operations.delete(item.id);
    this.activeConversationTurns.set(conversationId, pending);
    void this.runConversationTurn(pending);
  }

  private async runConversationTurn(pending: PendingAgentTurnOperation): Promise<void> {
    for (const pluginId of this.pluginRuntime?.contributions.keys() ?? []) {
      pending.pluginIds.add(pluginId);
    }
    const runtimeSnapshot = Object.freeze({
      tools: Object.freeze([...this.tools.list()]),
      pluginSkillRoots: this.pluginSkillRoots,
    });
    let outcome:
      | { readonly ok: true; readonly result: AgentTurnResult }
      | { readonly ok: false; readonly error: unknown };
    try {
      outcome = {
        ok: true,
        result: await this.executeTurnOwned(pending.input, pending.identity, runtimeSnapshot),
      };
    } catch (error) {
      outcome = { ok: false, error };
    }
    if (this.activeConversationTurns.get(pending.input.conversationId) === pending) {
      this.activeConversationTurns.delete(pending.input.conversationId);
    }
    this.activeTurnOperations.delete(pending.completion);
    let residencyError: unknown;
    if (!this.disposed && this.visibilityLifecycleAttached) {
      try {
        await this.reconcileRuntimeResidency();
      } catch (error) {
        residencyError = error;
      }
    }
    if (outcome.ok && residencyError === undefined) {
      pending.resolve(outcome.result);
    } else if (!outcome.ok && residencyError !== undefined) {
      pending.reject(
        new AggregateError(
          [outcome.error, residencyError],
          `Agent turn ${pending.identity.conversationId}/${pending.identity.turnId} and runtime reconciliation failed.`,
        ),
      );
    } else {
      pending.reject(outcome.ok ? residencyError : outcome.error);
    }
    this.startNextConversationTurn(pending.input.conversationId);
  }

  private getOrCreatePendingConversationTurns(
    conversationId: string,
  ): PendingAgentConversationTurns {
    const existing = this.pendingConversationTurns.get(conversationId);
    if (existing) return existing;
    const created: PendingAgentConversationTurns = {
      messages: createAgentConversationMessageQueue({
        conversationId,
        createId: this.options.createIdentity,
      }),
      operations: new Map(),
    };
    this.pendingConversationTurns.set(conversationId, created);
    return created;
  }

  private requirePendingConversationTurns(conversationId: string): PendingAgentConversationTurns {
    const queue = this.pendingConversationTurns.get(conversationId);
    if (!queue) {
      throw new AgentMessageQueueOperationError(
        'stale-item',
        `Conversation '${conversationId}' has no pending Agent messages.`,
      );
    }
    return queue;
  }

  private async removeQueuedMessage(
    conversationId: string,
    queueItemId: string,
    reason: 'cancelled' | 'edit',
  ): Promise<{
    readonly item: AgentQueuedMessageItem;
    readonly snapshot: AgentMessageQueueSnapshot;
  }> {
    this.assertConversationExists(conversationId);
    const queue = this.requirePendingConversationTurns(conversationId);
    const item = queue.messages.remove(queueItemId);
    const pending = queue.operations.get(queueItemId);
    if (!pending) {
      throw new Error(
        `Agent queued message '${queueItemId}' lost its pending turn operation in Conversation '${conversationId}'.`,
      );
    }
    queue.operations.delete(queueItemId);
    this.activeTurnOperations.delete(pending.completion);
    pending.reject(new AgentQueuedTurnCancellationError(conversationId, queueItemId, reason));
    await this.reconcileRuntimeResidencyIfAttached();
    return Object.freeze({ item, snapshot: queue.messages.snapshot() });
  }

  private rejectPendingConversationTurns(
    conversationId: string,
    reason: 'cleared' | 'disposed',
  ): void {
    const queue = this.pendingConversationTurns.get(conversationId);
    if (!queue) return;
    const pendingItems = queue.messages.snapshot().items;
    for (const item of pendingItems) {
      const pending = queue.operations.get(item.id);
      if (!pending) {
        throw new Error(
          `Agent queued message '${item.id}' lost its pending turn operation in Conversation '${conversationId}'.`,
        );
      }
      queue.operations.delete(item.id);
      this.activeTurnOperations.delete(pending.completion);
      pending.reject(new AgentQueuedTurnCancellationError(conversationId, item.id, reason));
    }
    queue.messages.clear();
  }

  private reconcileRuntimeResidencyIfAttached(): Promise<void> {
    return this.visibilityLifecycleAttached ? this.reconcileRuntimeResidency() : Promise.resolve();
  }

  private async executeTurnOwned(
    input: AgentTurnInput,
    identity: PiToolRunIdentity,
    runtimeSnapshot: {
      readonly tools: readonly Tool[];
      readonly pluginSkillRoots: readonly SkillSourceRoot[];
    },
  ): Promise<AgentTurnResult> {
    this.requireActive();
    const owner = this.requireConversation(input.conversationId);
    const messageId = this.options.createIdentity();
    const capabilityConstraint = input.capabilityConstraint ?? CONFIGURED_AGENT_TURN_CAPABILITIES;
    if (
      capabilityConstraint.skills === 'none' &&
      (input.skillName !== undefined || input.skillActivationId !== undefined)
    ) {
      throw new Error(
        `Agent turn capability constraint '${capabilityConstraint.owner.kind}/${capabilityConstraint.owner.id}' forbids Skill activation.`,
      );
    }
    const skills = await this.discoverSkills(
      input.workspaceTrusted,
      capabilityConstraint.skills === 'none' ? [] : runtimeSnapshot.pluginSkillRoots,
      capabilityConstraint.skills === 'none',
    );
    const imageRoute = resolveAgentTurnImageRoute(input.modelPolicy, runtimeSnapshot.tools);
    const turnTools =
      capabilityConstraint.tools === 'none'
        ? []
        : bindAgentAuthoringMutationAuthority(
            filterAgentTurnImageTools(runtimeSnapshot.tools, imageRoute),
            input.entryTargetReceipt ?? null,
            this.options.authoringMutationAuthority,
          );
    const contextPayloads = await materializeAgentTurnContextPayloads({
      contextPayloads: input.contextPayloads,
      contentAccessRuntime: this.contentAccessRuntime,
      toolNames: new Set(turnTools.map((tool) => tool.name)),
    });
    const contentReferenceIds = this.contentToolModelProtocol.bindInputs(
      input.conversationId,
      input.contextPayloads,
    );
    const capabilityTools = projectOpenNekoTools(turnTools, {
      locale: input.locale,
      purposesForTool: resolveOpenNekoToolModelPurposes,
      purposeForToolCall: resolveOpenNekoToolCallModelPurpose,
      isPurposeOptionalForTool: (tool) => tool.name === TOOL_NAMES_QUALITY.QUALITY_CHECK,
      assetLoader: this.toolResultAssetLoader,
      modelProtocol: this.contentToolModelProtocol,
      metadata: Object.freeze({
        workspaceId: identity.workspaceId,
        conversationId: identity.conversationId,
        branchId: identity.branchId,
        turnId: identity.turnId,
        runId: identity.runId,
      }),
    });
    const timeline = createPiTimelineProjector({
      conversationId: input.conversationId,
      messageId,
      projection: owner.projection,
    });
    const events = composeEventSinks(timeline, input.events);
    const permissionPolicy =
      typeof input.permissionPolicy === 'function'
        ? input.permissionPolicy(events)
        : input.permissionPolicy;
    const images = await materializeAgentTurnImages({
      contextPayloads,
      modelPolicy: input.modelPolicy,
      contentAccessRuntime: this.contentAccessRuntime,
      hasImagePerceptionTool: imageRoute === 'external',
    });
    const prompt = buildEnhancedAgentMessage({
      message: input.prompt,
      contextPayloads,
      contentReferenceIds,
      locale: input.locale,
    });
    const durablePrompt = buildEnhancedAgentMessage({
      message: input.prompt,
      contextPayloads: input.contextPayloads,
      contentReferenceIds,
      locale: input.locale,
    });
    const userMessagePresentation = projectAgentUserMessagePresentation({
      turnId: identity.turnId,
      content: input.presentationText ?? input.prompt,
      contextPayloads: input.contextPayloads,
    });
    const hasContextPayloads = (input.contextPayloads?.length ?? 0) > 0;
    const additionalInstructions =
      input.skillName !== undefined && hasContextPayloads
        ? buildEnhancedAgentMessage({
            message: input.additionalInstructions ?? '',
            contextPayloads,
            contentReferenceIds,
            locale: input.locale,
          })
        : input.additionalInstructions;
    const durableAdditionalInstructions =
      input.skillName !== undefined && hasContextPayloads
        ? buildEnhancedAgentMessage({
            message: input.additionalInstructions ?? '',
            contextPayloads: input.contextPayloads,
            contentReferenceIds,
            locale: input.locale,
          })
        : undefined;
    const operation = owner.execute({
      identity,
      prompt,
      durablePrompt,
      userMessagePresentation,
      modelPolicy: input.modelPolicy,
      skillSnapshot: skills,
      capabilityTools,
      permissionPolicy,
      workspaceTrusted: input.workspaceTrusted,
      events,
      ...(images.length === 0 ? {} : { images }),
      systemPrompt: appendAgentTurnImageRoutingPrompt(
        input.systemPrompt ?? owner.baseSystemPrompt,
        imageRoute,
      ),
      ...(input.skillName === undefined ? {} : { skillName: input.skillName }),
      ...(input.skillActivationId === undefined
        ? {}
        : { skillActivationId: input.skillActivationId }),
      ...(additionalInstructions === undefined ? {} : { additionalInstructions }),
      ...(durableAdditionalInstructions === undefined ? {} : { durableAdditionalInstructions }),
    });
    this.options.onHomeProjectionChanged();
    try {
      await operation;
    } finally {
      this.options.onHomeProjectionChanged();
    }
    const durability = this.options.authority.getTurnDurability(
      input.conversationId,
      identity.turnId,
    );
    if (durability === undefined) {
      throw new Error(
        `Agent turn ${input.conversationId}/${identity.turnId} completed without durability state.`,
      );
    }
    const projection = owner.projection.snapshot();
    const turn = projection.turns.find(
      (candidate) => candidate.turnId === identity.turnId && candidate.runId === identity.runId,
    );
    if (!turn) {
      throw new Error(
        `Agent turn ${identity.conversationId}/${identity.turnId} has no terminal projection.`,
      );
    }
    const artifactDelivery =
      this.options.owner.kind === 'workspace'
        ? await deliverCreatorVisibleArtifactsFromTurnProjection({
            turn,
            workspaceId: identity.workspaceId,
            conversationId: identity.conversationId,
            turnId: identity.turnId,
            runId: identity.runId,
            ...(this.options.creatorVisibleArtifactDelivery
              ? { delivery: this.options.creatorVisibleArtifactDelivery }
              : {}),
          })
        : undefined;
    return Object.freeze({
      identity,
      durability,
      projection,
      configuration: input.configuration,
      ...(artifactDelivery ? { artifactDelivery } : {}),
      path: Object.freeze({
        runtime: 'pi-conversation-runtime',
        transcript: 'pi-session',
        metadata: 'sqlite',
        projection: 'conversation-projection-store',
      }),
    });
  }

  cancelTurn(conversationId: string, identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>): void {
    this.requireConversation(conversationId).cancel(identity);
    this.pendingConversationTurns.get(conversationId)?.messages.pauseAfterActiveTurnCancel();
  }

  readActiveTurn(conversationId: string): Pick<PiToolRunIdentity, 'turnId' | 'runId'> | undefined {
    this.requireActive();
    if (!this.options.authority.readConversation(conversationId)) {
      throw new Error(`Agent conversation '${conversationId}' does not exist.`);
    }
    return this.conversations.get(conversationId)?.readActiveIdentity();
  }

  readConversationEntries(
    conversationId: string,
  ): Promise<readonly PiConversationTranscriptEntry[]> {
    this.requireActive();
    const record = this.options.authority.readConversation(conversationId);
    if (!record) {
      throw new Error(`Agent conversation '${conversationId}' does not exist.`);
    }
    return this.options.authority.readBranchEntries(conversationId, record.activeBranchId);
  }

  async readContextTokenCount(conversationId: string): Promise<number> {
    this.requireActive();
    const record = this.options.authority.readConversation(conversationId);
    if (!record) {
      throw new Error(`Agent conversation '${conversationId}' does not exist.`);
    }
    const owner = this.conversations.get(conversationId);
    if (owner) {
      return owner.contextTokenCount;
    }
    const context = await this.options.authority.buildContext(
      conversationId,
      record.activeBranchId,
    );
    return estimatePiConversationContextTokens(context.messages);
  }

  clearContext(conversationId: string): Promise<void> {
    return this.requireConversation(conversationId).clearContext();
  }

  compactContext(
    conversationId: string,
    contextWindow: number,
  ): Promise<Awaited<ReturnType<PiConversationRuntime['compactContext']>>> {
    return this.requireConversation(conversationId).compactContext(contextWindow);
  }

  async readSkillCatalog(workspaceTrusted: boolean): Promise<AgentSkillCatalog> {
    const [skills, commands] = await Promise.all([
      this.discoverSkills(workspaceTrusted),
      this.discoverCommands(),
    ]);
    return projectAgentSkillCatalog(skills, commands);
  }

  async invokeCommand(name: string, activationId: string, args?: string): Promise<string> {
    this.requireActive();
    return (await this.discoverCommands()).invokeExact(name, activationId, args);
  }

  readCapabilityPromptFragments(locale: 'en' | 'zh'): readonly PromptFragment[] {
    this.requireActive();
    this.capabilities.setCapabilityContext({ hostContext: null, locale });
    return Object.freeze(this.capabilities.getAllPromptFragments());
  }

  listConversations(): ReturnType<NodePiConversationAuthority['listConversations']> {
    this.requireActive();
    return this.options.authority.listConversations();
  }

  readConversationEvidence(conversationId: string): AgentConversationEvidence {
    const owner = this.requireConversation(conversationId);
    const branch = this.options.authority.readBranch(conversationId, owner.branchId);
    if (branch === undefined) {
      throw new Error(
        `Agent branch ${conversationId}/${owner.branchId} is unavailable for evidence.`,
      );
    }
    return Object.freeze({
      workspaceId: this.workspaceId,
      conversationId,
      branchId: owner.branchId,
      piSessionId: branch.session.id,
      writerLeaseId: owner.writerLeaseId,
    });
  }

  readConversationProjection(
    conversationId: string,
  ): ReturnType<ConversationProjectionStore['snapshot']> {
    return this.requireProjection(conversationId).snapshot();
  }

  subscribeConversationProjection(
    conversationId: string,
    listener: ConversationProjectionListener,
  ): () => void {
    return this.requireProjection(conversationId).subscribe(listener);
  }

  bindVisiblePresentation(input: {
    readonly bindingId: string;
    readonly conversationId?: string;
  }): AgentVisiblePresentationBinding {
    this.requireActive();
    requireIdentity(input.bindingId, 'Agent visible binding');
    this.assertConversationExists(input.conversationId);
    if (this.visibleBindings.has(input.bindingId)) {
      throw new Error(`Agent visible binding '${input.bindingId}' is already attached.`);
    }
    const record = { conversationId: input.conversationId };
    this.visibleBindings.set(input.bindingId, record);
    this.visibilityLifecycleAttached = true;
    this.releaseRequested = false;
    let active = true;
    return Object.freeze({
      bindingId: input.bindingId,
      workspaceId: this.workspaceId,
      get conversationId() {
        return record.conversationId;
      },
      updateConversation: async (conversationId?: string): Promise<void> => {
        if (!active) throw new Error(`Agent visible binding '${input.bindingId}' is disposed.`);
        this.requireActive();
        this.assertConversationExists(conversationId);
        if (record.conversationId === conversationId) return;
        record.conversationId = conversationId;
        await this.reconcileRuntimeResidency();
      },
      dispose: async (): Promise<void> => {
        if (!active) return;
        active = false;
        if (this.visibleBindings.get(input.bindingId) !== record) {
          throw new Error(`Agent visible binding '${input.bindingId}' lost its exact owner.`);
        }
        this.visibleBindings.delete(input.bindingId);
        if (this.visibleBindings.size === 0) this.releaseRequested = true;
        await this.reconcileRuntimeResidency();
      },
    });
  }

  protectConversationRuntime(input: {
    readonly protectionId: string;
    readonly conversationId: string;
    readonly reason: AgentConversationRuntimeProtectionReason;
  }): AgentConversationRuntimeProtection {
    this.requireActive();
    requireIdentity(input.protectionId, 'Agent runtime protection');
    requireIdentity(input.conversationId, 'Conversation');
    this.assertConversationExists(input.conversationId);
    if (this.runtimeProtections.has(input.protectionId)) {
      throw new Error(`Agent runtime protection '${input.protectionId}' is already attached.`);
    }
    const record = {
      conversationId: input.conversationId,
      reason: input.reason,
    } as const;
    this.runtimeProtections.set(input.protectionId, record);
    let active = true;
    return Object.freeze({
      protectionId: input.protectionId,
      workspaceId: this.workspaceId,
      conversationId: input.conversationId,
      reason: input.reason,
      dispose: async (): Promise<void> => {
        if (!active) return;
        active = false;
        if (this.runtimeProtections.get(input.protectionId) !== record) {
          throw new Error(`Agent runtime protection '${input.protectionId}' lost its exact owner.`);
        }
        this.runtimeProtections.delete(input.protectionId);
        await this.reconcileRuntimeResidency();
      },
    });
  }

  readRuntimeResidency(): AgentWorkspaceRuntimeResidency {
    this.requireActive();
    const conversationIds = new Set<string>([
      ...this.conversations.keys(),
      ...this.projections.keys(),
      ...this.pendingConversationTurns.keys(),
      ...this.activeConversationTurns.keys(),
      ...[...this.visibleBindings.values()].flatMap((binding) =>
        binding.conversationId === undefined ? [] : [binding.conversationId],
      ),
      ...[...this.runtimeProtections.values()].map((protection) => protection.conversationId),
    ]);
    const conversations = [...conversationIds]
      .sort()
      .map((conversationId) => this.projectConversationResidency(conversationId));
    return freezeClone({
      workspaceId: this.workspaceId,
      visibleBindingCount: this.visibleBindings.size,
      releaseRequested: this.releaseRequested,
      releasable: this.isReleaseEligible(),
      conversations,
    });
  }

  isReleaseEligible(): boolean {
    if (this.disposed || !this.releaseRequested || this.visibleBindings.size > 0) return false;
    if (this.opening.size > 0 || this.materializing.size > 0 || this.hasActiveTurns()) return false;
    const conversationIds = new Set<string>([
      ...this.conversations.keys(),
      ...this.projections.keys(),
      ...[...this.runtimeProtections.values()].map((protection) => protection.conversationId),
    ]);
    return [...conversationIds].every(
      (conversationId) => !this.isConversationProtected(conversationId),
    );
  }

  projectHomeConversation(
    record: PiConversationCatalogRecord,
    ownerRef: AgentConversationOwnerRef,
  ): AgentHomeConversationSummary {
    this.requireActive();
    if (record.workspaceId !== this.workspaceId) {
      throw new Error(
        `Agent catalog conversation '${record.conversationId}' belongs to Workspace '${record.workspaceId}', not '${this.workspaceId}'.`,
      );
    }
    const owner = this.conversations.get(record.conversationId);
    return projectAgentHomeConversationSummary(
      record,
      ownerRef,
      owner?.projection.snapshot(),
      owner?.readActiveIdentity(),
    );
  }

  hasLocalConversationProjection(conversationId: string): boolean {
    this.requireActive();
    return this.projections.has(conversationId);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const conversationId of this.pendingConversationTurns.keys()) {
      this.rejectPendingConversationTurns(conversationId, 'disposed');
    }
    this.pendingConversationTurns.clear();
    const pending = await Promise.allSettled(this.opening.values());
    const openedDuringDisposal = pending.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const conversations = new Set([...this.conversations.values(), ...openedDuringDisposal]);
    const runtimeResults = await Promise.allSettled(
      [...conversations].map((conversation) => conversation.stop()),
    );
    const operationResults = await Promise.allSettled(this.activeTurnOperations.keys());
    for (const projection of this.projections.values()) projection.dispose();
    this.conversations.clear();
    this.projections.clear();
    this.opening.clear();
    this.activeTurnOperations.clear();
    this.pendingConversationTurns.clear();
    this.activeConversationTurns.clear();
    this.visibleBindings.clear();
    this.runtimeProtections.clear();
    this.capabilities.dispose();
    this.tools.clear();
    this.models.clearProviders();
    this.pluginSkillRoots = [];
    this.pluginToolNames.clear();
    this.pluginRuntime = undefined;
    this.contentToolModelProtocol.clear();
    let authorityError: unknown;
    try {
      await this.options.authority.dispose();
    } catch (error) {
      authorityError = error;
    }
    const errors = [
      ...pending.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ...runtimeResults.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ...operationResults.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      ),
      ...(authorityError === undefined ? [] : [authorityError]),
    ];
    if (errors.length > 0) {
      const error = new AggregateError(
        errors,
        `Failed to dispose Agent workspace '${this.workspaceId}'.`,
      );
      this.options.logger?.error('Workspace runtime disposal failed.', error);
      throw error;
    }
    this.options.logger?.info('Workspace runtime disposed.', { workspaceId: this.workspaceId });
  }

  private async getOrOpenConversation(
    input: AgentConversationOpenInput,
  ): Promise<AgentConversationOwner> {
    this.requireActive();
    requireIdentity(input.conversationId, 'Conversation');
    const existing = this.conversations.get(input.conversationId);
    if (existing) {
      existing.assertModels(input.models);
      return existing;
    }
    const pending = this.opening.get(input.conversationId);
    if (pending) {
      const opened = await pending;
      opened.assertModels(input.models);
      return opened;
    }
    const operation = this.openConversationOwner(input);
    this.opening.set(input.conversationId, operation);
    try {
      return await operation;
    } finally {
      this.opening.delete(input.conversationId);
    }
  }

  private async openConversationOwner(
    input: AgentConversationOpenInput,
  ): Promise<AgentConversationOwner> {
    const lease = this.options.authority.acquireLease(input.conversationId);
    let runtime: PiConversationRuntime | undefined;
    let projection: ConversationProjectionStore | undefined;
    let createdProjection = false;
    try {
      const existing = this.options.authority.readConversation(input.conversationId);
      const branchId = existing?.activeBranchId ?? 'main';
      if (existing === undefined) {
        await this.options.authority.createConversation({
          lease,
          conversationId: input.conversationId,
          branchId,
        });
      }
      this.contentToolModelProtocol.restoreConversation(
        input.conversationId,
        await this.options.authority.readBranchEntries(input.conversationId, branchId),
      );
      projection = this.projections.get(input.conversationId);
      if (!projection) {
        projection = this.createProjection(input.conversationId);
        createdProjection = true;
      }
      runtime = await PiConversationRuntime.open({
        authority: this.options.authority,
        lease,
        conversationId: input.conversationId,
        branchId,
        models: input.models,
        initialModelPolicy: input.initialModelPolicy,
        baseSystemPrompt: input.baseSystemPrompt,
        providerTurnAdmission: this.options.providerTurnAdmission,
      });
      if (this.disposed) {
        runtime.dispose();
        runtime = undefined;
        if (createdProjection) {
          projection.dispose();
          this.projections.delete(input.conversationId);
          createdProjection = false;
        }
        throw new Error(
          `Agent workspace '${this.workspaceId}' was disposed during conversation open.`,
        );
      }
      const owner = new AgentConversationOwner(
        runtime,
        projection,
        input.models,
        branchId,
        lease.leaseId,
        input.baseSystemPrompt,
      );
      this.conversations.set(input.conversationId, owner);
      this.options.onHomeProjectionChanged();
      return owner;
    } catch (error) {
      try {
        if (runtime) runtime.dispose();
        else this.options.authority.releaseLease(lease);
        if (createdProjection) {
          projection?.dispose();
          this.projections.delete(input.conversationId);
        }
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Failed to open and clean up Pi conversation '${input.conversationId}'.`,
        );
      }
      throw error;
    }
  }

  private async discoverSkills(
    workspaceTrusted: boolean,
    pluginSkillRoots: readonly SkillSourceRoot[] = this.pluginSkillRoots,
    forceEmpty = false,
  ) {
    const roots = await existingSkillRoots({
      workspacePath: this.options.workspace.workspacePath,
      userHome: this.options.userHome,
      ...(this.options.builtinSkillRoot === undefined
        ? {}
        : { builtinSkillRoot: this.options.builtinSkillRoot }),
    });
    return createNodePiSkillHost({
      cwd: this.options.workspace.workspacePath,
      policy: {
        isTrusted: ({ source }) => source.kind !== 'project' || workspaceTrusted,
        isEnabled: () => true,
      },
    }).discover(forceEmpty ? [] : [...roots, ...pluginSkillRoots]);
  }

  private async discoverCommands(): Promise<CommandHostSnapshot> {
    const roots = await existingCommandRoots({
      workspacePath: this.options.workspace.workspacePath,
      userHome: this.options.userHome,
    });
    return createNodeCommandHost(this.options.workspace.workspacePath).discover(roots);
  }

  private reconcileRuntimeResidency(): Promise<void> {
    const reconcile = async (): Promise<void> => {
      if (this.disposed) return;
      let released = false;
      const conversationIds = new Set<string>([
        ...this.conversations.keys(),
        ...this.projections.keys(),
      ]);
      for (const conversationId of conversationIds) {
        if (this.isConversationProtected(conversationId)) continue;
        const owner = this.conversations.get(conversationId);
        if (owner) {
          await owner.stop();
          if (this.conversations.get(conversationId) === owner) {
            this.conversations.delete(conversationId);
          }
          released = true;
        }
        const projection = this.projections.get(conversationId);
        if (projection) {
          projection.dispose();
          if (this.projections.get(conversationId) === projection) {
            this.projections.delete(conversationId);
          }
          released = true;
        }
        const queue = this.pendingConversationTurns.get(conversationId);
        if (
          queue !== undefined &&
          queue.messages.snapshot().pendingCount === 0 &&
          queue.operations.size === 0
        ) {
          this.pendingConversationTurns.delete(conversationId);
        }
      }
      if (released) this.options.onHomeProjectionChanged();
      await this.options.onReleaseEligible(this);
    };
    const operation = this.residencyTail.then(reconcile, reconcile);
    this.residencyTail = operation;
    return operation;
  }

  private projectConversationResidency(conversationId: string): AgentConversationRuntimeResidency {
    const owner = this.conversations.get(conversationId);
    const protections = [...this.runtimeProtections.values()].filter(
      (protection) => protection.conversationId === conversationId,
    );
    const visibleBindingCount = [...this.visibleBindings.values()].filter(
      (binding) => binding.conversationId === conversationId,
    ).length;
    const running =
      owner?.readActiveIdentity() !== undefined || this.activeConversationTurns.has(conversationId);
    const queued =
      protections.some((protection) => protection.reason === 'queued') ||
      (this.pendingConversationTurns.get(conversationId)?.messages.snapshot().pendingCount ?? 0) >
        0;
    const waitingForInput =
      protections.some(
        (protection) => protection.reason === 'approval' || protection.reason === 'question',
      ) || hasPendingConversationConfirmation(this.projections.get(conversationId));
    const resident = owner !== undefined || this.projections.has(conversationId);
    return Object.freeze({
      conversationId,
      resident,
      visibleBindingCount,
      running,
      queued,
      waitingForInput,
      releasable: resident && visibleBindingCount === 0 && !running && !queued && !waitingForInput,
    });
  }

  private isConversationProtected(conversationId: string): boolean {
    if (
      [...this.visibleBindings.values()].some(
        (binding) => binding.conversationId === conversationId,
      )
    ) {
      return true;
    }
    if (
      [...this.runtimeProtections.values()].some(
        (protection) => protection.conversationId === conversationId,
      )
    ) {
      return true;
    }
    if (this.opening.has(conversationId) || this.materializing.has(conversationId)) return true;
    if (
      this.activeConversationTurns.has(conversationId) ||
      (this.pendingConversationTurns.get(conversationId)?.messages.snapshot().pendingCount ?? 0) > 0
    ) {
      return true;
    }
    if (this.conversations.get(conversationId)?.readActiveIdentity() !== undefined) return true;
    return hasPendingConversationConfirmation(this.projections.get(conversationId));
  }

  private assertConversationExists(conversationId: string | undefined): void {
    if (conversationId === undefined) return;
    requireIdentity(conversationId, 'Conversation');
    if (!this.options.authority.readConversation(conversationId)) {
      throw new Error(
        `Agent conversation '${conversationId}' does not exist in workspace '${this.workspaceId}'.`,
      );
    }
  }

  private requireConversation(conversationId: string): AgentConversationOwner {
    this.requireActive();
    const owner = this.conversations.get(conversationId);
    if (!owner) {
      throw new Error(
        `Agent conversation '${conversationId}' is not open in workspace '${this.workspaceId}'.`,
      );
    }
    return owner;
  }

  private requireProjection(conversationId: string): ConversationProjectionStore {
    this.requireActive();
    const existing = this.projections.get(conversationId);
    if (existing) return existing;
    if (!this.options.authority.readConversation(conversationId)) {
      throw new Error(
        `Agent conversation '${conversationId}' does not exist in workspace '${this.workspaceId}'.`,
      );
    }
    return this.createProjection(conversationId);
  }

  private createProjection(conversationId: string): ConversationProjectionStore {
    const projection = createConversationProjectionStore(conversationId);
    projection.subscribe(this.options.onHomeProjectionChanged);
    this.projections.set(conversationId, projection);
    return projection;
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new Error(`Agent workspace '${this.workspaceId}' is disposed.`);
    }
  }
}

function createAgentContentAccessRuntime(
  workspace: AssetWorkspaceResolution,
  contentRead?: ContentReadService,
): AgentContentAccessRuntime {
  const documentLowLevelAccess = createNodeDocumentLowLevelAccess();
  return createHostAgentContentAccessRuntime({
    contentRead:
      contentRead ??
      createNodeHostContentReadService({
        workspaceRoot: workspace.workspacePath,
        documentEntryReader: {
          readEntry: (sourcePath, entryPath) =>
            documentLowLevelAccess.readEntry(sourcePath, entryPath),
        },
      }),
    documentAccess: createNodeDocumentAccessService(),
    resolveDocumentHostFilePath: (source) => resolveWorkspaceContentLocator(workspace, source),
  });
}

type AgentTurnImageRoute = 'native' | 'external' | 'unavailable';

function resolveAgentTurnImageRoute(
  modelPolicy: AgentModelPolicy,
  tools: readonly Tool[],
): AgentTurnImageRoute {
  if (modelPolicy['agent.main'].model.input.includes('image')) return 'native';
  const understandingModel = modelPolicy['image.understand'];
  return understandingModel?.execution === 'pi' &&
    tools.some((tool) => tool.name === TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND)
    ? 'external'
    : 'unavailable';
}

function filterAgentTurnImageTools(
  tools: readonly Tool[],
  route: AgentTurnImageRoute,
): readonly Tool[] {
  return tools.filter((tool) => {
    if (tool.name === TOOL_NAMES_SYSTEM.READ_IMAGE) return route === 'native';
    if (tool.name === TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND) return route === 'external';
    return true;
  });
}

function bindAgentAuthoringMutationAuthority(
  tools: readonly Tool[],
  receipt: AgentEntryTargetReceipt | null,
  authority: AgentAuthoringMutationAuthority | undefined,
): readonly Tool[] {
  return tools.flatMap((tool) => {
    const expectedTargetKind = tool.requirements?.authoringTargetKind;
    if (expectedTargetKind === undefined) return [tool];
    if (
      authority === undefined ||
      receipt === null ||
      receipt.binding.kind !== 'authoring' ||
      receipt.binding.target.kind !== expectedTargetKind
    ) {
      return [];
    }
    return [
      new Proxy(tool, {
        get(target, property, receiver) {
          if (property !== 'execute') return Reflect.get(target, property, receiver);
          return async (
            args: Record<string, unknown>,
            options?: Parameters<Tool['execute']>[1],
          ) => {
            let binding;
            try {
              binding = await authority.authorize({
                receipt,
                expectedTargetKind,
                ...(options?.signal ? { signal: options.signal } : {}),
              });
            } catch (error) {
              return {
                success: false,
                error: `Agent authoring authority rejected ${tool.name}: ${error instanceof Error ? error.message : String(error)}`,
              };
            }
            const metadata = {
              ...options?.metadata,
              [AGENT_AUTHORING_BINDING_METADATA_KEY]: binding,
            };
            return target.execute(args, { ...options, metadata });
          };
        },
      }),
    ];
  });
}

function appendAgentTurnImageRoutingPrompt(
  systemPrompt: string,
  route: AgentTurnImageRoute,
): string {
  if (route !== 'external') return systemPrompt;
  return `${systemPrompt}\n\n## External Image Understanding\n\nThe main model cannot inspect image pixels directly. For image inspection, OCR, comparison, style, layout, or quality questions, call the registered external image understanding Tool with the short image references from this Conversation and a concise focus. Base the answer on its structured evidence. Never construct paths or locators, select a provider or model, call ReadImage, or guess from filenames and labels.`;
}

async function materializeAgentTurnContextPayloads(input: {
  readonly contextPayloads?: readonly AgentContextPayload[];
  readonly contentAccessRuntime: AgentContentAccessRuntime;
  readonly toolNames: ReadonlySet<string>;
}): Promise<readonly AgentContextPayload[]> {
  return Promise.all(
    (input.contextPayloads ?? []).map(async (payload) => {
      if (!isAgentAuthorizedContentReferenceContextData(payload.data)) return payload;
      if (payload.data.mediaType === 'audio') {
        requireAgentReferenceCapability(payload.label, input.toolNames, [
          TOOL_NAMES_TRANSCRIBE.TRANSCRIBE_AUDIO,
          TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE,
          TOOL_NAMES_PERCEPTION.PERCEIVE,
        ]);
        return payload;
      }
      if (payload.data.mediaType === 'video') {
        requireAgentReferenceCapability(payload.label, input.toolNames, [
          TOOL_NAMES_PERCEPTION.VIDEO_DETECT_SHOTS,
          TOOL_NAMES_PERCEPTION.PERCEIVE,
        ]);
        return payload;
      }
      if (payload.data.mediaType && payload.data.mediaType !== 'text') return payload;
      const unsupportedClass = classifyUnregisteredContentProcessor(payload.data.locator);
      if (unsupportedClass) {
        throw new Error(
          `Agent reference '${payload.label}' requires an exact ${unsupportedClass} processor that is not registered for this Turn.`,
        );
      }
      const loaded = await input.contentAccessRuntime.loadContentAsset({
        locator: payload.data.locator,
        maxBytes: MAX_AGENT_TURN_TEXT_BYTES,
      });
      if (loaded.status !== 'ready' || !loaded.bytes) {
        const diagnostic = loaded.diagnostics[0]?.code ?? loaded.status;
        throw new Error(
          `Agent text reference '${payload.label}' could not be loaded: ${diagnostic}.`,
        );
      }
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(loaded.bytes);
      } catch {
        throw new Error(
          `Agent reference '${payload.label}' is unsupported binary content and no exact processor is registered for this Turn.`,
        );
      }
      if (text.includes('\u0000')) {
        throw new Error(
          `Agent reference '${payload.label}' is unsupported binary content and no exact processor is registered for this Turn.`,
        );
      }
      return {
        ...payload,
        data: { ...payload.data, text },
      };
    }),
  );
}

function classifyUnregisteredContentProcessor(locator: ContentLocator): string | undefined {
  const classification = classifyAgentContentPath(contentLocatorPortablePath(locator));
  return classification.kind === 'score' ||
    classification.kind === 'archive' ||
    classification.kind === 'executable'
    ? classification.processorRequirement
    : undefined;
}

function contentLocatorPortablePath(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
    case 'generated-output':
      return locator.path;
    case 'media-library':
      return locator.relativePath;
    case 'document-entry':
      return locator.entryPath;
    case 'package-resource':
      return locator.resourcePath;
  }
}

function requireAgentReferenceCapability(
  label: string,
  toolNames: ReadonlySet<string>,
  acceptedToolNames: readonly string[],
): void {
  if (acceptedToolNames.some((toolName) => toolNames.has(toolName))) return;
  throw new Error(
    `Agent reference '${label}' requires a media perception capability that is not registered for this Turn.`,
  );
}

async function materializeAgentTurnImages(input: {
  readonly contextPayloads?: readonly AgentContextPayload[];
  readonly modelPolicy: AgentModelPolicy;
  readonly contentAccessRuntime: AgentContentAccessRuntime;
  readonly hasImagePerceptionTool: boolean;
}): Promise<readonly ImageContent[]> {
  const references = (input.contextPayloads ?? []).flatMap((payload) => {
    if (!isAgentAuthorizedContentReferenceContextData(payload.data)) return [];
    if (payload.data.mediaType !== 'image' && payload.data.mediaType !== 'sequence') return [];
    return [{ label: payload.label, locator: payload.data.locator }];
  });
  if (references.length === 0) return [];
  if (!input.modelPolicy['agent.main'].model.input.includes('image')) {
    if (input.hasImagePerceptionTool) return [];
    throw new Error(
      `Agent model '${input.modelPolicy['agent.main'].model.provider}/${input.modelPolicy['agent.main'].model.id}' does not support image input and no image perception capability is registered.`,
    );
  }
  if (references.length > MAX_AGENT_TURN_IMAGES) {
    throw new Error(
      `Agent Turn contains ${references.length} image references; maximum is ${MAX_AGENT_TURN_IMAGES}.`,
    );
  }
  return Promise.all(
    references.map(async (reference) => {
      const loaded = await input.contentAccessRuntime.loadContentAsset({
        locator: reference.locator,
        maxBytes: MAX_AGENT_TURN_IMAGE_BYTES,
      });
      if (loaded.status !== 'ready' || !loaded.bytes || !loaded.mimeType) {
        const diagnostic = loaded.diagnostics[0]?.code ?? loaded.status;
        throw new Error(
          `Agent image reference '${reference.label}' could not be loaded: ${diagnostic}.`,
        );
      }
      const mimeType = await validateAgentTurnImage(
        reference.label,
        reference.locator,
        loaded.bytes,
        loaded.mimeType,
      );
      return {
        type: 'image' as const,
        data: Buffer.from(loaded.bytes).toString('base64'),
        mimeType,
      };
    }),
  );
}

async function validateAgentTurnImage(
  label: string,
  locator: ContentLocator,
  bytes: Uint8Array,
  declaredMimeType: string,
): Promise<string> {
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    metadata = await sharp(bytes, {
      limitInputPixels: MAX_AGENT_TURN_IMAGE_DIMENSION * MAX_AGENT_TURN_IMAGE_DIMENSION,
    }).metadata();
  } catch {
    throw new Error(`Agent image reference '${label}' is not a valid supported image.`);
  }
  const detectedMimeType =
    metadata.format === 'png'
      ? 'image/png'
      : metadata.format === 'jpeg'
        ? 'image/jpeg'
        : metadata.format === 'webp'
          ? 'image/webp'
          : metadata.format === 'gif'
            ? 'image/gif'
            : undefined;
  if (!detectedMimeType) {
    throw new Error(
      `Agent image reference '${label}' uses unsupported image format '${metadata.format ?? 'unknown'}'.`,
    );
  }
  if (declaredMimeType !== detectedMimeType) {
    throw new Error(
      `Agent image reference '${label}' MIME '${declaredMimeType}' does not match '${detectedMimeType}'.`,
    );
  }
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > MAX_AGENT_TURN_IMAGE_DIMENSION ||
    metadata.height > MAX_AGENT_TURN_IMAGE_DIMENSION
  ) {
    throw new Error(`Agent image reference '${label}' exceeds the supported image dimensions.`);
  }
  if (
    locator.kind === 'workspace-file' &&
    !imageExtensions(detectedMimeType).some((extension) =>
      locator.path.toLowerCase().endsWith(extension),
    )
  ) {
    throw new Error(
      `Agent image reference '${label}' extension does not match '${detectedMimeType}'.`,
    );
  }
  return detectedMimeType;
}

function imageExtensions(mimeType: string): readonly string[] {
  switch (mimeType) {
    case 'image/png':
      return ['.png'];
    case 'image/jpeg':
      return ['.jpg', '.jpeg'];
    case 'image/webp':
      return ['.webp'];
    case 'image/gif':
      return ['.gif'];
    default:
      throw new Error(`Unsupported Agent image MIME '${mimeType}'.`);
  }
}

function projectAgentUserMessagePresentation(input: {
  readonly turnId: string;
  readonly content: string;
  readonly contextPayloads?: readonly AgentContextPayload[];
}): PiUserMessagePresentation {
  const contextReferences = projectContextReferences(input.contextPayloads);
  return {
    turnId: input.turnId,
    content: input.content,
    ...(contextReferences === undefined ? {} : { contextReferences }),
  };
}

interface ExecuteAgentConversationInput {
  readonly identity: PiToolRunIdentity;
  readonly prompt: string;
  readonly durablePrompt: string;
  readonly userMessagePresentation: PiUserMessagePresentation;
  readonly images?: readonly ImageContent[];
  readonly modelPolicy: AgentModelPolicy;
  readonly skillSnapshot: Awaited<ReturnType<ReturnType<typeof createNodePiSkillHost>['discover']>>;
  readonly capabilityTools: ReturnType<typeof projectOpenNekoTools>;
  readonly permissionPolicy: PiToolPermissionPolicy;
  readonly workspaceTrusted: boolean;
  readonly events: PiProductEventSink;
  readonly systemPrompt?: string;
  readonly skillName?: string;
  readonly skillActivationId?: string;
  readonly additionalInstructions?: string;
  readonly durableAdditionalInstructions?: string;
}

class AgentConversationOwner {
  private active:
    | {
        readonly identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>;
        readonly operation: Promise<void>;
      }
    | undefined;
  private disposed = false;

  constructor(
    private readonly runtime: PiConversationRuntime,
    readonly projection: ConversationProjectionStore,
    private readonly models: OpenPiConversationRuntimeOptions['models'],
    readonly branchId: string,
    readonly writerLeaseId: string,
    readonly baseSystemPrompt: string,
  ) {}

  assertModels(models: OpenPiConversationRuntimeOptions['models']): void {
    if (models !== this.models) {
      throw new Error(
        'Pi conversation cannot replace its provider model registry while it is open.',
      );
    }
  }

  async execute(input: ExecuteAgentConversationInput): Promise<void> {
    this.requireReady();
    const operation =
      input.skillName === undefined && input.skillActivationId === undefined
        ? this.runtime.execute({
            turnId: input.identity.turnId,
            runId: input.identity.runId,
            prompt: input.prompt,
            durablePrompt: input.durablePrompt,
            userMessagePresentation: input.userMessagePresentation,
            ...(input.images === undefined ? {} : { images: input.images }),
            modelPolicy: input.modelPolicy,
            skillSnapshot: input.skillSnapshot,
            capabilityTools: input.capabilityTools,
            permissionPolicy: input.permissionPolicy,
            workspaceTrusted: input.workspaceTrusted,
            events: input.events,
            ...(input.systemPrompt === undefined ? {} : { systemPrompt: input.systemPrompt }),
          })
        : this.runtime.executeSkill({
            turnId: input.identity.turnId,
            runId: input.identity.runId,
            skillName: requireSkillInvocationIdentity(input).skillName,
            activationId: requireSkillInvocationIdentity(input).activationId,
            ...(input.additionalInstructions === undefined
              ? {}
              : { additionalInstructions: input.additionalInstructions }),
            userMessagePresentation: input.userMessagePresentation,
            ...(input.durableAdditionalInstructions === undefined
              ? {}
              : { durableAdditionalInstructions: input.durableAdditionalInstructions }),
            ...(input.images === undefined ? {} : { images: input.images }),
            modelPolicy: input.modelPolicy,
            skillSnapshot: input.skillSnapshot,
            capabilityTools: input.capabilityTools,
            permissionPolicy: input.permissionPolicy,
            workspaceTrusted: input.workspaceTrusted,
            events: input.events,
            ...(input.systemPrompt === undefined ? {} : { systemPrompt: input.systemPrompt }),
          });
    this.active = { identity: input.identity, operation };
    try {
      await operation;
    } finally {
      this.active = undefined;
    }
  }

  cancel(identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>): void {
    if (this.disposed) throw new Error('Pi conversation owner is disposed.');
    if (!this.active) {
      throw new Error('Pi conversation owner has no active turn to cancel.');
    }
    this.runtime.cancel(identity);
  }

  readActiveIdentity(): Pick<PiToolRunIdentity, 'turnId' | 'runId'> | undefined {
    return this.active?.identity;
  }

  get contextTokenCount(): number {
    if (this.disposed) throw new Error('Pi conversation owner is disposed.');
    return this.runtime.contextTokenCount;
  }

  clearContext(): Promise<void> {
    if (this.disposed) throw new Error('Pi conversation owner is disposed.');
    return this.runtime.clearContext();
  }

  compactContext(
    contextWindow: number,
  ): Promise<Awaited<ReturnType<PiConversationRuntime['compactContext']>>> {
    if (this.disposed) throw new Error('Pi conversation owner is disposed.');
    if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0) {
      throw new Error('Pi context compaction requires a positive context window.');
    }
    const reserveTokens = Math.max(1, Math.floor(contextWindow * 0.2));
    return this.runtime.compactContext({
      reserveTokens,
      keepRecentTokens: Math.max(1, contextWindow - reserveTokens),
    });
  }

  async stop(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const active = this.active;
    if (active && this.runtime.isBusy) this.runtime.cancel(active.identity);
    let executionError: unknown;
    try {
      await active?.operation;
    } catch (error) {
      executionError = error;
    }
    let runtimeError: unknown;
    try {
      this.runtime.dispose();
    } catch (error) {
      runtimeError = error;
    }
    const errors = [
      ...(executionError === undefined ? [] : [executionError]),
      ...(runtimeError === undefined ? [] : [runtimeError]),
    ];
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to dispose Pi conversation owner.');
    }
  }

  private requireReady(): void {
    if (this.disposed) throw new Error('Pi conversation owner is disposed.');
    if (this.active !== undefined) {
      throw new Error('Pi conversation owner already has an active turn.');
    }
  }
}

function requireSkillInvocationIdentity(input: {
  readonly skillName?: string;
  readonly skillActivationId?: string;
}): { readonly skillName: string; readonly activationId: string } {
  if (!input.skillName || !input.skillActivationId) {
    throw new Error('Agent Skill execution requires an exact Skill name and activation identity.');
  }
  return { skillName: input.skillName, activationId: input.skillActivationId };
}

function composeEventSinks(
  projection: PiProductEventSink,
  external: PiProductEventSink | undefined,
): PiProductEventSink {
  if (external === undefined) return projection;
  return {
    async emit(event): Promise<void> {
      await projection.emit(event);
      await external.emit(event);
    },
  };
}

function hasPendingConversationConfirmation(
  projection: ConversationProjectionStore | undefined,
): boolean {
  const latestTurn = projection?.snapshot().turns.at(-1);
  return (
    latestTurn?.items.some(
      (item) => item.kind === 'tool_call' && item.payload.toolCall.pendingConfirmation === true,
    ) ?? false
  );
}

export function projectAgentHomeConversationSummary(
  record: PiConversationCatalogRecord,
  owner: AgentConversationOwnerRef,
  projection: ReturnType<ConversationProjectionStore['snapshot']> | undefined,
  active: Pick<PiToolRunIdentity, 'turnId' | 'runId'> | undefined,
  unavailable?: NonNullable<AgentHomeConversationSummary['unavailable']>,
): AgentHomeConversationSummary {
  const latestTurn = projection?.turns.at(-1);
  const pendingConfirmation = latestTurn?.items
    .filter(
      (item) => item.kind === 'tool_call' && item.payload.toolCall.pendingConfirmation === true,
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  let attention: AgentHomeAttentionStatus = 'none';
  let lastActivity: AgentHomeActivitySummary = {
    kind: 'conversation-updated',
    occurredAt: record.updatedAt,
  };
  if (pendingConfirmation?.kind === 'tool_call') {
    attention = 'needs-input';
    lastActivity = {
      kind: 'tool-confirmation-required',
      occurredAt: new Date(pendingConfirmation.updatedAt).toISOString(),
      turnId: pendingConfirmation.turnId,
      runId: pendingConfirmation.runId,
      toolCallId: pendingConfirmation.payload.toolCall.id,
    };
  } else if (active) {
    attention = 'running';
    lastActivity = {
      kind: 'turn-running',
      occurredAt: latestTurn
        ? latestTurnActivityAt(latestTurn, record.updatedAt)
        : record.updatedAt,
      turnId: active.turnId,
      runId: active.runId,
    };
  } else if (latestTurn?.completion) {
    const completion = latestTurn.completion;
    attention = completion.status === 'failed' ? 'needs-review' : 'none';
    lastActivity = {
      kind:
        completion.status === 'completed'
          ? 'turn-completed'
          : completion.status === 'cancelled'
            ? 'turn-cancelled'
            : 'turn-failed',
      occurredAt: new Date(completion.completedAt).toISOString(),
      turnId: latestTurn.turnId,
      runId: latestTurn.runId,
    };
  } else if (latestTurn) {
    attention = 'running';
    lastActivity = {
      kind: 'turn-running',
      occurredAt: latestTurnActivityAt(latestTurn, record.updatedAt),
      turnId: latestTurn.turnId,
      runId: latestTurn.runId,
    };
  }
  const generationJob = latestTurn
    ? latestTurn.items
        .filter((item) => item.kind === 'tool_call')
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((item) => projectGenerationJobSummary(item.payload.toolCall, item.payload.progress))
        .find((summary) => summary !== undefined)
    : undefined;
  if (generationJob) {
    lastActivity = { ...lastActivity, generationJob };
  }
  return {
    navigation: {
      conversationId: record.conversationId,
      owner,
    },
    title: record.title,
    updatedAt: record.updatedAt,
    attention,
    lastActivity,
    ...(unavailable === undefined ? {} : { unavailable }),
  };
}

type AgentConversationOwnerProjection =
  | {
      readonly kind: 'valid';
      readonly owner: AgentConversationOwnerRef;
    }
  | {
      readonly kind: 'invalid';
      readonly displayOwner: AgentConversationOwnerRef;
      readonly fieldNames: readonly string[];
      readonly message: string;
    };

function projectAgentConversationOwner(
  record: PiConversationCatalogRecord,
  assistantSpaceIds: readonly string[],
  hasLocalConversationProjection: boolean,
  catalogDiagnostic: AgentHomeDiagnostic | undefined,
): AgentConversationOwnerProjection {
  if (catalogDiagnostic) {
    return invalidAgentConversationOwner(
      record,
      assistantSpaceIds,
      ['context'],
      catalogDiagnostic.message,
    );
  }
  if (record.context?.kind === 'assistant') {
    if (record.context.assistantSpaceId !== record.workspaceId) {
      return invalidAgentConversationOwner(
        record,
        assistantSpaceIds,
        ['context', 'workspaceId'],
        `Agent catalog Conversation '${record.conversationId}' Assistant Space does not match its Pi runtime scope.`,
      );
    }
    return {
      kind: 'valid',
      owner: { kind: 'assistant', assistantSpaceId: record.context.assistantSpaceId },
    };
  }
  if (record.context?.kind === 'workspace') {
    if (record.context.workspaceId !== record.workspaceId) {
      return invalidAgentConversationOwner(
        record,
        assistantSpaceIds,
        ['context', 'workspaceId'],
        `Agent catalog Conversation '${record.conversationId}' Workspace context does not match its Pi runtime scope.`,
      );
    }
    if (assistantSpaceIds.includes(record.context.workspaceId)) {
      return invalidAgentConversationOwner(
        record,
        assistantSpaceIds,
        ['context'],
        `Agent catalog Conversation '${record.conversationId}' Workspace context resolves to an Assistant Space.`,
      );
    }
    return {
      kind: 'valid',
      owner: { kind: 'workspace', workspaceId: record.context.workspaceId },
    };
  }
  if (
    record.context?.kind === 'character' &&
    record.context.characterRunId !== undefined &&
    record.context.dialogueRunId !== undefined
  ) {
    return {
      kind: 'valid',
      owner: {
        kind: 'character',
        characterId: record.context.characterId,
        characterRunId: record.context.characterRunId,
        dialogueRunId: record.context.dialogueRunId,
      },
    };
  }
  if (record.context?.kind === 'room') {
    return {
      kind: 'valid',
      owner: {
        kind: 'room',
        roomId: record.context.roomId,
        roomRunId: record.context.roomRunId,
      },
    };
  }
  if (hasLocalConversationProjection) {
    return {
      kind: 'valid',
      owner: assistantSpaceIds.includes(record.workspaceId)
        ? { kind: 'assistant', assistantSpaceId: record.workspaceId }
        : { kind: 'workspace', workspaceId: record.workspaceId },
    };
  }
  return invalidAgentConversationOwner(
    record,
    assistantSpaceIds,
    ['context'],
    `Agent catalog Conversation '${record.conversationId}' context is not present.`,
  );
}

function invalidAgentConversationOwner(
  record: PiConversationCatalogRecord,
  assistantSpaceIds: readonly string[],
  fieldNames: readonly string[],
  message: string,
): AgentConversationOwnerProjection {
  return {
    kind: 'invalid',
    displayOwner:
      record.context?.kind === 'assistant'
        ? { kind: 'assistant', assistantSpaceId: record.context.assistantSpaceId }
        : record.context?.kind === 'workspace'
          ? { kind: 'workspace', workspaceId: record.context.workspaceId }
          : record.context?.kind === 'character' &&
              record.context.characterRunId !== undefined &&
              record.context.dialogueRunId !== undefined
            ? {
                kind: 'character',
                characterId: record.context.characterId,
                characterRunId: record.context.characterRunId,
                dialogueRunId: record.context.dialogueRunId,
              }
            : record.context?.kind === 'room'
              ? {
                  kind: 'room',
                  roomId: record.context.roomId,
                  roomRunId: record.context.roomRunId,
                }
              : assistantSpaceIds.includes(record.workspaceId)
                ? { kind: 'assistant', assistantSpaceId: record.workspaceId }
                : { kind: 'workspace', workspaceId: record.workspaceId },
    fieldNames,
    message,
  };
}

function projectGenerationJobSummary(
  toolCall: {
    readonly result?: { readonly data: unknown };
  },
  progress: { readonly data?: unknown } | undefined,
): AgentHomeActivitySummary['generationJob'] | undefined {
  const result = asRecord(toolCall.result?.data);
  const candidate =
    asRecord(result?.['generationJob']) ??
    asRecord(progress?.data) ??
    (readString(result, 'jobId') ? result : undefined);
  if (!candidate) return undefined;
  const ref = asRecord(candidate['ref']);
  const kind = candidate['kind'] ?? ref?.['kind'];
  if (kind !== undefined && kind !== 'generation-job' && kind !== 'generation') return undefined;
  const jobId = readString(candidate, 'jobId') ?? readString(ref, 'jobId');
  const phase =
    readString(candidate, 'phase') ??
    (readString(candidate, 'status') === 'completed'
      ? 'succeeded'
      : readString(candidate, 'status'));
  if (!jobId || !phase) return undefined;
  return { jobId, phase };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function latestTurnActivityAt(
  turn: ReturnType<ConversationProjectionStore['snapshot']>['turns'][number],
  defaultTimestamp: string,
): string {
  const latest = turn.items.reduce<number | undefined>(
    (current, item) =>
      current === undefined || item.updatedAt > current ? item.updatedAt : current,
    undefined,
  );
  return latest === undefined ? defaultTimestamp : new Date(latest).toISOString();
}

function countAttention(
  conversations: readonly AgentHomeConversationSummary[],
  status: Exclude<AgentHomeAttentionStatus, 'none'>,
): number {
  return conversations.filter((conversation) => conversation.attention === status).length;
}

function normalizeIdentities(identities: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(identities)]
      .map((identity) => {
        requireIdentity(identity, 'Assistant Space');
        return identity;
      })
      .sort(),
  );
}

function freezeClone<T>(value: T): T {
  return freezeValue(structuredClone(value));
}

function describeQueuedTurn(input: AgentTurnInput): string {
  const text =
    input.queueDraft?.message.trim() || input.presentationText?.trim() || input.prompt.trim();
  if (text) return text;
  const labels = [
    ...(input.queueDraft?.attachments?.map((attachment) => attachment.name) ?? []),
    ...(input.queueDraft?.fileReferences?.map((reference) => reference.label) ?? []),
    ...(input.queueDraft?.contextPayloads?.map((payload) => payload.label) ?? []),
  ].filter((label) => label.trim().length > 0);
  if (labels.length > 0) return labels.join(', ');
  throw new AgentMessageQueueOperationError(
    'not-queueable',
    'Queued Agent Turn requires message content or supported input context.',
  );
}

function emptyMessageQueueSnapshot(conversationId: string): AgentMessageQueueSnapshot {
  return Object.freeze({
    conversationId,
    items: Object.freeze([]),
    pendingCount: 0,
    paused: false,
    sequence: 0,
  });
}

function freezeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) freezeValue(item);
    return Object.freeze(value);
  }
  if (typeof value !== 'object' || value === null) return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  for (const item of Object.values(value)) freezeValue(item);
  return Object.freeze(value);
}

async function existingSkillRoots(input: {
  readonly workspacePath: string;
  readonly userHome: string;
  readonly builtinSkillRoot?: string;
}): Promise<readonly SkillSourceRoot[]> {
  const projectRoot = resolveProjectAgentSkillsDir(input.workspacePath);
  if (!projectRoot) throw new Error('Workspace Skill root requires an exact Workspace path.');
  const candidates: readonly SkillSourceRoot[] = [
    {
      path: projectRoot,
      source: { kind: 'project' },
    },
    {
      path: resolvePersonalAgentSkillsDir(input.userHome),
      source: { kind: 'personal' },
    },
    ...(input.builtinSkillRoot === undefined
      ? []
      : [
          {
            path: input.builtinSkillRoot,
            source: { kind: 'builtin' as const },
          },
        ]),
  ];
  return existingSkillSourceRoots(candidates);
}

async function existingGlobalSkillRoots(input: {
  readonly userHome: string;
  readonly builtinSkillRoot?: string;
}): Promise<readonly SkillSourceRoot[]> {
  const candidates: readonly SkillSourceRoot[] = [
    {
      path: resolvePersonalAgentSkillsDir(input.userHome),
      source: { kind: 'personal' },
    },
    ...(input.builtinSkillRoot === undefined
      ? []
      : [
          {
            path: input.builtinSkillRoot,
            source: { kind: 'builtin' as const },
          },
        ]),
  ];
  return existingSkillSourceRoots(candidates);
}

async function existingSkillSourceRoots(
  candidates: readonly SkillSourceRoot[],
): Promise<readonly SkillSourceRoot[]> {
  const roots: SkillSourceRoot[] = [];
  for (const candidate of candidates) {
    try {
      await access(candidate.path);
      roots.push(candidate);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      if (candidate.source.kind === 'builtin') {
        throw new Error('Desktop builtin Skill root is unavailable.', { cause: error });
      }
    }
  }
  return Object.freeze(roots);
}

async function existingCommandRoots(input: {
  readonly workspacePath: string;
  readonly userHome: string;
}): Promise<readonly CommandSourceRoot[]> {
  return existingCommandSourceRoots([
    { path: join(input.workspacePath, 'neko', 'commands'), source: { kind: 'project' } },
    { path: join(input.userHome, '.neko', 'commands'), source: { kind: 'personal' } },
  ]);
}

async function existingGlobalCommandRoots(input: {
  readonly userHome: string;
}): Promise<readonly CommandSourceRoot[]> {
  return existingCommandSourceRoots([
    { path: join(input.userHome, '.neko', 'commands'), source: { kind: 'personal' } },
  ]);
}

async function existingCommandSourceRoots(
  candidates: readonly CommandSourceRoot[],
): Promise<readonly CommandSourceRoot[]> {
  const roots: CommandSourceRoot[] = [];
  for (const candidate of candidates) {
    try {
      await access(candidate.path);
      roots.push(candidate);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
    }
  }
  return Object.freeze(roots);
}

function projectAgentSkillCatalog(
  snapshot: PiSkillHostSnapshot,
  commands: CommandHostSnapshot,
): AgentSkillCatalog {
  return Object.freeze({
    records: snapshot.records,
    diagnostics: Object.freeze(
      snapshot.diagnostics.map((diagnostic) =>
        Object.freeze({
          code: diagnostic.code,
          source: diagnostic.source.kind,
        }),
      ),
    ),
    warnings: Object.freeze(
      snapshot.warnings.map((warning) =>
        Object.freeze({
          code: warning.code,
          skillName: warning.skillName,
          selectedSource: warning.selectedSource,
          shadowedSource: warning.shadowedSource,
        }),
      ),
    ),
    commands: Object.freeze({
      records: commands.records,
      diagnostics: Object.freeze(
        commands.diagnostics.map((diagnostic) =>
          Object.freeze({ code: diagnostic.code, source: diagnostic.source.kind }),
        ),
      ),
    }),
  });
}

function isMissingPath(error: unknown): boolean {
  return hasErrorCode(error) && error.code === 'ENOENT';
}

function hasErrorCode(error: unknown): error is Error & { readonly code: unknown } {
  return error instanceof Error && 'code' in error;
}

async function deletePersistedConversation(
  authority: NodePiConversationAuthority,
  conversationId: string,
): Promise<void> {
  const lease = authority.acquireLease(conversationId);
  let deleted = false;
  try {
    await authority.deleteConversation(lease, conversationId);
    deleted = true;
  } finally {
    if (!deleted) authority.releaseLease(lease);
  }
}

function requireIdentity(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} identity is required.`);
}
