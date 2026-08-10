import {
  parseAgentBoundDomainBinding,
  parseAgentConfigurationPolicyProjection,
  parseAgentConfigurationRequest,
  parseAgentConversationConfiguration,
  parseAgentConversationTurnConfigurationSnapshot,
  parseAgentDraftInputIntent,
  parseAgentFlatPurposeModelRefs,
  parseAgentInputReferenceReceipt,
  parseMessageContextReference,
  parseAgentScratchArtifactRef,
  type AgentBoundDomainBinding,
  type AgentConfigurationPolicyProjection,
  type AgentConfigurationRequest,
  type AgentConversationConfiguration,
  type AgentConversationTurnConfigurationSnapshot,
  type AgentScratchArtifactRef,
  type AgentContextPayload,
  type AgentDraftInputIntent,
  type AgentFlatPurposeModelRefs,
  type AgentInputReferenceReceipt,
  type Message,
  type MessageContextReference,
} from '@neko/agent-contracts';
import { LocalMetadataError } from '@neko/local-metadata';

export type AgentPendingTurnStatus = 'pending' | 'running' | 'completed' | 'failed';

export class AgentConversationLifecycleUnavailableError extends Error {
  readonly code = 'agent-conversation-lifecycle-unavailable';
  override readonly cause: unknown;

  constructor(
    readonly conversationId: string,
    readonly fieldNames: readonly string[],
    cause: unknown,
  ) {
    super(`Agent Conversation '${conversationId}' stored lifecycle is unavailable.`);
    this.name = 'AgentConversationLifecycleUnavailableError';
    this.cause = cause;
  }
}

export interface AgentConversationLifecycleRecord {
  readonly conversationId: string;
  readonly context: AgentBoundDomainBinding;
  readonly createdAt: string;
  readonly initialInput: {
    readonly messageId: string;
    readonly intent: AgentDraftInputIntent;
    readonly references: readonly AgentInputReferenceReceipt[];
    readonly contextReferences: readonly MessageContextReference[];
    readonly resourceGrantIds: readonly string[];
    readonly purposeModels?: AgentFlatPurposeModelRefs;
  };
  readonly configuration: AgentConversationConfiguration;
  readonly pendingTurn: {
    readonly requestId: string;
    readonly turnId: string;
    readonly status: AgentPendingTurnStatus;
    readonly configuration: AgentConversationTurnConfigurationSnapshot;
    readonly diagnostic?: string;
  };
  readonly scratchArtifacts: readonly AgentScratchArtifactRef[];
}

export interface AgentFirstSubmitInput {
  readonly requestId: string;
  readonly context: AgentBoundDomainBinding;
  readonly input: AgentDraftInputIntent;
  readonly references: readonly AgentInputReferenceReceipt[];
  readonly contextReferences: readonly MessageContextReference[];
  readonly resourceGrantIds: readonly string[];
  readonly purposeModels?: AgentFlatPurposeModelRefs;
  readonly configuration: {
    readonly request: AgentConfigurationRequest;
    readonly projection: AgentConfigurationPolicyProjection;
  };
}

export function projectAgentConversationInitialMessage(
  record: AgentConversationLifecycleRecord,
): Message {
  const timestamp = Date.parse(record.createdAt);
  if (!Number.isFinite(timestamp)) {
    throw new Error(
      `Agent Conversation '${record.conversationId}' has an invalid creation timestamp.`,
    );
  }
  return {
    id: record.initialInput.messageId,
    role: 'user',
    content: projectAgentDraftInputText(record.initialInput.intent),
    timestamp,
    ...(record.initialInput.contextReferences.length === 0
      ? {}
      : {
          contextReferences: record.initialInput.contextReferences.map((reference) => ({
            ...reference,
          })),
        }),
  };
}

