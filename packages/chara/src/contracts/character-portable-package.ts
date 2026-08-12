import { CHARACTER_REPRESENTATION_KINDS, type CharacterRepresentationKind } from './character';
import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireNonNegativeInteger,
  requireOneOf,
  requireString,
  requireUniqueIdentities,
} from './codec';

export const CHARACTER_PORTABLE_RECORD_KINDS = [
  'character-project',
  'character-version',
  'character-version-lineage',
  'character-storyline',
  'character-storyline-draft',
  'character-storyline-version',
  'authoring-test-snapshot',
] as const;

export type CharacterPortableRecordKind = (typeof CHARACTER_PORTABLE_RECORD_KINDS)[number];

export interface CharacterPortableRecordEntry {
  readonly kind: CharacterPortableRecordKind;
  readonly recordId: string;
  readonly archivePath: string;
  readonly byteLength: number;
  readonly integrityDigest: string;
}

export interface CharacterPortableEmbeddedAssetEntry {
  readonly representationId: string;
  readonly kind: CharacterRepresentationKind;
  readonly archivePath: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly integrityDigest: string;
}

export interface CharacterPortableExternalDependency {
  readonly representationId: string;
  readonly kind: CharacterRepresentationKind;
  readonly resourceRef: string;
}

export interface CharacterPortablePackageManifest {
  readonly characterProjectId: string;
  readonly entryRecordPath: string;
  readonly records: readonly CharacterPortableRecordEntry[];
  readonly embeddedAssets: readonly CharacterPortableEmbeddedAssetEntry[];
  readonly externalDependencies: readonly CharacterPortableExternalDependency[];
}

export function parseCharacterPortablePackageManifest(
  value: unknown,
): CharacterPortablePackageManifest {
  const record = requireExactRecord(
    value,
    ['characterProjectId', 'entryRecordPath', 'records', 'embeddedAssets', 'externalDependencies'],
    'Character portable package manifest',
  );
  const characterProjectId = requireIdentity(
    record['characterProjectId'],
    'Character portable package CharacterProject identity',
  );
  const entryRecordPath = requireArchivePath(
    record['entryRecordPath'],
    'Character portable package entry record path',
    'character/',
  );
  const records = requireUniqueIdentities(
    requireArray(
      record['records'],
      parseCharacterPortableRecordEntry,
      'Character portable package records',
    ),
    (entry) => `${entry.kind}:${entry.recordId}`,
    'Character portable package records',
  );
  requireUniqueArchivePaths(records, 'Character portable package records');
  const entry = records.find((candidate) => candidate.archivePath === entryRecordPath);
  if (!entry || entry.kind !== 'character-project' || entry.recordId !== characterProjectId) {
    throw new Error(
      'Character portable package entryRecordPath must identify the exact entry CharacterProject record.',
    );
  }
  const embeddedAssets = requireArray(
    record['embeddedAssets'],
    parseCharacterPortableEmbeddedAssetEntry,
    'Character portable package embedded assets',
  );
  requireUniqueArchivePaths(embeddedAssets, 'Character portable package embedded assets');
  const externalDependencies = requireUniqueIdentities(
    requireArray(
      record['externalDependencies'],
      parseCharacterPortableExternalDependency,
      'Character portable package external dependencies',
    ),
    (entry) => entry.representationId,
    'Character portable package external dependencies',
  );
  const embeddedRepresentationIds = new Set(embeddedAssets.map((entry) => entry.representationId));
  const ambiguous = externalDependencies.find((entry) =>
    embeddedRepresentationIds.has(entry.representationId),
  );
  if (ambiguous) {
    throw new Error(
      `Character representation '${ambiguous.representationId}' cannot be both embedded and external.`,
    );
  }
  const allArchivePaths = [...records, ...embeddedAssets];
  requireUniqueArchivePaths(allArchivePaths, 'Character portable package entries');
  return {
    characterProjectId,
    entryRecordPath,
    records,
    embeddedAssets,
    externalDependencies,
  };
}

export function parseCharacterPortableRecordEntry(value: unknown): CharacterPortableRecordEntry {
  const record = requireExactRecord(
    value,
    ['kind', 'recordId', 'archivePath', 'byteLength', 'integrityDigest'],
    'Character portable record entry',
  );
  return {
    kind: requireOneOf(
      record['kind'],
      CHARACTER_PORTABLE_RECORD_KINDS,
      'Character portable record kind',
    ),
    recordId: requireIdentity(record['recordId'], 'Character portable record identity'),
    archivePath: requireArchivePath(
      record['archivePath'],
      'Character portable record archive path',
      'character/',
    ),
    byteLength: requireNonNegativeInteger(
      record['byteLength'],
      'Character portable record byte length',
    ),
    integrityDigest: requireIntegrityDigest(
      record['integrityDigest'],
      'Character portable record integrity digest',
    ),
  };
}

export function parseCharacterPortableEmbeddedAssetEntry(
  value: unknown,
): CharacterPortableEmbeddedAssetEntry {
  const record = requireExactRecord(
    value,
    ['representationId', 'kind', 'archivePath', 'mediaType', 'byteLength', 'integrityDigest'],
    'Character portable embedded asset entry',
  );
  const mediaType = requireString(record['mediaType'], 'Character portable asset media type');
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(mediaType)) {
    throw new Error('Character portable asset media type must be a valid MIME type.');
  }
  return {
    representationId: requireIdentity(
      record['representationId'],
      'Character portable asset representation identity',
    ),
    kind: requireOneOf(
      record['kind'],
      CHARACTER_REPRESENTATION_KINDS,
      'Character portable asset representation kind',
    ),
    archivePath: requireArchivePath(
      record['archivePath'],
      'Character portable asset archive path',
      'assets/',
    ),
    mediaType,
    byteLength: requireNonNegativeInteger(
      record['byteLength'],
      'Character portable asset byte length',
    ),
    integrityDigest: requireIntegrityDigest(
      record['integrityDigest'],
      'Character portable asset integrity digest',
    ),
  };
}

export function parseCharacterPortableExternalDependency(
  value: unknown,
): CharacterPortableExternalDependency {
  const record = requireExactRecord(
    value,
    ['representationId', 'kind', 'resourceRef'],
    'Character portable external dependency',
  );
  const resourceRef = requireIdentity(
    record['resourceRef'],
    'Character portable external dependency resource ref',
  );
  if (!/^[a-z][a-z0-9+.-]*:[^\s]+$/u.test(resourceRef) || /^file:/u.test(resourceRef)) {
    throw new Error(
      'Character portable external dependency must use an opaque non-file resource ref.',
    );
  }
  return {
    representationId: requireIdentity(
      record['representationId'],
      'Character portable external dependency representation identity',
    ),
    kind: requireOneOf(
      record['kind'],
      CHARACTER_REPRESENTATION_KINDS,
      'Character portable external dependency representation kind',
    ),
    resourceRef,
  };
}

function requireArchivePath(value: unknown, label: string, prefix: string): string {
  const path = requireIdentity(value, label);
  if (
    !path.startsWith(prefix) ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\u0000') ||
    path.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new Error(`${label} must be a safe relative path below '${prefix}'.`);
  }
  return path;
}

function requireIntegrityDigest(value: unknown, label: string): string {
  const digest = requireIdentity(value, label);
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) {
    throw new Error(`${label} must be a sha256 digest.`);
  }
  return digest;
}

function requireUniqueArchivePaths<T extends { readonly archivePath: string }>(
  entries: readonly T[],
  label: string,
): void {
  requireUniqueIdentities(entries, (entry) => entry.archivePath, label);
}
