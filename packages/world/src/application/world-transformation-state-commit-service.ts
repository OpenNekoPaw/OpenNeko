import {
  parseWorldFact,
  worldFactSemanticRef,
  type WorldFact,
  type WorldTransformationCandidate,
} from '@neko/world/contracts';
import {
  createWorldFoundationDeleteFactIntent,
  createWorldFoundationSetFactIntent,
  WORLD_FOUNDATION_FACT_DELETE_ACTION,
  WORLD_FOUNDATION_FACT_SET_ACTION,
} from './world-foundation-actions';
import type { WorldRuntimeRepository, WorldRuntimeService } from './world-runtime-service';
import type { WorldTransformationPlanningService } from './world-transformation-planning-service';

export type WorldTransformationStateCommitDiagnosticCode =
  | 'world-transformation-state-only'
  | 'world-transformation-state-diff-invalid'
  | 'world-transformation-state-capability-invalid'
  | 'world-transformation-state-base-unavailable';

export class WorldTransformationStateCommitError extends Error {
  constructor(
    readonly code: WorldTransformationStateCommitDiagnosticCode,
    message: string,
    readonly worldTransformationCandidateId: string,
  ) {
    super(message);
    this.name = 'WorldTransformationStateCommitError';
  }
}

export class WorldTransformationStateCommitService {
  constructor(
    private readonly options: {
      readonly planner: WorldTransformationPlanningService;
      readonly runtime: Pick<WorldRuntimeService, 'commitAction'>;
      readonly runtimeRepository: Pick<WorldRuntimeRepository, 'readRuntime'>;
    },
  ) {}

  async commit(candidateInput: WorldTransformationCandidate, signal?: AbortSignal): Promise<void> {
    const plan = await this.options.planner.plan(candidateInput, signal);
    const candidate = plan.candidate;
    if (candidate.category !== 'world-state' || candidate.base.kind !== 'runtime') {
      throw stateCommitError(
        'world-transformation-state-only',
        'World Foundation can commit only an exact runtime state transformation.',
        candidate,
      );
    }
    const base = candidate.base;
    if (plan.status === 'blocked') {
      throw stateCommitError(
        'world-transformation-state-capability-invalid',
        plan.diagnostics.map((diagnostic) => diagnostic.message).join(' '),
        candidate,
      );
    }
    if (candidate.diff.length !== 1) {
      throw stateCommitError(
        'world-transformation-state-diff-invalid',
        'World Foundation state transformation requires exactly one semantic fact change.',
        candidate,
      );
    }
    const diff = candidate.diff[0];
    if (!diff) {
      throw stateCommitError(
        'world-transformation-state-diff-invalid',
        'World Foundation state transformation requires one semantic fact change.',
        candidate,
      );
    }
    const action =
      diff.operation === 'remove'
        ? WORLD_FOUNDATION_FACT_DELETE_ACTION
        : WORLD_FOUNDATION_FACT_SET_ACTION;
    if (
      !candidate.requirements.some(
        (requirement) =>
          requirement.capabilityKind === 'world-action' &&
          requirement.capabilityId === action &&
          requirement.mode === 'required',
      ) ||
      !plan.resolvedCapabilities.some(
        (capability) =>
          capability.capabilityKind === 'world-action' && capability.capabilityId === action,
      )
    ) {
      throw stateCommitError(
        'world-transformation-state-capability-invalid',
        `World Foundation state transformation must require exact capability '${action}'.`,
        candidate,
      );
    }
    const aggregate = await this.options.runtimeRepository.readRuntime(base.worldRunId, signal);
    signal?.throwIfAborted();
    const branch = aggregate?.save.branches.find((item) => item.branchId === base.branchId);
    if (!aggregate || !branch) {
      throw stateCommitError(
        'world-transformation-state-base-unavailable',
        'The authoritative World runtime base is unavailable.',
        candidate,
      );
    }
    const intentIdentity = {
      worldActionIntentId: `world-intent:${candidate.worldTransformationCandidateId}`,
      worldRunId: base.worldRunId,
      worldSaveId: base.worldSaveId,
      branchId: base.branchId,
      actorId: candidate.requester.actorId,
      observedTimepoint: base.timepoint,
      expectedWorldStateRevision: base.worldStateRevision,
      createdAt: candidate.createdAt,
    };
    if (diff.operation === 'add') {
      const fact = parseFactForSemanticRef(diff.after, diff.semanticRef, candidate);
      if (branch.state.facts.some((item) => item.factId === fact.factId)) {
        throw stateCommitError(
          'world-transformation-state-diff-invalid',
          `World fact '${fact.factId}' already exists and cannot be added.`,
          candidate,
        );
      }
      await this.options.runtime.commitAction(
        createWorldFoundationSetFactIntent({ identity: intentIdentity, fact }),
        signal,
      );
      return;
    }
    const before = parseFactForSemanticRef(diff.before, diff.semanticRef, candidate);
    const current = branch.state.facts.find((item) => item.factId === before.factId);
    if (!current || !sameFact(current, before)) {
      throw stateCommitError(
        'world-transformation-state-diff-invalid',
        `World fact '${before.factId}' does not match the transformation base.`,
        candidate,
      );
    }
    if (diff.operation === 'remove') {
      await this.options.runtime.commitAction(
        createWorldFoundationDeleteFactIntent({ identity: intentIdentity, factId: before.factId }),
        signal,
      );
      return;
    }
    const after = parseFactForSemanticRef(diff.after, diff.semanticRef, candidate);
    await this.options.runtime.commitAction(
      createWorldFoundationSetFactIntent({ identity: intentIdentity, fact: after }),
      signal,
    );
  }
}

function parseFactForSemanticRef(
  value: unknown,
  semanticRef: string,
  candidate: WorldTransformationCandidate,
): WorldFact {
  const fact = parseWorldFact(value);
  if (semanticRef !== worldFactSemanticRef(fact.factId)) {
    throw stateCommitError(
      'world-transformation-state-diff-invalid',
      `World semantic reference '${semanticRef}' does not match fact '${fact.factId}'.`,
      candidate,
    );
  }
  return fact;
}

function sameFact(left: WorldFact, right: WorldFact): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stateCommitError(
  code: WorldTransformationStateCommitDiagnosticCode,
  message: string,
  candidate: WorldTransformationCandidate,
): WorldTransformationStateCommitError {
  return new WorldTransformationStateCommitError(
    code,
    message,
    candidate.worldTransformationCandidateId,
  );
}
