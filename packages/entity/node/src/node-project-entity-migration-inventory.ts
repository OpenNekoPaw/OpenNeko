import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  decodeEntityRepresentationBindingFile,
  isCharacterRegistryFile,
  isCreativeEntityCandidateFile,
  isEntityAssetRequirementFile,
  isProjectCreativeEntityFile,
  isVisualIdentityDraftFile,
  type ProjectEntityDocumentRepository,
} from '@neko/entity-domain';

export const PROJECT_ENTITY_MIGRATION_INVENTORY_SCHEMA_VERSION = 1 as const;
export const PROJECT_ENTITY_MIGRATION_ARCHIVE_SCHEMA_VERSION = 1 as const;
export const PROJECT_ENTITY_MIGRATION_ARCHIVE_DIRECTORY =
  'neko/migrations/project-entities' as const;

export type ProjectEntityLegacySourceId =
  | 'character-registry'
  | 'scene-registry'
  | 'location-registry'
  | 'object-registry'
  | 'style-registry'
  | 'candidate-registry'
  | 'representation-bindings'
  | 'asset-requirements'
  | 'visual-identity-drafts';

export type ProjectEntityMigrationSchemaStatus =
  'absent' | 'valid' | 'invalid-json' | 'invalid-schema' | 'unsupported-version';

export type ProjectEntityMigrationFieldDisposition =
  | 'canonical-fact'
  | 'canonical-binding'
  | 'rebuildable-projection'
  | 'workflow-state'
  | 'unresolved-archive'
  | 'user-confirmation-required';

export interface ProjectEntityMigrationFieldClassification {
  readonly jsonPointer: string;
  readonly disposition: ProjectEntityMigrationFieldDisposition;
  readonly reason: string;
}

export interface ProjectEntityMigrationAmbiguity {
  readonly sourceId: ProjectEntityLegacySourceId;
  readonly jsonPointer: string;
  readonly code: 'invalid-source' | 'unknown-field' | 'identity-resolution-required';
  readonly message: string;
}

export interface ProjectEntityMigrationSourceInventory {
  readonly sourceId: ProjectEntityLegacySourceId;
  readonly relativePath: string;
  readonly schemaStatus: ProjectEntityMigrationSchemaStatus;
  readonly digest: string | null;
  readonly byteLength: number;
  readonly classifications: readonly ProjectEntityMigrationFieldClassification[];
  readonly ambiguities: readonly ProjectEntityMigrationAmbiguity[];
}

export interface ProjectEntityMigrationExpectedSource {
  readonly sourceId: ProjectEntityLegacySourceId;
  readonly relativePath: string;
  readonly expectedSchemaStatus: ProjectEntityMigrationSchemaStatus;
  readonly expectedDigest: string | null;
}

export interface ProjectEntityMigrationPlan {
  readonly planId: string;
  readonly projectId: string;
  readonly expectedProjectRevision: number;
  readonly expectedSources: readonly ProjectEntityMigrationExpectedSource[];
  readonly archiveRelativePath: string;
  readonly blockers: readonly ProjectEntityMigrationAmbiguity[];
}

export interface ProjectEntityMigrationInventory {
  readonly schemaVersion: typeof PROJECT_ENTITY_MIGRATION_INVENTORY_SCHEMA_VERSION;
  readonly projectId: string;
  readonly createdAt: string;
  readonly sources: readonly ProjectEntityMigrationSourceInventory[];
  readonly plan: ProjectEntityMigrationPlan;
}

export interface ProjectEntityMigrationArchiveManifest {
  readonly schemaVersion: typeof PROJECT_ENTITY_MIGRATION_ARCHIVE_SCHEMA_VERSION;
  readonly projectId: string;
  readonly planId: string;
  readonly createdAt: string;
  readonly expectedProjectRevision: number;
  readonly sources: readonly ProjectEntityMigrationExpectedSource[];
  readonly inventorySources: readonly ProjectEntityMigrationSourceInventory[];
  readonly blockers: readonly ProjectEntityMigrationAmbiguity[];
}

