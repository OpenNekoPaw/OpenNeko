import {
  parseCharacterStorylineObservationCandidate,
  parseCharacterStorylineRun,
  parseCharacterStorylineVersion,
  type CharacterRun,
  type CharacterStorylineObservationCandidate,
  type CharacterStorylineRun,
  type CharacterStorylineVersion,
  type CharacterVersion,
} from '@neko/chara/contracts';

export interface CharacterStorylineRepository {
  readCharacterVersion(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
  readCharacterRun(characterRunId: string, signal?: AbortSignal): Promise<CharacterRun | undefined>;
  storeStorylineVersion(version: CharacterStorylineVersion, signal?: AbortSignal): Promise<void>;
  readStorylineVersion(
    characterStorylineVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineVersion | undefined>;
  createStorylineRun(run: CharacterStorylineRun, signal?: AbortSignal): Promise<void>;
  readStorylineRun(
    characterStorylineRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineRun | undefined>;
  createStorylineObservationCandidate(
    candidate: CharacterStorylineObservationCandidate,
    signal?: AbortSignal,
  ): Promise<void>;
  readStorylineObservationCandidate(
    observationCandidateId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineObservationCandidate | undefined>;
  commitStorylineObservationReview(
    input: {
      readonly characterStorylineRunId: string;
      readonly observationCandidateId: string;
      readonly expectedStorylineRevision: number;
      readonly nextRun?: CharacterStorylineRun;
      readonly nextCandidate: CharacterStorylineObservationCandidate;
    },
    signal?: AbortSignal,
  ): Promise<void>;
}

export type CharacterStorylineDiagnosticCode =
  | 'character-version-unavailable'
  | 'character-run-unavailable'
  | 'character-storyline-version-unavailable'
  | 'character-storyline-run-unavailable'
  | 'character-storyline-candidate-unavailable'
  | 'character-storyline-binding-mismatch'
  | 'character-storyline-stage-unavailable'
  | 'character-storyline-turning-point-mismatch'
  | 'character-storyline-revision-stale';

export class CharacterStorylineError extends Error {
  constructor(
    readonly code: CharacterStorylineDiagnosticCode,
    message: string,
    readonly recordId?: string,
  ) {
    super(message);
    this.name = 'CharacterStorylineError';
  }
}

export interface PublishCharacterStorylineInput {
  readonly characterStorylineVersionId: string;
  readonly characterVersionId: string;
  readonly label: string;
  readonly premise: string;
  readonly desire: string;
  readonly conflict: string;
  readonly growthArc: string;
  readonly stages: CharacterStorylineVersion['stages'];
  readonly turningPoints: CharacterStorylineVersion['turningPoints'];
  readonly constraints: readonly string[];
  readonly acceptedEvidenceIds: readonly string[];
}

export class CharacterStorylineService {
  private readonly now: () => string;

  constructor(
    private readonly repository: CharacterStorylineRepository,
    options: { readonly now?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async publish(
    input: PublishCharacterStorylineInput,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineVersion> {
    const characterVersion = await this.repository.readCharacterVersion(
      input.characterVersionId,
      signal,
    );
    if (!characterVersion) {
      throw storylineError(
        'character-version-unavailable',
        `CharacterVersion '${input.characterVersionId}' is unavailable.`,
        input.characterVersionId,
      );
    }
    const accepted = new Set(characterVersion.acceptedEvidenceIds);
    const foreignEvidence = input.acceptedEvidenceIds.find(
      (evidenceId) => !accepted.has(evidenceId),
    );
    if (foreignEvidence !== undefined) {
      throw storylineError(
        'character-storyline-binding-mismatch',
        `Character storyline evidence '${foreignEvidence}' is not accepted by CharacterVersion '${input.characterVersionId}'.`,
        input.characterStorylineVersionId,
      );
    }
    const version = deepFreeze(
      parseCharacterStorylineVersion({ ...input, publishedAt: this.now() }),
    );
    await this.repository.storeStorylineVersion(version, signal);
    return version;
  }

  async createRun(
    input: {
      readonly characterStorylineRunId: string;
      readonly characterStorylineVersionId: string;
      readonly characterRunId: string;
      readonly initialStageId: string;
    },
    signal?: AbortSignal,
  ): Promise<CharacterStorylineRun> {
    const [version, characterRun] = await Promise.all([
      this.requireVersion(input.characterStorylineVersionId, signal),
      this.requireCharacterRun(input.characterRunId, signal),
    ]);
    if (version.characterVersionId !== characterRun.characterVersionId) {
      throw storylineError(
        'character-storyline-binding-mismatch',
        `CharacterStorylineVersion '${version.characterStorylineVersionId}' does not belong to CharacterRun '${characterRun.characterRunId}'.`,
        input.characterStorylineRunId,
      );
    }
    requireStage(version, input.initialStageId);
    const timestamp = this.now();
    const run = parseCharacterStorylineRun({
      characterStorylineRunId: input.characterStorylineRunId,
      characterStorylineVersionId: version.characterStorylineVersionId,
      characterRunId: characterRun.characterRunId,
      currentStageId: input.initialStageId,
      acceptedTransitions: [],
      storylineRevision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.repository.createStorylineRun(run, signal);
    return clone(run);
  }

  async proposeObservation(
    input: {
      readonly observationCandidateId: string;
      readonly characterStorylineRunId: string;
      readonly sourceRef: string;
      readonly observedAt: string;
      readonly fromStageId: string;
      readonly toStageId: string;
      readonly turningPointId?: string;
      readonly expectedStorylineRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterStorylineObservationCandidate> {
    const run = await this.requireRun(input.characterStorylineRunId, signal);
    const version = await this.requireVersion(run.characterStorylineVersionId, signal);
    if (
      run.storylineRevision !== input.expectedStorylineRevision ||
      run.currentStageId !== input.fromStageId
    ) {
      throw staleStoryline(input.characterStorylineRunId, input.expectedStorylineRevision);
    }
    validateTransitionTarget(version, input.fromStageId, input.toStageId, input.turningPointId);
    const candidate = parseCharacterStorylineObservationCandidate({
      ...input,
      status: 'pending',
    });
    await this.repository.createStorylineObservationCandidate(candidate, signal);
    return clone(candidate);
  }

  async acceptObservation(
    input: {
      readonly observationCandidateId: string;
      readonly characterStorylineRunId: string;
      readonly transitionId: string;
      readonly expectedStorylineRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<{
    readonly run: CharacterStorylineRun;
    readonly candidate: CharacterStorylineObservationCandidate;
  }> {
    const [run, candidate] = await Promise.all([
      this.requireRun(input.characterStorylineRunId, signal),
      this.requirePendingCandidate(input.observationCandidateId, signal),
    ]);
    assertCandidateOwnership(run, candidate);
    if (
      run.storylineRevision !== input.expectedStorylineRevision ||
      candidate.expectedStorylineRevision !== input.expectedStorylineRevision ||
      run.currentStageId !== candidate.fromStageId
    ) {
      throw staleStoryline(run.characterStorylineRunId, input.expectedStorylineRevision);
    }
    const version = await this.requireVersion(run.characterStorylineVersionId, signal);
    validateTransitionTarget(
      version,
      candidate.fromStageId,
      candidate.toStageId,
      candidate.turningPointId,
    );
    const reviewedAt = this.now();
    const nextRevision = run.storylineRevision + 1;
    const nextRun = parseCharacterStorylineRun({
      ...run,
      currentStageId: candidate.toStageId,
      acceptedTransitions: [
        ...run.acceptedTransitions,
        {
          transitionId: input.transitionId,
          observationCandidateId: candidate.observationCandidateId,
          fromStageId: candidate.fromStageId,
          toStageId: candidate.toStageId,
          sourceRef: candidate.sourceRef,
          acceptedAt: reviewedAt,
          resultingStorylineRevision: nextRevision,
        },
      ],
      storylineRevision: nextRevision,
      updatedAt: reviewedAt,
    });
    const nextCandidate = parseCharacterStorylineObservationCandidate({
      ...candidate,
      status: 'accepted',
      reviewedAt,
      acceptedTransitionId: input.transitionId,
    });
    await this.repository.commitStorylineObservationReview(
      {
        characterStorylineRunId: run.characterStorylineRunId,
        observationCandidateId: candidate.observationCandidateId,
        expectedStorylineRevision: input.expectedStorylineRevision,
        nextRun,
        nextCandidate,
      },
      signal,
    );
    return { run: clone(nextRun), candidate: clone(nextCandidate) };
  }

  async rejectObservation(
    input: {
      readonly observationCandidateId: string;
      readonly characterStorylineRunId: string;
      readonly expectedStorylineRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterStorylineObservationCandidate> {
    const [run, candidate] = await Promise.all([
      this.requireRun(input.characterStorylineRunId, signal),
      this.requirePendingCandidate(input.observationCandidateId, signal),
    ]);
    assertCandidateOwnership(run, candidate);
    if (
      run.storylineRevision !== input.expectedStorylineRevision ||
      candidate.expectedStorylineRevision !== input.expectedStorylineRevision
    ) {
      throw staleStoryline(run.characterStorylineRunId, input.expectedStorylineRevision);
    }
    const nextCandidate = parseCharacterStorylineObservationCandidate({
      ...candidate,
      status: 'rejected',
      reviewedAt: this.now(),
    });
    await this.repository.commitStorylineObservationReview(
      {
        characterStorylineRunId: run.characterStorylineRunId,
        observationCandidateId: candidate.observationCandidateId,
        expectedStorylineRevision: input.expectedStorylineRevision,
        nextCandidate,
      },
      signal,
    );
    return clone(nextCandidate);
  }

  private async requireCharacterRun(
    characterRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterRun> {
    const run = await this.repository.readCharacterRun(characterRunId, signal);
    if (!run) {
      throw storylineError(
        'character-run-unavailable',
        `CharacterRun '${characterRunId}' is unavailable.`,
        characterRunId,
      );
    }
    return run;
  }

  private async requireVersion(
    characterStorylineVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineVersion> {
    const version = await this.repository.readStorylineVersion(characterStorylineVersionId, signal);
    if (!version) {
      throw storylineError(
        'character-storyline-version-unavailable',
        `CharacterStorylineVersion '${characterStorylineVersionId}' is unavailable.`,
        characterStorylineVersionId,
      );
    }
    return version;
  }

  private async requireRun(
    characterStorylineRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineRun> {
    const run = await this.repository.readStorylineRun(characterStorylineRunId, signal);
    if (!run) {
      throw storylineError(
        'character-storyline-run-unavailable',
        `CharacterStorylineRun '${characterStorylineRunId}' is unavailable.`,
        characterStorylineRunId,
      );
    }
    return run;
  }

  private async requirePendingCandidate(
    observationCandidateId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineObservationCandidate> {
    const candidate = await this.repository.readStorylineObservationCandidate(
      observationCandidateId,
      signal,
    );
    if (!candidate || candidate.status !== 'pending') {
      throw storylineError(
        'character-storyline-candidate-unavailable',
        `Pending Character storyline candidate '${observationCandidateId}' is unavailable.`,
        observationCandidateId,
      );
    }
    return candidate;
  }
}

function assertCandidateOwnership(
  run: CharacterStorylineRun,
  candidate: CharacterStorylineObservationCandidate,
): void {
  if (candidate.characterStorylineRunId !== run.characterStorylineRunId) {
    throw storylineError(
      'character-storyline-binding-mismatch',
      `Character storyline candidate '${candidate.observationCandidateId}' belongs to another Run.`,
      candidate.observationCandidateId,
    );
  }
}

function validateTransitionTarget(
  version: CharacterStorylineVersion,
  fromStageId: string,
  toStageId: string,
  turningPointId?: string,
): void {
  requireStage(version, fromStageId);
  requireStage(version, toStageId);
  if (turningPointId === undefined) return;
  const turningPoint = version.turningPoints.find((item) => item.turningPointId === turningPointId);
  if (
    !turningPoint ||
    turningPoint.fromStageId !== fromStageId ||
    turningPoint.toStageId !== toStageId
  ) {
    throw storylineError(
      'character-storyline-turning-point-mismatch',
      `Character storyline turning point '${turningPointId}' does not match the proposed transition.`,
      turningPointId,
    );
  }
}

function requireStage(version: CharacterStorylineVersion, stageId: string): void {
  if (!version.stages.some((stage) => stage.stageId === stageId)) {
    throw storylineError(
      'character-storyline-stage-unavailable',
      `Character storyline stage '${stageId}' is unavailable.`,
      stageId,
    );
  }
}

function staleStoryline(
  characterStorylineRunId: string,
  expectedStorylineRevision: number,
): CharacterStorylineError {
  return storylineError(
    'character-storyline-revision-stale',
    `CharacterStorylineRun '${characterStorylineRunId}' is not at expected revision ${String(expectedStorylineRevision)}.`,
    characterStorylineRunId,
  );
}

function storylineError(
  code: CharacterStorylineDiagnosticCode,
  message: string,
  recordId?: string,
): CharacterStorylineError {
  return new CharacterStorylineError(code, message, recordId);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
