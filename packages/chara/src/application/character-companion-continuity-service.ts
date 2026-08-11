import {
  parseCharacterCompanionContinuity,
  parseCompanionMemoryCandidate,
  type CharacterCompanionContinuity,
  type CharacterVersion,
  type CompanionContinuityProjection,
  type CompanionMemoryCandidate,
  type CompanionMemoryCompatibility,
  type CompanionMemoryEntry,
  type CompanionMemoryProvenance,
} from '@neko/chara/contracts';

export interface CharacterCompanionContinuityRepository {
  createCompanionContinuity(
    continuity: CharacterCompanionContinuity,
    signal?: AbortSignal,
  ): Promise<void>;
  readCompanionContinuity(
    companionContinuityId: string,
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity | undefined>;
  readCompanionContinuityByOwner(
    userId: string,
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity | undefined>;
  mutateCompanionContinuity(
    companionContinuityId: string,
    expectedContinuityRevision: number,
    mutation: (current: CharacterCompanionContinuity) => CharacterCompanionContinuity,
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity>;
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
}

export type CharacterCompanionContinuityDiagnosticCode =
  | 'companion-continuity-already-exists'
  | 'companion-continuity-unavailable'
  | 'companion-continuity-owner-mismatch'
  | 'companion-continuity-revision-stale'
  | 'companion-memory-candidate-already-exists'
  | 'companion-memory-candidate-unavailable'
  | 'companion-memory-entry-already-exists'
  | 'companion-memory-entry-unavailable'
  | 'companion-memory-source-version-unavailable'
  | 'companion-memory-source-version-mismatch';

export class CharacterCompanionContinuityError extends Error {
  constructor(
    readonly code: CharacterCompanionContinuityDiagnosticCode,
    message: string,
    readonly recordId?: string,
  ) {
    super(message);
    this.name = 'CharacterCompanionContinuityError';
  }
}

export class CharacterCompanionContinuityService {
  private readonly now: () => string;

  constructor(
    private readonly repository: CharacterCompanionContinuityRepository,
    options: { readonly now?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async create(
    input: {
      readonly companionContinuityId: string;
      readonly userId: string;
      readonly characterProjectId: string;
    },
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity> {
    const existing = await this.repository.readCompanionContinuityByOwner(
      input.userId,
      input.characterProjectId,
      signal,
    );
    if (existing) {
      throw continuityError(
        'companion-continuity-already-exists',
        `Companion continuity already exists for user '${input.userId}' and CharacterProject '${input.characterProjectId}'.`,
        existing.companionContinuityId,
      );
    }
    const timestamp = this.now();
    const continuity = parseCharacterCompanionContinuity({
      ...input,
      continuityRevision: 0,
      candidates: [],
      entries: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.repository.createCompanionContinuity(continuity, signal);
    return structuredClone(continuity);
  }

  async propose(
    input: {
      readonly companionContinuityId: string;
      readonly companionMemoryCandidateId: string;
      readonly sourceCharacterVersionId: string;
      readonly provenance: CompanionMemoryProvenance;
      readonly content: string;
      readonly compatibility: CompanionMemoryCompatibility;
      readonly sensitivityTraits: readonly string[];
      readonly retentionTraits: readonly string[];
      readonly expectedContinuityRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity> {
    const continuity = await this.requireContinuity(input.companionContinuityId, signal);
    await this.requireSourcePublication(continuity, input.sourceCharacterVersionId, signal);
    return this.mutate(
      input.companionContinuityId,
      input.expectedContinuityRevision,
      (current) => {
        if (
          current.candidates.some(
            (candidate) =>
              candidate.companionMemoryCandidateId === input.companionMemoryCandidateId,
          )
        ) {
          throw continuityError(
            'companion-memory-candidate-already-exists',
            `Companion memory candidate '${input.companionMemoryCandidateId}' already exists.`,
            input.companionMemoryCandidateId,
          );
        }
        const candidate = parseCompanionMemoryCandidate({
          ...input,
          status: 'pending',
          createdAt: this.now(),
        });
        return advance(current, { candidates: [...current.candidates, candidate] }, this.now());
      },
      signal,
    );
  }

  async accept(
    input: {
      readonly companionContinuityId: string;
      readonly companionMemoryCandidateId: string;
      readonly companionMemoryEntryId: string;
      readonly expectedContinuityRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity> {
    return this.mutate(
      input.companionContinuityId,
      input.expectedContinuityRevision,
      (continuity) => {
        const candidate = requirePendingCandidate(continuity, input.companionMemoryCandidateId);
        requireNewEntry(continuity, input.companionMemoryEntryId);
        const acceptedAt = this.now();
        const entry: CompanionMemoryEntry = {
          companionMemoryEntryId: input.companionMemoryEntryId,
          companionContinuityId: continuity.companionContinuityId,
          sourceCandidateId: candidate.companionMemoryCandidateId,
          sourceCharacterVersionId: candidate.sourceCharacterVersionId,
          provenance: candidate.provenance,
          content: candidate.content,
          compatibility: candidate.compatibility,
          sensitivityTraits: candidate.sensitivityTraits,
          retentionTraits: candidate.retentionTraits,
          status: 'active',
          acceptedAt,
        };
        return advance(
          continuity,
          {
            candidates: continuity.candidates.map((item) =>
              item.companionMemoryCandidateId === candidate.companionMemoryCandidateId
                ? {
                    ...item,
                    status: 'accepted',
                    reviewedAt: acceptedAt,
                    acceptedMemoryEntryId: entry.companionMemoryEntryId,
                  }
                : item,
            ),
            entries: [...continuity.entries, entry],
          },
          acceptedAt,
        );
      },
      signal,
    );
  }

  async reject(
    input: {
      readonly companionContinuityId: string;
      readonly companionMemoryCandidateId: string;
      readonly expectedContinuityRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity> {
    return this.mutate(
      input.companionContinuityId,
      input.expectedContinuityRevision,
      (continuity) => {
        const candidate = requirePendingCandidate(continuity, input.companionMemoryCandidateId);
        const reviewedAt = this.now();
        return advance(
          continuity,
          {
            candidates: continuity.candidates.map((item) =>
              item.companionMemoryCandidateId === candidate.companionMemoryCandidateId
                ? { ...item, status: 'rejected', reviewedAt }
                : item,
            ),
          },
          reviewedAt,
        );
      },
      signal,
    );
  }

  async correct(
    input: {
      readonly companionContinuityId: string;
      readonly companionMemoryCandidateId: string;
      readonly correctedMemoryEntryId: string;
      readonly replacementMemoryEntryId: string;
      readonly expectedContinuityRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity> {
    return this.mutate(
      input.companionContinuityId,
      input.expectedContinuityRevision,
      (continuity) => {
        const candidate = requirePendingCandidate(continuity, input.companionMemoryCandidateId);
        const corrected = requireActiveEntry(continuity, input.correctedMemoryEntryId);
        requireNewEntry(continuity, input.replacementMemoryEntryId);
        const correctedAt = this.now();
        const replacement: CompanionMemoryEntry = {
          companionMemoryEntryId: input.replacementMemoryEntryId,
          companionContinuityId: continuity.companionContinuityId,
          sourceCandidateId: candidate.companionMemoryCandidateId,
          sourceCharacterVersionId: candidate.sourceCharacterVersionId,
          provenance: candidate.provenance,
          content: candidate.content,
          compatibility: candidate.compatibility,
          sensitivityTraits: candidate.sensitivityTraits,
          retentionTraits: candidate.retentionTraits,
          status: 'active',
          acceptedAt: correctedAt,
          correctedFromMemoryEntryId: corrected.companionMemoryEntryId,
        };
        return advance(
          continuity,
          {
            candidates: continuity.candidates.map((item) =>
              item.companionMemoryCandidateId === candidate.companionMemoryCandidateId
                ? {
                    ...item,
                    status: 'accepted',
                    reviewedAt: correctedAt,
                    acceptedMemoryEntryId: replacement.companionMemoryEntryId,
                  }
                : item,
            ),
            entries: [
              ...continuity.entries.map((entry) =>
                entry.companionMemoryEntryId === corrected.companionMemoryEntryId
                  ? {
                      ...entry,
                      status: 'corrected' as const,
                      correctedByMemoryEntryId: replacement.companionMemoryEntryId,
                      correctedAt,
                    }
                  : entry,
              ),
              replacement,
            ],
          },
          correctedAt,
        );
      },
      signal,
    );
  }

  async delete(
    input: {
      readonly companionContinuityId: string;
      readonly companionMemoryEntryId: string;
      readonly expectedContinuityRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity> {
    return this.mutate(
      input.companionContinuityId,
      input.expectedContinuityRevision,
      (continuity) => {
        const entry = requireActiveEntry(continuity, input.companionMemoryEntryId);
        const deletedAt = this.now();
        return advance(
          continuity,
          {
            entries: continuity.entries.map((item) =>
              item.companionMemoryEntryId === entry.companionMemoryEntryId
                ? { ...item, status: 'deleted', deletedAt }
                : item,
            ),
          },
          deletedAt,
        );
      },
      signal,
    );
  }

  async project(
    input: { readonly companionContinuityId: string; readonly characterVersionId: string },
    signal?: AbortSignal,
  ): Promise<CompanionContinuityProjection> {
    const continuity = await this.requireContinuity(input.companionContinuityId, signal);
    const publication = await this.requireSourcePublication(
      continuity,
      input.characterVersionId,
      signal,
    );
    return projectCompanionContinuity(continuity, publication);
  }

  private async requireContinuity(
    companionContinuityId: string,
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity> {
    const continuity = await this.repository.readCompanionContinuity(companionContinuityId, signal);
    if (!continuity) {
      throw continuityError(
        'companion-continuity-unavailable',
        `CharacterCompanionContinuity '${companionContinuityId}' is unavailable.`,
        companionContinuityId,
      );
    }
    return parseCharacterCompanionContinuity(continuity);
  }

  private async requireSourcePublication(
    continuity: CharacterCompanionContinuity,
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion> {
    const publication = await this.repository.readPublication(characterVersionId, signal);
    if (!publication) {
      throw continuityError(
        'companion-memory-source-version-unavailable',
        `CharacterVersion '${characterVersionId}' is unavailable.`,
        characterVersionId,
      );
    }
    if (publication.characterProjectId !== continuity.characterProjectId) {
      throw continuityError(
        'companion-memory-source-version-mismatch',
        `CharacterVersion '${characterVersionId}' belongs to another CharacterProject.`,
        characterVersionId,
      );
    }
    return publication;
  }

  private async mutate(
    companionContinuityId: string,
    expectedContinuityRevision: number,
    mutation: (continuity: CharacterCompanionContinuity) => CharacterCompanionContinuity,
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity> {
    const current = await this.requireContinuity(companionContinuityId, signal);
    if (current.continuityRevision !== expectedContinuityRevision) {
      throw continuityError(
        'companion-continuity-revision-stale',
        `CharacterCompanionContinuity '${companionContinuityId}' is not at expected revision ${String(expectedContinuityRevision)}.`,
        companionContinuityId,
      );
    }
    return this.repository.mutateCompanionContinuity(
      companionContinuityId,
      expectedContinuityRevision,
      (stored) => parseCharacterCompanionContinuity(mutation(stored)),
      signal,
    );
  }
}

export function projectCompanionContinuity(
  continuityValue: CharacterCompanionContinuity,
  publication: CharacterVersion,
): CompanionContinuityProjection {
  const continuity = parseCharacterCompanionContinuity(continuityValue);
  if (publication.characterProjectId !== continuity.characterProjectId) {
    throw continuityError(
      'companion-memory-source-version-mismatch',
      `CharacterVersion '${publication.characterVersionId}' belongs to another CharacterProject.`,
      publication.characterVersionId,
    );
  }
  const eligibleEntries: CompanionMemoryEntry[] = [];
  const diagnostics: CompanionContinuityProjection['diagnostics'][number][] = [];
  for (const entry of continuity.entries) {
    if (entry.status !== 'active') continue;
    const reasons = compatibilityReasons(entry.compatibility, publication);
    if (reasons.length === 0) eligibleEntries.push(structuredClone(entry));
    else {
      diagnostics.push({
        code: 'companion-memory-incompatible',
        companionMemoryEntryId: entry.companionMemoryEntryId,
        reasons,
      });
    }
  }
  return {
    companionContinuityId: continuity.companionContinuityId,
    characterVersionId: publication.characterVersionId,
    eligibleEntries,
    diagnostics,
  };
}

function advance(
  continuity: CharacterCompanionContinuity,
  change: {
    readonly candidates?: readonly CompanionMemoryCandidate[];
    readonly entries?: readonly CompanionMemoryEntry[];
  },
  updatedAt: string,
): CharacterCompanionContinuity {
  return parseCharacterCompanionContinuity({
    ...continuity,
    ...(change.candidates === undefined ? {} : { candidates: change.candidates }),
    ...(change.entries === undefined ? {} : { entries: change.entries }),
    continuityRevision: continuity.continuityRevision + 1,
    updatedAt,
  });
}

function requirePendingCandidate(
  continuity: CharacterCompanionContinuity,
  companionMemoryCandidateId: string,
): CompanionMemoryCandidate {
  const candidate = continuity.candidates.find(
    (item) => item.companionMemoryCandidateId === companionMemoryCandidateId,
  );
  if (!candidate || candidate.status !== 'pending') {
    throw continuityError(
      'companion-memory-candidate-unavailable',
      `Pending Companion memory candidate '${companionMemoryCandidateId}' is unavailable.`,
      companionMemoryCandidateId,
    );
  }
  return candidate;
}

function requireActiveEntry(
  continuity: CharacterCompanionContinuity,
  companionMemoryEntryId: string,
): CompanionMemoryEntry {
  const entry = continuity.entries.find(
    (item) => item.companionMemoryEntryId === companionMemoryEntryId,
  );
  if (!entry || entry.status !== 'active') {
    throw continuityError(
      'companion-memory-entry-unavailable',
      `Active Companion memory entry '${companionMemoryEntryId}' is unavailable.`,
      companionMemoryEntryId,
    );
  }
  return entry;
}

function requireNewEntry(
  continuity: CharacterCompanionContinuity,
  companionMemoryEntryId: string,
): void {
  if (continuity.entries.some((entry) => entry.companionMemoryEntryId === companionMemoryEntryId)) {
    throw continuityError(
      'companion-memory-entry-already-exists',
      `Companion memory entry '${companionMemoryEntryId}' already exists.`,
      companionMemoryEntryId,
    );
  }
}

function compatibilityReasons(
  compatibility: CompanionMemoryCompatibility,
  publication: CharacterVersion,
): readonly string[] {
  const canon = new Set(publication.definition.canon);
  const knowledgeBoundary = new Set(publication.definition.knowledgeBoundary);
  const behaviorPolicy = new Set(publication.definition.behaviorPolicy);
  return [
    ...compatibility.requiredCanonFacts
      .filter((fact) => !canon.has(fact))
      .map((fact) => `Required canon fact is absent: ${fact}`),
    ...compatibility.prohibitedKnowledgeBoundaries
      .filter((boundary) => knowledgeBoundary.has(boundary))
      .map((boundary) => `Knowledge boundary prohibits this memory: ${boundary}`),
    ...compatibility.requiredBehaviorPolicies
      .filter((policy) => !behaviorPolicy.has(policy))
      .map((policy) => `Required behavior policy is absent: ${policy}`),
  ];
}

function continuityError(
  code: CharacterCompanionContinuityDiagnosticCode,
  message: string,
  recordId?: string,
): CharacterCompanionContinuityError {
  return new CharacterCompanionContinuityError(code, message, recordId);
}