export interface ProjectEntityMigrationArchiveResult {
  readonly relativePath: string;
  readonly manifest: ProjectEntityMigrationArchiveManifest;
}

export interface NodeProjectEntityMigrationInventoryOptions {
  readonly workspacePath: string;
  readonly projectId: string;
  readonly repository: ProjectEntityDocumentRepository;
  readonly now?: () => Date;
}

export class NodeProjectEntityMigrationInventoryError extends Error {
  readonly code:
    | 'project-entity-migration-path-unauthorized'
    | 'project-entity-migration-source-changed'
    | 'project-entity-migration-archive-exists'
    | 'project-entity-migration-io-failed'
    | 'project-entity-migration-cancelled';

  constructor(
    code: NodeProjectEntityMigrationInventoryError['code'],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NodeProjectEntityMigrationInventoryError';
    this.code = code;
  }
}

interface LegacySourceDefinition {
  readonly sourceId: ProjectEntityLegacySourceId;
  readonly relativePath: string;
  readonly rootDisposition: ProjectEntityMigrationFieldDisposition;
  readonly validate: (value: unknown) => ProjectEntityMigrationSchemaStatus;
  readonly classify: (value: unknown) => SourceClassification;
}

interface SourceClassification {
  readonly classifications: readonly ProjectEntityMigrationFieldClassification[];
  readonly ambiguities: readonly Omit<ProjectEntityMigrationAmbiguity, 'sourceId'>[];
}

interface SourceSnapshot {
  readonly inventory: ProjectEntityMigrationSourceInventory;
  readonly bytes: Buffer | null;
}

const LEGACY_SOURCES: readonly LegacySourceDefinition[] = [
  registrySource('character-registry', 'characters.json', 'character'),
  registrySource('scene-registry', 'neko/entities/scenes.json', 'scene'),
  registrySource('location-registry', 'neko/entities/locations.json', 'location'),
  registrySource('object-registry', 'neko/entities/objects.json', 'object'),
  registrySource('style-registry', 'neko/entities/styles.json', 'style'),
  {
    sourceId: 'candidate-registry',
    relativePath: 'neko/entities/candidates.json',
    rootDisposition: 'rebuildable-projection',
    validate: (value) => versionedStatus(value, 1, isCreativeEntityCandidateFile(value)),
    classify: (value) => classifyCandidateSource(value),
  },
  {
    sourceId: 'representation-bindings',
    relativePath: 'neko/entity-representation-bindings.json',
    rootDisposition: 'canonical-binding',
    validate: validateBindingSource,
    classify: (value) => classifyBindingSource(value),
  },
  {
    sourceId: 'asset-requirements',
    relativePath: 'neko/entity-asset-requirements.json',
    rootDisposition: 'workflow-state',
    validate: (value) => versionedStatus(value, 1, isEntityAssetRequirementFile(value)),
    classify: (value) => classifyKnownTree(value, REQUIREMENT_KEYS, 'workflow-state'),
  },
  {
    sourceId: 'visual-identity-drafts',
    relativePath: 'neko/visual-identity-drafts.json',
    rootDisposition: 'workflow-state',
    validate: (value) => versionedStatus(value, 1, isVisualIdentityDraftFile(value)),
    classify: (value) => classifyKnownTree(value, VISUAL_DRAFT_KEYS, 'workflow-state'),
  },
] as const;

export class NodeProjectEntityMigrationInventory {
  private readonly workspacePath: string;

  constructor(private readonly options: NodeProjectEntityMigrationInventoryOptions) {
    this.workspacePath = path.resolve(options.workspacePath);
    if (!isStableIdentity(options.projectId)) {
      throw migrationError(
        'project-entity-migration-path-unauthorized',
        'Project Entity migration inventory requires a stable Project identity.',
      );
    }
  }

