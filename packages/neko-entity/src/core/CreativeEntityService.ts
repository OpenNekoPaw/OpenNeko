import type {
  CreativeEntity,
  CreativeEntityCandidate,
  CreativeEntityChangeEvent,
  CreativeEntityChangedRef,
  CreativeEntityKind,
  CreativeEntityLifecycleAction,
  CreativeEntityMergeResult,
  CreativeEntityOperationResult,
  CreativeEntityQuery,
  CreativeEntityRef,
  EntityAssetBinding,
  EntityAssetRequirement,
  VisualIdentityDraft,
} from '@neko/shared';
import { isCreativeEntityKind } from '@neko/shared';
import { buildEntityId, normalizeAliasList, stableIdPart } from './adapters';
import { EntityCandidateStore, type CreateEntityCandidateInput } from './candidateStore';
import { ProjectEntityStore } from './entityStore';
import {
  EntityAssetBindingService,
  EntityAssetRequirementService,
  VisualIdentityDraftService,
} from './factStores';
import type { EntityRuntimePorts } from './ports';
import { nowFromPorts } from './ports';
import {
  resolveCharacterRegistryPath,
  resolveEntityAssetBindingsPath,
  resolveEntityAssetRequirementsPath,
  resolveEntityCandidateFilePath,
  resolveProjectEntityFilePath,
  resolveVisualIdentityDraftsPath,
} from './paths';

export interface CreativeEntityServiceOptions {
  readonly projectRoot: string;
  readonly ports: EntityRuntimePorts;
  readonly store?: ProjectEntityStore;
  readonly candidates?: EntityCandidateStore;
  readonly bindings?: EntityAssetBindingService;
  readonly requirements?: EntityAssetRequirementService;
  readonly drafts?: VisualIdentityDraftService;
}

export interface ConfirmEntityCandidateInput {
  readonly candidateId: string;
  readonly kind?: CreativeEntityKind;
  readonly entityId?: string;
  readonly displayName?: string;
  readonly aliases?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface MergeEntityCandidateInput {
  readonly candidateId: string;
  readonly entityId: string;
  readonly asAlias?: boolean;
}

export interface CreateEntityInput {
  readonly kind: CreativeEntityKind;
  readonly canonicalName: string;
  readonly displayName?: string;
  readonly aliases?: readonly string[];
  readonly metadata?: Record<string, unknown>;
  readonly id?: string;
}

export interface RenameEntityInput {
  readonly entityId: string;
  readonly canonicalName: string;
  readonly keepPreviousAsAlias?: boolean;
}

export interface MergeEntitiesInput {
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
}

export interface EntityAssetBindingLifecycleInput {
  readonly bindingIds: readonly string[];
  readonly orphanedAt?: string;
}

export interface NameEntityCandidateInput {
  readonly candidateId: string;
  readonly name: string;
  readonly aliases?: readonly string[];
}

export class CreativeEntityService {
  private generation = 0;
  readonly store: ProjectEntityStore;
  readonly candidates: EntityCandidateStore;
  readonly bindings: EntityAssetBindingService;
  readonly requirements: EntityAssetRequirementService;
  readonly drafts: VisualIdentityDraftService;

  constructor(private readonly options: CreativeEntityServiceOptions) {
    this.store = options.store ?? new ProjectEntityStore(options);
    this.candidates = options.candidates ?? new EntityCandidateStore(options);
    this.bindings = options.bindings ?? new EntityAssetBindingService(options);
    this.requirements = options.requirements ?? new EntityAssetRequirementService(options);
    this.drafts = options.drafts ?? new VisualIdentityDraftService(options);
  }

  async list(query: CreativeEntityQuery = {}): Promise<readonly CreativeEntity[]> {
    return this.store.list(query);
  }

  async get(id: string): Promise<CreativeEntity | undefined> {
    return this.store.get(id);
  }

  async resolveByName(
    name: string,
    kind?: CreativeEntityKind,
  ): Promise<CreativeEntity | undefined> {
    return this.store.resolveByName(name, kind);
  }

  async listCandidates(
    status?: CreativeEntityCandidate['status'],
  ): Promise<readonly CreativeEntityCandidate[]> {
    return this.candidates.list(status);
  }

  async proposeCandidate(input: CreateEntityCandidateInput): Promise<CreativeEntityCandidate> {
    const candidate = await this.candidates.propose(input);
    this.emit('store-refresh', [
      {
        kind: 'candidate',
        id: candidate.id,
        factRef: resolveEntityCandidateFilePath(this.options.projectRoot),
      },
    ]);
    return candidate;
  }

