import {
  listBuiltinSlashCommands,
  parseAgentLaunchCatalogProjection,
  parseAgentLaunchConnectionIdentity,
  type AgentAuthorityScopeProjection,
  type AgentLaunchCatalogProjection,
  type AgentLaunchCommandCatalogEntry,
  type AgentLaunchCharacterCatalogEntry,
  type AgentLaunchConnectionIdentity,
  type AgentLaunchModelCatalogEntry,
  type AgentLaunchResourceCatalogEntry,
  type AgentLaunchResourceKind,
  type AgentLaunchSkillCatalogEntry,
} from '@neko/agent-contracts';
import type { AssistantConfigState } from '@neko/host/settings';
import type { AgentSkillCatalog } from './agent-app-host';

export interface AgentLaunchCatalogSource {
  readCatalog(scope: AgentAuthorityScopeProjection): Promise<{
    readonly models: readonly AgentLaunchModelCatalogEntry[];
    readonly commands: readonly AgentLaunchCommandCatalogEntry[];
    readonly skills: readonly AgentLaunchSkillCatalogEntry[];
    readonly characters: readonly AgentLaunchCharacterCatalogEntry[];
  }>;
}

export interface AgentLaunchAuthorizationPort {
  authorize(input: {
    readonly connection: AgentLaunchConnectionIdentity;
    readonly resourceKind: AgentLaunchResourceKind;
  }): Promise<
    | { readonly status: 'cancelled' }
    | { readonly status: 'authorized'; readonly resource: AgentLaunchResourceCatalogEntry }
  >;
  releaseConnection(connection: AgentLaunchConnectionIdentity): Promise<void>;
}

export interface AgentLaunchAttachInput {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly viewId: string;
  readonly scope: AgentAuthorityScopeProjection;
}

export interface AgentLaunchApplicationService {
  attach(input: AgentLaunchAttachInput): Promise<AgentLaunchCatalogProjection>;
  readCatalog(connection: AgentLaunchConnectionIdentity): AgentLaunchCatalogProjection;
  authorizeResource(
    connection: AgentLaunchConnectionIdentity,
    resourceKind: AgentLaunchResourceKind,
  ): Promise<AgentLaunchCatalogProjection | undefined>;
  detach(connection: AgentLaunchConnectionIdentity): Promise<void>;
  detachWindow(windowId: string): Promise<void>;
  dispose(): Promise<void>;
}

export function createAgentLaunchApplicationService(input: {
  readonly catalog: AgentLaunchCatalogSource;
  readonly authorization: AgentLaunchAuthorizationPort;
  readonly createIdentity: () => string;
}): AgentLaunchApplicationService {
  return new DefaultAgentLaunchApplicationService(input);
}

export function projectAgentLaunchBaseCatalog(input: {
  readonly config: AssistantConfigState;
  readonly skills: AgentSkillCatalog;
}): {
  readonly models: readonly AgentLaunchModelCatalogEntry[];
  readonly commands: readonly AgentLaunchCommandCatalogEntry[];
  readonly skills: readonly AgentLaunchSkillCatalogEntry[];
} {
  return {
    models: input.config.chatModelOptions.map((model) => ({
      kind: 'model',
      id: model.id,
      label: model.label,
      scopeRequirement: 'any',
      providerId: model.providerId,
      modelId: model.modelId,
      modelType: model.category ?? 'llm',
    })),
    commands: listBuiltinSlashCommands().map((command) => ({
      kind: 'command',
      id: `builtin:${command.name}`,
      label: `/${command.name}`,
      scopeRequirement: workspaceCommandNames.has(command.name) ? 'workspace' : 'any',
      command: command.name,
      description: command.description,
    })),
    skills: input.skills.records
      .filter((skill) => skill.enabled && skill.trusted)
      .map((skill) => ({
        kind: 'skill',
        id: `skill:${skill.source.kind}:${skill.name}`,
        label: skill.name,
        scopeRequirement: skill.source.kind === 'project' ? 'workspace' : 'any',
        name: skill.name,
        description: skill.description,
        source: skill.source.kind,
      })),
  };
}

const workspaceCommandNames = new Set(['as', 'exit-as', 'init']);

