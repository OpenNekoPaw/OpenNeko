import {
  listBuiltinSlashCommands,
  isAgentInputCatalogEntryExecutable,
  parseAgentConfigurationPolicyProjection,
  parseAgentConfigurationRequest,
  parseAgentDomainBinding,
  parseAgentDraftMentionSearchProjection,
  parseAgentDraftSubmitInput,
  parseAgentDraftInteractionProjection,
  parseAgentLaunchCatalogProjection,
  parseAgentLaunchConnectionIdentity,
  sameAgentDomainBinding,
  type AgentDomainBinding,
  type AgentConfigurationFieldPolicy,
  type AgentConfigurationPolicyProjection,
  type AgentConfigurationRequest,
  type AgentInteractionPhase,
  type AgentDraftMentionSearchProjection,
  type AgentDraftSubmitInput,
  type AgentDraftInteractionProjection,
  type AgentInputCatalogEntry,
  type AgentInputReferenceReceipt,
  type AgentInputSourceReceipt,
  type AgentLaunchCatalogProjection,
  type AgentLaunchConnectionIdentity,
  type AgentLaunchResourceKind,
  type AgentMentionCatalogEntry,
  type AgentModelCatalogEntry,
  type ProjectFileMentionInfo,
  type ProjectMentionExtra,
} from '@neko/agent-contracts';
import type { AssistantConfigState } from '@neko/host/settings';
import type { AgentSkillCatalog } from './agent-app-host';
import { buildSkillActivationId } from '../pi/skill-host';

export interface AgentLaunchCatalogSource {
  readCatalog(interaction: AgentDraftInteractionProjection): Promise<{
    readonly models: readonly AgentModelCatalogEntry[];
    readonly configuration: AgentConfigurationPolicyProjection;
    readonly inputs: readonly AgentInputCatalogEntry[];
  }>;
}

export interface AgentLaunchAuthorizationPort {
  authorize(input: {
    readonly connection: AgentLaunchConnectionIdentity;
    readonly interaction: AgentDraftInteractionProjection;
    readonly resourceKind: AgentLaunchResourceKind;
  }): Promise<
    | { readonly status: 'cancelled' }
    | { readonly status: 'authorized'; readonly entry: AgentMentionCatalogEntry }
  >;
  releaseConnection(connection: AgentLaunchConnectionIdentity): Promise<void>;
}

export interface AgentLaunchWorkspaceMentionSearchPort {
  search(input: {
    readonly binding: Extract<AgentDomainBinding, { readonly kind: 'workspace' }>;
    readonly filter: string;
  }): Promise<{
    readonly filter: string;
    readonly files: readonly ProjectFileMentionInfo[];
    readonly mentionExtras: readonly ProjectMentionExtra[];
  }>;
}

export interface AgentLaunchAttachInput {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly viewId: string;
  readonly draft: AgentDraftInteractionProjection;
}

export interface AgentLaunchDomainCapabilityPolicy {
  readonly owner: string;
  readonly allowedInputKinds: readonly ('mention' | 'command' | 'skill')[];
  readonly lockedConfigurationFields: readonly (
    'model' | 'executionMode' | 'temperature' | 'maximumOutputTokens' | 'thinkingBudget'
  )[];
  readonly reason: string;
}

export interface AgentLaunchApplicationService {
  attach(input: AgentLaunchAttachInput): Promise<AgentLaunchCatalogProjection>;
  readCatalog(connection: AgentLaunchConnectionIdentity): AgentLaunchCatalogProjection;
  replaceBinding(
    connection: AgentLaunchConnectionIdentity,
    binding: AgentDomainBinding,
  ): Promise<AgentLaunchCatalogProjection>;
  authorizeResource(
    connection: AgentLaunchConnectionIdentity,
    resourceKind: AgentLaunchResourceKind,
  ): Promise<AgentLaunchCatalogProjection | undefined>;
  updateConfiguration(
    connection: AgentLaunchConnectionIdentity,
    request: AgentConfigurationRequest,
  ): AgentLaunchCatalogProjection;
  validateDraftSubmit(
    connection: AgentLaunchConnectionIdentity,
    input: AgentDraftSubmitInput,
  ): AgentConfigurationPolicyProjection;
  searchWorkspaceMentions(
    connection: AgentLaunchConnectionIdentity,
    bindingReceiptId: string,
    filter: string,
  ): Promise<AgentDraftMentionSearchProjection>;
  detach(connection: AgentLaunchConnectionIdentity): Promise<void>;
  detachWindow(windowId: string): Promise<void>;
  dispose(): Promise<void>;
}

export function createAgentLaunchApplicationService(input: {
  readonly catalog: AgentLaunchCatalogSource;
  readonly authorization: AgentLaunchAuthorizationPort;
  readonly workspaceMentions: AgentLaunchWorkspaceMentionSearchPort;
  readonly createIdentity: () => string;
}): AgentLaunchApplicationService {
  return new DefaultAgentLaunchApplicationService(input);
}