  async createEntity(input: CreateEntityInput): Promise<CreativeEntityOperationResult> {
    const entity = await this.store.create(input);
    return this.result(
      'create',
      [entity],
      [entityChangedRef(entity, this.factRefForEntity(entity))],
    );
  }

  async confirmCandidate(
    input: ConfirmEntityCandidateInput,
  ): Promise<CreativeEntityOperationResult> {
    const candidate = await this.candidates.get(input.candidateId);
    if (!candidate) {
      throw new Error(`Unknown creative entity candidate: ${input.candidateId}`);
    }
    const kind = input.kind ?? candidate.kind;
    if (!isCreativeEntityKind(kind)) {
      throw new Error(`Invalid creative entity kind: ${String(kind)}`);
    }

    const entity: CreativeEntity = {
      id: input.entityId ?? buildEntityId(kind, candidate.name),
      kind,
      canonicalName: candidate.name,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      aliases: normalizeAliasList([...(candidate.aliases ?? []), ...(input.aliases ?? [])]),
      status: 'confirmed',
      metadata: {
        ...(candidate.metadata ?? {}),
        ...(input.metadata ?? {}),
        candidateId: candidate.id,
        provenance: candidate.provenance,
      },
    };
    await this.store.upsert(entity);
    const updatedCandidate = candidateWithStatus(candidate, 'confirmed', this.entityRef(entity), {
      ports: this.options.ports,
    });
    await this.candidates.upsert(updatedCandidate);

    return this.result(
      'confirm-candidate',
      [entity],
      [
        entityChangedRef(entity, this.factRefForEntity(entity)),
        {
          kind: 'candidate',
          id: candidate.id,
          entityRef: this.entityRef(entity),
          factRef: resolveEntityCandidateFilePath(this.options.projectRoot),
        },
      ],
    );
  }

  async rejectCandidate(candidateId: string): Promise<CreativeEntityOperationResult> {
    return this.updateCandidateStatus('reject-candidate', candidateId, 'rejected');
  }

  async dismissCandidate(candidateId: string): Promise<CreativeEntityOperationResult> {
    return this.updateCandidateStatus('dismiss-candidate', candidateId, 'dismissed');
  }

  async mergeCandidateIntoExisting(
    input: MergeEntityCandidateInput,
  ): Promise<CreativeEntityOperationResult> {
    const [candidate, entity] = await Promise.all([
      this.candidates.get(input.candidateId),
      this.store.get(input.entityId),
    ]);
    if (!candidate) {
      throw new Error(`Unknown creative entity candidate: ${input.candidateId}`);
    }
    if (!entity) {
      throw new Error(`Unknown creative entity: ${input.entityId}`);
    }

    const aliases =
      input.asAlias === false
        ? entity.aliases
        : normalizeAliasList([...entity.aliases, candidate.name, ...(candidate.aliases ?? [])]);
    const next: CreativeEntity = {
      ...entity,
      aliases,
      metadata: {
        ...(entity.metadata ?? {}),
        candidateProvenance: [
          ...readMetadataArray(entity.metadata?.['candidateProvenance']),
          ...candidate.provenance,
        ],
      },
    };
    await this.store.upsert(next);
    await this.candidates.upsert(
      candidateWithStatus(candidate, 'merged', this.entityRef(next), { ports: this.options.ports }),
    );

    return this.result(
      'merge-candidate',
      [next],
      [
        entityChangedRef(next, this.factRefForEntity(next)),
        {
          kind: 'candidate',
          id: candidate.id,
          entityRef: this.entityRef(next),
          factRef: resolveEntityCandidateFilePath(this.options.projectRoot),
        },
      ],
    );
  }

  async renameEntity(input: RenameEntityInput): Promise<CreativeEntityOperationResult> {
    const entity = await this.requireEntity(input.entityId);
    const aliases = input.keepPreviousAsAlias
      ? normalizeAliasList([...entity.aliases, entity.canonicalName])
      : entity.aliases;
    const next: CreativeEntity = {
      ...entity,
      canonicalName: input.canonicalName,
      aliases,
    };
    await this.store.upsert(next);
    return this.result('rename', [next], [entityChangedRef(next, this.factRefForEntity(next))]);
  }

