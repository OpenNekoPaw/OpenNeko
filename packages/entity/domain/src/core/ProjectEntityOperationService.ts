import {
  PROJECT_ENTITY_REFERENCE_OWNER_IDS,
  ProjectEntityContractError,
  assertProjectEntityDocument,
  createProjectEntityReferenceRewritePlan,
  type ProjectEntityCandidateProjection,
  type ProjectEntityCandidateWorkflowPort,
  type ProjectEntityDocument,
  type ProjectEntityOperationCommitPort,
  type ProjectEntityOperationCommitRequest,
  type ProjectEntityRecord,
  type ProjectEntityFactValue,
  type ProjectEntityNames,
  type ProjectEntityRepresentationBinding,
  type ProjectEntityReferenceOperationKind,
  type ProjectEntityReferenceOperationRequest,
  type ProjectEntityReferenceOwnerReadyPlan,
  type ProjectEntityReferenceRewriteParticipant,
  type ProjectEntitySemanticSnapshot,
} from '../contracts/index';

export interface CreateProjectEntityRequest {
  readonly entityId: string;
  readonly semantic: ProjectEntitySemanticSnapshot;
  readonly createdAt: string;
}

export interface ConfirmProjectEntityCandidateRequest extends CreateProjectEntityRequest {
  readonly candidateId: string;
}

export interface MergeProjectEntityCandidateRequest {
  readonly candidateId: string;
  readonly targetEntityId: string;
  readonly targetSemantic: ProjectEntitySemanticSnapshot;
  readonly updatedAt: string;
}

export interface DismissProjectEntityCandidateRequest {
  readonly candidateId: string;
}

export interface EditProjectEntityRequest {
  readonly entityId: string;
  readonly changes: {
    readonly names?: ProjectEntityNames;
    readonly facts?: Readonly<Record<string, ProjectEntityFactValue>>;
  };
  readonly updatedAt: string;
}

export interface BindProjectEntityRepresentationRequest {
  readonly entityId: string;
  readonly binding: ProjectEntityRepresentationBinding;
  readonly updatedAt: string;
}

export interface UnbindProjectEntityRepresentationRequest {
  readonly entityId: string;
  readonly bindingId: string;
  readonly updatedAt: string;
}

export interface MergeProjectEntitiesRequest {
  readonly operationId: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly targetSemantic: ProjectEntitySemanticSnapshot;
  readonly committedAt: string;
}

export interface DeprecateProjectEntityRequest {
  readonly operationId: string;
  readonly entityId: string;
  readonly replacementEntityId?: string;
  readonly deprecatedAt: string;
}

export interface DeleteProjectEntityRequest {
  readonly operationId: string;
  readonly entityId: string;
}

export interface ProjectEntityOperationServiceOptions {
  readonly candidates: ProjectEntityCandidateWorkflowPort;
  readonly references: readonly ProjectEntityReferenceRewriteParticipant[];
  readonly commits: ProjectEntityOperationCommitPort;
}

export class ProjectEntityOperationService {
  constructor(private readonly options: ProjectEntityOperationServiceOptions) {}

  async create(
    request: CreateProjectEntityRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return this.mutate((current) => {
      ensureEntityMissing(current, request.entityId);
      const record: ProjectEntityRecord = {
        entityId: request.entityId,
        ...request.semantic,
        lifecycle: { state: 'active' },
        createdAt: request.createdAt,
        updatedAt: request.createdAt,
      };
      return { entities: [...current.entities, record] };
    }, signal);
  }

  async confirmCandidate(
    request: ConfirmProjectEntityCandidateRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return this.mutate(async (current) => {
      ensureEntityMissing(current, request.entityId);
      const candidate = await this.requireCandidate(request.candidateId, signal);
      const record: ProjectEntityRecord = {
        entityId: request.entityId,
        ...request.semantic,
        lifecycle: { state: 'active' },
        createdAt: request.createdAt,
        updatedAt: request.createdAt,
      };
      return {
        entities: [...current.entities, record],
        candidateDecision: { kind: 'confirm', candidate },
      };
    }, signal);
  }

