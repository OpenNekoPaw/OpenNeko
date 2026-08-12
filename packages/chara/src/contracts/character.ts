import {
  optionalIdentity,
  optionalString,
  readDiagnosticIdentity,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireJsonValue,
  requireNonNegativeInteger,
  requireOneOf,
  requireString,
  requireUniqueIdentities,
  type CharaJsonValue,
} from './codec';
import {
  collectCharacterLoreEvidenceIds,
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterBackgroundStory,
  parseCharacterOriginSetting,
  type CharacterBackgroundStory,
  type CharacterOriginSetting,
} from './character-lore-storyline-memory';
import {
  parseCompanionMemoryProvenance,
  type CompanionMemoryProvenance,
} from './character-companion-continuity';

export const CHARACTER_REVIEW_STATUSES = ['draft', 'ready', 'blocked'] as const;
export const CHARACTER_CANDIDATE_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export const CHARACTER_RUNTIME_KINDS = ['companion', 'narrative'] as const;
export const CHARACTER_REPRESENTATION_KINDS = [
  'portrait',
  'live2d',
  'vrm',
  'mmd',
  'pngtuber',
  'voice',
] as const;
export const CHARACTER_CONTROLLER_KINDS = ['human', 'agent'] as const;
export const RELATIONSHIP_MEMORY_CANDIDATE_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export const RELATIONSHIP_MEMORY_STATUSES = ['active', 'corrected', 'deleted'] as const;

export type CharacterReviewStatus = (typeof CHARACTER_REVIEW_STATUSES)[number];
export type CharacterCandidateStatus = (typeof CHARACTER_CANDIDATE_STATUSES)[number];
export type CharacterRuntimeKind = (typeof CHARACTER_RUNTIME_KINDS)[number];
export type CharacterRepresentationKind = (typeof CHARACTER_REPRESENTATION_KINDS)[number];
export type RelationshipMemoryCandidateStatus =
  (typeof RELATIONSHIP_MEMORY_CANDIDATE_STATUSES)[number];
export type RelationshipMemoryStatus = (typeof RELATIONSHIP_MEMORY_STATUSES)[number];

export interface CharacterEvidenceRef {
  readonly evidenceId: string;
  readonly sourceRef: string;
  readonly excerpt?: string;
  readonly observedAt: string;
}

export interface CharacterCanonCandidate {
  readonly candidateId: string;
  readonly field: string;
  readonly proposedValue: CharaJsonValue;
  readonly evidenceIds: readonly string[];
  readonly status: CharacterCandidateStatus;
  readonly reviewedAt?: string;
}

export interface CharacterRepresentationRef {
  readonly representationId: string;
  readonly kind: CharacterRepresentationKind;
  readonly resourceRef: string;
}

export interface CharacterCreationSeed {
  readonly evidence: readonly CharacterEvidenceRef[];
  readonly representationRefs: readonly CharacterRepresentationRef[];
}

export interface CharacterRepresentationDefaults {
  readonly portraitRepresentationId?: string;
  readonly avatarRepresentationId?: string;
}

export interface CharacterVoiceDefaults {
  readonly providerRef: string;
  readonly voiceRepresentationId: string;
  readonly speed: number;
  readonly autoRead: boolean;
}

export interface CharacterDefinition {
  readonly summary: string;
  readonly backgroundStory: CharacterBackgroundStory;
  readonly originSetting: CharacterOriginSetting;
  readonly canon: readonly string[];
  readonly knowledgeBoundary: readonly string[];
  readonly behaviorPolicy: readonly string[];
  readonly expressionPolicy: readonly string[];
  readonly representationRefs: readonly CharacterRepresentationRef[];
  readonly representationDefaults?: CharacterRepresentationDefaults;
  readonly voiceDefaults?: CharacterVoiceDefaults;
}

