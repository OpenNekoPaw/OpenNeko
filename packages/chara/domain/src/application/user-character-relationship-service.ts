import {
  parseUserCharacterRelationship,
  type CharacterVersion,
  type CompanionMemoryProvenance,
  type RelationshipMemory,
  type RelationshipMemoryCandidate,
  type UserCharacterRelationship,
} from '@neko/chara-domain/contracts';

export interface UserCharacterRelationshipRepository {
  create(relationship: UserCharacterRelationship, signal?: AbortSignal): Promise<void>;
  read(
    relationshipId: string,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship | undefined>;
  readByOwner(
    userId: string,
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship | undefined>;
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
  mutate(
    relationshipId: string,
    expectedRelationshipRevision: number,
    mutation: (current: UserCharacterRelationship) => UserCharacterRelationship,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship>;
}

export type UserCharacterRelationshipDiagnosticCode =
  | 'relationship-already-exists'
  | 'relationship-unavailable'
  | 'relationship-revision-stale'
  | 'relationship-source-version-unavailable'
  | 'relationship-source-version-mismatch'
  | 'relationship-candidate-already-exists'
  | 'relationship-candidate-unavailable'
  | 'relationship-memory-unavailable'
  | 'relationship-memory-already-exists';

export class UserCharacterRelationshipError extends Error {
  constructor(
    readonly code: UserCharacterRelationshipDiagnosticCode,
    message: string,
    readonly relationshipId?: string,
  ) {
    super(message);
    this.name = 'UserCharacterRelationshipError';
  }
}

export class UserCharacterRelationshipService {
  private readonly now: () => string;

  constructor(
    private readonly repository: UserCharacterRelationshipRepository,
    options: { readonly now?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async create(
    input: {
      readonly relationshipId: string;
      readonly userId: string;
      readonly characterProjectId: string;
    },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    const existing = await this.repository.readByOwner(
      input.userId,
      input.characterProjectId,
      signal,
    );
    if (existing) {
      throw relationshipError(
        'relationship-already-exists',
        `Relationship already exists for user '${input.userId}' and CharacterProject '${input.characterProjectId}'.`,
        existing.relationshipId,
      );
    }
    const timestamp = this.now();
    const relationship = parseUserCharacterRelationship({
      ...input,
      relationshipRevision: 0,
      memories: [],
      candidates: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.repository.create(relationship, signal);
    return structuredClone(relationship);
  }

  async propose(
    input: {
      readonly relationshipId: string;
      readonly candidateId: string;
      readonly sourceCharacterVersionId: string;
      readonly provenance: CompanionMemoryProvenance;
      readonly content: string;
      readonly expectedRelationshipRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    const relationship = await this.requireRelationship(input.relationshipId, signal);
    await this.requireSourcePublication(relationship, input.sourceCharacterVersionId, signal);
    return this.update(
      input.relationshipId,
      input.expectedRelationshipRevision,
      (current) => {
        if (current.candidates.some((item) => item.candidateId === input.candidateId)) {
          throw relationshipError(
            'relationship-candidate-already-exists',
            `Relationship candidate '${input.candidateId}' already exists.`,
            input.relationshipId,
          );
        }
        const candidate: RelationshipMemoryCandidate = {
          candidateId: input.candidateId,
          relationshipId: current.relationshipId,
          sourceCharacterVersionId: input.sourceCharacterVersionId,
          provenance: input.provenance,
          content: input.content,
          expectedRelationshipRevision: input.expectedRelationshipRevision,
          status: 'pending',
          createdAt: this.now(),
        };
        return advance(current, { candidates: [...current.candidates, candidate] }, this.now());
      },
      signal,
    );
  }

  async accept(
    input: {
      readonly relationshipId: string;
      readonly candidateId: string;
      readonly memoryId: string;
      readonly expectedRelationshipRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    return this.update(
      input.relationshipId,
      input.expectedRelationshipRevision,
      (relationship) => {
        const candidate = requirePendingCandidate(relationship, input.candidateId);
        requireNewMemory(relationship, input.memoryId);
        const acceptedAt = this.now();
        const memory: RelationshipMemory = {
          memoryId: input.memoryId,
          sourceCandidateId: candidate.candidateId,
          sourceCharacterVersionId: candidate.sourceCharacterVersionId,
          provenance: candidate.provenance,
          content: candidate.content,
          status: 'active',
          acceptedAt,
        };
        return advance(
          relationship,
          {
            memories: [...relationship.memories, memory],
            candidates: relationship.candidates.map((item) =>
              item.candidateId === input.candidateId
                ? {
                    ...item,
                    status: 'accepted',
                    reviewedAt: acceptedAt,
                    acceptedMemoryId: memory.memoryId,
                  }
                : item,
            ),
          },
          acceptedAt,
        );
      },
      signal,
    );
  }

  async reject(
    input: {
      readonly relationshipId: string;
      readonly candidateId: string;
      readonly expectedRelationshipRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    return this.update(
      input.relationshipId,
      input.expectedRelationshipRevision,
      (relationship) => {
        requirePendingCandidate(relationship, input.candidateId);
        const reviewedAt = this.now();
        return advance(
          relationship,
          {
            candidates: relationship.candidates.map((item) =>
              item.candidateId === input.candidateId
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

  async correctMemory(
    input: {
      readonly relationshipId: string;
      readonly candidateId: string;
      readonly correctedMemoryId: string;
      readonly replacementMemoryId: string;
      readonly expectedRelationshipRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    return this.update(
      input.relationshipId,
      input.expectedRelationshipRevision,
      (relationship) => {
        const candidate = requirePendingCandidate(relationship, input.candidateId);
        const corrected = requireActiveMemory(relationship, input.correctedMemoryId);
        requireNewMemory(relationship, input.replacementMemoryId);
        const correctedAt = this.now();
        const replacement: RelationshipMemory = {
          memoryId: input.replacementMemoryId,
          sourceCandidateId: candidate.candidateId,
          sourceCharacterVersionId: candidate.sourceCharacterVersionId,
          provenance: candidate.provenance,
          content: candidate.content,
          status: 'active',
          acceptedAt: correctedAt,
          correctedFromMemoryId: corrected.memoryId,
        };
        return advance(
          relationship,
          {
            memories: [
              ...relationship.memories.map((memory) =>
                memory.memoryId === corrected.memoryId
                  ? {
                      ...memory,
                      status: 'corrected' as const,
                      correctedByMemoryId: replacement.memoryId,
                      correctedAt,
                    }
                  : memory,
              ),
              replacement,
            ],
            candidates: relationship.candidates.map((item) =>
              item.candidateId === candidate.candidateId
                ? {
                    ...item,
                    status: 'accepted',
                    reviewedAt: correctedAt,
                    acceptedMemoryId: replacement.memoryId,
                  }
                : item,
            ),
          },
          correctedAt,
        );
      },
      signal,
    );
  }

  async deleteMemory(
    input: {
      readonly relationshipId: string;
      readonly memoryId: string;
      readonly expectedRelationshipRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    return this.update(
      input.relationshipId,
      input.expectedRelationshipRevision,
      (relationship) => {
        const memory = requireActiveMemory(relationship, input.memoryId);
        const deletedAt = this.now();
        return advance(
          relationship,
          {
            memories: relationship.memories.map((item) =>
              item.memoryId === memory.memoryId ? { ...item, status: 'deleted', deletedAt } : item,
            ),
          },
          deletedAt,
        );
      },
      signal,
    );
  }

  private async requireRelationship(
    relationshipId: string,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    const relationship = await this.repository.read(relationshipId, signal);
    if (!relationship) {
      throw relationshipError(
        'relationship-unavailable',
        `UserCharacterRelationship '${relationshipId}' is unavailable.`,
        relationshipId,
      );
    }
    return parseUserCharacterRelationship(relationship);
  }

  private async requireSourcePublication(
    relationship: UserCharacterRelationship,
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion> {
    const publication = await this.repository.readPublication(characterVersionId, signal);
    if (!publication) {
      throw relationshipError(
        'relationship-source-version-unavailable',
        `CharacterVersion '${characterVersionId}' is unavailable.`,
        relationship.relationshipId,
      );
    }
    if (publication.characterProjectId !== relationship.characterProjectId) {
      throw relationshipError(
        'relationship-source-version-mismatch',
        `CharacterVersion '${characterVersionId}' belongs to another CharacterProject.`,
        relationship.relationshipId,
      );
    }
    return publication;
  }

  private async update(
    relationshipId: string,
    expectedRelationshipRevision: number,
    mutation: (current: UserCharacterRelationship) => UserCharacterRelationship,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    const current = await this.requireRelationship(relationshipId, signal);
    if (current.relationshipRevision !== expectedRelationshipRevision) {
      throw relationshipError(
        'relationship-revision-stale',
        `UserCharacterRelationship '${relationshipId}' is not at expected revision ${String(expectedRelationshipRevision)}.`,
        relationshipId,
      );
    }
    return this.repository.mutate(
      relationshipId,
      expectedRelationshipRevision,
      (stored) => parseUserCharacterRelationship(mutation(stored)),
      signal,
    );
  }
}

function advance(
  relationship: UserCharacterRelationship,
  change: {
    readonly memories?: readonly RelationshipMemory[];
    readonly candidates?: readonly RelationshipMemoryCandidate[];
  },
  updatedAt: string,
): UserCharacterRelationship {
  return parseUserCharacterRelationship({
    ...relationship,
    ...(change.memories === undefined ? {} : { memories: change.memories }),
    ...(change.candidates === undefined ? {} : { candidates: change.candidates }),
    relationshipRevision: relationship.relationshipRevision + 1,
    updatedAt,
  });
}

function requirePendingCandidate(
  relationship: UserCharacterRelationship,
  candidateId: string,
): RelationshipMemoryCandidate {
  const candidate = relationship.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate || candidate.status !== 'pending') {
    throw relationshipError(
      'relationship-candidate-unavailable',
      `Pending relationship candidate '${candidateId}' is unavailable.`,
      relationship.relationshipId,
    );
  }
  return candidate;
}

function requireActiveMemory(
  relationship: UserCharacterRelationship,
  memoryId: string,
): RelationshipMemory {
  const memory = relationship.memories.find((item) => item.memoryId === memoryId);
  if (!memory || memory.status !== 'active') {
    throw relationshipError(
      'relationship-memory-unavailable',
      `Active relationship memory '${memoryId}' is unavailable.`,
      relationship.relationshipId,
    );
  }
  return memory;
}

function requireNewMemory(relationship: UserCharacterRelationship, memoryId: string): void {
  if (relationship.memories.some((memory) => memory.memoryId === memoryId)) {
    throw relationshipError(
      'relationship-memory-already-exists',
      `Relationship memory '${memoryId}' already exists.`,
      relationship.relationshipId,
    );
  }
}

function relationshipError(
  code: UserCharacterRelationshipDiagnosticCode,
  message: string,
  relationshipId?: string,
): UserCharacterRelationshipError {
  return new UserCharacterRelationshipError(code, message, relationshipId);
}