export interface AgentConversationLifecycleRepositoryPort {
  commitFirstSubmit(
    record: AgentConversationLifecycleRecord,
  ): Promise<{ readonly record: AgentConversationLifecycleRecord; readonly created: boolean }>;
  claimProviderExecution(turnId: string): Promise<boolean>;
  updatePendingTurn(
    conversationId: string,
    turn: AgentConversationLifecycleRecord['pendingTurn'],
  ): Promise<AgentConversationLifecycleRecord>;
  updateConfiguration(
    conversationId: string,
    configuration: AgentConversationConfiguration,
  ): Promise<AgentConversationLifecycleRecord>;
  readConversation(conversationId: string): Promise<AgentConversationLifecycleRecord | undefined>;
  readFirstSubmitByRequest(
    requestId: string,
  ): Promise<AgentConversationLifecycleRecord | undefined>;
  readConversationContext(conversationId: string): Promise<AgentBoundDomainBinding | undefined>;
  addScratchArtifact(
    conversationId: string,
    artifact: AgentScratchArtifactRef,
  ): Promise<AgentConversationLifecycleRecord>;
  updateScratchArtifact(
    conversationId: string,
    artifact: AgentScratchArtifactRef,
  ): Promise<AgentConversationLifecycleRecord>;
  removeScratchArtifact(
    conversationId: string,
    scratchArtifactId: string,
  ): Promise<AgentConversationLifecycleRecord>;
  deleteConversation(conversationId: string): Promise<void>;
}

export interface AgentResourceGrantValidationPort {
  validate(input: {
    readonly context: AgentBoundDomainBinding;
    readonly resourceGrantIds: readonly string[];
  }): Promise<void>;
  resolveForTurn(input: {
    readonly context: AgentBoundDomainBinding;
    readonly resourceGrantIds: readonly string[];
  }): Promise<readonly AgentContextPayload[]>;
}

export interface AgentDomainContextResolutionPort {
  resolveForTurn(input: {
    readonly conversationId: string;
    readonly context: AgentBoundDomainBinding;
    readonly references: readonly AgentInputReferenceReceipt[];
  }): Promise<readonly AgentContextPayload[]>;
}

export interface AgentScratchHostPort {
  create(ref: AgentScratchArtifactRef): Promise<void>;
  release(ref: AgentScratchArtifactRef): Promise<void>;
  authorizePreview(ref: AgentScratchArtifactRef): Promise<{
    readonly previewSessionId: string;
    readonly descriptorId: string;
  }>;
}

export interface AgentScratchPublicationPort {
  publishToAssets(ref: AgentScratchArtifactRef): Promise<{ readonly assetId: string }>;
  publishToWorkspace(
    ref: AgentScratchArtifactRef,
    target: { readonly workspaceId: string; readonly workspaceGrantId: string },
  ): Promise<{ readonly documentId: string }>;
}

export interface AgentProviderExecutionPort {
  start(input: {
    readonly requestId: string;
    readonly turnId: string;
    readonly conversationId: string;
    readonly context: AgentBoundDomainBinding;
    readonly input: AgentDraftInputIntent;
    readonly resourceGrantIds: readonly string[];
    readonly contextPayloads: readonly AgentContextPayload[];
    readonly configuration: AgentConversationTurnConfigurationSnapshot;
    readonly purposeModels?: AgentFlatPurposeModelRefs;
  }): Promise<void>;
}

export interface AgentConversationSessionMaterializationPort {
  materialize(input: {
    readonly conversationId: string;
    readonly context: AgentBoundDomainBinding;
    readonly title: string;
  }): Promise<void>;
}

export interface AgentConversationLifecycleService {
  firstSubmit(input: AgentFirstSubmitInput): Promise<AgentConversationLifecycleRecord>;
  startProviderExecution(conversationId: string): Promise<AgentConversationLifecycleRecord>;
  waitForProviderIdle(): Promise<void>;
  readFirstSubmitRecord(
    conversationId: string,
  ): Promise<AgentConversationLifecycleRecord | undefined>;
  readConversation(conversationId: string): Promise<AgentConversationLifecycleRecord>;
  readFirstSubmitByRequest(
    requestId: string,
  ): Promise<AgentConversationLifecycleRecord | undefined>;
  readConversationContext(conversationId: string): Promise<AgentBoundDomainBinding>;
  readConversationConfiguration(conversationId: string): Promise<AgentConversationConfiguration>;
  updateConfiguration(input: {
    readonly conversationId: string;
    readonly request: AgentConfigurationRequest;
    readonly projection: AgentConfigurationPolicyProjection;
  }): Promise<AgentConversationConfiguration>;
  createScratch(input: {
    readonly conversationId: string;
    readonly label: string;
    readonly mediaType?: string;
  }): Promise<AgentScratchArtifactRef>;
  authorizeScratchPreview(input: {
    readonly conversationId: string;
    readonly scratchArtifactId: string;
  }): Promise<{ readonly previewSessionId: string; readonly descriptorId: string }>;
  publishScratch(input: {
    readonly conversationId: string;
    readonly scratchArtifactId: string;
    readonly target:
      | { readonly kind: 'assets' }
      | {
          readonly kind: 'workspace';
          readonly workspaceId: string;
          readonly workspaceGrantId: string;
        };
    readonly cleanupAfterPublish?: boolean;
  }): Promise<
    | { readonly kind: 'asset'; readonly assetId: string }
    | { readonly kind: 'workspace'; readonly documentId: string }
  >;
  cleanupScratch(input: {
    readonly conversationId: string;
    readonly scratchArtifactId: string;
    readonly reason: 'explicit-command';
  }): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
}

