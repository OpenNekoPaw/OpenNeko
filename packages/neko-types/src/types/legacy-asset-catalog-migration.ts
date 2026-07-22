import { normalizeWorkspaceContentPath, validateContentLocator } from './content-locator';
import { isCreativeEntityKind, type CreativeEntityKind } from './creative-entity-identity';
import {
  isEntityRepresentationRole,
  type EntityRepresentationRole,
  type EntityRepresentationTarget,
} from './entity-representation-binding';

export const LEGACY_ASSET_MIGRATION_CONTRACT_VERSION = 1 as const;

export type LegacyAssetInspectionFileRole =
  'asset-catalog' | 'entity-bindings' | 'canvas-document' | 'cut-project' | 'agent-data';

export type LegacyAssetInspectionSource =
  | {
      readonly kind: 'project-file';
      readonly sourceId: string;
      readonly role: LegacyAssetInspectionFileRole;
      readonly workspacePath: string;
      readonly digest: string;
      readonly byteLength: number;
      readonly schemaVersion?: string;
    }
  | {
      readonly kind: 'local-projection';
      readonly sourceId: string;
      readonly partition: 'asset-library';
      readonly revision: string;
      readonly digest: string;
      readonly recordCount: number;
    };

export interface LegacyAssetMigrationSourceDigest {
  readonly sourceId: string;
  readonly digest: string;
}

export interface LegacyAssetMigrationRevisionPrecondition {
  readonly projectRevision: string;
  readonly sources: readonly LegacyAssetMigrationSourceDigest[];
}

export type LegacyAssetMigrationDiagnosticCode =
  | 'unsupported-version'
  | 'invalid-record'
  | 'source-missing'
  | 'source-changed'
  | 'non-portable-reference'
  | 'ambiguous-identity'
  | 'archive-required'
  | 'archive-write-failed'
  | 'confirmation-required'
  | 'unresolved-field'
  | 'migration-approval-required'
  | 'migration-precondition-failed'
  | 'migration-apply-failed'
  | 'migration-rollback-failed'
  | 'migration-recovery-failed';

export interface LegacyAssetMigrationDiagnostic {
  readonly code: LegacyAssetMigrationDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly sourceId?: string;
  readonly fieldPath?: readonly (string | number)[];
}

export interface LegacyAssetCatalogInspection {
  readonly version: typeof LEGACY_ASSET_MIGRATION_CONTRACT_VERSION;
  readonly inspectionId: string;
  readonly inspectedAt: string;
  readonly status: 'ready' | 'blocked';
  readonly precondition: LegacyAssetMigrationRevisionPrecondition;
  readonly sources: readonly LegacyAssetInspectionSource[];
  readonly legacyRecordCount: number;
  readonly diagnostics: readonly LegacyAssetMigrationDiagnostic[];
}

export type LegacyAssetUnresolvedReason =
  | 'unsupported-field'
  | 'unsupported-version'
  | 'ambiguous-owner'
  | 'ambiguous-identity'
  | 'missing-resource'
  | 'non-portable-reference'
  | 'invalid-record';

export interface LegacyAssetMigrationUnresolvedField {
  readonly unresolvedId: string;
  readonly sourceId: string;
  readonly fieldPath: readonly (string | number)[];
  readonly valueDigest: string;
  readonly reason: LegacyAssetUnresolvedReason;
  readonly disposition: 'archive-only' | 'confirmation-required';
}

export type LegacyAssetMigrationClassification =
  | {
      readonly kind: 'representation-reference';
      readonly itemId: string;
      readonly sourceId: string;
      readonly fieldPath: readonly (string | number)[];
      readonly target: EntityRepresentationTarget;
    }
  | {
      readonly kind: 'existing-entity-association';
      readonly itemId: string;
      readonly sourceId: string;
      readonly fieldPath: readonly (string | number)[];
      readonly entityId: string;
      readonly entityKind: CreativeEntityKind;
      readonly role?: EntityRepresentationRole;
    }
  | {
      readonly kind: 'entity-proposal';
      readonly itemId: string;
      readonly sourceId: string;
      readonly fieldPath: readonly (string | number)[];
      readonly proposalId: string;
      readonly entityKind: CreativeEntityKind;
      readonly suggestedName: string;
      readonly requiresConfirmation: true;
    }
  | {
      readonly kind: 'owner-provenance';
      readonly itemId: string;
      readonly sourceId: string;
      readonly fieldPath: readonly (string | number)[];
      readonly owner: 'generated-output' | 'package';
      readonly ownerId: string;
      readonly valueDigest: string;
    }
  | {
      readonly kind: 'rebuildable-projection';
      readonly itemId: string;
      readonly sourceId: string;
      readonly fieldPath: readonly (string | number)[];
      readonly projection: LegacyAssetRebuildableProjection;
    }
  | {
      readonly kind: 'unresolved';
      readonly itemId: string;
      readonly sourceId: string;
      readonly fieldPath: readonly (string | number)[];
      readonly unresolvedId: string;
    };

