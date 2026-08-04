import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  decodeEntityRepresentationBindingFile,
  isCharacterRegistryFile,
  isCreativeEntityCandidateFile,
  isProjectCreativeEntityFile,
  type CreativeEntity,
  type CreativeEntityCandidate,
  type CreativeEntityKind,
  type EntityRepresentationBinding,
  type ProjectEntityCandidateProjection,
  type ProjectEntityDocument,
  type ProjectEntityDocumentRepository,
  type ProjectEntityFactValue,
  type ProjectEntityRecord,
  type ProjectEntityRepresentationBinding,
} from '@neko/entity-domain';
import {
  NodeProjectEntityMigrationInventory,
  type ProjectEntityLegacySourceId,
  type ProjectEntityMigrationArchiveSnapshot,
  type ProjectEntityMigrationArchivedSource,
  type ProjectEntityMigrationInventory,
} from './node-project-entity-migration-inventory';

export interface ProjectEntityMigrationCandidateProjectionRequest {
  readonly projectId: string;
  readonly migrationPlanId: string;
  readonly expectedProjectRevision: number;
  readonly candidates: readonly ProjectEntityCandidateProjection[];
}

export interface ProjectEntityMigrationCandidateProjectionResult {
  readonly projectedCandidateIds: readonly string[];
}

export interface ProjectEntityMigrationCandidateProjectionWriter {
  replaceLegacyCandidates(
    request: ProjectEntityMigrationCandidateProjectionRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityMigrationCandidateProjectionResult>;
}

export interface NodeProjectEntityMigrationOptions {
  readonly workspacePath: string;
  readonly projectId: string;
  readonly repository: ProjectEntityDocumentRepository;
  readonly inventory: NodeProjectEntityMigrationInventory;
  readonly candidateProjectionWriter: ProjectEntityMigrationCandidateProjectionWriter;
}

export interface ProjectEntityMigrationResult {
  readonly planId: string;
  readonly document: ProjectEntityDocument;
  readonly projectedCandidateIds: readonly string[];
  readonly retiredSourcePaths: readonly string[];
  readonly archiveRelativePath: string;
}

export class NodeProjectEntityMigrationError extends Error {
  readonly code:
    | 'project-entity-migration-blocked'
    | 'project-entity-migration-already-applied'
    | 'project-entity-migration-invalid-archive'
    | 'project-entity-migration-projection-failed'
    | 'project-entity-migration-retirement-failed'
    | 'project-entity-migration-cancelled';
  readonly canonicalCommitted: boolean;

  constructor(
    code: NodeProjectEntityMigrationError['code'],
    message: string,
    canonicalCommitted: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NodeProjectEntityMigrationError';
    this.code = code;
    this.canonicalCommitted = canonicalCommitted;
  }
}

export class NodeProjectEntityMigration {
  private readonly workspacePath: string;

  constructor(private readonly options: NodeProjectEntityMigrationOptions) {
    this.workspacePath = path.resolve(options.workspacePath);
  }

