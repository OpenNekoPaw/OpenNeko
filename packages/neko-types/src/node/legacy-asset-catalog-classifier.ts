import { createHash } from 'node:crypto';
import {
  createSafeLegacyAssetMigrationDiagnostic,
  isLegacyAssetMigrationClassification,
  isLegacyAssetMigrationUnresolvedField,
  type LegacyAssetMigrationClassification,
  type LegacyAssetMigrationDiagnostic,
  type LegacyAssetMigrationUnresolvedField,
} from '../types/legacy-asset-catalog-migration';
import {
  validateContentLocator,
  type ContentLocator,
  type PackageResourceContentLocator,
} from '../types/content-locator';
import type { CreativeEntityKind } from '../types/creative-entity-identity';
import type { LegacyAssetCatalogInspectionSession } from './legacy-asset-catalog-inspector';

export interface LegacyAssetExistingEntity {
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
}

export interface LegacyAssetKnownPackageRepresentation {
  readonly legacyAssetId: string;
  readonly target: PackageResourceContentLocator;
}

export interface LegacyAssetClassificationResult {
  readonly classifications: readonly LegacyAssetMigrationClassification[];
  readonly unresolvedFields: readonly LegacyAssetMigrationUnresolvedField[];
  readonly confirmationIds: readonly string[];
  readonly diagnostics: readonly LegacyAssetMigrationDiagnostic[];
}

export function classifyLegacyAssetCatalog(input: {
  readonly session: LegacyAssetCatalogInspectionSession;
  readonly existingEntities?: readonly LegacyAssetExistingEntity[];
  readonly knownPackages?: readonly LegacyAssetKnownPackageRepresentation[];
}): LegacyAssetClassificationResult {
  if (input.session.inspection.status !== 'ready') {
    throw new Error('Legacy Asset classification requires a ready inspection.');
  }
  const state = createClassifierState(input.existingEntities ?? [], input.knownPackages ?? []);
  const parsedFiles = parseArchiveFiles(input.session);

  for (const source of input.session.inspection.sources) {
    if (source.kind === 'local-projection') {
      classifySearchProjection(source.sourceId, source.recordCount, state);
      continue;
    }
    const value = parsedFiles.get(source.sourceId);
    if (value === undefined) continue;
    if (source.role === 'asset-catalog') classifyCatalog(source.sourceId, value, state);
  }

  for (const source of input.session.inspection.sources) {
    if (source.kind !== 'project-file' || source.role === 'asset-catalog') continue;
    const value = parsedFiles.get(source.sourceId);
    if (value === undefined) continue;
    classifyAssetReferences(source.sourceId, value, [], state);
  }

  const result: LegacyAssetClassificationResult = {
    classifications: state.classifications,
    unresolvedFields: state.unresolvedFields,
    confirmationIds: [...state.confirmationIds],
    diagnostics: state.diagnostics,
  };
  if (
    !result.classifications.every(isLegacyAssetMigrationClassification) ||
    !result.unresolvedFields.every(isLegacyAssetMigrationUnresolvedField)
  ) {
    throw new Error('Legacy Asset classification produced an invalid migration contract.');
  }
  return result;
}

interface ClassifierState {
  readonly classifications: LegacyAssetMigrationClassification[];
  readonly unresolvedFields: LegacyAssetMigrationUnresolvedField[];
  readonly confirmationIds: Set<string>;
  readonly diagnostics: LegacyAssetMigrationDiagnostic[];
  readonly existingEntities: ReadonlyMap<string, LegacyAssetExistingEntity>;
  readonly knownPackages: ReadonlyMap<string, PackageResourceContentLocator>;
  readonly targetsByAssetId: Map<string, ContentLocator>;
}