export function projectAgentLaunchBaseCatalog(input: {
  readonly config: AssistantConfigState;
  readonly thinkingBudget: number;
  readonly skills: AgentSkillCatalog;
  readonly interaction: AgentDraftInteractionProjection;
  readonly personalSkillOwnerId: string;
  readonly launchCommandHandlerIds: ReadonlySet<string>;
  readonly domainPolicy?: AgentLaunchDomainCapabilityPolicy;
}): {
  readonly models: readonly AgentModelCatalogEntry[];
  readonly configuration: AgentConfigurationPolicyProjection;
  readonly inputs: readonly AgentInputCatalogEntry[];
} {
  const models = projectAgentModelCatalog(input.config);
  const selectedModel =
    input.config.selectedProviderId && input.config.selectedModelId
      ? models.find(
          (model) =>
            model.providerId === input.config.selectedProviderId &&
            model.modelId === input.config.selectedModelId,
        )
      : undefined;
  const request =
    input.config.selectedProviderId && input.config.selectedModelId
      ? {
          modelCatalogEntryId:
            selectedModel?.id ??
            `${input.config.selectedProviderId}:${input.config.selectedModelId}`,
          providerId: input.config.selectedProviderId,
          modelId: input.config.selectedModelId,
          executionMode: input.config.executionMode,
          temperature: input.config.temperature,
          maximumOutputTokens: input.config.maxTokens,
          thinkingBudget: input.thinkingBudget,
        }
      : null;
  return {
    models,
    configuration: projectAgentConfigurationPolicy({
      models,
      request,
      source: 'global-default',
      defaults: {
        executionMode: input.config.executionMode,
        temperature: input.config.temperature,
        maximumOutputTokens: input.config.maxTokens,
        thinkingBudget: input.thinkingBudget,
      },
      policies: input.domainPolicy
        ? projectDomainConfigurationPolicies(input.domainPolicy)
        : undefined,
    }),
    inputs: applyDomainInputPolicy(
      projectAgentInputCatalog({
        skills: input.skills,
        phase: 'draft',
        binding: input.interaction.binding,
        personalSkillOwnerId: input.personalSkillOwnerId,
        commandHandlerIds: input.launchCommandHandlerIds,
      }),
      input.domainPolicy,
    ),
  };
}

function projectDomainConfigurationPolicies(
  policy: AgentLaunchDomainCapabilityPolicy,
): Partial<
  Readonly<
    Record<
      'model' | 'executionMode' | 'temperature' | 'maximumOutputTokens' | 'thinkingBudget',
      AgentConfigurationFieldPolicy
    >
  >
> {
  return Object.fromEntries(
    policy.lockedConfigurationFields.map((field) => [
      field,
      { status: 'locked', owner: policy.owner, reason: policy.reason } as const,
    ]),
  );
}

function applyDomainInputPolicy(
  entries: readonly AgentInputCatalogEntry[],
  policy: AgentLaunchDomainCapabilityPolicy | undefined,
): readonly AgentInputCatalogEntry[] {
  if (!policy) return entries;
  const allowed = new Set(policy.allowedInputKinds);
  return entries.map((entry) =>
    allowed.has(entry.trigger)
      ? entry
      : {
          ...entry,
          availability: {
            status: 'unavailable',
            diagnostic: {
              code: 'domain-policy-denied',
              owner: policy.owner,
              message: policy.reason,
            },
          },
        },
  );
}

export function projectAgentModelCatalog(
  config: AssistantConfigState,
): readonly AgentModelCatalogEntry[] {
  return config.chatModelOptions.map((model): AgentModelCatalogEntry => {
    const missing: string[] = [];
    if (!model.contextWindow) missing.push('context window');
    if (!model.maxOutputTokens) missing.push('maximum output tokens');
    if (!model.capabilities?.length) missing.push('purpose capabilities');
    const providerConfigured = config.configuredProviders.some(
      (provider) => provider.id === model.providerId,
    );
    if (!providerConfigured) missing.push('provider credential or local configuration');
    return {
      id: model.id,
      label: model.label,
      providerId: model.providerId,
      modelId: model.modelId,
      modelType: model.category ?? 'llm',
      contextWindow: model.contextWindow ?? null,
      maximumOutputTokens: model.maxOutputTokens ?? null,
      purposeCapabilities: model.capabilities ?? [],
      availability:
        missing.length === 0
          ? { status: 'available' }
          : {
              status: 'unavailable',
              diagnostic: {
                code: 'model-configuration-incomplete',
                owner: 'agent-config',
                message: `Model ${model.id} is missing ${missing.join(', ')}.`,
              },
            },
    };
  });
}

