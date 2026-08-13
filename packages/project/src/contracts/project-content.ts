import {
  isCreativeEntityKind,
  PROJECT_ENTITY_CANDIDATE_FRESHNESS_STATES,
  type CreativeEntityKind,
  type ProjectEntityCandidateFreshness,
} from '@neko/entity-domain';

export type ProjectContentAvailability = 'available' | 'needs-attention';

export interface ProjectContentCharacterItem {
  readonly owner: 'character';
  readonly characterProjectId: string;
  readonly entityId?: string;
  readonly label?: string;
  readonly availability: ProjectContentAvailability;
  readonly diagnostic?: string;
}

export interface ProjectContentWorldItem {
  readonly owner: 'world';
  readonly worldProjectId: string;
  readonly label?: string;
  readonly availability: ProjectContentAvailability;
  readonly diagnostic?: string;
}

export interface ProjectContentElementItem {
  readonly owner: 'project-entity';
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
  readonly label: string;
  readonly availability: ProjectContentAvailability | 'deprecated';
  readonly diagnostic?: string;
}

export interface ProjectContentCandidateItem {
  readonly owner: 'entity-candidate';
  readonly candidateId: string;
  readonly entityKind: CreativeEntityKind;
  readonly label: string;
  readonly freshness: ProjectEntityCandidateFreshness;
}

export type ProjectContentGroup = 'characters' | 'worlds' | 'elements' | 'candidates';

export interface ProjectContentDiagnostic {
  readonly owner: 'project' | 'character' | 'world' | 'project-entity';
  readonly group: ProjectContentGroup;
  readonly recordId?: string;
  readonly message: string;
}

export interface ProjectContentProjection {
  readonly contentProjectId: string;
  readonly characters: readonly ProjectContentCharacterItem[];
  readonly worlds: readonly ProjectContentWorldItem[];
  readonly elements: readonly ProjectContentElementItem[];
  readonly candidates: readonly ProjectContentCandidateItem[];
  readonly diagnostics: readonly ProjectContentDiagnostic[];
}

export function parseProjectContentProjection(value: unknown): ProjectContentProjection {
  const record = requireExactRecord(
    value,
    ['contentProjectId', 'characters', 'worlds', 'elements', 'candidates', 'diagnostics'],
    'Project Content projection',
  );
  const projection = {
    contentProjectId: requireIdentity(record['contentProjectId'], 'Content Project identity'),
    characters: requireArray(
      record['characters'],
      parseCharacterItem,
      'Project Content characters',
    ),
    worlds: requireArray(record['worlds'], parseWorldItem, 'Project Content worlds'),
    elements: requireArray(record['elements'], parseElementItem, 'Project Content elements'),
    candidates: requireArray(
      record['candidates'],
      parseCandidateItem,
      'Project Content candidates',
    ),
    diagnostics: requireArray(
      record['diagnostics'],
      parseDiagnostic,
      'Project Content diagnostics',
    ),
  } satisfies ProjectContentProjection;
  requireUnique(
    projection.characters,
    (item) => item.characterProjectId,
    'Project Content CharacterProject identities',
  );
  requireUnique(
    projection.characters.filter(
      (item): item is ProjectContentCharacterItem & { readonly entityId: string } =>
        item.entityId !== undefined,
    ),
    (item) => item.entityId,
    'Project Content Character Entity identities',
  );
  requireUnique(
    projection.worlds,
    (item) => item.worldProjectId,
    'Project Content WorldProject identities',
  );
  requireUnique(projection.elements, (item) => item.entityId, 'Project Content Element identities');
  requireUnique(
    projection.candidates,
    (item) => item.candidateId,
    'Project Content candidate identities',
  );
  const characterEntityIds = new Set(
    projection.characters.flatMap((item) => (item.entityId === undefined ? [] : [item.entityId])),
  );
  if (projection.elements.some((item) => characterEntityIds.has(item.entityId))) {
    throw new Error('Project Content groups must not duplicate associated Character Entities.');
  }
  return projection;
}

function parseCharacterItem(value: unknown): ProjectContentCharacterItem {
  const record = requireExactRecord(
    value,
    ['owner', 'characterProjectId', 'entityId', 'label', 'availability', 'diagnostic'],
    'Project Content Character item',
    ['entityId', 'label', 'diagnostic'],
  );
  if (record['owner'] !== 'character') {
    throw new Error('Project Content Character owner is invalid.');
  }
  const item: ProjectContentCharacterItem = {
    owner: 'character',
    characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject identity'),
    ...optionalIdentity(record, 'entityId', 'Project Entity identity'),
    ...optionalIdentity(record, 'label', 'Project Content Character label'),
    availability: parseAvailability(record['availability']),
    ...optionalIdentity(record, 'diagnostic', 'Project Content Character diagnostic'),
  };
  requireAvailabilityConsistency(item, 'Character');
  return item;
}

function parseWorldItem(value: unknown): ProjectContentWorldItem {
  const record = requireExactRecord(
    value,
    ['owner', 'worldProjectId', 'label', 'availability', 'diagnostic'],
    'Project Content World item',
    ['label', 'diagnostic'],
  );
  if (record['owner'] !== 'world') throw new Error('Project Content World owner is invalid.');
  const item: ProjectContentWorldItem = {
    owner: 'world',
    worldProjectId: requireIdentity(record['worldProjectId'], 'WorldProject identity'),
    ...optionalIdentity(record, 'label', 'Project Content World label'),
    availability: parseAvailability(record['availability']),
    ...optionalIdentity(record, 'diagnostic', 'Project Content World diagnostic'),
  };
  requireAvailabilityConsistency(item, 'World');
  return item;
}

