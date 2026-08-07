import type {
  ProjectEntityAssetRevisionRef,
  ProjectEntityInspectorBlocker,
  ProjectEntityInspectorInteractionContext,
  ProjectEntityInspectorOperation,
  ProjectEntityInspectorProjection,
  ProjectEntityFactValue,
  ProjectEntityRecord,
} from '../contracts/index';
import { contentLocatorsEqual } from '@neko/content';
import type { ProjectEntityManagementProjection } from './projectEntityManagementProjection';

export interface ProjectEntityInspectorOwnerCapabilities {
  readonly publish?: boolean;
  readonly availableAssetRevision?: ProjectEntityAssetRevisionRef;
  readonly provenanceAvailability?: 'available' | 'unavailable' | 'remote-tombstone';
  readonly reference?: { readonly conversationId: string };
  readonly characterDialogue?: {
    readonly characterId: string;
    readonly conversationId?: string;
  };
  readonly roomOpen?: { readonly roomId: string };
  readonly characterEmbody?: {
    readonly characterId: string;
    readonly conversationId: string;
  };
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
      facts: {},
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
    if (input.capabilities?.publish) operations.push('publish');
    if (entity.provenance && input.capabilities?.availableAssetRevision) {
      operations.push('diff', 'apply-update');
    }
  }
  const interaction = interactionContext(input.capabilities);
  if (input.capabilities?.reference) operations.push('reference');
  if (entity.kind === 'character' && input.capabilities?.characterDialogue) {
    operations.push('character-dialogue');
  }
  if (entity.kind === 'character' && input.capabilities?.roomOpen) operations.push('room-open');
  if (entity.kind === 'character' && input.capabilities?.characterEmbody) {
    operations.push('character-embody');
  }
  return {
    status: input.projection.status,
    kind: entity.kind,
    names: entity.names,
    facts: entity.facts,
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
    ...(entity.provenance
      ? {
          provenance: {
            origin: entity.provenance.origin,
            applied: entity.provenance.applied,
            ...(input.capabilities?.availableAssetRevision
              ? { available: input.capabilities.availableAssetRevision }
              : {}),
            localModifications: hasLocalModifications(entity),
            availability: input.capabilities?.provenanceAvailability ?? 'unknown',
          },
        }
      : {}),
    operations: availableOperations(operations, blockers),
    ...(interaction ? { interaction } : {}),
    blockers,
  };
}

function interactionContext(
  capabilities: ProjectEntityInspectorOwnerCapabilities | undefined,
): ProjectEntityInspectorInteractionContext | undefined {
  const conversationId =
    capabilities?.characterEmbody?.conversationId ??
    capabilities?.characterDialogue?.conversationId ??
    capabilities?.reference?.conversationId;
  const characterId =
    capabilities?.characterEmbody?.characterId ?? capabilities?.characterDialogue?.characterId;
  const roomId = capabilities?.roomOpen?.roomId;
  return conversationId || characterId || roomId
    ? {
        ...(conversationId ? { conversationId } : {}),
        ...(characterId ? { characterId } : {}),
        ...(roomId ? { roomId } : {}),
      }
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

function hasLocalModifications(entity: ProjectEntityRecord): boolean {
  const base = entity.provenance?.importBase;
  if (!base) return false;
  return (
    entity.kind !== base.kind ||
    entity.names.canonical !== base.names.canonical ||
    entity.names.display !== base.names.display ||
    entity.names.aliases.length !== base.names.aliases.length ||
    entity.names.aliases.some((alias, index) => alias !== base.names.aliases[index]) ||
    !factRecordsEqual(entity.facts, base.facts) ||
    entity.representations.length !== base.representations.length ||
    entity.representations.some((binding, index) => {
      const baseBinding = base.representations[index];
      return (
        !baseBinding ||
        binding.bindingId !== baseBinding.bindingId ||
        binding.role !== baseBinding.role ||
        binding.source !== baseBinding.source ||
        binding.isDefault !== baseBinding.isDefault ||
        !contentLocatorsEqual(binding.target, baseBinding.target)
      );
    })
  );
}

function factRecordsEqual(
  left: Readonly<Record<string, ProjectEntityFactValue>>,
  right: Readonly<Record<string, ProjectEntityFactValue>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => key in right && factValuesEqual(left[key], right[key]))
  );
}

function factValuesEqual(
  left: ProjectEntityFactValue | undefined,
  right: ProjectEntityFactValue | undefined,
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined || left === null || right === null) return false;
  if (isFactArray(left) || isFactArray(right)) {
    return (
      isFactArray(left) &&
      isFactArray(right) &&
      left.length === right.length &&
      left.every((value, index) => factValuesEqual(value, right[index]))
    );
  }
  if (typeof left === 'object' || typeof right === 'object') {
    return (
      typeof left === 'object' &&
      typeof right === 'object' &&
      !isFactArray(left) &&
      !isFactArray(right) &&
      factRecordsEqual(left, right)
    );
  }
  return false;
}

function isFactArray(value: ProjectEntityFactValue): value is readonly ProjectEntityFactValue[] {
  return Array.isArray(value);
}