export function createEmptyCharacterDefinition(): CharacterDefinition {
  return {
    summary: '',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}

export interface CharacterProject {
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly draft: CharacterDefinition;
  readonly draftBasisCharacterVersionId?: string;
  readonly evidence: readonly CharacterEvidenceRef[];
  readonly candidates: readonly CharacterCanonCandidate[];
  readonly reviewStatus: CharacterReviewStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CharacterVersion {
  readonly characterVersionId: string;
  readonly characterProjectId: string;
  readonly label: string;
  readonly definition: CharacterDefinition;
  readonly acceptedEvidenceIds: readonly string[];
  readonly publishedAt: string;
}

export interface CharacterAuthoringTestSnapshot {
  readonly authoringTestSnapshotId: string;
  readonly characterProjectId: string;
  readonly capturedAt: string;
  readonly definition: CharacterDefinition;
}

export type CharacterController =
  | { readonly kind: 'human'; readonly userId: string }
  | { readonly kind: 'agent'; readonly primaryAgentSessionId: string };

export interface CompanionCharacterBinding {
  readonly kind: 'companion';
  readonly companionContinuityId: string;
  readonly relationshipId: string;
}

export interface NarrativeCharacterBinding {
  readonly kind: 'narrative';
  readonly storyline?: {
    readonly characterStorylineId: string;
    readonly characterStorylineVersionId: string;
    readonly storylineNodeId: string;
  };
}

export type CharacterRuntimeBinding = CompanionCharacterBinding | NarrativeCharacterBinding;

export interface CharacterRun {
  readonly characterRunId: string;
  readonly characterVersionId: string;
  readonly participantId: string;
  readonly controller: CharacterController;
  readonly runtimeBinding: CharacterRuntimeBinding;
  readonly createdAt: string;
}

export interface RelationshipMemory {
  readonly memoryId: string;
  readonly sourceCandidateId: string;
  readonly sourceCharacterVersionId: string;
  readonly provenance: CompanionMemoryProvenance;
  readonly content: string;
  readonly status: RelationshipMemoryStatus;
  readonly acceptedAt: string;
  readonly correctedFromMemoryId?: string;
  readonly correctedByMemoryId?: string;
  readonly correctedAt?: string;
  readonly deletedAt?: string;
}

export interface RelationshipMemoryCandidate {
  readonly candidateId: string;
  readonly relationshipId: string;
  readonly sourceCharacterVersionId: string;
  readonly provenance: CompanionMemoryProvenance;
  readonly content: string;
  readonly expectedRelationshipRevision: number;
  readonly status: RelationshipMemoryCandidateStatus;
  readonly createdAt: string;
  readonly reviewedAt?: string;
  readonly acceptedMemoryId?: string;
}

export interface UserCharacterRelationship {
  readonly relationshipId: string;
  readonly userId: string;
  readonly characterProjectId: string;
  readonly relationshipRevision: number;
  readonly memories: readonly RelationshipMemory[];
  readonly candidates: readonly RelationshipMemoryCandidate[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CharacterRecordKind =
  | 'character-project'
  | 'character-version'
  | 'authoring-test-snapshot'
  | 'character-run'
  | 'user-character-relationship'
  | 'character-storyline-version'
  | 'character-storyline-run'
  | 'character-storyline-observation-candidate'
  | 'character-memory-scope';

export interface CharacterRecordDiagnostic {
  readonly code: 'invalid-character-record';
  readonly recordKind: CharacterRecordKind;
  readonly recordId?: string;
  readonly message: string;
}

export interface CharacterRecordDecodeResult<T> {
  readonly records: readonly T[];
  readonly diagnostics: readonly CharacterRecordDiagnostic[];
}

export function parseCharacterProject(value: unknown): CharacterProject {
  const record = requireExactRecord(
    value,
    [
      'characterProjectId',
      'displayName',
      'draft',
      'draftBasisCharacterVersionId',
      'evidence',
      'candidates',
      'reviewStatus',
      'createdAt',
      'updatedAt',
    ],
    'CharacterProject',
  );
  const evidence = requireUniqueIdentities(
    requireArray(record['evidence'], parseCharacterEvidenceRef, 'CharacterProject evidence'),
    (item) => item.evidenceId,
    'CharacterProject evidence',
  );
  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  const candidates = requireUniqueIdentities(
    requireArray(record['candidates'], parseCharacterCanonCandidate, 'CharacterProject candidates'),
    (item) => item.candidateId,
    'CharacterProject candidates',
  );
  for (const candidate of candidates) {
    const missing = candidate.evidenceIds.find((evidenceId) => !evidenceIds.has(evidenceId));
    if (missing) {
      throw new Error(
        `Character candidate '${candidate.candidateId}' references unknown evidence '${missing}'.`,
      );
    }
  }
  const draft = parseCharacterDefinition(record['draft']);
  const draftBasisCharacterVersionId = optionalIdentity(
    record['draftBasisCharacterVersionId'],
    'CharacterProject draft basis CharacterVersion identity',
  );
  validateCharacterDefinitionEvidence(draft, evidenceIds, 'CharacterProject');
  return {
    characterProjectId: requireIdentity(
      record['characterProjectId'],
      'CharacterProject characterProjectId',
    ),
    displayName: requireIdentity(record['displayName'], 'CharacterProject displayName'),
    draft,
    ...(draftBasisCharacterVersionId === undefined ? {} : { draftBasisCharacterVersionId }),
    evidence,
    candidates,
    reviewStatus: requireOneOf(
      record['reviewStatus'],
      CHARACTER_REVIEW_STATUSES,
      'CharacterProject reviewStatus',
    ),
    createdAt: requireIsoDate(record['createdAt'], 'CharacterProject createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'CharacterProject updatedAt'),
  };
}

export function parseCharacterVersion(value: unknown): CharacterVersion {
  const record = requireExactRecord(
    value,
    [
      'characterVersionId',
      'characterProjectId',
      'label',
      'definition',
      'acceptedEvidenceIds',
      'publishedAt',
    ],
    'CharacterVersion',
  );
  const acceptedEvidenceIds = requireUniqueStringArray(
    record['acceptedEvidenceIds'],
    'CharacterVersion acceptedEvidenceIds',
  );
  const definition = parseCharacterDefinition(record['definition']);
  validateCharacterDefinitionEvidence(definition, new Set(acceptedEvidenceIds), 'CharacterVersion');
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterVersion characterVersionId',
    ),
    characterProjectId: requireIdentity(
      record['characterProjectId'],
      'CharacterVersion characterProjectId',
    ),
    label: requireIdentity(record['label'], 'CharacterVersion label'),
    definition,
    acceptedEvidenceIds,
    publishedAt: requireIsoDate(record['publishedAt'], 'CharacterVersion publishedAt'),
  };
}

export function parseCharacterAuthoringTestSnapshot(
  value: unknown,
): CharacterAuthoringTestSnapshot {
  const record = requireExactRecord(
    value,
    ['authoringTestSnapshotId', 'characterProjectId', 'capturedAt', 'definition'],
    'Character authoring-test snapshot',
  );
  return {
    authoringTestSnapshotId: requireIdentity(
      record['authoringTestSnapshotId'],
      'Character authoring-test snapshot identity',
    ),
    characterProjectId: requireIdentity(
      record['characterProjectId'],
      'Character authoring-test source project',
    ),
    capturedAt: requireIsoDate(record['capturedAt'], 'Character authoring-test capturedAt'),
    definition: parseCharacterDefinition(record['definition']),
  };
}

export function parseCharacterRun(value: unknown): CharacterRun {
  const record = requireExactRecord(
    value,
    [
      'characterRunId',
      'characterVersionId',
      'participantId',
      'controller',
      'runtimeBinding',
      'createdAt',
    ],
    'CharacterRun',
  );
  return {
    characterRunId: requireIdentity(record['characterRunId'], 'CharacterRun characterRunId'),
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterRun characterVersionId',
    ),
    participantId: requireIdentity(record['participantId'], 'CharacterRun participantId'),
    controller: parseCharacterController(record['controller']),
    runtimeBinding: parseCharacterRuntimeBinding(record['runtimeBinding']),
    createdAt: requireIsoDate(record['createdAt'], 'CharacterRun createdAt'),
  };
}

export function parseUserCharacterRelationship(value: unknown): UserCharacterRelationship {
  const record = requireExactRecord(
    value,
    [
      'relationshipId',
      'userId',
      'characterProjectId',
      'relationshipRevision',
      'memories',
      'candidates',
      'createdAt',
      'updatedAt',
    ],
    'UserCharacterRelationship',
  );
  const relationshipId = requireIdentity(
    record['relationshipId'],
    'UserCharacterRelationship relationshipId',
  );
  const memories = requireUniqueIdentities(
    requireArray(record['memories'], parseRelationshipMemory, 'Relationship memories'),
    (item) => item.memoryId,
    'Relationship memories',
  );
  const candidates = requireUniqueIdentities(
    requireArray(
      record['candidates'],
      parseRelationshipMemoryCandidate,
      'Relationship memory candidates',
    ),
    (item) => item.candidateId,
    'Relationship memory candidates',
  );
  const candidateIds = new Set(candidates.map((candidate) => candidate.candidateId));
  if (candidates.some((candidate) => candidate.relationshipId !== relationshipId)) {
    throw new Error('Relationship candidates must bind the exact relationship identity.');
  }
  if (memories.some((memory) => !candidateIds.has(memory.sourceCandidateId))) {
    throw new Error('Relationship memories must reference an owned candidate.');
  }
  return {
    relationshipId,
    userId: requireIdentity(record['userId'], 'UserCharacterRelationship userId'),
    characterProjectId: requireIdentity(
      record['characterProjectId'],
      'UserCharacterRelationship CharacterProject identity',
    ),
    relationshipRevision: requireNonNegativeInteger(
      record['relationshipRevision'],
      'UserCharacterRelationship revision',
    ),
    memories,
    candidates,
    createdAt: requireIsoDate(record['createdAt'], 'UserCharacterRelationship createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'UserCharacterRelationship updatedAt'),
  };
}

export function decodeCharacterRecords<T>(
  values: readonly unknown[],
  recordKind: CharacterRecordKind,
  parser: (value: unknown) => T,
  identityKey: string,
): CharacterRecordDecodeResult<T> {
  const records: T[] = [];
  const diagnostics: CharacterRecordDiagnostic[] = [];
  for (const value of values) {
    try {
      records.push(parser(value));
    } catch (error) {
      diagnostics.push({
        code: 'invalid-character-record',
        recordKind,
        ...(readDiagnosticIdentity(value, identityKey)
          ? { recordId: readDiagnosticIdentity(value, identityKey) }
          : {}),
        message: error instanceof Error ? error.message : `Invalid ${recordKind} record.`,
      });
    }
  }
  return { records, diagnostics };
}

export function parseCharacterDefinition(value: unknown): CharacterDefinition {
  const record = requireExactRecord(
    value,
    [
      'summary',
      'backgroundStory',
      'originSetting',
      'canon',
      'knowledgeBoundary',
      'behaviorPolicy',
      'expressionPolicy',
      'representationRefs',
      'representationDefaults',
      'voiceDefaults',
    ],
    'Character definition',
  );
  const voiceDefaults =
    record['voiceDefaults'] === undefined
      ? undefined
      : parseCharacterVoiceDefaults(record['voiceDefaults']);
  const representationRefs = requireUniqueIdentities(
    requireArray(
      record['representationRefs'],
      parseCharacterRepresentationRef,
      'Character representationRefs',
    ),
    (item) => item.representationId,
    'Character representationRefs',
  );
  const representationDefaults =
    record['representationDefaults'] === undefined
      ? undefined
      : parseCharacterRepresentationDefaults(record['representationDefaults']);
  if (representationDefaults?.portraitRepresentationId !== undefined) {
    assertRepresentationDefault(
      representationRefs,
      representationDefaults.portraitRepresentationId,
      ['portrait'],
      'portrait',
    );
  }
  if (representationDefaults?.avatarRepresentationId !== undefined) {
    assertRepresentationDefault(
      representationRefs,
      representationDefaults.avatarRepresentationId,
      ['live2d', 'vrm', 'mmd', 'pngtuber'],
      'Avatar',
    );
  }
  if (
    voiceDefaults &&
    !representationRefs.some(
      (ref) => ref.representationId === voiceDefaults.voiceRepresentationId && ref.kind === 'voice',
    )
  ) {
    throw new Error('Character voice defaults must reference an exact voice representation.');
  }
  return {
    summary: requireString(record['summary'], 'Character definition summary'),
    backgroundStory: parseCharacterBackgroundStory(record['backgroundStory']),
    originSetting: parseCharacterOriginSetting(record['originSetting']),
    canon: requireStringArray(record['canon'], 'Character canon'),
    knowledgeBoundary: requireStringArray(
      record['knowledgeBoundary'],
      'Character knowledgeBoundary',
    ),
    behaviorPolicy: requireStringArray(record['behaviorPolicy'], 'Character behaviorPolicy'),
    expressionPolicy: requireStringArray(record['expressionPolicy'], 'Character expressionPolicy'),
    representationRefs,
    ...(representationDefaults === undefined ? {} : { representationDefaults }),
    ...(voiceDefaults === undefined ? {} : { voiceDefaults }),
  };
}

function parseCharacterRepresentationDefaults(value: unknown): CharacterRepresentationDefaults {
  const record = requireExactRecord(
    value,
    ['portraitRepresentationId', 'avatarRepresentationId'],
    'Character representation defaults',
  );
  const portraitRepresentationId = optionalIdentity(
    record['portraitRepresentationId'],
    'Character default portrait representation',
  );
  const avatarRepresentationId = optionalIdentity(
    record['avatarRepresentationId'],
    'Character default Avatar representation',
  );
  if (portraitRepresentationId === undefined && avatarRepresentationId === undefined) {
    throw new Error('Character representation defaults require a portrait or Avatar selection.');
  }
  return {
    ...(portraitRepresentationId === undefined ? {} : { portraitRepresentationId }),
    ...(avatarRepresentationId === undefined ? {} : { avatarRepresentationId }),
  };
}

function assertRepresentationDefault(
  representations: readonly CharacterRepresentationRef[],
  representationId: string,
  allowedKinds: readonly CharacterRepresentationKind[],
  label: string,
): void {
  const representation = representations.find(
    (candidate) => candidate.representationId === representationId,
  );
  if (!representation || !allowedKinds.includes(representation.kind)) {
    throw new Error(
      `Character ${label} default must reference an exact compatible representation.`,
    );
  }
}

function validateCharacterDefinitionEvidence(
  definition: CharacterDefinition,
  availableEvidenceIds: ReadonlySet<string>,
  label: string,
): void {
  const missing = collectCharacterLoreEvidenceIds(definition).find(
    (evidenceId) => !availableEvidenceIds.has(evidenceId),
  );
  if (missing !== undefined) {
    throw new Error(`${label} lore references unknown evidence '${missing}'.`);
  }
}

export function parseCharacterEvidenceRef(value: unknown): CharacterEvidenceRef {
  const record = requireExactRecord(
    value,
    ['evidenceId', 'sourceRef', 'excerpt', 'observedAt'],
    'Character evidence',
  );
  const excerpt = optionalString(record['excerpt'], 'Character evidence excerpt');
  return {
    evidenceId: requireIdentity(record['evidenceId'], 'Character evidence identity'),
    sourceRef: requireIdentity(record['sourceRef'], 'Character evidence sourceRef'),
    ...(excerpt === undefined ? {} : { excerpt }),
    observedAt: requireIsoDate(record['observedAt'], 'Character evidence observedAt'),
  };
}

function parseCharacterCanonCandidate(value: unknown): CharacterCanonCandidate {
  const record = requireExactRecord(
    value,
    ['candidateId', 'field', 'proposedValue', 'evidenceIds', 'status', 'reviewedAt'],
    'Character candidate',
  );
  const reviewedAt = optionalIdentity(record['reviewedAt'], 'Character candidate reviewedAt');
  const status = requireOneOf(
    record['status'],
    CHARACTER_CANDIDATE_STATUSES,
    'Character candidate status',
  );
  if (status === 'pending' && reviewedAt !== undefined) {
    throw new Error('Pending Character candidate cannot have reviewedAt.');
  }
  if (status !== 'pending' && reviewedAt === undefined) {
    throw new Error('Reviewed Character candidate requires reviewedAt.');
  }
  return {
    candidateId: requireIdentity(record['candidateId'], 'Character candidate identity'),
    field: requireIdentity(record['field'], 'Character candidate field'),
    proposedValue: requireJsonValue(record['proposedValue'], 'Character candidate proposedValue'),
    evidenceIds: requireUniqueStringArray(record['evidenceIds'], 'Character candidate evidenceIds'),
    status,
    ...(reviewedAt === undefined
      ? {}
      : { reviewedAt: requireIsoDate(reviewedAt, 'Character candidate reviewedAt') }),
  };
}

export function parseCharacterRepresentationRef(value: unknown): CharacterRepresentationRef {
  const record = requireExactRecord(
    value,
    ['representationId', 'kind', 'resourceRef'],
    'Character representation reference',
  );
  const resourceRef = requireIdentity(
    record['resourceRef'],
    'Character representation resourceRef',
  );
  if (!/^[a-z][a-z0-9+.-]*:[^\s]+$/u.test(resourceRef) || /^file:/u.test(resourceRef)) {
    throw new Error('Character representation resourceRef must be an opaque non-file reference.');
  }
  return {
    representationId: requireIdentity(
      record['representationId'],
      'Character representation identity',
    ),
    kind: requireOneOf(
      record['kind'],
      CHARACTER_REPRESENTATION_KINDS,
      'Character representation kind',
    ),
    resourceRef,
  };
}

export function parseCharacterCreationSeed(value: unknown): CharacterCreationSeed {
  const record = requireExactRecord(
    value,
    ['evidence', 'representationRefs'],
    'Character creation seed',
  );
  return {
    evidence: requireUniqueIdentities(
      requireArray(record['evidence'], parseCharacterEvidenceRef, 'Character creation evidence'),
      (item) => item.evidenceId,
      'Character creation evidence',
    ),
    representationRefs: requireUniqueIdentities(
      requireArray(
        record['representationRefs'],
        parseCharacterRepresentationRef,
        'Character creation representations',
      ),
      (item) => item.representationId,
      'Character creation representations',
    ),
  };
}

function parseCharacterVoiceDefaults(value: unknown): CharacterVoiceDefaults {
  const record = requireExactRecord(
    value,
    ['providerRef', 'voiceRepresentationId', 'speed', 'autoRead'],
    'Character voice defaults',
  );
  const providerRef = requireIdentity(record['providerRef'], 'Character voice provider');
  if (!/^[a-z][a-z0-9+.-]*:[^\s]+$/u.test(providerRef) || /^file:/u.test(providerRef)) {
    throw new Error('Character voice provider must be an opaque non-file reference.');
  }
  const speed = record['speed'];
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw new Error('Character voice speed must be between 0.5 and 2.');
  }
  if (typeof record['autoRead'] !== 'boolean') {
    throw new Error('Character voice autoRead must be a boolean.');
  }
  return {
    providerRef,
    voiceRepresentationId: requireIdentity(
      record['voiceRepresentationId'],
      'Character voice representation',
    ),
    speed,
    autoRead: record['autoRead'],
  };
}

function parseCharacterController(value: unknown): CharacterController {
  const record = requireExactRecord(
    value,
    ['kind', 'userId', 'primaryAgentSessionId'],
    'Character controller',
  );
  const kind = requireOneOf(
    record['kind'],
    CHARACTER_CONTROLLER_KINDS,
    'Character controller kind',
  );
  if (kind === 'human') {
    if (record['primaryAgentSessionId'] !== undefined) {
      throw new Error('Human Character controller cannot bind an AgentSession.');
    }
    return {
      kind,
      userId: requireIdentity(record['userId'], 'Human Character controller userId'),
    };
  }
  if (record['userId'] !== undefined) {
    throw new Error('Agent Character controller cannot bind a human userId.');
  }
  return {
    kind,
    primaryAgentSessionId: requireIdentity(
      record['primaryAgentSessionId'],
      'Agent Character controller primaryAgentSessionId',
    ),
  };
}

function parseCharacterRuntimeBinding(value: unknown): CharacterRuntimeBinding {
  const record = requireExactRecord(
    value,
    ['kind', 'companionContinuityId', 'relationshipId', 'storyline'],
    'Character runtime binding',
  );
  const kind = requireOneOf(record['kind'], CHARACTER_RUNTIME_KINDS, 'Character runtime kind');
  if (kind === 'companion') {
    if (record['storyline'] !== undefined) {
      throw new Error('Companion Character runtime cannot bind Storyline context.');
    }
    return {
      kind,
      companionContinuityId: requireIdentity(
        record['companionContinuityId'],
        'Companion Character continuity identity',
      ),
      relationshipId: requireIdentity(
        record['relationshipId'],
        'Companion Character relationshipId',
      ),
    };
  }
  if (record['relationshipId'] !== undefined || record['companionContinuityId'] !== undefined) {
    throw new Error('Narrative Character runtime cannot bind Companion continuity authority.');
  }
  if (record['storyline'] === undefined) return { kind };
  const storyline = requireExactRecord(
    record['storyline'],
    ['characterStorylineId', 'characterStorylineVersionId', 'storylineNodeId'],
    'Narrative Character Storyline binding',
  );
  return {
    kind,
    storyline: {
      characterStorylineId: requireIdentity(
        storyline['characterStorylineId'],
        'Narrative Character Storyline identity',
      ),
      characterStorylineVersionId: requireIdentity(
        storyline['characterStorylineVersionId'],
        'Narrative Character StorylineVersion identity',
      ),
      storylineNodeId: requireIdentity(
        storyline['storylineNodeId'],
        'Narrative Character StorylineNode identity',
      ),
    },
  };
}

function parseRelationshipMemory(value: unknown): RelationshipMemory {
  const record = requireExactRecord(
    value,
    [
      'memoryId',
      'sourceCandidateId',
      'sourceCharacterVersionId',
      'provenance',
      'content',
      'status',
      'acceptedAt',
      'correctedFromMemoryId',
      'correctedByMemoryId',
      'correctedAt',
      'deletedAt',
    ],
    'Relationship memory',
  );
  const status = requireOneOf(
    record['status'],
    RELATIONSHIP_MEMORY_STATUSES,
    'Relationship memory status',
  );
  const correctedFromMemoryId = optionalIdentity(
    record['correctedFromMemoryId'],
    'Relationship memory correction source',
  );
  const correctedByMemoryId = optionalIdentity(
    record['correctedByMemoryId'],
    'Relationship memory correction target',
  );
  const correctedAt = optionalIdentity(record['correctedAt'], 'Relationship memory correctedAt');
  const deletedAt = optionalIdentity(record['deletedAt'], 'Relationship memory deletedAt');
  if (
    (status === 'active' &&
      (correctedByMemoryId !== undefined ||
        correctedAt !== undefined ||
        deletedAt !== undefined)) ||
    (status === 'corrected' &&
      (correctedByMemoryId === undefined ||
        correctedAt === undefined ||
        deletedAt !== undefined)) ||
    (status === 'deleted' &&
      (deletedAt === undefined || correctedByMemoryId !== undefined || correctedAt !== undefined))
  ) {
    throw new Error('Relationship memory lifecycle state is inconsistent.');
  }
  return {
    memoryId: requireIdentity(record['memoryId'], 'Relationship memory identity'),
    sourceCandidateId: requireIdentity(
      record['sourceCandidateId'],
      'Relationship memory source candidate identity',
    ),
    sourceCharacterVersionId: requireIdentity(
      record['sourceCharacterVersionId'],
      'Relationship memory source CharacterVersion identity',
    ),
    provenance: parseCompanionMemoryProvenance(record['provenance']),
    content: requireIdentity(record['content'], 'Relationship memory content'),
    status,
    acceptedAt: requireIsoDate(record['acceptedAt'], 'Relationship memory acceptedAt'),
    ...(correctedFromMemoryId === undefined ? {} : { correctedFromMemoryId }),
    ...(correctedByMemoryId === undefined ? {} : { correctedByMemoryId }),
    ...(correctedAt === undefined
      ? {}
      : { correctedAt: requireIsoDate(correctedAt, 'Relationship memory correctedAt') }),
    ...(deletedAt === undefined
      ? {}
      : { deletedAt: requireIsoDate(deletedAt, 'Relationship memory deletedAt') }),
  };
}

function parseRelationshipMemoryCandidate(value: unknown): RelationshipMemoryCandidate {
  const record = requireExactRecord(
    value,
    [
      'candidateId',
      'relationshipId',
      'sourceCharacterVersionId',
      'provenance',
      'content',
      'expectedRelationshipRevision',
      'status',
      'createdAt',
      'reviewedAt',
      'acceptedMemoryId',
    ],
    'Relationship memory candidate',
  );
  const status = requireOneOf(
    record['status'],
    RELATIONSHIP_MEMORY_CANDIDATE_STATUSES,
    'Relationship memory candidate status',
  );
  const reviewedAt = optionalIdentity(record['reviewedAt'], 'Relationship candidate reviewedAt');
  const acceptedMemoryId = optionalIdentity(
    record['acceptedMemoryId'],
    'Relationship candidate accepted memory identity',
  );
  if (
    (status === 'pending' && (reviewedAt !== undefined || acceptedMemoryId !== undefined)) ||
    (status === 'accepted' && (reviewedAt === undefined || acceptedMemoryId === undefined)) ||
    (status === 'rejected' && (reviewedAt === undefined || acceptedMemoryId !== undefined))
  ) {
    throw new Error('Relationship memory candidate review state is inconsistent.');
  }
  return {
    candidateId: requireIdentity(record['candidateId'], 'Relationship candidate identity'),
    relationshipId: requireIdentity(
      record['relationshipId'],
      'Relationship candidate owner identity',
    ),
    sourceCharacterVersionId: requireIdentity(
      record['sourceCharacterVersionId'],
      'Relationship candidate source CharacterVersion identity',
    ),
    provenance: parseCompanionMemoryProvenance(record['provenance']),
    content: requireIdentity(record['content'], 'Relationship candidate content'),
    expectedRelationshipRevision: requireNonNegativeInteger(
      record['expectedRelationshipRevision'],
      'Relationship candidate expected revision',
    ),
    status,
    createdAt: requireIsoDate(record['createdAt'], 'Relationship candidate createdAt'),
    ...(reviewedAt === undefined
      ? {}
      : { reviewedAt: requireIsoDate(reviewedAt, 'Relationship candidate reviewedAt') }),
    ...(acceptedMemoryId === undefined ? {} : { acceptedMemoryId }),
  };
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  return requireArray(value, (item) => requireString(item, label), label);
}

function requireUniqueStringArray(value: unknown, label: string): readonly string[] {
  return requireUniqueIdentities(requireStringArray(value, label), (item) => item, label);
}
