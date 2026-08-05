import {
  ProjectEntityContractError,
  assertProjectEntityDocument,
  type ProjectEntityAssetConflictResolution,
  type ProjectEntityAssetDiffEntry,
  type ProjectEntityAssetRevisionReader,
  type ProjectEntityAssetRevisionRef,
  type ProjectEntityAssetSnapshot,
  type ProjectEntityAssetUpdateAvailability,
  type ProjectEntityAssetUpdateDiff,
  type ProjectEntityAssetProvenance,
  type ProjectEntityDocument,
  type ProjectEntityDocumentRepository,
  type ProjectEntityOperationCommitPort,
  type ProjectEntityRecord,
  type ProjectEntityRepresentationBinding,
  type ProjectEntityRepresentationOrigin,
  type ProjectEntitySemanticField,
  type ProjectEntitySemanticFieldValue,
  type ProjectEntitySemanticSnapshot,
} from '../contracts/index';

export interface InspectProjectEntityAssetUpdateRequest {
  readonly entityId: string;
  readonly available: ProjectEntityAssetRevisionRef;
}

export interface ApplyProjectEntityAssetUpdateRequest extends InspectProjectEntityAssetUpdateRequest {
  readonly selected: readonly ProjectEntitySemanticField[];
  readonly conflicts: readonly ProjectEntityAssetConflictResolution[];
  readonly updatedAt: string;
}

export interface ProjectEntityAssetUpdateServiceOptions {
  readonly repository: ProjectEntityDocumentRepository;
  readonly assets: ProjectEntityAssetRevisionReader;
  readonly commits: ProjectEntityOperationCommitPort;
  readonly createBindingId: (entityId: string, assetBindingId: string) => string;
}

export class ProjectEntityAssetUpdateService {
  constructor(private readonly options: ProjectEntityAssetUpdateServiceOptions) {}

  async inspect(
    request: InspectProjectEntityAssetUpdateRequest,
    signal?: AbortSignal,
  ): Promise<{
    readonly availability: ProjectEntityAssetUpdateAvailability;
    readonly diff: ProjectEntityAssetUpdateDiff;
  }> {
    const document = await this.options.repository.load(signal);
    const entity = requireImportedEntity(document, request.entityId, request.available);
    const asset = await this.requireSnapshot(request.available, signal);
    return {
      availability: availability(entity, request.available),
      diff: createDiff(entity, asset),
    };
  }