export function createAgentConversationLifecycleService(options: {
  readonly repository: AgentConversationLifecycleRepositoryPort;
  readonly grants: AgentResourceGrantValidationPort;
  readonly domainContext: AgentDomainContextResolutionPort;
  readonly scratch: AgentScratchHostPort;
  readonly publication: AgentScratchPublicationPort;
  readonly session: AgentConversationSessionMaterializationPort;
  readonly provider: AgentProviderExecutionPort;
  readonly reportError: (error: Error) => void;
  readonly createIdentity: () => string;
  readonly now: () => string;
}): AgentConversationLifecycleService {
  const providerExecutions = new Set<Promise<void>>();
  const trackProviderExecution = (operation: Promise<void>): void => {
    providerExecutions.add(operation);
    void operation.then(
      () => providerExecutions.delete(operation),
      (error: unknown) => {
        providerExecutions.delete(operation);
        options.reportError(toError(error));
      },
    );
  };
  const firstSubmit = async (
    input: AgentFirstSubmitInput,
  ): Promise<AgentConversationLifecycleRecord> => {
    const requestId = requireIdentity(input.requestId, 'Agent first-submit request');
    const context = parseAgentBoundDomainBinding(input.context);
    const inputIntent = parseAgentDraftInputIntent(input.input);
    const references = input.references.map(parseAgentInputReferenceReceipt);
    const contextReferences = input.contextReferences.map(parseMessageContextReference);
    const resourceGrantIds = requireUniqueIdentities(
      input.resourceGrantIds,
      'Agent first-submit Resource grants',
    );
    const purposeModels =
      input.purposeModels === undefined
        ? undefined
        : parseAgentFlatPurposeModelRefs(input.purposeModels);
    await options.grants.validate({ context, resourceGrantIds });
    const configurationRequest = parseAgentConfigurationRequest(input.configuration.request);
    const configurationProjection = parseAgentConfigurationPolicyProjection(
      input.configuration.projection,
    );
    if (JSON.stringify(configurationProjection.request) !== JSON.stringify(configurationRequest)) {
      throw new Error('Agent first-submit configuration projection does not match its request.');
    }
    const existing = await options.repository.readFirstSubmitByRequest(requestId);
    if (existing) {
      assertSameFirstSubmit(existing, {
        context,
        input: inputIntent,
        references,
        contextReferences,
        resourceGrantIds,
        ...(purposeModels === undefined ? {} : { purposeModels }),
        configuration: {
          conversationId: existing.conversationId,
          request: configurationRequest,
          projection: configurationProjection,
        },
      });
      await options.session.materialize({
        conversationId: existing.conversationId,
        context: existing.context,
        title: projectAgentConversationTitle(existing.initialInput.intent),
      });
      return existing;
    }
    const conversationId = `conversation:${options.createIdentity()}`;
    const turnId = `turn:${options.createIdentity()}`;
    const configuration = parseAgentConversationConfiguration({
      conversationId,
      request: configurationRequest,
      projection: configurationProjection,
    });
    const turnConfiguration = parseAgentConversationTurnConfigurationSnapshot({
      conversationId,
      turnId,
      request: configurationRequest,
      projection: configurationProjection,
    });
    const record: AgentConversationLifecycleRecord = {
      conversationId,
      context,
      createdAt: options.now(),
      initialInput: {
        messageId: `message:${options.createIdentity()}`,
        intent: inputIntent,
        references,
        contextReferences,
        resourceGrantIds,
        ...(purposeModels === undefined ? {} : { purposeModels }),
      },
      configuration,
      pendingTurn: { requestId, turnId, status: 'pending', configuration: turnConfiguration },
      scratchArtifacts: [],
    };
    const committed = await options.repository.commitFirstSubmit(record);
    const exact = committed.record;
    if (exact.pendingTurn.requestId !== requestId) {
      throw new Error(
        `Agent first-submit request '${requestId}' conflicts with committed request '${exact.pendingTurn.requestId}'.`,
      );
    }
    assertSameFirstSubmit(exact, {
      context,
      input: inputIntent,
      references,
      contextReferences,
      resourceGrantIds,
      ...(purposeModels === undefined ? {} : { purposeModels }),
      configuration,
    });
    await options.session.materialize({
      conversationId: exact.conversationId,
      context: exact.context,
      title: projectAgentConversationTitle(exact.initialInput.intent),
    });
    return exact;
  };

  const startProviderExecution = async (
    conversationIdValue: string,
  ): Promise<AgentConversationLifecycleRecord> => {
    const conversationId = requireIdentity(conversationIdValue, 'Agent Conversation');
    const exact = await options.repository.readConversation(conversationId);
    if (!exact) throw new Error(`Agent Conversation '${conversationId}' is not present.`);
    if (exact.pendingTurn.status !== 'pending') return exact;
    if (!(await options.repository.claimProviderExecution(exact.pendingTurn.turnId))) {
      const claimed = await options.repository.readConversation(conversationId);
      if (!claimed) throw new Error(`Agent Conversation '${conversationId}' is not present.`);
      return claimed;
    }
    const running = await options.repository.updatePendingTurn(conversationId, {
      ...exact.pendingTurn,
      status: 'running',
    });
    const execution = (async () => {
      const [domainContextPayloads, resourceContextPayloads] = await Promise.all([
        options.domainContext.resolveForTurn({
          conversationId: exact.conversationId,
          context: exact.context,
          references: exact.initialInput.references,
        }),
        options.grants.resolveForTurn({
          context: exact.context,
          resourceGrantIds: exact.initialInput.resourceGrantIds,
        }),
      ]);
      await options.provider.start({
        requestId: exact.pendingTurn.requestId,
        turnId: exact.pendingTurn.turnId,
        conversationId: exact.conversationId,
        context: exact.context,
        input: exact.initialInput.intent,
        resourceGrantIds: exact.initialInput.resourceGrantIds,
        ...(exact.initialInput.purposeModels === undefined
          ? {}
          : { purposeModels: exact.initialInput.purposeModels }),
        contextPayloads: [...domainContextPayloads, ...resourceContextPayloads],
        configuration: exact.pendingTurn.configuration,
      });
      await options.repository.updatePendingTurn(exact.conversationId, {
        ...exact.pendingTurn,
        status: 'completed',
      });
    })().catch(async (error: unknown) => {
      await options.repository.updatePendingTurn(conversationId, {
        ...exact.pendingTurn,
        status: 'failed',
        diagnostic: describeError(error),
      });
    });
    trackProviderExecution(execution);
    return running;
  };

  const readFirstSubmitRecord = async (
    conversationIdValue: string,
  ): Promise<AgentConversationLifecycleRecord | undefined> => {
    const conversationId = requireIdentity(conversationIdValue, 'Agent Conversation');
    try {
      return await options.repository.readConversation(conversationId);
    } catch (error) {
      if (isLocalMetadataDecodeFailure(error, 'decode-agent-conversation-lifecycle')) {
        throw new AgentConversationLifecycleUnavailableError(conversationId, ['lifecycle'], error);
      }
      throw error;
    }
  };

  const readConversation = async (
    conversationId: string,
  ): Promise<AgentConversationLifecycleRecord> => {
    const record = await readFirstSubmitRecord(conversationId);
    if (!record) throw new Error(`Agent Conversation '${conversationId}' is not present.`);
    return record;
  };

  const readConversationContext = async (
    conversationIdValue: string,
  ): Promise<AgentBoundDomainBinding> => {
    const conversationId = requireIdentity(conversationIdValue, 'Agent Conversation');
    let stored: AgentBoundDomainBinding | undefined;
    try {
      stored = await options.repository.readConversationContext(conversationId);
    } catch (error) {
      if (isLocalMetadataDecodeFailure(error, 'decode-agent-conversation-context')) {
        throw new AgentConversationLifecycleUnavailableError(conversationId, ['context'], error);
      }
      throw error;
    }
    if (stored) return stored;
    throw new AgentConversationLifecycleUnavailableError(
      conversationId,
      ['context'],
      new Error(`Agent Conversation '${conversationId}' context is not present.`),
    );
  };

  const readConversationConfiguration = async (
    conversationIdValue: string,
  ): Promise<AgentConversationConfiguration> => {
    const record = await readConversation(
      requireIdentity(conversationIdValue, 'Agent Conversation'),
    );
    return parseAgentConversationConfiguration(record.configuration);
  };

  const requireScratch = async (
    conversationId: string,
    scratchArtifactId: string,
  ): Promise<AgentScratchArtifactRef> => {
    const record = await readConversation(conversationId);
    const artifact = record.scratchArtifacts.find(
      (candidate) => candidate.scratchArtifactId === scratchArtifactId,
    );
    if (!artifact) {
      throw new Error(
        `Agent Scratch artifact '${scratchArtifactId}' is not owned by Conversation '${conversationId}'.`,
      );
    }
    return artifact;
  };

  const releaseScratch = async (
    conversationId: string,
    artifact: AgentScratchArtifactRef,
  ): Promise<void> => {
    await options.scratch.release(artifact);
    await options.repository.removeScratchArtifact(conversationId, artifact.scratchArtifactId);
  };

  return {
    firstSubmit,
    startProviderExecution,
    async waitForProviderIdle() {
      while (providerExecutions.size > 0) {
        await Promise.all([...providerExecutions]);
      }
    },
    readFirstSubmitRecord,
    readConversation,
    readFirstSubmitByRequest: (requestId) =>
      options.repository.readFirstSubmitByRequest(
        requireIdentity(requestId, 'Agent first-submit request'),
      ),
    readConversationContext,
    readConversationConfiguration,
    async updateConfiguration(input) {
      const conversationId = requireIdentity(input.conversationId, 'Agent Conversation');
      const configuration = parseAgentConversationConfiguration({
        conversationId,
        request: input.request,
        projection: input.projection,
      });
      const updated = await options.repository.updateConfiguration(conversationId, configuration);
      return parseAgentConversationConfiguration(updated.configuration);
    },
    async createScratch(input) {
      const record = await readConversation(input.conversationId);
      if (record.context.kind !== 'assistant') {
        throw new Error('Agent Scratch artifacts require Assistant conversation scope.');
      }
      const artifact = parseAgentScratchArtifactRef({
        scratchArtifactId: `scratch:${options.createIdentity()}`,
        assistantSpaceId: record.context.assistantSpaceId,
        conversationId: record.conversationId,
        label: requireIdentity(input.label, 'Agent Scratch artifact label'),
        ...(input.mediaType === undefined ? {} : { mediaType: input.mediaType }),
        state: 'recoverable',
      });
      await options.repository.addScratchArtifact(record.conversationId, artifact);
      await options.scratch.create(artifact);
      return artifact;
    },
    async authorizeScratchPreview(input) {
      return options.scratch.authorizePreview(
        await requireScratch(input.conversationId, input.scratchArtifactId),
      );
    },
    async publishScratch(input) {
      const artifact = await requireScratch(input.conversationId, input.scratchArtifactId);
      const durable =
        input.target.kind === 'assets'
          ? {
              kind: 'asset' as const,
              ...(await options.publication.publishToAssets(artifact)),
            }
          : {
              kind: 'workspace' as const,
              ...(await options.publication.publishToWorkspace(artifact, input.target)),
            };
      const published = parseAgentScratchArtifactRef({ ...artifact, state: 'published' });
      await options.repository.updateScratchArtifact(input.conversationId, published);
      if (input.cleanupAfterPublish) await releaseScratch(input.conversationId, published);
      return durable;
    },
    async cleanupScratch(input) {
      if (input.reason !== 'explicit-command') {
        throw new Error(`Unknown Agent Scratch cleanup reason '${String(input.reason)}'.`);
      }
      await releaseScratch(
        input.conversationId,
        await requireScratch(input.conversationId, input.scratchArtifactId),
      );
    },
    async deleteConversation(conversationId) {
      const record = await readConversation(conversationId);
      for (const artifact of record.scratchArtifacts) {
        await options.scratch.release(artifact);
      }
      await options.repository.deleteConversation(record.conversationId);
    },
  };
}

