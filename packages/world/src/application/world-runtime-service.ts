import {
  parseWorldEvent,
  parseWorldRun,
  parseWorldSave,
  parseWorldView,
  type WorldActionIntent,
  type WorldEvent,
  type WorldFactMutation,
  type WorldRun,
  type WorldSave,
  type WorldState,
  type WorldVersion,
  type WorldView,
  type WorldVisibility,
} from '@neko/world/contracts';

export interface WorldRuntimeAggregate {
  readonly publication: WorldVersion;
  readonly run: WorldRun;
  readonly save: WorldSave;
}

export interface WorldRuntimeRepository {
  readPublication(worldVersionId: string, signal?: AbortSignal): Promise<WorldVersion | undefined>;
  createRuntime(aggregate: WorldRuntimeAggregate, signal?: AbortSignal): Promise<void>;
  readRuntime(worldRunId: string, signal?: AbortSignal): Promise<WorldRuntimeAggregate | undefined>;
  mutateRuntime(
    worldRunId: string,
    mutation: (current: WorldRuntimeAggregate) => WorldRuntimeAggregate,
    signal?: AbortSignal,
  ): Promise<WorldRuntimeAggregate>;
}

export interface WorldActionCommitPlan {
  readonly mutations: readonly WorldFactMutation[];
  readonly visibility: WorldVisibility;
  readonly knownByActorIds: readonly string[];
}

export interface WorldActionHandler {
  readonly action: string;
  evaluate(input: {
    readonly intent: WorldActionIntent;
    readonly publication: WorldVersion;
    readonly state: WorldState;
  }): WorldActionCommitPlan;
}

export interface WorldRuntimeServiceOptions {
  readonly repository: WorldRuntimeRepository;
  readonly actionHandlers: readonly WorldActionHandler[];
  readonly now?: () => string;
  readonly createWorldEventId?: (intent: WorldActionIntent) => string;
}

export type WorldRuntimeDiagnosticCode =
  | 'world-version-unavailable'
  | 'world-run-already-exists'
  | 'world-run-unavailable'
  | 'world-authority-mismatch'
  | 'world-branch-already-exists'
  | 'world-branch-unavailable'
  | 'world-action-unregistered'
  | 'stale-world-state'
  | 'world-action-invalid';

export class WorldRuntimeError extends Error {
  constructor(
    readonly code: WorldRuntimeDiagnosticCode,
    message: string,
    readonly worldRunId?: string,
  ) {
    super(message);
    this.name = 'WorldRuntimeError';
  }
}

export class WorldRuntimeService {
  private readonly handlers: ReadonlyMap<string, WorldActionHandler>;
  private readonly now: () => string;
  private readonly createWorldEventId: (intent: WorldActionIntent) => string;

  constructor(private readonly options: WorldRuntimeServiceOptions) {
    const handlers = new Map(options.actionHandlers.map((handler) => [handler.action, handler]));
    if (handlers.size !== options.actionHandlers.length) {
      throw worldRuntimeError(
        'world-action-invalid',
        'World action registry contains a duplicate exact action identity.',
      );
    }
    this.handlers = handlers;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createWorldEventId =
      options.createWorldEventId ?? ((intent) => `world-event:${intent.worldActionIntentId}`);
  }