export type LegacyAssetRebuildableProjection =
  'media-library-search' | 'recent-use' | 'availability' | 'technical-metadata';

interface LegacyAssetMigrationArchiveBase {
  readonly archiveId: string;
  readonly digest: string;
  readonly byteLength: number;
  readonly workspacePath: string;
  readonly sources: readonly LegacyAssetMigrationSourceDigest[];
}

export type LegacyAssetMigrationArchive =
  | (LegacyAssetMigrationArchiveBase & { readonly status: 'planned' })
  | (LegacyAssetMigrationArchiveBase & {
      readonly status: 'verified';
      readonly verifiedAt: string;
    });

export type LegacyAssetMigrationOutput =
  | {
      readonly kind: 'write-project-file';
      readonly workspacePath: string;
      readonly expectedCurrentDigest: string | null;
      readonly digest: string;
    }
  | {
      readonly kind: 'remove-legacy-file';
      readonly workspacePath: string;
      readonly expectedDigest: string;
    }
  | {
      readonly kind: 'rebuild-projection';
      readonly projection: LegacyAssetRebuildableProjection;
    };

export interface LegacyAssetCatalogMigrationPlan {
  readonly version: typeof LEGACY_ASSET_MIGRATION_CONTRACT_VERSION;
  readonly planId: string;
  readonly inspectionId: string;
  readonly createdAt: string;
  readonly status: 'ready' | 'confirmation-required' | 'blocked';
  readonly precondition: LegacyAssetMigrationRevisionPrecondition;
  readonly archive: LegacyAssetMigrationArchive;
  readonly classifications: readonly LegacyAssetMigrationClassification[];
  readonly unresolvedFields: readonly LegacyAssetMigrationUnresolvedField[];
  readonly outputs: readonly LegacyAssetMigrationOutput[];
  readonly confirmationIds: readonly string[];
  readonly diagnostics: readonly LegacyAssetMigrationDiagnostic[];
}

export function createSafeLegacyAssetMigrationDiagnostic(
  code: LegacyAssetMigrationDiagnosticCode,
  context: {
    readonly sourceId?: string;
    readonly fieldPath?: readonly (string | number)[];
  } = {},
): LegacyAssetMigrationDiagnostic {
  const messages: Readonly<Record<LegacyAssetMigrationDiagnosticCode, string>> = {
    'unsupported-version': 'Legacy Asset data uses an unsupported schema version.',
    'invalid-record': 'Legacy Asset data contains an invalid record.',
    'source-missing': 'A legacy migration source is unavailable.',
    'source-changed': 'Legacy Asset data changed after inspection; inspect again.',
    'non-portable-reference': 'Legacy Asset data contains a non-portable reference.',
    'ambiguous-identity': 'Legacy Asset identity requires explicit user confirmation.',
    'archive-required': 'A verified migration archive is required before project changes.',
    'archive-write-failed': 'The migration archive could not be written and verified.',
    'confirmation-required': 'The migration plan requires explicit user confirmation.',
    'unresolved-field': 'Legacy Asset metadata has no confirmed target owner.',
    'migration-approval-required': 'The migration plan requires matching explicit approval.',
    'migration-precondition-failed':
      'Legacy Asset migration inputs changed after the dry run; inspect again.',
    'migration-apply-failed': 'Legacy Asset migration changes could not be applied atomically.',
    'migration-rollback-failed':
      'Legacy Asset migration rollback failed and requires explicit recovery.',
    'migration-recovery-failed': 'The migration archive could not be restored atomically.',
  };
  return {
    code,
    severity:
      code === 'ambiguous-identity' ||
      code === 'confirmation-required' ||
      code === 'unresolved-field'
        ? 'warning'
        : 'error',
    message: messages[code],
    ...(context.sourceId ? { sourceId: context.sourceId } : {}),
    ...(context.fieldPath ? { fieldPath: context.fieldPath } : {}),
  };
}