function createClassifierState(
  entities: readonly LegacyAssetExistingEntity[],
  packages: readonly LegacyAssetKnownPackageRepresentation[],
): ClassifierState {
  return {
    classifications: [],
    unresolvedFields: [],
    confirmationIds: new Set(),
    diagnostics: [],
    existingEntities: new Map(entities.map((entity) => [entity.entityId, entity])),
    knownPackages: new Map(packages.map((item) => [item.legacyAssetId, item.target])),
    targetsByAssetId: new Map(),
  };
}

function classifyCatalog(sourceId: string, value: unknown, state: ClassifierState): void {
  if (!isRecord(value) || !Array.isArray(value['entities'])) return;
  value['entities'].forEach((entity, entityIndex) => {
    if (!isRecord(entity)) return;
    const entityPath = ['entities', entityIndex] as const;
    const assetId = readSafeText(entity['id']);
    classifyEntityIdentity(sourceId, entity, entityPath, state);
    classifyEntityUserMetadata(sourceId, entity, entityPath, state);

    const packageTarget = assetId ? state.knownPackages.get(assetId) : undefined;
    if (packageTarget && assetId) {
      addClassification(state, {
        kind: 'owner-provenance',
        itemId: itemId(sourceId, [...entityPath, 'package'], 'package-owner'),
        sourceId,
        fieldPath: [...entityPath, 'package'],
        owner: 'package',
        ownerId: packageTarget.packageId,
        valueDigest: hashValue(packageTarget),
      });
      state.targetsByAssetId.set(assetId, packageTarget);
    }

    const generated = readGeneratedProvenance(entity);
    if (generated) {
      addClassification(state, {
        kind: 'owner-provenance',
        itemId: itemId(
          sourceId,
          [...entityPath, 'metadata', 'source', 'generated'],
          'generated-owner',
        ),
        sourceId,
        fieldPath: [...entityPath, 'metadata', 'source', 'generated'],
        owner: 'generated-output',
        ownerId: generated.outputId,
        valueDigest: hashValue(generated.raw),
      });
    }

    const candidateTargets: {
      readonly target: ContentLocator;
      readonly file: Record<string, unknown>;
      readonly path: readonly (string | number)[];
      readonly variantId?: string;
    }[] = [];
    if (Array.isArray(entity['variants'])) {
      entity['variants'].forEach((variant, variantIndex) => {
        if (!isRecord(variant)) return;
        const variantPath = [...entityPath, 'variants', variantIndex] as const;
        classifyVariantMetadata(sourceId, variant, variantPath, state);
        if (!Array.isArray(variant['files'])) return;
        variant['files'].forEach((file, fileIndex) => {
          if (!isRecord(file)) return;
          const filePath = [...variantPath, 'files', fileIndex] as const;
          const target = packageTarget ?? createFileTarget(file, generated);
          if (!target) {
            addUnresolved(
              state,
              sourceId,
              [...filePath, 'path'],
              file['path'],
              'non-portable-reference',
            );
          } else {
            addClassification(state, {
              kind: 'representation-reference',
              itemId: itemId(sourceId, [...filePath, 'path'], 'representation'),
              sourceId,
              fieldPath: [...filePath, 'path'],
              target,
            });
            candidateTargets.push({
              target,
              file,
              path: filePath,
              ...(readSafeText(variant['id']) ? { variantId: readSafeText(variant['id']) } : {}),
            });
          }
          classifyFileProjectionMetadata(sourceId, file, filePath, state);
        });
      });
    }
    if (assetId && !packageTarget) {
      const selected = selectEntityTarget(entity, candidateTargets);
      if (selected) state.targetsByAssetId.set(assetId, selected);
    }
  });
}

