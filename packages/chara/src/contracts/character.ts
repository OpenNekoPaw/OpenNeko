import {
  optionalIdentity,
  optionalString,
  readDiagnosticIdentity,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireJsonValue,
  requireOneOf,
  requireString,
  requireUniqueIdentities,
  type CharaJsonValue,
} from './codec';

export const CHARACTER_REVIEW_STATUSES = ['draft', 'ready', 'blocked'] as const;
export const CHARACTER_CANDIDATE_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export const CHARACTER_RUNTIME_KINDS = ['companion', 'narrative'] as const;
export const CHARACTER_CONTROLLER_KINDS = ['human', 'agent'] as const;
export const RELATIONSHIP_MEMORY_CANDIDATE_STATUSES = ['pending', 'accepted', 'rejected'] as const;

export type CharacterReviewStatus = (typeof CHARACTER_REVIEW_STATUSES)[number];
export type CharacterCandidateStatus = (typeof CHARACTER_CANDIDATE_STATUSES)[number];
export type CharacterRuntimeKind = (typeof CHARACTER_RUNTIME_KINDS)[number];
export type RelationshipMemoryCandidateStatus =
  (typeof RELATIONSHIP_MEMORY_CANDIDATE_STATUSES)[number];

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
  readonly role: string;
  readonly targetRef: string;
}

export interface CharacterDefinition {
  readonly summary: string;
  readonly canon: readonly string[];
  readonly knowledgeBoundary: readonly string[];
  readonly behaviorPolicy: readonly string[];
  readonly expressionPolicy: readonly string[];
  readonly representationRefs: readonly CharacterRepresentationRef[];
}

export interface CharacterProject {
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly draft: CharacterDefinition;
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
  readonly relationshipId: string;
}

export interface NarrativeCharacterBinding {
  readonly kind: 'narrative';
  readonly worldVersionId: string;
  readonly worldRunId: string;
  readonly worldSaveId: string;
  readonly branchId: string;
  readonly actorId: string;
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
  readonly content: string;
  readonly sourceRef: string;
  readonly acceptedAt: string;
}

export interface RelationshipMemoryCandidate {
  readonly candidateId: string;
  readonly content: string;
  readonly sourceRef: string;
  readonly status: RelationshipMemoryCandidateStatus;
  readonly createdAt: string;
  readonly reviewedAt?: string;
}

export interface UserCharacterRelationship {
  readonly relationshipId: string;
  readonly userId: string;
  readonly characterVersionId: string;
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
  | 'user-character-relationship';

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
  return {
    characterProjectId: requireIdentity(
      record['characterProjectId'],
      'CharacterProject characterProjectId',
    ),
    displayName: requireIdentity(record['displayName'], 'CharacterProject displayName'),
    draft: parseCharacterDefinition(record['draft']),
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
    definition: parseCharacterDefinition(record['definition']),
    acceptedEvidenceIds: requireUniqueStringArray(
      record['acceptedEvidenceIds'],
      'CharacterVersion acceptedEvidenceIds',
    ),
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
      'characterVersionId',
      'memories',
      'candidates',
      'createdAt',
      'updatedAt',
    ],
    'UserCharacterRelationship',
  );
  return {
    relationshipId: requireIdentity(
      record['relationshipId'],
      'UserCharacterRelationship relationshipId',
    ),
    userId: requireIdentity(record['userId'], 'UserCharacterRelationship userId'),
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'UserCharacterRelationship characterVersionId',
    ),
    memories: requireUniqueIdentities(
      requireArray(record['memories'], parseRelationshipMemory, 'Relationship memories'),
      (item) => item.memoryId,
      'Relationship memories',
    ),
    candidates: requireUniqueIdentities(
      requireArray(
        record['candidates'],
        parseRelationshipMemoryCandidate,
        'Relationship memory candidates',
      ),
      (item) => item.candidateId,
      'Relationship memory candidates',
    ),
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
      'canon',
      'knowledgeBoundary',
      'behaviorPolicy',
      'expressionPolicy',
      'representationRefs',
    ],
    'Character definition',
  );
  return {
    summary: requireString(record['summary'], 'Character definition summary'),
    canon: requireStringArray(record['canon'], 'Character canon'),
    knowledgeBoundary: requireStringArray(
      record['knowledgeBoundary'],
      'Character knowledgeBoundary',
    ),
    behaviorPolicy: requireStringArray(record['behaviorPolicy'], 'Character behaviorPolicy'),
    expressionPolicy: requireStringArray(record['expressionPolicy'], 'Character expressionPolicy'),
    representationRefs: requireUniqueIdentities(
      requireArray(
        record['representationRefs'],
        parseCharacterRepresentationRef,
        'Character representationRefs',
      ),
      (item) => item.representationId,
      'Character representationRefs',
    ),
  };
}

