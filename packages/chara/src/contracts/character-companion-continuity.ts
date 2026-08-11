import {
  optionalIdentity,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireNonNegativeInteger,
  requireOneOf,
  requireUniqueIdentities,
} from './codec';

export const COMPANION_MEMORY_CANDIDATE_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export const COMPANION_MEMORY_ENTRY_STATUSES = ['active', 'corrected', 'deleted'] as const;

export type CompanionMemoryCandidateStatus = (typeof COMPANION_MEMORY_CANDIDATE_STATUSES)[number];
export type CompanionMemoryEntryStatus = (typeof COMPANION_MEMORY_ENTRY_STATUSES)[number];

export type CompanionMemoryProvenance =
  | {
      readonly kind: 'conversation-turn';
      readonly conversationId: string;
      readonly turnId: string;
    }
  | {
      readonly kind: 'room-event';
      readonly roomRunId: string;
      readonly roomEventId: string;
    };

export interface CompanionMemoryCompatibility {
  readonly requiredCanonFacts: readonly string[];
  readonly prohibitedKnowledgeBoundaries: readonly string[];
  readonly requiredBehaviorPolicies: readonly string[];
}

export interface CompanionMemoryCandidate {
  readonly companionMemoryCandidateId: string;
  readonly companionContinuityId: string;
  readonly sourceCharacterVersionId: string;
  readonly provenance: CompanionMemoryProvenance;
  readonly content: string;
  readonly compatibility: CompanionMemoryCompatibility;
  readonly sensitivityTraits: readonly string[];
  readonly retentionTraits: readonly string[];
  readonly expectedContinuityRevision: number;
  readonly status: CompanionMemoryCandidateStatus;
  readonly createdAt: string;
  readonly reviewedAt?: string;
  readonly acceptedMemoryEntryId?: string;
}

export interface CompanionMemoryEntry {
  readonly companionMemoryEntryId: string;
  readonly companionContinuityId: string;
  readonly sourceCandidateId: string;
  readonly sourceCharacterVersionId: string;
  readonly provenance: CompanionMemoryProvenance;
  readonly content: string;
  readonly compatibility: CompanionMemoryCompatibility;
  readonly sensitivityTraits: readonly string[];
  readonly retentionTraits: readonly string[];
  readonly status: CompanionMemoryEntryStatus;
  readonly acceptedAt: string;
  readonly correctedFromMemoryEntryId?: string;
  readonly correctedByMemoryEntryId?: string;
  readonly correctedAt?: string;
  readonly deletedAt?: string;
}

