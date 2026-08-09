import {
  parseAgentConversationContext,
  parseAgentScratchArtifactRef,
  type AgentConversationContext,
  type AgentScratchArtifactRef,
  type AgentContextPayload,
  type Message,
} from '@neko/agent-contracts';

export type AgentPendingTurnStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentConversationLifecycleRecord {
  readonly conversationId: string;
  readonly context: AgentConversationContext;
  readonly createdAt: string;
  readonly initialMessage: {
    readonly messageId: string;
    readonly text: string;
    readonly resourceGrantIds: readonly string[];
  };
  readonly configuration: {
    readonly providerId: string;
    readonly modelId: string;
    readonly executionMode: 'plan' | 'ask' | 'auto';
  };
  readonly pendingTurn: {
    readonly requestId: string;
    readonly turnId: string;
    readonly status: AgentPendingTurnStatus;
    readonly diagnostic?: string;
  };
  readonly scratchArtifacts: readonly AgentScratchArtifactRef[];
}

export interface AgentFirstSubmitInput {
  readonly requestId: string;
  readonly conversationId?: string;
  readonly context: AgentConversationContext;
  readonly messageText: string;
  readonly resourceGrantIds: readonly string[];
  readonly configuration: AgentConversationLifecycleRecord['configuration'];
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
    id: record.initialMessage.messageId,
    role: 'user',
    content: record.initialMessage.text,
    timestamp,
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
  readConversation(conversationId: string): Promise<AgentConversationLifecycleRecord | undefined>;
  readFirstSubmitByRequest(
    requestId: string,
  ): Promise<AgentConversationLifecycleRecord | undefined>;
  readConversationContext(conversationId: string): Promise<AgentConversationContext | undefined>;
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
    readonly context: AgentConversationContext;
    readonly resourceGrantIds: readonly string[];
  }): Promise<void>;
  resolveForTurn(input: {
    readonly context: AgentConversationContext;
    readonly resourceGrantIds: readonly string[];
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
    readonly context: AgentConversationContext;
    readonly messageText: string;
    readonly resourceGrantIds: readonly string[];
    readonly contextPayloads: readonly AgentContextPayload[];
    readonly configuration: AgentConversationLifecycleRecord['configuration'];
  }): Promise<void>;
}

export interface AgentConversationSessionMaterializationPort {
  materialize(input: {
    readonly conversationId: string;
    readonly context: AgentConversationContext;
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
  readConversationContext(conversationId: string): Promise<AgentConversationContext>;
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
    const context = parseAgentConversationContext(input.context);
    const messageText = requireText(input.messageText, 'Agent first-submit message');
    const resourceGrantIds = requireUniqueIdentities(
      input.resourceGrantIds,
      'Agent first-submit Resource grants',
    );
    await options.grants.validate({ context, resourceGrantIds });
    const configuration = {
      providerId: requireIdentity(input.configuration.providerId, 'Agent Provider'),
      modelId: requireIdentity(input.configuration.modelId, 'Agent Model'),
      executionMode: requireExecutionMode(input.configuration.executionMode),
    };
    const requestedConversationId =
      input.conversationId === undefined
        ? undefined
        : requireIdentity(input.conversationId, 'Agent Conversation');
    const conversationId = requestedConversationId ?? `conversation:${options.createIdentity()}`;
    const turnId = `turn:${options.createIdentity()}`;
    const record: AgentConversationLifecycleRecord = {
      conversationId,
      context,
      createdAt: options.now(),
      initialMessage: {
        messageId: `message:${options.createIdentity()}`,
        text: messageText,
        resourceGrantIds,
      },
      configuration,
      pendingTurn: { requestId, turnId, status: 'pending' },
      scratchArtifacts: [],
    };
    const committed = await options.repository.commitFirstSubmit(record);
    const exact = committed.record;
    if (exact.pendingTurn.requestId !== requestId) {
      throw new Error(
        `Agent first-submit request '${requestId}' conflicts with committed request '${exact.pendingTurn.requestId}'.`,
      );
    }
    if (requestedConversationId !== undefined && exact.conversationId !== requestedConversationId) {
      throw new Error(
        `Agent first-submit request '${requestId}' is already bound to Conversation '${exact.conversationId}', not '${requestedConversationId}'.`,
      );
    }
    await options.session.materialize({
      conversationId: exact.conversationId,
      context: exact.context,
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
      const contextPayloads = await options.grants.resolveForTurn({
        context: exact.context,
        resourceGrantIds: exact.initialMessage.resourceGrantIds,
      });
      await options.provider.start({
        requestId: exact.pendingTurn.requestId,
        turnId: exact.pendingTurn.turnId,
        conversationId: exact.conversationId,
        context: exact.context,
        messageText: exact.initialMessage.text,
        resourceGrantIds: exact.initialMessage.resourceGrantIds,
        contextPayloads,
        configuration: exact.configuration,
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
    conversationId: string,
  ): Promise<AgentConversationLifecycleRecord | undefined> =>
    options.repository.readConversation(requireIdentity(conversationId, 'Agent Conversation'));

  const readConversation = async (
    conversationId: string,
  ): Promise<AgentConversationLifecycleRecord> => {
    const record = await readFirstSubmitRecord(conversationId);
    if (!record) throw new Error(`Agent Conversation '${conversationId}' is not present.`);
    return record;
  };

  const readConversationContext = async (
    conversationIdValue: string,
  ): Promise<AgentConversationContext> => {
    const conversationId = requireIdentity(conversationIdValue, 'Agent Conversation');
    const stored = await options.repository.readConversationContext(conversationId);
    if (stored) return stored;
    throw new Error(`Agent Conversation '${conversationId}' context is not present.`);
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

export function createInMemoryAgentConversationLifecycleRepository(): AgentConversationLifecycleRepositoryPort {
  const recordsByConversation = new Map<string, AgentConversationLifecycleRecord>();
  const contextsByConversation = new Map<string, AgentConversationContext>();
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

function cloneContext(context: AgentConversationContext): AgentConversationContext {
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
    initialMessage: {
      ...record.initialMessage,
      resourceGrantIds: [...record.initialMessage.resourceGrantIds],
    },
    configuration: { ...record.configuration },
    pendingTurn: { ...record.pendingTurn },
    scratchArtifacts: record.scratchArtifacts.map((artifact) => ({ ...artifact })),
  };
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} identity is required.`);
  return value;
}

function requireText(value: string, label: string): string {
  const text = value.trim();
  if (text.length === 0) throw new Error(`${label} is required.`);
  return text;
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

function requireExecutionMode(value: 'plan' | 'ask' | 'auto'): 'plan' | 'ask' | 'auto' {
  if (value !== 'plan' && value !== 'ask' && value !== 'auto') {
    throw new Error(`Unknown Agent execution mode '${String(value)}'.`);
  }
  return value;
}
