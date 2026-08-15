import {
  parseCharacterStoryline,
  parseCharacterStorylineDraft,
  parseCharacterStorylineVersion,
} from '../character-storyline';
import { describe, expect, it } from 'vitest';

const now = '2026-08-10T00:00:00.000Z';

describe('Character Storyline authoring contracts', () => {
  it('separates stable Storyline identity, mutable Draft and immutable publication content', () => {
    const storyline = parseCharacterStoryline({
      characterStorylineId: 'storyline-a',
      characterProjectId: 'character-project-a',
      displayName: 'Old City Reunion',
      createdAt: now,
      updatedAt: now,
    });
    const draft = parseCharacterStorylineDraft({
      ...content(),
      characterStorylineId: storyline.characterStorylineId,
      characterVersionId: 'character-version-a',
      updatedAt: now,
    });
    const version = parseCharacterStorylineVersion({
      characterStorylineVersionId: 'storyline-version-a',
      characterStorylineId: draft.characterStorylineId,
      characterVersionId: draft.characterVersionId,
      label: 'First publication',
      premise: draft.premise,
      constraints: draft.constraints,
      nodeOrder: draft.nodeOrder,
      nodes: draft.nodes,
      edges: draft.edges,
      publishedAt: now,
    });

    expect(version.characterStorylineId).toBe(storyline.characterStorylineId);
    expect(version.nodes[0]?.context.authorOnlyNotes).toEqual(['Future reveal.']);
  });

  it('rejects incomplete ordering, backward edges and fact-boundary conflicts', () => {
    expect(() =>
      parseCharacterStorylineDraft({
        ...content(),
        characterStorylineId: 'storyline-a',
        characterVersionId: 'character-version-a',
        nodeOrder: [],
        updatedAt: now,
      }),
    ).toThrow(/node order must contain every exact StorylineNode/u);
    expect(() =>
      parseCharacterStorylineDraft({
        ...content(),
        characterStorylineId: 'storyline-a',
        characterVersionId: 'character-version-a',
        nodes: [
          {
            ...content().nodes[0],
            context: {
              ...content().nodes[0]!.context,
              allowedStoryFacts: ['Secret'],
              forbiddenStoryFacts: ['Secret'],
            },
          },
        ],
        updatedAt: now,
      }),
    ).toThrow(/cannot both allow and forbid/u);
  });

  it('poisons the removed runtime Storyline shape', () => {
    expect(() =>
      parseCharacterStorylineVersion({
        characterStorylineVersionId: 'storyline-version-old',
        characterVersionId: 'character-version-a',
        label: 'Old',
        premise: 'Old shape',
        stages: [],
        turningPoints: [],
        constraints: [],
        acceptedEvidenceIds: [],
        publishedAt: now,
      }),
    ).toThrow(/unsupported fields/u);
  });
});

function content() {
  return {
    premise: 'A promise returns.',
    constraints: ['Keep future facts hidden.'],
    nodeOrder: ['arrival'],
    nodes: [
      {
        storylineNodeId: 'arrival',
        title: 'Arrival',
        spoilerVisibility: 'visible',
        context: {
          situation: 'The old gate opens.',
          time: 'Dusk',
          location: 'Old city gate',
          characterState: 'Cautious',
          relationshipState: 'Estranged allies',
          allowedStoryFacts: ['The gate is open.'],
          forbiddenStoryFacts: ['The letter names the traitor.'],
          narrativeMemories: ['A promise was made here.'],
          knowledgeBoundary: ['The sender is unknown.'],
          behaviorConstraints: ['Do not trust immediately.'],
          expressionConstraints: ['Speak tersely.'],
          authorOnlyNotes: ['Future reveal.'],
        },
      },
    ],
    edges: [],
  } as const;
}