  async apply(
    inventory: ProjectEntityMigrationInventory,
    signal?: AbortSignal,
  ): Promise<ProjectEntityMigrationResult> {
    throwIfAborted(signal, false);
    if (inventory.projectId !== this.options.projectId) {
      throw migrationError(
        'project-entity-migration-blocked',
        'Project Entity migration inventory belongs to another Project identity.',
        false,
      );
    }
    if (inventory.plan.blockers.length > 0) {
      throw migrationError(
        'project-entity-migration-blocked',
        'Project Entity migration has unresolved source or identity blockers.',
        false,
      );
    }
    if (inventory.plan.expectedSources.every((source) => source.expectedDigest === null)) {
      throw migrationError(
        'project-entity-migration-blocked',
        'Project Entity migration has no fragmented source data to migrate.',
        false,
      );
    }

    await this.options.inventory.verifyCurrentSources(inventory, signal);
    const current = await this.options.repository.load(signal);
    if (current.revision !== 0 || current.entities.length > 0) {
      throw migrationError(
        'project-entity-migration-already-applied',
        'Canonical Project Entity facts already exist and cannot be overwritten by legacy migration.',
        false,
      );
    }
    const archive = await this.options.inventory.loadArchive(inventory, signal);
    const document = buildMigratedDocument(inventory, archive);
    const candidates = buildCandidateProjections(archive);

    let projectionResult: ProjectEntityMigrationCandidateProjectionResult;
    try {
      projectionResult = await this.options.candidateProjectionWriter.replaceLegacyCandidates(
        {
          projectId: this.options.projectId,
          migrationPlanId: inventory.plan.planId,
          expectedProjectRevision: inventory.plan.expectedProjectRevision,
          candidates,
        },
        signal,
      );
    } catch (error: unknown) {
      if (error instanceof NodeProjectEntityMigrationError) throw error;
      throw migrationError(
        'project-entity-migration-projection-failed',
        'Legacy Entity candidate projections could not be rebuilt before canonical commit.',
        false,
        error,
      );
    }
    assertProjectedCandidateIdentity(candidates, projectionResult.projectedCandidateIds);
    await this.options.inventory.verifyCurrentSources(inventory, signal);
    throwIfAborted(signal, false);
    const committed = await this.options.repository.commit(
      {
        expectedRevision: inventory.plan.expectedProjectRevision,
        next: document,
      },
      signal,
    );

    let retiredSourcePaths: readonly string[];
    try {
      retiredSourcePaths = await retireLegacySources(this.workspacePath, inventory, signal);
    } catch (error: unknown) {
      if (error instanceof NodeProjectEntityMigrationError) throw error;
      throw migrationError(
        'project-entity-migration-retirement-failed',
        'Canonical Project Entity facts committed, but legacy source retirement did not complete.',
        true,
        error,
      );
    }
    return {
      planId: inventory.plan.planId,
      document: committed,
      projectedCandidateIds: projectionResult.projectedCandidateIds,
      retiredSourcePaths,
      archiveRelativePath: inventory.plan.archiveRelativePath,
    };
  }
}

function buildMigratedDocument(
  inventory: ProjectEntityMigrationInventory,
  archive: ProjectEntityMigrationArchiveSnapshot,
): ProjectEntityDocument {
  const records = collectLegacyEntityRecords(archive);
  const bindings = collectLegacyBindings(archive);
  const byEntityId = new Map<string, ProjectEntityRepresentationBinding[]>();
  for (const binding of bindings) {
    const current = byEntityId.get(binding.entityId) ?? [];
    current.push(binding.binding);
    byEntityId.set(binding.entityId, current);
  }
  const entities = records
    .map((record): ProjectEntityRecord => ({
      entityId: record.entity.id,
      kind: record.entity.kind,
      names: {
        canonical: record.entity.canonicalName,
        ...(record.entity.displayName ? { display: record.entity.displayName } : {}),
        aliases: record.entity.aliases,
      },
      facts: toFactRecord(record.entity.metadata),
      representations: [...(byEntityId.get(record.entity.id) ?? [])].sort((left, right) =>
        left.bindingId.localeCompare(right.bindingId),
      ),
      lifecycle:
        record.entity.status === 'deprecated'
          ? { state: 'deprecated', deprecatedAt: inventory.createdAt }
          : { state: 'active' },
      createdAt: inventory.createdAt,
      updatedAt: inventory.createdAt,
    }))
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) || left.entityId.localeCompare(right.entityId),
    );
  return {
    schemaVersion: 1,
    projectId: inventory.projectId,
    revision: inventory.plan.expectedProjectRevision + 1,
    entities,
  };
}

interface LegacyEntityRecord {
  readonly sourceId: ProjectEntityLegacySourceId;
  readonly entity: CreativeEntity;
}

function collectLegacyEntityRecords(
  archive: ProjectEntityMigrationArchiveSnapshot,
): readonly LegacyEntityRecord[] {
  const records: LegacyEntityRecord[] = [];
  for (const source of archive.sources) {
    if (source.sourceId === 'character-registry') {
      if (!isCharacterRegistryFile(source.value)) throw invalidArchive(source.sourceId);
      for (const character of source.value.characters) {
        if (character.status === 'candidate') throw invalidArchive(source.sourceId);
        records.push({
          sourceId: source.sourceId,
          entity: {
            id: character.id,
            kind: 'character',
            canonicalName: character.canonicalName,
            ...(character.displayName ? { displayName: character.displayName } : {}),
            aliases: character.aliases,
            status: character.status,
            ...(character.metadata ? { metadata: character.metadata } : {}),
          },
        });
      }
      continue;
    }
    const expectedKind = registryKind(source.sourceId);
    if (!expectedKind) continue;
    if (!isProjectCreativeEntityFile(source.value) || source.value.kind !== expectedKind) {
      throw invalidArchive(source.sourceId);
    }
    for (const entity of source.value.entities) {
      if (entity.status === 'candidate') throw invalidArchive(source.sourceId);
      records.push({ sourceId: source.sourceId, entity });
    }
  }
  return records;
}