function isLocalMetadataDecodeFailure(error: unknown, operation: string): boolean {
  return error instanceof LocalMetadataError && error.operation === operation;
}

export function createInMemoryAgentConversationLifecycleRepository(): AgentConversationLifecycleRepositoryPort {
  const recordsByConversation = new Map<string, AgentConversationLifecycleRecord>();
  const contextsByConversation = new Map<string, AgentBoundDomainBinding>();
  const conversationByRequest = new Map<string, string>();
  const claimedTurns = new Set<string>();
  return {
    async commitFirstSubmit(record) {
      const existingId = conversationByRequest.get(record.pendingTurn.requestId);
      if (existingId) {
        const existing = recordsByConversation.get(existingId);
        if (!existing) throw new Error('Agent first-submit request index is corrupt.');
        return { record: existing, created: false };
      }
      recordsByConversation.set(record.conversationId, cloneRecord(record));
      contextsByConversation.set(record.conversationId, cloneContext(record.context));
      conversationByRequest.set(record.pendingTurn.requestId, record.conversationId);
      return { record: cloneRecord(record), created: true };
    },
    async claimProviderExecution(turnId) {
      if (claimedTurns.has(turnId)) return false;
      claimedTurns.add(turnId);
      return true;
    },
    async updatePendingTurn(conversationId, pendingTurn) {
      const current = requireRecord(recordsByConversation, conversationId);
      const next = cloneRecord({ ...current, pendingTurn });
      recordsByConversation.set(conversationId, next);
      return cloneRecord(next);
    },
    async updateConfiguration(conversationId, configuration) {
      const current = requireRecord(recordsByConversation, conversationId);
      if (configuration.conversationId !== conversationId) {
        throw new Error('Agent Conversation configuration belongs to another Conversation.');
      }
      const next = cloneRecord({ ...current, configuration });
      recordsByConversation.set(conversationId, next);
      return cloneRecord(next);
    },
    async readConversation(conversationId) {
      const current = recordsByConversation.get(conversationId);
      return current ? cloneRecord(current) : undefined;
    },
    async readFirstSubmitByRequest(requestId) {
      const conversationId = conversationByRequest.get(requestId);
      if (!conversationId) return undefined;
      return cloneRecord(requireRecord(recordsByConversation, conversationId));
    },
    async readConversationContext(conversationId) {
      const context = contextsByConversation.get(conversationId);
      return context ? cloneContext(context) : undefined;
    },
    async addScratchArtifact(conversationId, artifact) {
      const current = requireRecord(recordsByConversation, conversationId);
      if (
        current.scratchArtifacts.some(
          (entry) => entry.scratchArtifactId === artifact.scratchArtifactId,
        )
      ) {
        throw new Error(`Agent Scratch artifact '${artifact.scratchArtifactId}' already exists.`);
      }
      const next = cloneRecord({
        ...current,
        scratchArtifacts: [...current.scratchArtifacts, artifact],
      });
      recordsByConversation.set(conversationId, next);
      return cloneRecord(next);
    },
    async updateScratchArtifact(conversationId, artifact) {
      const current = requireRecord(recordsByConversation, conversationId);
      if (
        !current.scratchArtifacts.some(
          (entry) => entry.scratchArtifactId === artifact.scratchArtifactId,
        )
      ) {
        throw new Error(`Agent Scratch artifact '${artifact.scratchArtifactId}' does not exist.`);
      }
      const next = cloneRecord({
        ...current,
        scratchArtifacts: current.scratchArtifacts.map((entry) =>
          entry.scratchArtifactId === artifact.scratchArtifactId ? artifact : entry,
        ),
      });
      recordsByConversation.set(conversationId, next);
      return cloneRecord(next);
    },
    async removeScratchArtifact(conversationId, scratchArtifactId) {
      const current = requireRecord(recordsByConversation, conversationId);
      const next = cloneRecord({
        ...current,
        scratchArtifacts: current.scratchArtifacts.filter(
          (entry) => entry.scratchArtifactId !== scratchArtifactId,
        ),
      });
      recordsByConversation.set(conversationId, next);
      return cloneRecord(next);
    },
    async deleteConversation(conversationId) {
      const current = requireRecord(recordsByConversation, conversationId);
      recordsByConversation.delete(conversationId);
      contextsByConversation.delete(conversationId);
      conversationByRequest.delete(current.pendingTurn.requestId);
      claimedTurns.delete(current.pendingTurn.turnId);
    },
  };
}