  async inspect(signal?: AbortSignal): Promise<ProjectEntityMigrationInventory> {
    throwIfAborted(signal);
    await authorizeWorkspace(this.workspacePath);
    const canonical = await this.options.repository.load(signal);
    if (canonical.projectId !== this.options.projectId) {
      throw migrationError(
        'project-entity-migration-path-unauthorized',
        'Project Entity migration repository belongs to another Project identity.',
      );
    }
    const snapshots: SourceSnapshot[] = [];
    for (const definition of LEGACY_SOURCES) {
      snapshots.push(await this.readSource(definition, signal));
    }
    const createdAt = (this.options.now ?? (() => new Date()))().toISOString();
    const sources = snapshots.map((snapshot) => snapshot.inventory);
    const expectedSources = sources.map(toExpectedSource);
    const blockers = sources.flatMap((source) => source.ambiguities);
    const planId = buildPlanId(
      this.options.projectId,
      canonical.revision,
      expectedSources,
      blockers,
    );
    return {
      schemaVersion: PROJECT_ENTITY_MIGRATION_INVENTORY_SCHEMA_VERSION,
      projectId: this.options.projectId,
      createdAt,
      sources,
      plan: {
        planId,
        projectId: this.options.projectId,
        expectedProjectRevision: canonical.revision,
        expectedSources,
        archiveRelativePath: `${PROJECT_ENTITY_MIGRATION_ARCHIVE_DIRECTORY}/${planId}`,
        blockers,
      },
    };
  }

  async archive(
    inventory: ProjectEntityMigrationInventory,
    signal?: AbortSignal,
  ): Promise<ProjectEntityMigrationArchiveResult> {
    validateInventoryIdentity(inventory, this.options.projectId);
    throwIfAborted(signal);
    await authorizeWorkspace(this.workspacePath);
    const canonical = await this.options.repository.load(signal);
    if (canonical.revision !== inventory.plan.expectedProjectRevision) {
      throw migrationError(
        'project-entity-migration-source-changed',
        'Project Entity revision changed after migration inventory was created.',
      );
    }

    const snapshots: SourceSnapshot[] = [];
    for (const definition of LEGACY_SOURCES) {
      const snapshot = await this.readSource(definition, signal);
      const expected = inventory.plan.expectedSources.find(
        (source) => source.sourceId === definition.sourceId,
      );
      if (!expected || !sameExpectedSource(snapshot.inventory, expected)) {
        throw migrationError(
          'project-entity-migration-source-changed',
          `Project Entity migration source '${definition.relativePath}' changed after inventory.`,
        );
      }
      snapshots.push(snapshot);
    }

    const archivePath = resolveOwnedPath(this.workspacePath, inventory.plan.archiveRelativePath);
    await authorizeOwnedPath(this.workspacePath, archivePath, true);
    if (await pathExists(archivePath)) {
      throw migrationError(
        'project-entity-migration-archive-exists',
        'Project Entity migration archive already exists and will not be overwritten.',
      );
    }

    const archiveParent = path.dirname(archivePath);
    await mkdir(archiveParent, { recursive: true });
    await authorizeOwnedPath(this.workspacePath, archiveParent, false);
    const temporaryPath = path.join(archiveParent, `.archive-${randomUUID()}.tmp`);
    const manifest: ProjectEntityMigrationArchiveManifest = {
      schemaVersion: PROJECT_ENTITY_MIGRATION_ARCHIVE_SCHEMA_VERSION,
      projectId: inventory.projectId,
      planId: inventory.plan.planId,
      createdAt: inventory.createdAt,
      expectedProjectRevision: inventory.plan.expectedProjectRevision,
      sources: inventory.plan.expectedSources,
      inventorySources: inventory.sources,
      blockers: inventory.plan.blockers,
    };
    let published = false;
    try {
      await mkdir(temporaryPath);
      for (const snapshot of snapshots) {
        throwIfAborted(signal);
        if (!snapshot.bytes) continue;
        const target = resolveOwnedPath(
          temporaryPath,
          `sources/${snapshot.inventory.relativePath}`,
        );
        await mkdir(path.dirname(target), { recursive: true });
        await writeExclusive(target, snapshot.bytes);
        const archived = await readFile(target);
        if (digest(archived) !== snapshot.inventory.digest) {
          throw migrationError(
            'project-entity-migration-io-failed',
            `Archived source '${snapshot.inventory.relativePath}' failed digest verification.`,
          );
        }
      }
      await writeExclusive(
        path.join(temporaryPath, 'manifest.json'),
        Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
      );
      throwIfAborted(signal);
      await rename(temporaryPath, archivePath);
      published = true;
      return { relativePath: inventory.plan.archiveRelativePath, manifest };
    } catch (error: unknown) {
      if (error instanceof NodeProjectEntityMigrationInventoryError) throw error;
      if (hasNodeErrorCode(error, 'EEXIST')) {
        throw migrationError(
          'project-entity-migration-archive-exists',
          'Project Entity migration archive already exists and will not be overwritten.',
          error,
        );
      }
      throw migrationError(
        'project-entity-migration-io-failed',
        'Project Entity migration archive could not be committed atomically.',
        error,
      );
    } finally {
      if (!published) await rm(temporaryPath, { recursive: true, force: true });
    }
  }