  async apply(
    request: ApplyProjectEntityAssetUpdateRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityRecord> {
    const committed = await this.options.commits.commit(async (document) => {
      const entity = requireImportedEntity(document, request.entityId, request.available);
      const asset = await this.requireSnapshot(request.available, signal);
      const diff = createDiff(entity, asset);
      const selections = new Set(request.selected);
      const resolutions = new Map(
        request.conflicts.map((resolution) => [resolution.field, resolution.resolution]),
      );
      if (
        selections.size !== request.selected.length ||
        resolutions.size !== request.conflicts.length ||
        request.selected.some(
          (field) => diff.entries.find((entry) => entry.field === field)?.status !== 'applicable',
        ) ||
        request.conflicts.some(
          (resolution) =>
            diff.entries.find((entry) => entry.field === resolution.field)?.status !== 'conflict',
        ) ||
        diff.entries.some(
          (entry) => entry.status === 'conflict' && !resolutions.has(entry.field),
        ) ||
        resolutions.get('kind') === 'incoming'
      ) {
        throw updateError(
          'project-entity-operation-invalid',
          'Entity Asset update selections or conflict resolutions are incomplete or invalid.',
        );
      }

      let semantic = cloneSemantic(entity);
      let representationOrigins = retainedRepresentationOrigins(entity, asset.semantic);
      for (const entry of diff.entries) {
        const takeIncoming =
          (entry.status === 'applicable' && selections.has(entry.field)) ||
          (entry.status === 'conflict' && resolutions.get(entry.field) === 'incoming');
        if (!takeIncoming) continue;
        if (entry.field === 'representations') {
          const transformed = instantiateIncomingRepresentations(
            entity,
            asset.semantic.representations,
            this.options.createBindingId,
          );
          semantic = { ...semantic, representations: transformed.representations };
          representationOrigins = transformed.origins;
        } else {
          semantic = applyField(semantic, entry.field, entry.incoming);
        }
      }
      const updated: ProjectEntityRecord = {
        ...entity,
        ...semantic,
        provenance: {
          origin: entity.provenance.origin,
          applied: { ...request.available },
          importBase: cloneSemantic(asset.semantic),
          representationOrigins,
        },
        updatedAt: request.updatedAt,
      };
      return {
        next: assertProjectEntityDocument({
          ...document,
          entities: document.entities.map((candidate) =>
            candidate.entityId === updated.entityId ? updated : candidate,
          ),
        }),
      };
    }, signal);
    const committedEntity = committed.entities.find(
      (candidate) => candidate.entityId === request.entityId,
    );
    if (!committedEntity) {
      throw updateError(
        'invalid-project-entity-asset-snapshot',
        'Entity Asset update commit omitted the updated Project Entity.',
      );
    }
    return committedEntity;
  }

  private async requireSnapshot(
    revision: ProjectEntityAssetRevisionRef,
    signal?: AbortSignal,
  ): Promise<ProjectEntityAssetSnapshot> {
    const snapshot = await this.options.assets.readExact(revision, signal);
    if (!snapshot) {
      throw updateError(
        'project-entity-asset-not-found',
        `Entity Asset '${revision.assetId}' revision '${revision.revision}' is not installed.`,
      );
    }
    if (!sameRevision(snapshot.revision, revision)) {
      throw updateError(
        'invalid-project-entity-asset-snapshot',
        'Entity Asset update reader returned a different revision than requested.',
      );
    }
    return snapshot;
  }
}

export function projectEntityAssetUpdateAvailability(
  entity: ProjectEntityRecord,
  available: ProjectEntityAssetRevisionRef,
): ProjectEntityAssetUpdateAvailability {
  return availability(entity, available);
}

export function diffProjectEntityAssetUpdate(
  entity: ProjectEntityRecord,
  available: ProjectEntityAssetSnapshot,
): ProjectEntityAssetUpdateDiff {
  return createDiff(entity, available);
}

function createDiff(
  entity: ProjectEntityRecord,
  available: ProjectEntityAssetSnapshot,
): ProjectEntityAssetUpdateDiff {
  const provenance = entity.provenance;
  if (!provenance) {
    throw updateError(
      'invalid-project-entity-asset-provenance',
      `Project Entity '${entity.entityId}' was not instantiated from an Entity Asset.`,
    );
  }
  const base = provenance.importBase;
  const current = cloneSemantic(entity);
  const incoming = available.semantic;
  const fields = semanticFields(base, current, incoming);
  const entries = fields.flatMap((field): readonly ProjectEntityAssetDiffEntry[] => {
    const baseValue = fieldValue(base, field);
    const currentValue = comparableCurrentValue(entity, current, field);
    const incomingValue = fieldValue(incoming, field);
    const baseIncomingEqual = valuesEqual(baseValue, incomingValue);
    const baseCurrentEqual = valuesEqual(baseValue, currentValue);
    const currentIncomingEqual = valuesEqual(currentValue, incomingValue);
    if (baseIncomingEqual && baseCurrentEqual) return [];
    const status =
      field === 'kind' && !baseIncomingEqual
        ? 'conflict'
        : baseIncomingEqual
          ? 'local-only'
          : baseCurrentEqual
            ? 'applicable'
            : currentIncomingEqual
              ? 'already-applied'
              : 'conflict';
    return [
      {
        field,
        status,
        base: baseValue,
        current: fieldValue(current, field),
        incoming: incomingValue,
      },
    ];
  });
  return {
    entityId: entity.entityId,
    currentRevision: provenance.applied,
    availableRevision: available.revision,
    entries,
  };
}

function availability(
  entity: ProjectEntityRecord,
  available: ProjectEntityAssetRevisionRef,
): ProjectEntityAssetUpdateAvailability {
  const provenance = entity.provenance;
  if (!provenance || provenance.origin.assetId !== available.assetId) {
    throw updateError(
      'invalid-project-entity-asset-provenance',
      `Project Entity '${entity.entityId}' does not originate from Asset '${available.assetId}'.`,
    );
  }
  return {
    entityId: entity.entityId,
    origin: provenance.origin,
    applied: provenance.applied,
    available,
    status: sameRevision(provenance.applied, available) ? 'current' : 'update-available',
  };
}

function requireImportedEntity(
  document: ProjectEntityDocument,
  entityId: string,
  available: ProjectEntityAssetRevisionRef,
): ProjectEntityRecord & { readonly provenance: ProjectEntityAssetProvenance } {
  const entity = document.entities.find((candidate) => candidate.entityId === entityId);
  if (!entity) {
    throw updateError('project-entity-not-found', `Project Entity '${entityId}' does not exist.`);
  }
  availability(entity, available);
  if (!entity.provenance) {
    throw updateError(
      'invalid-project-entity-asset-provenance',
      `Project Entity '${entity.entityId}' has no Asset provenance.`,
    );
  }
  return { ...entity, provenance: entity.provenance };
}

function semanticFields(
  base: ProjectEntitySemanticSnapshot,
  current: ProjectEntitySemanticSnapshot,
  incoming: ProjectEntitySemanticSnapshot,
): readonly ProjectEntitySemanticField[] {
  const factKeys = new Set([
    ...Object.keys(base.facts),
    ...Object.keys(current.facts),
    ...Object.keys(incoming.facts),
  ]);
  return [
    'kind',
    'names.canonical',
    'names.display',
    'names.aliases',
    ...[...factKeys].sort().map((key) => `facts/${encodeURIComponent(key)}` as const),
    'representations',
  ];
}

function fieldValue(
  semantic: ProjectEntitySemanticSnapshot,
  field: ProjectEntitySemanticField,
): ProjectEntitySemanticFieldValue {
  if (field === 'kind') return semantic.kind;
  if (field === 'names.canonical') return semantic.names.canonical;
  if (field === 'names.display') return semantic.names.display;
  if (field === 'names.aliases') return semantic.names.aliases;
  if (field === 'representations') return semantic.representations;
  return semantic.facts[decodeURIComponent(field.slice('facts/'.length))];
}

function comparableCurrentValue(
  entity: ProjectEntityRecord,
  semantic: ProjectEntitySemanticSnapshot,
  field: ProjectEntitySemanticField,
): ProjectEntitySemanticFieldValue {
  if (field !== 'representations') return fieldValue(semantic, field);
  const origins = new Map(
    entity.provenance?.representationOrigins.map((origin) => [
      origin.projectBindingId,
      origin.assetBindingId,
    ]),
  );
  return semantic.representations.map((binding) => ({
    ...binding,
    bindingId: origins.get(binding.bindingId) ?? `project:${binding.bindingId}`,
  }));
}

function applyField(
  semantic: ProjectEntitySemanticSnapshot,
  field: ProjectEntitySemanticField,
  value: ProjectEntitySemanticFieldValue,
): ProjectEntitySemanticSnapshot {
  if (field === 'kind')
    return { ...semantic, kind: value as ProjectEntitySemanticSnapshot['kind'] };
  if (field === 'names.canonical') {
    return { ...semantic, names: { ...semantic.names, canonical: value as string } };
  }
  if (field === 'names.display') {
    const { display: _display, ...names } = semantic.names;
    return {
      ...semantic,
      names: { ...names, ...(typeof value === 'string' ? { display: value } : {}) },
    };
  }
  if (field === 'names.aliases') {
    return { ...semantic, names: { ...semantic.names, aliases: value as readonly string[] } };
  }
  if (field === 'representations') return semantic;
  const key = decodeURIComponent(field.slice('facts/'.length));
  const facts = { ...semantic.facts };
  if (value === undefined) delete facts[key];
  else facts[key] = value as never;
  return { ...semantic, facts };
}

function instantiateIncomingRepresentations(
  entity: ProjectEntityRecord,
  incoming: readonly ProjectEntityRepresentationBinding[],
  createBindingId: (entityId: string, assetBindingId: string) => string,
): {
  readonly representations: readonly ProjectEntityRepresentationBinding[];
  readonly origins: readonly ProjectEntityRepresentationOrigin[];
} {
  const existing = new Map(
    entity.provenance?.representationOrigins.map((origin) => [
      origin.assetBindingId,
      origin.projectBindingId,
    ]),
  );
  const ids = new Set<string>();
  const origins: ProjectEntityRepresentationOrigin[] = [];
  const representations = incoming.map((binding) => {
    const projectBindingId =
      existing.get(binding.bindingId) ?? createBindingId(entity.entityId, binding.bindingId);
    if (!isStableIdentity(projectBindingId) || ids.has(projectBindingId)) {
      throw updateError(
        'project-entity-operation-invalid',
        'Entity Asset update produced an invalid or duplicate Project binding identity.',
      );
    }
    ids.add(projectBindingId);
    origins.push({ assetBindingId: binding.bindingId, projectBindingId });
    return { ...structuredClone(binding), bindingId: projectBindingId };
  });
  return { representations, origins };
}

function retainedRepresentationOrigins(
  entity: ProjectEntityRecord,
  incoming: ProjectEntitySemanticSnapshot,
): readonly ProjectEntityRepresentationOrigin[] {
  const incomingIds = new Set(incoming.representations.map((binding) => binding.bindingId));
  const currentIds = new Set(entity.representations.map((binding) => binding.bindingId));
  return (
    entity.provenance?.representationOrigins.filter(
      (origin) => incomingIds.has(origin.assetBindingId) && currentIds.has(origin.projectBindingId),
    ) ?? []
  );
}

function cloneSemantic(entity: ProjectEntitySemanticSnapshot): ProjectEntitySemanticSnapshot {
  return {
    kind: entity.kind,
    names: structuredClone(entity.names),
    facts: structuredClone(entity.facts),
    representations: structuredClone(entity.representations),
  };
}

function valuesEqual(
  left: ProjectEntitySemanticFieldValue,
  right: ProjectEntitySemanticFieldValue,
): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: ProjectEntitySemanticFieldValue): string {
  return JSON.stringify(sortJson(value)) ?? 'undefined';
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}

function sameRevision(
  left: ProjectEntityAssetRevisionRef,
  right: ProjectEntityAssetRevisionRef,
): boolean {
  return (
    left.assetId === right.assetId &&
    left.revision === right.revision &&
    left.digest === right.digest
  );
}

function isStableIdentity(value: string): boolean {
  return value.trim().length > 0 && value.length <= 256 && !/[\\/\0]/u.test(value);
}

function updateError(
  code: ConstructorParameters<typeof ProjectEntityContractError>[0][number]['code'],
  message: string,
): ProjectEntityContractError {
  return new ProjectEntityContractError([{ code, message }]);
}
