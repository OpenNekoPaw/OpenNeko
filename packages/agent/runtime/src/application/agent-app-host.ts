import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { ILogger } from '@neko/shared/logger';

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
  type PiToolResultAssetLoader,
  type PiToolRunIdentity,
  type SkillSourceRoot,
  type SkillSourceKind,
} from '@neko/agent-runtime/pi';
import {
  createConversationProjectionStore,
  type ConversationProjectionListener,
  type ConversationProjectionStore,
} from '@neko/agent-runtime/conversation-projection';
import { createToolRegistry } from '@neko/agent-runtime/tool-registry';
import {
  buildEnhancedAgentMessage,
  createHostAgentContentAccessRuntime,
} from '@neko/agent-runtime/runtime';
import { createContentReadCapabilityProvider } from '@neko/agent-runtime';
import {
  createNodeDocumentAccessService,
  createNodeDocumentLowLevelAccess,
} from '@neko/content/document/node';
import {
  TOOL_NAMES_QUALITY,
  type AgentContextPayload,
  type IToolRegistry,
} from '@neko/agent-contracts';
import { createNodeHostContentReadService } from '@neko/content/node';
import type { EffectiveAgentConfigurationProjection } from '@neko/agent-contracts';
import type {
  AgentHomeActivitySummary,
  AgentHomeAttentionStatus,
  AgentHomeConversationSummary,
  AgentHomeDiagnostic,
  AgentHomeProjection,
  AgentConversationOwnerRef,
  AgentMessageQueueSnapshot,
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
  buildAgentPluginRuntime,
  createPluginRuntimeSourceFingerprint,
  type AgentPluginRuntime,
} from '@neko/agent-runtime/extensions';
import {
  createAgentProviderTurnScheduler,
  type AgentProviderTurnScheduler,
} from './agent-provider-turn-scheduler';
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
  readonly turnId?: string;
  readonly modelPolicy: AgentModelPolicy;
  readonly configuration: AgentTurnConfigurationSnapshot;
  readonly permissionPolicy:
    PiToolPermissionPolicy | ((events: PiProductEventSink) => PiToolPermissionPolicy);
  readonly workspaceTrusted: boolean;
  readonly locale: 'en' | 'zh';
  readonly contextPayloads?: readonly AgentContextPayload[];
  readonly systemPrompt?: string;
  readonly skillName?: string;
  readonly additionalInstructions?: string;
  readonly events?: PiProductEventSink;
}

export interface AgentTurnResult {
  readonly identity: PiToolRunIdentity;
  readonly durability: NonNullable<ReturnType<NodePiConversationAuthority['getTurnDurability']>>;
  readonly projection: ReturnType<ConversationProjectionStore['snapshot']>;
  readonly configuration: AgentTurnConfigurationSnapshot;
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
  createConversation(conversationId: string): Promise<void>;
  ensureConversation(conversationId: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  clearAllConversations(): Promise<void>;
  openConversation(input: AgentConversationOpenInput): Promise<void>;
  checkpointFailedInitialTurn(input: {
    readonly conversationId: string;
    readonly turnId: string;
    readonly messageText: string;
  }): Promise<void>;
  startTurn(input: AgentTurnInput): AgentTurnOperation;
  executeTurn(input: AgentTurnInput): Promise<AgentTurnResult>;
  readMessageQueue(conversationId: string): AgentMessageQueueSnapshot;
  promoteQueuedMessage(conversationId: string, queueItemId: string): AgentMessageQueueSnapshot;
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
}

export interface AgentAppHost {
  readonly credentialRuntime: AgentCredentialRuntime;
  attachWorkspace(workspace: AssetWorkspaceResolution): Promise<AgentWorkspaceRuntime>;
  getWorkspace(workspaceId: string): AgentWorkspaceRuntime | undefined;
  deleteConversation(conversationId: string): Promise<void>;
  findConversation(conversationId: string): PiConversationCatalogRecord | undefined;
  readGlobalSkillCatalog(): Promise<AgentSkillCatalog>;
  hasActiveTurns(): boolean;
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
  readonly assetLoader?: PiToolResultAssetLoader;
  readonly createIdentity?: () => string;
  readonly createWorkspaceLogger?: (workspace: AssetWorkspaceResolution) => ILogger;
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
    const snapshot = await createNodePiSkillHost({
      cwd: this.options.userHome,
      policy: {
        isTrusted: () => true,
        isEnabled: () => true,
      },
    }).discover([...roots, ...(this.pluginRuntime?.skillRoots ?? [])]);
    return projectAgentSkillCatalog(snapshot);
  }