function parseElementItem(value: unknown): ProjectContentElementItem {
  const record = requireExactRecord(
    value,
    ['owner', 'entityId', 'entityKind', 'label', 'availability', 'diagnostic'],
    'Project Content Element item',
    ['diagnostic'],
  );
  if (record['owner'] !== 'project-entity') {
    throw new Error('Project Content Element owner is invalid.');
  }
  if (!isCreativeEntityKind(record['entityKind'])) {
    throw new Error('Project Content Element kind is invalid.');
  }
  const availability = record['availability'];
  if (
    availability !== 'available' &&
    availability !== 'needs-attention' &&
    availability !== 'deprecated'
  ) {
    throw new Error('Project Content Element availability is invalid.');
  }
  const item: ProjectContentElementItem = {
    owner: 'project-entity',
    entityId: requireIdentity(record['entityId'], 'Project Entity identity'),
    entityKind: record['entityKind'],
    label: requireIdentity(record['label'], 'Project Content Element label'),
    availability,
    ...optionalIdentity(record, 'diagnostic', 'Project Content Element diagnostic'),
  };
  if (item.availability === 'needs-attention' && item.diagnostic === undefined) {
    throw new Error('Project Content unavailable Element requires a diagnostic.');
  }
  if (item.availability !== 'needs-attention' && item.diagnostic !== undefined) {
    throw new Error('Project Content usable Element cannot carry a diagnostic.');
  }
  return item;
}

function parseCandidateItem(value: unknown): ProjectContentCandidateItem {
  const record = requireExactRecord(
    value,
    ['owner', 'candidateId', 'entityKind', 'label', 'freshness'],
    'Project Content Candidate item',
  );
  if (record['owner'] !== 'entity-candidate') {
    throw new Error('Project Content Candidate owner is invalid.');
  }
  if (!isCreativeEntityKind(record['entityKind'])) {
    throw new Error('Project Content Candidate kind is invalid.');
  }
  if (
    !PROJECT_ENTITY_CANDIDATE_FRESHNESS_STATES.some(
      (freshness) => freshness === record['freshness'],
    )
  ) {
    throw new Error('Project Content Candidate freshness is invalid.');
  }
  return {
    owner: 'entity-candidate',
    candidateId: requireIdentity(record['candidateId'], 'Entity candidate identity'),
    entityKind: record['entityKind'],
    label: requireIdentity(record['label'], 'Project Content Candidate label'),
    freshness: record['freshness'] as ProjectEntityCandidateFreshness,
  };
}

function parseDiagnostic(value: unknown): ProjectContentDiagnostic {
  const record = requireExactRecord(
    value,
    ['owner', 'group', 'recordId', 'message'],
    'Project Content diagnostic',
    ['recordId'],
  );
  const owner = record['owner'];
  if (
    owner !== 'project' &&
    owner !== 'character' &&
    owner !== 'world' &&
    owner !== 'project-entity'
  ) {
    throw new Error('Project Content diagnostic owner is invalid.');
  }
  const group = record['group'];
  if (
    group !== 'characters' &&
    group !== 'worlds' &&
    group !== 'elements' &&
    group !== 'candidates'
  ) {
    throw new Error('Project Content diagnostic group is invalid.');
  }
  return {
    owner,
    group,
    ...optionalIdentity(record, 'recordId', 'Project Content diagnostic record identity'),
    message: requireIdentity(record['message'], 'Project Content diagnostic message'),
  };
}

function parseAvailability(value: unknown): ProjectContentAvailability {
  if (value !== 'available' && value !== 'needs-attention') {
    throw new Error('Project Content item availability is invalid.');
  }
  return value;
}

function requireAvailabilityConsistency(
  item: {
    readonly availability: ProjectContentAvailability;
    readonly label?: string;
    readonly diagnostic?: string;
  },
  label: string,
): void {
  if (
    item.availability === 'available' &&
    (item.label === undefined || item.diagnostic !== undefined)
  ) {
    throw new Error(`Project Content available ${label} is incomplete.`);
  }
  if (item.availability === 'needs-attention' && item.diagnostic === undefined) {
    throw new Error(`Project Content unavailable ${label} requires a diagnostic.`);
  }
}

function requireExactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
  optionalKeys: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value as Readonly<Record<string, unknown>>;
  const present = Object.keys(record);
  if (present.some((key) => !keys.includes(key)))
    throw new Error(`${label} has unsupported fields.`);
  for (const key of keys) {
    if (!optionalKeys.includes(key) && !(key in record)) {
      throw new Error(`${label} is missing '${key}'.`);
    }
  }
  return record;
}

function requireArray<T>(value: unknown, parse: (item: unknown) => T, label: string): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map(parse);
}

function optionalIdentity(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): Readonly<Record<string, string>> {
  return record[key] === undefined ? {} : { [key]: requireIdentity(record[key], label) };
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireUnique<T>(
  values: readonly T[],
  identity: (value: T) => string,
  label: string,
): void {
  const identities = values.map(identity);
  if (new Set(identities).size !== identities.length) {
    throw new Error(`${label} must be unique.`);
  }
}
