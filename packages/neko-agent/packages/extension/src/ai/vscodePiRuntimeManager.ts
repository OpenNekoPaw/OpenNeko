import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import type { AssistantExecutionMode, Model, Provider } from '@neko/platform';
import { TOOL_NAMES_QUALITY, type IToolRegistry, type Tool } from '@neko/shared';
import {
  NodePiConversationAuthority,
  PiConversationRuntime,
  createNodePiSkillHost,
  createOpenNekoPiModels,
  projectOpenNekoTools,
  resolveOpenNekoToolModelPurpose,
  registerOpenNekoPiProvider,
  resolvePiToolPermissionAction,
  resolveAgentPurposeModelUse,
  resolveAgentModelPolicy,
  type AgentModelBindingMap,
  type AgentModelCatalogEntry,
  type AgentModelPolicy,
  type AgentModelParameters,
  type AgentModelPurpose,
  type OpenNekoCredentialStore,
  type OpenNekoPiProtocolProfile,
  type OpenNekoPiModelConfig,
  type ResolvedPiAgentModelUse,
  type PiProductAgentEvent,
  type PiProductEventSink,
  type PiConversationCatalogProjector,
  type PiConversationCatalogRecord,
  type PiConversationTranscriptEntry,
  type PiSkillHostSnapshot,
  type PiToolPermissionPolicy,
  type PiToolRunIdentity,
  type SkillHostRecord,
  type SkillSourceRoot,
} from '@neko/agent/pi';
import { PiToolConfirmationRegistry } from './piToolConfirmationRegistry';

type PiThinkingLevel = NonNullable<AgentModelPolicy['agent.main']['parameters']['thinkingLevel']>;
type VSCodePiToolPurpose = Extract<
  AgentModelPurpose,
  | 'image.generate'
  | 'image.edit'
  | 'image.understand'
  | 'video.generate'
  | 'video.understand'
  | 'audio.generate'
  | 'audio.tts'
  | 'audio.music.generate'
  | 'audio.understand'
>;
const VSCODE_PI_TOOL_PURPOSES = [
  'image.generate',
  'image.edit',
  'image.understand',
  'video.generate',
  'video.understand',
  'audio.generate',
  'audio.tts',
  'audio.music.generate',
  'audio.understand',
] as const satisfies readonly VSCodePiToolPurpose[];
export type VSCodePiDirectPurpose = Extract<
  AgentModelPurpose,
  'canvas.prompt' | 'canvas.judge' | 'character.dialogue' | 'character.profile'
>;

export interface VSCodePiPurposeModelSelection {
  readonly provider: Provider;
  readonly model: Model;
  readonly providerSource: 'explicit-config' | 'account-gateway';
}

export interface ResolveVSCodePiPurposeModelUseInput extends VSCodePiPurposeModelSelection {
  readonly purpose: VSCodePiDirectPurpose;
  readonly parameters?: AgentModelParameters;
}

export interface VSCodePiRuntimeManagerOptions {
  readonly userDataRoot: string;
  readonly workspaceId: string;
  readonly hostId: string;
  readonly workspaceRoot?: string;
  readonly builtinSkillRoot: string;
  readonly credentials: OpenNekoCredentialStore;
  readonly resolveAccountGatewayCredential?: (providerId: string) => Promise<string>;
  readonly tools: IToolRegistry;
  readonly workspaceTrusted: () => boolean;
}

export interface ExecuteVSCodePiTurnInput {
  readonly conversationId: string;
  readonly prompt: string;
  readonly systemPrompt: string;
  readonly provider: Provider;
  readonly model: Model;
  readonly providerSource: 'explicit-config' | 'account-gateway';
  readonly purposeModels?: Partial<Record<VSCodePiToolPurpose, VSCodePiPurposeModelSelection>>;
  readonly executionMode: AssistantExecutionMode;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
  readonly thinkingLevel?: PiThinkingLevel;
  readonly images?: readonly {
    readonly type: 'base64';
    readonly media_type: string;
    readonly data: string;
  }[];
  readonly locale: 'en' | 'zh';
  readonly events: PiProductEventSink;
}

export interface VSCodePiTurnResult {
  readonly status: 'completed' | 'cancelled' | 'failed';
  readonly turnId: string;
  readonly runId: string;
  readonly durability: Exclude<
    ReturnType<NodePiConversationAuthority['getTurnDurability']>,
    undefined
  >;
}

export interface ExecuteVSCodePiSkillTurnInput extends ExecuteVSCodePiTurnInput {
  readonly skillName: string;
  readonly additionalInstructions?: string;
}

export interface VSCodePiConversationCatalogItem extends PiConversationCatalogRecord {
  readonly messageCount: number;
}

interface ActiveTurn {
  readonly identity: Pick<PiToolRunIdentity, 'turnId' | 'runId'>;
  readonly operation: Promise<VSCodePiTurnResult>;
}

/**
 * VS Code Host owner for conversation-scoped Pi runtimes.
 *
 * This class owns only Host concerns: workspace trust, configured Tools,
 * confirmation interaction, user-global storage roots, and disposal. Pi owns
 * the Agent loop and transcript.
 */
export class VSCodePiRuntimeManager {
  private readonly conversations = new Map<string, VSCodePiConversationOwner>();
  private readonly opening = new Map<string, Promise<VSCodePiConversationOwner>>();
  private authorityPromise: Promise<NodePiConversationAuthority> | undefined;
  private authority: NodePiConversationAuthority | undefined;
  private disposed = false;

