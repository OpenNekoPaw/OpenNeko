import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

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
  AgentHomeProjection,
} from '@neko/agent-contracts';
import type { AgentCredentialRuntime } from '../pi/credential-runtime';
import { resolveWorkspaceContentLocator } from '@neko/assets-node';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type {
  AgentExtensionCatalogSnapshot,
  AgentExtensionRuntimeReadiness,
} from '@neko/agent-contracts';
import {
  buildAgentPluginRuntimeGeneration,
  type AgentPluginRuntimeGeneration,
} from '@neko/agent-runtime/extensions';

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

export interface AgentConversationEvidence {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly branchId: string;
  readonly piSessionId: string;
  readonly writerEpoch: number;
}

export interface AgentWorkspaceRuntime {
  readonly workspaceId: string;
  readonly workspace: AssetWorkspaceResolution;
  readonly models: ReturnType<typeof createOpenNekoPiModels>;
  readonly tools: IToolRegistry;
  createConversation(conversationId: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  clearAllConversations(): Promise<void>;
  openConversation(input: AgentConversationOpenInput): Promise<void>;
  startTurn(input: AgentTurnInput): AgentTurnOperation;
  executeTurn(input: AgentTurnInput): Promise<AgentTurnResult>;
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
  setHomeWorkspaceScope(workspaceIds: readonly string[]): void;
  attachWorkspace(workspace: AssetWorkspaceResolution): Promise<AgentWorkspaceRuntime>;
  getWorkspace(workspaceId: string): AgentWorkspaceRuntime | undefined;
  findConversation(conversationId: string): PiConversationCatalogRecord | undefined;
  readGlobalSkillCatalog(): Promise<AgentSkillCatalog>;
  hasActiveTurns(): boolean;
  reconcilePluginRuntime(
    snapshot: AgentExtensionCatalogSnapshot,
  ): Promise<ReadonlyMap<string, AgentExtensionRuntimeReadiness>>;
  readHomeProjection(): AgentHomeProjection;
  subscribeHomeProjection(listener: () => void): () => void;
  dispose(): Promise<void>;
}

export interface CreateAgentAppHostOptions {
  readonly userDataRoot: string;
  readonly userHome: string;
  readonly hostId: string;
  readonly credentialRuntime: AgentCredentialRuntime;
  readonly catalogReader: PiConversationCatalogReader;
  readonly builtinSkillRoot?: string;
  readonly assetLoader?: PiToolResultAssetLoader;
  readonly createIdentity?: () => string;
}

export function createAgentAppHost(options: CreateAgentAppHostOptions): AgentAppHost {
  return new DefaultAgentAppHost(options);
}

class DefaultAgentAppHost implements AgentAppHost {
  private readonly workspaces = new Map<string, DefaultAgentWorkspaceRuntime>();
  private readonly opening = new Map<string, Promise<DefaultAgentWorkspaceRuntime>>();
  private readonly homeProjectionListeners = new Set<() => void>();
  private homeWorkspaceScope: readonly string[] = [];
  private homeProjectionRevision = 0;
  private pluginGeneration: AgentPluginRuntimeGeneration | undefined;
  private pluginRuntimeChanging = false;
  private disposed = false;

  constructor(private readonly options: CreateAgentAppHostOptions) {
    requireIdentity(options.hostId, 'Agent Host');
  }

  get credentialRuntime(): AgentCredentialRuntime {
    return this.options.credentialRuntime;
  }

  setHomeWorkspaceScope(workspaceIds: readonly string[]): void {
    this.requireActive();
    const next = [
      ...new Set(
        workspaceIds.map((workspaceId) => {
          requireIdentity(workspaceId, 'Workspace');
          return workspaceId;
        }),
      ),
    ].sort();
    if (
      next.length === this.homeWorkspaceScope.length &&
      next.every((workspaceId, index) => workspaceId === this.homeWorkspaceScope[index])
    ) {
      return;
    }
    this.homeWorkspaceScope = Object.freeze(next);
    this.emitHomeProjectionChanged();
  }