export function projectAgentInputCatalog(input: {
  readonly skills: AgentSkillCatalog;
  readonly phase: AgentInteractionPhase;
  readonly binding: AgentDomainBinding;
  readonly personalSkillOwnerId: string;
  readonly commandHandlerIds: ReadonlySet<string>;
}): readonly AgentInputCatalogEntry[] {
  const bindingKind = input.binding.kind;
  const builtinCommands: AgentInputCatalogEntry[] = listBuiltinSlashCommands().map((command) => {
    const phaseRequirement = command.name === 'compact' ? 'session' : 'any';
    const bindingRequirement = workspaceCommandNames.has(command.name) ? 'workspace' : 'any';
    const handlerId = `builtin:${command.name}`;
    const handlerAvailable = input.commandHandlerIds.has(handlerId);
    const phaseAvailable = phaseRequirement === 'any' || phaseRequirement === input.phase;
    return {
      id: `command:builtin:${command.name}`,
      name: command.name,
      description: command.description,
      trigger: 'command',
      prefix: '/',
      phaseRequirement,
      bindingRequirement,
      source: { kind: 'builtin', sourceId: command.name },
      availability: !phaseAvailable
        ? {
            status: 'unavailable',
            diagnostic: {
              code: phaseRequirement === 'session' ? 'session-required' : 'phase-required',
              owner: 'agent-runtime',
              message:
                phaseRequirement === 'session'
                  ? `Command /${command.name} requires an exact Conversation.`
                  : `Command /${command.name} is unavailable in the current Agent phase.`,
            },
          }
        : !handlerAvailable
          ? {
              status: 'unavailable',
              diagnostic: {
                code: 'command-handler-unavailable',
                owner: 'agent-runtime',
                message: `Command /${command.name} has no registered ${input.phase} handler.`,
              },
            }
          : bindingRequirement !== 'any' && bindingKind !== bindingRequirement
            ? {
                status: 'unavailable',
                diagnostic: {
                  code: 'binding-required',
                  owner: 'agent-runtime',
                  message: `Command /${command.name} requires a ${bindingRequirement} binding.`,
                },
              }
            : { status: 'available' },
      executable: {
        kind: 'command',
        commandId: command.name,
        handlerId,
      },
    };
  });
  const commandArtifacts: AgentInputCatalogEntry[] = input.skills.records.flatMap((artifact) => {
    if (artifact.entryPoint.kind !== 'command-artifact') return [];
    const entryPoint = artifact.entryPoint;
    const bindingRequirement = artifact.source.kind === 'project' ? 'workspace' : 'any';
    const available =
      artifact.enabled &&
      artifact.trusted &&
      (bindingRequirement === 'any' || bindingKind === bindingRequirement);
    const activationId = buildSkillActivationId(artifact);
    return [
      {
        id: `command-artifact:${artifact.source.kind}:${artifact.entryPoint.artifactId}`,
        name: artifact.entryPoint.commandId,
        description: artifact.description,
        trigger: 'command' as const,
        prefix: '/' as const,
        phaseRequirement: 'any' as const,
        bindingRequirement,
        source: projectCommandArtifactSource({
          artifact,
          entryPoint,
          binding: input.binding,
          personalSkillOwnerId: input.personalSkillOwnerId,
        }),
        availability: available
          ? ({ status: 'available' } as const)
          : {
              status: 'unavailable' as const,
              diagnostic: {
                code: !artifact.enabled
                  ? 'command-artifact-disabled'
                  : !artifact.trusted
                    ? 'command-artifact-untrusted'
                    : 'binding-required',
                owner: 'agent-skill-runtime',
                message: `Command /${artifact.entryPoint.commandId} is unavailable for this ${input.phase}.`,
              },
            },
        executable: {
          kind: 'command' as const,
          commandId: artifact.entryPoint.commandId,
          handlerId: `command-artifact:${activationId}`,
        },
      },
    ];
  });
  const skills: AgentInputCatalogEntry[] = input.skills.records.flatMap((skill) => {
    if (skill.entryPoint.kind !== 'skill') return [];
    const bindingRequirement = skill.source.kind === 'project' ? 'workspace' : 'any';
    const available =
      skill.enabled &&
      skill.trusted &&
      (bindingRequirement === 'any' || bindingKind === bindingRequirement);
    return [
      {
        id: `skill:${skill.source.kind}:${skill.fingerprint}`,
        name: skill.name,
        description: skill.description,
        trigger: 'skill',
        prefix: '$',
        phaseRequirement: 'any',
        bindingRequirement,
        source: projectSkillSource({
          source: skill.source,
          sourceId: skill.fingerprint,
          binding: input.binding,
          personalSkillOwnerId: input.personalSkillOwnerId,
        }),
        availability: available
          ? { status: 'available' }
          : {
              status: 'unavailable',
              diagnostic: {
                code: !skill.enabled
                  ? 'skill-disabled'
                  : !skill.trusted
                    ? 'skill-untrusted'
                    : 'binding-required',
                owner: 'agent-skill-runtime',
                message: `Skill ${skill.name} is unavailable for this ${input.phase}.`,
              },
            },
        executable: {
          kind: 'skill',
          skillName: skill.name,
          activationId: buildSkillActivationId(skill),
        },
      },
    ];
  });
  return [...builtinCommands, ...commandArtifacts, ...skills];
}

const workspaceCommandNames = new Set(['as', 'exit-as', 'init']);

interface AgentLaunchState {
  readonly connection: AgentLaunchConnectionIdentity;
  interaction: AgentDraftInteractionProjection;
  attachmentCount: number;
  models: readonly AgentModelCatalogEntry[];
  configuration: AgentConfigurationPolicyProjection;
  inputs: readonly AgentInputCatalogEntry[];
  workspaceMentionInputIds: Set<string>;
}

class DefaultAgentLaunchApplicationService implements AgentLaunchApplicationService {
  private readonly connections = new Map<string, AgentLaunchState>();
  private readonly pendingAttachments = new Map<string, Promise<AgentLaunchState>>();
  private readonly releasedConnectionIds = new Set<string>();
  private disposed = false;

  constructor(
    private readonly input: {
      readonly catalog: AgentLaunchCatalogSource;
      readonly authorization: AgentLaunchAuthorizationPort;
      readonly workspaceMentions: AgentLaunchWorkspaceMentionSearchPort;
      readonly createIdentity: () => string;
    },
  ) {}