function classifyEntityIdentity(
  sourceId: string,
  entity: Record<string, unknown>,
  path: readonly (string | number)[],
  state: ClassifierState,
): void {
  const registryId = readNestedString(entity, ['metadata', 'character', 'registryId']);
  if (registryId) {
    const existing = state.existingEntities.get(registryId);
    if (existing?.entityKind === 'character') {
      addClassification(state, {
        kind: 'existing-entity-association',
        itemId: itemId(
          sourceId,
          [...path, 'metadata', 'character', 'registryId'],
          'existing-entity',
        ),
        sourceId,
        fieldPath: [...path, 'metadata', 'character', 'registryId'],
        entityId: existing.entityId,
        entityKind: existing.entityKind,
      });
      return;
    }
    addUnresolved(
      state,
      sourceId,
      [...path, 'metadata', 'character', 'registryId'],
      registryId,
      'missing-resource',
      'confirmation-required',
    );
    return;
  }

  const entityKind = mapProposalEntityKind(entity['category']);
  const suggestedName = readSafeText(entity['name']);
  if (entityKind && suggestedName) {
    const proposalId = `proposal-${hashValue([sourceId, path, suggestedName]).slice('sha256:'.length, 26)}`;
    addClassification(state, {
      kind: 'entity-proposal',
      itemId: itemId(sourceId, [...path, 'name'], 'entity-proposal'),
      sourceId,
      fieldPath: [...path, 'name'],
      proposalId,
      entityKind,
      suggestedName,
      requiresConfirmation: true,
    });
    state.confirmationIds.add(proposalId);
    state.diagnostics.push(
      createSafeLegacyAssetMigrationDiagnostic('confirmation-required', {
        sourceId,
        fieldPath: [...path, 'name'],
      }),
    );
    return;
  }
  addUnresolved(
    state,
    sourceId,
    [...path, 'category'],
    entity['category'],
    'ambiguous-identity',
    'confirmation-required',
  );
}

function classifyEntityUserMetadata(
  sourceId: string,
  entity: Record<string, unknown>,
  path: readonly (string | number)[],
  state: ClassifierState,
): void {
  for (const key of ['description', 'tags', 'aliases', 'ownership'] as const) {
    if (entity[key] !== undefined)
      addUnresolved(state, sourceId, [...path, key], entity[key], 'unsupported-field');
  }
  if (entity['usageCount'] !== undefined || entity['lastUsedAt'] !== undefined) {
    addClassification(state, {
      kind: 'rebuildable-projection',
      itemId: itemId(sourceId, [...path, 'usageCount'], 'recent-use'),
      sourceId,
      fieldPath: [...path, 'usageCount'],
      projection: 'recent-use',
    });
  }
  const metadata = entity['metadata'];
  if (!isRecord(metadata)) return;
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'character' || key === 'source') continue;
    addUnresolved(
      state,
      sourceId,
      [...path, 'metadata', safeSegment(key)],
      value,
      'unsupported-field',
    );
  }
  const character = metadata['character'];
  if (isRecord(character)) {
    for (const [key, value] of Object.entries(character)) {
      if (key === 'registryId') continue;
      addUnresolved(
        state,
        sourceId,
        [...path, 'metadata', 'character', safeSegment(key)],
        value,
        'unsupported-field',
      );
    }
  }
  const source = metadata['source'];
  if (isRecord(source)) {
    for (const [key, value] of Object.entries(source)) {
      if (key === 'generated') continue;
      addUnresolved(
        state,
        sourceId,
        [...path, 'metadata', 'source', safeSegment(key)],
        value,
        'unsupported-field',
      );
    }
  }
}

function classifyVariantMetadata(
  sourceId: string,
  variant: Record<string, unknown>,
  path: readonly (string | number)[],
  state: ClassifierState,
): void {
  for (const key of ['attributes', 'notes', 'tags'] as const) {
    if (variant[key] !== undefined)
      addUnresolved(state, sourceId, [...path, key], variant[key], 'unsupported-field');
  }
  if (variant['thumbnailPath'] !== undefined) {
    addClassification(state, {
      kind: 'rebuildable-projection',
      itemId: itemId(sourceId, [...path, 'thumbnailPath'], 'thumbnail'),
      sourceId,
      fieldPath: [...path, 'thumbnailPath'],
      projection: 'technical-metadata',
    });
  }
}