  async attachWorkspace(workspace: AssetWorkspaceResolution): Promise<AgentWorkspaceRuntime> {
    this.requireActive();
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
    }).discover([...roots, ...(this.pluginGeneration?.skillRoots ?? [])]);
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
    if (this.pluginGeneration?.revision === snapshot.revision) {
      return this.pluginGeneration.readiness;
    }
    if (this.pluginRuntimeChanging) {
      throw new Error('Agent plugin runtime generation is already changing.');
    }
    this.pluginRuntimeChanging = true;
    try {
      if (this.hasActiveTurns()) {
        throw new Error('Agent plugin runtime cannot change while an Agent turn is active.');
      }
      const next = await buildAgentPluginRuntimeGeneration(snapshot);
      if (this.hasActiveTurns()) {
        await next.dispose();
        throw new Error('Agent plugin runtime cannot change while an Agent turn is active.');
      }
      try {
        for (const workspace of this.workspaces.values()) {
          workspace.assertPluginGenerationCompatible(next);
        }
        for (const workspace of this.workspaces.values()) {
          workspace.applyPluginGeneration(next);
        }
      } catch (error) {
        await next.dispose();
        throw error;
      }
      const previous = this.pluginGeneration;
      this.pluginGeneration = next;
      await previous?.dispose();
      return next.readiness;
    } finally {
      this.pluginRuntimeChanging = false;
    }
  }

  readHomeProjection(): AgentHomeProjection {
    this.requireActive();
    const conversations = this.options.catalogReader
      .listConversations(this.homeWorkspaceScope)
      .map((record) => {
        const workspace = this.workspaces.get(record.workspaceId);
        return workspace
          ? workspace.projectHomeConversation(record)
          : projectAgentHomeConversationSummary(record, undefined, undefined);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const attention = {
      needsInput: countAttention(conversations, 'needs-input'),
      needsReview: countAttention(conversations, 'needs-review'),
      running: countAttention(conversations, 'running'),
    };
    return freezeClone({
      revision: this.homeProjectionRevision,
      conversations,
      attention,
    });
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
    const openedDuringDisposal = pending.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const workspaces = new Set([...this.workspaces.values(), ...openedDuringDisposal]);
    const results = await Promise.allSettled(
      [...workspaces].map((workspace) => workspace.dispose()),
    );
    this.workspaces.clear();
    this.opening.clear();
    this.homeProjectionListeners.clear();
    const pluginResult = await Promise.allSettled([
      this.pluginGeneration?.dispose() ?? Promise.resolve(),
    ]);
    this.pluginGeneration = undefined;
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
    const errors = [
      ...pending.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ...results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ...pluginResult.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ...(catalogError === undefined ? [] : [catalogError]),
      ...(credentialError === undefined ? [] : [credentialError]),
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
      userHome: this.options.userHome,
      ...(this.options.builtinSkillRoot === undefined
        ? {}
        : { builtinSkillRoot: this.options.builtinSkillRoot }),
      ...(this.options.assetLoader === undefined ? {} : { assetLoader: this.options.assetLoader }),
      createIdentity: this.options.createIdentity ?? randomUUID,
      credentialRuntime: this.options.credentialRuntime,
      onHomeProjectionChanged: this.emitHomeProjectionChanged,
      canStartTurn: () => !this.pluginRuntimeChanging,
    });
    if (this.pluginGeneration) runtime.applyPluginGeneration(this.pluginGeneration);
    this.workspaces.set(workspace.workspaceId, runtime);
    this.emitHomeProjectionChanged();
    return runtime;
  }

  private readonly emitHomeProjectionChanged = (): void => {
    if (this.disposed) return;
    this.homeProjectionRevision += 1;
    for (const listener of this.homeProjectionListeners) listener();
  };

  private requireActive(): void {
    if (this.disposed) throw new Error('Agent AppHost composition is disposed.');
  }
}

interface DefaultAgentWorkspaceRuntimeOptions {
  readonly workspace: AssetWorkspaceResolution;
  readonly authority: NodePiConversationAuthority;
  readonly userHome: string;
  readonly builtinSkillRoot?: string;
  readonly assetLoader?: PiToolResultAssetLoader;
  readonly createIdentity: () => string;
  readonly credentialRuntime: AgentCredentialRuntime;
  readonly onHomeProjectionChanged: () => void;
  readonly canStartTurn: () => boolean;
}

