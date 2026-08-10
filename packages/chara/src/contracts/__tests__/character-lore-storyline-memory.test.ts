import { decodeCharacterRecords } from '../character';
import {
  parseCharacterBackgroundStory,
  parseCharacterMemoryScope,
  parseCharacterMemoryScopeRef,
  parseCharacterOriginSetting,
  parseCharacterStorylineObservationCandidate,
  parseCharacterStorylineRun,
  parseCharacterStorylineRunRef,
  parseCharacterStorylineVersion,
} from '../character-lore-storyline-memory';
import { describe, expect, it } from 'vitest';

const now = '2026-08-10T00:00:00.000Z';

describe('Character lore, storyline, and subjective memory contracts', () => {
  it('keeps reviewed BackgroundStory and OriginSetting as non-runnable Character lore', () => {
    const backgroundStory = parseCharacterBackgroundStory({
      overview: 'Lin grew up among archivists.',
      origins: [lore('origin-a', 'Raised by the archive keeper.')],
      personalHistory: [],
      formativeEvents: [lore('event-a', 'Returned a forbidden key.')],
      establishedRelationships: [],
    });
    const originSetting = parseCharacterOriginSetting({
      overview: 'A city that records every promise.',
      eras: [lore('era-a', 'The late registry era.')],
      cultures: [],
      socialEnvironment: [],
      importantPlaces: [],
      organizations: [],
      believedRules: [lore('rule-a', 'Lin believes every promise leaves a trace.')],
    });

    expect(backgroundStory.formativeEvents[0]?.evidenceIds).toEqual(['evidence-a']);
    expect(originSetting.believedRules).toHaveLength(1);
    expect(() =>
      parseCharacterOriginSetting({
        ...originSetting,
        worldRunId: 'world-run-illegal',
      }),
    ).toThrow(/unsupported fields.*worldRunId/u);
  });

  it('defines one exact personal-storyline version, Run, and reviewed transition candidate', () => {
    const storyline = parseCharacterStorylineVersion({
      characterStorylineVersionId: 'character-storyline-version-a',
      characterVersionId: 'character-version-a',
      label: 'Learning to trust',
      premise: 'Lin must share responsibility for the archive.',
      desire: 'Protect every record personally.',
      conflict: 'The archive cannot survive one keeper acting alone.',
      growthArc: 'From solitary control to reviewed delegation.',
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
      constraints: ['Do not claim that the archive itself changed.'],
      acceptedEvidenceIds: ['evidence-a'],
      publishedAt: now,
    });
    const run = parseCharacterStorylineRun({
      characterStorylineRunId: 'character-storyline-run-a',
      characterStorylineVersionId: storyline.characterStorylineVersionId,
      characterRunId: 'character-run-a',
      currentStageId: 'trusting',
      acceptedTransitions: [
        {
          transitionId: 'transition-a',
          observationCandidateId: 'observation-a',
          fromStageId: 'guarded',
          toStageId: 'trusting',
          sourceRef: 'world-event:event-a',
          acceptedAt: now,
          resultingStorylineRevision: 1,
        },
      ],
      storylineRevision: 1,
      createdAt: now,
      updatedAt: now,
    });
    const candidate = parseCharacterStorylineObservationCandidate({
      observationCandidateId: 'observation-a',
      characterStorylineRunId: run.characterStorylineRunId,
      sourceRef: 'world-event:event-a',
      observedAt: now,
      fromStageId: 'guarded',
      toStageId: 'trusting',
      turningPointId: 'delegate-key',
      expectedStorylineRevision: 0,
      status: 'accepted',
      reviewedAt: now,
      acceptedTransitionId: 'transition-a',
    });

    expect(candidate.expectedStorylineRevision).toBe(0);
    expect(run.acceptedTransitions[0]?.resultingStorylineRevision).toBe(1);
    expect(() =>
      parseCharacterStorylineRunRef({
        characterVersionId: 'character-version-a',
        characterRunId: 'character-run-a',
        characterStorylineVersionId: storyline.characterStorylineVersionId,
        characterStorylineRunId: run.characterStorylineRunId,
        latest: true,
      }),
    ).toThrow(/unsupported fields.*latest/u);
  });

  it('keeps subjective Character memory under one exact Scope and independent review lifecycle', () => {
    const scope = parseCharacterMemoryScope(memoryScope());

    expect(scope.characterRunId).toBe('character-run-a');
    expect(scope.entries[0]?.content).toBe('Lin remembers choosing to trust the user.');
    expect(scope).not.toHaveProperty('worldSaveId');
    expect(
      parseCharacterMemoryScopeRef({
        characterVersionId: 'character-version-a',
        characterRunId: 'character-run-a',
        characterMemoryScopeId: scope.characterMemoryScopeId,
      }),
    ).toEqual({
      characterVersionId: 'character-version-a',
      characterRunId: 'character-run-a',
      characterMemoryScopeId: 'character-memory-scope-a',
    });
  });

  it('isolates an invalid MemoryScope while retaining a valid sibling', () => {
    const invalid = {
      ...memoryScope(),
      characterMemoryScopeId: 'character-memory-scope-invalid',
      entries: [
        {
          ...memoryScope().entries[0],
          characterMemoryScopeId: 'another-scope',
        },
      ],
    };
    const decoded = decodeCharacterRecords(
      [memoryScope(), invalid],
      'character-memory-scope',
      parseCharacterMemoryScope,
      'characterMemoryScopeId',
    );

    expect(decoded.records.map((scope) => scope.characterMemoryScopeId)).toEqual([
      'character-memory-scope-a',
    ]);
    expect(decoded.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-character-record',
        recordId: 'character-memory-scope-invalid',
      }),
    ]);
  });
});

function lore(loreEntryId: string, statement: string) {
  return { loreEntryId, statement, evidenceIds: ['evidence-a'] };
}

function memoryScope() {
  return {
    characterMemoryScopeId: 'character-memory-scope-a',
    characterRunId: 'character-run-a',
    characterStorylineRunId: 'character-storyline-run-a',
    memoryRevision: 1,
    candidates: [
      {
        characterMemoryCandidateId: 'character-memory-candidate-a',
        characterMemoryScopeId: 'character-memory-scope-a',
        content: 'Lin may remember choosing to trust the user.',
        sourceRef: 'world-event:event-a',
        observerParticipantId: 'participant-lin',
        observedAt: now,
        sensitivityTraits: ['private'],
        retentionTraits: ['milestone'],
        expectedMemoryRevision: 0,
        status: 'accepted',
        reviewedAt: now,
        acceptedMemoryEntryId: 'character-memory-entry-a',
      },
    ],
    entries: [
      {
        characterMemoryEntryId: 'character-memory-entry-a',
        characterMemoryScopeId: 'character-memory-scope-a',
        sourceCandidateId: 'character-memory-candidate-a',
        content: 'Lin remembers choosing to trust the user.',
        sourceRef: 'world-event:event-a',
        observerParticipantId: 'participant-lin',
        observedAt: now,
        sensitivityTraits: ['private'],
        retentionTraits: ['milestone'],
        status: 'active',
        acceptedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
