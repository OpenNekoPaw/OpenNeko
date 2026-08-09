import {
  parseUserCharacterRelationship,
  type RelationshipMemoryCandidate,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';

export interface UserCharacterRelationshipRepository {
  create(relationship: UserCharacterRelationship, signal?: AbortSignal): Promise<void>;
  read(
    relationshipId: string,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship | undefined>;
  mutate(
    relationshipId: string,
    mutation: (current: UserCharacterRelationship) => UserCharacterRelationship,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship>;
}

export type UserCharacterRelationshipDiagnosticCode =
  | 'relationship-unavailable'
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
      readonly characterVersionId: string;
    },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    const timestamp = this.now();
    const relationship = parseUserCharacterRelationship({
      ...input,
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
      readonly content: string;
      readonly sourceRef: string;
    },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    return this.update(
      input.relationshipId,
      (relationship) => {
        if (relationship.candidates.some((item) => item.candidateId === input.candidateId)) {
          throw relationshipError(
            'relationship-candidate-already-exists',
            `Relationship candidate '${input.candidateId}' already exists.`,
            input.relationshipId,
          );
        }
        const candidate: RelationshipMemoryCandidate = {
          candidateId: input.candidateId,
          content: input.content,
          sourceRef: input.sourceRef,
          status: 'pending',
          createdAt: this.now(),
        };
        return { ...relationship, candidates: [...relationship.candidates, candidate] };
      },
      signal,
    );
  }

  async accept(
    input: {
      readonly relationshipId: string;
      readonly candidateId: string;
      readonly memoryId: string;
    },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    return this.update(
      input.relationshipId,
      (relationship) => {
        const candidate = requirePendingCandidate(relationship, input.candidateId);
        if (relationship.memories.some((memory) => memory.memoryId === input.memoryId)) {
          throw relationshipError(
            'relationship-memory-already-exists',
            `Relationship memory '${input.memoryId}' already exists.`,
            input.relationshipId,
          );
        }
        const reviewedAt = this.now();
        return {
          ...relationship,
          memories: [
            ...relationship.memories,
            {
              memoryId: input.memoryId,
              content: candidate.content,
              sourceRef: candidate.sourceRef,
              acceptedAt: reviewedAt,
            },
          ],
          candidates: relationship.candidates.map((item) =>
            item.candidateId === input.candidateId
              ? { ...item, status: 'accepted', reviewedAt }
              : item,
          ),
        };
      },
      signal,
    );
  }

  async reject(
    input: { readonly relationshipId: string; readonly candidateId: string },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    return this.update(
      input.relationshipId,
      (relationship) => {
        requirePendingCandidate(relationship, input.candidateId);
        const reviewedAt = this.now();
        return {
          ...relationship,
          candidates: relationship.candidates.map((item) =>
            item.candidateId === input.candidateId
              ? { ...item, status: 'rejected', reviewedAt }
              : item,
          ),
        };
      },
      signal,
    );
  }

  async correctMemory(
    input: { readonly relationshipId: string; readonly memoryId: string; readonly content: string },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    return this.update(
      input.relationshipId,
      (relationship) => {
        if (!relationship.memories.some((memory) => memory.memoryId === input.memoryId)) {
          throw relationshipError(
            'relationship-memory-unavailable',
            `Relationship memory '${input.memoryId}' is unavailable.`,
            input.relationshipId,
          );
        }
        return {
          ...relationship,
          memories: relationship.memories.map((memory) =>
            memory.memoryId === input.memoryId ? { ...memory, content: input.content } : memory,
          ),
        };
      },
      signal,
    );
  }

  async deleteMemory(
    input: { readonly relationshipId: string; readonly memoryId: string },
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    return this.update(
      input.relationshipId,
      (relationship) => {
        if (!relationship.memories.some((memory) => memory.memoryId === input.memoryId)) {
          throw relationshipError(
            'relationship-memory-unavailable',
            `Relationship memory '${input.memoryId}' is unavailable.`,
            input.relationshipId,
          );
        }
        return {
          ...relationship,
          memories: relationship.memories.filter((memory) => memory.memoryId !== input.memoryId),
        };
      },
      signal,
    );
  }

  private async update(
    relationshipId: string,
    mutation: (current: UserCharacterRelationship) => UserCharacterRelationship,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    const current = await this.repository.read(relationshipId, signal);
    if (!current) {
      throw relationshipError(
        'relationship-unavailable',
        `UserCharacterRelationship '${relationshipId}' is unavailable.`,
        relationshipId,
      );
    }
    return this.repository.mutate(
      relationshipId,
      (stored) => parseUserCharacterRelationship({ ...mutation(stored), updatedAt: this.now() }),
      signal,
    );
  }
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

function relationshipError(
  code: UserCharacterRelationshipDiagnosticCode,
  message: string,
  relationshipId?: string,
): UserCharacterRelationshipError {
  return new UserCharacterRelationshipError(code, message, relationshipId);
}
