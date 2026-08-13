import { CHARACTER_REPRESENTATION_KINDS, type CharacterRepresentationKind } from './character';
import { parseCharacterRepresentationRef } from './character';
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
  readonly resourceRef: string;
  readonly archivePath: string;
  readonly entry: boolean;
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

export type CharacterPortableDestination =
  | { readonly kind: 'standalone-library' }
  | { readonly kind: 'content-project'; readonly contentProjectId: string };

export interface CharacterPortableIdentityConflict {
  readonly kind: CharacterPortableRecordKind | 'localized-asset';
  readonly recordId: string;
}

export interface CharacterPortablePackagePreview {
  readonly destination: CharacterPortableDestination;
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly characterVersionIds: readonly string[];
  readonly branchHeadCharacterVersionIds: readonly string[];
  readonly unlinkedCharacterVersionIds: readonly string[];
  readonly characterStorylineIds: readonly string[];
  readonly embeddedAssets: readonly CharacterPortableEmbeddedAssetEntry[];
  readonly externalDependencies: readonly CharacterPortableExternalDependency[];
  readonly conflicts: readonly CharacterPortableIdentityConflict[];
  readonly canCommit: boolean;
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
  validateEmbeddedAssetBindings(embeddedAssets);
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

export function parseCharacterPortablePackagePreview(
  value: unknown,
): CharacterPortablePackagePreview {
  const record = requireExactRecord(
    value,
    [
      'destination',
      'characterProjectId',
      'displayName',
      'characterVersionIds',
      'branchHeadCharacterVersionIds',
      'unlinkedCharacterVersionIds',
      'characterStorylineIds',
      'embeddedAssets',
      'externalDependencies',
      'conflicts',
      'canCommit',
    ],
    'Character portable package preview',
  );
  const conflicts = requireUniqueIdentities(
    requireArray(
      record['conflicts'],
      parseCharacterPortableIdentityConflict,
      'Character portable package preview conflicts',
    ),
    (entry) => `${entry.kind}:${entry.recordId}`,
    'Character portable package preview conflicts',
  );
  const canCommit = requireBoolean(
    record['canCommit'],
    'Character portable package preview commit state',
  );
  if (canCommit !== (conflicts.length === 0)) {
    throw new Error('Character portable package preview canCommit must match its conflicts.');
  }
  return {
    destination: parseCharacterPortableDestination(record['destination']),
    characterProjectId: requireIdentity(
      record['characterProjectId'],
      'Character portable package preview CharacterProject identity',
    ),
    displayName: requireIdentity(
      record['displayName'],
      'Character portable package preview display name',
    ),
    characterVersionIds: identityList(
      record['characterVersionIds'],
      'Character portable package preview CharacterVersions',
    ),
    branchHeadCharacterVersionIds: identityList(
      record['branchHeadCharacterVersionIds'],
      'Character portable package preview branch heads',
    ),
    unlinkedCharacterVersionIds: identityList(
      record['unlinkedCharacterVersionIds'],
      'Character portable package preview unlinked versions',
    ),
    characterStorylineIds: identityList(
      record['characterStorylineIds'],
      'Character portable package preview Storylines',
    ),
    embeddedAssets: requireArray(
      record['embeddedAssets'],
      parseCharacterPortableEmbeddedAssetEntry,
      'Character portable package preview embedded assets',
    ),
    externalDependencies: requireArray(
      record['externalDependencies'],
      parseCharacterPortableExternalDependency,
      'Character portable package preview external dependencies',
    ),
    conflicts,
    canCommit,
  };
}

export function parseCharacterPortableDestination(value: unknown): CharacterPortableDestination {
  const record = requireExactRecord(
    value,
    ['kind', 'contentProjectId'],
    'Character portable package destination',
  );
  const kind = requireOneOf(
    record['kind'],
    ['standalone-library', 'content-project'] as const,
    'Character portable package destination kind',
  );
  if (kind === 'standalone-library') {
    if (record['contentProjectId'] !== undefined) {
      throw new Error('Standalone Character destination cannot identify a Content Project.');
    }
    return { kind };
  }
  return {
    kind,
    contentProjectId: requireIdentity(
      record['contentProjectId'],
      'Character portable package destination Content Project identity',
    ),
  };
}

function parseCharacterPortableIdentityConflict(value: unknown): CharacterPortableIdentityConflict {
  const record = requireExactRecord(
    value,
    ['kind', 'recordId'],
    'Character portable package identity conflict',
  );
  return {
    kind: requireOneOf(
      record['kind'],
      [...CHARACTER_PORTABLE_RECORD_KINDS, 'localized-asset'] as const,
      'Character portable package conflict kind',
    ),
    recordId: requireIdentity(
      record['recordId'],
      'Character portable package conflict record identity',
    ),
  };
}

function identityList(value: unknown, label: string): readonly string[] {
  return requireUniqueIdentities(
    requireArray(value, (item) => requireIdentity(item, label), label),
    (identity) => identity,
    label,
  );
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
  return value;
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
    [
      'representationId',
      'kind',
      'resourceRef',
      'archivePath',
      'entry',
      'mediaType',
      'byteLength',
      'integrityDigest',
    ],
    'Character portable embedded asset entry',
  );
  const representation = parseCharacterRepresentationRef({
    representationId: record['representationId'],
    kind: record['kind'],
    resourceRef: record['resourceRef'],
  });
  const mediaType = requireString(record['mediaType'], 'Character portable asset media type');
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(mediaType)) {
    throw new Error('Character portable asset media type must be a valid MIME type.');
  }
  return {
    ...representation,
    archivePath: requireArchivePath(
      record['archivePath'],
      'Character portable asset archive path',
      'assets/',
    ),
    entry: requireBoolean(record['entry'], 'Character portable asset entry state'),
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

function validateEmbeddedAssetBindings(
  assets: readonly CharacterPortableEmbeddedAssetEntry[],
): void {
  const byRepresentation = new Map<string, CharacterPortableEmbeddedAssetEntry[]>();
  for (const asset of assets) {
    const entries = byRepresentation.get(asset.representationId) ?? [];
    entries.push(asset);
    byRepresentation.set(asset.representationId, entries);
  }
  for (const [representationId, entries] of byRepresentation) {
    const first = entries[0];
    if (first === undefined) {
      throw new Error(`Character portable embedded representation '${representationId}' is empty.`);
    }
    if (
      entries.some((entry) => entry.kind !== first.kind || entry.resourceRef !== first.resourceRef)
    ) {
      throw new Error(
        `Character portable embedded representation '${representationId}' has inconsistent binding facts.`,
      );
    }
    if (entries.filter((entry) => entry.entry).length !== 1) {
      throw new Error(
        `Character portable embedded representation '${representationId}' must declare one exact entry file.`,
      );
    }
  }
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
