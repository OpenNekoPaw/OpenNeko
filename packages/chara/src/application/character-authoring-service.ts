import {
  parseCharacterAuthoringTestSnapshot,
  parseCharacterProject,
  parseCharacterVersion,
  parseCharacterVersionLineage,
  parseCharacterVersionRelation,
  collectCharacterLoreEvidenceIds,
  type CharacterAuthoringTestSnapshot,
  type CharacterCanonCandidate,
  type CharacterDefinition,
  type CharacterEvidenceRef,
  type CharacterProject,
  type CharacterRepresentationRef,
  type CharacterReviewStatus,
  type CharacterVersion,
  type CharacterVersionLineage,
  type CharacterVersionRelation,
  type CharacterCreationSeed,
} from '@neko/chara/contracts';
import type { CharacterVersionLineageRepository } from './character-version-lineage-repository';

export interface CharacterAuthoringRepository {
  readProject(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterProject | undefined>;
  saveProject(project: CharacterProject, signal?: AbortSignal): Promise<void>;
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
  storePublication(publication: CharacterVersion, signal?: AbortSignal): Promise<void>;
  saveAuthoringTestSnapshot(
    snapshot: CharacterAuthoringTestSnapshot,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface CharacterPublicationReader {
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
}

export interface CharacterAuthoringServiceOptions {
  readonly repository: CharacterAuthoringRepository;
  readonly lineage?: CharacterVersionLineageRepository;
  readonly now?: () => string;
}

export interface CreateCharacterProjectInput {
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly draft: CharacterDefinition;
  readonly seed?: CharacterCreationSeed;
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
  readonly changeSummary?: string;
}

export interface RetryCharacterVersionLineageInput {
  readonly characterProjectId: string;
  readonly characterVersionId: string;
  readonly parentCharacterVersionId?: string;
  readonly changeSummary?: string;
}

export interface CaptureCharacterAuthoringTestInput {
  readonly characterProjectId: string;
  readonly authoringTestSnapshotId: string;
}

export interface ContinueCharacterFromVersionInput {
  readonly characterProjectId: string;
  readonly characterVersionId: string;
  readonly replaceWorkingDraft: true;
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
  | 'character-version-lineage-conflict'
  | 'character-version-lineage-owner-mismatch'
  | 'character-version-lineage-repository-unavailable'
  | 'character-version-lineage-version-unavailable'
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

export class CharacterVersionLineageWriteError extends Error {
  readonly code = 'character-version-lineage-write-failed';

  constructor(
    readonly version: CharacterVersion,
    readonly relation: CharacterVersionRelation,
    options?: ErrorOptions,
  ) {
    super(
      `CharacterVersion '${version.characterVersionId}' is usable, but its lineage relation was not stored. Retry the exact lineage operation.`,
      options,
    );
    this.name = 'CharacterVersionLineageWriteError';
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
    const seed = input.seed ?? { evidence: [], representationRefs: [] };
    const project = parseCharacterProject({
      characterProjectId: input.characterProjectId,
      displayName: input.displayName,
      draft: {
        ...input.draft,
        representationRefs: [...input.draft.representationRefs, ...seed.representationRefs],
      },
      evidence: seed.evidence,
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

  async fillFreshDraft(
    input: UpdateCharacterDraftInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    return this.updateProject(
      input.characterProjectId,
      (project) => {
        if (!isFreshCharacterCreationTarget(project)) {
          throw authoringError(
            'character-authoring-operation-invalid',
            `CharacterProject '${project.characterProjectId}' is not a fresh character creation target.`,
            project.characterProjectId,
          );
        }
        return { ...project, draft: clone(input.draft), reviewStatus: 'draft' };
      },
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

  async continueFromVersion(
    input: ContinueCharacterFromVersionInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    if (input.replaceWorkingDraft !== true) {
      throw authoringError(
        'character-authoring-operation-invalid',
        'Continuing from a CharacterVersion requires explicit working-draft replacement.',
        input.characterProjectId,
      );
    }
    const publication = await this.options.repository.readPublication(
      input.characterVersionId,
      signal,
    );
    if (!publication || publication.characterProjectId !== input.characterProjectId) {
      throw authoringError(
        'character-authoring-operation-invalid',
        `CharacterVersion '${input.characterVersionId}' does not belong to exact CharacterProject '${input.characterProjectId}'.`,
        input.characterProjectId,
      );
    }
    return this.updateProject(
      input.characterProjectId,
      (project) => ({
        ...project,
        draft: clone(publication.definition),
        draftBasisCharacterVersionId: publication.characterVersionId,
        reviewStatus: 'draft',
      }),
      signal,
    );
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
    const lineageRepository = this.requireLineageRepository(input.characterProjectId);
    const parentCharacterVersionId = project.draftBasisCharacterVersionId;
    if (parentCharacterVersionId !== undefined) {
      await this.requireOwnedPublication(
        project.characterProjectId,
        parentCharacterVersionId,
        signal,
      );
    }
    const relation = parseCharacterVersionRelation({
      characterVersionId: input.characterVersionId,
      parentCharacterVersionIds:
        parentCharacterVersionId === undefined ? [] : [parentCharacterVersionId],
      ...(input.changeSummary === undefined ? {} : { changeSummary: input.changeSummary }),
    });
    const preparedLineage = await this.prepareLineage(
      lineageRepository,
      project.characterProjectId,
      relation,
      signal,
    );
    const acceptedEvidenceIds = new Set([
      ...project.candidates
        .filter((candidate) => candidate.status === 'accepted')
        .flatMap((candidate) => candidate.evidenceIds),
      ...collectCharacterLoreEvidenceIds(project.draft),
    ]);
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
    if (!preparedLineage.relationAlreadyStored) {
      await this.writeLineage(
        lineageRepository,
        published,
        relation,
        preparedLineage.lineage,
        signal,
      );
    }
    return published;
  }

  async retryVersionLineage(
    input: RetryCharacterVersionLineageInput,
    signal?: AbortSignal,
  ): Promise<CharacterVersionLineage> {
    const lineageRepository = this.requireLineageRepository(input.characterProjectId);
    const version = await this.requireOwnedPublication(
      input.characterProjectId,
      input.characterVersionId,
      signal,
    );
    if (input.parentCharacterVersionId !== undefined) {
      await this.requireOwnedPublication(
        input.characterProjectId,
        input.parentCharacterVersionId,
        signal,
      );
    }
    const relation = parseCharacterVersionRelation({
      characterVersionId: input.characterVersionId,
      parentCharacterVersionIds:
        input.parentCharacterVersionId === undefined ? [] : [input.parentCharacterVersionId],
      ...(input.changeSummary === undefined ? {} : { changeSummary: input.changeSummary }),
    });
    const preparedLineage = await this.prepareLineage(
      lineageRepository,
      input.characterProjectId,
      relation,
      signal,
    );
    if (!preparedLineage.relationAlreadyStored) {
      await this.writeLineage(
        lineageRepository,
        version,
        relation,
        preparedLineage.lineage,
        signal,
      );
    }
    return preparedLineage.lineage;
  }

  async requireProject(
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

  private requireLineageRepository(characterProjectId: string): CharacterVersionLineageRepository {
    if (this.options.lineage) return this.options.lineage;
    throw authoringError(
      'character-version-lineage-repository-unavailable',
      'CharacterVersion lineage repository is required to create a usable version.',
      characterProjectId,
    );
  }

  private async requireOwnedPublication(
    characterProjectId: string,
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion> {
    const publication = await this.options.repository.readPublication(characterVersionId, signal);
    if (!publication) {
      throw authoringError(
        'character-version-lineage-version-unavailable',
        `CharacterVersion '${characterVersionId}' is unavailable.`,
        characterProjectId,
      );
    }
    if (publication.characterProjectId !== characterProjectId) {
      throw authoringError(
        'character-version-lineage-owner-mismatch',
        `CharacterVersion '${characterVersionId}' does not belong to exact CharacterProject '${characterProjectId}'.`,
        characterProjectId,
      );
    }
    return publication;
  }

  private async prepareLineage(
    repository: CharacterVersionLineageRepository,
    characterProjectId: string,
    relation: CharacterVersionRelation,
    signal?: AbortSignal,
  ): Promise<{
    readonly lineage: CharacterVersionLineage;
    readonly relationAlreadyStored: boolean;
  }> {
    const current = await repository.readLineage(characterProjectId, signal);
    if (current !== undefined && current.characterProjectId !== characterProjectId) {
      throw authoringError(
        'character-version-lineage-owner-mismatch',
        `CharacterVersion lineage '${current.characterProjectId}' does not belong to exact CharacterProject '${characterProjectId}'.`,
        characterProjectId,
      );
    }
    if (current !== undefined) {
      const existing = current.relations.find(
        (candidate) => candidate.characterVersionId === relation.characterVersionId,
      );
      if (existing !== undefined) {
        if (sameLineageRelation(existing, relation)) {
          return { lineage: current, relationAlreadyStored: true };
        }
        throw authoringError(
          'character-version-lineage-conflict',
          `CharacterVersion '${relation.characterVersionId}' already has a different lineage relation.`,
          characterProjectId,
        );
      }
    }
    return {
      lineage: parseCharacterVersionLineage({
        characterProjectId,
        relations: [...(current?.relations ?? []), relation],
      }),
      relationAlreadyStored: false,
    };
  }

  private async writeLineage(
    repository: CharacterVersionLineageRepository,
    version: CharacterVersion,
    relation: CharacterVersionRelation,
    lineage: CharacterVersionLineage,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await repository.saveLineage(lineage, signal);
    } catch (cause) {
      throw new CharacterVersionLineageWriteError(version, relation, { cause });
    }
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isFreshCharacterCreationTarget(project: CharacterProject): boolean {
  const { draft } = project;
  return (
    project.reviewStatus === 'draft' &&
    project.evidence.length === 0 &&
    project.candidates.length === 0 &&
    draft.summary.length === 0 &&
    draft.backgroundStory.overview.length === 0 &&
    draft.backgroundStory.origins.length === 0 &&
    draft.backgroundStory.personalHistory.length === 0 &&
    draft.backgroundStory.formativeEvents.length === 0 &&
    draft.backgroundStory.establishedRelationships.length === 0 &&
    draft.originSetting.overview.length === 0 &&
    draft.originSetting.eras.length === 0 &&
    draft.originSetting.cultures.length === 0 &&
    draft.originSetting.socialEnvironment.length === 0 &&
    draft.originSetting.importantPlaces.length === 0 &&
    draft.originSetting.organizations.length === 0 &&
    draft.originSetting.believedRules.length === 0 &&
    draft.canon.length === 0 &&
    draft.knowledgeBoundary.length === 0 &&
    draft.behaviorPolicy.length === 0 &&
    draft.expressionPolicy.length === 0 &&
    draft.representationRefs.length === 0 &&
    draft.representationDefaults === undefined &&
    draft.voiceDefaults === undefined
  );
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

function sameLineageRelation(
  left: CharacterVersionRelation,
  right: CharacterVersionRelation,
): boolean {
  return (
    left.characterVersionId === right.characterVersionId &&
    left.parentCharacterVersionIds.length === right.parentCharacterVersionIds.length &&
    left.parentCharacterVersionIds.every(
      (parentCharacterVersionId, index) =>
        parentCharacterVersionId === right.parentCharacterVersionIds[index],
    ) &&
    left.changeSummary === right.changeSummary
  );
}
