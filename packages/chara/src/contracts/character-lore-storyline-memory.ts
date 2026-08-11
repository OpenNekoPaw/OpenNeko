import {
  optionalIdentity,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireNonNegativeInteger,
  requireOneOf,
  requireString,
  requireUniqueIdentities,
} from './codec';

export const CHARACTER_STORYLINE_CANDIDATE_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export const CHARACTER_MEMORY_CANDIDATE_LIFECYCLE_STATUSES = [
  'pending',
  'accepted',
  'rejected',
] as const;
export const CHARACTER_MEMORY_ENTRY_STATUSES = ['active', 'corrected', 'deleted'] as const;

export type CharacterStorylineCandidateStatus =
  (typeof CHARACTER_STORYLINE_CANDIDATE_STATUSES)[number];
export type CharacterMemoryCandidateLifecycleStatus =
  (typeof CHARACTER_MEMORY_CANDIDATE_LIFECYCLE_STATUSES)[number];
export type CharacterMemoryEntryStatus = (typeof CHARACTER_MEMORY_ENTRY_STATUSES)[number];

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

export interface CharacterStorylineStage {
  readonly stageId: string;
  readonly title: string;
  readonly description: string;
}

export interface CharacterStorylineTurningPoint {
  readonly turningPointId: string;
  readonly fromStageId: string;
  readonly toStageId: string;
  readonly description: string;
  readonly evidenceIds: readonly string[];
}

export interface CharacterStorylineVersion {
  readonly characterStorylineVersionId: string;
  readonly characterVersionId: string;
  readonly label: string;
  readonly premise: string;
  readonly desire: string;
  readonly conflict: string;
  readonly growthArc: string;
  readonly stages: readonly CharacterStorylineStage[];
  readonly turningPoints: readonly CharacterStorylineTurningPoint[];
  readonly constraints: readonly string[];
  readonly acceptedEvidenceIds: readonly string[];
  readonly publishedAt: string;
}

export interface CharacterStorylineTransition {
  readonly transitionId: string;
  readonly observationCandidateId: string;
  readonly fromStageId: string;
  readonly toStageId: string;
  readonly sourceRef: string;
  readonly acceptedAt: string;
  readonly resultingStorylineRevision: number;
}