  hasActiveTurns(): boolean {
    this.requireActive();
    return [...this.workspaces.values()].some((workspace) => workspace.hasActiveTurns());
  }

  async reconcilePluginRuntime(
    snapshot: AgentExtensionCatalogSnapshot,
  ): Promise<ReadonlyMap<string, AgentExtensionRuntimeReadiness>> {
    this.requireActive();
    const sourceFingerprint = createPluginRuntimeSourceFingerprint(snapshot);
    if (this.pluginRuntime?.sourceFingerprint === sourceFingerprint) {
      return this.pluginRuntime.readiness;
    }
    if (this.pluginRuntimeChanging) {
      throw new Error('Agent plugin runtime is already changing.');
    }
    this.pluginRuntimeChanging = true;
    try {
      if (this.hasActiveTurns()) {
        throw new Error('Agent plugin runtime cannot change while an Agent turn is active.');
      }
      const next = await buildAgentPluginRuntime(snapshot);
      if (this.hasActiveTurns()) {
        await next.dispose();
        throw new Error('Agent plugin runtime cannot change while an Agent turn is active.');
      }
      try {
        for (const workspace of this.workspaces.values()) {
          workspace.assertPluginRuntimeCompatible(next);
        }
        for (const workspace of this.workspaces.values()) {
          workspace.applyPluginRuntime(next);
        }
      } catch (error) {
        await next.dispose();
        throw error;
      }
      const previous = this.pluginRuntime;
      this.pluginRuntime = next;
      await previous?.dispose();
      return next.readiness;
    } finally {
      this.pluginRuntimeChanging = false;
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
    if (this.disposed) {
      await authority.dispose();
      throw new Error('Agent AppHost composition was disposed during workspace attach.');
    }
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
      ...(this.options.assetLoader === undefined ? {} : { assetLoader: this.options.assetLoader }),
      createIdentity: this.options.createIdentity ?? randomUUID,
      credentialRuntime: this.options.credentialRuntime,
      onHomeProjectionChanged: this.emitHomeProjectionChanged,
      canStartTurn: () => !this.pluginRuntimeChanging,
      onReleaseEligible: (candidate) => this.releaseWorkspaceIfEligible(candidate),
      providerTurnAdmission: this.providerTurns,
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

interface DefaultAgentWorkspaceRuntimeOptions {
  readonly workspace: AssetWorkspaceResolution;
  readonly authority: NodePiConversationAuthority;
  readonly logger?: ILogger;
  readonly userHome: string;
  readonly builtinSkillRoot?: string;
  readonly assetLoader?: PiToolResultAssetLoader;
  readonly createIdentity: () => string;
  readonly credentialRuntime: AgentCredentialRuntime;
  readonly onHomeProjectionChanged: () => void;
  readonly canStartTurn: () => boolean;
  readonly onReleaseEligible: (workspace: DefaultAgentWorkspaceRuntime) => Promise<void>;
  readonly providerTurnAdmission: AgentProviderTurnScheduler;
}

interface PendingAgentTurnOperation {
  readonly queueItemId: string;
  readonly input: AgentTurnInput;
  readonly identity: PiToolRunIdentity;
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
  private readonly conversations = new Map<string, AgentConversationOwner>();
  private readonly projections = new Map<string, ConversationProjectionStore>();
  private readonly opening = new Map<string, Promise<AgentConversationOwner>>();
  private readonly materializing = new Map<string, Promise<void>>();
  private readonly activeTurnOperations = new Set<Promise<AgentTurnResult>>();
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
  private residencyTail: Promise<void> = Promise.resolve();
  private visibilityLifecycleAttached = false;
  private releaseRequested = false;
  private disposed = false;

  constructor(private readonly options: DefaultAgentWorkspaceRuntimeOptions) {
    this.models = createOpenNekoPiModels(options.credentialRuntime.credentials);
    for (const tool of createAgentContentReadTools(options.workspace)) {
      this.tools.register(tool);
    }
  }

  get workspaceId(): string {
    return this.options.workspace.workspaceId;
  }

  get workspace(): AssetWorkspaceResolution {
    return this.options.workspace;
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

  async createConversation(conversationId: string): Promise<void> {
    this.requireActive();
    requireIdentity(conversationId, 'Conversation');
    const lease = this.options.authority.acquireLease(conversationId);
    try {
      await this.options.authority.createConversation({
        lease,
        conversationId,
        branchId: 'main',
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

  async ensureConversation(conversationId: string): Promise<void> {
    this.requireActive();
    requireIdentity(conversationId, 'Conversation');
    if (this.options.authority.readConversation(conversationId)) {
      this.requireProjection(conversationId);
      return;
    }
    const pending = this.materializing.get(conversationId);
    if (pending) return pending;
    const operation = this.createConversation(conversationId);
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
      content: input.prompt,
      source: 'composer',
    });
    const pending: PendingAgentTurnOperation = {
      queueItemId: queueItem.id,
      input,
      identity,
      completion,
      resolve: settlement.resolve,
      reject: settlement.reject,
    };
    queue.operations.set(queueItem.id, pending);
    this.activeTurnOperations.add(completion);
    this.startNextConversationTurn(input.conversationId);
    return Object.freeze({ identity, completion });
  }

  executeTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
    return this.startTurn(input).completion;
  }

  hasActiveTurns(): boolean {
    return this.activeTurnOperations.size > 0;
  }

  readMessageQueue(conversationId: string): AgentMessageQueueSnapshot {
    this.assertConversationExists(conversationId);
    return (
      this.pendingConversationTurns.get(conversationId)?.messages.snapshot() ??
      emptyMessageQueueSnapshot(conversationId)
    );
  }

  promoteQueuedMessage(conversationId: string, queueItemId: string): AgentMessageQueueSnapshot {
    this.assertConversationExists(conversationId);
    const queue = this.requirePendingConversationTurns(conversationId);
    queue.messages.promote(queueItemId);
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
    if (this.hasActiveTurns()) {
      throw new Error(
        `Agent workspace '${this.workspaceId}' cannot replace plugin Tools during an active turn.`,
      );
    }
    for (const tool of pluginRuntime.tools) {
      if (this.tools.has(tool.name) && !this.pluginToolNames.has(tool.name)) {
        throw new Error(`Plugin Tool '${tool.name}' conflicts with a registered Tool.`);
      }
    }
  }

  applyPluginRuntime(pluginRuntime: AgentPluginRuntime): void {
    this.assertPluginRuntimeCompatible(pluginRuntime);
    for (const name of this.pluginToolNames) this.tools.unregister(name);
    this.pluginToolNames.clear();
    for (const tool of pluginRuntime.tools) {
      this.tools.register(tool);
      this.pluginToolNames.add(tool.name);
    }
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
    let outcome:
      | { readonly ok: true; readonly result: AgentTurnResult }
      | { readonly ok: false; readonly error: unknown };
    try {
      outcome = {
        ok: true,
        result: await this.executeTurnOwned(pending.input, pending.identity),
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
  ): Promise<AgentTurnResult> {
    this.requireActive();
    const owner = this.requireConversation(input.conversationId);
    const messageId = this.options.createIdentity();
    const skills = await this.discoverSkills(input.workspaceTrusted);
    const capabilityTools = projectOpenNekoTools(this.tools.list(), {
      locale: input.locale,
      purposesForTool: resolveOpenNekoToolModelPurposes,
      purposeForToolCall: resolveOpenNekoToolCallModelPurpose,
      isPurposeOptionalForTool: (tool) => tool.name === TOOL_NAMES_QUALITY.QUALITY_CHECK,
      ...(this.options.assetLoader === undefined ? {} : { assetLoader: this.options.assetLoader }),
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
    const operation = owner.execute({
      identity,
      prompt: buildEnhancedAgentMessage({
        message: input.prompt,
        contextPayloads: input.contextPayloads,
        locale: input.locale,
      }),
      modelPolicy: input.modelPolicy,
      skillSnapshot: skills,
      capabilityTools,
      permissionPolicy,
      workspaceTrusted: input.workspaceTrusted,
      events,
      ...(input.systemPrompt === undefined ? {} : { systemPrompt: input.systemPrompt }),
      ...(input.skillName === undefined ? {} : { skillName: input.skillName }),
      ...(input.additionalInstructions === undefined
        ? {}
        : { additionalInstructions: input.additionalInstructions }),
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
    return Object.freeze({
      identity,
      durability,
      projection: owner.projection.snapshot(),
      configuration: input.configuration,
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
    return projectAgentSkillCatalog(await this.discoverSkills(workspaceTrusted));
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
    const operationResults = await Promise.allSettled(this.activeTurnOperations);
    for (const projection of this.projections.values()) projection.dispose();
    this.conversations.clear();
    this.projections.clear();
    this.opening.clear();
    this.activeTurnOperations.clear();
    this.pendingConversationTurns.clear();
    this.activeConversationTurns.clear();
    this.visibleBindings.clear();
    this.runtimeProtections.clear();
    this.tools.clear();
    this.models.clearProviders();
    this.pluginSkillRoots = [];
    this.pluginToolNames.clear();
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

  private async discoverSkills(workspaceTrusted: boolean) {
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
    }).discover([...roots, ...this.pluginSkillRoots]);
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

function createAgentContentReadTools(workspace: AssetWorkspaceResolution) {
  const documentLowLevelAccess = createNodeDocumentLowLevelAccess();
  const contentAccessRuntime = createHostAgentContentAccessRuntime({
    contentRead: createNodeHostContentReadService({
      workspaceRoot: workspace.workspacePath,
      documentEntryReader: {
        readEntry: (sourcePath, entryPath) =>
          documentLowLevelAccess.readEntry(sourcePath, entryPath),
      },
    }),
    documentAccess: createNodeDocumentAccessService(),
    resolveDocumentHostFilePath: (source) => resolveWorkspaceContentLocator(workspace, source),
  });
  return createContentReadCapabilityProvider({ contentAccessRuntime }).getTools({
    hostContext: null,
  });
}

interface ExecuteAgentConversationInput {
  readonly identity: PiToolRunIdentity;
  readonly prompt: string;
  readonly modelPolicy: AgentModelPolicy;
  readonly skillSnapshot: Awaited<ReturnType<ReturnType<typeof createNodePiSkillHost>['discover']>>;
  readonly capabilityTools: ReturnType<typeof projectOpenNekoTools>;
  readonly permissionPolicy: PiToolPermissionPolicy;
  readonly workspaceTrusted: boolean;
  readonly events: PiProductEventSink;
  readonly systemPrompt?: string;
  readonly skillName?: string;
  readonly additionalInstructions?: string;
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
      input.skillName === undefined
        ? this.runtime.execute({
            turnId: input.identity.turnId,
            runId: input.identity.runId,
            prompt: input.prompt,
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
            skillName: input.skillName,
            ...(input.additionalInstructions === undefined
              ? {}
              : { additionalInstructions: input.additionalInstructions }),
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

function emptyMessageQueueSnapshot(conversationId: string): AgentMessageQueueSnapshot {
  return Object.freeze({
    conversationId,
    items: Object.freeze([]),
    pendingCount: 0,
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
  const candidates: readonly SkillSourceRoot[] = [
    {
      path: join(input.workspacePath, '.agents', 'skills'),
      source: { kind: 'project' },
    },
    {
      path: join(input.userHome, '.agents', 'skills'),
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
      path: join(input.userHome, '.agents', 'skills'),
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

function projectAgentSkillCatalog(snapshot: PiSkillHostSnapshot): AgentSkillCatalog {
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