class DefaultAgentWorkspaceRuntime implements AgentWorkspaceRuntime {
  readonly tools = createToolRegistry();
  readonly models: ReturnType<typeof createOpenNekoPiModels>;
  private readonly conversations = new Map<string, AgentConversationOwner>();
  private readonly projections = new Map<string, ConversationProjectionStore>();
  private readonly opening = new Map<string, Promise<AgentConversationOwner>>();
  private readonly activeTurnOperations = new Set<Promise<AgentTurnResult>>();
  private pluginSkillRoots: readonly SkillSourceRoot[] = [];
  private readonly pluginToolNames = new Set<string>();
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
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this.requireActive();
    requireIdentity(conversationId, 'Conversation');
    const owner = this.conversations.get(conversationId);
    if (owner) {
      await owner.stop();
      this.conversations.delete(conversationId);
    }
    const lease = this.options.authority.acquireLease(conversationId);
    let deleted = false;
    try {
      await this.options.authority.deleteConversation(lease, conversationId);
      deleted = true;
    } finally {
      if (!deleted) this.options.authority.releaseLease(lease);
    }
    this.projections.get(conversationId)?.dispose();
    this.projections.delete(conversationId);
    this.options.onHomeProjectionChanged();
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
    const operation = this.executeTurnOwned(input, identity);
    this.activeTurnOperations.add(operation);
    void operation.then(
      () => this.activeTurnOperations.delete(operation),
      () => this.activeTurnOperations.delete(operation),
    );
    return Object.freeze({ identity, completion: operation });
  }

  executeTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
    return this.startTurn(input).completion;
  }

  hasActiveTurns(): boolean {
    return this.activeTurnOperations.size > 0;
  }

  assertPluginGenerationCompatible(generation: AgentPluginRuntimeGeneration): void {
    this.requireActive();
    if (this.hasActiveTurns()) {
      throw new Error(
        `Agent workspace '${this.workspaceId}' cannot replace plugin Tools during an active turn.`,
      );
    }
    for (const tool of generation.tools) {
      if (this.tools.has(tool.name) && !this.pluginToolNames.has(tool.name)) {
        throw new Error(`Plugin Tool '${tool.name}' conflicts with a registered Tool.`);
      }
    }
  }

  applyPluginGeneration(generation: AgentPluginRuntimeGeneration): void {
    this.assertPluginGenerationCompatible(generation);
    for (const name of this.pluginToolNames) this.tools.unregister(name);
    this.pluginToolNames.clear();
    for (const tool of generation.tools) {
      this.tools.register(tool);
      this.pluginToolNames.add(tool.name);
    }
    this.pluginSkillRoots = generation.skillRoots;
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
      writerEpoch: owner.writerEpoch,
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

  projectHomeConversation(record: PiConversationCatalogRecord): AgentHomeConversationSummary {
    this.requireActive();
    if (record.workspaceId !== this.workspaceId) {
      throw new Error(
        `Agent catalog conversation '${record.conversationId}' belongs to Workspace '${record.workspaceId}', not '${this.workspaceId}'.`,
      );
    }
    const owner = this.conversations.get(record.conversationId);
    return projectAgentHomeConversationSummary(
      record,
      owner?.projection.snapshot(),
      owner?.readActiveIdentity(),
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
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
      throw new AggregateError(errors, `Failed to dispose Agent workspace '${this.workspaceId}'.`);
    }
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
        lease.epoch,
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
    readonly writerEpoch: number,
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

export function projectAgentHomeConversationSummary(
  record: PiConversationCatalogRecord,
  projection: ReturnType<ConversationProjectionStore['snapshot']> | undefined,
  active: Pick<PiToolRunIdentity, 'turnId' | 'runId'> | undefined,
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
      projectId: `content:${record.workspaceId}`,
      workspaceId: record.workspaceId,
      conversationId: record.conversationId,
    },
    title: record.title,
    updatedAt: record.updatedAt,
    attention,
    lastActivity,
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
  const revision =
    readNonNegativeInteger(candidate, 'revision') ??
    readNonNegativeInteger(candidate, 'jobRevision');
  const phase =
    readString(candidate, 'phase') ??
    (readString(candidate, 'status') === 'completed'
      ? 'succeeded'
      : readString(candidate, 'status'));
  if (!jobId || revision === undefined || !phase) return undefined;
  return { jobId, revision, phase };
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

function readNonNegativeInteger(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
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

function freezeClone<T>(value: T): T {
  return freezeValue(structuredClone(value));
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

function requireIdentity(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} identity is required.`);
}
