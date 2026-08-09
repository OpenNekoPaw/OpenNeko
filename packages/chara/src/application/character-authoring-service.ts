import {
  parseCharacterAuthoringTestSnapshot,
  parseCharacterProject,
  parseCharacterVersion,
  type CharacterAuthoringTestSnapshot,
  type CharacterCanonCandidate,
  type CharacterDefinition,
  type CharacterEvidenceRef,
  type CharacterProject,
  type CharacterRepresentationRef,
  type CharacterReviewStatus,
  type CharacterVersion,
} from '@neko/chara/contracts';

export interface CharacterAuthoringRepository {
  readProject(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterProject | undefined>;
  saveProject(project: CharacterProject, signal?: AbortSignal): Promise<void>;
  storePublication(publication: CharacterVersion, signal?: AbortSignal): Promise<void>;
  saveAuthoringTestSnapshot(
    snapshot: CharacterAuthoringTestSnapshot,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface CharacterAuthoringServiceOptions {
  readonly repository: CharacterAuthoringRepository;
  readonly now?: () => string;
}

export interface CreateCharacterProjectInput {
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly draft: CharacterDefinition;
}

export interface UpdateCharacterDraftInput {
  readonly characterProjectId: string;
  readonly draft: CharacterDefinition;
}

export interface AddCharacterEvidenceInput {
  readonly characterProjectId: string;
  readonly evidence: CharacterEvidenceRef;
}

export interface AddCharacterCandidateInput {
  readonly characterProjectId: string;
  readonly candidate: Omit<CharacterCanonCandidate, 'status' | 'reviewedAt'>;
}

export interface ReviewCharacterCandidateInput {
  readonly characterProjectId: string;
  readonly candidateId: string;
  readonly decision: 'accepted' | 'rejected';
}

export interface SetCharacterReviewStatusInput {
  readonly characterProjectId: string;
  readonly reviewStatus: CharacterReviewStatus;
}

export interface BindCharacterRepresentationInput {
  readonly characterProjectId: string;
  readonly representation: CharacterRepresentationRef;
}

export interface RemoveCharacterRepresentationInput {
  readonly characterProjectId: string;
  readonly representationId: string;
}

export interface PublishCharacterInput {
  readonly characterProjectId: string;
  readonly characterVersionId: string;
  readonly label: string;
}

export interface CaptureCharacterAuthoringTestInput {
  readonly characterProjectId: string;
  readonly authoringTestSnapshotId: string;
}

export type CharacterAuthoringDiagnosticCode =
  | 'character-project-not-found'
  | 'character-project-already-exists'
  | 'character-evidence-already-exists'
  | 'character-candidate-already-exists'
  | 'character-candidate-not-found'
  | 'character-representation-already-exists'
  | 'character-representation-not-found'
  | 'character-publication-not-ready'
  | 'character-authoring-operation-invalid';

export class CharacterAuthoringError extends Error {
  constructor(
    readonly code: CharacterAuthoringDiagnosticCode,
    message: string,
    readonly characterProjectId?: string,
  ) {
    super(message);
    this.name = 'CharacterAuthoringError';
  }
}

export class CharacterAuthoringService {
  private readonly now: () => string;

  constructor(private readonly options: CharacterAuthoringServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createProject(
    input: CreateCharacterProjectInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    const existing = await this.options.repository.readProject(input.characterProjectId, signal);
    if (existing) {
      throw authoringError(
        'character-project-already-exists',
        `CharacterProject '${input.characterProjectId}' already exists.`,
        input.characterProjectId,
      );
    }
    const timestamp = this.now();
    const project = parseCharacterProject({
      characterProjectId: input.characterProjectId,
      displayName: input.displayName,
      draft: input.draft,
      evidence: [],
      candidates: [],
      reviewStatus: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.options.repository.saveProject(project, signal);
    return clone(project);
  }

  async updateDraft(
    input: UpdateCharacterDraftInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    return this.updateProject(
      input.characterProjectId,
      (project) => ({ ...project, draft: clone(input.draft), reviewStatus: 'draft' }),
      signal,
    );
  }

  async addEvidence(
    input: AddCharacterEvidenceInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    return this.updateProject(
      input.characterProjectId,
      (project) => {
        if (project.evidence.some((item) => item.evidenceId === input.evidence.evidenceId)) {
          throw authoringError(
            'character-evidence-already-exists',
            `Character evidence '${input.evidence.evidenceId}' already exists.`,
            project.characterProjectId,
          );
        }
        return {
          ...project,
          evidence: [...project.evidence, clone(input.evidence)],
          reviewStatus: 'draft',
        };
      },
      signal,
    );
  }

  async addCandidate(
    input: AddCharacterCandidateInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    return this.updateProject(
      input.characterProjectId,
      (project) => {
        if (project.candidates.some((item) => item.candidateId === input.candidate.candidateId)) {
          throw authoringError(
            'character-candidate-already-exists',
            `Character candidate '${input.candidate.candidateId}' already exists.`,
            project.characterProjectId,
          );
        }
        return {
          ...project,
          candidates: [...project.candidates, { ...clone(input.candidate), status: 'pending' }],
          reviewStatus: 'draft',
        };
      },
      signal,
    );
  }

  async reviewCandidate(
    input: ReviewCharacterCandidateInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    return this.updateProject(
      input.characterProjectId,
      (project) => {
        const candidate = project.candidates.find((item) => item.candidateId === input.candidateId);
        if (!candidate) {
          throw authoringError(
            'character-candidate-not-found',
            `Character candidate '${input.candidateId}' does not exist.`,
            project.characterProjectId,
          );
        }
        return {
          ...project,
          candidates: project.candidates.map((item) =>
            item.candidateId === input.candidateId
              ? { ...item, status: input.decision, reviewedAt: this.now() }
              : item,
          ),
          reviewStatus: 'draft',
        };
      },
      signal,
    );
  }

  async setReviewStatus(
    input: SetCharacterReviewStatusInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    return this.updateProject(
      input.characterProjectId,
      (project) => {
        if (
          input.reviewStatus === 'ready' &&
          project.candidates.some((candidate) => candidate.status === 'pending')
        ) {
          throw authoringError(
            'character-authoring-operation-invalid',
            'CharacterProject cannot become ready while candidates are pending.',
            project.characterProjectId,
          );
        }
        return { ...project, reviewStatus: input.reviewStatus };
      },
      signal,
    );
  }

  async bindRepresentation(
    input: BindCharacterRepresentationInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    return this.updateProject(
      input.characterProjectId,
      (project) => {
        if (
          project.draft.representationRefs.some(
            (item) => item.representationId === input.representation.representationId,
          )
        ) {
          throw authoringError(
            'character-representation-already-exists',
            `Character representation '${input.representation.representationId}' already exists.`,
            project.characterProjectId,
          );
        }
        return {
          ...project,
          draft: {
            ...project.draft,
            representationRefs: [...project.draft.representationRefs, clone(input.representation)],
          },
          reviewStatus: 'draft',
        };
      },
      signal,
    );
  }

  async removeRepresentation(
    input: RemoveCharacterRepresentationInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    return this.updateProject(
      input.characterProjectId,
      (project) => {
        if (
          !project.draft.representationRefs.some(
            (item) => item.representationId === input.representationId,
          )
        ) {
          throw authoringError(
            'character-representation-not-found',
            `Character representation '${input.representationId}' does not exist.`,
            project.characterProjectId,
          );
        }
        return {
          ...project,
          draft: {
            ...project.draft,
            representationRefs: project.draft.representationRefs.filter(
              (item) => item.representationId !== input.representationId,
            ),
          },
          reviewStatus: 'draft',
        };
      },
      signal,
    );
  }

  async captureAuthoringTest(
    input: CaptureCharacterAuthoringTestInput,
    signal?: AbortSignal,
  ): Promise<CharacterAuthoringTestSnapshot> {
    const project = await this.requireProject(input.characterProjectId, signal);
    const snapshot = deepFreeze(
      parseCharacterAuthoringTestSnapshot({
        authoringTestSnapshotId: input.authoringTestSnapshotId,
        characterProjectId: project.characterProjectId,
        capturedAt: this.now(),
        definition: project.draft,
      }),
    );
    await this.options.repository.saveAuthoringTestSnapshot(snapshot, signal);
    return snapshot;
  }

  async publish(input: PublishCharacterInput, signal?: AbortSignal): Promise<CharacterVersion> {
    const project = await this.requireProject(input.characterProjectId, signal);
    if (
      project.reviewStatus !== 'ready' ||
      project.candidates.some((candidate) => candidate.status === 'pending')
    ) {
      throw authoringError(
        'character-publication-not-ready',
        `CharacterProject '${project.characterProjectId}' is not ready for publication.`,
        project.characterProjectId,
      );
    }
    const acceptedEvidenceIds = new Set(
      project.candidates
        .filter((candidate) => candidate.status === 'accepted')
        .flatMap((candidate) => candidate.evidenceIds),
    );
    const published = deepFreeze(
      parseCharacterVersion({
        characterVersionId: input.characterVersionId,
        characterProjectId: project.characterProjectId,
        label: input.label,
        definition: project.draft,
        acceptedEvidenceIds: [...acceptedEvidenceIds],
        publishedAt: this.now(),
      }),
    );
    await this.options.repository.storePublication(published, signal);
    return published;
  }

  private async requireProject(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    const project = await this.options.repository.readProject(characterProjectId, signal);
    if (!project) {
      throw authoringError(
        'character-project-not-found',
        `CharacterProject '${characterProjectId}' does not exist.`,
        characterProjectId,
      );
    }
    return parseCharacterProject(project);
  }

  private async updateProject(
    characterProjectId: string,
    update: (project: CharacterProject) => CharacterProject,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    const current = await this.requireProject(characterProjectId, signal);
    const updated = parseCharacterProject({ ...update(current), updatedAt: this.now() });
    await this.options.repository.saveProject(updated, signal);
    return clone(updated);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function authoringError(
  code: CharacterAuthoringDiagnosticCode,
  message: string,
  characterProjectId?: string,
): CharacterAuthoringError {
  return new CharacterAuthoringError(code, message, characterProjectId);
}