  private async readSource(
    definition: LegacySourceDefinition,
    signal?: AbortSignal,
  ): Promise<SourceSnapshot> {
    throwIfAborted(signal);
    const sourcePath = resolveOwnedPath(this.workspacePath, definition.relativePath);
    await authorizeOwnedPath(this.workspacePath, sourcePath, true);
    let bytes: Buffer;
    try {
      bytes = await readFile(sourcePath);
    } catch (error: unknown) {
      if (hasNodeErrorCode(error, 'ENOENT')) {
        return {
          bytes: null,
          inventory: {
            sourceId: definition.sourceId,
            relativePath: definition.relativePath,
            schemaStatus: 'absent',
            digest: null,
            byteLength: 0,
            classifications: [],
            ambiguities: [],
          },
        };
      }
      throw migrationError(
        'project-entity-migration-io-failed',
        `Project Entity migration source '${definition.relativePath}' could not be read.`,
        error,
      );
    }
    throwIfAborted(signal);
    let value: unknown;
    try {
      value = JSON.parse(bytes.toString('utf8'));
    } catch {
      const ambiguity = invalidSourceAmbiguity(
        definition.sourceId,
        'Legacy Entity source contains invalid JSON.',
      );
      return {
        bytes,
        inventory: {
          sourceId: definition.sourceId,
          relativePath: definition.relativePath,
          schemaStatus: 'invalid-json',
          digest: digest(bytes),
          byteLength: bytes.byteLength,
          classifications: [
            {
              jsonPointer: '',
              disposition: 'unresolved-archive',
              reason: 'Invalid JSON is preserved byte-for-byte for explicit recovery.',
            },
          ],
          ambiguities: [ambiguity],
        },
      };
    }
    const schemaStatus = definition.validate(value);
    const classified = definition.classify(value);
    const ambiguities = classified.ambiguities.map((ambiguity) => ({
      ...ambiguity,
      sourceId: definition.sourceId,
    }));
    if (schemaStatus !== 'valid') {
      ambiguities.unshift(
        invalidSourceAmbiguity(
          definition.sourceId,
          schemaStatus === 'unsupported-version'
            ? 'Legacy Entity source uses an unsupported schema version.'
            : 'Legacy Entity source violates its declared schema.',
        ),
      );
    }
    return {
      bytes,
      inventory: {
        sourceId: definition.sourceId,
        relativePath: definition.relativePath,
        schemaStatus,
        digest: digest(bytes),
        byteLength: bytes.byteLength,
        classifications:
          classified.classifications.length > 0
            ? classified.classifications
            : [
                {
                  jsonPointer: '',
                  disposition: definition.rootDisposition,
                  reason: 'The source has no classifiable child fields.',
                },
              ],
        ambiguities,
      },
    };
  }
}