  async mergeCandidateInto(
    request: MergeProjectEntityCandidateRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return this.mutate(async (current) => {
      const target = requireActiveEntity(current, request.targetEntityId);
      const candidate = await this.requireCandidate(request.candidateId, signal);
      ensureSameKind(target.kind, request.targetSemantic.kind);
      const updated: ProjectEntityRecord = {
        ...target,
        ...request.targetSemantic,
        updatedAt: request.updatedAt,
      };
      return {
        entities: replaceEntity(current.entities, updated),
        candidateDecision: { kind: 'merge-into', candidate },
      };
    }, signal);
  }

  async dismissCandidate(
    request: DismissProjectEntityCandidateRequest,
    signal?: AbortSignal,
  ): Promise<void> {
    const candidate = await this.requireCandidate(request.candidateId, signal);
    await this.options.candidates.dismiss({ kind: 'dismiss', candidate }, signal);
  }

  async edit(
    request: EditProjectEntityRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return this.mutate((current) => {
      const entity = requireActiveEntity(current, request.entityId);
      if (!request.changes.names && !request.changes.facts) {
        throw operationError(
          'project-entity-operation-invalid',
          'Project Entity edit requires at least one semantic change.',
          { entityId: entity.entityId },
        );
      }
      return {
        entities: replaceEntity(current.entities, {
          ...entity,
          ...(request.changes.names ? { names: request.changes.names } : {}),
          ...(request.changes.facts ? { facts: request.changes.facts } : {}),
          updatedAt: request.updatedAt,
        }),
      };
    }, signal);
  }

  async bind(
    request: BindProjectEntityRepresentationRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return this.mutate((current) => {
      const entity = requireActiveEntity(current, request.entityId);
      if (
        current.entities.some((candidate) =>
          candidate.representations.some(
            (binding) => binding.bindingId === request.binding.bindingId,
          ),
        )
      ) {
        throw operationError(
          'duplicate-project-entity-binding-id',
          `Project Entity binding '${request.binding.bindingId}' already exists.`,
          { entityId: entity.entityId },
        );
      }
      const representations = request.binding.isDefault
        ? [
            ...entity.representations.map((binding) =>
              binding.role === request.binding.role ? withoutDefault(binding) : binding,
            ),
            request.binding,
          ]
        : [...entity.representations, request.binding];
      return {
        entities: replaceEntity(current.entities, {
          ...entity,
          representations,
          updatedAt: request.updatedAt,
        }),
      };
    }, signal);
  }

  async unbind(
    request: UnbindProjectEntityRepresentationRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return this.mutate((current) => {
      const entity = requireActiveEntity(current, request.entityId);
      if (!entity.representations.some((binding) => binding.bindingId === request.bindingId)) {
        throw operationError(
          'project-entity-operation-invalid',
          `Project Entity binding '${request.bindingId}' does not exist.`,
          { entityId: entity.entityId },
        );
      }
      return {
        entities: replaceEntity(current.entities, {
          ...entity,
          representations: entity.representations.filter(
            (binding) => binding.bindingId !== request.bindingId,
          ),
          updatedAt: request.updatedAt,
        }),
      };
    }, signal);
  }

  async merge(
    request: MergeProjectEntitiesRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return this.commitWithReferences((current) => {
      const source = requireActiveEntity(current, request.sourceEntityId);
      const target = requireActiveEntity(current, request.targetEntityId);
      ensureDistinctEntities(source, target);
      ensureSameKind(source.kind, target.kind);
      ensureSameKind(target.kind, request.targetSemantic.kind);
      return {
        operation: referenceOperation(current, request.operationId, 'merge', source, target),
        entities: replaceEntity(
          replaceEntity(current.entities, {
            ...source,
            lifecycle: {
              state: 'deprecated',
              deprecatedAt: request.committedAt,
              replacementEntityId: target.entityId,
            },
            updatedAt: request.committedAt,
          }),
          { ...target, ...request.targetSemantic, updatedAt: request.committedAt },
        ),
      };
    }, signal);
  }