export interface CharacterStorylineRun {
  readonly characterStorylineRunId: string;
  readonly characterStorylineVersionId: string;
  readonly characterRunId: string;
  readonly currentStageId: string;
  readonly acceptedTransitions: readonly CharacterStorylineTransition[];
  readonly storylineRevision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CharacterStorylineObservationCandidate {
  readonly observationCandidateId: string;
  readonly characterStorylineRunId: string;
  readonly sourceRef: string;
  readonly observedAt: string;
  readonly fromStageId: string;
  readonly toStageId: string;
  readonly turningPointId?: string;
  readonly expectedStorylineRevision: number;
  readonly status: CharacterStorylineCandidateStatus;
  readonly reviewedAt?: string;
  readonly acceptedTransitionId?: string;
}

export interface CharacterMemoryCandidate {
  readonly characterMemoryCandidateId: string;
  readonly characterMemoryScopeId: string;
  readonly content: string;
  readonly sourceRef: string;
  readonly observerParticipantId?: string;
  readonly observedAt: string;
  readonly sensitivityTraits: readonly string[];
  readonly retentionTraits: readonly string[];
  readonly expectedMemoryRevision: number;
  readonly status: CharacterMemoryCandidateLifecycleStatus;
  readonly reviewedAt?: string;
  readonly acceptedMemoryEntryId?: string;
}

export interface CharacterMemoryEntry {
  readonly characterMemoryEntryId: string;
  readonly characterMemoryScopeId: string;
  readonly sourceCandidateId: string;
  readonly content: string;
  readonly sourceRef: string;
  readonly observerParticipantId?: string;
  readonly observedAt: string;
  readonly sensitivityTraits: readonly string[];
  readonly retentionTraits: readonly string[];
  readonly status: CharacterMemoryEntryStatus;
  readonly acceptedAt: string;
  readonly correctedFromMemoryEntryId?: string;
  readonly correctedByMemoryEntryId?: string;
  readonly correctedAt?: string;
  readonly deletedAt?: string;
}

export interface CharacterMemoryScope {
  readonly characterMemoryScopeId: string;
  readonly characterRunId: string;
  readonly characterStorylineRunId?: string;
  readonly memoryRevision: number;
  readonly candidates: readonly CharacterMemoryCandidate[];
  readonly entries: readonly CharacterMemoryEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CharacterVersionRef {
  readonly characterVersionId: string;
}

export interface CharacterStorylineVersionRef extends CharacterVersionRef {
  readonly characterStorylineVersionId: string;
}

export interface CharacterRunRef extends CharacterVersionRef {
  readonly characterRunId: string;
}

export interface CharacterStorylineRunRef extends CharacterRunRef {
  readonly characterStorylineVersionId: string;
  readonly characterStorylineRunId: string;
}

export interface CharacterMemoryScopeRef extends CharacterRunRef {
  readonly characterMemoryScopeId: string;
}

export function parseCharacterBackgroundStory(value: unknown): CharacterBackgroundStory {
  const record = requireExactRecord(
    value,
    ['overview', 'origins', 'personalHistory', 'formativeEvents', 'establishedRelationships'],
    'Character background story',
  );
  const backgroundStory = {
    overview: requireString(record['overview'], 'Character background story overview'),
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
    overview: requireString(record['overview'], 'Character origin setting overview'),
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

export function parseCharacterStorylineVersion(value: unknown): CharacterStorylineVersion {
  const record = requireExactRecord(
    value,
    [
      'characterStorylineVersionId',
      'characterVersionId',
      'label',
      'premise',
      'desire',
      'conflict',
      'growthArc',
      'stages',
      'turningPoints',
      'constraints',
      'acceptedEvidenceIds',
      'publishedAt',
    ],
    'CharacterStorylineVersion',
  );
  const stages = requireUniqueIdentities(
    requireArray(record['stages'], parseStorylineStage, 'Character storyline stages'),
    (stage) => stage.stageId,
    'Character storyline stages',
  );
  if (stages.length === 0)
    throw new Error('CharacterStorylineVersion requires at least one stage.');
  const stageIds = new Set(stages.map((stage) => stage.stageId));
  const acceptedEvidenceIds = requireUniqueStringArray(
    record['acceptedEvidenceIds'],
    'Character storyline accepted evidence',
  );
  const evidenceIds = new Set(acceptedEvidenceIds);
  const turningPoints = requireUniqueIdentities(
    requireArray(
      record['turningPoints'],
      parseStorylineTurningPoint,
      'Character storyline turning points',
    ),
    (turningPoint) => turningPoint.turningPointId,
    'Character storyline turning points',
  );
  for (const turningPoint of turningPoints) {
    if (!stageIds.has(turningPoint.fromStageId) || !stageIds.has(turningPoint.toStageId)) {
      throw new Error(
        `Character storyline turning point '${turningPoint.turningPointId}' references an unknown stage.`,
      );
    }
    if (turningPoint.evidenceIds.some((evidenceId) => !evidenceIds.has(evidenceId))) {
      throw new Error(
        `Character storyline turning point '${turningPoint.turningPointId}' references unaccepted evidence.`,
      );
    }
  }
  return {
    characterStorylineVersionId: requireIdentity(
      record['characterStorylineVersionId'],
      'CharacterStorylineVersion identity',
    ),
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterStorylineVersion CharacterVersion identity',
    ),
    label: requireIdentity(record['label'], 'CharacterStorylineVersion label'),
    premise: requireString(record['premise'], 'Character storyline premise'),
    desire: requireString(record['desire'], 'Character storyline desire'),
    conflict: requireString(record['conflict'], 'Character storyline conflict'),
    growthArc: requireString(record['growthArc'], 'Character storyline growth arc'),
    stages,
    turningPoints,
    constraints: requireUniqueStringArray(record['constraints'], 'Character storyline constraints'),
    acceptedEvidenceIds,
    publishedAt: requireIsoDate(record['publishedAt'], 'CharacterStorylineVersion publishedAt'),
  };
}

export function parseCharacterStorylineRun(value: unknown): CharacterStorylineRun {
  const record = requireExactRecord(
    value,
    [
      'characterStorylineRunId',
      'characterStorylineVersionId',
      'characterRunId',
      'currentStageId',
      'acceptedTransitions',
      'storylineRevision',
      'createdAt',
      'updatedAt',
    ],
    'CharacterStorylineRun',
  );
  const acceptedTransitions = requireUniqueIdentities(
    requireArray(
      record['acceptedTransitions'],
      parseStorylineTransition,
      'Character storyline transitions',
    ),
    (transition) => transition.transitionId,
    'Character storyline transitions',
  );
  requireUniqueIdentities(
    acceptedTransitions,
    (transition) => transition.observationCandidateId,
    'Character storyline transition observations',
  );
  let lastAcceptedCasValue = 0;
  for (const transition of acceptedTransitions) {
    if (transition.resultingStorylineRevision <= lastAcceptedCasValue) {
      throw new Error('Character storyline transitions must have increasing revisions.');
    }
    lastAcceptedCasValue = transition.resultingStorylineRevision;
  }
  const storylineRevision = requireNonNegativeInteger(
    record['storylineRevision'],
    'CharacterStorylineRun revision',
  );
  if (lastAcceptedCasValue > storylineRevision) {
    throw new Error('Character storyline transition revision exceeds its owning Run revision.');
  }
  const currentStageId = requireIdentity(
    record['currentStageId'],
    'CharacterStorylineRun current stage',
  );
  const lastTransition = acceptedTransitions.at(-1);
  if (lastTransition !== undefined && lastTransition.toStageId !== currentStageId) {
    throw new Error('CharacterStorylineRun current stage must match its last accepted transition.');
  }
  return {
    characterStorylineRunId: requireIdentity(
      record['characterStorylineRunId'],
      'CharacterStorylineRun identity',
    ),
    characterStorylineVersionId: requireIdentity(
      record['characterStorylineVersionId'],
      'CharacterStorylineRun CharacterStorylineVersion identity',
    ),
    characterRunId: requireIdentity(
      record['characterRunId'],
      'CharacterStorylineRun CharacterRun identity',
    ),
    currentStageId,
    acceptedTransitions,
    storylineRevision,
    createdAt: requireIsoDate(record['createdAt'], 'CharacterStorylineRun createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'CharacterStorylineRun updatedAt'),
  };
}

export function parseCharacterStorylineObservationCandidate(
  value: unknown,
): CharacterStorylineObservationCandidate {
  const record = requireExactRecord(
    value,
    [
      'observationCandidateId',
      'characterStorylineRunId',
      'sourceRef',
      'observedAt',
      'fromStageId',
      'toStageId',
      'turningPointId',
      'expectedStorylineRevision',
      'status',
      'reviewedAt',
      'acceptedTransitionId',
    ],
    'Character storyline observation candidate',
  );
  const status = requireOneOf(
    record['status'],
    CHARACTER_STORYLINE_CANDIDATE_STATUSES,
    'Character storyline candidate status',
  );
  const reviewedAt = optionalIdentity(record['reviewedAt'], 'Character storyline candidate review');
  const acceptedTransitionId = optionalIdentity(
    record['acceptedTransitionId'],
    'Character storyline accepted transition',
  );
  const turningPointId = optionalIdentity(
    record['turningPointId'],
    'Character storyline turning point',
  );
  const fromStageId = requireIdentity(record['fromStageId'], 'Character storyline source stage');
  const toStageId = requireIdentity(record['toStageId'], 'Character storyline target stage');
  if (fromStageId === toStageId) {
    throw new Error('Character storyline observation must propose a stage change.');
  }
  assertReviewState(status, reviewedAt, acceptedTransitionId, 'Character storyline candidate');
  return {
    observationCandidateId: requireIdentity(
      record['observationCandidateId'],
      'Character storyline observation candidate identity',
    ),
    characterStorylineRunId: requireIdentity(
      record['characterStorylineRunId'],
      'Character storyline candidate Run identity',
    ),
    sourceRef: requireOpaqueRef(record['sourceRef'], 'Character storyline candidate sourceRef'),
    observedAt: requireIsoDate(record['observedAt'], 'Character storyline candidate observedAt'),
    fromStageId,
    toStageId,
    ...(turningPointId === undefined ? {} : { turningPointId }),
    expectedStorylineRevision: requireNonNegativeInteger(
      record['expectedStorylineRevision'],
      'Character storyline expected revision',
    ),
    status,
    ...(reviewedAt === undefined
      ? {}
      : { reviewedAt: requireIsoDate(reviewedAt, 'Character storyline candidate reviewedAt') }),
    ...(acceptedTransitionId === undefined ? {} : { acceptedTransitionId }),
  };
}

export function parseCharacterMemoryScope(value: unknown): CharacterMemoryScope {
  const record = requireExactRecord(
    value,
    [
      'characterMemoryScopeId',
      'characterRunId',
      'characterStorylineRunId',
      'memoryRevision',
      'candidates',
      'entries',
      'createdAt',
      'updatedAt',
    ],
    'CharacterMemoryScope',
  );
  const characterMemoryScopeId = requireIdentity(
    record['characterMemoryScopeId'],
    'CharacterMemoryScope identity',
  );
  const candidates = requireUniqueIdentities(
    requireArray(
      record['candidates'],
      parseCharacterMemoryCandidate,
      'Character memory candidates',
    ),
    (candidate) => candidate.characterMemoryCandidateId,
    'Character memory candidates',
  );
  const entries = requireUniqueIdentities(
    requireArray(record['entries'], parseCharacterMemoryEntry, 'Character memory entries'),
    (entry) => entry.characterMemoryEntryId,
    'Character memory entries',
  );
  const memoryRevision = requireNonNegativeInteger(
    record['memoryRevision'],
    'CharacterMemoryScope revision',
  );
  if (
    candidates.some((candidate) => candidate.characterMemoryScopeId !== characterMemoryScopeId) ||
    entries.some((entry) => entry.characterMemoryScopeId !== characterMemoryScopeId)
  ) {
    throw new Error('Character memory records must bind their exact owning MemoryScope.');
  }
  const entriesById = new Map(entries.map((entry) => [entry.characterMemoryEntryId, entry]));
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.characterMemoryCandidateId, candidate]),
  );
  for (const candidate of candidates) {
    const acceptedEntryId = candidate.acceptedMemoryEntryId;
    if (
      candidate.status === 'accepted' &&
      (acceptedEntryId === undefined || !entriesById.has(acceptedEntryId))
    ) {
      throw new Error(
        `Accepted Character memory candidate '${candidate.characterMemoryCandidateId}' has no entry.`,
      );
    }
    if (candidate.expectedMemoryRevision > memoryRevision) {
      throw new Error(
        `Character memory candidate '${candidate.characterMemoryCandidateId}' expects a future revision.`,
      );
    }
    if (
      acceptedEntryId !== undefined &&
      entriesById.get(acceptedEntryId)?.sourceCandidateId !== candidate.characterMemoryCandidateId
    ) {
      throw new Error(
        `Character memory candidate '${candidate.characterMemoryCandidateId}' does not own its accepted entry.`,
      );
    }
  }
  for (const entry of entries) {
    if (!candidatesById.has(entry.sourceCandidateId)) {
      throw new Error(
        `Character memory entry '${entry.characterMemoryEntryId}' references an unknown candidate.`,
      );
    }
    if (
      entry.correctedFromMemoryEntryId !== undefined &&
      !entriesById.has(entry.correctedFromMemoryEntryId)
    ) {
      throw new Error(
        `Character memory entry '${entry.characterMemoryEntryId}' references an unknown correction source.`,
      );
    }
    if (
      entry.correctedByMemoryEntryId !== undefined &&
      !entriesById.has(entry.correctedByMemoryEntryId)
    ) {
      throw new Error(
        `Character memory entry '${entry.characterMemoryEntryId}' references an unknown correction.`,
      );
    }
  }
  const characterStorylineRunId = optionalIdentity(
    record['characterStorylineRunId'],
    'CharacterMemoryScope CharacterStorylineRun identity',
  );
  return {
    characterMemoryScopeId,
    characterRunId: requireIdentity(
      record['characterRunId'],
      'CharacterMemoryScope CharacterRun identity',
    ),
    ...(characterStorylineRunId === undefined ? {} : { characterStorylineRunId }),
    memoryRevision,
    candidates,
    entries,
    createdAt: requireIsoDate(record['createdAt'], 'CharacterMemoryScope createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'CharacterMemoryScope updatedAt'),
  };
}

export function parseCharacterMemoryCandidate(value: unknown): CharacterMemoryCandidate {
  const record = requireExactRecord(
    value,
    [
      'characterMemoryCandidateId',
      'characterMemoryScopeId',
      'content',
      'sourceRef',
      'observerParticipantId',
      'observedAt',
      'sensitivityTraits',
      'retentionTraits',
      'expectedMemoryRevision',
      'status',
      'reviewedAt',
      'acceptedMemoryEntryId',
    ],
    'Character memory candidate',
  );
  const status = requireOneOf(
    record['status'],
    CHARACTER_MEMORY_CANDIDATE_LIFECYCLE_STATUSES,
    'Character memory candidate status',
  );
  const reviewedAt = optionalIdentity(record['reviewedAt'], 'Character memory candidate review');
  const acceptedMemoryEntryId = optionalIdentity(
    record['acceptedMemoryEntryId'],
    'Character memory accepted entry',
  );
  assertReviewState(status, reviewedAt, acceptedMemoryEntryId, 'Character memory candidate');
  const observerParticipantId = optionalIdentity(
    record['observerParticipantId'],
    'Character memory observer participant',
  );
  return {
    characterMemoryCandidateId: requireIdentity(
      record['characterMemoryCandidateId'],
      'Character memory candidate identity',
    ),
    characterMemoryScopeId: requireIdentity(
      record['characterMemoryScopeId'],
      'Character memory candidate Scope identity',
    ),
    content: requireIdentity(record['content'], 'Character memory candidate content'),
    sourceRef: requireOpaqueRef(record['sourceRef'], 'Character memory candidate sourceRef'),
    ...(observerParticipantId === undefined ? {} : { observerParticipantId }),
    observedAt: requireIsoDate(record['observedAt'], 'Character memory candidate observedAt'),
    sensitivityTraits: requireUniqueStringArray(
      record['sensitivityTraits'],
      'Character memory sensitivity traits',
    ),
    retentionTraits: requireUniqueStringArray(
      record['retentionTraits'],
      'Character memory retention traits',
    ),
    expectedMemoryRevision: requireNonNegativeInteger(
      record['expectedMemoryRevision'],
      'Character memory expected revision',
    ),
    status,
    ...(reviewedAt === undefined
      ? {}
      : { reviewedAt: requireIsoDate(reviewedAt, 'Character memory candidate reviewedAt') }),
    ...(acceptedMemoryEntryId === undefined ? {} : { acceptedMemoryEntryId }),
  };
}

export function parseCharacterMemoryEntry(value: unknown): CharacterMemoryEntry {
  const record = requireExactRecord(
    value,
    [
      'characterMemoryEntryId',
      'characterMemoryScopeId',
      'sourceCandidateId',
      'content',
      'sourceRef',
      'observerParticipantId',
      'observedAt',
      'sensitivityTraits',
      'retentionTraits',
      'status',
      'acceptedAt',
      'correctedFromMemoryEntryId',
      'correctedByMemoryEntryId',
      'correctedAt',
      'deletedAt',
    ],
    'Character memory entry',
  );
  const status = requireOneOf(
    record['status'],
    CHARACTER_MEMORY_ENTRY_STATUSES,
    'Character memory entry status',
  );
  const correctedFromMemoryEntryId = optionalIdentity(
    record['correctedFromMemoryEntryId'],
    'Character memory correction source',
  );
  const correctedByMemoryEntryId = optionalIdentity(
    record['correctedByMemoryEntryId'],
    'Character memory correction target',
  );
  const correctedAt = optionalIdentity(record['correctedAt'], 'Character memory correctedAt');
  const deletedAt = optionalIdentity(record['deletedAt'], 'Character memory deletedAt');
  if (
    status === 'active' &&
    (correctedByMemoryEntryId !== undefined || correctedAt !== undefined || deletedAt !== undefined)
  ) {
    throw new Error('Active Character memory entry cannot carry correction or deletion state.');
  }
  if (
    status === 'corrected' &&
    (correctedByMemoryEntryId === undefined || correctedAt === undefined || deletedAt !== undefined)
  ) {
    throw new Error('Corrected Character memory entry requires its replacement and correctedAt.');
  }
  if (
    status === 'deleted' &&
    (deletedAt === undefined || correctedByMemoryEntryId !== undefined || correctedAt !== undefined)
  ) {
    throw new Error('Deleted Character memory entry requires deletedAt only.');
  }
  const observerParticipantId = optionalIdentity(
    record['observerParticipantId'],
    'Character memory entry observer participant',
  );
  return {
    characterMemoryEntryId: requireIdentity(
      record['characterMemoryEntryId'],
      'Character memory entry identity',
    ),
    characterMemoryScopeId: requireIdentity(
      record['characterMemoryScopeId'],
      'Character memory entry Scope identity',
    ),
    sourceCandidateId: requireIdentity(
      record['sourceCandidateId'],
      'Character memory entry source candidate',
    ),
    content: requireIdentity(record['content'], 'Character memory entry content'),
    sourceRef: requireOpaqueRef(record['sourceRef'], 'Character memory entry sourceRef'),
    ...(observerParticipantId === undefined ? {} : { observerParticipantId }),
    observedAt: requireIsoDate(record['observedAt'], 'Character memory entry observedAt'),
    sensitivityTraits: requireUniqueStringArray(
      record['sensitivityTraits'],
      'Character memory entry sensitivity traits',
    ),
    retentionTraits: requireUniqueStringArray(
      record['retentionTraits'],
      'Character memory entry retention traits',
    ),
    status,
    acceptedAt: requireIsoDate(record['acceptedAt'], 'Character memory entry acceptedAt'),
    ...(correctedFromMemoryEntryId === undefined ? {} : { correctedFromMemoryEntryId }),
    ...(correctedByMemoryEntryId === undefined ? {} : { correctedByMemoryEntryId }),
    ...(correctedAt === undefined
      ? {}
      : { correctedAt: requireIsoDate(correctedAt, 'Character memory entry correctedAt') }),
    ...(deletedAt === undefined
      ? {}
      : { deletedAt: requireIsoDate(deletedAt, 'Character memory entry deletedAt') }),
  };
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

export function parseCharacterStorylineVersionRef(value: unknown): CharacterStorylineVersionRef {
  const record = requireExactRecord(
    value,
    ['characterVersionId', 'characterStorylineVersionId'],
    'CharacterStorylineVersionRef',
  );
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterStorylineVersionRef CharacterVersion identity',
    ),
    characterStorylineVersionId: requireIdentity(
      record['characterStorylineVersionId'],
      'CharacterStorylineVersionRef identity',
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

export function parseCharacterStorylineRunRef(value: unknown): CharacterStorylineRunRef {
  const record = requireExactRecord(
    value,
    [
      'characterVersionId',
      'characterRunId',
      'characterStorylineVersionId',
      'characterStorylineRunId',
    ],
    'CharacterStorylineRunRef',
  );
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterStorylineRunRef CharacterVersion identity',
    ),
    characterRunId: requireIdentity(
      record['characterRunId'],
      'CharacterStorylineRunRef CharacterRun identity',
    ),
    characterStorylineVersionId: requireIdentity(
      record['characterStorylineVersionId'],
      'CharacterStorylineRunRef CharacterStorylineVersion identity',
    ),
    characterStorylineRunId: requireIdentity(
      record['characterStorylineRunId'],
      'CharacterStorylineRunRef identity',
    ),
  };
}

export function parseCharacterMemoryScopeRef(value: unknown): CharacterMemoryScopeRef {
  const record = requireExactRecord(
    value,
    ['characterVersionId', 'characterRunId', 'characterMemoryScopeId'],
    'CharacterMemoryScopeRef',
  );
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterMemoryScopeRef CharacterVersion identity',
    ),
    characterRunId: requireIdentity(
      record['characterRunId'],
      'CharacterMemoryScopeRef CharacterRun identity',
    ),
    characterMemoryScopeId: requireIdentity(
      record['characterMemoryScopeId'],
      'CharacterMemoryScopeRef identity',
    ),
  };
}