const REGISTRY_ROOT_KEYS = new Set(['version', 'characters', 'kind', 'entities']);
const ENTITY_RECORD_KEYS = new Set([
  'id',
  'kind',
  'canonicalName',
  'displayName',
  'aliases',
  'status',
  'metadata',
  'defaults',
  'bindings',
]);
const CANDIDATE_ROOT_KEYS = new Set(['version', 'candidates']);
const CANDIDATE_RECORD_KEYS = new Set([
  'id',
  'kind',
  'name',
  'aliases',
  'status',
  'identityBasis',
  'confidence',
  'provenance',
  'sourceRefs',
  'suggestedRequirements',
  'resolvedEntityRef',
  'createdAt',
  'updatedAt',
  'metadata',
]);
const BINDING_ROOT_KEYS = new Set(['version', 'bindings']);
const BINDING_RECORD_KEYS = new Set([
  'id',
  'entityId',
  'entityKind',
  'representation',
  'role',
  'isDefault',
  'status',
  'availability',
  'orphanedAt',
  'source',
  'confidence',
  'updatedAt',
]);
const REQUIREMENT_KEYS = new Set([
  'version',
  'requirements',
  'id',
  'entityId',
  'entityKind',
  'source',
  'sourceRef',
  'requiredKinds',
  'status',
]);
const VISUAL_DRAFT_KEYS = new Set([
  'version',
  'drafts',
  'id',
  'characterId',
  'source',
  'prompt',
  'generatedAssetIds',
  'selectedAssetId',
  'extractedVisualFacts',
  'key',
  'value',
  'confidence',
  'accepted',
  'status',
]);

function registrySource(
  sourceId: ProjectEntityLegacySourceId,
  relativePath: string,
  kind: 'character' | 'scene' | 'location' | 'object' | 'style',
): LegacySourceDefinition {
  return {
    sourceId,
    relativePath,
    rootDisposition: 'canonical-fact',
    validate: (value) =>
      versionedStatus(
        value,
        1,
        kind === 'character'
          ? isCharacterRegistryFile(value)
          : isProjectCreativeEntityFile(value) && value.kind === kind,
      ),
    classify: (value) => classifyRegistrySource(value, kind),
  };
}

function classifyRegistrySource(
  value: unknown,
  kind: 'character' | 'scene' | 'location' | 'object' | 'style',
): SourceClassification {
  const result = emptyClassification();
  walkJson(value, '', (field, pointer, parent) => {
    const depth = pointerDepth(pointer);
    const known =
      depth === 1
        ? REGISTRY_ROOT_KEYS.has(field)
        : isEntityRecordParent(parent)
          ? ENTITY_RECORD_KEYS.has(field)
          : true;
    if (!known) {
      addUnknown(result, pointer);
      return;
    }
    const record = recordAtArrayPointer(
      value,
      pointer,
      kind === 'character' ? 'characters' : 'entities',
    );
    const identityRequiresConfirmation =
      record?.['status'] === 'candidate' ||
      pointerIncludesField(pointer, 'defaults') ||
      pointerIncludesField(pointer, 'bindings');
    result.classifications.push({
      jsonPointer: pointer,
      disposition: identityRequiresConfirmation ? 'user-confirmation-required' : 'canonical-fact',
      reason: identityRequiresConfirmation
        ? 'Legacy candidate or catalog-style binding state requires explicit Entity resolution.'
        : `Accepted ${kind} identity and semantic fields migrate to canonical Entity facts.`,
    });
    if (identityRequiresConfirmation) {
      result.ambiguities.push({
        jsonPointer: pointer,
        code: 'identity-resolution-required',
        message:
          'Legacy identity or binding state requires explicit confirmation before migration.',
      });
    }
  });
  return result;
}

function classifyCandidateSource(value: unknown): SourceClassification {
  const result = emptyClassification();
  walkJson(value, '', (field, pointer, parent) => {
    const depth = pointerDepth(pointer);
    const known =
      depth === 1
        ? CANDIDATE_ROOT_KEYS.has(field)
        : isCandidateRecordParent(parent)
          ? CANDIDATE_RECORD_KEYS.has(field)
          : true;
    if (!known) {
      addUnknown(result, pointer);
      return;
    }
    const workflow =
      pointerIncludesField(pointer, 'status') ||
      pointerIncludesField(pointer, 'resolvedEntityRef') ||
      pointerIncludesField(pointer, 'suggestedRequirements');
    result.classifications.push({
      jsonPointer: pointer,
      disposition: workflow ? 'workflow-state' : 'rebuildable-projection',
      reason: workflow
        ? 'Candidate decisions remain workflow-owned and do not become facts implicitly.'
        : 'Candidate evidence and detection metadata are rebuildable projections.',
    });
  });
  return result;
}