export function isLegacyAssetCatalogInspection(
  value: unknown,
): value is LegacyAssetCatalogInspection {
  if (!isRecord(value) || !hasOnlyKeys(value, INSPECTION_KEYS)) return false;
  const sources = value['sources'];
  const diagnostics = value['diagnostics'];
  if (
    value['version'] !== LEGACY_ASSET_MIGRATION_CONTRACT_VERSION ||
    !isSafeId(value['inspectionId']) ||
    !isTimestamp(value['inspectedAt']) ||
    (value['status'] !== 'ready' && value['status'] !== 'blocked') ||
    !isRevisionPrecondition(value['precondition']) ||
    !Array.isArray(sources) ||
    !sources.every(isInspectionSource) ||
    !isNonNegativeInteger(value['legacyRecordCount']) ||
    !Array.isArray(diagnostics) ||
    !diagnostics.every(isMigrationDiagnostic)
  ) {
    return false;
  }
  if (!hasUniqueValues(sources.map((source) => source.sourceId))) return false;
  if (!sameSourceDigests(sources, value['precondition'].sources)) return false;
  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return value['status'] === (hasError ? 'blocked' : 'ready');
}

export function isLegacyAssetCatalogMigrationPlan(
  value: unknown,
): value is LegacyAssetCatalogMigrationPlan {
  if (!isRecord(value) || !hasOnlyKeys(value, PLAN_KEYS)) return false;
  const classifications = value['classifications'];
  const unresolved = value['unresolvedFields'];
  const diagnostics = value['diagnostics'];
  if (
    value['version'] !== LEGACY_ASSET_MIGRATION_CONTRACT_VERSION ||
    !isSafeId(value['planId']) ||
    !isSafeId(value['inspectionId']) ||
    !isTimestamp(value['createdAt']) ||
    (value['status'] !== 'ready' &&
      value['status'] !== 'confirmation-required' &&
      value['status'] !== 'blocked') ||
    !isRevisionPrecondition(value['precondition']) ||
    !isMigrationArchive(value['archive']) ||
    !Array.isArray(classifications) ||
    !classifications.every(isLegacyAssetMigrationClassification) ||
    !Array.isArray(unresolved) ||
    !unresolved.every(isLegacyAssetMigrationUnresolvedField) ||
    !Array.isArray(value['outputs']) ||
    !value['outputs'].every(isMigrationOutput) ||
    !Array.isArray(value['confirmationIds']) ||
    !value['confirmationIds'].every(isSafeId) ||
    !Array.isArray(diagnostics) ||
    !diagnostics.every(isMigrationDiagnostic)
  ) {
    return false;
  }

  if (!hasUniqueValues(classifications.map((item) => item.itemId))) return false;
  if (!hasUniqueValues(unresolved.map((item) => item.unresolvedId))) return false;
  if (!hasUniqueValues(value['confirmationIds'])) return false;
  const unresolvedIds = new Set(unresolved.map((item) => item.unresolvedId));
  if (
    classifications.some(
      (item) => item.kind === 'unresolved' && !unresolvedIds.has(item.unresolvedId),
    )
  ) {
    return false;
  }

  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  const needsConfirmation =
    value['confirmationIds'].length > 0 ||
    classifications.some((item) => item.kind === 'entity-proposal') ||
    unresolved.some((item) => item.disposition === 'confirmation-required');
  const expectedStatus = hasError
    ? 'blocked'
    : needsConfirmation
      ? 'confirmation-required'
      : 'ready';
  return value['status'] === expectedStatus;
}