function classifyFileProjectionMetadata(
  sourceId: string,
  file: Record<string, unknown>,
  path: readonly (string | number)[],
  state: ClassifierState,
): void {
  if (file['metadata'] !== undefined) {
    addClassification(state, {
      kind: 'rebuildable-projection',
      itemId: itemId(sourceId, [...path, 'metadata'], 'technical-metadata'),
      sourceId,
      fieldPath: [...path, 'metadata'],
      projection: 'technical-metadata',
    });
  }
  if (file['status'] !== undefined || file['lastCheckedAt'] !== undefined) {
    addClassification(state, {
      kind: 'rebuildable-projection',
      itemId: itemId(sourceId, [...path, 'status'], 'availability'),
      sourceId,
      fieldPath: [...path, 'status'],
      projection: 'availability',
    });
  }
  for (const key of ['remap', 'characterAsset'] as const) {
    if (file[key] !== undefined)
      addUnresolved(state, sourceId, [...path, key], file[key], 'unsupported-field');
  }
}

function classifySearchProjection(
  sourceId: string,
  recordCount: number,
  state: ClassifierState,
): void {
  for (let index = 0; index < recordCount; index += 1) {
    addClassification(state, {
      kind: 'rebuildable-projection',
      itemId: itemId(sourceId, ['records', index], 'search'),
      sourceId,
      fieldPath: ['records', index],
      projection: 'media-library-search',
    });
  }
}