function parseLoreEntries(value: unknown, label: string): readonly CharacterLoreEntry[] {
  return requireUniqueIdentities(
    requireArray(value, parseLoreEntry, label),
    (entry) => entry.loreEntryId,
    label,
  );
}

function assertUniqueLoreEntries(entries: readonly CharacterLoreEntry[], label: string): void {
  requireUniqueIdentities(entries, (entry) => entry.loreEntryId, `${label} entries`);
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
    evidenceIds: requireUniqueStringArray(record['evidenceIds'], 'Character lore entry evidence'),
  };
}

function parseStorylineStage(value: unknown): CharacterStorylineStage {
  const record = requireExactRecord(
    value,
    ['stageId', 'title', 'description'],
    'Character storyline stage',
  );
  return {
    stageId: requireIdentity(record['stageId'], 'Character storyline stage identity'),
    title: requireIdentity(record['title'], 'Character storyline stage title'),
    description: requireString(record['description'], 'Character storyline stage description'),
  };
}

function parseStorylineTurningPoint(value: unknown): CharacterStorylineTurningPoint {
  const record = requireExactRecord(
    value,
    ['turningPointId', 'fromStageId', 'toStageId', 'description', 'evidenceIds'],
    'Character storyline turning point',
  );
  const fromStageId = requireIdentity(
    record['fromStageId'],
    'Character storyline turning point source stage',
  );
  const toStageId = requireIdentity(
    record['toStageId'],
    'Character storyline turning point target stage',
  );
  if (fromStageId === toStageId) {
    throw new Error('Character storyline turning point must change stage.');
  }
  return {
    turningPointId: requireIdentity(
      record['turningPointId'],
      'Character storyline turning point identity',
    ),
    fromStageId,
    toStageId,
    description: requireString(
      record['description'],
      'Character storyline turning point description',
    ),
    evidenceIds: requireUniqueStringArray(
      record['evidenceIds'],
      'Character storyline turning point evidence',
    ),
  };
}