function isInspectionSource(value: unknown): value is LegacyAssetInspectionSource {
  if (!isRecord(value) || !isSafeId(value['sourceId']) || !isDigest(value['digest'])) return false;
  if (value['kind'] === 'project-file') {
    return (
      hasOnlyKeys(value, PROJECT_FILE_SOURCE_KEYS) &&
      isInspectionFileRole(value['role']) &&
      isWorkspacePath(value['workspacePath']) &&
      isNonNegativeInteger(value['byteLength']) &&
      (value['schemaVersion'] === undefined || isSafeText(value['schemaVersion']))
    );
  }
  return (
    value['kind'] === 'local-projection' &&
    hasOnlyKeys(value, LOCAL_PROJECTION_SOURCE_KEYS) &&
    value['partition'] === 'asset-library' &&
    isSafeText(value['revision']) &&
    isNonNegativeInteger(value['recordCount'])
  );
}

function isRevisionPrecondition(value: unknown): value is LegacyAssetMigrationRevisionPrecondition {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, PRECONDITION_KEYS) ||
    !isSafeText(value['projectRevision']) ||
    !Array.isArray(value['sources']) ||
    !value['sources'].every(isSourceDigest)
  ) {
    return false;
  }
  return hasUniqueValues(value['sources'].map((source) => source.sourceId));
}

function isSourceDigest(value: unknown): value is LegacyAssetMigrationSourceDigest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, SOURCE_DIGEST_KEYS) &&
    isSafeId(value['sourceId']) &&
    isDigest(value['digest'])
  );
}

function isMigrationArchive(value: unknown): value is LegacyAssetMigrationArchive {
  if (!isRecord(value)) return false;
  const keys = value['status'] === 'verified' ? VERIFIED_ARCHIVE_KEYS : PLANNED_ARCHIVE_KEYS;
  return (
    hasOnlyKeys(value, keys) &&
    isSafeId(value['archiveId']) &&
    isDigest(value['digest']) &&
    isNonNegativeInteger(value['byteLength']) &&
    isMigrationArchivePath(value['workspacePath']) &&
    Array.isArray(value['sources']) &&
    value['sources'].every(isSourceDigest) &&
    hasUniqueValues(value['sources'].map((source) => source.sourceId)) &&
    (value['status'] === 'planned' ||
      (value['status'] === 'verified' && isTimestamp(value['verifiedAt'])))
  );
}

export function isLegacyAssetMigrationClassification(
  value: unknown,
): value is LegacyAssetMigrationClassification {
  if (
    !isRecord(value) ||
    !isSafeId(value['itemId']) ||
    !isSafeId(value['sourceId']) ||
    !isSafeFieldPath(value['fieldPath'])
  ) {
    return false;
  }
  switch (value['kind']) {
    case 'representation-reference':
      return (
        hasOnlyKeys(value, REPRESENTATION_CLASSIFICATION_KEYS) &&
        validateContentLocator(value['target']).ok
      );
    case 'existing-entity-association':
      return (
        hasOnlyKeys(value, ENTITY_ASSOCIATION_CLASSIFICATION_KEYS) &&
        isSafeId(value['entityId']) &&
        isCreativeEntityKind(value['entityKind']) &&
        (value['role'] === undefined || isEntityRepresentationRole(value['role']))
      );
    case 'entity-proposal':
      return (
        hasOnlyKeys(value, ENTITY_PROPOSAL_CLASSIFICATION_KEYS) &&
        isSafeId(value['proposalId']) &&
        isCreativeEntityKind(value['entityKind']) &&
        isSafeText(value['suggestedName']) &&
        value['requiresConfirmation'] === true
      );
    case 'owner-provenance':
      return (
        hasOnlyKeys(value, OWNER_PROVENANCE_CLASSIFICATION_KEYS) &&
        (value['owner'] === 'generated-output' || value['owner'] === 'package') &&
        isOwnerIdentity(value['ownerId']) &&
        isDigest(value['valueDigest'])
      );
    case 'rebuildable-projection':
      return (
        hasOnlyKeys(value, REBUILD_CLASSIFICATION_KEYS) &&
        isRebuildableProjection(value['projection'])
      );
    case 'unresolved':
      return hasOnlyKeys(value, UNRESOLVED_CLASSIFICATION_KEYS) && isSafeId(value['unresolvedId']);
    default:
      return false;
  }
}