function classifyBindingSource(value: unknown): SourceClassification {
  const result = emptyClassification();
  walkJson(value, '', (field, pointer, parent) => {
    const depth = pointerDepth(pointer);
    const known =
      depth === 1
        ? BINDING_ROOT_KEYS.has(field)
        : isBindingRecordParent(parent)
          ? BINDING_RECORD_KEYS.has(field)
          : true;
    if (!known) {
      addUnknown(result, pointer);
      return;
    }
    const record = recordAtArrayPointer(value, pointer, 'bindings');
    const status = record?.['status'];
    const workflowOrDerived = ['status', 'availability', 'orphanedAt', 'confidence'].some((name) =>
      pointerIncludesField(pointer, name),
    );
    const canonical = status === 'confirmed' && !workflowOrDerived;
    result.classifications.push({
      jsonPointer: pointer,
      disposition: canonical
        ? 'canonical-binding'
        : field === 'availability' || field === 'orphanedAt'
          ? 'rebuildable-projection'
          : 'workflow-state',
      reason: canonical
        ? 'Confirmed durable binding fields migrate to canonical Entity bindings.'
        : 'Suggested, rejected, availability, orphan, and confidence state is workflow or derived data.',
    });
  });
  return result;
}

function classifyKnownTree(
  value: unknown,
  knownKeys: ReadonlySet<string>,
  disposition: ProjectEntityMigrationFieldDisposition,
): SourceClassification {
  const result = emptyClassification();
  walkJson(value, '', (field, pointer) => {
    if (!knownKeys.has(field)) {
      addUnknown(result, pointer);
      return;
    }
    result.classifications.push({
      jsonPointer: pointer,
      disposition,
      reason: 'The field remains outside canonical Entity facts as feature workflow state.',
    });
  });
  return result;
}

function emptyClassification(): {
  classifications: ProjectEntityMigrationFieldClassification[];
  ambiguities: Omit<ProjectEntityMigrationAmbiguity, 'sourceId'>[];
} {
  return { classifications: [], ambiguities: [] };
}

function addUnknown(result: ReturnType<typeof emptyClassification>, jsonPointer: string): void {
  result.classifications.push({
    jsonPointer,
    disposition: 'unresolved-archive',
    reason: 'Unknown legacy field is preserved and cannot be inferred during migration.',
  });
  result.ambiguities.push({
    jsonPointer,
    code: 'unknown-field',
    message: 'Unknown legacy field requires explicit classification.',
  });
}