  async deprecate(
    request: DeprecateProjectEntityRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return this.commitWithReferences((current) => {
      const source = requireActiveEntity(current, request.entityId);
      const replacement =
        request.replacementEntityId === undefined
          ? undefined
          : requireActiveEntity(current, request.replacementEntityId);
      if (replacement) {
        ensureDistinctEntities(source, replacement);
        ensureSameKind(source.kind, replacement.kind);
      }
      const deprecated: ProjectEntityRecord = {
        ...source,
        lifecycle: {
          state: 'deprecated',
          deprecatedAt: request.deprecatedAt,
          ...(replacement ? { replacementEntityId: replacement.entityId } : {}),
        },
        updatedAt: request.deprecatedAt,
      };
      return {
        operation: referenceOperation(
          current,
          request.operationId,
          'deprecate',
          source,
          replacement,
        ),
        entities: replaceEntity(current.entities, deprecated),
      };
    }, signal);
  }

  async delete(
    request: DeleteProjectEntityRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return this.commitWithReferences((current) => {
      const source = requireEntity(current, request.entityId);
      return {
        operation: referenceOperation(current, request.operationId, 'delete', source),
        entities: current.entities.filter((entity) => entity.entityId !== source.entityId),
      };
    }, signal);
  }

  private async requireCandidate(
    candidateId: string,
    signal?: AbortSignal,
  ): Promise<ProjectEntityCandidateProjection> {
    const candidate = await this.options.candidates.getCandidate(candidateId, signal);
    if (!candidate) {
      throw operationError(
        'project-entity-candidate-not-found',
        `Project Entity candidate '${candidateId}' is unavailable.`,
        { candidateId },
      );
    }
    return candidate;
  }

  private mutate(
    mutation: (
      current: ProjectEntityDocument,
    ) =>
      | ({ readonly entities: readonly ProjectEntityRecord[] } & Omit<
          ProjectEntityOperationCommitRequest,
          'next'
        >)
      | Promise<
          { readonly entities: readonly ProjectEntityRecord[] } & Omit<
            ProjectEntityOperationCommitRequest,
            'next'
          >
        >,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return this.options.commits.commit(async (current) => {
      const { entities, ...effects } = await mutation(current);
      return {
        next: assertProjectEntityDocument({ ...current, entities }),
        ...effects,
      };
    }, signal);
  }

  private async commitWithReferences(
    mutation: (current: ProjectEntityDocument) => {
      readonly entities: readonly ProjectEntityRecord[];
      readonly operation: ProjectEntityReferenceOperationRequest;
    },
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    assertReferenceParticipants(this.options.references);
    const prepared: ProjectEntityReferenceOwnerReadyPlan[] = [];
    try {
      return await this.options.commits.commit(async (current) => {
        const { entities, operation } = mutation(current);
        const ownerPlans = [];
        for (const ownerId of PROJECT_ENTITY_REFERENCE_OWNER_IDS) {
          const participant = this.options.references.find((item) => item.ownerId === ownerId);
          if (!participant) throw operationError('project-entity-reference-plan-incomplete', '');
          const plan = await participant.prepare(operation, signal);
          ownerPlans.push(plan);
          if (plan.status === 'ready') prepared.push(plan);
        }
        const referencePlan = createProjectEntityReferenceRewritePlan({ operation, ownerPlans });
        return {
          next: assertProjectEntityDocument({ ...current, entities }),
          referencePlan,
        };
      }, signal);
    } catch (error: unknown) {
      await abortPrepared(this.options.references, prepared, error);
      throw error;
    }
  }
}

function withoutDefault(
  binding: ProjectEntityRepresentationBinding,
): ProjectEntityRepresentationBinding {
  const { isDefault: _isDefault, ...rest } = binding;
  return rest;
}