  async attach(input: AgentLaunchAttachInput): Promise<AgentLaunchCatalogProjection> {
    this.requireActive();
    const draft = parseAgentDraftInteractionProjection(input.draft);
    if (draft.bindingReceipt !== null) {
      throw new Error('Agent launch attach requires an unissued Draft binding receipt.');
    }
    const key = ownerKey(input.windowId, input.workbenchInstanceId, input.agentSurfaceId);
    const pending = this.pendingAttachments.get(key);
    if (pending) {
      await pending;
      return this.attach(input);
    }
    const existing = this.connections.get(key);
    if (existing && sameAttachIdentity(existing, input, draft)) {
      existing.attachmentCount += 1;
      return project(existing);
    }
    const operation = this.attachFresh(key, input, draft, existing);
    this.pendingAttachments.set(key, operation);
    try {
      return project(await operation);
    } finally {
      if (this.pendingAttachments.get(key) === operation) this.pendingAttachments.delete(key);
    }
  }

  private async attachFresh(
    key: string,
    input: AgentLaunchAttachInput,
    draft: AgentDraftInteractionProjection,
    existing: AgentLaunchState | undefined,
  ): Promise<AgentLaunchState> {
    if (existing) await this.release(key, existing);
    const connection = parseAgentLaunchConnectionIdentity({
      applicationInstanceId: input.applicationInstanceId,
      windowId: input.windowId,
      workbenchInstanceId: input.workbenchInstanceId,
      agentSurfaceId: input.agentSurfaceId,
      viewId: input.viewId,
      draftId: draft.draftId,
      connectionId: this.input.createIdentity(),
    });
    const interaction = parseAgentDraftInteractionProjection({
      ...draft,
      bindingReceipt:
        draft.binding.kind === 'unbound'
          ? null
          : {
              bindingReceiptId: `binding:${connection.connectionId}`,
              draftId: draft.draftId,
              connectionId: connection.connectionId,
              binding: draft.binding,
            },
    });
    const catalog = await this.input.catalog.readCatalog(interaction);
    this.requireActive();
    const state: AgentLaunchState = {
      connection,
      interaction,
      attachmentCount: 1,
      models: [...catalog.models],
      configuration: catalog.configuration,
      inputs: [...catalog.inputs],
      workspaceMentionInputIds: new Set(),
    };
    this.connections.set(key, state);
    return state;
  }

  readCatalog(connection: AgentLaunchConnectionIdentity): AgentLaunchCatalogProjection {
    return project(this.requireConnection(connection));
  }

  async replaceBinding(
    connection: AgentLaunchConnectionIdentity,
    bindingValue: AgentDomainBinding,
  ): Promise<AgentLaunchCatalogProjection> {
    const state = this.requireConnection(connection);
    const binding = parseAgentDomainBinding(bindingValue);
    if (sameAgentDomainBinding(state.interaction.binding, binding)) return project(state);
    const interaction = parseAgentDraftInteractionProjection({
      phase: 'draft',
      draftId: state.interaction.draftId,
      binding,
      bindingReceipt:
        binding.kind === 'unbound'
          ? null
          : {
              bindingReceiptId: `binding:${state.connection.connectionId}:${this.input.createIdentity()}`,
              draftId: state.interaction.draftId,
              connectionId: state.connection.connectionId,
              binding,
            },
    });
    state.interaction = interaction;
    state.models = [];
    const previousConfiguration = state.configuration;
    state.inputs = [];
    state.workspaceMentionInputIds.clear();
    await this.input.authorization.releaseConnection(state.connection);
    this.requireConnection(connection);
    const catalog = await this.input.catalog.readCatalog(interaction);
    const current = this.requireConnection(connection);
    if (
      current.interaction.bindingReceipt?.bindingReceiptId !==
      interaction.bindingReceipt?.bindingReceiptId
    ) {
      throw new Error('Agent Draft target was replaced while its catalog was loading.');
    }
    state.models = [...catalog.models];
    state.configuration = rebaseDraftConfiguration(
      previousConfiguration,
      catalog.configuration,
      state.models,
    );
    state.inputs = [...catalog.inputs];
    return project(state);
  }

  async authorizeResource(
    connection: AgentLaunchConnectionIdentity,
    resourceKind: AgentLaunchResourceKind,
  ): Promise<AgentLaunchCatalogProjection | undefined> {
    const state = this.requireConnection(connection);
    const result = await this.input.authorization.authorize({
      connection: state.connection,
      interaction: state.interaction,
      resourceKind,
    });
    this.requireConnection(connection);
    if (result.status === 'cancelled') return undefined;
    const parsed = parseAgentLaunchCatalogProjection({
      ...project(state),
      inputs: [...state.inputs, result.entry],
    });
    state.inputs = parsed.inputs;
    return project(state);
  }

  updateConfiguration(
    connection: AgentLaunchConnectionIdentity,
    requestValue: AgentConfigurationRequest,
  ): AgentLaunchCatalogProjection {
    const state = this.requireConnection(connection);
    const request = parseAgentConfigurationRequest(requestValue);
    assertAgentConfigurationPolicyAllowsRequest(state.configuration, request);
    state.configuration = projectAgentConfigurationPolicy({
      models: state.models,
      request,
      source: 'draft-request',
      defaults: configurationDefaults(state.configuration),
      policies: configurationPolicies(state.configuration),
    });
    return project(state);
  }

