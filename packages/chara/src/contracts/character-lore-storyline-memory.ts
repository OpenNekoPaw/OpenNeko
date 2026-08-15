import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireUniqueIdentities,
} from './codec';

export interface CharacterLoreEntry {
  readonly loreEntryId: string;
  readonly statement: string;
  readonly evidenceIds: readonly string[];
}

export interface CharacterBackgroundStory {
  readonly overview: string;
  readonly origins: readonly CharacterLoreEntry[];
  readonly personalHistory: readonly CharacterLoreEntry[];
  readonly formativeEvents: readonly CharacterLoreEntry[];
  readonly establishedRelationships: readonly CharacterLoreEntry[];
}

export interface CharacterOriginSetting {
  readonly overview: string;
  readonly eras: readonly CharacterLoreEntry[];
  readonly cultures: readonly CharacterLoreEntry[];
  readonly socialEnvironment: readonly CharacterLoreEntry[];
  readonly importantPlaces: readonly CharacterLoreEntry[];
  readonly organizations: readonly CharacterLoreEntry[];
  readonly believedRules: readonly CharacterLoreEntry[];
}

export interface CharacterVersionRef {
  readonly characterVersionId: string;
}

export interface CharacterRunRef extends CharacterVersionRef {
  readonly characterRunId: string;
}

export function createEmptyCharacterBackgroundStory(): CharacterBackgroundStory {
  return {
    overview: '',
    origins: [],
    personalHistory: [],
    formativeEvents: [],
    establishedRelationships: [],
  };
}

export function createEmptyCharacterOriginSetting(): CharacterOriginSetting {
  return {
    overview: '',
    eras: [],
    cultures: [],
    socialEnvironment: [],
    importantPlaces: [],
    organizations: [],
    believedRules: [],
  };
}

export function parseCharacterBackgroundStory(value: unknown): CharacterBackgroundStory {
  const record = requireExactRecord(
    value,
    ['overview', 'origins', 'personalHistory', 'formativeEvents', 'establishedRelationships'],
    'Character background story',
  );
  const backgroundStory = {
    overview: requireText(record['overview'], 'Character background story overview'),
    origins: parseLoreEntries(record['origins'], 'Character background story origins'),
    personalHistory: parseLoreEntries(
      record['personalHistory'],
      'Character background story personal history',
    ),
    formativeEvents: parseLoreEntries(
      record['formativeEvents'],
      'Character background story formative events',
    ),
    establishedRelationships: parseLoreEntries(
      record['establishedRelationships'],
      'Character background story established relationships',
    ),
  };
  assertUniqueLoreEntries(
    [
      ...backgroundStory.origins,
      ...backgroundStory.personalHistory,
      ...backgroundStory.formativeEvents,
      ...backgroundStory.establishedRelationships,
    ],
    'Character background story',
  );
  return backgroundStory;
}

export function parseCharacterOriginSetting(value: unknown): CharacterOriginSetting {
  const record = requireExactRecord(
    value,
    [
      'overview',
      'eras',
      'cultures',
      'socialEnvironment',
      'importantPlaces',
      'organizations',
      'believedRules',
    ],
    'Character origin setting',
  );
  const originSetting = {
    overview: requireText(record['overview'], 'Character origin setting overview'),
    eras: parseLoreEntries(record['eras'], 'Character origin setting eras'),
    cultures: parseLoreEntries(record['cultures'], 'Character origin setting cultures'),
    socialEnvironment: parseLoreEntries(
      record['socialEnvironment'],
      'Character origin setting social environment',
    ),
    importantPlaces: parseLoreEntries(
      record['importantPlaces'],
      'Character origin setting important places',
    ),
    organizations: parseLoreEntries(
      record['organizations'],
      'Character origin setting organizations',
    ),
    believedRules: parseLoreEntries(
      record['believedRules'],
      'Character origin setting believed rules',
    ),
  };
  assertUniqueLoreEntries(
    [
      ...originSetting.eras,
      ...originSetting.cultures,
      ...originSetting.socialEnvironment,
      ...originSetting.importantPlaces,
      ...originSetting.organizations,
      ...originSetting.believedRules,
    ],
    'Character origin setting',
  );
  return originSetting;
}

export function collectCharacterLoreEvidenceIds(input: {
  readonly backgroundStory: CharacterBackgroundStory;
  readonly originSetting: CharacterOriginSetting;
}): readonly string[] {
  return [
    ...input.backgroundStory.origins,
    ...input.backgroundStory.personalHistory,
    ...input.backgroundStory.formativeEvents,
    ...input.backgroundStory.establishedRelationships,
    ...input.originSetting.eras,
    ...input.originSetting.cultures,
    ...input.originSetting.socialEnvironment,
    ...input.originSetting.importantPlaces,
    ...input.originSetting.organizations,
    ...input.originSetting.believedRules,
  ].flatMap((entry) => entry.evidenceIds);
}

export function parseCharacterVersionRef(value: unknown): CharacterVersionRef {
  const record = requireExactRecord(value, ['characterVersionId'], 'CharacterVersionRef');
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterVersionRef identity',
    ),
  };
}

export function parseCharacterRunRef(value: unknown): CharacterRunRef {
  const record = requireExactRecord(
    value,
    ['characterVersionId', 'characterRunId'],
    'CharacterRunRef',
  );
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterRunRef CharacterVersion identity',
    ),
    characterRunId: requireIdentity(record['characterRunId'], 'CharacterRunRef identity'),
  };
}

function parseLoreEntries(value: unknown, label: string): readonly CharacterLoreEntry[] {
  return requireUniqueIdentities(
    requireArray(value, parseLoreEntry, label),
    (entry) => entry.loreEntryId,
    label,
  );
}

function parseLoreEntry(value: unknown): CharacterLoreEntry {
  const record = requireExactRecord(
    value,
    ['loreEntryId', 'statement', 'evidenceIds'],
    'Character lore entry',
  );
  return {
    loreEntryId: requireIdentity(record['loreEntryId'], 'Character lore entry identity'),
    statement: requireIdentity(record['statement'], 'Character lore entry statement'),
    evidenceIds: requireUniqueIdentities(
      requireArray(
        record['evidenceIds'],
        (item) => requireIdentity(item, 'Character lore evidence identity'),
        'Character lore evidence',
      ),
      (item) => item,
      'Character lore evidence',
    ),
  };
}

function assertUniqueLoreEntries(entries: readonly CharacterLoreEntry[], label: string): void {
  requireUniqueIdentities(entries, (entry) => entry.loreEntryId, `${label} entries`);
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}