  constructor(private readonly options: VSCodePiRuntimeManagerOptions) {}

  async execute(input: ExecuteVSCodePiTurnInput): Promise<VSCodePiTurnResult> {
    this.assertNotDisposed();
    const owner = await this.getOrCreate(input);
    return owner.execute(input);
  }

  async executeSkill(input: ExecuteVSCodePiSkillTurnInput): Promise<VSCodePiTurnResult> {
    this.assertNotDisposed();
    const owner = await this.getOrCreate(input);
    return owner.executeSkill(input);
  }

  isRunning(conversationId: string): boolean {
    return this.conversations.get(conversationId)?.isRunning ?? false;
  }

  getRunningConversationIds(): string[] {
    return [...this.conversations.entries()]
      .filter(([, owner]) => owner.isRunning)
      .map(([conversationId]) => conversationId);
  }

  getConversationIds(): string[] {
    return [...this.conversations.keys()];
  }

  async listConversationCatalog(): Promise<readonly PiConversationCatalogRecord[]> {
    this.assertNotDisposed();
    return (await this.getAuthority()).listConversations();
  }

  async listSkillCatalog(): Promise<readonly SkillHostRecord[]> {
    this.assertNotDisposed();
    const host = createVSCodePiSkillHost(
      this.options,
      this.options.workspaceRoot ?? `/__neko_workspaces/${this.options.workspaceId}`,
    );
    return (await host.discover(await vscodePiSkillRoots(this.options))).records;
  }

  async listConversationPresentationCatalog(): Promise<readonly VSCodePiConversationCatalogItem[]> {
    this.assertNotDisposed();
    const authority = await this.getAuthority();
    return Promise.all(
      authority.listConversations().map(async (conversation) => {
        const entries = await authority.readBranchEntries(
          conversation.conversationId,
          conversation.activeBranchId,
        );
        return {
          ...conversation,
          messageCount: countDisplayMessages(entries),
        };
      }),
    );
  }

  async readConversationEntries(
    conversationId: string,
  ): Promise<readonly PiConversationTranscriptEntry[]> {
    this.assertNotDisposed();
    const authority = await this.getAuthority();
    const conversation = authority.readConversation(conversationId);
    if (!conversation) throw new Error(`Pi conversation ${conversationId} does not exist.`);
    return authority.readBranchEntries(conversationId, conversation.activeBranchId);
  }

  async projectConversationCatalog(projector: PiConversationCatalogProjector): Promise<void> {
    this.assertNotDisposed();
    await (await this.getAuthority()).projectCatalog(projector);
  }

  async createConversation(input: {
    readonly conversationId: string;
    readonly title?: string;
  }): Promise<PiConversationCatalogRecord> {
    this.assertNotDisposed();
    const authority = await this.getAuthority();
    if (authority.readConversation(input.conversationId)) {
      throw new Error(`Pi conversation ${input.conversationId} already exists.`);
    }
    const lease = authority.acquireLease(input.conversationId);
    try {
      await authority.createConversation({
        lease,
        conversationId: input.conversationId,
        branchId: 'main',
        ...(input.title ? { title: input.title } : {}),
      });
      const record = authority.readConversation(input.conversationId);
      if (!record) {
        throw new Error(
          `Pi conversation ${input.conversationId} was not cataloged after creation.`,
        );
      }
      return record;
    } finally {
      authority.releaseLease(lease);
    }
  }

  async updateConversationTitle(conversationId: string, title: string): Promise<void> {
    this.assertNotDisposed();
    const owner = this.conversations.get(conversationId);
    if (owner) {
      owner.updateTitle(title);
      return;
    }
    const authority = await this.getAuthority();
    const lease = authority.acquireLease(conversationId);
    try {
      authority.updateConversationTitle(lease, conversationId, title);
    } finally {
      authority.releaseLease(lease);
    }
  }

  cancel(conversationId: string): void {
    this.conversations.get(conversationId)?.cancel();
  }

  confirmTool(conversationId: string, toolCallId: string, approved: boolean): void {
    const owner = this.conversations.get(conversationId);
    if (!owner) {
      throw new Error(`Pi conversation ${conversationId} is not open.`);
    }
    owner.confirmTool(toolCallId, approved);
  }

  getContextTokenCount(conversationId: string): number {
    return this.conversations.get(conversationId)?.contextTokenCount ?? 0;
  }

  async remove(conversationId: string): Promise<void> {
    const owner = this.conversations.get(conversationId);
    if (!owner) return;
    this.conversations.delete(conversationId);
    await owner.dispose();
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    this.assertNotDisposed();
    const pending = this.opening.get(conversationId);
    if (pending) await pending;
    await this.remove(conversationId);
    const authority = await this.getAuthority();
    if (!authority.readConversation(conversationId)) return false;
    const lease = authority.acquireLease(conversationId, { takeover: true });
    await authority.deleteConversation(lease, conversationId);
    return true;
  }

  async clearContext(conversationId: string): Promise<void> {
    const owner = this.conversations.get(conversationId);
    if (owner) {
      await owner.clearContext();
      return;
    }
    const authority = await this.getAuthority();
    const conversation = authority.readConversation(conversationId);
    if (!conversation) throw new Error(`Pi conversation ${conversationId} does not exist.`);
    const lease = authority.acquireLease(conversationId);
    try {
      await authority.rollbackBranch(lease, conversationId, conversation.activeBranchId, null);
    } finally {
      authority.releaseLease(lease);
    }
  }