export interface CharacterCompanionContinuity {
  readonly companionContinuityId: string;
  readonly userId: string;
  readonly characterProjectId: string;
  readonly continuityRevision: number;
  readonly candidates: readonly CompanionMemoryCandidate[];
  readonly entries: readonly CompanionMemoryEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompanionContinuityProjectionDiagnostic {
  readonly code: 'companion-memory-incompatible';
  readonly companionMemoryEntryId: string;
  readonly reasons: readonly string[];
}

export interface CompanionContinuityProjection {
  readonly companionContinuityId: string;
  readonly characterVersionId: string;
  readonly eligibleEntries: readonly CompanionMemoryEntry[];
  readonly diagnostics: readonly CompanionContinuityProjectionDiagnostic[];
}

export function parseCharacterCompanionContinuity(value: unknown): CharacterCompanionContinuity {
  const record = requireExactRecord(
    value,
    [
      'companionContinuityId',
      'userId',
      'characterProjectId',
      'continuityRevision',
      'candidates',
      'entries',
      'createdAt',
      'updatedAt',
    ],
    'CharacterCompanionContinuity',
  );
  const companionContinuityId = requireIdentity(
    record['companionContinuityId'],
    'CharacterCompanionContinuity identity',
  );
  const continuityRevision = requireNonNegativeInteger(
    record['continuityRevision'],
    'CharacterCompanionContinuity revision',
  );
  const candidates = requireUniqueIdentities(
    requireArray(
      record['candidates'],
      parseCompanionMemoryCandidate,
      'Companion memory candidates',
    ),
    (candidate) => candidate.companionMemoryCandidateId,
    'Companion memory candidates',
  );
  const entries = requireUniqueIdentities(
    requireArray(record['entries'], parseCompanionMemoryEntry, 'Companion memory entries'),
    (entry) => entry.companionMemoryEntryId,
    'Companion memory entries',
  );
  if (
    candidates.some((candidate) => candidate.companionContinuityId !== companionContinuityId) ||
    entries.some((entry) => entry.companionContinuityId !== companionContinuityId)
  ) {
    throw new Error('Companion memory records must bind the exact continuity identity.');
  }
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.companionMemoryCandidateId, candidate]),
  );
  const entriesById = new Map(entries.map((entry) => [entry.companionMemoryEntryId, entry]));
  for (const candidate of candidates) {
    if (candidate.expectedContinuityRevision > continuityRevision) {
      throw new Error(
        `Companion memory candidate '${candidate.companionMemoryCandidateId}' expects a future revision.`,
      );
    }
    const acceptedEntry =
      candidate.acceptedMemoryEntryId === undefined
        ? undefined
        : entriesById.get(candidate.acceptedMemoryEntryId);
    if (
      candidate.status === 'accepted' &&
      (!acceptedEntry || acceptedEntry.sourceCandidateId !== candidate.companionMemoryCandidateId)
    ) {
      throw new Error(
        `Accepted Companion memory candidate '${candidate.companionMemoryCandidateId}' has no owned entry.`,
      );
    }
  }
  for (const entry of entries) {
    if (!candidatesById.has(entry.sourceCandidateId)) {
      throw new Error(
        `Companion memory entry '${entry.companionMemoryEntryId}' references an unknown candidate.`,
      );
    }
    if (
      entry.correctedFromMemoryEntryId !== undefined &&
      !entriesById.has(entry.correctedFromMemoryEntryId)
    ) {
      throw new Error(
        `Companion memory entry '${entry.companionMemoryEntryId}' references an unknown correction source.`,
      );
    }
    if (
      entry.correctedByMemoryEntryId !== undefined &&
      !entriesById.has(entry.correctedByMemoryEntryId)
    ) {
      throw new Error(
        `Companion memory entry '${entry.companionMemoryEntryId}' references an unknown replacement.`,
      );
    }
  }
  return {
    companionContinuityId,
    userId: requireIdentity(record['userId'], 'CharacterCompanionContinuity user identity'),
    characterProjectId: requireIdentity(
      record['characterProjectId'],
      'CharacterCompanionContinuity CharacterProject identity',
    ),
    continuityRevision,
    candidates,
    entries,
    createdAt: requireIsoDate(record['createdAt'], 'CharacterCompanionContinuity createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'CharacterCompanionContinuity updatedAt'),
  };
}

export function parseCompanionMemoryCandidate(value: unknown): CompanionMemoryCandidate {
  const record = requireExactRecord(
    value,
    [
      'companionMemoryCandidateId',
      'companionContinuityId',
      'sourceCharacterVersionId',
      'provenance',
      'content',
      'compatibility',
      'sensitivityTraits',
      'retentionTraits',
      'expectedContinuityRevision',
      'status',
      'createdAt',
      'reviewedAt',
      'acceptedMemoryEntryId',
    ],
    'Companion memory candidate',
  );
  const status = requireOneOf(
    record['status'],
    COMPANION_MEMORY_CANDIDATE_STATUSES,
    'Companion memory candidate status',
  );
  const reviewedAt = optionalIdentity(record['reviewedAt'], 'Companion memory reviewedAt');
  const acceptedMemoryEntryId = optionalIdentity(
    record['acceptedMemoryEntryId'],
    'Companion accepted memory entry',
  );
  assertCandidateReviewState(status, reviewedAt, acceptedMemoryEntryId);
  return {
    companionMemoryCandidateId: requireIdentity(
      record['companionMemoryCandidateId'],
      'Companion memory candidate identity',
    ),
    companionContinuityId: requireIdentity(
      record['companionContinuityId'],
      'Companion memory continuity identity',
    ),
    sourceCharacterVersionId: requireIdentity(
      record['sourceCharacterVersionId'],
      'Companion memory source CharacterVersion identity',
    ),
    provenance: parseCompanionMemoryProvenance(record['provenance']),
    content: requireIdentity(record['content'], 'Companion memory candidate content'),
    compatibility: parseCompanionMemoryCompatibility(record['compatibility']),
    sensitivityTraits: requireStringSet(
      record['sensitivityTraits'],
      'Companion sensitivity traits',
    ),
    retentionTraits: requireStringSet(record['retentionTraits'], 'Companion retention traits'),
    expectedContinuityRevision: requireNonNegativeInteger(
      record['expectedContinuityRevision'],
      'Companion memory expected continuity revision',
    ),
    status,
    createdAt: requireIsoDate(record['createdAt'], 'Companion memory candidate createdAt'),
    ...(reviewedAt === undefined
      ? {}
      : { reviewedAt: requireIsoDate(reviewedAt, 'Companion memory candidate reviewedAt') }),
    ...(acceptedMemoryEntryId === undefined ? {} : { acceptedMemoryEntryId }),
  };
}