function referenceOperation(
  document: ProjectEntityDocument,
  operationId: string,
  operation: ProjectEntityReferenceOperationKind,
  source: ProjectEntityRecord,
  replacement?: ProjectEntityRecord,
): ProjectEntityReferenceOperationRequest {
  return {
    operationId,
    projectId: document.projectId,
    operation,
    source: { entityId: source.entityId, entityKind: source.kind },
    ...(replacement
      ? { replacement: { entityId: replacement.entityId, entityKind: replacement.kind } }
      : {}),
  };
}

function requireEntity(document: ProjectEntityDocument, entityId: string): ProjectEntityRecord {
  const entity = document.entities.find((candidate) => candidate.entityId === entityId);
  if (!entity) {
    throw operationError(
      'project-entity-not-found',
      `Project Entity '${entityId}' does not exist.`,
      { entityId },
    );
  }
  return entity;
}

function requireActiveEntity(
  document: ProjectEntityDocument,
  entityId: string,
): ProjectEntityRecord {
  const entity = requireEntity(document, entityId);
  if (entity.lifecycle.state !== 'active') {
    throw operationError(
      'project-entity-operation-invalid',
      `Project Entity '${entityId}' is not active.`,
      { entityId },
    );
  }
  return entity;
}

function ensureEntityMissing(document: ProjectEntityDocument, entityId: string): void {
  if (!document.entities.some((entity) => entity.entityId === entityId)) return;
  throw operationError(
    'project-entity-operation-invalid',
    `Project Entity '${entityId}' already exists.`,
    { entityId },
  );
}

function ensureDistinctEntities(source: ProjectEntityRecord, target: ProjectEntityRecord): void {
  if (source.entityId !== target.entityId) return;
  throw operationError(
    'project-entity-operation-invalid',
    'Project Entity source and target must be different.',
    { entityId: source.entityId },
  );
}

function ensureSameKind(
  left: ProjectEntityRecord['kind'],
  right: ProjectEntityRecord['kind'],
): void {
  if (left === right) return;
  throw operationError(
    'project-entity-operation-invalid',
    `Project Entity kind mismatch: '${left}' cannot be merged with '${right}'.`,
  );
}

function replaceEntity(
  entities: readonly ProjectEntityRecord[],
  replacement: ProjectEntityRecord,
): readonly ProjectEntityRecord[] {
  return entities.map((entity) =>
    entity.entityId === replacement.entityId ? replacement : entity,
  );
}

function assertReferenceParticipants(
  participants: readonly ProjectEntityReferenceRewriteParticipant[],
): void {
  const ids = participants.map((participant) => participant.ownerId);
  const missing = PROJECT_ENTITY_REFERENCE_OWNER_IDS.filter((ownerId) => !ids.includes(ownerId));
  if (
    new Set(ids).size === ids.length &&
    missing.length === 0 &&
    ids.length === PROJECT_ENTITY_REFERENCE_OWNER_IDS.length
  ) {
    return;
  }
  throw operationError(
    'project-entity-reference-plan-incomplete',
    'Project Entity reference participant registry is incomplete or duplicated.',
  );
}

async function abortPrepared(
  participants: readonly ProjectEntityReferenceRewriteParticipant[],
  plans: readonly ProjectEntityReferenceOwnerReadyPlan[],
  originalError: unknown,
): Promise<void> {
  const settled = await Promise.allSettled(
    plans.map((plan) => {
      const participant = participants.find((item) => item.ownerId === plan.ownerId);
      if (!participant) {
        throw operationError(
          'project-entity-reference-plan-incomplete',
          `Prepared Project Entity reference owner '${plan.ownerId}' is unavailable during abort.`,
        );
      }
      return participant.abort(plan);
    }),
  );
  const abortErrors = settled.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (abortErrors.length > 0) {
    throw new AggregateError(
      [originalError, ...abortErrors],
      'Project Entity reference preparation failed and could not be fully aborted.',
    );
  }
}

function operationError(
  code: ConstructorParameters<typeof ProjectEntityContractError>[0][number]['code'],
  message: string,
  identity: { readonly entityId?: string; readonly candidateId?: string } = {},
): ProjectEntityContractError {
  return new ProjectEntityContractError([{ code, message, ...identity }]);
}
