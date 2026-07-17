import type { CreativeEntityRef } from '@neko/shared';

export type ShotCharacterReferenceState =
  'confirmed' | 'candidate' | 'ambiguous' | 'orphaned' | 'unlinked';

export interface ShotCharacterEntityReferenceProjection {
  readonly state: ShotCharacterReferenceState;
  readonly label: string;
  readonly title: string;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
}

export type ShotCharacterEntityReferenceTranslate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export function projectShotCharacterEntityReference(
  item: unknown,
  translate: ShotCharacterEntityReferenceTranslate = defaultTranslate,
): ShotCharacterEntityReferenceProjection {
  const record = isRecord(item) ? item : {};
  const entityRef = isCreativeEntityRef(record['entityRef']) ? record['entityRef'] : undefined;
  const candidateId = readNonEmptyString(record['candidateId']);
  const displayName =
    readNonEmptyString(record['characterName']) ??
    readNonEmptyString(record['name']) ??
    readNonEmptyString(record['displayName']) ??
    'Character';
  const ambiguous = hasAmbiguousDiagnostic(record);
  const orphaned = hasOrphanedRepresentation(record);

  if (entityRef) {
    return {
      state: orphaned ? 'orphaned' : 'confirmed',
      label: translate(orphaned ? 'entity.reference.broken' : 'entity.reference.confirmed'),
      title: orphaned
        ? translate('entity.reference.title.orphaned', {
            name: displayName,
            entityId: entityRef.entityId,
          })
        : translate('entity.reference.title.confirmed', {
            name: displayName,
            entityId: entityRef.entityId,
          }),
      entityRef,
    };
  }

  if (candidateId) {
    return {
      state: ambiguous ? 'ambiguous' : 'candidate',
      label: translate(ambiguous ? 'entity.reference.ambiguous' : 'entity.reference.candidate'),
      title: ambiguous
        ? translate('entity.reference.title.ambiguous', { name: displayName })
        : translate('entity.reference.title.candidate', {
            name: displayName,
            candidateId,
          }),
      candidateId,
    };
  }

  return {
    state: ambiguous ? 'ambiguous' : 'unlinked',
    label: translate(ambiguous ? 'entity.reference.ambiguous' : 'entity.reference.unlinked'),
    title: ambiguous
      ? translate('entity.reference.title.ambiguous', { name: displayName })
      : translate('entity.reference.title.unlinked', { name: displayName }),
  };
}

function defaultTranslate(key: string, params?: Record<string, string | number>): string {
  switch (key) {
    case 'entity.reference.confirmed':
      return 'Confirmed';
    case 'entity.reference.candidate':
      return 'Candidate';
    case 'entity.reference.ambiguous':
      return 'Ambiguous';
    case 'entity.reference.broken':
      return 'Broken';
    case 'entity.reference.unlinked':
      return 'Unlinked';
    case 'entity.reference.title.confirmed':
      return `${params?.['name'] ?? 'Character'} is linked to ${params?.['entityId'] ?? ''}.`;
    case 'entity.reference.title.orphaned':
      return `${params?.['name'] ?? 'Character'} is linked to ${params?.['entityId'] ?? ''}, but the default representation is unavailable.`;
    case 'entity.reference.title.candidate':
      return `${params?.['name'] ?? 'Character'} is linked to candidate ${params?.['candidateId'] ?? ''}.`;
    case 'entity.reference.title.ambiguous':
      return `${params?.['name'] ?? 'Character'} needs manual entity resolution.`;
    case 'entity.reference.title.unlinked':
      return `${params?.['name'] ?? 'Character'} has no entity reference yet.`;
    default:
      return key;
  }
}

function hasOrphanedRepresentation(record: Record<string, unknown>): boolean {
  if (record['defaultRepresentationAvailability'] === 'orphaned') return true;
  if (record['bindingAvailability'] === 'orphaned') return true;
  const representation = record['defaultRepresentation'];
  return isRecord(representation) && representation['availability'] === 'orphaned';
}

function hasAmbiguousDiagnostic(record: Record<string, unknown>): boolean {
  const diagnostics = record['diagnostics'];
  if (!Array.isArray(diagnostics)) return false;
  return diagnostics.some((diagnostic) => {
    if (!isRecord(diagnostic)) return false;
    const code = readNonEmptyString(diagnostic['code']);
    const reason = readNonEmptyString(
      isRecord(diagnostic['details']) ? diagnostic['details']['reason'] : undefined,
    );
    return code?.includes('ambiguous') || reason?.includes('ambiguous');
  });
}

function isCreativeEntityRef(value: unknown): value is CreativeEntityRef {
  return (
    isRecord(value) &&
    readNonEmptyString(value['entityId']) !== undefined &&
    readNonEmptyString(value['entityKind']) !== undefined
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
