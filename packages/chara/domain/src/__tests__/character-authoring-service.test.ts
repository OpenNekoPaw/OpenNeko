import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterAuthoringTestSnapshot,
  type CharacterDefinition,
  type CharacterProject,
  type CharacterVersion,
  type CharacterVersionLineage,
} from '@neko/chara-domain/contracts';
import {
  CharacterAuthoringService,
  CharacterVersionLineageWriteError,
  type CharacterAuthoringRepository,
} from '../application/character-authoring-service';
import type { CharacterVersionLineageRepository } from '../application/character-version-lineage-repository';
import { describe, expect, it } from 'vitest';

const firstTime = '2026-08-09T10:00:00.000Z';
const laterTime = '2026-08-09T11:00:00.000Z';

function definition(summary = 'A careful archivist.'): CharacterDefinition {
  return {
    summary,
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: ['Keeps promises.'],
    knowledgeBoundary: ['Does not know the sealed archive.'],
    behaviorPolicy: ['Ask before changing a record.'],
    expressionPolicy: ['Uses concise language.'],
    representationRefs: [
      { representationId: 'portrait-main', kind: 'portrait', resourceRef: 'asset:portrait-a' },
    ],
  };
}

function emptyDefinition(): CharacterDefinition {
  return {
    summary: '',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}

class MemoryCharacterAuthoringRepository
  implements CharacterAuthoringRepository, CharacterVersionLineageRepository
{
  readonly projects = new Map<string, CharacterProject>();
  readonly versions = new Map<string, CharacterVersion>();
  readonly snapshots = new Map<string, CharacterAuthoringTestSnapshot>();
  readonly lineages = new Map<string, CharacterVersionLineage>();
  publicationWriteCount = 0;
  failNextLineageWrite = false;

  async readProject(characterProjectId: string): Promise<CharacterProject | undefined> {
    const project = this.projects.get(characterProjectId);
    return project === undefined ? undefined : structuredClone(project);
  }

  async saveProject(project: CharacterProject): Promise<void> {
    this.projects.set(project.characterProjectId, structuredClone(project));
  }

  async readPublication(characterVersionId: string): Promise<CharacterVersion | undefined> {
    const publication = this.versions.get(characterVersionId);
    return publication === undefined ? undefined : structuredClone(publication);
  }

  async storePublication(publication: CharacterVersion): Promise<void> {
    if (this.versions.has(publication.characterVersionId)) {
      throw new Error(`CharacterVersion '${publication.characterVersionId}' already exists.`);
    }
    this.publicationWriteCount += 1;
    this.versions.set(publication.characterVersionId, structuredClone(publication));
  }

  async saveAuthoringTestSnapshot(snapshot: CharacterAuthoringTestSnapshot): Promise<void> {
    if (this.snapshots.has(snapshot.authoringTestSnapshotId)) {
      throw new Error(`Authoring test '${snapshot.authoringTestSnapshotId}' already exists.`);
    }
    this.snapshots.set(snapshot.authoringTestSnapshotId, structuredClone(snapshot));
  }

  async readLineage(characterProjectId: string): Promise<CharacterVersionLineage | undefined> {
    const lineage = this.lineages.get(characterProjectId);
    return lineage === undefined ? undefined : structuredClone(lineage);
  }

  async saveLineage(lineage: CharacterVersionLineage): Promise<void> {
    if (this.failNextLineageWrite) {
      this.failNextLineageWrite = false;
      throw new Error('simulated lineage write interruption');
    }
    this.lineages.set(lineage.characterProjectId, structuredClone(lineage));
  }
}

describe('CharacterAuthoringService', () => {
  it('commits manual, evidence, Asset and Entity-context seeds through one fresh CharacterProject path', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({ repository, now: () => firstTime });
    const project = await service.createProject({
      characterProjectId: 'character-project-seeded',
      displayName: 'Seeded',
      draft: emptyDefinition(),
      seed: {
        evidence: [
          {
            evidenceId: 'evidence-file',
            sourceRef: 'content:workspace/story.md',
            excerpt: 'Seeded is the archive keeper.',
            observedAt: firstTime,
          },
          {
            evidenceId: 'evidence-entity',
            sourceRef: 'entity:character-seeded',
            observedAt: firstTime,
          },
        ],
        representationRefs: [
          {
            representationId: 'live2d-main',
            kind: 'live2d',
            resourceRef: 'asset:live2d-seeded/exact-member',
          },
        ],
      },
    });

    expect(project).toMatchObject({
      characterProjectId: 'character-project-seeded',
      evidence: [{ evidenceId: 'evidence-file' }, { evidenceId: 'evidence-entity' }],
      draft: {
        representationRefs: [
          {
            representationId: 'live2d-main',
            resourceRef: 'asset:live2d-seeded/exact-member',
          },
        ],
      },
      reviewStatus: 'draft',
    });
    expect(repository.projects.size).toBe(1);
    expect(repository.versions.size).toBe(0);
  });

  it('rejects duplicate seed identities without partially storing a CharacterProject', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({ repository, now: () => firstTime });
    await expect(
      service.createProject({
        characterProjectId: 'character-project-invalid-seed',
        displayName: 'Invalid',
        draft: definition(),
        seed: {
          evidence: [],
          representationRefs: [
            {
              representationId: 'portrait-main',
              kind: 'portrait',
              resourceRef: 'asset:other-portrait',
            },
          ],
        },
      }),
    ).rejects.toThrow("duplicate identity 'portrait-main'");
    expect(repository.projects.size).toBe(0);
  });

  it('creates an ordinary local draft without installed provenance', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({ repository, now: () => firstTime });

    const project = await service.createProject({
      characterProjectId: 'character-project-local',
      displayName: 'Local',
      draft: definition(),
    });

    expect(project).not.toHaveProperty('externalSource');
    expect(project).not.toHaveProperty('draftBasisCharacterVersionId');
    expect(repository.lineages.size).toBe(0);
  });

  it('continues the one working draft from an exact owned CharacterVersion', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });
    await service.createProject({
      characterProjectId: 'character-project-branch',
      displayName: 'Branch',
      draft: emptyDefinition(),
    });
    repository.versions.set('character-version-basis', {
      characterVersionId: 'character-version-basis',
      characterProjectId: 'character-project-branch',
      label: 'Basis',
      definition: { ...emptyDefinition(), summary: 'Historical definition' },
      acceptedEvidenceIds: [],
      publishedAt: firstTime,
    });

    const project = await service.continueFromVersion({
      characterProjectId: 'character-project-branch',
      characterVersionId: 'character-version-basis',
      replaceWorkingDraft: true,
    });

    expect(project.draft.summary).toBe('Historical definition');
    expect(project.draftBasisCharacterVersionId).toBe('character-version-basis');
    expect(repository.versions.get('character-version-basis')?.definition.summary).toBe(
      'Historical definition',
    );
  });

  it('rejects a basis owned by another CharacterProject', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });
    await service.createProject({
      characterProjectId: 'character-project-local',
      displayName: 'Local',
      draft: emptyDefinition(),
    });
    repository.versions.set('character-version-foreign', {
      characterVersionId: 'character-version-foreign',
      characterProjectId: 'character-project-foreign',
      label: 'Foreign',
      definition: emptyDefinition(),
      acceptedEvidenceIds: [],
      publishedAt: firstTime,
    });

    await expect(
      service.continueFromVersion({
        characterProjectId: 'character-project-local',
        characterVersionId: 'character-version-foreign',
        replaceWorkingDraft: true,
      }),
    ).rejects.toMatchObject({ code: 'character-authoring-operation-invalid' });
  });

  it('requires explicit working-draft replacement', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });

    await expect(
      Reflect.apply(service.continueFromVersion, service, [
        {
          characterProjectId: 'character-project-a',
          characterVersionId: 'character-version-a',
        },
      ]),
    ).rejects.toMatchObject({ code: 'character-authoring-operation-invalid' });
  });

  it('fills only a fresh exact character creation target', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });
    await service.createProject({
      characterProjectId: 'character-project-fresh',
      displayName: 'Lin',
      draft: emptyDefinition(),
    });

    const project = await service.fillFreshDraft({
      characterProjectId: 'character-project-fresh',
      displayName: 'Aster',
      draft: definition('Created from reviewed evidence.'),
    });

    expect(project.displayName).toBe('Aster');
    expect(project.draft.summary).toBe('Created from reviewed evidence.');
    await expect(
      service.fillFreshDraft({
        characterProjectId: 'character-project-fresh',
        displayName: 'Aster',
        draft: definition('A second overwrite attempt.'),
      }),
    ).rejects.toMatchObject({
      code: 'character-authoring-operation-invalid',
      characterProjectId: 'character-project-fresh',
    });
    expect(repository.projects.get('character-project-fresh')?.draft.summary).toBe(
      'Created from reviewed evidence.',
    );
  });

  it('reviews sourced candidates and publishes an immutable CharacterVersion', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    let currentTime = firstTime;
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => currentTime,
    });
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
    expect(repository.lineages.get('character-project-a')?.relations).toEqual([
      { characterVersionId: 'character-version-a', parentCharacterVersionIds: [] },
    ]);
    expect(repository.versions.get('character-version-a')).not.toHaveProperty('providerSecret');
    expect(repository.versions.get('character-version-a')).not.toHaveProperty('transcript');
  });

  it('declares only the exact working-draft basis as the usable-version parent', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });
    await service.createProject({
      characterProjectId: 'character-project-branch',
      displayName: 'Branch',
      draft: emptyDefinition(),
    });
    repository.versions.set('character-version-basis', {
      characterVersionId: 'character-version-basis',
      characterProjectId: 'character-project-branch',
      label: 'Basis',
      definition: definition('Historical definition'),
      acceptedEvidenceIds: [],
      publishedAt: firstTime,
    });
    await service.continueFromVersion({
      characterProjectId: 'character-project-branch',
      characterVersionId: 'character-version-basis',
      replaceWorkingDraft: true,
    });
    await service.setReviewStatus({
      characterProjectId: 'character-project-branch',
      reviewStatus: 'ready',
    });

    await service.publish({
      characterProjectId: 'character-project-branch',
      characterVersionId: 'character-version-child',
      label: 'Child',
      changeSummary: 'Continue the historical branch.',
    });

    expect(repository.lineages.get('character-project-branch')?.relations).toEqual([
      {
        characterVersionId: 'character-version-child',
        parentCharacterVersionIds: ['character-version-basis'],
        changeSummary: 'Continue the historical branch.',
      },
    ]);
  });

  it('keeps a usable version unlinked until explicit retry after lineage write failure', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });
    await service.createProject({
      characterProjectId: 'character-project-partial',
      displayName: 'Partial',
      draft: definition(),
    });
    await service.setReviewStatus({
      characterProjectId: 'character-project-partial',
      reviewStatus: 'ready',
    });
    repository.failNextLineageWrite = true;

    let partial: CharacterVersionLineageWriteError | undefined;
    try {
      await service.publish({
        characterProjectId: 'character-project-partial',
        characterVersionId: 'character-version-partial',
        label: 'Partial',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(CharacterVersionLineageWriteError);
      if (!(error instanceof CharacterVersionLineageWriteError)) throw error;
      partial = error;
    }

    expect(partial).toMatchObject({
      code: 'character-version-lineage-write-failed',
      version: { characterVersionId: 'character-version-partial' },
      relation: {
        characterVersionId: 'character-version-partial',
        parentCharacterVersionIds: [],
      },
    });
    expect(repository.versions.has('character-version-partial')).toBe(true);
    expect(repository.lineages.has('character-project-partial')).toBe(false);
    expect(repository.publicationWriteCount).toBe(1);

    await service.retryVersionLineage({
      characterProjectId: 'character-project-partial',
      characterVersionId: 'character-version-partial',
    });

    expect(repository.publicationWriteCount).toBe(1);
    expect(repository.lineages.get('character-project-partial')?.relations).toEqual([
      { characterVersionId: 'character-version-partial', parentCharacterVersionIds: [] },
    ]);
  });

  it('keeps a publication unchanged when the draft changes later', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });
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

  it('publishes reviewed BackgroundStory and OriginSetting evidence without creating runtime authority', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });
    await service.createProject({
      characterProjectId: 'character-project-lore',
      displayName: 'Lin',
      draft: definition(),
    });
    await service.addEvidence({
      characterProjectId: 'character-project-lore',
      evidence: {
        evidenceId: 'evidence-origin',
        sourceRef: 'document:character-notes',
        observedAt: firstTime,
      },
    });
    await service.updateDraft({
      characterProjectId: 'character-project-lore',
      draft: {
        ...definition(),
        backgroundStory: {
          ...createEmptyCharacterBackgroundStory(),
          formativeEvents: [
            {
              loreEntryId: 'formative-event-a',
              statement: 'Lin returned a forbidden key.',
              evidenceIds: ['evidence-origin'],
            },
          ],
        },
        originSetting: {
          ...createEmptyCharacterOriginSetting(),
          believedRules: [
            {
              loreEntryId: 'origin-rule-a',
              statement: 'Lin believes every promise leaves a trace.',
              evidenceIds: ['evidence-origin'],
            },
          ],
        },
      },
    });
    await service.setReviewStatus({
      characterProjectId: 'character-project-lore',
      reviewStatus: 'ready',
    });

    const publication = await service.publish({
      characterProjectId: 'character-project-lore',
      characterVersionId: 'character-version-lore',
      label: 'Lore publication',
    });

    expect(publication.acceptedEvidenceIds).toEqual(['evidence-origin']);
    expect(publication.definition.backgroundStory.formativeEvents).toHaveLength(1);
    expect(Object.isFrozen(publication.definition.originSetting.believedRules)).toBe(true);
    expect(publication).not.toHaveProperty('worldRunId');
    expect(publication).not.toHaveProperty('worldSaveId');
    expect(repository.versions.size).toBe(1);
  });

  it('keeps authoring-test snapshots out of the publication repository', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });
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
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });
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

  it('fails visibly instead of creating a version through a lineage-free publication path', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({ repository, now: () => firstTime });
    await service.createProject({
      characterProjectId: 'character-project-no-lineage',
      displayName: 'No lineage',
      draft: definition(),
    });
    await service.setReviewStatus({
      characterProjectId: 'character-project-no-lineage',
      reviewStatus: 'ready',
    });

    await expect(
      service.publish({
        characterProjectId: 'character-project-no-lineage',
        characterVersionId: 'character-version-no-lineage',
        label: 'Must not publish',
      }),
    ).rejects.toMatchObject({ code: 'character-version-lineage-repository-unavailable' });
    expect(repository.versions.size).toBe(0);
  });

  it('rejects raw local paths in a published representation', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });

    await expect(
      service.createProject({
        characterProjectId: 'character-project-a',
        displayName: 'Lin',
        draft: {
          ...definition(),
          representationRefs: [
            {
              representationId: 'portrait-main',
              kind: 'portrait',
              resourceRef: 'file:///Users/private/portrait.png',
            },
          ],
        },
      }),
    ).rejects.toThrow(/opaque non-file reference/u);
    expect(repository.projects.size).toBe(0);
  });

  it('rejects lore that cites evidence outside the owning CharacterProject', async () => {
    const repository = new MemoryCharacterAuthoringRepository();
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => firstTime,
    });
    await service.createProject({
      characterProjectId: 'character-project-a',
      displayName: 'Lin',
      draft: definition(),
    });

    await expect(
      service.updateDraft({
        characterProjectId: 'character-project-a',
        draft: {
          ...definition(),
          originSetting: {
            ...createEmptyCharacterOriginSetting(),
            cultures: [
              {
                loreEntryId: 'culture-a',
                statement: 'The archive reviews every claim.',
                evidenceIds: ['evidence-outside-project'],
              },
            ],
          },
        },
      }),
    ).rejects.toThrow(/lore references unknown evidence 'evidence-outside-project'/u);
    expect(repository.projects.get('character-project-a')?.draft.originSetting.cultures).toEqual(
      [],
    );
  });
});