export function parseCompanionMemoryEntry(value: unknown): CompanionMemoryEntry {
  const record = requireExactRecord(
    value,
    [
      'companionMemoryEntryId',
      'companionContinuityId',
      'sourceCandidateId',
      'sourceCharacterVersionId',
      'provenance',
      'content',
      'compatibility',
      'sensitivityTraits',
      'retentionTraits',
      'status',
      'acceptedAt',
      'correctedFromMemoryEntryId',
      'correctedByMemoryEntryId',
      'correctedAt',
      'deletedAt',
    ],
    'Companion memory entry',
  );
  const status = requireOneOf(
    record['status'],
    COMPANION_MEMORY_ENTRY_STATUSES,
    'Companion memory entry status',
  );
  const correctedFromMemoryEntryId = optionalIdentity(
    record['correctedFromMemoryEntryId'],
    'Companion memory correction source',
  );
  const correctedByMemoryEntryId = optionalIdentity(
    record['correctedByMemoryEntryId'],
    'Companion memory correction target',
  );
  const correctedAt = optionalIdentity(record['correctedAt'], 'Companion memory correctedAt');
  const deletedAt = optionalIdentity(record['deletedAt'], 'Companion memory deletedAt');
  assertEntryLifecycle(status, correctedByMemoryEntryId, correctedAt, deletedAt);
  return {
    companionMemoryEntryId: requireIdentity(
      record['companionMemoryEntryId'],
      'Companion memory entry identity',
    ),
    companionContinuityId: requireIdentity(
      record['companionContinuityId'],
      'Companion memory entry continuity identity',
    ),
    sourceCandidateId: requireIdentity(
      record['sourceCandidateId'],
      'Companion memory source candidate identity',
    ),
    sourceCharacterVersionId: requireIdentity(
      record['sourceCharacterVersionId'],
      'Companion memory entry source CharacterVersion identity',
    ),
    provenance: parseCompanionMemoryProvenance(record['provenance']),
    content: requireIdentity(record['content'], 'Companion memory entry content'),
    compatibility: parseCompanionMemoryCompatibility(record['compatibility']),
    sensitivityTraits: requireStringSet(
      record['sensitivityTraits'],
      'Companion sensitivity traits',
    ),
    retentionTraits: requireStringSet(record['retentionTraits'], 'Companion retention traits'),
    status,
    acceptedAt: requireIsoDate(record['acceptedAt'], 'Companion memory entry acceptedAt'),
    ...(correctedFromMemoryEntryId === undefined ? {} : { correctedFromMemoryEntryId }),
    ...(correctedByMemoryEntryId === undefined ? {} : { correctedByMemoryEntryId }),
    ...(correctedAt === undefined
      ? {}
      : { correctedAt: requireIsoDate(correctedAt, 'Companion memory entry correctedAt') }),
    ...(deletedAt === undefined
      ? {}
      : { deletedAt: requireIsoDate(deletedAt, 'Companion memory entry deletedAt') }),
  };
}