function walkJson(
  value: unknown,
  pointer: string,
  visit: (field: string, pointer: string, parent: unknown) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJson(item, `${pointer}/${String(index)}`, visit));
    return;
  }
  if (!isRecord(value)) return;
  for (const [field, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${escapeJsonPointer(field)}`;
    visit(field, childPointer, value);
    walkJson(child, childPointer, visit);
  }
}

function isEntityRecordParent(value: unknown): boolean {
  return isRecord(value) && typeof value['id'] === 'string' && 'canonicalName' in value;
}

function isCandidateRecordParent(value: unknown): boolean {
  return isRecord(value) && typeof value['id'] === 'string' && 'provenance' in value;
}

function isBindingRecordParent(value: unknown): boolean {
  return isRecord(value) && typeof value['id'] === 'string' && 'representation' in value;
}

function recordAtArrayPointer(
  value: unknown,
  pointer: string,
  arrayField: 'characters' | 'entities' | 'bindings',
): Record<string, unknown> | undefined {
  const segments = pointer.split('/').slice(1).map(unescapeJsonPointer);
  if (segments[0] !== arrayField || segments.length < 3) return undefined;
  const record = valueAtPointer(value, `/${arrayField}/${segments[1] ?? ''}`);
  return isRecord(record) ? record : undefined;
}

function pointerIncludesField(pointer: string, field: string): boolean {
  return pointer.split('/').slice(1).map(unescapeJsonPointer).includes(field);
}

function valueAtPointer(value: unknown, pointer: string): unknown {
  return pointer
    .split('/')
    .slice(1)
    .map(unescapeJsonPointer)
    .reduce<unknown>((current, segment) => {
      if (Array.isArray(current)) return current[Number(segment)];
      return isRecord(current) ? current[segment] : undefined;
    }, value);
}

function pointerDepth(pointer: string): number {
  return pointer === '' ? 0 : pointer.split('/').length - 1;
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/gu, '~0').replace(/\//gu, '~1');
}

function unescapeJsonPointer(value: string): string {
  return value.replace(/~1/gu, '/').replace(/~0/gu, '~');
}

function validateBindingSource(value: unknown): ProjectEntityMigrationSchemaStatus {
  if (!isRecord(value)) return 'invalid-schema';
  if (value['version'] !== 2) {
    return typeof value['version'] === 'number' ? 'unsupported-version' : 'invalid-schema';
  }
  return decodeEntityRepresentationBindingFile(value).ok ? 'valid' : 'invalid-schema';
}

function versionedStatus(
  value: unknown,
  expectedVersion: number,
  valid: boolean,
): ProjectEntityMigrationSchemaStatus {
  if (!isRecord(value)) return 'invalid-schema';
  if (value['version'] !== expectedVersion) {
    return typeof value['version'] === 'number' ? 'unsupported-version' : 'invalid-schema';
  }
  return valid ? 'valid' : 'invalid-schema';
}

function invalidSourceAmbiguity(
  sourceId: ProjectEntityLegacySourceId,
  message: string,
): ProjectEntityMigrationAmbiguity {
  return { sourceId, jsonPointer: '', code: 'invalid-source', message };
}

function toExpectedSource(
  source: ProjectEntityMigrationSourceInventory,
): ProjectEntityMigrationExpectedSource {
  return {
    sourceId: source.sourceId,
    relativePath: source.relativePath,
    expectedSchemaStatus: source.schemaStatus,
    expectedDigest: source.digest,
  };
}

function sameExpectedSource(
  actual: ProjectEntityMigrationSourceInventory,
  expected: ProjectEntityMigrationExpectedSource,
): boolean {
  return (
    actual.sourceId === expected.sourceId &&
    actual.relativePath === expected.relativePath &&
    actual.schemaStatus === expected.expectedSchemaStatus &&
    actual.digest === expected.expectedDigest
  );
}

function buildPlanId(
  projectId: string,
  revision: number,
  sources: readonly ProjectEntityMigrationExpectedSource[],
  blockers: readonly ProjectEntityMigrationAmbiguity[],
): string {
  return createHash('sha256')
    .update(JSON.stringify({ projectId, revision, sources, blockers }))
    .digest('hex')
    .slice(0, 32);
}

function validateInventoryIdentity(
  inventory: ProjectEntityMigrationInventory,
  projectId: string,
): void {
  const expectedDefinitions = new Map(
    LEGACY_SOURCES.map((source) => [source.sourceId, source.relativePath] as const),
  );
  const sourceIdentityValid = inventory.sources.every(
    (source) =>
      expectedDefinitions.get(source.sourceId) === source.relativePath &&
      inventory.plan.expectedSources.some(
        (expected) => expected.sourceId === source.sourceId && sameExpectedSource(source, expected),
      ),
  );
  const expectedSourceIdentityValid = inventory.plan.expectedSources.every(
    (source) => expectedDefinitions.get(source.sourceId) === source.relativePath,
  );
  const uniqueSourceIds = new Set(inventory.sources.map((source) => source.sourceId));
  const uniqueExpectedSourceIds = new Set(
    inventory.plan.expectedSources.map((source) => source.sourceId),
  );
  const blockers = inventory.sources.flatMap((source) => source.ambiguities);
  const planId = buildPlanId(
    projectId,
    inventory.plan.expectedProjectRevision,
    inventory.plan.expectedSources,
    inventory.plan.blockers,
  );
  if (
    inventory.schemaVersion !== PROJECT_ENTITY_MIGRATION_INVENTORY_SCHEMA_VERSION ||
    inventory.projectId !== projectId ||
    inventory.plan.projectId !== projectId ||
    Number.isNaN(Date.parse(inventory.createdAt)) ||
    inventory.sources.length !== LEGACY_SOURCES.length ||
    inventory.plan.archiveRelativePath !==
      `${PROJECT_ENTITY_MIGRATION_ARCHIVE_DIRECTORY}/${inventory.plan.planId}` ||
    inventory.plan.expectedSources.length !== LEGACY_SOURCES.length ||
    uniqueSourceIds.size !== LEGACY_SOURCES.length ||
    uniqueExpectedSourceIds.size !== LEGACY_SOURCES.length ||
    !sourceIdentityValid ||
    !expectedSourceIdentityValid ||
    JSON.stringify(blockers) !== JSON.stringify(inventory.plan.blockers) ||
    inventory.plan.planId !== planId
  ) {
    throw migrationError(
      'project-entity-migration-source-changed',
      'Project Entity migration inventory identity is invalid or incomplete.',
    );
  }
}

async function authorizeWorkspace(workspacePath: string): Promise<void> {
  try {
    const stats = await lstat(workspacePath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('invalid workspace');
    await realpath(workspacePath);
  } catch (error: unknown) {
    throw migrationError(
      'project-entity-migration-path-unauthorized',
      'Project Entity migration requires an existing non-symlink Workspace.',
      error,
    );
  }
}

async function authorizeOwnedPath(
  workspacePath: string,
  targetPath: string,
  allowMissing: boolean,
): Promise<void> {
  const workspaceRealPath = await realpath(workspacePath);
  const target = path.resolve(targetPath);
  if (!isInside(target, workspacePath)) {
    throw migrationError(
      'project-entity-migration-path-unauthorized',
      'Project Entity migration path escapes the authorized Workspace.',
    );
  }
  let existing = target;
  while (!(await pathExists(existing))) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const existingRealPath = await realpath(existing);
  if (!isInside(existingRealPath, workspaceRealPath)) {
    throw migrationError(
      'project-entity-migration-path-unauthorized',
      'Project Entity migration path resolves outside the authorized Workspace.',
    );
  }
  if (!(await pathExists(target))) {
    if (allowMissing) return;
    throw migrationError(
      'project-entity-migration-path-unauthorized',
      'Project Entity migration path does not exist.',
    );
  }
  const stats = await lstat(target);
  if (stats.isSymbolicLink()) {
    throw migrationError(
      'project-entity-migration-path-unauthorized',
      'Project Entity migration source must not be a symbolic link.',
    );
  }
}

function resolveOwnedPath(rootPath: string, relativePath: string): string {
  if (path.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
    throw migrationError(
      'project-entity-migration-path-unauthorized',
      'Project Entity migration path must be Workspace-relative.',
    );
  }
  const resolved = path.resolve(rootPath, ...relativePath.split('/'));
  if (!isInside(resolved, path.resolve(rootPath))) {
    throw migrationError(
      'project-entity-migration-path-unauthorized',
      'Project Entity migration path escapes the authorized Workspace.',
    );
  }
  return resolved;
}

async function writeExclusive(filePath: string, bytes: Buffer): Promise<void> {
  const handle = await open(filePath, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error: unknown) {
    if (hasNodeErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw migrationError(
    'project-entity-migration-cancelled',
    'Project Entity migration inventory operation was cancelled.',
    signal.reason,
  );
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function migrationError(
  code: NodeProjectEntityMigrationInventoryError['code'],
  message: string,
  cause?: unknown,
): NodeProjectEntityMigrationInventoryError {
  return new NodeProjectEntityMigrationInventoryError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStableIdentity(value: string): boolean {
  return value.trim().length > 0 && value.length <= 256 && !/[\\/\0]/u.test(value);
}