function cloneContext(context: AgentBoundDomainBinding): AgentBoundDomainBinding {
  return context.kind === 'assistant'
    ? { ...context, baseGrantIds: [...context.baseGrantIds] }
    : { ...context };
}

function requireRecord(
  records: ReadonlyMap<string, AgentConversationLifecycleRecord>,
  conversationId: string,
): AgentConversationLifecycleRecord {
  const current = records.get(conversationId);
  if (!current) throw new Error(`Agent Conversation '${conversationId}' is not present.`);
  return current;
}

function cloneRecord(record: AgentConversationLifecycleRecord): AgentConversationLifecycleRecord {
  return {
    ...record,
    context:
      record.context.kind === 'assistant'
        ? { ...record.context, baseGrantIds: [...record.context.baseGrantIds] }
        : { ...record.context },
    initialInput: {
      ...record.initialInput,
      intent: { ...record.initialInput.intent },
      references: record.initialInput.references.map((reference) => ({ ...reference })),
      contextReferences: record.initialInput.contextReferences.map((reference) => ({
        ...reference,
      })),
      resourceGrantIds: [...record.initialInput.resourceGrantIds],
      ...(record.initialInput.purposeModels === undefined
        ? {}
        : { purposeModels: structuredClone(record.initialInput.purposeModels) }),
    },
    configuration: structuredClone(record.configuration),
    pendingTurn: structuredClone(record.pendingTurn),
    scratchArtifacts: record.scratchArtifacts.map((artifact) => ({ ...artifact })),
  };
}

