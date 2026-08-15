import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireNonNegativeInteger,
  requireOneOf,
  requireUniqueIdentities,
} from './codec';

export const WORLD_PORTABLE_RECORD_KINDS = ['world-project', 'world-version'] as const;
export const WORLD_PORTABLE_DEPENDENCY_OWNER_KINDS = [
  'character-version',
  'entity',
  'asset',
  'content',
  'other',
] as const;
export const WORLD_PORTABLE_RESOURCE_OWNER_KINDS = ['world', 'asset', 'content'] as const;

export type WorldPortableRecordKind = (typeof WORLD_PORTABLE_RECORD_KINDS)[number];
export type WorldPortableDependencyOwnerKind =
  (typeof WORLD_PORTABLE_DEPENDENCY_OWNER_KINDS)[number];
export type WorldPortableResourceOwnerKind = (typeof WORLD_PORTABLE_RESOURCE_OWNER_KINDS)[number];

export interface WorldPortableRecordEntry {
  readonly kind: WorldPortableRecordKind;
  readonly recordId: string;
  readonly archivePath: string;
  readonly byteLength: number;
  readonly integrityDigest: string;
}

export interface WorldPortableEmbeddedResourceEntry {
  readonly resourceId: string;
  readonly ownerKind: WorldPortableResourceOwnerKind;
  readonly resourceRef: string;
  readonly archivePath: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly integrityDigest: string;
}

export interface WorldPortableExternalDependency {
  readonly ownerKind: WorldPortableDependencyOwnerKind;
  readonly dependencyId: string;
  readonly resourceRef: string;
  readonly required: boolean;
}

export interface WorldPortablePackageManifest {
  readonly worldProjectId: string;
  readonly entryRecordPath: string;
  readonly records: readonly WorldPortableRecordEntry[];
  readonly embeddedResources: readonly WorldPortableEmbeddedResourceEntry[];
  readonly externalDependencies: readonly WorldPortableExternalDependency[];
}

export interface WorldPortableExportSelection {
  readonly worldProjectId: string;
  readonly worldVersionId: string;
  readonly embeddedResourceIds: readonly string[];
}

export interface WorldPortableExportPreview {
  readonly selection: WorldPortableExportSelection;
  readonly records: readonly {
    readonly kind: WorldPortableRecordKind;
    readonly recordId: string;
  }[];
  readonly embeddedResources: readonly WorldPortableEmbeddedResourceEntry[];
  readonly externalDependencies: readonly WorldPortableExternalDependency[];
  readonly unresolvedDependencyIds: readonly string[];
  readonly estimatedExpandedBytes: number;
  readonly destinationAuthorized: boolean;
  readonly canExport: boolean;
}

export interface WorldPortableIdentityConflict {
  readonly kind: WorldPortableRecordKind | 'embedded-resource';
  readonly recordId: string;
}

export interface WorldPortableImportPreview {
  readonly worldProjectId: string;
  readonly worldVersionId: string;
  readonly embeddedResources: readonly WorldPortableEmbeddedResourceEntry[];
  readonly externalDependencies: readonly WorldPortableExternalDependency[];
  readonly conflicts: readonly WorldPortableIdentityConflict[];
  readonly canCommit: boolean;
}

export type WorldPortableOperationResult =
  | {
      readonly kind: 'export-completed';
      readonly worldProjectId: string;
      readonly worldVersionId: string;
      readonly archiveByteLength: number;
    }
  | {
      readonly kind: 'import-completed';
      readonly worldProjectId: string;
      readonly worldVersionId: string;
    };

export function parseWorldPortablePackageManifest(value: unknown): WorldPortablePackageManifest {
  const record = requireExactRecord(
    value,
    ['worldProjectId', 'entryRecordPath', 'records', 'embeddedResources', 'externalDependencies'],
    'World portable package manifest',
  );
  const worldProjectId = requireIdentity(record['worldProjectId'], 'World portable WorldProject');
  const entryRecordPath = requireArchivePath(
    record['entryRecordPath'],
    'World portable entry record path',
    'world/',
  );
  const records = requireUniqueIdentities(
    requireArray(record['records'], parseWorldPortableRecordEntry, 'World portable records'),
    (entry) => `${entry.kind}:${entry.recordId}`,
    'World portable records',
  );
  requireUniqueArchivePaths(records, 'World portable records');
  const entry = records.find((candidate) => candidate.archivePath === entryRecordPath);
  if (!entry || entry.kind !== 'world-project' || entry.recordId !== worldProjectId) {
    throw new Error('World portable entryRecordPath must identify the exact WorldProject record.');
  }
  const embeddedResources = requireUniqueIdentities(
    requireArray(
      record['embeddedResources'],
      parseWorldPortableEmbeddedResourceEntry,
      'World portable embedded resources',
    ),
    (resource) => resource.resourceId,
    'World portable embedded resources',
  );
  requireUniqueArchivePaths(embeddedResources, 'World portable embedded resources');
  requireUniqueArchivePaths([...records, ...embeddedResources], 'World portable archive entries');
  const externalDependencies = requireUniqueIdentities(
    requireArray(
      record['externalDependencies'],
      parseWorldPortableExternalDependency,
      'World portable external dependencies',
    ),
    (dependency) => `${dependency.ownerKind}:${dependency.dependencyId}`,
    'World portable external dependencies',
  );
  return { worldProjectId, entryRecordPath, records, embeddedResources, externalDependencies };
}