  async createRun(
    input: {
      readonly worldVersionId: string;
      readonly worldRunId: string;
      readonly worldSaveId: string;
      readonly branchId: string;
      readonly saveLabel: string;
    },
    signal?: AbortSignal,
  ): Promise<WorldRuntimeAggregate> {
    const publication = await this.options.repository.readPublication(input.worldVersionId, signal);
    if (!publication) {
      throw worldRuntimeError(
        'world-version-unavailable',
        `WorldVersion '${input.worldVersionId}' is unavailable.`,
        input.worldRunId,
      );
    }
    const timestamp = this.now();
    const state: WorldState = {
      worldVersionId: publication.worldVersionId,
      worldRunId: input.worldRunId,
      worldSaveId: input.worldSaveId,
      branchId: input.branchId,
      worldStateRevision: 0,
      timepoint: 0,
      facts: structuredClone(publication.definition.initialFacts),
    };
    const run = parseWorldRun({
      worldRunId: input.worldRunId,
      worldVersionId: publication.worldVersionId,
      worldSaveId: input.worldSaveId,
      branchId: input.branchId,
      worldStateRevision: 0,
      timepoint: 0,
      createdAt: timestamp,
    });
    const save = parseWorldSave({
      worldSaveId: input.worldSaveId,
      worldRunId: input.worldRunId,
      worldVersionId: publication.worldVersionId,
      label: input.saveLabel,
      activeBranchId: input.branchId,
      branches: [{ branchId: input.branchId, events: [], state }],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const aggregate = { publication, run, save };
    await this.options.repository.createRuntime(aggregate, signal);
    return structuredClone(aggregate);
  }

  async commitAction(
    intent: WorldActionIntent,
    signal?: AbortSignal,
  ): Promise<{ readonly event: WorldEvent; readonly state: WorldState }> {
    let committedEvent: WorldEvent | undefined;
    const next = await this.options.repository.mutateRuntime(
      intent.worldRunId,
      (current) => {
        assertIntentAuthority(intent, current);
        const branch = requireActiveBranch(current);
        if (intent.expectedWorldStateRevision !== branch.state.worldStateRevision) {
          throw worldRuntimeError(
            'stale-world-state',
            `WorldActionIntent expected state ${String(intent.expectedWorldStateRevision)} but current state is ${String(branch.state.worldStateRevision)}.`,
            current.run.worldRunId,
          );
        }
        if (intent.observedTimepoint !== branch.state.timepoint) {
          throw worldRuntimeError(
            'stale-world-state',
            `WorldActionIntent observed timepoint ${String(intent.observedTimepoint)} but current timepoint is ${String(branch.state.timepoint)}.`,
            current.run.worldRunId,
          );
        }
        const handler = this.handlers.get(intent.action);
        if (!handler) {
          throw worldRuntimeError(
            'world-action-unregistered',
            `World action '${intent.action}' is not registered.`,
            current.run.worldRunId,
          );
        }
        const plan = handler.evaluate({
          intent,
          publication: current.publication,
          state: structuredClone(branch.state),
        });
        const event = parseWorldEvent({
          worldEventId: this.createWorldEventId(intent),
          worldActionIntentId: intent.worldActionIntentId,
          worldRunId: intent.worldRunId,
          worldSaveId: intent.worldSaveId,
          branchId: intent.branchId,
          sequence: branch.events.length + 1,
          timepoint: branch.state.timepoint + 1,
          actorId: intent.actorId,
          action: intent.action,
          mutations: plan.mutations,
          visibility: plan.visibility,
          knownByActorIds: plan.knownByActorIds,
          committedAt: this.now(),
        });
        const state: WorldState = {
          ...branch.state,
          worldStateRevision: branch.state.worldStateRevision + 1,
          timepoint: event.timepoint,
          facts: applyMutations(branch.state, event.mutations),
        };
        const save = parseWorldSave({
          ...current.save,
          branches: current.save.branches.map((candidate) =>
            candidate.branchId === branch.branchId
              ? { ...candidate, events: [...candidate.events, event], state }
              : candidate,
          ),
          updatedAt: this.now(),
        });
        const run = parseWorldRun({
          ...current.run,
          worldStateRevision: state.worldStateRevision,
          timepoint: state.timepoint,
        });
        committedEvent = event;
        return { publication: current.publication, run, save };
      },
      signal,
    );
    if (!committedEvent) {
      throw worldRuntimeError(
        'world-action-invalid',
        'World runtime transaction completed without a committed event.',
        intent.worldRunId,
      );
    }
    return {
      event: committedEvent,
      state: structuredClone(requireActiveBranch(next).state),
    };
  }

  async forkBranch(
    input: {
      readonly worldRunId: string;
      readonly worldSaveId: string;
      readonly parentBranchId: string;
      readonly forkedFromWorldEventId: string;
      readonly branchId: string;
      readonly expectedWorldStateRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<WorldRuntimeAggregate> {
    return this.options.repository.mutateRuntime(
      input.worldRunId,
      (current) => {
        assertSaveAuthority(input.worldSaveId, current);
        if (current.save.branches.some((branch) => branch.branchId === input.branchId)) {
          throw worldRuntimeError(
            'world-branch-already-exists',
            `World branch '${input.branchId}' already exists.`,
            input.worldRunId,
          );
        }
        const parentBranch = requireBranch(current, input.parentBranchId);
        if (parentBranch.state.worldStateRevision !== input.expectedWorldStateRevision) {
          throw worldRuntimeError(
            'stale-world-state',
            `World branch fork expected parent state ${String(input.expectedWorldStateRevision)} but current state is ${String(parentBranch.state.worldStateRevision)}.`,
            input.worldRunId,
          );
        }
        const forkEvent = parentBranch.events.find(
          (event) => event.worldEventId === input.forkedFromWorldEventId,
        );
        if (!forkEvent) {
          throw worldRuntimeError(
            'world-branch-unavailable',
            `Fork event '${input.forkedFromWorldEventId}' is unavailable on parent branch '${input.parentBranchId}'.`,
            input.worldRunId,
          );
        }
        const stateAtFork = deriveStateAtEvent(
          current.publication,
          current.save,
          parentBranch.branchId,
          forkEvent.worldEventId,
        );
        const branch = {
          branchId: input.branchId,
          parentBranchId: parentBranch.branchId,
          forkedFromWorldEventId: forkEvent.worldEventId,
          events: [],
          state: {
            ...stateAtFork,
            branchId: input.branchId,
            worldStateRevision: 0,
          },
        };
        const save = parseWorldSave({
          ...current.save,
          activeBranchId: branch.branchId,
          branches: [...current.save.branches, branch],
          updatedAt: this.now(),
        });
        const run = parseWorldRun({
          ...current.run,
          branchId: branch.branchId,
          worldStateRevision: branch.state.worldStateRevision,
          timepoint: branch.state.timepoint,
        });
        return { publication: current.publication, run, save };
      },
      signal,
    );
  }

  async activateBranch(
    input: {
      readonly worldRunId: string;
      readonly worldSaveId: string;
      readonly branchId: string;
    },
    signal?: AbortSignal,
  ): Promise<WorldRuntimeAggregate> {
    return this.options.repository.mutateRuntime(
      input.worldRunId,
      (current) => {
        assertSaveAuthority(input.worldSaveId, current);
        const branch = requireBranch(current, input.branchId);
        const save = parseWorldSave({
          ...current.save,
          activeBranchId: branch.branchId,
          updatedAt: this.now(),
        });
        const run = parseWorldRun({
          ...current.run,
          branchId: branch.branchId,
          worldStateRevision: branch.state.worldStateRevision,
          timepoint: branch.state.timepoint,
        });
        return { publication: current.publication, run, save };
      },
      signal,
    );
  }

  async validateBinding(
    input: {
      readonly worldVersionId: string;
      readonly worldRunId: string;
      readonly worldSaveId?: string;
      readonly branchId?: string;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    const current = await this.options.repository.readRuntime(input.worldRunId, signal);
    if (!current) {
      throw worldRuntimeError(
        'world-run-unavailable',
        `WorldRun '${input.worldRunId}' is unavailable.`,
        input.worldRunId,
      );
    }
    assertBindingAuthority(input, current);
  }

  async materializeBindingView(
    input: {
      readonly worldVersionId: string;
      readonly worldRunId: string;
      readonly worldSaveId?: string;
      readonly branchId?: string;
      readonly participantId: string;
      readonly actorId?: string;
    },
    signal?: AbortSignal,
  ): Promise<WorldView> {
    const current = await this.options.repository.readRuntime(input.worldRunId, signal);
    if (!current) {
      throw worldRuntimeError(
        'world-run-unavailable',
        `WorldRun '${input.worldRunId}' is unavailable.`,
        input.worldRunId,
      );
    }
    assertBindingAuthority(input, current);
    return projectWorldView(
      current,
      input.branchId ?? current.run.branchId,
      input.participantId,
      input.actorId,
    );
  }

  async materializeView(
    input: {
      readonly worldRunId: string;
      readonly worldSaveId: string;
      readonly branchId: string;
      readonly participantId: string;
      readonly actorId?: string;
    },
    signal?: AbortSignal,
  ): Promise<WorldView> {
    const current = await this.options.repository.readRuntime(input.worldRunId, signal);
    if (!current) {
      throw worldRuntimeError(
        'world-run-unavailable',
        `WorldRun '${input.worldRunId}' is unavailable.`,
        input.worldRunId,
      );
    }
    if (current.save.worldSaveId !== input.worldSaveId) {
      throw worldRuntimeError(
        'world-authority-mismatch',
        'WorldView request does not match the exact WorldSave bound to the run.',
        input.worldRunId,
      );
    }
    return projectWorldView(current, input.branchId, input.participantId, input.actorId);
  }
}

function assertBindingAuthority(
  input: {
    readonly worldVersionId: string;
    readonly worldRunId: string;
    readonly worldSaveId?: string;
    readonly branchId?: string;
  },
  current: WorldRuntimeAggregate,
): void {
  if (
    current.publication.worldVersionId !== input.worldVersionId ||
    current.run.worldVersionId !== input.worldVersionId ||
    (input.worldSaveId !== undefined && current.save.worldSaveId !== input.worldSaveId) ||
    (input.branchId !== undefined &&
      !current.save.branches.some((branch) => branch.branchId === input.branchId))
  ) {
    throw worldRuntimeError(
      'world-authority-mismatch',
      'World binding does not match the exact WorldVersion, Run, Save and branch authority.',
      input.worldRunId,
    );
  }
}

function projectWorldView(
  current: WorldRuntimeAggregate,
  branchId: string,
  participantId: string,
  actorId: string | undefined,
): WorldView {
  const branch = requireBranch(current, branchId);
  const events = collectEffectiveEvents(current.save, branch.branchId);
  return parseWorldView({
    worldVersionId: current.publication.worldVersionId,
    worldRunId: current.run.worldRunId,
    worldSaveId: current.save.worldSaveId,
    branchId: branch.branchId,
    participantId,
    ...(actorId === undefined ? {} : { actorId }),
    worldStateRevision: branch.state.worldStateRevision,
    timepoint: branch.state.timepoint,
    background: current.publication.definition.background,
    worldBook: current.publication.definition.worldBook.filter((entry) =>
      isVisible(entry.visibility, actorId),
    ),
    facts: branch.state.facts.filter((fact) =>
      isKnownAndVisible(fact.visibility, fact.knownByActorIds, actorId),
    ),
    events: events.filter((event) =>
      isKnownAndVisible(event.visibility, event.knownByActorIds, actorId),
    ),
  });
}

function assertIntentAuthority(intent: WorldActionIntent, current: WorldRuntimeAggregate): void {
  if (
    intent.worldRunId !== current.run.worldRunId ||
    intent.worldSaveId !== current.save.worldSaveId ||
    intent.branchId !== current.run.branchId ||
    current.publication.worldVersionId !== current.run.worldVersionId
  ) {
    throw worldRuntimeError(
      'world-authority-mismatch',
      'WorldActionIntent does not match the exact World runtime authority.',
      current.run.worldRunId,
    );
  }
}

function assertSaveAuthority(worldSaveId: string, current: WorldRuntimeAggregate): void {
  if (
    worldSaveId !== current.save.worldSaveId ||
    current.save.worldRunId !== current.run.worldRunId ||
    current.save.worldVersionId !== current.publication.worldVersionId
  ) {
    throw worldRuntimeError(
      'world-authority-mismatch',
      'World branch request does not match the exact World runtime authority.',
      current.run.worldRunId,
    );
  }
}

function requireActiveBranch(aggregate: WorldRuntimeAggregate): WorldSave['branches'][number] {
  const branch = requireBranch(aggregate, aggregate.run.branchId);
  if (!branch || aggregate.save.activeBranchId !== branch.branchId) {
    throw worldRuntimeError(
      'world-authority-mismatch',
      'WorldRun active branch is unavailable in its exact WorldSave.',
      aggregate.run.worldRunId,
    );
  }
  return branch;
}

function requireBranch(
  aggregate: WorldRuntimeAggregate,
  branchId: string,
): WorldSave['branches'][number] {
  const branch = aggregate.save.branches.find((candidate) => candidate.branchId === branchId);
  if (!branch) {
    throw worldRuntimeError(
      'world-branch-unavailable',
      `World branch '${branchId}' is unavailable in its exact WorldSave.`,
      aggregate.run.worldRunId,
    );
  }
  return branch;
}

function deriveStateAtEvent(
  publication: WorldVersion,
  save: WorldSave,
  branchId: string,
  worldEventId: string,
): WorldState {
  const branch = save.branches.find((candidate) => candidate.branchId === branchId);
  if (!branch) {
    throw worldRuntimeError(
      'world-branch-unavailable',
      `World branch '${branchId}' is unavailable in its exact WorldSave.`,
      save.worldRunId,
    );
  }
  let facts = structuredClone(publication.definition.initialFacts);
  if (branch.parentBranchId && branch.forkedFromWorldEventId) {
    facts = [
      ...deriveStateAtEvent(publication, save, branch.parentBranchId, branch.forkedFromWorldEventId)
        .facts,
    ];
  }
  for (const event of branch.events) {
    facts = [
      ...applyMutations(
        {
          worldVersionId: publication.worldVersionId,
          worldRunId: save.worldRunId,
          worldSaveId: save.worldSaveId,
          branchId,
          worldStateRevision: event.sequence - 1,
          timepoint: event.timepoint - 1,
          facts,
        },
        event.mutations,
      ),
    ];
    if (event.worldEventId === worldEventId) {
      return {
        worldVersionId: publication.worldVersionId,
        worldRunId: save.worldRunId,
        worldSaveId: save.worldSaveId,
        branchId,
        worldStateRevision: event.sequence,
        timepoint: event.timepoint,
        facts,
      };
    }
  }
  throw worldRuntimeError(
    'world-branch-unavailable',
    `World event '${worldEventId}' is unavailable on branch '${branchId}'.`,
    save.worldRunId,
  );
}

function collectEffectiveEvents(save: WorldSave, branchId: string): readonly WorldEvent[] {
  const branch = save.branches.find((candidate) => candidate.branchId === branchId);
  if (!branch) {
    throw worldRuntimeError(
      'world-branch-unavailable',
      `World branch '${branchId}' is unavailable in its exact WorldSave.`,
      save.worldRunId,
    );
  }
  if (!branch.parentBranchId || !branch.forkedFromWorldEventId) return branch.events;
  const parentEvents = collectEffectiveEvents(save, branch.parentBranchId);
  const forkIndex = parentEvents.findIndex(
    (event) => event.worldEventId === branch.forkedFromWorldEventId,
  );
  if (forkIndex < 0) {
    throw worldRuntimeError(
      'world-branch-unavailable',
      `Fork event '${branch.forkedFromWorldEventId}' is unavailable in branch ancestry.`,
      save.worldRunId,
    );
  }
  return [...parentEvents.slice(0, forkIndex + 1), ...branch.events];
}

function applyMutations(
  state: WorldState,
  mutations: readonly WorldFactMutation[],
): WorldState['facts'] {
  const facts = new Map(state.facts.map((fact) => [fact.factId, structuredClone(fact)]));
  for (const mutation of mutations) {
    if (mutation.kind === 'set') {
      facts.set(mutation.fact.factId, structuredClone(mutation.fact));
      continue;
    }
    if (!facts.delete(mutation.factId)) {
      throw worldRuntimeError(
        'world-action-invalid',
        `World action cannot delete missing fact '${mutation.factId}'.`,
        state.worldRunId,
      );
    }
  }
  return [...facts.values()];
}

function isKnownAndVisible(
  visibility: WorldVisibility,
  knownByActorIds: readonly string[],
  actorId: string | undefined,
): boolean {
  return actorId === undefined
    ? visibility.kind === 'public'
    : knownByActorIds.includes(actorId) && isVisible(visibility, actorId);
}

function isVisible(visibility: WorldVisibility, actorId: string | undefined): boolean {
  return (
    visibility.kind === 'public' ||
    (visibility.kind === 'actors' && actorId !== undefined && visibility.actorIds.includes(actorId))
  );
}

function worldRuntimeError(
  code: WorldRuntimeDiagnosticCode,
  message: string,
  worldRunId?: string,
): WorldRuntimeError {
  return new WorldRuntimeError(code, message, worldRunId);
}
