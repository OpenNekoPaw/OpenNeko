import type {
  CharacterAuthoringTestSnapshot,
  CharacterProject,
  CharacterVersion,
} from '@neko/chara/contracts';
import {
  CharacterAuthoringService,
  type CharacterAuthoringRepository,
} from '../application/character-authoring-service';
import { describe, expect, it } from 'vitest';

const firstTime = '2026-08-09T10:00:00.000Z';
const laterTime = '2026-08-09T11:00:00.000Z';

function definition(summary = 'A careful archivist.') {
  return {
    summary,
    canon: ['Keeps promises.'],
    knowledgeBoundary: ['Does not know the sealed archive.'],
    behaviorPolicy: ['Ask before changing a record.'],
    expressionPolicy: ['Uses concise language.'],
    representationRefs: [
      { representationId: 'portrait-main', role: 'portrait', targetRef: 'asset:portrait-a' },
    ],
  };
}

class MemoryCharacterAuthoringRepository implements CharacterAuthoringRepository {
  readonly projects = new Map<string, CharacterProject>();
  readonly versions = new Map<string, CharacterVersion>();
  readonly snapshots = new Map<string, CharacterAuthoringTestSnapshot>();

  async readProject(characterProjectId: string): Promise<CharacterProject | undefined> {
    const project = this.projects.get(characterProjectId);
    return project === undefined ? undefined : structuredClone(project);
  }

  async saveProject(project: CharacterProject): Promise<void> {
    this.projects.set(project.characterProjectId, structuredClone(project));
  }

  async storePublication(publication: CharacterVersion): Promise<void> {
    if (this.versions.has(publication.characterVersionId)) {
      throw new Error(`CharacterVersion '${publication.characterVersionId}' already exists.`);
    }
    this.versions.set(publication.characterVersionId, structuredClone(publication));
  }

  async saveAuthoringTestSnapshot(snapshot: CharacterAuthoringTestSnapshot): Promise<void> {
    if (this.snapshots.has(snapshot.authoringTestSnapshotId)) {
      throw new Error(`Authoring test '${snapshot.authoringTestSnapshotId}' already exists.`);
    }
    this.snapshots.set(snapshot.authoringTestSnapshotId, structuredClone(snapshot));
  }
}

describe('CharacterAuthoringService', () => {
  it('reviews sourced candidates and publishes an immutable CharacterVersion', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    let currentTime = firstTime;
    const service = new CharacterAuthoringService({ repository, now: () => currentTime });
    await service.createProject({
      characterProjectId: 'character-project-a',
      displayName: 'Lin',
      draft: definition(),
    });
    await service.addEvidence({
      characterProjectId: 'character-project-a',
      evidence: {
        evidenceId: 'evidence-a',
        sourceRef: 'document:scene-1',
        excerpt: 'Lin returns the key.',
        observedAt: firstTime,
      },
    });
    await service.addCandidate({
      characterProjectId: 'character-project-a',
      candidate: {
        candidateId: 'candidate-a',
        field: 'canon',
        proposedValue: 'Returns borrowed objects.',
        evidenceIds: ['evidence-a'],
      },
    });
    await service.reviewCandidate({
      characterProjectId: 'character-project-a',
      candidateId: 'candidate-a',
      decision: 'accepted',
    });
    await service.setReviewStatus({
      characterProjectId: 'character-project-a',
      reviewStatus: 'ready',
    });
    currentTime = laterTime;
    const published = await service.publish({
      characterProjectId: 'character-project-a',
      characterVersionId: 'character-version-a',
      label: 'First publication',
    });

    expect(published.acceptedEvidenceIds).toEqual(['evidence-a']);
    expect(Object.isFrozen(published)).toBe(true);
    expect(Object.isFrozen(published.definition.canon)).toBe(true);
    expect(repository.versions.get('character-version-a')).not.toHaveProperty('providerSecret');
    expect(repository.versions.get('character-version-a')).not.toHaveProperty('transcript');
  });

  it('keeps a publication unchanged when the draft changes later', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({ repository, now: () => firstTime });
    await service.createProject({
      characterProjectId: 'character-project-a',
      displayName: 'Lin',
      draft: definition('Original summary'),
    });
    await service.setReviewStatus({
      characterProjectId: 'character-project-a',
      reviewStatus: 'ready',
    });
    const published = await service.publish({
      characterProjectId: 'character-project-a',
      characterVersionId: 'character-version-a',
      label: 'First publication',
    });
    await service.updateDraft({
      characterProjectId: 'character-project-a',
      draft: definition('Updated draft summary'),
    });

    expect(published.definition.summary).toBe('Original summary');
    expect(repository.versions.get('character-version-a')?.definition.summary).toBe(
      'Original summary',
    );
    expect(repository.projects.get('character-project-a')?.draft.summary).toBe(
      'Updated draft summary',
    );
  });

  it('keeps authoring-test snapshots out of the publication repository', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({ repository, now: () => firstTime });
    await service.createProject({
      characterProjectId: 'character-project-a',
      displayName: 'Lin',
      draft: definition(),
    });
    const snapshot = await service.captureAuthoringTest({
      characterProjectId: 'character-project-a',
      authoringTestSnapshotId: 'authoring-test-a',
    });

    expect(snapshot.authoringTestSnapshotId).toBe('authoring-test-a');
    expect(repository.snapshots.size).toBe(1);
    expect(repository.versions.size).toBe(0);
  });

  it('rejects publication while review is incomplete', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({ repository, now: () => firstTime });
    await service.createProject({
      characterProjectId: 'character-project-a',
      displayName: 'Lin',
      draft: definition(),
    });

    await expect(
      service.publish({
        characterProjectId: 'character-project-a',
        characterVersionId: 'character-version-a',
        label: 'Blocked publication',
      }),
    ).rejects.toMatchObject({
      code: 'character-publication-not-ready',
      characterProjectId: 'character-project-a',
    });
  });

  it('rejects raw local paths in a published representation', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({ repository, now: () => firstTime });

    await expect(
      service.createProject({
        characterProjectId: 'character-project-a',
        displayName: 'Lin',
        draft: {
          ...definition(),
          representationRefs: [
            {
              representationId: 'portrait-main',
              role: 'portrait',
              targetRef: 'file:///Users/private/portrait.png',
            },
          ],
        },
      }),
    ).rejects.toThrow(/opaque non-file reference/u);
    expect(repository.projects.size).toBe(0);
  });
});