export function parseWorldPortableExportSelection(value: unknown): WorldPortableExportSelection {
  const record = requireExactRecord(
    value,
    ['worldProjectId', 'worldVersionId', 'embeddedResourceIds'],
    'World portable export selection',
  );
  return {
    worldProjectId: requireIdentity(record['worldProjectId'], 'World portable export WorldProject'),
    worldVersionId: requireIdentity(record['worldVersionId'], 'World portable WorldVersion'),
    embeddedResourceIds: identityList(
      record['embeddedResourceIds'],
      'World portable embedded resources',
    ),
  };
}

export function parseWorldPortableExportPreview(value: unknown): WorldPortableExportPreview {
  const record = requireExactRecord(
    value,
    [
      'selection',
      'records',
      'embeddedResources',
      'externalDependencies',
      'unresolvedDependencyIds',
      'estimatedExpandedBytes',
      'destinationAuthorized',
      'canExport',
    ],
    'World portable export preview',
  );
  const unresolvedDependencyIds = identityList(
    record['unresolvedDependencyIds'],
    'World portable unresolved dependencies',
  );
  const destinationAuthorized = requireBoolean(
    record['destinationAuthorized'],
    'World portable destination authorization',
  );
  const canExport = requireBoolean(record['canExport'], 'World portable export state');
  if (canExport !== (destinationAuthorized && unresolvedDependencyIds.length === 0)) {
    throw new Error('World portable canExport must match destination and dependency readiness.');
  }
  return {
    selection: parseWorldPortableExportSelection(record['selection']),
    records: requireUniqueIdentities(
      requireArray(record['records'], parseRecordIdentity, 'World portable export records'),
      (entry) => `${entry.kind}:${entry.recordId}`,
      'World portable export records',
    ),
    embeddedResources: requireArray(
      record['embeddedResources'],
      parseWorldPortableEmbeddedResourceEntry,
      'World portable export embedded resources',
    ),
    externalDependencies: requireArray(
      record['externalDependencies'],
      parseWorldPortableExternalDependency,
      'World portable export external dependencies',
    ),
    unresolvedDependencyIds,
    estimatedExpandedBytes: requireNonNegativeInteger(
      record['estimatedExpandedBytes'],
      'World portable estimated bytes',
    ),
    destinationAuthorized,
    canExport,
  };
}

export function parseWorldPortableImportPreview(value: unknown): WorldPortableImportPreview {
  const record = requireExactRecord(
    value,
    [
      'worldProjectId',
      'worldVersionId',
      'embeddedResources',
      'externalDependencies',
      'conflicts',
      'canCommit',
    ],
    'World portable import preview',
  );
  const conflicts = requireUniqueIdentities(
    requireArray(record['conflicts'], parseConflict, 'World portable import conflicts'),
    (entry) => `${entry.kind}:${entry.recordId}`,
    'World portable import conflicts',
  );
  const canCommit = requireBoolean(record['canCommit'], 'World portable import commit state');
  if (canCommit !== (conflicts.length === 0)) {
    throw new Error('World portable canCommit must match exact conflicts.');
  }
  return {
    worldProjectId: requireIdentity(record['worldProjectId'], 'World portable import WorldProject'),
    worldVersionId: requireIdentity(record['worldVersionId'], 'World portable import WorldVersion'),
    embeddedResources: requireArray(
      record['embeddedResources'],
      parseWorldPortableEmbeddedResourceEntry,
      'World portable import embedded resources',
    ),
    externalDependencies: requireArray(
      record['externalDependencies'],
      parseWorldPortableExternalDependency,
      'World portable import external dependencies',
    ),
    conflicts,
    canCommit,
  };
}

export function parseWorldPortableOperationResult(value: unknown): WorldPortableOperationResult {
  const record = requireExactRecord(
    value,
    ['kind', 'worldProjectId', 'worldVersionId', 'archiveByteLength'],
    'World portable operation result',
  );
  const kind = requireOneOf(
    record['kind'],
    ['export-completed', 'import-completed'] as const,
    'World portable operation result kind',
  );
  const base = {
    kind,
    worldProjectId: requireIdentity(record['worldProjectId'], 'World portable result WorldProject'),
    worldVersionId: requireIdentity(record['worldVersionId'], 'World portable result WorldVersion'),
  };
  if (kind === 'export-completed') {
    return {
      ...base,
      kind,
      archiveByteLength: requireNonNegativeInteger(
        record['archiveByteLength'],
        'World portable archive byte length',
      ),
    };
  }
  if (record['archiveByteLength'] !== undefined) {
    throw new Error('World portable import result cannot carry archive byte length.');
  }
  return { ...base, kind };
}

