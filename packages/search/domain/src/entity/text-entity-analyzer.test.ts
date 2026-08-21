import type { SemanticSourceAnalysisInput, SemanticTextSegment } from '../contracts';
import type { ProjectEntityRecord } from '@neko/entity-domain';
import { describe, expect, it } from 'vitest';
import { TextEntityAnalyzer } from './text-entity-analyzer';

const entities: readonly ProjectEntityRecord[] = [
  entity('char_rin', 'character', 'Rin', ['凛']),
  entity('char_alice_one', 'character', 'Alice'),
  entity('char_alice_two', 'character', 'Alice'),
  entity('char_morgan', 'character', 'Morgan'),
  entity('location_morgan', 'location', 'Morgan'),
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
    expect(result.index.textSegments).toBeUndefined();
    expect(result.evidence).toEqual([
      expect.objectContaining({
        evidenceId: 'segment-1',
        unitId: 'unit-1',
        contentHash: 'fnv1a32:segment-1',
      }),
    ]);
    expect(JSON.stringify(result.evidence)).not.toContain('Rin meets');
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

  it('creates canonical structural candidate projections', async () => {
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
          proposedNames: { canonical: 'New Hero', aliases: [] },
          freshness: 'fresh',
          evidence: expect.arrayContaining([
            expect.objectContaining({ owner: 'workspace', sourceId: 'workspace:story.fountain' }),
          ]),
        }),
        expect.objectContaining({
          proposedNames: { canonical: 'Alice', aliases: [] },
        }),
      ]),
    );
  });

  it('uses structural kind to select the only compatible exact entity', async () => {
    const result = await new TextEntityAnalyzer().analyze(
      input([
        segment('fountain-character', 'Morgan', 1, 'character', 'Morgan'),
        segment('fountain-scene', 'Rin', 2, 'location', 'Rin'),
      ]),
    );
    expect(result.mentions).toEqual([
      expect.objectContaining({ entityRef: { entityId: 'char_morgan', entityKind: 'character' } }),
      expect.objectContaining({ candidateName: 'Rin' }),
    ]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: 'location',
        proposedNames: { canonical: 'Rin', aliases: [] },
      }),
    ]);
  });

  it('preserves workspace, document, managed Asset and Media Library ownership', async () => {
    const analyzer = new TextEntityAnalyzer();
    for (const owner of ['workspace', 'document', 'managed-asset', 'media-library'] as const) {
      const result = await analyzer.analyze(
        input(
          [segment('fountain-character', 'Nova', 1, 'character', 'Nova')],
          'discover-candidates',
          owner,
        ),
      );
      expect(result.candidates[0]?.evidence).toEqual([
        expect.objectContaining({ owner, sourceId: `${owner}:story.fountain` }),
      ]);
      expect(result.occurrences[0]?.source.sourceKind).toBe(owner);
    }
  });
});

function input(
  segments: readonly SemanticTextSegment[],
  analysisMode: 'link-existing' | 'discover-candidates' = 'discover-candidates',
  rootKind: SemanticSourceAnalysisInput['source']['rootKind'] = 'workspace',
): SemanticSourceAnalysisInput {
  return {
    source: {
      sourceId: `${rootKind}:story.fountain`,
      workspaceId: 'workspace-1',
      rootId: rootKind,
      rootKind,
      relativePath: 'story.fountain',
      portablePath: `${'${WORKSPACE}'}/story.fountain`,
      format: 'fountain',
      analysisMode,
      fingerprint: 'sha256:story-content',
      sizeBytes: 100,
      modifiedAtMs: 1,
    },
    segments,
    entities: { entities },
    analyzedAt: '2026-07-18T00:00:00.000Z',
  };
}

function entity(
  entityId: string,
  kind: ProjectEntityRecord['kind'],
  canonical: string,
  aliases: readonly string[] = [],
): ProjectEntityRecord {
  return {
    entityId,
    kind,
    names: { canonical, aliases },
    representations: [],
    lifecycle: { state: 'active' },
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
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
    unitId: `unit-${line}`,
    kind,
    text,
    locator: {
      file: { authority: 'workspace', path: 'story.fountain' },
      selector: { kind: 'text-range', startLine: line, endLine: line },
    },
    contentHash: `fnv1a32:segment-${line}`,
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