interface LegacyBindingRecord {
  readonly entityId: string;
  readonly binding: ProjectEntityRepresentationBinding;
}

function collectLegacyBindings(
  archive: ProjectEntityMigrationArchiveSnapshot,
): readonly LegacyBindingRecord[] {
  const source = findArchivedSource(archive, 'representation-bindings');
  if (!source) return [];
  const decoded = decodeEntityRepresentationBindingFile(source.value);
  if (!decoded.ok) throw invalidArchive(source.sourceId);
  return decoded.file.bindings
    .filter((binding) => binding.status === 'confirmed')
    .map((binding) => ({ entityId: binding.entityId, binding: migrateBinding(binding) }));
}

function migrateBinding(binding: EntityRepresentationBinding): ProjectEntityRepresentationBinding {
  return {
    bindingId: binding.id,
    role: binding.role,
    target: binding.representation,
    source:
      binding.source === 'user' || binding.source === 'agent' || binding.source === 'migration'
        ? binding.source
        : 'migration',
    ...(binding.isDefault === undefined ? {} : { isDefault: binding.isDefault }),
    acceptedAt: binding.updatedAt,
  };
}

function buildCandidateProjections(
  archive: ProjectEntityMigrationArchiveSnapshot,
): readonly ProjectEntityCandidateProjection[] {
  const source = findArchivedSource(archive, 'candidate-registry');
  if (!source) return [];
  if (!isCreativeEntityCandidateFile(source.value)) throw invalidArchive(source.sourceId);
  const candidates = source.value.candidates
    .filter((candidate) => candidate.status === 'open')
    .map(migrateCandidate)
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  if (new Set(candidates.map((candidate) => candidate.candidateId)).size !== candidates.length) {
    throw invalidArchive(source.sourceId);
  }
  return candidates;
}

function migrateCandidate(candidate: CreativeEntityCandidate): ProjectEntityCandidateProjection {
  return {
    candidateId: candidate.id,
    kind: candidate.kind,
    proposedNames: {
      canonical: candidate.name,
      aliases: candidate.aliases ?? [],
    },
    ...(candidate.confidence === undefined ? {} : { confidence: candidate.confidence }),
    freshness: 'stale',
    evidence: candidate.provenance.map((provenance, index) => ({
      evidenceId: stableEvidenceId(candidate.id, provenance.providerId, index),
      owner: candidateOwner(provenance.sourceKind),
      sourceId: provenance.sourceRef ?? provenance.providerId,
      ...(provenance.label === undefined ? {} : { label: provenance.label }),
      ...(provenance.confidence === undefined ? {} : { confidence: provenance.confidence }),
      ...(provenance.observedAt === undefined ? {} : { observedAt: provenance.observedAt }),
    })),
  };
}

function candidateOwner(
  sourceKind: CreativeEntityCandidate['provenance'][number]['sourceKind'],
): ProjectEntityCandidateProjection['evidence'][number]['owner'] {
  if (sourceKind === 'document') return 'document';
  if (sourceKind === 'asset') return 'managed-asset';
  return 'workspace';
}

function stableEvidenceId(candidateId: string, providerId: string, index: number): string {
  return `migration-${createHash('sha256')
    .update(JSON.stringify([candidateId, providerId, index]))
    .digest('hex')
    .slice(0, 24)}`;
}