function classifyAssetReferences(
  sourceId: string,
  value: unknown,
  path: readonly (string | number)[],
  state: ClassifierState,
): void {
  if (typeof value === 'string') {
    if (!value.startsWith('project://assets/')) return;
    const target = state.targetsByAssetId.get(value.slice('project://assets/'.length));
    if (target) {
      addClassification(state, {
        kind: 'representation-reference',
        itemId: itemId(sourceId, safePath(path), 'asset-reference'),
        sourceId,
        fieldPath: safePath(path),
        target,
      });
    } else {
      addUnresolved(
        state,
        sourceId,
        safePath(path),
        value,
        'missing-resource',
        'confirmation-required',
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      classifyAssetReferences(sourceId, child, [...path, index], state),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    classifyAssetReferences(sourceId, child, [...path, safeSegment(key)], state);
  }
}

function createFileTarget(
  file: Record<string, unknown>,
  generated: ReturnType<typeof readGeneratedProvenance>,
): ContentLocator | undefined {
  const bundle = readNestedRecord(file, ['characterAsset', 'bundleLocator']);
  if (bundle) {
    const bundlePath = readSafeText(bundle['bundlePath']);
    const entryPath = readSafeText(bundle['entryPath']);
    if (bundlePath && entryPath) {
      return validatedLocator({
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: bundlePath },
        entryPath,
      });
    }
  }
  const workspacePath = readSafeText(file['path']);
  if (!workspacePath) return undefined;
  if (generated) {
    return validatedLocator({
      kind: 'generated-output',
      outputId: generated.outputId,
      revision: generated.revision,
      digest: generated.digest,
      path: workspacePath,
    });
  }
  const sourceHash = readNestedString(file, ['characterAsset', 'sourceHash']);
  return validatedLocator({
    kind: 'workspace-file',
    path: workspacePath,
    ...(sourceHash ? { fingerprint: { strategy: 'sha256', value: sourceHash } } : {}),
  });
}

function selectEntityTarget(
  entity: Record<string, unknown>,
  targets: readonly {
    readonly target: ContentLocator;
    readonly file: Record<string, unknown>;
    readonly variantId?: string;
  }[],
): ContentLocator | undefined {
  const defaultVariantId = readSafeText(entity['defaultVariantId']);
  const candidates = defaultVariantId
    ? targets.filter((candidate) => candidate.variantId === defaultVariantId)
    : targets;
  if (candidates.length === 1) return candidates[0]?.target;
  const main = candidates.filter((candidate) => candidate.file['purpose'] === 'main');
  return main.length === 1 ? main[0]?.target : undefined;
}

function readGeneratedProvenance(entity: Record<string, unknown>):
  | {
      readonly outputId: string;
      readonly revision: string;
      readonly digest: string;
      readonly raw: Record<string, unknown>;
    }
  | undefined {
  const generated = readNestedRecord(entity, ['metadata', 'source', 'generated']);
  if (!generated) return undefined;
  const outputId =
    readSafeText(generated['candidateId']) ?? readSafeText(generated['projectionId']);
  const revision = readSafeText(generated['revision']);
  const digest = readSafeText(generated['contentDigest']);
  return outputId && revision && digest
    ? { outputId, revision, digest, raw: generated }
    : undefined;
}

function addClassification(
  state: ClassifierState,
  value: LegacyAssetMigrationClassification,
): void {
  state.classifications.push(value);
}

function addUnresolved(
  state: ClassifierState,
  sourceId: string,
  fieldPath: readonly (string | number)[],
  value: unknown,
  reason: LegacyAssetMigrationUnresolvedField['reason'],
  disposition: LegacyAssetMigrationUnresolvedField['disposition'] = 'archive-only',
): void {
  const path = safePath(fieldPath);
  const unresolvedId = `unresolved-${hashValue([sourceId, path, value]).slice('sha256:'.length, 26)}`;
  state.unresolvedFields.push({
    unresolvedId,
    sourceId,
    fieldPath: path,
    valueDigest: hashValue(value),
    reason,
    disposition,
  });
  addClassification(state, {
    kind: 'unresolved',
    itemId: itemId(sourceId, path, 'unresolved'),
    sourceId,
    fieldPath: path,
    unresolvedId,
  });
  if (disposition === 'confirmation-required') state.confirmationIds.add(unresolvedId);
  state.diagnostics.push(
    createSafeLegacyAssetMigrationDiagnostic(
      reason === 'ambiguous-identity' ? 'ambiguous-identity' : 'unresolved-field',
      { sourceId, fieldPath: path },
    ),
  );
}

function validatedLocator(value: unknown): ContentLocator | undefined {
  const result = validateContentLocator(value);
  return result.ok ? result.locator : undefined;
}

function parseArchiveFiles(session: LegacyAssetCatalogInspectionSession): Map<string, unknown> {
  const parsed = new Map<string, unknown>();
  for (const input of session.archiveInputs) {
    if (input.kind !== 'project-file') continue;
    parsed.set(input.sourceId, JSON.parse(new TextDecoder().decode(input.bytes)) as unknown);
  }
  return parsed;
}

function mapProposalEntityKind(value: unknown): CreativeEntityKind | undefined {
  if (value === 'character') return 'character';
  if (value === 'object') return 'object';
  return undefined;
}

function readNestedRecord(
  value: Record<string, unknown>,
  path: readonly string[],
): Record<string, unknown> | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return isRecord(current) ? current : undefined;
}

function readNestedString(
  value: Record<string, unknown>,
  path: readonly string[],
): string | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return readSafeText(current);
}

function readSafeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function itemId(sourceId: string, path: readonly (string | number)[], kind: string): string {
  return `item-${hashValue([sourceId, path, kind]).slice('sha256:'.length, 26)}`;
}

function hashValue(value: unknown): string {
  const serialized = JSON.stringify(value) ?? 'undefined';
  return `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
}

function safePath(path: readonly (string | number)[]): readonly (string | number)[] {
  return path.length > 0
    ? path.map((segment) => (typeof segment === 'string' ? safeSegment(segment) : segment))
    : ['root'];
}

function safeSegment(value: string): string {
  return /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(value)
    ? value
    : `field_${hashValue(value).slice('sha256:'.length, 18)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