const AGENT_CONVERSATION_TITLE_MAX_LENGTH = 50;

export function projectAgentConversationTitle(input: AgentDraftInputIntent): string {
  const normalized = projectAgentDraftInputText(input).trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new Error('Agent Conversation title source must not be empty.');
  }
  const characters = Array.from(normalized);
  if (characters.length <= AGENT_CONVERSATION_TITLE_MAX_LENGTH) return normalized;

  let title = characters.slice(0, AGENT_CONVERSATION_TITLE_MAX_LENGTH).join('').trim();
  const lastSpace = title.lastIndexOf(' ');
  if (lastSpace > 20) title = title.slice(0, lastSpace);
  return `${title}...`;
}

export function projectAgentDraftInputText(input: AgentDraftInputIntent): string {
  switch (input.kind) {
    case 'message':
      return input.text;
    case 'command':
      return `/${input.commandId}${input.args ? ` ${input.args}` : ''}`;
    case 'skill':
      return `$${input.skillName}${input.args ? ` ${input.args}` : ''}`;
  }
}

function assertSameFirstSubmit(
  record: AgentConversationLifecycleRecord,
  input: {
    readonly context: AgentBoundDomainBinding;
    readonly input: AgentDraftInputIntent;
    readonly references: readonly AgentInputReferenceReceipt[];
    readonly contextReferences: readonly MessageContextReference[];
    readonly resourceGrantIds: readonly string[];
    readonly purposeModels?: AgentFlatPurposeModelRefs;
    readonly configuration: AgentConversationLifecycleRecord['configuration'];
  },
): void {
  if (
    JSON.stringify(record.context) !== JSON.stringify(input.context) ||
    JSON.stringify(record.initialInput.intent) !== JSON.stringify(input.input) ||
    JSON.stringify(record.initialInput.references) !== JSON.stringify(input.references) ||
    JSON.stringify(record.initialInput.contextReferences) !==
      JSON.stringify(input.contextReferences) ||
    JSON.stringify(record.initialInput.resourceGrantIds) !==
      JSON.stringify(input.resourceGrantIds) ||
    JSON.stringify(record.initialInput.purposeModels) !== JSON.stringify(input.purposeModels) ||
    JSON.stringify(record.configuration) !== JSON.stringify(input.configuration)
  ) {
    throw new Error(
      `Agent first-submit request '${record.pendingTurn.requestId}' conflicts with its committed input.`,
    );
  }
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} identity is required.`);
  return value;
}

function requireUniqueIdentities(value: readonly string[], label: string): readonly string[] {
  const identities = value.map((entry) => requireIdentity(entry, label));
  if (new Set(identities).size !== identities.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
  return identities;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