function parseStorylineTransition(value: unknown): CharacterStorylineTransition {
  const record = requireExactRecord(
    value,
    [
      'transitionId',
      'observationCandidateId',
      'fromStageId',
      'toStageId',
      'sourceRef',
      'acceptedAt',
      'resultingStorylineRevision',
    ],
    'Character storyline transition',
  );
  const fromStageId = requireIdentity(record['fromStageId'], 'Character transition source stage');
  const toStageId = requireIdentity(record['toStageId'], 'Character transition target stage');
  if (fromStageId === toStageId)
    throw new Error('Character storyline transition must change stage.');
  return {
    transitionId: requireIdentity(record['transitionId'], 'Character transition identity'),
    observationCandidateId: requireIdentity(
      record['observationCandidateId'],
      'Character transition observation candidate',
    ),
    fromStageId,
    toStageId,
    sourceRef: requireOpaqueRef(record['sourceRef'], 'Character transition sourceRef'),
    acceptedAt: requireIsoDate(record['acceptedAt'], 'Character transition acceptedAt'),
    resultingStorylineRevision: requireNonNegativeInteger(
      record['resultingStorylineRevision'],
      'Character transition resulting revision',
    ),
  };
}

function assertReviewState(
  status: 'pending' | 'accepted' | 'rejected',
  reviewedAt: string | undefined,
  acceptedRecordId: string | undefined,
  label: string,
): void {
  if (status === 'pending' && (reviewedAt !== undefined || acceptedRecordId !== undefined)) {
    throw new Error(`${label} pending state cannot carry review results.`);
  }
  if (status === 'accepted' && (reviewedAt === undefined || acceptedRecordId === undefined)) {
    throw new Error(`${label} accepted state requires reviewedAt and an accepted record identity.`);
  }
  if (status === 'rejected' && (reviewedAt === undefined || acceptedRecordId !== undefined)) {
    throw new Error(`${label} rejected state requires reviewedAt without an accepted record.`);
  }
}

function requireUniqueStringArray(value: unknown, label: string): readonly string[] {
  return requireUniqueIdentities(
    requireArray(value, (item) => requireIdentity(item, label), label),
    (item) => item,
    label,
  );
}

function requireOpaqueRef(value: unknown, label: string): string {
  const ref = requireIdentity(value, label);
  if (!/^[a-z][a-z0-9+.-]*:[^\s]+$/u.test(ref) || /^file:/u.test(ref)) {
    throw new Error(`${label} must be an opaque non-file reference.`);
  }
  return ref;
}
