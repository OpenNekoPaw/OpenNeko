import {
  parseWorldCapabilityRegistration,
  parseWorldTransformationCandidate,
  type WorldCapabilityGapDiagnostic,
  type WorldCapabilityRegistration,
  type WorldTransformationCandidate,
} from '@neko/world/contracts';
import type { WorldRuntimeRepository } from './world-runtime-service';

export type WorldTransformationPlan =
  | {
      readonly status: 'ready';
      readonly candidate: WorldTransformationCandidate;
      readonly resolvedCapabilities: readonly WorldCapabilityRegistration[];
      readonly diagnostics: readonly WorldCapabilityGapDiagnostic[];
    }
  | {
      readonly status: 'blocked';
      readonly candidate: WorldTransformationCandidate;
      readonly resolvedCapabilities: readonly WorldCapabilityRegistration[];
      readonly diagnostics: readonly WorldCapabilityGapDiagnostic[];
    };

export type WorldTransformationPlanningDiagnosticCode =
  | 'world-transformation-unauthorized'
  | 'world-transformation-runtime-unavailable'
  | 'world-transformation-base-mismatch'
  | 'world-transformation-stale'
  | 'world-capability-registration-duplicate';

export class WorldTransformationPlanningError extends Error {
  constructor(
    readonly code: WorldTransformationPlanningDiagnosticCode,
    message: string,
    readonly worldTransformationCandidateId?: string,
  ) {
    super(message);
    this.name = 'WorldTransformationPlanningError';
  }
}

export class WorldTransformationPlanningService {
  private readonly capabilities: ReadonlyMap<string, WorldCapabilityRegistration>;
  private readonly runtimeRepository: Pick<WorldRuntimeRepository, 'readRuntime'>;

  constructor(input: {
    readonly capabilities: readonly WorldCapabilityRegistration[];
    readonly runtimeRepository: Pick<WorldRuntimeRepository, 'readRuntime'>;
  }) {
    const capabilities = new Map<string, WorldCapabilityRegistration>();
    for (const raw of input.capabilities) {
      const capability = parseWorldCapabilityRegistration(raw);
      const key = capabilityKey(capability);
      if (capabilities.has(key)) {
        throw planningError(
          'world-capability-registration-duplicate',
          `World capability '${key}' is registered more than once.`,
        );
      }
      capabilities.set(key, capability);
    }
    this.capabilities = capabilities;
    this.runtimeRepository = input.runtimeRepository;
  }

  async plan(
    candidateInput: WorldTransformationCandidate,
    signal?: AbortSignal,
  ): Promise<WorldTransformationPlan> {
    signal?.throwIfAborted();
    const candidate = parseWorldTransformationCandidate(candidateInput);
    assertRequesterAuthority(candidate);
    await this.assertCandidateBase(candidate, signal);
    const resolvedCapabilities: WorldCapabilityRegistration[] = [];
    const diagnostics: WorldCapabilityGapDiagnostic[] = [];
    for (const requirement of candidate.requirements) {
      const capability = this.capabilities.get(capabilityKey(requirement));
      if (capability) {
        resolvedCapabilities.push(capability);
        continue;
      }
      diagnostics.push({
        code: 'world-capability-unavailable',
        worldTransformationCandidateId: candidate.worldTransformationCandidateId,
        capabilityKind: requirement.capabilityKind,
        capabilityId: requirement.capabilityId,
        mode: requirement.mode,
        message: `World capability '${requirement.capabilityKind}:${requirement.capabilityId}' is unavailable.`,
      });
    }
    const blocked = diagnostics.some((diagnostic) => diagnostic.mode === 'required');
    return {
      status: blocked ? 'blocked' : 'ready',
      candidate: structuredClone(candidate),
      resolvedCapabilities: structuredClone(resolvedCapabilities),
      diagnostics,
    };
  }

  private async assertCandidateBase(
    candidate: WorldTransformationCandidate,
    signal?: AbortSignal,
  ): Promise<void> {
    if (candidate.base.kind !== 'runtime') return;
    const runtime = await this.runtimeRepository.readRuntime(candidate.base.worldRunId, signal);
    signal?.throwIfAborted();
    if (!runtime) {
      throw planningError(
        'world-transformation-runtime-unavailable',
        `WorldRun '${candidate.base.worldRunId}' is unavailable.`,
        candidate.worldTransformationCandidateId,
      );
    }
    const base = candidate.base;
    if (
      runtime.publication.worldVersionId !== base.worldVersionId ||
      runtime.run.worldRunId !== base.worldRunId ||
      runtime.run.worldVersionId !== base.worldVersionId ||
      runtime.run.worldSaveId !== base.worldSaveId ||
      runtime.run.branchId !== base.branchId ||
      runtime.save.worldVersionId !== base.worldVersionId ||
      runtime.save.worldRunId !== base.worldRunId ||
      runtime.save.worldSaveId !== base.worldSaveId ||
      runtime.save.activeBranchId !== base.branchId
    ) {
      throw planningError(
        'world-transformation-base-mismatch',
        `World transformation candidate '${candidate.worldTransformationCandidateId}' does not match its authoritative runtime base.`,
        candidate.worldTransformationCandidateId,
      );
    }
    const branch = runtime.save.branches.find((item) => item.branchId === base.branchId);
    if (!branch) {
      throw planningError(
        'world-transformation-base-mismatch',
        `World branch '${base.branchId}' is unavailable in the authoritative runtime base.`,
        candidate.worldTransformationCandidateId,
      );
    }
    if (
      branch.state.worldVersionId !== base.worldVersionId ||
      branch.state.worldRunId !== base.worldRunId ||
      branch.state.worldSaveId !== base.worldSaveId ||
      branch.state.branchId !== base.branchId ||
      runtime.run.worldStateRevision !== branch.state.worldStateRevision ||
      runtime.run.timepoint !== branch.state.timepoint
    ) {
      throw planningError(
        'world-transformation-base-mismatch',
        `World transformation candidate '${candidate.worldTransformationCandidateId}' resolved an inconsistent authoritative runtime base.`,
        candidate.worldTransformationCandidateId,
      );
    }
    if (
      branch.state.worldStateRevision !== base.worldStateRevision ||
      branch.state.timepoint !== base.timepoint
    ) {
      throw planningError(
        'world-transformation-stale',
        `World transformation candidate '${candidate.worldTransformationCandidateId}' is stale.`,
        candidate.worldTransformationCandidateId,
      );
    }
  }
}

function assertRequesterAuthority(candidate: WorldTransformationCandidate): void {
  if (
    candidate.requester.authority === 'participant' &&
    candidate.category !== 'world-state' &&
    candidate.category !== 'presentation'
  ) {
    throw planningError(
      'world-transformation-unauthorized',
      `Participant '${candidate.requester.actorId}' cannot propose '${candidate.category}' transformation.`,
      candidate.worldTransformationCandidateId,
    );
  }
}

function capabilityKey(input: {
  readonly capabilityKind: string;
  readonly capabilityId: string;
}): string {
  return `${input.capabilityKind}:${input.capabilityId}`;
}

function planningError(
  code: WorldTransformationPlanningDiagnosticCode,
  message: string,
  worldTransformationCandidateId?: string,
): WorldTransformationPlanningError {
  return new WorldTransformationPlanningError(code, message, worldTransformationCandidateId);
}