  async updateDisplayName(
    entityId: string,
    displayName: string | undefined,
  ): Promise<CreativeEntityOperationResult> {
    const entity = await this.requireEntity(entityId);
    const next: CreativeEntity = displayName ? { ...entity, displayName } : omitDisplayName(entity);
    await this.store.upsert(next);
    return this.result(
      'update-display-name',
      [next],
      [entityChangedRef(next, this.factRefForEntity(next))],
    );
  }

  async addAlias(entityId: string, alias: string): Promise<CreativeEntityOperationResult> {
    const entity = await this.requireEntity(entityId);
    const next: CreativeEntity = {
      ...entity,
      aliases: normalizeAliasList([...entity.aliases, alias]),
    };
    await this.store.upsert(next);
    return this.result('add-alias', [next], [entityChangedRef(next, this.factRefForEntity(next))]);
  }

  async removeAlias(entityId: string, alias: string): Promise<CreativeEntityOperationResult> {
    const entity = await this.requireEntity(entityId);
    const key = alias.trim().toLocaleLowerCase();
    const next: CreativeEntity = {
      ...entity,
      aliases: entity.aliases.filter((candidate) => candidate.trim().toLocaleLowerCase() !== key),
    };
    await this.store.upsert(next);
    return this.result(
      'remove-alias',
      [next],
      [entityChangedRef(next, this.factRefForEntity(next))],
    );
  }