export function isLegacyAssetMigrationUnresolvedField(
  value: unknown,
): value is LegacyAssetMigrationUnresolvedField {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, UNRESOLVED_FIELD_KEYS) &&
    isSafeId(value['unresolvedId']) &&
    isSafeId(value['sourceId']) &&
    isSafeFieldPath(value['fieldPath']) &&
    isDigest(value['valueDigest']) &&
    isUnresolvedReason(value['reason']) &&
    (value['disposition'] === 'archive-only' || value['disposition'] === 'confirmation-required')
  );
}

function isMigrationOutput(value: unknown): value is LegacyAssetMigrationOutput {
  if (!isRecord(value)) return false;
  switch (value['kind']) {
    case 'write-project-file':
      return (
        hasOnlyKeys(value, WRITE_OUTPUT_KEYS) &&
        isWorkspacePath(value['workspacePath']) &&
        (value['expectedCurrentDigest'] === null || isDigest(value['expectedCurrentDigest'])) &&
        isDigest(value['digest'])
      );
    case 'remove-legacy-file':
      return (
        hasOnlyKeys(value, REMOVE_OUTPUT_KEYS) &&
        isWorkspacePath(value['workspacePath']) &&
        isDigest(value['expectedDigest'])
      );
    case 'rebuild-projection':
      return (
        hasOnlyKeys(value, REBUILD_OUTPUT_KEYS) && isRebuildableProjection(value['projection'])
      );
    default:
      return false;
  }
}

function isMigrationDiagnostic(value: unknown): value is LegacyAssetMigrationDiagnostic {
  if (!isRecord(value) || !hasOnlyKeys(value, DIAGNOSTIC_KEYS)) return false;
  if (!isDiagnosticCode(value['code'])) return false;
  const expected = createSafeLegacyAssetMigrationDiagnostic(value['code'], {
    ...(value['sourceId'] !== undefined && isSafeId(value['sourceId'])
      ? { sourceId: value['sourceId'] }
      : {}),
    ...(value['fieldPath'] !== undefined && isSafeFieldPath(value['fieldPath'])
      ? { fieldPath: value['fieldPath'] }
      : {}),
  });
  return (
    (value['sourceId'] === undefined || isSafeId(value['sourceId'])) &&
    (value['fieldPath'] === undefined || isSafeFieldPath(value['fieldPath'])) &&
    value['severity'] === expected.severity &&
    value['message'] === expected.message
  );
}

function sameSourceDigests(
  sources: readonly LegacyAssetInspectionSource[],
  expected: readonly LegacyAssetMigrationSourceDigest[],
): boolean {
  if (sources.length !== expected.length) return false;
  const byId = new Map(expected.map((source) => [source.sourceId, source.digest]));
  return sources.every((source) => byId.get(source.sourceId) === source.digest);
}

function isInspectionFileRole(value: unknown): value is LegacyAssetInspectionFileRole {
  return (
    value === 'asset-catalog' ||
    value === 'entity-bindings' ||
    value === 'canvas-document' ||
    value === 'cut-project' ||
    value === 'agent-data'
  );
}

function isDiagnosticCode(value: unknown): value is LegacyAssetMigrationDiagnosticCode {
  return (
    value === 'unsupported-version' ||
    value === 'invalid-record' ||
    value === 'source-missing' ||
    value === 'source-changed' ||
    value === 'non-portable-reference' ||
    value === 'ambiguous-identity' ||
    value === 'archive-required' ||
    value === 'archive-write-failed' ||
    value === 'confirmation-required' ||
    value === 'unresolved-field' ||
    value === 'migration-approval-required' ||
    value === 'migration-precondition-failed' ||
    value === 'migration-apply-failed' ||
    value === 'migration-rollback-failed' ||
    value === 'migration-recovery-failed'
  );
}

function isUnresolvedReason(value: unknown): value is LegacyAssetUnresolvedReason {
  return (
    value === 'unsupported-field' ||
    value === 'unsupported-version' ||
    value === 'ambiguous-owner' ||
    value === 'ambiguous-identity' ||
    value === 'missing-resource' ||
    value === 'non-portable-reference' ||
    value === 'invalid-record'
  );
}

function isRebuildableProjection(value: unknown): value is LegacyAssetRebuildableProjection {
  return (
    value === 'media-library-search' ||
    value === 'recent-use' ||
    value === 'availability' ||
    value === 'technical-metadata'
  );
}