function parseCharacterEvidenceRef(value: unknown): CharacterEvidenceRef {
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

function parseCharacterRepresentationRef(value: unknown): CharacterRepresentationRef {
  const record = requireExactRecord(
    value,
    ['representationId', 'role', 'targetRef'],
    'Character representation reference',
  );
  const targetRef = requireIdentity(record['targetRef'], 'Character representation targetRef');
  if (!/^[a-z][a-z0-9+.-]*:[^\s]+$/u.test(targetRef) || /^file:/u.test(targetRef)) {
    throw new Error('Character representation targetRef must be an opaque non-file reference.');
  }
  return {
    representationId: requireIdentity(
      record['representationId'],
      'Character representation identity',
    ),
    role: requireIdentity(record['role'], 'Character representation role'),
    targetRef,
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
    [
      'kind',
      'relationshipId',
      'worldVersionId',
      'worldRunId',
      'worldSaveId',
      'branchId',
      'actorId',
    ],
    'Character runtime binding',
  );
  const kind = requireOneOf(record['kind'], CHARACTER_RUNTIME_KINDS, 'Character runtime kind');
  if (kind === 'companion') {
    requireAbsent(record, ['worldVersionId', 'worldRunId', 'worldSaveId', 'branchId', 'actorId']);
    return {
      kind,
      relationshipId: requireIdentity(
        record['relationshipId'],
        'Companion Character relationshipId',
      ),
    };
  }
  requireAbsent(record, ['relationshipId']);
  return {
    kind,
    worldVersionId: requireIdentity(record['worldVersionId'], 'Narrative WorldVersion identity'),
    worldRunId: requireIdentity(record['worldRunId'], 'Narrative WorldRun identity'),
    worldSaveId: requireIdentity(record['worldSaveId'], 'Narrative WorldSave identity'),
    branchId: requireIdentity(record['branchId'], 'Narrative World branch identity'),
    actorId: requireIdentity(record['actorId'], 'Narrative actor identity'),
  };
}

function parseRelationshipMemory(value: unknown): RelationshipMemory {
  const record = requireExactRecord(
    value,
    ['memoryId', 'content', 'sourceRef', 'acceptedAt'],
    'Relationship memory',
  );
  return {
    memoryId: requireIdentity(record['memoryId'], 'Relationship memory identity'),
    content: requireIdentity(record['content'], 'Relationship memory content'),
    sourceRef: requireIdentity(record['sourceRef'], 'Relationship memory sourceRef'),
    acceptedAt: requireIsoDate(record['acceptedAt'], 'Relationship memory acceptedAt'),
  };
}

function parseRelationshipMemoryCandidate(value: unknown): RelationshipMemoryCandidate {
  const record = requireExactRecord(
    value,
    ['candidateId', 'content', 'sourceRef', 'status', 'createdAt', 'reviewedAt'],
    'Relationship memory candidate',
  );
  const status = requireOneOf(
    record['status'],
    RELATIONSHIP_MEMORY_CANDIDATE_STATUSES,
    'Relationship memory candidate status',
  );
  const reviewedAt = optionalIdentity(record['reviewedAt'], 'Relationship candidate reviewedAt');
  if ((status === 'pending') !== (reviewedAt === undefined)) {
    throw new Error('Relationship memory candidate review state is inconsistent.');
  }
  return {
    candidateId: requireIdentity(record['candidateId'], 'Relationship candidate identity'),
    content: requireIdentity(record['content'], 'Relationship candidate content'),
    sourceRef: requireIdentity(record['sourceRef'], 'Relationship candidate sourceRef'),
    status,
    createdAt: requireIsoDate(record['createdAt'], 'Relationship candidate createdAt'),
    ...(reviewedAt === undefined
      ? {}
      : { reviewedAt: requireIsoDate(reviewedAt, 'Relationship candidate reviewedAt') }),
  };
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  return requireArray(value, (item) => requireString(item, label), label);
}

function requireUniqueStringArray(value: unknown, label: string): readonly string[] {
  return requireUniqueIdentities(requireStringArray(value, label), (item) => item, label);
}

function requireAbsent(record: Readonly<Record<string, unknown>>, keys: readonly string[]): void {
  const present = keys.filter((key) => record[key] !== undefined);
  if (present.length > 0) {
    throw new Error(
      `Character runtime binding contains fields owned by another runtime kind: ${present.join(', ')}.`,
    );
  }
}