  async updateMetadata(
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<CreativeEntityOperationResult> {
    const entity = await this.requireEntity(entityId);
    const next: CreativeEntity = {
      ...entity,
      metadata: {
        ...(entity.metadata ?? {}),
        ...metadata,
      },
    };
    await this.store.upsert(next);
    return this.result(
      'update-metadata',
      [next],
      [entityChangedRef(next, this.factRefForEntity(next))],
    );
  }

  async deprecateEntity(entityId: string): Promise<CreativeEntityOperationResult> {
    return this.updateStatus('deprecate', entityId, 'deprecated');
  }

  async reactivateEntity(entityId: string): Promise<CreativeEntityOperationResult> {
    return this.updateStatus('reactivate', entityId, 'confirmed');
  }

  async mergeEntities(input: MergeEntitiesInput): Promise<CreativeEntityMergeResult> {
    const [source, target] = await Promise.all([
      this.requireEntity(input.sourceEntityId),
      this.requireEntity(input.targetEntityId),
    ]);
    if (source.kind !== target.kind) {
      throw new Error('Cannot merge creative entities with different kinds.');
    }

    const survivor: CreativeEntity = {
      ...target,
      aliases: normalizeAliasList([
        ...target.aliases,
        source.canonicalName,
        ...(source.displayName ? [source.displayName] : []),
        ...source.aliases,
      ]),
      metadata: {
        ...(target.metadata ?? {}),
        mergedEntityIds: Array.from(
          new Set([...readStringArray(target.metadata?.['mergedEntityIds']), source.id]),
        ),
      },
    };
    const deprecatedSource: CreativeEntity = {
      ...source,
      status: 'deprecated',
      metadata: {
        ...(source.metadata ?? {}),
        mergedIntoEntityId: target.id,
      },
    };
    await Promise.all([this.store.upsert(survivor), this.store.upsert(deprecatedSource)]);
    await this.retargetEntityOwnedFacts(source, survivor);

    const base = this.result(
      'merge',
      [survivor, deprecatedSource],
      [
        entityChangedRef(survivor, this.factRefForEntity(survivor)),
        entityChangedRef(deprecatedSource, this.factRefForEntity(deprecatedSource)),
        {
          kind: 'binding',
          id: source.id,
          entityRef: this.entityRef(survivor),
          factRef: resolveEntityAssetBindingsPath(this.options.projectRoot),
        },
        {
          kind: 'requirement',
          id: source.id,
          entityRef: this.entityRef(survivor),
          factRef: resolveEntityAssetRequirementsPath(this.options.projectRoot),
        },
        {
          kind: 'visual-draft',
          id: source.id,
          entityRef: this.entityRef(survivor),
          factRef: resolveVisualIdentityDraftsPath(this.options.projectRoot),
        },
      ],
    );
    return {
      ...base,
      survivingEntityRef: this.entityRef(survivor),
      mergedEntityRefs: [this.entityRef(deprecatedSource)],
    };
  }

  async upsertBinding(binding: EntityAssetBinding): Promise<CreativeEntityOperationResult> {
    await this.bindings.upsert(binding);
    const entity = await this.store.get(binding.entityId);
    return this.result('bind', entity ? [entity] : [], [
      {
        kind: 'binding',
        id: binding.id,
        entityRef: {
          entityId: binding.entityId,
          entityKind: binding.entityKind,
          projectRoot: this.options.projectRoot,
        },
        factRef: resolveEntityAssetBindingsPath(this.options.projectRoot),
      },
    ]);
  }

  async setDefaultBinding(binding: EntityAssetBinding): Promise<CreativeEntityOperationResult> {
    await this.bindings.setDefault(binding);
    const entity = await this.store.get(binding.entityId);
    return this.result('set-default-binding', entity ? [entity] : [], [
      {
        kind: 'binding',
        id: binding.id,
        entityRef: {
          entityId: binding.entityId,
          entityKind: binding.entityKind,
          projectRoot: this.options.projectRoot,
        },
        factRef: resolveEntityAssetBindingsPath(this.options.projectRoot),
      },
    ]);
  }

  async unbindAsset(bindingId: string): Promise<CreativeEntityOperationResult> {
    const binding = (await this.bindings.list()).find((candidate) => candidate.id === bindingId);
    await this.bindings.remove(bindingId);
    const entity = binding ? await this.store.get(binding.entityId) : undefined;
    return this.result('unbind', entity ? [entity] : [], [
      {
        kind: 'binding',
        id: bindingId,
        ...(binding
          ? {
              entityRef: {
                entityId: binding.entityId,
                entityKind: binding.entityKind,
                projectRoot: this.options.projectRoot,
              },
            }
          : {}),
        factRef: resolveEntityAssetBindingsPath(this.options.projectRoot),
      },
    ]);
  }

  async markBindingsOrphaned(
    input: EntityAssetBindingLifecycleInput,
  ): Promise<CreativeEntityOperationResult> {
    return this.updateBindingAvailability('mark-binding-orphaned', input.bindingIds, (binding) => {
      if (binding.availability === 'orphaned') return binding;
      return {
        ...binding,
        availability: 'orphaned',
        orphanedAt: input.orphanedAt ?? nowFromPorts(this.options.ports),
        updatedAt: nowFromPorts(this.options.ports),
      };
    });
  }

  async restoreOrphanedBindings(
    input: EntityAssetBindingLifecycleInput,
  ): Promise<CreativeEntityOperationResult> {
    return this.updateBindingAvailability('restore-binding', input.bindingIds, (binding) => {
      if (binding.availability !== 'orphaned') return binding;
      const { orphanedAt: _orphanedAt, ...rest } = binding;
      return {
        ...rest,
        availability: 'active',
        updatedAt: nowFromPorts(this.options.ports),
      };
    });
  }

  async archiveBindings(
    input: EntityAssetBindingLifecycleInput,
  ): Promise<CreativeEntityOperationResult> {
    return this.updateBindingAvailability('archive-binding', input.bindingIds, (binding) => {
      if (binding.availability === 'archived') return binding;
      const { orphanedAt: _orphanedAt, ...rest } = binding;
      return {
        ...rest,
        availability: 'archived',
        updatedAt: nowFromPorts(this.options.ports),
      };
    });
  }

  async nameCandidate(input: NameEntityCandidateInput): Promise<CreativeEntityOperationResult> {
    const candidate = await this.candidates.get(input.candidateId);
    if (!candidate) {
      throw new Error(`Unknown creative entity candidate: ${input.candidateId}`);
    }
    const name = input.name.trim();
    if (!name) {
      throw new Error('Candidate name cannot be empty.');
    }
    const existingEntity = await this.resolveByName(name, candidate.kind);
    if (existingEntity) {
      throw new Error(`Creative entity name already exists: ${name}`);
    }
    const normalizedTarget = name.toLocaleLowerCase();
    const openCandidates = await this.candidates.list('open');
    const duplicateCandidate = openCandidates.find((item) => {
      if (item.id === candidate.id || item.kind !== candidate.kind) return false;
      if (item.identityBasis !== 'user-named') return false;
      const names = [item.name, ...(item.aliases ?? [])].map((value) => value.toLocaleLowerCase());
      return names.includes(normalizedTarget);
    });
    if (duplicateCandidate) {
      throw new Error(`Creative entity candidate name already exists: ${name}`);
    }

    const updated = await this.candidates.update(candidate.id, (current) => ({
      ...current,
      name,
      aliases: normalizeAliasList([...(current.aliases ?? []), ...(input.aliases ?? [])]),
      identityBasis: 'user-named',
      updatedAt: nowFromPorts(this.options.ports),
    }));
    if (!updated) {
      throw new Error(`Unknown creative entity candidate: ${input.candidateId}`);
    }
    return this.result(
      'name-candidate',
      [],
      [
        {
          kind: 'candidate',
          id: candidate.id,
          factRef: resolveEntityCandidateFilePath(this.options.projectRoot),
        },
      ],
    );
  }

  async upsertRequirement(
    requirement: EntityAssetRequirement,
  ): Promise<CreativeEntityOperationResult> {
    await this.requirements.upsert(requirement);
    const entity = await this.store.get(requirement.entityId);
    return this.result('update-requirement', entity ? [entity] : [], [
      {
        kind: 'requirement',
        id: requirement.id,
        entityRef: {
          entityId: requirement.entityId,
          entityKind: requirement.entityKind,
          projectRoot: this.options.projectRoot,
        },
        factRef: resolveEntityAssetRequirementsPath(this.options.projectRoot),
      },
    ]);
  }

  async upsertVisualDraft(draft: VisualIdentityDraft): Promise<CreativeEntityOperationResult> {
    await this.drafts.upsert(draft);
    const entity = await this.store.get(draft.characterId);
    return this.result('update-visual-draft', entity ? [entity] : [], [
      {
        kind: 'visual-draft',
        id: draft.id,
        entityRef: {
          entityId: draft.characterId,
          entityKind: 'character',
          projectRoot: this.options.projectRoot,
        },
        factRef: resolveVisualIdentityDraftsPath(this.options.projectRoot),
      },
    ]);
  }

  private async updateCandidateStatus(
    action: 'reject-candidate' | 'dismiss-candidate',
    candidateId: string,
    status: CreativeEntityCandidate['status'],
  ): Promise<CreativeEntityOperationResult> {
    const candidate = await this.candidates.get(candidateId);
    if (!candidate) {
      throw new Error(`Unknown creative entity candidate: ${candidateId}`);
    }
    await this.candidates.upsert(
      candidateWithStatus(candidate, status, undefined, { ports: this.options.ports }),
    );
    return this.result(
      action,
      [],
      [
        {
          kind: 'candidate',
          id: candidate.id,
          factRef: resolveEntityCandidateFilePath(this.options.projectRoot),
        },
      ],
    );
  }

  private async updateStatus(
    action: 'deprecate' | 'reactivate',
    entityId: string,
    status: CreativeEntity['status'],
  ): Promise<CreativeEntityOperationResult> {
    const entity = await this.requireEntity(entityId);
    const next: CreativeEntity = { ...entity, status };
    await this.store.upsert(next);
    return this.result(action, [next], [entityChangedRef(next, this.factRefForEntity(next))]);
  }

  private async updateBindingAvailability(
    action: 'mark-binding-orphaned' | 'restore-binding' | 'archive-binding',
    bindingIds: readonly string[],
    operation: (binding: EntityAssetBinding) => EntityAssetBinding,
  ): Promise<CreativeEntityOperationResult> {
    const idSet = new Set(bindingIds);
    const bindings = await this.bindings.list();
    const changed: EntityAssetBinding[] = [];
    const nextBindings = bindings.map((binding) => {
      if (!idSet.has(binding.id)) return binding;
      const next = operation(binding);
      if (next !== binding) {
        changed.push(next);
      }
      return next;
    });
    if (changed.length > 0) {
      await this.bindings.replaceAll(nextBindings);
    }
    const entities = await this.entitiesForBindings(changed);
    return this.result(
      action,
      entities,
      changed.map((binding) => bindingChangedRef(binding, this.options.projectRoot)),
    );
  }

  private async entitiesForBindings(
    bindings: readonly EntityAssetBinding[],
  ): Promise<readonly CreativeEntity[]> {
    const entities: CreativeEntity[] = [];
    const seen = new Set<string>();
    for (const binding of bindings) {
      const key = `${binding.entityKind}:${binding.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entity = await this.store.get(binding.entityId);
      if (entity) {
        entities.push(entity);
      }
    }
    return entities;
  }

  private async requireEntity(id: string): Promise<CreativeEntity> {
    const entity = await this.store.get(id);
    if (!entity) {
      throw new Error(`Unknown creative entity: ${id}`);
    }
    return entity;
  }

  private async retargetEntityOwnedFacts(
    source: CreativeEntity,
    target: CreativeEntity,
  ): Promise<void> {
    const [bindings, requirements, drafts] = await Promise.all([
      this.bindings.list(),
      this.requirements.list(),
      this.drafts.list(),
    ]);
    await Promise.all([
      this.bindings.replaceAll(
        bindings.map((binding) =>
          binding.entityId === source.id && binding.entityKind === source.kind
            ? { ...binding, entityId: target.id, entityKind: target.kind }
            : binding,
        ),
      ),
      this.requirements.replaceAll(
        requirements.map((requirement) =>
          requirement.entityId === source.id && requirement.entityKind === source.kind
            ? { ...requirement, entityId: target.id, entityKind: target.kind }
            : requirement,
        ),
      ),
      this.drafts.replaceAll(
        source.kind === 'character'
          ? drafts.map((draft) =>
              draft.characterId === source.id ? { ...draft, characterId: target.id } : draft,
            )
          : drafts,
      ),
    ]);
  }

  private result(
    action: CreativeEntityLifecycleAction,
    entities: readonly CreativeEntity[],
    changedRefs: readonly CreativeEntityChangedRef[],
  ): CreativeEntityOperationResult {
    const updatedAt = nowFromPorts(this.options.ports);
    const generation = this.nextGeneration();
    const event: CreativeEntityChangeEvent = {
      projectRoot: this.options.projectRoot,
      reason: action,
      changedRefs,
      generation,
      freshness: 'fresh',
      updatedAt,
    };
    this.options.ports.events?.emit(event);
    return {
      ok: true,
      action,
      projectRoot: this.options.projectRoot,
      affectedEntityRefs: entities.map((entity) => this.entityRef(entity)),
      changedRefs,
      generation,
      freshness: 'fresh',
      updatedAt,
    };
  }

  private emit(
    reason: CreativeEntityChangeEvent['reason'],
    changedRefs: readonly CreativeEntityChangedRef[],
  ): void {
    this.options.ports.events?.emit({
      projectRoot: this.options.projectRoot,
      reason,
      changedRefs,
      generation: this.nextGeneration(),
      freshness: 'fresh',
      updatedAt: nowFromPorts(this.options.ports),
    });
  }

  private nextGeneration(): number {
    this.generation += 1;
    return this.generation;
  }

  private entityRef(entity: CreativeEntity): CreativeEntityRef {
    return {
      entityId: entity.id,
      entityKind: entity.kind,
      projectRoot: this.options.projectRoot,
      source: 'neko-entity',
    };
  }

  private factRefForEntity(entity: CreativeEntity): string {
    return entity.kind === 'character'
      ? resolveCharacterRegistryPath(this.options.projectRoot)
      : resolveProjectEntityFilePath(this.options.projectRoot, entity.kind);
  }
}

function candidateWithStatus(
  candidate: CreativeEntityCandidate,
  status: CreativeEntityCandidate['status'],
  resolvedEntityRef: CreativeEntityRef | undefined,
  context: Pick<CreativeEntityServiceOptions, 'ports'>,
): CreativeEntityCandidate {
  return {
    ...candidate,
    status,
    ...(resolvedEntityRef ? { resolvedEntityRef } : {}),
    updatedAt: nowFromPorts(context.ports),
  };
}

function entityChangedRef(entity: CreativeEntity, factRef: string): CreativeEntityChangedRef {
  return {
    kind: 'entity',
    id: entity.id,
    entityRef: { entityId: entity.id, entityKind: entity.kind },
    factRef,
  };
}

function bindingChangedRef(
  binding: EntityAssetBinding,
  projectRoot: string,
): CreativeEntityChangedRef {
  return {
    kind: 'binding',
    id: binding.id,
    entityRef: {
      entityId: binding.entityId,
      entityKind: binding.entityKind,
      projectRoot,
    },
    factRef: resolveEntityAssetBindingsPath(projectRoot),
  };
}

function omitDisplayName(entity: CreativeEntity): CreativeEntity {
  const { displayName: _displayName, ...rest } = entity;
  return rest;
}

function readMetadataArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function buildBindingId(input: {
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
  readonly role: string;
  readonly assetRef: string;
}): string {
  return `binding:${input.entityKind}:${stableIdPart(input.entityId)}:${stableIdPart(input.role)}:${stableIdPart(input.assetRef)}`;
}