function isMigrationArchivePath(value: unknown): value is string {
  return (
    isWorkspacePath(value) &&
    value.startsWith('neko/migrations/asset-catalog/') &&
    value.endsWith('.json')
  );
}

function isWorkspacePath(value: unknown): value is string {
  return typeof value === 'string' && normalizeWorkspaceContentPath(value) === value;
}

function isSafeId(value: unknown): value is string {
  return (
    isSafeText(value) &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes(':') &&
    !value.includes('${')
  );
}

function isSafeText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !value.includes('\0') &&
    !value.includes('project://assets/') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:[\\/]/u.test(value)
  );
}

function isOwnerIdentity(value: unknown): value is string {
  return isSafeText(value) && !value.includes('${');
}

function isSafeFieldPath(value: unknown): value is readonly (string | number)[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (segment) =>
        (typeof segment === 'number' && Number.isInteger(segment) && segment >= 0) ||
        (typeof segment === 'string' && /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(segment)),
    )
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:+._-]*$/u.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const PROJECT_FILE_SOURCE_KEYS = [
  'kind',
  'sourceId',
  'role',
  'workspacePath',
  'digest',
  'byteLength',
  'schemaVersion',
] as const;
const LOCAL_PROJECTION_SOURCE_KEYS = [
  'kind',
  'sourceId',
  'partition',
  'revision',
  'digest',
  'recordCount',
] as const;
const SOURCE_DIGEST_KEYS = ['sourceId', 'digest'] as const;
const PRECONDITION_KEYS = ['projectRevision', 'sources'] as const;
const DIAGNOSTIC_KEYS = ['code', 'severity', 'message', 'sourceId', 'fieldPath'] as const;
const INSPECTION_KEYS = [
  'version',
  'inspectionId',
  'inspectedAt',
  'status',
  'precondition',
  'sources',
  'legacyRecordCount',
  'diagnostics',
] as const;
const PLANNED_ARCHIVE_KEYS = [
  'archiveId',
  'digest',
  'byteLength',
  'workspacePath',
  'sources',
  'status',
] as const;
const VERIFIED_ARCHIVE_KEYS = [...PLANNED_ARCHIVE_KEYS, 'verifiedAt'] as const;
const CLASSIFICATION_BASE_KEYS = ['kind', 'itemId', 'sourceId', 'fieldPath'] as const;
const REPRESENTATION_CLASSIFICATION_KEYS = [...CLASSIFICATION_BASE_KEYS, 'target'] as const;
const ENTITY_ASSOCIATION_CLASSIFICATION_KEYS = [
  ...CLASSIFICATION_BASE_KEYS,
  'entityId',
  'entityKind',
  'role',
] as const;
const ENTITY_PROPOSAL_CLASSIFICATION_KEYS = [
  ...CLASSIFICATION_BASE_KEYS,
  'proposalId',
  'entityKind',
  'suggestedName',
  'requiresConfirmation',
] as const;
const OWNER_PROVENANCE_CLASSIFICATION_KEYS = [
  ...CLASSIFICATION_BASE_KEYS,
  'owner',
  'ownerId',
  'valueDigest',
] as const;
const REBUILD_CLASSIFICATION_KEYS = [...CLASSIFICATION_BASE_KEYS, 'projection'] as const;
const UNRESOLVED_CLASSIFICATION_KEYS = [...CLASSIFICATION_BASE_KEYS, 'unresolvedId'] as const;
const UNRESOLVED_FIELD_KEYS = [
  'unresolvedId',
  'sourceId',
  'fieldPath',
  'valueDigest',
  'reason',
  'disposition',
] as const;
const WRITE_OUTPUT_KEYS = ['kind', 'workspacePath', 'expectedCurrentDigest', 'digest'] as const;
const REMOVE_OUTPUT_KEYS = ['kind', 'workspacePath', 'expectedDigest'] as const;
const REBUILD_OUTPUT_KEYS = ['kind', 'projection'] as const;
const PLAN_KEYS = [
  'version',
  'planId',
  'inspectionId',
  'createdAt',
  'status',
  'precondition',
  'archive',
  'classifications',
  'unresolvedFields',
  'outputs',
  'confirmationIds',
  'diagnostics',
] as const;
