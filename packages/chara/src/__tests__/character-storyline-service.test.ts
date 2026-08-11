import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterRun,
  parseCharacterVersion,
  type CharacterRun,
  type CharacterStorylineObservationCandidate,
  type CharacterStorylineRun,
  type CharacterStorylineVersion,
  type CharacterVersion,
} from '@neko/chara/contracts';
import {
  CharacterStorylineError,
  CharacterStorylineService,
  type CharacterStorylineRepository,
} from '../application/character-storyline-service';
import { describe, expect, it } from 'vitest';

const now = '2026-08-10T00:00:00.000Z';

describe('CharacterStorylineService', () => {
  it('publishes multiple explicitly selectable personal arcs for one CharacterVersion', async () => {
    const repository = new InMemoryStorylineRepository();
    repository.characterVersions.set('character-version-a', characterVersion());
    const service = new CharacterStorylineService(repository, { now: () => now });

    const first = await service.publish(storylineInput('storyline-version-a', 'Trust arc'));
    const second = await service.publish(storylineInput('storyline-version-b', 'Duty arc'));

    expect([...repository.storylineVersions]).toHaveLength(2);
    expect(first.characterVersionId).toBe(second.characterVersionId);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('creates an exact Run and atomically accepts one sourced transition at its CAS revision', async () => {
    const repository = preparedRepository();
    const service = new CharacterStorylineService(repository, { now: () => now });
    const run = await service.createRun({
      characterStorylineRunId: 'storyline-run-a',
      characterStorylineVersionId: 'storyline-version-a',
      characterRunId: 'character-run-a',
      initialStageId: 'guarded',
    });
    const candidate = await service.proposeObservation({
      observationCandidateId: 'observation-a',
      characterStorylineRunId: run.characterStorylineRunId,
      sourceRef: 'external-event:event-a',
      observedAt: now,
      fromStageId: 'guarded',
      toStageId: 'trusting',
      turningPointId: 'delegate-key',
      expectedStorylineRevision: 0,
    });

    const accepted = await service.acceptObservation({
      observationCandidateId: candidate.observationCandidateId,
      characterStorylineRunId: run.characterStorylineRunId,
      transitionId: 'transition-a',
      expectedStorylineRevision: 0,
    });

    expect(accepted.run).toMatchObject({ currentStageId: 'trusting', storylineRevision: 1 });
    expect(accepted.candidate).toMatchObject({
      status: 'accepted',
      acceptedTransitionId: 'transition-a',
    });
    expect(accepted.run.acceptedTransitions[0]?.sourceRef).toBe('external-event:event-a');
  });

  it('rejects stale and wrong-run observations without changing either Run', async () => {
    const repository = preparedRepository();
    repository.characterRuns.set('character-run-b', characterRun('character-run-b'));
    const service = new CharacterStorylineService(repository, { now: () => now });
    await service.createRun({
      characterStorylineRunId: 'storyline-run-a',
      characterStorylineVersionId: 'storyline-version-a',
      characterRunId: 'character-run-a',
      initialStageId: 'guarded',
    });
    await service.createRun({
      characterStorylineRunId: 'storyline-run-b',
      characterStorylineVersionId: 'storyline-version-a',
      characterRunId: 'character-run-b',
      initialStageId: 'guarded',
    });
    await service.proposeObservation({
      observationCandidateId: 'observation-a',
      characterStorylineRunId: 'storyline-run-a',
      sourceRef: 'external-event:event-a',
      observedAt: now,
      fromStageId: 'guarded',
      toStageId: 'trusting',
      expectedStorylineRevision: 0,
    });

    await expect(
      service.acceptObservation({
        observationCandidateId: 'observation-a',
        characterStorylineRunId: 'storyline-run-b',
        transitionId: 'transition-illegal',
        expectedStorylineRevision: 0,
      }),
    ).rejects.toMatchObject({
      code: 'character-storyline-binding-mismatch',
    } satisfies Partial<CharacterStorylineError>);
    await expect(
      service.proposeObservation({
        observationCandidateId: 'observation-stale',
        characterStorylineRunId: 'storyline-run-a',
        sourceRef: 'external-event:event-b',
        observedAt: now,
        fromStageId: 'guarded',
        toStageId: 'trusting',
        expectedStorylineRevision: 1,
      }),
    ).rejects.toMatchObject({
      code: 'character-storyline-revision-stale',
    } satisfies Partial<CharacterStorylineError>);
    expect(repository.storylineRuns.get('storyline-run-a')?.storylineRevision).toBe(0);
    expect(repository.storylineRuns.get('storyline-run-b')?.storylineRevision).toBe(0);
  });
});

class InMemoryStorylineRepository implements CharacterStorylineRepository {
  readonly characterVersions = new Map<string, CharacterVersion>();
  readonly characterRuns = new Map<string, CharacterRun>();
  readonly storylineVersions = new Map<string, CharacterStorylineVersion>();
  readonly storylineRuns = new Map<string, CharacterStorylineRun>();
  readonly candidates = new Map<string, CharacterStorylineObservationCandidate>();

  async readCharacterVersion(id: string) {
    return cloneOptional(this.characterVersions.get(id));
  }
  async readCharacterRun(id: string) {
    return cloneOptional(this.characterRuns.get(id));
  }
  async storeStorylineVersion(version: CharacterStorylineVersion) {
    if (this.storylineVersions.has(version.characterStorylineVersionId)) throw new Error('exists');
    this.storylineVersions.set(version.characterStorylineVersionId, copy(version));
  }
  async readStorylineVersion(id: string) {
    return cloneOptional(this.storylineVersions.get(id));
  }
  async createStorylineRun(run: CharacterStorylineRun) {
    if (this.storylineRuns.has(run.characterStorylineRunId)) throw new Error('exists');
    this.storylineRuns.set(run.characterStorylineRunId, copy(run));
  }
  async readStorylineRun(id: string) {
    return cloneOptional(this.storylineRuns.get(id));
  }
  async createStorylineObservationCandidate(candidate: CharacterStorylineObservationCandidate) {
    if (this.candidates.has(candidate.observationCandidateId)) throw new Error('exists');
    this.candidates.set(candidate.observationCandidateId, copy(candidate));
  }
  async readStorylineObservationCandidate(id: string) {
    return cloneOptional(this.candidates.get(id));
  }
  async commitStorylineObservationReview(input: {
    readonly characterStorylineRunId: string;
    readonly observationCandidateId: string;
    readonly expectedStorylineRevision: number;
    readonly nextRun?: CharacterStorylineRun;
    readonly nextCandidate: CharacterStorylineObservationCandidate;
  }) {
    const run = this.storylineRuns.get(input.characterStorylineRunId);
    const candidate = this.candidates.get(input.observationCandidateId);
    if (
      !run ||
      !candidate ||
      candidate.status !== 'pending' ||
      run.storylineRevision !== input.expectedStorylineRevision
    ) {
      throw new Error('concurrent storyline review');
    }
    if (input.nextRun) this.storylineRuns.set(input.characterStorylineRunId, copy(input.nextRun));
    this.candidates.set(input.observationCandidateId, copy(input.nextCandidate));
  }
}

function preparedRepository(): InMemoryStorylineRepository {
  const repository = new InMemoryStorylineRepository();
  repository.characterVersions.set('character-version-a', characterVersion());
  repository.characterRuns.set('character-run-a', characterRun('character-run-a'));
  repository.storylineVersions.set('storyline-version-a', storylineVersion());
  return repository;
}

function storylineInput(characterStorylineVersionId: string, label: string) {
  return {
    characterStorylineVersionId,
    characterVersionId: 'character-version-a',
    label,
    premise: 'Lin must learn to share responsibility.',
    desire: 'Protect the archive alone.',
    conflict: 'One keeper cannot preserve everything.',
    growthArc: 'From control to reviewed trust.',
    stages: [
      { stageId: 'guarded', title: 'Guarded', description: 'Refuses assistance.' },
      { stageId: 'trusting', title: 'Trusting', description: 'Delegates a protected task.' },
    ],
    turningPoints: [
      {
        turningPointId: 'delegate-key',
        fromStageId: 'guarded',
        toStageId: 'trusting',
        description: 'Entrusts the key to a reviewed ally.',
        evidenceIds: ['evidence-a'],
      },
    ],
    constraints: ['Do not claim external state changed.'],
    acceptedEvidenceIds: ['evidence-a'],
  } as const;
}

function storylineVersion(): CharacterStorylineVersion {
  return { ...storylineInput('storyline-version-a', 'Trust arc'), publishedAt: now };
}

function characterVersion(): CharacterVersion {
  return parseCharacterVersion({
    characterVersionId: 'character-version-a',
    characterProjectId: 'character-project-a',
    label: 'Published Lin',
    definition: {
      summary: 'Archive keeper',
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    acceptedEvidenceIds: ['evidence-a'],
    publishedAt: now,
  });
}

function characterRun(characterRunId: string): CharacterRun {
  return parseCharacterRun({
    characterRunId,
    characterVersionId: 'character-version-a',
    participantId: `participant:${characterRunId}`,
    controller: { kind: 'agent', primaryAgentSessionId: `agent:${characterRunId}` },
    runtimeBinding: { kind: 'companion', relationshipId: `relationship:${characterRunId}` },
    createdAt: now,
  });
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function copy<T>(value: T): T {
  return structuredClone(value);
}