  async compactContext(conversationId: string): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }> {
    const owner = this.conversations.get(conversationId);
    if (!owner) throw new Error(`Pi conversation ${conversationId} is not open.`);
    return owner.compactContext();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const owners = [...this.conversations.values()];
    this.conversations.clear();
    const openings = [...this.opening.values()];
    void Promise.allSettled([
      ...owners.map((owner) => owner.dispose()),
      ...openings.map((opening) => opening.then((owner) => owner.dispose())),
    ]).then(async () => {
      const authority = this.authority ?? (await this.authorityPromise);
      await authority?.dispose();
    });
  }

  private async getOrCreate(input: ExecuteVSCodePiTurnInput): Promise<VSCodePiConversationOwner> {
    const existing = this.conversations.get(input.conversationId);
    if (existing) return existing;
    const pending = this.opening.get(input.conversationId);
    if (pending) return pending;
    const authority = await this.getAuthority();
    const opening = VSCodePiConversationOwner.open(this.options, authority, input);
    this.opening.set(input.conversationId, opening);
    let owner: VSCodePiConversationOwner;
    try {
      owner = await opening;
    } finally {
      if (this.opening.get(input.conversationId) === opening) {
        this.opening.delete(input.conversationId);
      }
    }
    if (this.disposed) {
      await owner.dispose();
      throw new Error('VS Code Pi runtime manager was disposed during conversation open.');
    }
    const raced = this.conversations.get(input.conversationId);
    if (raced) {
      await owner.dispose();
      return raced;
    }
    this.conversations.set(input.conversationId, owner);
    return owner;
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('VS Code Pi runtime manager is disposed.');
  }

  private async getAuthority(): Promise<NodePiConversationAuthority> {
    this.assertNotDisposed();
    if (!this.authorityPromise) {
      this.authorityPromise = NodePiConversationAuthority.create({
        userDataRoot: this.options.userDataRoot,
        workspaceId: this.options.workspaceId,
        hostId: this.options.hostId,
      });
    }
    const authority = await this.authorityPromise;
    if (this.disposed) {
      throw new Error('VS Code Pi runtime manager was disposed during authority open.');
    }
    this.authority = authority;
    return authority;
  }
}

function countDisplayMessages(entries: readonly PiConversationTranscriptEntry[]): number {
  return entries.filter(
    (entry) =>
      entry.type === 'message' &&
      (entry.message.role === 'user' || entry.message.role === 'assistant'),
  ).length;
}

class VSCodePiConversationOwner {
  private activeTurn: ActiveTurn | undefined;
  private readonly confirmations = new PiToolConfirmationRegistry();
  private disposed = false;

  private constructor(
    private readonly options: VSCodePiRuntimeManagerOptions,
    private readonly authority: NodePiConversationAuthority,
    private readonly runtime: PiConversationRuntime,
    private readonly models: ReturnType<typeof createOpenNekoPiModels>,
    private readonly skills: ReturnType<typeof createNodePiSkillHost>,
    private readonly branchId: string,
    private titleInitialized: boolean,
    private contextWindow: number,
  ) {}