interface AgentLaunchState {
  readonly connection: AgentLaunchConnectionIdentity;
  attachmentCount: number;
  readonly models: readonly AgentLaunchModelCatalogEntry[];
  readonly commands: readonly AgentLaunchCommandCatalogEntry[];
  readonly skills: readonly AgentLaunchSkillCatalogEntry[];
  readonly characters: readonly AgentLaunchCharacterCatalogEntry[];
  resources: readonly AgentLaunchResourceCatalogEntry[];
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
      readonly createIdentity: () => string;
    },
  ) {}

  async attach(input: AgentLaunchAttachInput): Promise<AgentLaunchCatalogProjection> {
    this.requireActive();
    const key = ownerKey(input.windowId, input.workbenchInstanceId, input.agentSurfaceId);
    const pending = this.pendingAttachments.get(key);
    if (pending) {
      await pending;
      return this.attach(input);
    }
    const existing = this.connections.get(key);
    if (existing && sameAttachIdentity(existing.connection, input)) {
      existing.attachmentCount += 1;
      return project(existing);
    }
    const operation = this.attachFresh(key, input, existing);
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
    existing: AgentLaunchState | undefined,
  ): Promise<AgentLaunchState> {
    if (existing) await this.release(key, existing);
    const connection = parseAgentLaunchConnectionIdentity({
      ...input,
      connectionId: this.input.createIdentity(),
    });
    const catalog = await this.input.catalog.readCatalog(connection.scope);
    this.requireActive();
    const state: AgentLaunchState = {
      connection,
      attachmentCount: 1,
      models: [...catalog.models],
      commands: [...catalog.commands],
      skills: [...catalog.skills],
      characters: [...catalog.characters],
      resources: [],
    };
    this.connections.set(key, state);
    return state;
  }

  readCatalog(connection: AgentLaunchConnectionIdentity): AgentLaunchCatalogProjection {
    return project(this.requireConnection(connection));
  }

  async authorizeResource(
    connection: AgentLaunchConnectionIdentity,
    resourceKind: AgentLaunchResourceKind,
  ): Promise<AgentLaunchCatalogProjection | undefined> {
    const state = this.requireConnection(connection);
    const result = await this.input.authorization.authorize({
      connection: state.connection,
      resourceKind,
    });
    this.requireConnection(connection);
    if (result.status === 'cancelled') return undefined;
    const parsed = parseAgentLaunchCatalogProjection({
      ...project(state),
      resources: [...state.resources, result.resource],
    });
    state.resources = parsed.resources;
    return project(state);
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
    models: state.models,
    commands: state.commands,
    skills: state.skills,
    characters: state.characters,
    resources: state.resources,
  });
}

function sameAttachIdentity(
  connection: AgentLaunchConnectionIdentity,
  input: AgentLaunchAttachInput,
): boolean {
  return (
    connection.applicationInstanceId === input.applicationInstanceId &&
    connection.windowId === input.windowId &&
    connection.workbenchInstanceId === input.workbenchInstanceId &&
    connection.agentSurfaceId === input.agentSurfaceId &&
    connection.viewId === input.viewId &&
    sameScope(connection.scope, input.scope)
  );
}

function sameConnection(
  left: AgentLaunchConnectionIdentity,
  right: AgentLaunchConnectionIdentity,
): boolean {
  return sameAttachIdentity(left, right) && left.connectionId === right.connectionId;
}

function sameScope(
  left: AgentAuthorityScopeProjection,
  right: AgentAuthorityScopeProjection,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'unbound' && right.kind === 'unbound') {
    return left.draftId === right.draftId;
  }
  if (left.kind === 'assistant' && right.kind === 'assistant') {
    return left.assistantSpaceId === right.assistantSpaceId;
  }
  return (
    left.kind === 'workspace' &&
    right.kind === 'workspace' &&
    left.workspaceId === right.workspaceId &&
    left.workspaceGrantId === right.workspaceGrantId
  );
}

function ownerKey(windowId: string, workbenchInstanceId: string, agentSurfaceId: string): string {
  return `${windowId}\u0000${workbenchInstanceId}\u0000${agentSurfaceId}`;
}

function throwAggregate(results: readonly PromiseSettledResult<void>[], message: string): void {
  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  if (errors.length > 0) throw new AggregateError(errors, message);
}