  async searchWorkspaceMentions(
    connection: AgentLaunchConnectionIdentity,
    bindingReceiptId: string,
    filter: string,
  ): Promise<AgentDraftMentionSearchProjection> {
    const state = this.requireConnection(connection);
    const receipt = state.interaction.bindingReceipt;
    const binding = state.interaction.binding;
    if (binding.kind !== 'workspace' || !receipt || receipt.bindingReceiptId !== bindingReceiptId) {
      throw new Error(
        `Agent Draft mention search binding receipt '${bindingReceiptId}' is stale or not Workspace-bound.`,
      );
    }
    const result = await this.input.workspaceMentions.search({ binding, filter });
    const current = this.requireConnection(connection);
    if (
      current.interaction.binding.kind !== 'workspace' ||
      current.interaction.bindingReceipt?.bindingReceiptId !== bindingReceiptId
    ) {
      throw new Error(`Agent Draft mention search result for '${bindingReceiptId}' is stale.`);
    }
    if (result.filter !== filter) {
      throw new Error('Agent Draft mention search result filter does not match its request.');
    }
    const fileResults = result.files.map((file) => {
      const entry = createWorkspaceMentionEntry({
        binding,
        bindingReceiptId,
        identity: JSON.stringify(file.locator),
        name: file.name,
        description: file.locator.path,
      });
      return {
        entry,
        projection: { ...file, referenceReceipt: referenceReceipt(entry, bindingReceiptId) },
      };
    });
    const extraResults = result.mentionExtras.map((extra) => {
      if (
        extra.navigationData?.['workspaceId'] !== undefined &&
        extra.navigationData['workspaceId'] !== binding.workspaceId
      ) {
        throw new Error(`Agent Workspace mention '${extra.id}' belongs to another Workspace.`);
      }
      const entry = createWorkspaceMentionEntry({
        binding,
        bindingReceiptId,
        identity: `${extra.type}:${extra.id}`,
        name: extra.label,
        description: extra.summary,
      });
      return {
        entry,
        projection: { ...extra, referenceReceipt: referenceReceipt(entry, bindingReceiptId) },
      };
    });
    const files = fileResults.map((item) => item.projection);
    const mentionExtras = extraResults.map((item) => item.projection);
    const dynamicEntries = [...fileResults, ...extraResults].map((item) => item.entry);
    const dynamicIds = new Set(dynamicEntries.map((entry) => entry.id));
    current.inputs = [
      ...current.inputs.filter((entry) => !dynamicIds.has(entry.id)),
      ...dynamicEntries,
    ];
    for (const entry of dynamicEntries) current.workspaceMentionInputIds.add(entry.id);
    return parseAgentDraftMentionSearchProjection({
      bindingReceiptId,
      filter,
      files,
      mentionExtras,
    });
  }

  validateDraftSubmit(
    connection: AgentLaunchConnectionIdentity,
    inputValue: AgentDraftSubmitInput,
  ): AgentConfigurationPolicyProjection {
    const state = this.requireConnection(connection);
    const input = parseAgentDraftSubmitInput(inputValue);
    if (
      input.draft.draftId !== state.interaction.draftId ||
      !sameAgentDomainBinding(input.draft.binding, state.interaction.binding) ||
      input.draft.bindingReceipt?.bindingReceiptId !==
        state.interaction.bindingReceipt?.bindingReceiptId
    ) {
      throw new Error('Agent Draft submit does not match its exact launch binding receipt.');
    }
    if (JSON.stringify(input.configuration) !== JSON.stringify(state.configuration.request)) {
      throw new Error('Agent Draft submit configuration is stale for its exact Draft.');
    }
    assertExecutableConfiguration(state.configuration);
    const model = state.models.find(
      (entry) => entry.id === input.configuration.modelCatalogEntryId,
    );
    if (
      !model ||
      model.availability.status !== 'available' ||
      model.providerId !== input.configuration.providerId ||
      model.modelId !== input.configuration.modelId
    ) {
      throw new Error(
        `Agent Draft model '${input.configuration.modelCatalogEntryId}' is stale or unavailable.`,
      );
    }
    if (input.input.kind !== 'message') {
      const intent = input.input;
      const entry = state.inputs.find((candidate) => candidate.id === intent.catalogEntryId);
      const executableMatches =
        intent.kind === 'command'
          ? entry?.trigger === 'command' &&
            entry.executable.commandId === intent.commandId &&
            entry.executable.handlerId === intent.handlerId
          : entry?.trigger === 'skill' &&
            entry.executable.skillName === intent.skillName &&
            entry.executable.activationId === intent.activationId;
      if (
        !entry ||
        !executableMatches ||
        !isAgentInputCatalogEntryExecutable({
          entry,
          phase: 'draft',
          bindingKind: state.interaction.binding.kind,
        })
      ) {
        throw new Error(
          `Agent Draft ${intent.kind} catalog entry '${intent.catalogEntryId}' is stale or unavailable.`,
        );
      }
    }
    for (const receipt of input.references) {
      const entry = state.inputs.find((candidate) => candidate.id === receipt.catalogEntryId);
      if (
        entry?.trigger !== 'mention' ||
        entry.executable.referenceId !== receipt.referenceId ||
        entry.executable.ownerKind !== receipt.ownerKind ||
        entry.executable.ownerId !== receipt.ownerId ||
        receipt.bindingReceiptId !== state.interaction.bindingReceipt?.bindingReceiptId
      ) {
        throw new Error(`Agent Draft reference '${receipt.referenceId}' is stale or cross-owner.`);
      }
    }
    return state.configuration;
  }