export function parseWorldPortableRecordEntry(value: unknown): WorldPortableRecordEntry {
  const record = requireExactRecord(
    value,
    ['kind', 'recordId', 'archivePath', 'byteLength', 'integrityDigest'],
    'World portable record entry',
  );
  return {
    kind: requireOneOf(record['kind'], WORLD_PORTABLE_RECORD_KINDS, 'World portable record kind'),
    recordId: requireIdentity(record['recordId'], 'World portable record identity'),
    archivePath: requireArchivePath(record['archivePath'], 'World portable record path', 'world/'),
    byteLength: requireNonNegativeInteger(record['byteLength'], 'World portable record bytes'),
    integrityDigest: requireDigest(record['integrityDigest'], 'World portable record digest'),
  };
}

export function parseWorldPortableEmbeddedResourceEntry(
  value: unknown,
): WorldPortableEmbeddedResourceEntry {
  const record = requireExactRecord(
    value,
    [
      'resourceId',
      'ownerKind',
      'resourceRef',
      'archivePath',
      'mediaType',
      'byteLength',
      'integrityDigest',
    ],
    'World portable embedded resource',
  );
  const mediaType = requireIdentity(record['mediaType'], 'World portable resource media type');
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(mediaType)) {
    throw new Error('World portable resource media type must be a MIME type.');
  }
  return {
    resourceId: requireIdentity(record['resourceId'], 'World portable resource identity'),
    ownerKind: requireOneOf(
      record['ownerKind'],
      WORLD_PORTABLE_RESOURCE_OWNER_KINDS,
      'World portable resource owner',
    ),
    resourceRef: requireOpaqueRef(record['resourceRef'], 'World portable resource ref'),
    archivePath: requireArchivePath(
      record['archivePath'],
      'World portable resource path',
      'resources/',
    ),
    mediaType,
    byteLength: requireNonNegativeInteger(record['byteLength'], 'World portable resource bytes'),
    integrityDigest: requireDigest(record['integrityDigest'], 'World portable resource digest'),
  };
}

export function parseWorldPortableExternalDependency(
  value: unknown,
): WorldPortableExternalDependency {
  const record = requireExactRecord(
    value,
    ['ownerKind', 'dependencyId', 'resourceRef', 'required'],
    'World portable external dependency',
  );
  return {
    ownerKind: requireOneOf(
      record['ownerKind'],
      WORLD_PORTABLE_DEPENDENCY_OWNER_KINDS,
      'World portable dependency owner',
    ),
    dependencyId: requireIdentity(record['dependencyId'], 'World portable dependency identity'),
    resourceRef: requireOpaqueRef(record['resourceRef'], 'World portable dependency ref'),
    required: requireBoolean(record['required'], 'World portable dependency requirement'),
  };
}

function parseRecordIdentity(value: unknown) {
  const record = requireExactRecord(value, ['kind', 'recordId'], 'World portable record identity');
  return {
    kind: requireOneOf(record['kind'], WORLD_PORTABLE_RECORD_KINDS, 'World portable record kind'),
    recordId: requireIdentity(record['recordId'], 'World portable record identity'),
  };
}

function parseConflict(value: unknown): WorldPortableIdentityConflict {
  const record = requireExactRecord(value, ['kind', 'recordId'], 'World portable conflict');
  return {
    kind: requireOneOf(
      record['kind'],
      [...WORLD_PORTABLE_RECORD_KINDS, 'embedded-resource'] as const,
      'World portable conflict kind',
    ),
    recordId: requireIdentity(record['recordId'], 'World portable conflict identity'),
  };
}

function identityList(value: unknown, label: string): readonly string[] {
  return requireUniqueIdentities(
    requireArray(value, (item) => requireIdentity(item, label), label),
    (identity) => identity,
    label,
  );
}

function requireArchivePath(value: unknown, label: string, prefix: string): string {
  const path = requireIdentity(value, label);
  if (
    !path.startsWith(prefix) ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\u0000') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`${label} must be a safe relative path below '${prefix}'.`);
  }
  return path;
}

function requireDigest(value: unknown, label: string): string {
  const digest = requireIdentity(value, label);
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) throw new Error(`${label} must be sha256.`);
  return digest;
}

function requireOpaqueRef(value: unknown, label: string): string {
  const resourceRef = requireIdentity(value, label);
  if (!/^[a-z][a-z0-9+.-]*:[^\s]+$/u.test(resourceRef) || /^file:/u.test(resourceRef)) {
    throw new Error(`${label} must be an opaque non-file reference.`);
  }
  return resourceRef;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`);
  return value;
}

function requireUniqueArchivePaths<T extends { readonly archivePath: string }>(
  entries: readonly T[],
  label: string,
): void {
  requireUniqueIdentities(entries, (entry) => entry.archivePath, label);
}