export function parseCompanionMemoryProvenance(value: unknown): CompanionMemoryProvenance {
  const record = requireExactRecord(
    value,
    ['kind', 'conversationId', 'turnId', 'roomRunId', 'roomEventId'],
    'Companion memory provenance',
  );
  const kind = requireOneOf(
    record['kind'],
    ['conversation-turn', 'room-event'] as const,
    'Companion memory provenance kind',
  );
  if (kind === 'conversation-turn') {
    if (record['roomRunId'] !== undefined || record['roomEventId'] !== undefined) {
      throw new Error('Conversation-turn provenance cannot carry RoomEvent identity.');
    }
    return {
      kind,
      conversationId: requireIdentity(
        record['conversationId'],
        'Companion memory Conversation identity',
      ),
      turnId: requireIdentity(record['turnId'], 'Companion memory Turn identity'),
    };
  }
  if (record['conversationId'] !== undefined || record['turnId'] !== undefined) {
    throw new Error('Room-event provenance cannot carry Conversation Turn identity.');
  }
  return {
    kind,
    roomRunId: requireIdentity(record['roomRunId'], 'Companion memory RoomRun identity'),
    roomEventId: requireIdentity(record['roomEventId'], 'Companion memory RoomEvent identity'),
  };
}

export function parseCompanionMemoryCompatibility(value: unknown): CompanionMemoryCompatibility {
  const record = requireExactRecord(
    value,
    ['requiredCanonFacts', 'prohibitedKnowledgeBoundaries', 'requiredBehaviorPolicies'],
    'Companion memory compatibility',
  );
  return {
    requiredCanonFacts: requireStringSet(
      record['requiredCanonFacts'],
      'Companion required canon facts',
    ),
    prohibitedKnowledgeBoundaries: requireStringSet(
      record['prohibitedKnowledgeBoundaries'],
      'Companion prohibited knowledge boundaries',
    ),
    requiredBehaviorPolicies: requireStringSet(
      record['requiredBehaviorPolicies'],
      'Companion required behavior policies',
    ),
  };
}

function assertCandidateReviewState(
  status: CompanionMemoryCandidateStatus,
  reviewedAt: string | undefined,
  acceptedMemoryEntryId: string | undefined,
): void {
  if (status === 'pending' && (reviewedAt !== undefined || acceptedMemoryEntryId !== undefined)) {
    throw new Error('Pending Companion memory candidate cannot carry review results.');
  }
  if (status === 'accepted' && (reviewedAt === undefined || acceptedMemoryEntryId === undefined)) {
    throw new Error('Accepted Companion memory candidate requires review and entry identities.');
  }
  if (status === 'rejected' && (reviewedAt === undefined || acceptedMemoryEntryId !== undefined)) {
    throw new Error('Rejected Companion memory candidate requires reviewedAt only.');
  }
}

function assertEntryLifecycle(
  status: CompanionMemoryEntryStatus,
  correctedByMemoryEntryId: string | undefined,
  correctedAt: string | undefined,
  deletedAt: string | undefined,
): void {
  if (
    status === 'active' &&
    (correctedByMemoryEntryId !== undefined || correctedAt !== undefined || deletedAt !== undefined)
  ) {
    throw new Error('Active Companion memory entry cannot carry correction or deletion state.');
  }
  if (
    status === 'corrected' &&
    (correctedByMemoryEntryId === undefined || correctedAt === undefined || deletedAt !== undefined)
  ) {
    throw new Error('Corrected Companion memory entry requires its replacement and correctedAt.');
  }
  if (
    status === 'deleted' &&
    (deletedAt === undefined || correctedByMemoryEntryId !== undefined || correctedAt !== undefined)
  ) {
    throw new Error('Deleted Companion memory entry requires deletedAt only.');
  }
}

function requireStringSet(value: unknown, label: string): readonly string[] {
  return requireUniqueIdentities(
    requireArray(value, (item) => requireIdentity(item, label), label),
    (item) => item,
    label,
  );
}