  async detach(connection: AgentLaunchConnectionIdentity): Promise<void> {
    this.requireActive();
    const parsed = parseAgentLaunchConnectionIdentity(connection);
    const state = this.connections.get(
      ownerKey(parsed.windowId, parsed.workbenchInstanceId, parsed.agentSurfaceId),
    );
    if (!state || !sameConnection(state.connection, parsed)) {
      if (this.releasedConnectionIds.has(parsed.connectionId)) return;
      throw new Error(`Stale Agent launch connection '${parsed.connectionId}'.`);
    }
    if (state.attachmentCount > 1) {
      state.attachmentCount -= 1;
      return;
    }
    await this.release(
      ownerKey(
        state.connection.windowId,
        state.connection.workbenchInstanceId,
        state.connection.agentSurfaceId,
      ),
      state,
    );
  }

  async detachWindow(windowId: string): Promise<void> {
    this.requireActive();
    const ownerPrefix = `${windowId}\u0000`;
    await Promise.allSettled(
      [...this.pendingAttachments.entries()]
        .filter(([key]) => key.startsWith(ownerPrefix))
        .map(([, operation]) => operation),
    );
    this.requireActive();
    const matches = [...this.connections.entries()].filter(
      ([, state]) => state.connection.windowId === windowId,
    );
    const results = await Promise.allSettled(
      matches.map(([key, state]) => this.release(key, state)),
    );
    throwAggregate(results, `Failed to detach Agent launch Window '${windowId}'.`);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await Promise.allSettled(this.pendingAttachments.values());
    const entries = [...this.connections.entries()];
    const results = await Promise.allSettled(
      entries.map(([key, state]) => this.release(key, state)),
    );
    this.releasedConnectionIds.clear();
    throwAggregate(results, 'Failed to dispose Agent launch connections.');
  }

  private requireConnection(connectionValue: AgentLaunchConnectionIdentity): AgentLaunchState {
    this.requireActive();
    const connection = parseAgentLaunchConnectionIdentity(connectionValue);
    const state = this.connections.get(
      ownerKey(connection.windowId, connection.workbenchInstanceId, connection.agentSurfaceId),
    );
    if (!state || !sameConnection(state.connection, connection)) {
      throw new Error(`Stale Agent launch connection '${connection.connectionId}'.`);
    }
    return state;
  }

  private async release(key: string, state: AgentLaunchState): Promise<void> {
    if (this.connections.get(key) === state) this.connections.delete(key);
    this.releasedConnectionIds.add(state.connection.connectionId);
    await this.input.authorization.releaseConnection(state.connection);
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Agent launch application service is disposed.');
  }
}

function project(state: AgentLaunchState): AgentLaunchCatalogProjection {
  return parseAgentLaunchCatalogProjection({
    connection: state.connection,
    interaction: state.interaction,
    models: state.models,
    configuration: state.configuration,
    inputs: state.inputs,
  });
}

export function projectAgentConfigurationPolicy(input: {
  readonly models: readonly AgentModelCatalogEntry[];
  readonly request: AgentConfigurationRequest | null;
  readonly source: 'global-default' | 'draft-request' | 'conversation';
  readonly defaults: {
    readonly executionMode: 'plan' | 'ask' | 'auto';
    readonly temperature: number;
    readonly maximumOutputTokens: number;
    readonly thinkingBudget: number;
  };
  readonly policies?: Partial<
    Readonly<
      Record<
        'model' | 'executionMode' | 'temperature' | 'maximumOutputTokens' | 'thinkingBudget',
        AgentConfigurationFieldPolicy
      >
    >
  >;
}): AgentConfigurationPolicyProjection {
  const request = input.request === null ? null : parseAgentConfigurationRequest(input.request);
  const model =
    request === null
      ? undefined
      : input.models.find(
          (candidate) =>
            candidate.id === request.modelCatalogEntryId &&
            candidate.providerId === request.providerId &&
            candidate.modelId === request.modelId,
        );
  const modelDiagnostic =
    request === null
      ? 'Choose an exact configured Agent model.'
      : model === undefined
        ? `Agent model '${request.modelCatalogEntryId}' is stale.`
        : model.availability.status === 'unavailable'
          ? model.availability.diagnostic.message
          : undefined;
  const outputDiagnostic =
    request !== null &&
    model !== undefined &&
    model.maximumOutputTokens !== null &&
    request.maximumOutputTokens !== undefined &&
    request.maximumOutputTokens > model.maximumOutputTokens
      ? `Maximum output tokens exceed model '${model.id}' limit ${model.maximumOutputTokens}.`
      : undefined;
  const editable = (
    field: keyof NonNullable<typeof input.policies>,
  ): AgentConfigurationFieldPolicy =>
    input.policies?.[field] ?? { status: 'editable', owner: 'agent-config' };
  const source = (field: keyof NonNullable<typeof input.policies>) =>
    input.policies?.[field] ? 'domain-policy' : input.source;
  return parseAgentConfigurationPolicyProjection({
    request,
    fields: {
      model: {
        effectiveValue:
          modelDiagnostic === undefined && request !== null
            ? {
                modelCatalogEntryId: request.modelCatalogEntryId,
                providerId: request.providerId,
                modelId: request.modelId,
              }
            : null,
        source: source('model'),
        policy:
          modelDiagnostic === undefined
            ? editable('model')
            : { status: 'unavailable', owner: 'agent-config', reason: modelDiagnostic },
      },
      executionMode: {
        effectiveValue: request?.executionMode ?? input.defaults.executionMode,
        source: source('executionMode'),
        policy: editable('executionMode'),
      },
      temperature: {
        effectiveValue: request?.temperature ?? input.defaults.temperature,
        source: source('temperature'),
        policy: editable('temperature'),
      },
      maximumOutputTokens: {
        effectiveValue:
          outputDiagnostic === undefined
            ? (request?.maximumOutputTokens ?? input.defaults.maximumOutputTokens)
            : null,
        source: source('maximumOutputTokens'),
        policy:
          outputDiagnostic === undefined
            ? editable('maximumOutputTokens')
            : { status: 'unavailable', owner: 'agent-config', reason: outputDiagnostic },
      },
      thinkingBudget: {
        effectiveValue: request?.thinkingBudget ?? input.defaults.thinkingBudget,
        source: source('thinkingBudget'),
        policy: editable('thinkingBudget'),
      },
    },
  });
}