  static async open(
    options: VSCodePiRuntimeManagerOptions,
    authority: NodePiConversationAuthority,
    input: ExecuteVSCodePiTurnInput,
  ): Promise<VSCodePiConversationOwner> {
    const models = createOpenNekoPiModels(options.credentials);
    const policy = await resolveVSCodePiTurnModelPolicy(
      models,
      options.credentials,
      filterVSCodePiTurnPurposeModels(input, options.tools.list()),
      options.resolveAccountGatewayCredential,
    );
    const contextWindow = input.model.contextWindow;
    if (!contextWindow) {
      throw new Error(`Model ${input.provider.id}/${input.model.id} lacks a context window.`);
    }
    const lease = authority.acquireLease(input.conversationId);
    let runtime: PiConversationRuntime | undefined;
    try {
      const existing = authority.readConversation(input.conversationId);
      const branchId = existing?.activeBranchId ?? 'main';
      if (!existing) {
        await authority.createConversation({
          lease,
          conversationId: input.conversationId,
          branchId,
        });
      }
      runtime = await PiConversationRuntime.open({
        authority,
        lease,
        conversationId: input.conversationId,
        branchId,
        models,
        initialModelPolicy: policy,
        baseSystemPrompt: input.systemPrompt,
      });
      return new VSCodePiConversationOwner(
        options,
        authority,
        runtime,
        models,
        createVSCodePiSkillHost(options, options.workspaceRoot ?? authority.virtualWorkspaceCwd()),
        branchId,
        existing !== undefined && existing.title !== 'New conversation',
        contextWindow,
      );
    } catch (error) {
      try {
        if (runtime) runtime.dispose();
        else authority.releaseLease(lease);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Failed to open and clean up Pi conversation ${input.conversationId}.`,
        );
      }
      throw error;
    }
  }

  get isRunning(): boolean {
    return this.activeTurn !== undefined;
  }

  get contextTokenCount(): number {
    return this.runtime.contextTokenCount;
  }

  updateTitle(title: string): void {
    this.assertReady();
    this.runtime.updateConversationTitle(title);
    this.titleInitialized = true;
  }

  async execute(input: ExecuteVSCodePiTurnInput): Promise<VSCodePiTurnResult> {
    return this.executeTurn(input);
  }

  async executeSkill(input: ExecuteVSCodePiSkillTurnInput): Promise<VSCodePiTurnResult> {
    return this.executeTurn(input, {
      skillName: input.skillName,
      ...(input.additionalInstructions === undefined
        ? {}
        : { additionalInstructions: input.additionalInstructions }),
    });
  }

  private async executeTurn(
    input: ExecuteVSCodePiTurnInput,
    skill?: { readonly skillName: string; readonly additionalInstructions?: string },
  ): Promise<VSCodePiTurnResult> {
    this.assertReady();
    const policy = await resolveVSCodePiTurnModelPolicy(
      this.models,
      this.options.credentials,
      filterVSCodePiTurnPurposeModels(input, this.options.tools.list()),
      this.options.resolveAccountGatewayCredential,
    );
    const contextWindow = input.model.contextWindow;
    if (!contextWindow) {
      throw new Error(`Model ${input.provider.id}/${input.model.id} lacks a context window.`);
    }
    this.contextWindow = contextWindow;
    const skillSnapshot = await this.discoverSkills();
    const identity = createTurnIdentity();
    const terminal: { status: VSCodePiTurnResult['status'] | undefined } = {
      status: undefined,
    };
    const events = createTerminalTrackingSink(input.events, terminal);
    const permissionPolicy = this.createPermissionPolicy(input, events);
    if (!this.titleInitialized) {
      this.runtime.updateConversationTitle(conversationTitle(input.prompt));
      this.titleInitialized = true;
    }
    const runtimeInput = {
      ...identity,
      ...(input.images === undefined
        ? {}
        : {
            images: input.images.map((image) => ({
              type: 'image' as const,
              mimeType: image.media_type,
              data: image.data,
            })),
          }),
      modelPolicy: policy,
      skillSnapshot,
      capabilityTools: projectOpenNekoTools(this.options.tools.list(), {
        locale: input.locale,
        purposeForTool: resolveOpenNekoToolModelPurpose,
        isPurposeOptionalForTool: (tool) => tool.name === TOOL_NAMES_QUALITY.QUALITY_CHECK,
      }),
      permissionPolicy,
      workspaceTrusted: this.options.workspaceTrusted(),
      events,
      systemPrompt: input.systemPrompt,
    };
    const operation = (
      skill
        ? this.runtime.executeSkill({
            ...runtimeInput,
            skillName: skill.skillName,
            ...(skill.additionalInstructions === undefined
              ? {}
              : { additionalInstructions: skill.additionalInstructions }),
          })
        : this.runtime.execute({ ...runtimeInput, prompt: input.prompt })
    ).then(() => ({
      status: terminal.status ?? 'completed',
      ...identity,
      durability: requireTurnDurability(this.authority, input.conversationId, identity.turnId),
    }));
    this.activeTurn = { identity, operation };
    try {
      return await operation;
    } finally {
      this.cancelPendingConfirmations();
      if (this.activeTurn?.operation === operation) this.activeTurn = undefined;
    }
  }

  cancel(): void {
    const active = this.activeTurn;
    if (!active) return;
    this.cancelPendingConfirmations();
    this.runtime.cancel(active.identity);
  }

  confirmTool(toolCallId: string, approved: boolean): void {
    this.confirmations.resolve(toolCallId, approved);
  }

  async clearContext(): Promise<void> {
    this.assertReady();
    await this.runtime.clearContext();
  }

  compactContext(): Promise<{
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  }> {
    this.assertReady();
    const reserveTokens = Math.min(16_384, Math.floor(this.contextWindow / 5));
    return this.runtime.compactContext({
      reserveTokens: Math.max(1, reserveTokens),
      keepRecentTokens: Math.max(1, this.contextWindow - reserveTokens),
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    await this.activeTurn?.operation.catch(() => undefined);
    this.cancelPendingConfirmations();
    this.runtime.dispose();
  }

  private createPermissionPolicy(
    input: ExecuteVSCodePiTurnInput,
    events: PiProductEventSink,
  ): PiToolPermissionPolicy {
    return {
      preflight: async ({ tool, args, identity: toolIdentity, signal }) => {
        const action = resolvePiToolPermissionAction(
          input.executionMode,
          tool.requiresConfirmation,
          tool.isReadOnly,
        );
        if (action === 'deny') {
          return { allowed: false, reason: 'Tool execution is disabled in plan mode.' };
        }
        if (action === 'allow') {
          return { allowed: true };
        }
        const allowed = await this.confirmations.request(
          toolIdentity.toolCallId,
          () =>
            events.emit({
              type: 'confirmation.required',
              identity: toolIdentity,
              timestamp: Date.now(),
              confirmationId: `confirmation:${toolIdentity.toolCallId}`,
              toolCallId: toolIdentity.toolCallId,
              toolName: tool.name,
              summary: summarizeToolConfirmation(tool.name, args),
            }),
          signal,
        );
        return allowed
          ? { allowed: true }
          : { allowed: false, reason: `User denied tool ${tool.name}.` };
      },
    };
  }

  private cancelPendingConfirmations(): void {
    this.confirmations.cancelAll();
  }

  private async discoverSkills(): Promise<PiSkillHostSnapshot> {
    return this.skills.discover(await vscodePiSkillRoots(this.options));
  }

  private assertReady(): void {
    if (this.disposed) throw new Error('VS Code Pi conversation owner is disposed.');
    if (this.activeTurn) throw new Error('VS Code Pi conversation already has an active turn.');
  }
}

function createVSCodePiSkillHost(options: VSCodePiRuntimeManagerOptions, cwd: string) {
  return createNodePiSkillHost({
    cwd,
    policy: {
      isTrusted: ({ source }) => source.kind !== 'project' || options.workspaceTrusted(),
      isEnabled: () => true,
    },
  });
}

async function vscodePiSkillRoots(
  options: VSCodePiRuntimeManagerOptions,
): Promise<SkillSourceRoot[]> {
  if (!(await pathExists(options.builtinSkillRoot))) {
    throw new Error(`Builtin Pi Skill root is missing: ${options.builtinSkillRoot}`);
  }
  const roots: SkillSourceRoot[] = [
    { path: options.builtinSkillRoot, source: { kind: 'builtin' } },
  ];
  const projectRoot = options.workspaceRoot
    ? join(options.workspaceRoot, '.agents', 'skills')
    : undefined;
  const personalRoot = join(options.userDataRoot, '..', '.agents', 'skills');
  if (projectRoot && (await pathExists(projectRoot))) {
    roots.push({ path: projectRoot, source: { kind: 'project' } });
  }
  if (await pathExists(personalRoot)) {
    roots.push({ path: personalRoot, source: { kind: 'personal' } });
  }
  return roots;
}

export async function resolveVSCodePiTurnModelPolicy(
  models: ReturnType<typeof createOpenNekoPiModels>,
  credentials: OpenNekoCredentialStore,
  input: ExecuteVSCodePiTurnInput,
  resolveAccountGatewayCredential: ((providerId: string) => Promise<string>) | undefined,
): Promise<AgentModelPolicy> {
  const selections: PiPurposeSelection[] = [
    {
      purpose: 'agent.main',
      provider: input.provider,
      model: input.model,
      providerSource: input.providerSource,
    },
  ];
  for (const purpose of VSCODE_PI_TOOL_PURPOSES) {
    const selection = input.purposeModels?.[purpose];
    if (selection) selections.push({ purpose, ...selection });
  }

  const piSelections = selections.filter((selection) => !isDomainMediaPurpose(selection.purpose));
  const domainSelections = selections.filter((selection) =>
    isDomainMediaPurpose(selection.purpose),
  );
  const providerGroups = groupPiPurposeSelections(piSelections);
  const catalog: AgentModelCatalogEntry[] = [];
  const catalogKeys = new Set<string>();
  for (const group of providerGroups) {
    await ensureVSCodePiProviderCredential(
      credentials,
      { provider: group.provider, providerSource: group.providerSource },
      resolveAccountGatewayCredential,
    );
    const credential = await credentials.read(group.provider.id);
    const requiresApiKey =
      group.providerSource === 'account-gateway' || group.provider.requiresApiKey !== false;
    const projection = registerOpenNekoPiProvider(models, {
      id: group.provider.id,
      name: group.provider.displayName,
      baseUrl: group.provider.apiUrl,
      protocol: requireProviderProtocol(group.provider, group.selections[0]?.model),
      requiresApiKey,
      auth: group.auth,
      models: group.models,
    });
    for (const selection of group.selections) {
      const modelId = selection.model.name;
      const projectedModel = projection.models.find((model) => model.id === modelId);
      if (!projectedModel) {
        throw new Error(`Pi did not register configured model ${group.provider.id}/${modelId}.`);
      }
      const key = `${group.provider.id}\u0000${modelId}`;
      if (catalogKeys.has(key)) continue;
      catalogKeys.add(key);
      catalog.push({
        model: projectedModel,
        capabilities: normalizePurposeCapabilities(selection.purpose, selection.model.capabilities),
        credentialState: requiresApiKey
          ? credential === undefined
            ? 'missing'
            : 'configured'
          : 'not-required',
      });
    }
  }
  const domainCatalog = new Map<string, AgentModelCatalogEntry>();
  for (const selection of domainSelections) {
    validateDomainPurposeSelection(selection);
    const key = `${selection.provider.id}\u0000${selection.model.id}`;
    if (catalogKeys.has(key)) {
      throw new Error(
        `Agent model ${selection.provider.id}/${selection.model.id} cannot be both Pi-executed and domain-executed in one turn.`,
      );
    }
    const existing = domainCatalog.get(key);
    domainCatalog.set(key, {
      model: {
        provider: selection.provider.id,
        id: selection.model.id,
        name: selection.model.displayName ?? selection.model.name,
      },
      execution: 'domain',
      capabilities: [
        ...new Set([
          ...(existing?.capabilities ?? []),
          selection.purpose,
          ...selection.model.capabilities,
        ]),
      ],
      credentialState: 'ambient',
    });
  }
  catalog.push(...domainCatalog.values());

  const userBindings: AgentModelBindingMap = {
    'agent.main': {
      providerId: input.provider.id,
      modelId: input.model.name,
      parameters: {
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        ...(input.topP === undefined ? {} : { topP: input.topP }),
        ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
        ...(input.thinkingBudget !== undefined && input.thinkingBudget > 0
          ? {
              thinkingLevel: input.thinkingLevel ?? ('medium' as const),
              thinkingBudgets: { medium: input.thinkingBudget },
            }
          : input.thinkingLevel === undefined
            ? {}
            : { thinkingLevel: input.thinkingLevel }),
      },
    },
  };
  for (const selection of selections) {
    if (selection.purpose === 'agent.main') continue;
    userBindings[selection.purpose] = {
      providerId: selection.provider.id,
      modelId: isDomainMediaPurpose(selection.purpose) ? selection.model.id : selection.model.name,
    };
  }
  return resolveAgentModelPolicy({
    catalog,
    userBindings,
    requirements: { 'agent.main': { capabilities: ['llm.chat'] } },
  });
}

export function filterVSCodePiTurnPurposeModels(
  input: ExecuteVSCodePiTurnInput,
  tools: readonly Pick<Tool, 'name'>[],
): ExecuteVSCodePiTurnInput {
  if (!input.purposeModels) return input;
  const activePurposes = new Set(
    tools
      .map((tool) => resolveOpenNekoToolModelPurpose(tool))
      .filter((purpose): purpose is VSCodePiToolPurpose => purpose !== undefined),
  );
  const purposeModels: Partial<Record<VSCodePiToolPurpose, VSCodePiPurposeModelSelection>> = {};
  for (const purpose of VSCODE_PI_TOOL_PURPOSES) {
    const selection = input.purposeModels[purpose];
    if (!selection) continue;
    if (activePurposes.has(purpose)) purposeModels[purpose] = selection;
  }
  return {
    ...input,
    purposeModels: Object.keys(purposeModels).length === 0 ? undefined : purposeModels,
  };
}

/**
 * Resolves one exact product-purpose model for a bounded Pi completion.
 * It shares provider projection and credential ownership with conversation turns,
 * but does not create an Agent conversation or fall back to agent.main.
 */
export async function resolveVSCodePiPurposeModelUse(
  models: ReturnType<typeof createOpenNekoPiModels>,
  credentials: OpenNekoCredentialStore,
  input: ResolveVSCodePiPurposeModelUseInput,
  resolveAccountGatewayCredential: ((providerId: string) => Promise<string>) | undefined,
): Promise<ResolvedPiAgentModelUse> {
  const selection: PiPurposeSelection = input;
  validatePiPurposeSelection(selection);
  await ensureVSCodePiProviderCredential(
    credentials,
    { provider: input.provider, providerSource: input.providerSource },
    resolveAccountGatewayCredential,
  );
  const credential = await credentials.read(input.provider.id);
  const requiresApiKey =
    input.providerSource === 'account-gateway' || input.provider.requiresApiKey !== false;
  const projection = registerOpenNekoPiProvider(models, {
    id: input.provider.id,
    name: input.provider.displayName,
    baseUrl: input.provider.apiUrl,
    protocol: requireProviderProtocol(input.provider, input.model),
    requiresApiKey,
    auth: resolveProviderAuth(input.provider, input.model),
    models: [projectPiModelConfig(input.model)],
  });
  const projectedModel = projection.models.find((model) => model.id === input.model.name);
  if (!projectedModel) {
    throw new Error(
      `Pi did not register configured purpose model ${input.provider.id}/${input.model.name}.`,
    );
  }
  const resolved = resolveAgentPurposeModelUse({
    purpose: input.purpose,
    catalog: [
      {
        model: projectedModel,
        capabilities: normalizePurposeCapabilities(input.purpose, input.model.capabilities),
        credentialState: requiresApiKey
          ? credential === undefined
            ? 'missing'
            : 'configured'
          : 'not-required',
      },
    ],
    binding: {
      providerId: input.provider.id,
      modelId: input.model.name,
      ...(input.parameters === undefined ? {} : { parameters: input.parameters }),
    },
    requirement: { capabilities: requiredPiPurposeCapabilities(input.purpose) },
  });
  if (resolved.execution !== 'pi') {
    throw new Error(`Purpose ${input.purpose} must be executable by Pi.`);
  }
  return resolved;
}

interface PiPurposeSelection extends VSCodePiPurposeModelSelection {
  readonly purpose: 'agent.main' | VSCodePiToolPurpose | VSCodePiDirectPurpose;
}

interface PiProviderSelectionGroup {
  readonly provider: Provider;
  readonly providerSource: 'explicit-config' | 'account-gateway';
  readonly auth: ReturnType<typeof resolveProviderAuth>;
  readonly selections: readonly PiPurposeSelection[];
  readonly models: readonly OpenNekoPiModelConfig[];
}

function groupPiPurposeSelections(
  selections: readonly PiPurposeSelection[],
): readonly PiProviderSelectionGroup[] {
  const grouped = new Map<string, PiPurposeSelection[]>();
  for (const selection of selections) {
    validatePiPurposeSelection(selection);
    const existing = grouped.get(selection.provider.id);
    if (existing) existing.push(selection);
    else grouped.set(selection.provider.id, [selection]);
  }
  return [...grouped.values()].map((group) => {
    const first = group[0];
    if (!first) throw new Error('Pi provider selection group must not be empty.');
    const auth = resolveProviderAuth(first.provider, first.model);
    const models = new Map<string, OpenNekoPiModelConfig>();
    for (const selection of group) {
      if (
        selection.provider.apiUrl !== first.provider.apiUrl ||
        selection.provider.apiKey !== first.provider.apiKey ||
        selection.providerSource !== first.providerSource ||
        JSON.stringify(resolveProviderAuth(selection.provider, selection.model)) !==
          JSON.stringify(auth)
      ) {
        throw new Error(
          `Pi provider ${first.provider.id} has conflicting endpoint, credential, source, or auth projections.`,
        );
      }
      const projected = projectPiModelConfig(selection.model);
      const existing = models.get(projected.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(projected)) {
        throw new Error(`Pi provider ${first.provider.id} has conflicting model ${projected.id}.`);
      }
      models.set(projected.id, projected);
    }
    return {
      provider: first.provider,
      providerSource: first.providerSource,
      auth,
      selections: group,
      models: [...models.values()],
    };
  });
}

function validatePiPurposeSelection(selection: PiPurposeSelection): void {
  if (selection.model.providerId !== selection.provider.id) {
    throw new Error(
      `Model ${selection.model.id} belongs to provider ${selection.model.providerId}, not ${selection.provider.id}.`,
    );
  }
  const protocol = selection.model.protocolProfile ?? selection.provider.protocolProfile;
  if (!protocol) {
    throw new Error(
      `Provider ${selection.provider.id} / model ${selection.model.id} requires an explicit Pi protocol profile.`,
    );
  }
  requireSupportedProtocol(protocol);
  if (!selection.provider.apiUrl) {
    throw new Error(`Provider ${selection.provider.id} requires an explicit Pi base URL.`);
  }
  if (!selection.model.contextWindow || !selection.model.maxOutputTokens) {
    throw new Error(
      `Model ${selection.provider.id}/${selection.model.id} requires contextWindow and maxOutputTokens for Pi.`,
    );
  }
  if (!modelSupportsPiPurpose(selection.model, selection.purpose)) {
    throw new Error(
      `Model ${selection.provider.id}/${selection.model.id} lacks capability for ${selection.purpose}.`,
    );
  }
}

function projectPiModelConfig(model: Model): OpenNekoPiModelConfig {
  const contextWindow = model.contextWindow;
  const maxTokens = model.maxOutputTokens;
  if (!contextWindow || !maxTokens) {
    throw new Error(`Model ${model.providerId}/${model.id} lacks Pi token limits.`);
  }
  return {
    id: model.name,
    name: model.displayName ?? model.name,
    ...(model.protocolProfile === undefined
      ? {}
      : { protocol: requireSupportedProtocol(model.protocolProfile) }),
    input: model.capabilities.some((capability) =>
      ['vision', 'llm.vision', 'image.understand'].includes(capability),
    )
      ? ['text', 'image']
      : ['text'],
    reasoning: model.capabilities.includes('reasoning'),
    contextWindow,
    maxTokens,
    cost: {
      ...(model.inputCostPer1k === undefined ? {} : { input: model.inputCostPer1k }),
      ...(model.outputCostPer1k === undefined ? {} : { output: model.outputCostPer1k }),
    },
  };
}

function requireProviderProtocol(
  provider: Provider,
  selectedModel: Model | undefined,
): OpenNekoPiProtocolProfile {
  const protocol = provider.protocolProfile ?? selectedModel?.protocolProfile;
  if (!protocol)
    throw new Error(`Provider ${provider.id} requires an explicit Pi protocol profile.`);
  return requireSupportedProtocol(protocol);
}

function modelSupportsPiPurpose(model: Model, purpose: PiPurposeSelection['purpose']): boolean {
  const capabilities = model.capabilities;
  if (
    purpose === 'agent.main' ||
    purpose === 'canvas.prompt' ||
    purpose === 'character.dialogue' ||
    purpose === 'character.profile'
  ) {
    return capabilities.includes('llm.chat') || capabilities.includes('chat');
  }
  if (purpose === 'canvas.judge') {
    return capabilities.includes('llm.judge');
  }
  if (purpose === 'image.understand') {
    return capabilities.some((value) =>
      ['image.understand', 'llm.vision', 'vision'].includes(value),
    );
  }
  if (purpose === 'video.understand') {
    return capabilities.some((value) => ['video.understand', 'vision_video'].includes(value));
  }
  return capabilities.some((value) => ['audio.understand', 'audio'].includes(value));
}

function isDomainMediaPurpose(
  purpose: PiPurposeSelection['purpose'],
): purpose is Extract<
  VSCodePiToolPurpose,
  | 'image.generate'
  | 'image.edit'
  | 'video.generate'
  | 'audio.generate'
  | 'audio.tts'
  | 'audio.music.generate'
> {
  return (
    purpose === 'image.generate' ||
    purpose === 'image.edit' ||
    purpose === 'video.generate' ||
    purpose === 'audio.generate' ||
    purpose === 'audio.tts' ||
    purpose === 'audio.music.generate'
  );
}

function validateDomainPurposeSelection(selection: PiPurposeSelection): void {
  if (!isDomainMediaPurpose(selection.purpose)) {
    throw new Error(`Purpose ${selection.purpose} is not owned by a domain media runtime.`);
  }
  if (selection.model.providerId !== selection.provider.id) {
    throw new Error(
      `Model ${selection.model.id} belongs to provider ${selection.model.providerId}, not ${selection.provider.id}.`,
    );
  }
  if (!selection.provider.apiUrl) {
    throw new Error(`Provider ${selection.provider.id} requires an explicit media base URL.`);
  }
  if (!modelSupportsDomainPurpose(selection.model, selection.purpose)) {
    throw new Error(
      `Model ${selection.provider.id}/${selection.model.id} lacks capability for ${selection.purpose}.`,
    );
  }
}

function modelSupportsDomainPurpose(
  model: Model,
  purpose: Extract<
    VSCodePiToolPurpose,
    | 'image.generate'
    | 'image.edit'
    | 'video.generate'
    | 'audio.generate'
    | 'audio.tts'
    | 'audio.music.generate'
  >,
): boolean {
  const aliases: Readonly<Record<typeof purpose, readonly string[]>> = {
    'image.generate': ['image.generate', 'image_generation', 'text_to_image'],
    'image.edit': ['image.edit', 'image_edit'],
    'video.generate': ['video.generate', 'video_generation', 'text_to_video'],
    'audio.generate': ['audio.generate', 'audio', 'text_to_audio'],
    'audio.tts': ['audio.tts', 'audio', 'text_to_audio'],
    'audio.music.generate': ['audio.music.generate', 'music_generation', 'text_to_music'],
  };
  return aliases[purpose].some((capability) =>
    (model.capabilities as readonly string[]).includes(capability),
  );
}

function normalizePurposeCapabilities(
  purpose: PiPurposeSelection['purpose'],
  capabilities: readonly string[],
): readonly string[] {
  return [
    ...new Set([
      ...capabilities,
      ...(purpose === 'agent.main' ? ['llm.chat'] : requiredPiPurposeCapabilities(purpose)),
      purpose,
    ]),
  ];
}

function requiredPiPurposeCapabilities(
  purpose: Exclude<PiPurposeSelection['purpose'], 'agent.main'>,
): readonly string[] {
  switch (purpose) {
    case 'canvas.prompt':
    case 'character.dialogue':
    case 'character.profile':
      return ['llm.chat'];
    case 'canvas.judge':
      return ['llm.judge'];
    default:
      return [purpose];
  }
}

export async function ensureVSCodePiProviderCredential(
  credentials: OpenNekoCredentialStore,
  input: Pick<ExecuteVSCodePiTurnInput, 'provider' | 'providerSource'>,
  resolveAccountGatewayCredential: ((providerId: string) => Promise<string>) | undefined,
): Promise<void> {
  if (input.provider.apiKey) {
    await credentials.replace(
      input.provider.id,
      { type: 'api_key', key: input.provider.apiKey },
      'user-config-import',
    );
    return;
  }
  if (input.providerSource !== 'account-gateway') return;
  if (!resolveAccountGatewayCredential) {
    throw new Error(
      `Account gateway provider ${input.provider.id} has no product-auth credential resolver.`,
    );
  }
  const key = (await resolveAccountGatewayCredential(input.provider.id)).trim();
  if (!key) {
    throw new Error(`Account gateway provider ${input.provider.id} returned an empty credential.`);
  }
  await credentials.replace(input.provider.id, { type: 'api_key', key }, 'account-gateway');
}

function resolveProviderAuth(
  provider: Provider,
  model: Model,
):
  | { readonly type: 'provider-default' }
  | { readonly type: 'bearer' }
  | { readonly type: 'api-key' }
  | { readonly type: 'custom-header'; readonly header: string } {
  if (model.useBearerAuth ?? provider.useBearerAuth) return { type: 'bearer' };
  const authType = provider.protocolVariant?.authType;
  if (authType === 'api-key') return { type: 'api-key' };
  if (authType === 'custom-header') {
    const header = provider.protocolVariant?.authHeader;
    if (!header) throw new Error(`Provider ${provider.id} requires a custom auth header.`);
    return { type: 'custom-header', header };
  }
  if (authType === 'bearer') return { type: 'bearer' };
  return { type: 'provider-default' };
}

function requireSupportedProtocol(protocol: string): OpenNekoPiProtocolProfile {
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
  throw new Error(`Provider protocol ${protocol} is not supported by the Pi runtime.`);
}

function createTerminalTrackingSink(
  sink: PiProductEventSink,
  terminal: { status: VSCodePiTurnResult['status'] | undefined },
): PiProductEventSink {
  return {
    emit: async (event: PiProductAgentEvent) => {
      if (event.type === 'turn.completed') terminal.status = 'completed';
      else if (event.type === 'turn.cancelled') terminal.status = 'cancelled';
      else if (event.type === 'turn.failed') terminal.status = 'failed';
      await sink.emit(event);
    },
  };
}

function createTurnIdentity(): Pick<PiToolRunIdentity, 'turnId' | 'runId'> {
  return Object.freeze({
    turnId: `turn-${randomUUID()}`,
    runId: `run-${randomUUID()}`,
  });
}

function conversationTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) throw new Error('Conversation prompt must not be empty.');
  return normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized;
}

function summarizeToolConfirmation(toolName: string, args: unknown): string {
  const keys =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? Object.keys(args).sort().slice(0, 8)
      : [];
  return keys.length === 0 ? `Run ${toolName}` : `Run ${toolName} with ${keys.join(', ')}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function requireTurnDurability(
  authority: NodePiConversationAuthority,
  conversationId: string,
  turnId: string,
): Exclude<ReturnType<NodePiConversationAuthority['getTurnDurability']>, undefined> {
  const durability = authority.getTurnDurability(conversationId, turnId);
  if (durability === undefined) {
    throw new Error(`Pi turn ${conversationId}/${turnId} has no durability state.`);
  }
  return durability;
}
