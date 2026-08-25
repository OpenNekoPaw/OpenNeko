import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireOneOf,
  requireUniqueIdentities,
} from './codec';

export const CHARACTER_VERSION_REFERENCE_OWNER_KINDS = ['chara', 'agent', 'project'] as const;

export type CharacterVersionReferenceOwnerKind =
  (typeof CHARACTER_VERSION_REFERENCE_OWNER_KINDS)[number];

export const CHARACTER_VERSION_REFERENCE_KINDS = [
  'working-draft-basis',
  'lineage-child',
  'storyline-draft',
  'storyline-version',
  'character-run',
  'room-template-participant',
  'room-run-participant',
  'relationship-memory-candidate',
  'relationship-memory',
  'companion-memory-candidate',
  'companion-memory',
  'conversation',
  'project-dependency',
] as const;

export type CharacterVersionReferenceKind = (typeof CHARACTER_VERSION_REFERENCE_KINDS)[number];

export interface CharacterVersionReference {
  readonly ownerKind: CharacterVersionReferenceOwnerKind;
  readonly referenceKind: CharacterVersionReferenceKind;
  readonly referenceId: string;
  readonly characterVersionId: string;
}

export interface CharacterVersionReferenceDiagnostic {
  readonly ownerKind: CharacterVersionReferenceOwnerKind;
  readonly message: string;
}

export interface CharacterVersionReferenceInventory {
  readonly characterVersionId: string;
  readonly coverage: 'complete' | 'incomplete';
  readonly references: readonly CharacterVersionReference[];
  readonly diagnostics: readonly CharacterVersionReferenceDiagnostic[];
}

export function parseCharacterVersionReference(value: unknown): CharacterVersionReference {
  const record = requireExactRecord(
    value,
    ['ownerKind', 'referenceKind', 'referenceId', 'characterVersionId'],
    'CharacterVersion reference',
  );
  const ownerKind = requireOneOf(
    record['ownerKind'],
    CHARACTER_VERSION_REFERENCE_OWNER_KINDS,
    'CharacterVersion reference owner',
  );
  const referenceKind = requireOneOf(
    record['referenceKind'],
    CHARACTER_VERSION_REFERENCE_KINDS,
    'CharacterVersion reference kind',
  );
  requireOwnedReferenceKind(ownerKind, referenceKind);
  return {
    ownerKind,
    referenceKind,
    referenceId: requireIdentity(record['referenceId'], 'CharacterVersion reference identity'),
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterVersion reference CharacterVersion identity',
    ),
  };
}

function requireOwnedReferenceKind(
  ownerKind: CharacterVersionReferenceOwnerKind,
  referenceKind: CharacterVersionReferenceKind,
): void {
  const matchesOwner =
    ownerKind === 'agent'
      ? referenceKind === 'conversation'
      : ownerKind === 'project'
        ? referenceKind === 'project-dependency'
        : referenceKind !== 'conversation' && referenceKind !== 'project-dependency';
  if (!matchesOwner) {
    throw new Error(
      `CharacterVersion reference kind '${referenceKind}' is not owned by '${ownerKind}'.`,
    );
  }
}

export function parseCharacterVersionReferenceInventory(
  value: unknown,
): CharacterVersionReferenceInventory {
  const record = requireExactRecord(
    value,
    ['characterVersionId', 'coverage', 'references', 'diagnostics'],
    'CharacterVersion reference inventory',
  );
  const characterVersionId = requireIdentity(
    record['characterVersionId'],
    'CharacterVersion reference inventory identity',
  );
  const references = requireUniqueIdentities(
    requireArray(
      record['references'],
      parseCharacterVersionReference,
      'CharacterVersion references',
    ),
    characterVersionReferenceKey,
    'CharacterVersion references',
  );
  if (references.some((reference) => reference.characterVersionId !== characterVersionId)) {
    throw new Error(
      'CharacterVersion reference inventory contains a reference to another version.',
    );
  }
  const diagnostics = requireUniqueIdentities(
    requireArray(
      record['diagnostics'],
      parseCharacterVersionReferenceDiagnostic,
      'CharacterVersion reference diagnostics',
    ),
    (diagnostic) => diagnostic.ownerKind,
    'CharacterVersion reference diagnostics',
  );
  const coverage = requireOneOf(
    record['coverage'],
    ['complete', 'incomplete'] as const,
    'CharacterVersion reference inventory coverage',
  );
  if ((diagnostics.length === 0) !== (coverage === 'complete')) {
    throw new Error('CharacterVersion reference inventory coverage must match its diagnostics.');
  }
  return { characterVersionId, coverage, references, diagnostics };
}

export function characterVersionReferenceKey(reference: CharacterVersionReference): string {
  return `${reference.ownerKind}:${reference.referenceKind}:${reference.referenceId}`;
}

function parseCharacterVersionReferenceDiagnostic(
  value: unknown,
): CharacterVersionReferenceDiagnostic {
  const record = requireExactRecord(
    value,
    ['ownerKind', 'message'],
    'CharacterVersion reference diagnostic',
  );
  return {
    ownerKind: requireOneOf(
      record['ownerKind'],
      CHARACTER_VERSION_REFERENCE_OWNER_KINDS,
      'CharacterVersion reference diagnostic owner',
    ),
    message: requireIdentity(record['message'], 'CharacterVersion reference diagnostic message'),
  };
}