function rebaseDraftConfiguration(
  current: AgentConfigurationPolicyProjection,
  next: AgentConfigurationPolicyProjection,
  models: readonly AgentModelCatalogEntry[],
): AgentConfigurationPolicyProjection {
  if (!current.request) return next;
  const nextRequest = next.request;
  const currentModelAvailable = models.some(
    (model) =>
      model.id === current.request?.modelCatalogEntryId &&
      model.providerId === current.request.providerId &&
      model.modelId === current.request.modelId &&
      model.availability.status === 'available',
  );
  if (!currentModelAvailable && !nextRequest) return next;
  const request = parseAgentConfigurationRequest({
    ...(currentModelAvailable
      ? {
          modelCatalogEntryId: current.request.modelCatalogEntryId,
          providerId: current.request.providerId,
          modelId: current.request.modelId,
        }
      : {
          modelCatalogEntryId: nextRequest!.modelCatalogEntryId,
          providerId: nextRequest!.providerId,
          modelId: nextRequest!.modelId,
        }),
    executionMode:
      next.fields.executionMode.policy.status === 'editable'
        ? current.request.executionMode
        : nextRequest!.executionMode,
    ...(next.fields.temperature.policy.status === 'editable' &&
    current.request.temperature !== undefined
      ? { temperature: current.request.temperature }
      : nextRequest?.temperature === undefined
        ? {}
        : { temperature: nextRequest.temperature }),
    ...(next.fields.maximumOutputTokens.policy.status === 'editable' &&
    current.request.maximumOutputTokens !== undefined
      ? { maximumOutputTokens: current.request.maximumOutputTokens }
      : nextRequest?.maximumOutputTokens === undefined
        ? {}
        : { maximumOutputTokens: nextRequest.maximumOutputTokens }),
    ...(next.fields.thinkingBudget.policy.status === 'editable' &&
    current.request.thinkingBudget !== undefined
      ? { thinkingBudget: current.request.thinkingBudget }
      : nextRequest?.thinkingBudget === undefined
        ? {}
        : { thinkingBudget: nextRequest.thinkingBudget }),
  });
  return projectAgentConfigurationPolicy({
    models,
    request,
    source: 'draft-request',
    defaults: configurationDefaults(next),
    policies: configurationPolicies(next),
  });
}

export function assertAgentConfigurationPolicyAllowsRequest(
  current: AgentConfigurationPolicyProjection,
  request: AgentConfigurationRequest,
): void {
  const comparisons = [
    [
      'model',
      request.modelCatalogEntryId,
      current.fields.model.effectiveValue?.modelCatalogEntryId,
    ],
    ['executionMode', request.executionMode, current.fields.executionMode.effectiveValue],
    ['temperature', request.temperature, current.fields.temperature.effectiveValue],
    [
      'maximumOutputTokens',
      request.maximumOutputTokens,
      current.fields.maximumOutputTokens.effectiveValue,
    ],
    ['thinkingBudget', request.thinkingBudget, current.fields.thinkingBudget.effectiveValue],
  ] as const;
  for (const [field, requested, effective] of comparisons) {
    const policy = current.fields[field].policy;
    if (policy.status !== 'editable' && requested !== effective) {
      throw new Error(
        `Agent configuration field '${field}' is ${policy.status} by '${policy.owner}'.`,
      );
    }
  }
}

function assertExecutableConfiguration(projection: AgentConfigurationPolicyProjection): void {
  if (!projection.request) throw new Error('Agent Draft has no exact configuration request.');
  for (const [field, value] of Object.entries(projection.fields)) {
    if (value.policy.status === 'unavailable') {
      throw new Error(
        `Agent Draft configuration field '${field}' is unavailable: ${value.policy.reason}`,
      );
    }
  }
}

function configurationDefaults(projection: AgentConfigurationPolicyProjection) {
  return {
    executionMode: projection.fields.executionMode.effectiveValue ?? 'ask',
    temperature: projection.fields.temperature.effectiveValue ?? 0.7,
    maximumOutputTokens: projection.fields.maximumOutputTokens.effectiveValue ?? 8192,
    thinkingBudget: projection.fields.thinkingBudget.effectiveValue ?? 0,
  };
}

