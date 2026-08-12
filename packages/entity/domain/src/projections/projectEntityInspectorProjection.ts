import type {
  ProjectEntityInspectorBlocker,
  ProjectEntityInspectorInteractionContext,
  ProjectEntityInspectorOperation,
  ProjectEntityInspectorProjection,
} from '../contracts/index';
import type { ProjectEntityManagementProjection } from './projectEntityManagementProjection';

export interface ProjectEntityInspectorOwnerCapabilities {
  readonly reference?: { readonly conversationId: string };
  readonly blockers?: readonly ProjectEntityInspectorBlocker[];
}

export function projectEntityInspector(input: {
  readonly projection: ProjectEntityManagementProjection;
  readonly capabilities?: ProjectEntityInspectorOwnerCapabilities;
}): ProjectEntityInspectorProjection {
  const blockers = input.capabilities?.blockers ?? [];
  if (input.projection.status === 'candidate') {
    const candidate = input.projection.candidate;
    return {
      status: 'candidate',
      kind: candidate.kind,
      names: candidate.proposedNames,
      candidateId: candidate.candidateId,
      evidence: candidate.evidence.map((evidence) => ({
        evidenceId: evidence.evidenceId,
        owner: evidence.owner,
        sourceId: evidence.sourceId,
        ...(evidence.label ? { label: evidence.label } : {}),
        ...(evidence.confidence === undefined ? {} : { confidence: evidence.confidence }),
      })),
      bindings: [],
      operations: availableOperations(['confirm', 'merge'], blockers),
      blockers,
    };
  }

  const entity = input.projection.entity;
  const availabilityByBinding = new Map(
    input.projection.bindingAvailability.map((binding) => [binding.bindingId, binding]),
  );
  const operations: ProjectEntityInspectorOperation[] = [];
  if (input.projection.status !== 'deprecated') {
    operations.push('edit', 'bind', 'merge', 'deprecate');
    if (entity.representations.length > 0) operations.push('unbind');
  }
  const interaction = interactionContext(input.capabilities);
  if (input.capabilities?.reference) operations.push('reference');
  return {
    status: input.projection.status,
    kind: entity.kind,
    names: entity.names,
    entityId: entity.entityId,
    bindings: entity.representations.map((binding) => {
      const availability = availabilityByBinding.get(binding.bindingId);
      return {
        bindingId: binding.bindingId,
        role: binding.role,
        target: binding.target,
        availability: availability?.availability ?? 'unknown',
        ...(availability?.attention?.action
          ? { attentionAction: availability.attention.action }
          : {}),
      };
    }),
    operations: availableOperations(operations, blockers),
    ...(interaction ? { interaction } : {}),
    blockers,
  };
}

function interactionContext(
  capabilities: ProjectEntityInspectorOwnerCapabilities | undefined,
): ProjectEntityInspectorInteractionContext | undefined {
  return capabilities?.reference
    ? { conversationId: capabilities.reference.conversationId }
    : undefined;
}

function availableOperations(
  operations: readonly ProjectEntityInspectorOperation[],
  blockers: readonly ProjectEntityInspectorBlocker[],
): readonly ProjectEntityInspectorOperation[] {
  return operations.filter(
    (operation) => !blockers.some((blocker) => blocker.operation === operation),
  );
}