function assertProjectedCandidateIdentity(
  expected: readonly ProjectEntityCandidateProjection[],
  actualIds: readonly string[],
): void {
  const expectedIds = expected.map((candidate) => candidate.candidateId).sort();
  const actual = [...actualIds].sort();
  if (
    new Set(actual).size !== actual.length ||
    JSON.stringify(expectedIds) !== JSON.stringify(actual)
  ) {
    throw migrationError(
      'project-entity-migration-projection-failed',
      'Legacy Entity candidate projection writer did not confirm the exact candidate identity set.',
      false,
    );
  }
}

async function retireLegacySources(
  workspacePath: string,
  inventory: ProjectEntityMigrationInventory,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const retired: string[] = [];
  for (const source of inventory.plan.expectedSources) {
    if (source.expectedDigest === null) continue;
    throwIfAborted(signal, true);
    const sourcePath = resolveWorkspacePath(workspacePath, source.relativePath);
    let bytes: Buffer;
    try {
      bytes = await readFile(sourcePath);
    } catch (error: unknown) {
      throw migrationError(
        'project-entity-migration-retirement-failed',
        `Legacy Entity source '${source.relativePath}' could not be verified for retirement.`,
        true,
        error,
      );
    }
    if (digest(bytes) !== source.expectedDigest) {
      throw migrationError(
        'project-entity-migration-retirement-failed',
        `Legacy Entity source '${source.relativePath}' changed before retirement.`,
        true,
      );
    }
    try {
      await rm(sourcePath);
    } catch (error: unknown) {
      throw migrationError(
        'project-entity-migration-retirement-failed',
        `Legacy Entity source '${source.relativePath}' could not be retired.`,
        true,
        error,
      );
    }
    retired.push(source.relativePath);
  }
  return retired;
}

function findArchivedSource(
  archive: ProjectEntityMigrationArchiveSnapshot,
  sourceId: ProjectEntityLegacySourceId,
): ProjectEntityMigrationArchivedSource | undefined {
  return archive.sources.find((source) => source.sourceId === sourceId);
}

function registryKind(
  sourceId: ProjectEntityLegacySourceId,
): Exclude<CreativeEntityKind, 'character'> | undefined {
  switch (sourceId) {
    case 'scene-registry':
      return 'scene';
    case 'location-registry':
      return 'location';
    case 'object-registry':
      return 'object';
    case 'style-registry':
      return 'style';
    default:
      return undefined;
  }
}

function toFactRecord(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, ProjectEntityFactValue>> {
  if (!metadata) return {};
  const facts: Record<string, ProjectEntityFactValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    facts[key] = toFactValue(value);
  }
  return facts;
}

function toFactValue(value: unknown): ProjectEntityFactValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toFactValue);
  if (isRecord(value)) {
    const record: Record<string, ProjectEntityFactValue> = {};
    for (const [key, child] of Object.entries(value)) record[key] = toFactValue(child);
    return record;
  }
  throw migrationError(
    'project-entity-migration-invalid-archive',
    'Legacy Entity metadata contains a value that cannot become a canonical fact.',
    false,
  );
}

function resolveWorkspacePath(workspacePath: string, relativePath: string): string {
  if (path.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
    throw migrationError(
      'project-entity-migration-retirement-failed',
      'Legacy Entity retirement path is not Workspace-relative.',
      true,
    );
  }
  const root = path.resolve(workspacePath);
  const target = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw migrationError(
      'project-entity-migration-retirement-failed',
      'Legacy Entity retirement path escapes the Workspace.',
      true,
    );
  }
  return target;
}

function invalidArchive(sourceId: ProjectEntityLegacySourceId): NodeProjectEntityMigrationError {
  return migrationError(
    'project-entity-migration-invalid-archive',
    `Archived Entity source '${sourceId}' no longer satisfies its approved migration schema.`,
    false,
  );
}

function throwIfAborted(signal: AbortSignal | undefined, canonicalCommitted: boolean): void {
  if (!signal?.aborted) return;
  throw migrationError(
    'project-entity-migration-cancelled',
    'Project Entity migration was cancelled.',
    canonicalCommitted,
    signal.reason,
  );
}

function migrationError(
  code: NodeProjectEntityMigrationError['code'],
  message: string,
  canonicalCommitted: boolean,
  cause?: unknown,
): NodeProjectEntityMigrationError {
  return new NodeProjectEntityMigrationError(
    code,
    message,
    canonicalCommitted,
    cause === undefined ? undefined : { cause },
  );
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