function configurationPolicies(projection: AgentConfigurationPolicyProjection) {
  return {
    model: projection.fields.model.policy,
    executionMode: projection.fields.executionMode.policy,
    temperature: projection.fields.temperature.policy,
    maximumOutputTokens: projection.fields.maximumOutputTokens.policy,
    thinkingBudget: projection.fields.thinkingBudget.policy,
  };
}

function sameAttachIdentity(
  state: AgentLaunchState,
  input: AgentLaunchAttachInput,
  draft: AgentDraftInteractionProjection,
): boolean {
  return (
    state.connection.applicationInstanceId === input.applicationInstanceId &&
    state.connection.windowId === input.windowId &&
    state.connection.workbenchInstanceId === input.workbenchInstanceId &&
    state.connection.agentSurfaceId === input.agentSurfaceId &&
    state.connection.viewId === input.viewId &&
    state.connection.draftId === draft.draftId &&
    sameAgentDomainBinding(state.interaction.binding, draft.binding)
  );
}

function sameConnection(
  left: AgentLaunchConnectionIdentity,
  right: AgentLaunchConnectionIdentity,
): boolean {
  return (
    left.applicationInstanceId === right.applicationInstanceId &&
    left.windowId === right.windowId &&
    left.workbenchInstanceId === right.workbenchInstanceId &&
    left.agentSurfaceId === right.agentSurfaceId &&
    left.viewId === right.viewId &&
    left.draftId === right.draftId &&
    left.connectionId === right.connectionId
  );
}

function projectSkillSource(input: {
  readonly source:
    | { readonly kind: 'builtin' | 'personal' | 'project' }
    | { readonly kind: 'plugin'; readonly pluginId: string };
  readonly sourceId: string;
  readonly binding: AgentDomainBinding;
  readonly personalSkillOwnerId: string;
}): AgentInputSourceReceipt {
  switch (input.source.kind) {
    case 'builtin':
      return { kind: 'builtin', sourceId: input.sourceId };
    case 'personal':
      return {
        kind: 'personal',
        ownerId: input.personalSkillOwnerId,
        sourceId: input.sourceId,
      };
    case 'plugin':
      return { kind: 'plugin', pluginId: input.source.pluginId, sourceId: input.sourceId };
    case 'project':
      if (input.binding.kind !== 'workspace') {
        throw new Error('Project Skill source requires an exact Workspace binding.');
      }
      return {
        kind: 'project',
        workspaceId: input.binding.workspaceId,
        sourceId: input.sourceId,
      };
  }
}

function projectCommandArtifactSource(input: {
  readonly artifact: AgentSkillCatalog['records'][number];
  readonly entryPoint: Extract<
    AgentSkillCatalog['records'][number]['entryPoint'],
    { kind: 'command-artifact' }
  >;
  readonly binding: AgentDomainBinding;
  readonly personalSkillOwnerId: string;
}): AgentInputSourceReceipt {
  if (input.artifact.source.kind === 'project') {
    if (input.binding.kind !== 'workspace') {
      throw new Error('Project command artifact source requires an exact Workspace binding.');
    }
    return {
      kind: 'command-artifact',
      workspaceId: input.binding.workspaceId,
      artifactId: input.entryPoint.artifactId,
    };
  }
  return projectSkillSource({
    source: input.artifact.source,
    sourceId: input.entryPoint.artifactId,
    binding: input.binding,
    personalSkillOwnerId: input.personalSkillOwnerId,
  });
}

function createWorkspaceMentionEntry(input: {
  readonly binding: Extract<AgentDomainBinding, { readonly kind: 'workspace' }>;
  readonly bindingReceiptId: string;
  readonly identity: string;
  readonly name: string;
  readonly description: string;
}): AgentMentionCatalogEntry {
  const referenceId = `workspace-reference:${input.binding.workspaceId}:${input.bindingReceiptId}:${encodeURIComponent(input.identity)}`;
  return {
    id: `mention:${referenceId}`,
    name: input.name,
    description: input.description,
    trigger: 'mention',
    prefix: '@',
    phaseRequirement: 'draft',
    bindingRequirement: 'workspace',
    source: {
      kind: 'project',
      workspaceId: input.binding.workspaceId,
      sourceId: referenceId,
    },
    availability: { status: 'available' },
    executable: {
      kind: 'reference',
      referenceId,
      ownerKind: 'workspace',
      ownerId: input.binding.workspaceId,
    },
  };
}

function referenceReceipt(
  entry: AgentMentionCatalogEntry,
  bindingReceiptId: string,
): AgentInputReferenceReceipt {
  return {
    catalogEntryId: entry.id,
    referenceId: entry.executable.referenceId,
    ownerKind: entry.executable.ownerKind,
    ownerId: entry.executable.ownerId,
    bindingReceiptId,
  };
}

function ownerKey(windowId: string, workbenchInstanceId: string, agentSurfaceId: string): string {
  return `${windowId}\u0000${workbenchInstanceId}\u0000${agentSurfaceId}`;
}

function throwAggregate(results: readonly PromiseSettledResult<void>[], message: string): void {
  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  if (errors.length > 0) throw new AggregateError(errors, message);
}
