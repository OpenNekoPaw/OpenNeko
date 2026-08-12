import {
  contentLocatorKey,
  validateContentLocator,
  type ContentLocator,
  type PackageResourceContentLocator,
} from '@neko/content';
import { CHARACTER_REPRESENTATION_KINDS, type CharacterRepresentationKind } from './character';
import {
  optionalString,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireOneOf,
  requireUniqueIdentities,
} from './codec';

export interface CharacterContentEvidenceSource {
  readonly kind: 'content';
  readonly evidenceId: string;
  readonly sourceWorkspaceId: string;
  readonly sourceWorkspaceGrantId: string;
  readonly locator: ContentLocator;
  readonly excerpt?: string;
  readonly observedAt: string;
}

export interface CharacterProjectEntityEvidenceSource {
  readonly kind: 'project-entity';
  readonly evidenceId: string;
  readonly sourceWorkspaceId: string;
  readonly sourceWorkspaceGrantId: string;
  readonly contentProjectId: string;
  readonly entityId: string;
  readonly excerpt?: string;
  readonly observedAt: string;
}

export type CharacterCreationEvidenceSource =
  CharacterContentEvidenceSource | CharacterProjectEntityEvidenceSource;

export interface CharacterAssetRepresentationSource {
  readonly assetId: string;
  readonly resource: PackageResourceContentLocator;
  readonly representationId: string;
  readonly representationKind: CharacterRepresentationKind;
}

export interface CharacterCreationSourceSelection {
  readonly evidence: readonly CharacterCreationEvidenceSource[];
  readonly assetRepresentations: readonly CharacterAssetRepresentationSource[];
}

export function parseCharacterCreationSourceSelection(
  value: unknown,
): CharacterCreationSourceSelection {
  const record = requireExactRecord(
    value,
    ['evidence', 'assetRepresentations'],
    'Character creation source selection',
  );
  return {
    evidence: requireUniqueIdentities(
      requireArray(
        record['evidence'],
        parseCharacterCreationEvidenceSource,
        'Character creation evidence sources',
      ),
      (source) => source.evidenceId,
      'Character creation evidence sources',
    ),
    assetRepresentations: requireUniqueIdentities(
      requireArray(
        record['assetRepresentations'],
        parseCharacterAssetRepresentationSource,
        'Character creation Asset representations',
      ),
      (source) => source.representationId,
      'Character creation Asset representations',
    ),
  };
}

export function createCharacterContentEvidenceSourceRef(
  source: Pick<CharacterContentEvidenceSource, 'sourceWorkspaceId' | 'locator'>,
): string {
  return ownerQualifiedRef('content', [
    source.sourceWorkspaceId,
    contentLocatorKey(source.locator),
  ]);
}

export function createCharacterProjectEntityEvidenceSourceRef(
  source: Pick<CharacterProjectEntityEvidenceSource, 'contentProjectId' | 'entityId'>,
): string {
  return ownerQualifiedRef('project-entity', [source.contentProjectId, source.entityId]);
}

export function createCharacterAssetRepresentationResourceRef(
  source: Pick<CharacterAssetRepresentationSource, 'assetId' | 'resource'>,
): string {
  return ownerQualifiedRef('asset', [source.assetId, contentLocatorKey(source.resource)]);
}

function parseCharacterCreationEvidenceSource(value: unknown): CharacterCreationEvidenceSource {
  const kind = readKind(value, 'Character creation evidence source');
  if (kind === 'content') {
    const record = requireExactRecord(
      value,
      [
        'kind',
        'evidenceId',
        'sourceWorkspaceId',
        'sourceWorkspaceGrantId',
        'locator',
        'excerpt',
        'observedAt',
      ],
      'Character Content evidence source',
    );
    const locator = validateContentLocator(record['locator']);
    if (!locator.ok) {
      throw new Error(
        `Character Content evidence source locator is invalid: ${locator.diagnostics.map((diagnostic) => diagnostic.message).join(' ')}`,
      );
    }
    return withOptionalExcerpt(
      {
        kind,
        evidenceId: requireIdentity(record['evidenceId'], 'Character evidence'),
        sourceWorkspaceId: requireIdentity(
          record['sourceWorkspaceId'],
          'Character evidence source Workspace',
        ),
        sourceWorkspaceGrantId: requireIdentity(
          record['sourceWorkspaceGrantId'],
          'Character evidence source Workspace grant',
        ),
        locator: locator.locator,
        observedAt: requireIsoDate(record['observedAt'], 'Character evidence observedAt'),
      },
      optionalString(record['excerpt'], 'Character evidence excerpt'),
    );
  }
  if (kind === 'project-entity') {
    const record = requireExactRecord(
      value,
      [
        'kind',
        'evidenceId',
        'sourceWorkspaceId',
        'sourceWorkspaceGrantId',
        'contentProjectId',
        'entityId',
        'excerpt',
        'observedAt',
      ],
      'Character Project Entity evidence source',
    );
    return withOptionalExcerpt(
      {
        kind,
        evidenceId: requireIdentity(record['evidenceId'], 'Character evidence'),
        sourceWorkspaceId: requireIdentity(
          record['sourceWorkspaceId'],
          'Character evidence source Workspace',
        ),
        sourceWorkspaceGrantId: requireIdentity(
          record['sourceWorkspaceGrantId'],
          'Character evidence source Workspace grant',
        ),
        contentProjectId: requireIdentity(
          record['contentProjectId'],
          'Character evidence Content Project',
        ),
        entityId: requireIdentity(record['entityId'], 'Character evidence Project Entity'),
        observedAt: requireIsoDate(record['observedAt'], 'Character evidence observedAt'),
      },
      optionalString(record['excerpt'], 'Character evidence excerpt'),
    );
  }
  throw new Error(`Unknown Character creation evidence source '${kind}'.`);
}

function parseCharacterAssetRepresentationSource(
  value: unknown,
): CharacterAssetRepresentationSource {
  const record = requireExactRecord(
    value,
    ['assetId', 'resource', 'representationId', 'representationKind'],
    'Character Asset representation source',
  );
  const assetId = requireIdentity(record['assetId'], 'Character representation Asset');
  const resource = validateContentLocator(record['resource']);
  if (!resource.ok || resource.locator.kind !== 'package-resource') {
    throw new Error('Character Asset representation requires an exact package-resource locator.');
  }
  if (resource.locator.packageId !== assetId) {
    throw new Error('Character Asset representation package identity mismatch.');
  }
  return {
    assetId,
    resource: resource.locator,
    representationId: requireIdentity(record['representationId'], 'Character representation'),
    representationKind: requireOneOf(
      record['representationKind'],
      CHARACTER_REPRESENTATION_KINDS,
      'Character representation kind',
    ),
  };
}

function readKind(value: unknown, label: string): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return requireIdentity((value as Readonly<Record<string, unknown>>)['kind'], `${label} kind`);
}

function withOptionalExcerpt<T extends object>(
  value: T,
  excerpt: string | undefined,
): T & {
  readonly excerpt?: string;
} {
  return excerpt === undefined ? value : { ...value, excerpt };
}

function ownerQualifiedRef(owner: string, identities: readonly string[]): string {
  return `${owner}:${identities.map((identity) => encodeURIComponent(requireIdentity(identity, owner))).join('/')}`;
}
