import type { CharacterFoundationSnapshot } from '@neko/chara/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CharacterStorylineTimelineSurface } from './storyline-timeline';

describe('CharacterStorylineTimelineSurface', () => {
  it('renders the exact authored node order without progress or hidden author notes', () => {
    render(
      <CharacterStorylineTimelineSurface
        characterRunIds={['run-a']}
        locale="en"
        snapshot={snapshot()}
      />,
    );

    expect(screen.getByText('Arrival').closest('li')?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('Promise')).toBeTruthy();
    expect(screen.queryByText('Secret author note')).toBeNull();
    expect(screen.queryByText(/complete|progress/iu)).toBeNull();
  });
});

function snapshot(): CharacterFoundationSnapshot {
  return {
    character: {
      globalCharacters: [],
      versions: [],
      relationships: [],
      characterRuns: [
        {
          characterRunId: 'run-a',
          characterVersionId: 'version-a',
          participantId: 'participant-a',
          controller: { kind: 'agent', primaryAgentSessionId: 'session-a' },
          runtimeBinding: {
            kind: 'narrative',
            storyline: {
              characterStorylineId: 'storyline-a',
              characterStorylineVersionId: 'storyline-version-a',
              storylineNodeId: 'arrival',
            },
          },
          createdAt: '2026-08-12T00:00:00.000Z',
        },
      ],
      dialogueRuns: [],
      rooms: [],
      roomRuns: [],
      storylines: [],
      storylineDrafts: [],
      storylineVersions: [
        {
          characterStorylineVersionId: 'storyline-version-a',
          characterStorylineId: 'storyline-a',
          characterVersionId: 'version-a',
          label: 'Trust arc',
          premise: 'A promise returns.',
          constraints: [],
          nodeOrder: ['arrival', 'promise'],
          nodes: [node('arrival', 'Arrival'), node('promise', 'Promise')],
          edges: [{ fromStorylineNodeId: 'arrival', toStorylineNodeId: 'promise' }],
          publishedAt: '2026-08-12T00:00:00.000Z',
        },
      ],
      companionContinuities: [],
      presentationConfigurations: [],
    },
    diagnostics: [],
  };
}

function node(storylineNodeId: string, title: string) {
  return {
    storylineNodeId,
    title,
    spoilerVisibility: 'visible' as const,
    context: {
      situation: title,
      allowedStoryFacts: [],
      forbiddenStoryFacts: [],
      narrativeMemories: [],
      knowledgeBoundary: [],
      behaviorConstraints: [],
      expressionConstraints: [],
      authorOnlyNotes: ['Secret author note'],
    },
  };
}
