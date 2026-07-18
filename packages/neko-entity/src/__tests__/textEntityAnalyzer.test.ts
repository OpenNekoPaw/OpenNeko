import type {
  CreativeEntity,
  SemanticSourceAnalysisInput,
  SemanticTextSegment,
} from '@neko/shared';
import { describe, expect, it } from 'vitest';
import {
  projectAutomaticEntityCandidateReview,
  TextEntityAnalyzer,
} from '../core/textEntityAnalyzer';

const entities: readonly CreativeEntity[] = [
  {
    id: 'char_rin',
    kind: 'character',
    canonicalName: 'Rin',
    aliases: ['凛'],
    status: 'confirmed',
  },
  {
    id: 'char_alice_one',
    kind: 'character',
    canonicalName: 'Alice',
    aliases: [],
    status: 'confirmed',
  },
  {
    id: 'char_alice_two',
    kind: 'character',
    canonicalName: 'Alice',
    aliases: [],
    status: 'confirmed',
  },
];

describe('TextEntityAnalyzer', () => {
  it('links stable refs and unique exact aliases without candidates', async () => {
    const result = await new TextEntityAnalyzer().analyze(
      input([segment('plain', 'Rin meets 凛 and entity://char_rin.', 1)]),
    );
    expect(result.mentions).toHaveLength(3);
    expect(result.mentions.every((mention) => mention.entityRef?.entityId === 'char_rin')).toBe(
      true,
    );
    expect(result.candidates).toEqual([]);
    expect(result.occurrences).toHaveLength(3);
  });

  it('does not create candidates in link-existing mode', async () => {
    const result = await new TextEntityAnalyzer().analyze(
      input(
        [segment('fountain-character', 'New Hero', 1, 'character', 'New Hero')],
        'link-existing',
      ),
    );
    expect(result.candidates).toEqual([]);
  });

  it('creates structural candidates and marks ambiguous exact names', async () => {
    const analyzer = new TextEntityAnalyzer();
    const result = await analyzer.analyze(
      input([
        segment('fountain-character', 'New Hero', 1, 'character', 'New Hero'),
        segment('fountain-character', 'New Hero', 2, 'character', 'New Hero'),
        segment('fountain-character', 'New Hero', 3, 'character', 'New Hero'),
        segment('fountain-character', 'Alice', 4, 'character', 'Alice'),
      ]),
    );
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'New Hero',
          metadata: expect.objectContaining({ reviewStatus: 'suggested' }),
        }),
        expect.objectContaining({
          name: 'Alice',
          metadata: expect.objectContaining({ reviewStatus: 'ambiguous' }),
        }),
      ]),
    );
  });

  it('aggregates source observations into exception-oriented review items', async () => {
    const analyzer = new TextEntityAnalyzer();
    const first = await analyzer.analyze(
      input([segment('fountain-character', 'Nova', 1, 'character', 'Nova')]),
    );
    const secondInput = input([segment('fountain-character', 'Nova', 1, 'character', 'Nova')]);
    const second = await analyzer.analyze({
      ...secondInput,
      source: {
        ...secondInput.source,
        sourceId: 'workspace:second.fountain',
        relativePath: 'second.fountain',
        portablePath: `${'${WORKSPACE}'}/second.fountain`,
      },
    });
    const review = projectAutomaticEntityCandidateReview([
      ...first.candidates,
      ...second.candidates,
    ]);
    expect(review).toEqual([
      expect.objectContaining({ reviewStatus: 'suggested', distinctSourceCount: 2 }),
    ]);
  });
});

function input(
  segments: readonly SemanticTextSegment[],
  analysisMode: 'link-existing' | 'discover-candidates' = 'discover-candidates',
): SemanticSourceAnalysisInput {
  return {
    source: {
      sourceId: 'workspace:story.fountain',
      workspaceId: 'workspace-1',
      rootId: 'workspace',
      rootKind: 'workspace',
      relativePath: 'story.fountain',
      portablePath: `${'${WORKSPACE}'}/story.fountain`,
      format: 'fountain',
      analysisMode,
      fingerprint: 'sha256:story-v1',
      sizeBytes: 100,
      modifiedAtMs: 1,
    },
    segments,
    entities: { revision: 'entities-v1', entities },
    analyzedAt: '2026-07-18T00:00:00.000Z',
  };
}

function segment(
  kind: SemanticTextSegment['kind'],
  text: string,
  line: number,
  explicitEntityKind?: SemanticTextSegment['explicitEntityKind'],
  explicitEntityName?: string,
): SemanticTextSegment {
  return {
    segmentId: `segment-${line}`,
    kind,
    text,
    range: {
      startOffset: line * 100,
      endOffset: line * 100 + text.length,
      startLine: line,
      endLine: line,
      startColumn: 1,
      endColumn: text.length + 1,
    },
    ...(explicitEntityKind ? { explicitEntityKind } : {}),
    ...(explicitEntityName ? { explicitEntityName } : {}),
  };
}
