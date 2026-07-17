import { createHash, randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { TOOL_NAMES_QUALITY, type Tool } from '@neko/shared';
import {
  NodePiConversationAuthority,
  PiConversationRuntime,
  createNodePiSkillHost,
  createOpenNekoPiModels,
  projectOpenNekoTools,
  registerOpenNekoPiProvider,
  resolveOpenNekoToolModelPurpose,
  resolveAgentModelPolicy,
  type AgentModelBindingMap,
  type AgentModelCatalogEntry,
  type AgentModelPolicy,
  type AgentModelParameters,
  type OpenNekoCredentialStore,
  type OpenNekoPiModelConfig,
  type OpenNekoPiProtocolProfile,
  type PiProductEventSink,
  type PiConversationCatalogRecord,
  type PiConversationCompactionResult,
  type PiSkillHostSnapshot,
  type PiToolPermissionPolicy,
  type PiToolRunIdentity,
  type SkillHostRecord,
  type SkillSourceRoot,
} from '@neko/agent/pi';

import type { CLIConfig, TuiPurposeModelConfig, TuiToolModelPurpose } from './types';

export interface TuiPiRuntimeOwnerOptions {
  readonly userHome: string;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly hostId: string;
  readonly credentials: OpenNekoCredentialStore;
  readonly getConfig: () => CLIConfig;
  readonly getTools: () => readonly Tool[];
  readonly getSystemPrompt: () => string;
  readonly permissionPolicy: PiToolPermissionPolicy;
  readonly workspaceTrusted: boolean;
  readonly locale: 'en' | 'zh';
  readonly builtinSkillRoot?: string;
  readonly requireExistingConversation?: boolean;
}

export interface ExecuteTuiPiTurnInput {
  readonly prompt: string;
  readonly events: PiProductEventSink;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ExecuteTuiPiSkillInput {
  readonly skillName: string;
  readonly additionalInstructions?: string;
  readonly events: PiProductEventSink;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TuiPiConversationSummary extends PiConversationCatalogRecord {
  readonly messageCount: number;
}

export interface TuiPiRuntimeTurnEvidence {
  readonly turnId: string;
  readonly runId: string;
  readonly purpose: 'agent.main';
  readonly providerId: string;
  readonly modelId: string;
  readonly parametersDigest: string;
  readonly snapshotDigest: string;
  readonly protocol: NonNullable<CLIConfig['protocolProfile']>;
  readonly authMechanism: NonNullable<CLIConfig['providerAuth']>['type'];
  readonly credentialSource: NonNullable<CLIConfig['credentialProvenance']> | 'not-required';
  readonly durability: ReturnType<NodePiConversationAuthority['getTurnDurability']>;
  readonly modelPurposes: readonly TuiPiRuntimePurposeEvidence[];
}

export interface TuiPiRuntimePurposeEvidence {
  readonly purpose: 'agent.main' | TuiToolModelPurpose;
  readonly execution: 'pi' | 'domain';
  readonly providerId: string;
  readonly configuredModelId: string;
  readonly apiModelId: string;
  readonly parametersDigest: string;
}

export interface TuiPiRuntimeEvidence {
  readonly implementation: 'pi-agent-core';
  readonly transcriptAuthority: 'pi-session';
  readonly productMetadataAuthority: 'sqlite';
  readonly conversationId: string;
  readonly branchId: string;
  readonly piSessionId: string;
  readonly writerEpoch: number;
  readonly workspaceLocator: {
    readonly kind: 'virtual';
    readonly value: string;
  };
  readonly lastTurn?: TuiPiRuntimeTurnEvidence;
}

export class TuiPiRuntimeOwner {
  private authority: NodePiConversationAuthority | undefined;
  private runtime: PiConversationRuntime | undefined;
  private branchId = 'main';
  private activeIdentity: Pick<PiToolRunIdentity, 'turnId' | 'runId'> | undefined;
  private activeOperation: Promise<void> | undefined;
  private skillSnapshot: PiSkillHostSnapshot | undefined;
  private disposeOperation: Promise<void> | undefined;
  private disposed = false;
  private titleInitialized = false;
  private restored = false;
  private runtimeEvidence: TuiPiRuntimeEvidence | undefined;
  private readonly models;
  private readonly skillHost;

  constructor(private readonly options: TuiPiRuntimeOwnerOptions) {
    this.models = createOpenNekoPiModels(options.credentials);
    this.skillHost = createNodePiSkillHost({
      cwd: options.getConfig().workDir,
      policy: {
        isTrusted: ({ source }) => source.kind !== 'project' || options.workspaceTrusted,
        isEnabled: () => true,
      },
    });
  }

  get isRunning(): boolean {
    return this.runtime?.isBusy ?? false;
  }

  get messages(): readonly unknown[] {
    return this.runtime?.messages ?? [];
  }

  get skills(): readonly SkillHostRecord[] {
    return this.skillSnapshot?.records ?? [];
  }

  get wasRestored(): boolean {
    return this.restored;
  }

  getRuntimeEvidence(): TuiPiRuntimeEvidence | null {
    return this.runtimeEvidence === undefined ? null : structuredClone(this.runtimeEvidence);
  }

  async listConversations(): Promise<readonly TuiPiConversationSummary[]> {
    this.assertNotDisposed();
    const authority = this.authority;
    if (!authority) throw new Error('TUI Pi conversation catalog is not initialized.');
    return Promise.all(
      authority.listConversations().map(async (record) => ({
        ...record,
        messageCount: (await authority.buildContext(record.conversationId, record.activeBranchId))
          .messages.length,
      })),
    );
  }

  async initialize(): Promise<void> {
    this.assertNotDisposed();
    if (this.runtime !== undefined || this.authority !== undefined) {
      throw new Error('TUI Pi runtime owner is already initialized.');
    }
    const config = this.options.getConfig();
    const policy = await this.resolvePolicy(config);
    const authority = await NodePiConversationAuthority.create({
      userDataRoot: join(this.options.userHome, '.neko'),
      workspaceId: this.options.workspaceId,
      hostId: this.options.hostId,
    });
    const lease = authority.acquireLease(this.options.conversationId);
    let runtime: PiConversationRuntime | undefined;
    try {
      const existing = authority.readConversation(this.options.conversationId);
      if (existing === undefined) {
        if (this.options.requireExistingConversation === true) {
          throw new Error(`Pi conversation ${this.options.conversationId} was not found.`);
        }
        await authority.createConversation({
          lease,
          conversationId: this.options.conversationId,
          branchId: this.branchId,
        });
      } else {
        this.restored = true;
        this.branchId = existing.activeBranchId;
        this.titleInitialized = existing.title !== 'New conversation';
      }
      const skillSnapshot = await this.discoverSkills(config);
      runtime = await PiConversationRuntime.open({
        authority,
        lease,
        conversationId: this.options.conversationId,
        branchId: this.branchId,
        models: this.models,
        initialModelPolicy: policy,
        baseSystemPrompt: this.options.getSystemPrompt(),
      });
      const branch = authority.readBranch(this.options.conversationId, this.branchId);
      if (branch === undefined) {
        throw new Error(
          `Pi branch ${this.options.conversationId}/${this.branchId} disappeared during initialization.`,
        );
      }
      this.authority = authority;
      this.runtime = runtime;
      this.skillSnapshot = skillSnapshot;
      this.runtimeEvidence = Object.freeze({
        implementation: 'pi-agent-core',
        transcriptAuthority: 'pi-session',
        productMetadataAuthority: 'sqlite',
        conversationId: this.options.conversationId,
        branchId: this.branchId,
        piSessionId: branch.session.id,
        writerEpoch: lease.epoch,
        workspaceLocator: Object.freeze({
          kind: 'virtual',
          value: authority.virtualWorkspaceCwd(),
        }),
      });
    } catch (error) {
      this.restored = false;
      this.branchId = 'main';
      this.titleInitialized = false;
      try {
        if (runtime) runtime.dispose();
        else authority.releaseLease(lease);
        await authority.dispose();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Failed to initialize and clean up Pi conversation ${this.options.conversationId}.`,
        );
      }
      throw error;
    }
  }

  async execute(input: ExecuteTuiPiTurnInput): Promise<void> {
    const runtime = this.requireRuntime();
    const snapshot = await this.createTurnSnapshot(input.metadata);
    const identity = createTurnIdentity();
    this.recordTurnEvidence(identity, snapshot.modelPolicy, snapshot.skills, snapshot.tools);
    if (!this.titleInitialized) {
      runtime.updateConversationTitle(conversationTitle(input.prompt));
      this.titleInitialized = true;
    }
    this.activeIdentity = identity;
    const operation = runtime.execute({
      ...identity,
      prompt: input.prompt,
      modelPolicy: snapshot.modelPolicy,
      skillSnapshot: snapshot.skills,
      capabilityTools: snapshot.tools,
      permissionPolicy: this.options.permissionPolicy,
      workspaceTrusted: this.options.workspaceTrusted,
      events: input.events,
      systemPrompt: this.options.getSystemPrompt(),
    });
    this.activeOperation = operation;
    try {
      await operation;
    } finally {
      this.refreshTurnDurability(identity.turnId);
      this.activeIdentity = undefined;
      if (this.activeOperation === operation) this.activeOperation = undefined;
    }
  }

  async executeSkill(input: ExecuteTuiPiSkillInput): Promise<void> {
    const runtime = this.requireRuntime();
    const snapshot = await this.createTurnSnapshot(input.metadata);
    const identity = createTurnIdentity();
    this.recordTurnEvidence(identity, snapshot.modelPolicy, snapshot.skills, snapshot.tools);
    this.activeIdentity = identity;
    const operation = runtime.executeSkill({
      ...identity,
      skillName: input.skillName,
      ...(input.additionalInstructions === undefined
        ? {}
        : { additionalInstructions: input.additionalInstructions }),
      modelPolicy: snapshot.modelPolicy,
      skillSnapshot: snapshot.skills,
      capabilityTools: snapshot.tools,
      permissionPolicy: this.options.permissionPolicy,
      workspaceTrusted: this.options.workspaceTrusted,
      events: input.events,
      systemPrompt: this.options.getSystemPrompt(),
    });
    this.activeOperation = operation;
    try {
      await operation;
    } finally {
      this.refreshTurnDurability(identity.turnId);
      this.activeIdentity = undefined;
      if (this.activeOperation === operation) this.activeOperation = undefined;
    }
  }

  cancel(): void {
    const identity = this.activeIdentity;
    if (identity === undefined) return;
    this.requireRuntime().cancel(identity);
  }

  async clearContext(): Promise<void> {
    await this.requireRuntime().clearContext();
  }

  getContextTokenCount(): number {
    return this.requireRuntime().contextTokenCount;
  }

  async compactContext(): Promise<PiConversationCompactionResult> {
    const config = this.options.getConfig();
    const contextWindow = config.chatModel?.contextWindow;
    if (!contextWindow) {
      throw new Error('TUI Pi compaction requires the selected model context window.');
    }
    const reserveTokens =
      config.contextSettings?.reservedTokens ?? Math.min(16_384, Math.floor(contextWindow / 5));
    const keepRecentTokens = Math.min(20_000, Math.max(1, contextWindow - reserveTokens));
    return this.requireRuntime().compactContext({ reserveTokens, keepRecentTokens });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    if (this.disposeOperation === undefined) {
      this.disposeOperation = this.disposeOwnedRuntime();
    }
    await this.disposeOperation;
  }

  private async createTurnSnapshot(
    metadata: Readonly<Record<string, unknown>> | undefined,
  ): Promise<{
    readonly modelPolicy: AgentModelPolicy;
    readonly skills: PiSkillHostSnapshot;
    readonly tools: ReturnType<typeof projectOpenNekoTools>;
  }> {
    const config = this.options.getConfig();
    const modelPolicy = await this.resolvePolicy(config);
    const skills = await this.discoverSkills(config);
    this.skillSnapshot = skills;
    return Object.freeze({
      modelPolicy,
      skills,
      tools: projectOpenNekoTools(this.options.getTools(), {
        locale: this.options.locale,
        purposeForTool: resolveOpenNekoToolModelPurpose,
        isPurposeOptionalForTool: (tool) => tool.name === TOOL_NAMES_QUALITY.QUALITY_CHECK,
        ...(metadata === undefined ? {} : { metadata }),
      }),
    });
  }

  private async resolvePolicy(config: CLIConfig): Promise<AgentModelPolicy> {
    const activePurposes = this.options
      .getTools()
      .map((tool) => resolveOpenNekoToolModelPurpose(tool))
      .filter((purpose): purpose is TuiToolModelPurpose => purpose !== undefined);
    return resolveTuiPiModelPolicy(
      this.models,
      this.options.credentials,
      config,
      activePurposes,
    );
  }

  private async discoverSkills(config: CLIConfig): Promise<PiSkillHostSnapshot> {
    const candidates: SkillSourceRoot[] = [
      { path: join(config.workDir, '.agents', 'skills'), source: { kind: 'project' } },
      { path: join(this.options.userHome, '.agents', 'skills'), source: { kind: 'personal' } },
      ...(this.options.builtinSkillRoot
        ? [
            {
              path: this.options.builtinSkillRoot,
              source: { kind: 'builtin' as const },
            },
          ]
        : []),
    ];
    const roots: SkillSourceRoot[] = [];
    for (const candidate of candidates) {
      if (await pathExists(candidate.path)) roots.push(candidate);
    }
    return this.skillHost.discover(roots);
  }

  private recordTurnEvidence(
    identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>,
    policy: AgentModelPolicy,
    skills: PiSkillHostSnapshot,
    tools: ReturnType<typeof projectOpenNekoTools>,
  ): void {
    const existing = this.runtimeEvidence;
    if (existing === undefined) {
      throw new Error('TUI Pi runtime evidence is unavailable before initialization.');
    }
    const config = this.options.getConfig();
    const main = policy['agent.main'];
    const parametersDigest = digest(main.parameters);
    const modelPurposes = Object.entries(policy)
      .map(([rawPurpose, use]): TuiPiRuntimePurposeEvidence => {
        const purpose = rawPurpose as 'agent.main' | TuiToolModelPurpose;
        if (purpose === 'agent.main') {
          return {
            purpose,
            execution: 'pi',
            providerId: use.model.provider,
            configuredModelId: config.chatModel?.modelId ?? config.model,
            apiModelId: use.model.id,
            parametersDigest: digest(use.parameters),
          };
        }
        const configured = config.purposeModels?.[purpose];
        if (!configured) {
          throw new Error(`TUI Pi policy contains unconfigured purpose ${purpose}.`);
        }
        return {
          purpose,
          execution: TUI_DOMAIN_MODEL_PURPOSES.has(purpose) ? 'domain' : 'pi',
          providerId: use.model.provider,
          configuredModelId: configured.modelId,
          apiModelId: configured.apiModelId,
          parametersDigest: digest(use.parameters),
        };
      })
      .sort((left, right) => left.purpose.localeCompare(right.purpose));
    const snapshotDigest = digest({
      models: modelPurposes,
      skills: skills.records
        .map((skill) => ({ name: skill.name, fingerprint: skill.fingerprint }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      tools: tools.map((tool) => tool.name).sort(),
    });
    this.runtimeEvidence = Object.freeze({
      ...existing,
      lastTurn: Object.freeze({
        ...identity,
        purpose: 'agent.main',
        providerId: main.model.provider,
        modelId: config.chatModel?.modelId ?? config.model,
        parametersDigest,
        snapshotDigest,
        protocol: requireProtocol(config.protocolProfile),
        authMechanism: config.providerAuth?.type ?? 'provider-default',
        credentialSource:
          config.credentialProvenance ??
          (config.providerRequiresApiKey ? 'user-config-import' : 'not-required'),
        durability: 'volatile',
        modelPurposes: Object.freeze(modelPurposes),
      }),
    });
  }

  private refreshTurnDurability(turnId: string): void {
    const existing = this.runtimeEvidence;
    if (existing?.lastTurn?.turnId !== turnId) return;
    this.runtimeEvidence = Object.freeze({
      ...existing,
      lastTurn: Object.freeze({
        ...existing.lastTurn,
        durability:
          this.authority?.getTurnDurability(this.options.conversationId, turnId) ??
          existing.lastTurn.durability,
      }),
    });
  }

  private requireRuntime(): PiConversationRuntime {
    this.assertNotDisposed();
    if (this.runtime === undefined) {
      throw new Error('TUI Pi runtime owner is not initialized.');
    }
    return this.runtime;
  }

  private assertNotDisposed(): void {
    if (this.disposed || this.disposeOperation !== undefined) {
      throw new Error('TUI Pi runtime owner is disposed.');
    }
  }

  private async disposeOwnedRuntime(): Promise<void> {
    const runtime = this.runtime;
    const identity = this.activeIdentity;
    if (runtime?.isBusy && identity) runtime.cancel(identity);
    await this.activeOperation?.catch(() => undefined);
    this.runtime?.dispose();
    this.runtime = undefined;
    await this.authority?.dispose();
    this.authority = undefined;
    this.disposed = true;
  }
}

const TUI_DOMAIN_MODEL_PURPOSES = new Set<TuiToolModelPurpose>([
  'image.generate',
  'image.edit',
  'video.generate',
  'audio.generate',
  'audio.tts',
  'audio.music.generate',
]);

interface TuiPiExecutableSelection {
  readonly purpose: 'agent.main' | TuiToolModelPurpose;
  readonly providerId: string;
  readonly configuredModelId: string;
  readonly apiModelId: string;
  readonly capabilities: readonly string[];
  readonly baseUrl: string;
  readonly protocol: OpenNekoPiProtocolProfile;
  readonly requiresApiKey: boolean;
  readonly auth?: NonNullable<CLIConfig['providerAuth']>;
  readonly apiKey?: string;
  readonly credentialProvenance?: NonNullable<CLIConfig['credentialProvenance']>;
  readonly contextWindow: number;
  readonly maxTokens: number;
}

interface TuiPiProviderGroup {
  readonly baseUrl: string;
  readonly protocol: OpenNekoPiProtocolProfile;
  readonly requiresApiKey: boolean;
  readonly auth?: NonNullable<CLIConfig['providerAuth']>;
  readonly selections: TuiPiExecutableSelection[];
  readonly models: Map<string, OpenNekoPiModelConfig>;
}

export async function resolveTuiPiModelPolicy(
  models: ReturnType<typeof createOpenNekoPiModels>,
  credentials: OpenNekoCredentialStore,
  config: CLIConfig,
  activePurposes: readonly TuiToolModelPurpose[],
): Promise<AgentModelPolicy> {
  const main = createTuiMainSelection(config);
  const piSelections: TuiPiExecutableSelection[] = [main];
  const domainSelections: TuiPurposeModelConfig[] = [];
  const activePurposeSet = new Set(activePurposes);
  for (const selection of Object.values(config.purposeModels ?? {})) {
    if (!selection || !activePurposeSet.has(selection.purpose)) continue;
    if (TUI_DOMAIN_MODEL_PURPOSES.has(selection.purpose)) {
      domainSelections.push(selection);
    } else {
      piSelections.push(createTuiPurposePiSelection(selection));
    }
  }

  const groups = groupTuiPiSelections(piSelections);
  const catalogByKey = new Map<string, AgentModelCatalogEntry>();
  const bindings: AgentModelBindingMap = {};
  for (const [providerId, group] of groups) {
    const source = group.selections.find((selection) => selection.apiKey !== undefined);
    if (source?.apiKey) {
      await credentials.replace(
        providerId,
        { type: 'api_key', key: source.apiKey },
        source.credentialProvenance ?? 'user-config-import',
      );
    }
    const credential = await credentials.read(providerId);
    const projection = registerOpenNekoPiProvider(models, {
      id: providerId,
      name: providerId,
      baseUrl: group.baseUrl,
      protocol: group.protocol,
      requiresApiKey: group.requiresApiKey,
      ...(group.auth === undefined ? {} : { auth: group.auth }),
      models: [...group.models.values()],
    });
    for (const selection of group.selections) {
      const model = projection.models.find((candidate) => candidate.id === selection.apiModelId);
      if (!model) {
        throw new Error(
          `Pi did not register configured model ${providerId}/${selection.apiModelId}.`,
        );
      }
      mergeTuiCatalogEntry(catalogByKey, {
        model,
        capabilities: normalizeTuiPurposeCapabilities(selection),
        credentialState: group.requiresApiKey
          ? credential
            ? 'configured'
            : 'missing'
          : 'not-required',
      });
      bindings[selection.purpose] = {
        providerId,
        modelId: selection.apiModelId,
        ...(selection.purpose === 'agent.main'
          ? {
              parameters: {
                temperature: config.temperature,
                maxTokens: config.maxTokens,
                ...projectTuiThinkingParameters(config),
              },
            }
          : {}),
      };
    }
  }

  for (const selection of domainSelections) {
    const key = modelPolicyKey(selection.providerId, selection.modelId);
    const existing = catalogByKey.get(key);
    if (existing && existing.execution !== 'domain') {
      throw new Error(
        `Agent model ${selection.providerId}/${selection.modelId} cannot be both Pi-executed and domain-executed in one turn.`,
      );
    }
    catalogByKey.set(key, {
      model: {
        provider: selection.providerId,
        id: selection.modelId,
        name: selection.apiModelId,
      },
      execution: 'domain',
      capabilities: [
        ...new Set([
          ...(existing?.capabilities ?? []),
          ...selection.capabilities,
          selection.purpose,
        ]),
      ],
      credentialState: 'ambient',
    });
    bindings[selection.purpose] = {
      providerId: selection.providerId,
      modelId: selection.modelId,
    };
  }

  return resolveAgentModelPolicy({
    catalog: [...catalogByKey.values()],
    userBindings: bindings,
    requirements: { 'agent.main': { capabilities: ['llm.chat'] } },
  });
}

function createTuiMainSelection(config: CLIConfig): TuiPiExecutableSelection {
  const providerId = config.chatModel?.providerId ?? config.provider;
  const configuredModelId = config.chatModel?.modelId ?? config.model;
  const apiModelId = config.chatModel?.apiModelId ?? configuredModelId;
  const protocol = config.protocolProfile;
  if (!protocol) throw new Error(`Provider ${providerId} has no explicit Pi protocol profile.`);
  if (!config.baseUrl) throw new Error(`Provider ${providerId} has no explicit Pi base URL.`);
  const contextWindow = config.chatModel?.contextWindow;
  const maxTokens = config.chatModel?.maxOutputTokens;
  if (!contextWindow || !maxTokens) {
    throw new Error(
      `Model ${providerId}/${configuredModelId} requires explicit contextWindow and maxOutputTokens for Pi.`,
    );
  }
  return {
    purpose: 'agent.main',
    providerId,
    configuredModelId,
    apiModelId,
    capabilities: config.chatModel?.capabilities ?? ['llm.chat'],
    baseUrl: config.baseUrl,
    protocol,
    requiresApiKey: config.providerRequiresApiKey,
    ...(config.providerAuth === undefined ? {} : { auth: config.providerAuth }),
    ...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
    ...(config.credentialProvenance === undefined
      ? {}
      : { credentialProvenance: config.credentialProvenance }),
    contextWindow,
    maxTokens,
  };
}

function createTuiPurposePiSelection(selection: TuiPurposeModelConfig): TuiPiExecutableSelection {
  if (!selection.protocolProfile) {
    throw new Error(`Purpose ${selection.purpose} has no explicit Pi protocol profile.`);
  }
  if (!selection.contextWindow || !selection.maxOutputTokens) {
    throw new Error(
      `Purpose ${selection.purpose} model ${selection.providerId}/${selection.modelId} requires Pi token limits.`,
    );
  }
  return {
    purpose: selection.purpose,
    providerId: selection.providerId,
    configuredModelId: selection.modelId,
    apiModelId: selection.apiModelId,
    capabilities: selection.capabilities,
    baseUrl: selection.baseUrl,
    protocol: selection.protocolProfile,
    requiresApiKey: selection.providerRequiresApiKey,
    ...(selection.providerAuth === undefined ? {} : { auth: selection.providerAuth }),
    ...(selection.apiKey === undefined ? {} : { apiKey: selection.apiKey }),
    ...(selection.credentialProvenance === undefined
      ? {}
      : { credentialProvenance: selection.credentialProvenance }),
    contextWindow: selection.contextWindow,
    maxTokens: selection.maxOutputTokens,
  };
}

function groupTuiPiSelections(
  selections: readonly TuiPiExecutableSelection[],
): ReadonlyMap<string, TuiPiProviderGroup> {
  const groups = new Map<string, TuiPiProviderGroup>();
  for (const selection of selections) {
    const existing = groups.get(selection.providerId);
    if (existing) {
      const existingApiKey = existing.selections.find(
        (candidate) => candidate.apiKey !== undefined,
      )?.apiKey;
      if (
        existing.baseUrl !== selection.baseUrl ||
        existing.requiresApiKey !== selection.requiresApiKey ||
        JSON.stringify(existing.auth) !== JSON.stringify(selection.auth) ||
        (existingApiKey !== undefined &&
          selection.apiKey !== undefined &&
          existingApiKey !== selection.apiKey)
      ) {
        throw new Error(`Provider ${selection.providerId} has conflicting purpose projections.`);
      }
      existing.selections.push(selection);
      mergeTuiPiModelConfig(existing.models, selection);
      continue;
    }
    const models = new Map<string, OpenNekoPiModelConfig>();
    mergeTuiPiModelConfig(models, selection);
    groups.set(selection.providerId, {
      baseUrl: selection.baseUrl,
      protocol: selection.protocol,
      requiresApiKey: selection.requiresApiKey,
      ...(selection.auth === undefined ? {} : { auth: selection.auth }),
      selections: [selection],
      models,
    });
  }
  return groups;
}

function mergeTuiPiModelConfig(
  models: Map<string, OpenNekoPiModelConfig>,
  selection: TuiPiExecutableSelection,
): void {
  const model: OpenNekoPiModelConfig = {
    id: selection.apiModelId,
    name: selection.configuredModelId,
    protocol: selection.protocol,
    input: selection.capabilities.some((capability) =>
      ['vision', 'llm.vision', 'image.understand'].includes(capability),
    )
      ? ['text', 'image']
      : ['text'],
    reasoning: selection.capabilities.includes('reasoning'),
    contextWindow: selection.contextWindow,
    maxTokens: selection.maxTokens,
  };
  const existing = models.get(model.id);
  if (existing && JSON.stringify(existing) !== JSON.stringify(model)) {
    throw new Error(
      `Provider model ${selection.providerId}/${model.id} has conflicting projections.`,
    );
  }
  models.set(model.id, model);
}

function mergeTuiCatalogEntry(
  catalog: Map<string, AgentModelCatalogEntry>,
  entry: AgentModelCatalogEntry,
): void {
  const key = modelPolicyKey(entry.model.provider, entry.model.id);
  const existing = catalog.get(key);
  if (!existing) {
    catalog.set(key, entry);
    return;
  }
  if (existing.execution === 'domain' || entry.execution === 'domain') {
    throw new Error(
      `Agent model ${entry.model.provider}/${entry.model.id} has conflicting owners.`,
    );
  }
  catalog.set(key, {
    ...entry,
    capabilities: [...new Set([...existing.capabilities, ...entry.capabilities])],
  });
}

function normalizeTuiPurposeCapabilities(
  selection: Pick<TuiPiExecutableSelection, 'purpose' | 'capabilities'>,
): readonly string[] {
  return [
    ...new Set([
      ...selection.capabilities,
      selection.purpose,
      ...(selection.purpose === 'agent.main' && selection.capabilities.includes('chat')
        ? ['llm.chat']
        : []),
    ]),
  ];
}

function modelPolicyKey(providerId: string, modelId: string): string {
  return `${providerId}\u0000${modelId}`;
}

export function projectTuiThinkingParameters(
  config: Pick<CLIConfig, 'provider' | 'chatModel' | 'protocolProfile' | 'thinkingBudget'>,
): Pick<AgentModelParameters, 'thinkingLevel' | 'thinkingBudgets'> {
  if (config.thinkingBudget === 0) return {};
  const providerId = config.chatModel?.providerId ?? config.provider;
  if (config.protocolProfile !== 'anthropic') {
    throw new Error(
      `Provider ${providerId} uses ${config.protocolProfile}; numeric thinkingBudget requires the Anthropic protocol for an exact Pi projection.`,
    );
  }
  return {
    thinkingLevel: 'medium',
    thinkingBudgets: { medium: config.thinkingBudget },
  };
}

function createTurnIdentity(): Pick<PiToolRunIdentity, 'turnId' | 'runId'> {
  return Object.freeze({
    turnId: `turn-${randomUUID()}`,
    runId: `run-${randomUUID()}`,
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function conversationTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) throw new Error('Conversation prompt must not be empty.');
  return normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized;
}

function requireProtocol(
  protocol: CLIConfig['protocolProfile'],
): NonNullable<CLIConfig['protocolProfile']> {
  if (protocol === undefined) throw new Error('Pi runtime evidence requires an explicit protocol.');
  return protocol;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
