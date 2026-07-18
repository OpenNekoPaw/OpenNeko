import { describe, expect, it } from 'vitest';
import type { CreativeEntityRef } from '@neko/shared';
import {
  createCharacterEvidenceStrategy,
  dedupeCharacterEvidenceChunks,
  normalizeCharacterEvidenceTokens,
  projectCharacterEvidenceBundleToProfileFacts,
  rankCharacterEvidenceChunks,
  renderCharacterEvidenceBundle,
  scoreCharacterEvidenceChunk,
  trimCharacterEvidenceChunks,
  type CharacterEvidenceChunk,
} from '../character-evidence';

const entityRef: CreativeEntityRef = {
  entityId: 'char-lin',
  entityKind: 'character',
  projectRoot: '/project',
  source: 'neko-entity',
};

describe('character evidence runtime helpers', () => {
  it('normalizes query tokens without host dependencies', () => {
    expect(normalizeCharacterEvidenceTokens('  Lin, LIN! Scene-42_Alpha  ')).toEqual([
      'lin',
      'scene',
      '42_alpha',
    ]);
    expect(normalizeCharacterEvidenceTokens(['小橘', ' 晚场景 '])).toEqual(['小橘', '晚场景']);
  });

  it('scores and orders chunks deterministically by lexical signals and source position', () => {
    const chunks = [
      makeChunk('late', 'Lin finds the hidden key in the final scene.', 220, {
        score: 0,
        signals: [],
      }),
      makeChunk('early', 'Lin waits near the gate.', 12, { score: 0, signals: [] }),
      makeChunk('middle', 'The team discusses the hidden archive.', 80, {
        score: 0,
        signals: [],
      }),
    ].map((chunk) => ({
      ...chunk,
      relevance: scoreCharacterEvidenceChunk({
        chunk,
        queryTokens: normalizeCharacterEvidenceTokens('hidden key'),
        entityTokens: normalizeCharacterEvidenceTokens('Lin'),
      }),
    }));

    expect(rankCharacterEvidenceChunks(chunks).map((chunk) => chunk.id)).toEqual([
      'late',
      'middle',
      'early',
    ]);
    expect(chunks.find((chunk) => chunk.id === 'late')?.relevance.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'query-token-match' }),
        expect.objectContaining({ name: 'entity-token-match' }),
        expect.objectContaining({ name: 'authority' }),
      ]),
    );
  });

  it('dedupes duplicate source range and text while merging source refs', () => {
    const left = makeChunk('left', 'Lin says the same thing.', 10);
    const right: CharacterEvidenceChunk = {
      ...makeChunk('right', 'Lin says the same thing.', 10),
      sourceRefs: [
        {
          ...makeChunk('right', 'Lin says the same thing.', 10).sourceRefs[0]!,
          id: 'manual:cases/test.fountain:10',
          kind: 'manual',
        },
      ],
      relevance: { score: 9, signals: [{ name: 'query-token-match', weight: 9 }] },
    };

    const deduped = dedupeCharacterEvidenceChunks([left, right]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe('right');
    expect(deduped[0]?.sourceRefs.map((sourceRef) => sourceRef.kind)).toEqual([
      'entity-occurrence',
      'manual',
    ]);
    expect(deduped[0]?.relevance.score).toBe(9);
  });

  it('trims chunks to stable budget and records omissions', () => {
    const chunks = [
      makeChunk('first', 'a'.repeat(40), 1, { score: 20, signals: [] }),
      makeChunk('second', 'b'.repeat(40), 2, { score: 10, signals: [] }),
      makeChunk('third', 'c'.repeat(40), 3, { score: 5, signals: [] }),
    ];

    const result = trimCharacterEvidenceChunks({
      chunks,
      budget: {
        maxChunks: 2,
        maxCharacters: 70,
        perChunkMaxCharacters: 35,
        minScore: 0,
      },
    });

    expect(result.chunks.map((chunk) => chunk.id)).toEqual(['first', 'second']);
    expect(result.chunks[0]?.text).toContain('[truncated]');
    expect(result.omitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'budget', chunkId: 'first' }),
        expect.objectContaining({ reason: 'budget', chunkId: 'second' }),
        expect.objectContaining({ reason: 'budget', chunkId: 'third' }),
      ]),
    );
  });

  it('renders bundles and profile facts without mutating transcript state', () => {
    const chunk = makeChunk('evidence-1', 'Lin only knows the public clue.', 30, {
      score: 12,
      signals: [],
    });
    const bundle = {
      entityRef,
      mode: 'character-dialogue' as const,
      query: 'what does Lin know?',
      chunks: [chunk],
      omitted: [],
      freshness: 'fresh' as const,
      budget: {
        maxChunks: 4,
        maxCharacters: 4000,
        perChunkMaxCharacters: 1000,
      },
    };

    expect(renderCharacterEvidenceBundle(bundle)).toContain('Turn-scoped project evidence');
    expect(renderCharacterEvidenceBundle(bundle)).toContain('Lin only knows the public clue.');
    expect(projectCharacterEvidenceBundleToProfileFacts(bundle)).toEqual([
      expect.objectContaining({
        key: 'script.context.1',
        value: 'Lin only knows the public clue.',
        source: 'script-extraction',
        authority: 'confirmed',
      }),
    ]);
  });

  it('localizes generated evidence wrapper labels for Chinese prompts', () => {
    const chunk = makeChunk(
      'evidence-1',
      ['Script file: cases/test.fountain', 'Lines: 30-32', 'Evidence:', '30: 林只知道线索。'].join(
        '\n',
      ),
      30,
      {
        score: 12,
        signals: [],
      },
    );
    const bundle = {
      entityRef,
      mode: 'character-dialogue' as const,
      query: '林知道什么？',
      chunks: [chunk],
      omitted: [
        {
          reason: 'budget' as const,
          message: 'Chunk was truncated to fit evidence budget.',
        },
      ],
      freshness: 'fresh' as const,
      budget: {
        maxChunks: 4,
        maxCharacters: 4000,
        perChunkMaxCharacters: 1000,
      },
    };

    const text = renderCharacterEvidenceBundle(bundle, { locale: 'zh-CN' });

    expect(text).toContain('本回合项目证据:');
    expect(text).toContain('[证据 1]');
    expect(text).toContain('来源: cases/test.fountain:30');
    expect(text).toContain('剧本文件: cases/test.fountain');
    expect(text).toContain('行: 30-32');
    expect(text).toContain('证据:');
    expect(text).toContain('已省略证据:');
    expect(text).toContain('证据片段已截断以适配证据预算。');
    expect(text).not.toContain('Turn-scoped project evidence');
    expect(text).not.toContain('Script file:');
    expect(text).not.toContain('Evidence:');
    expect(text).not.toContain('Omitted evidence:');
  });

  it('loads late scene evidence through host-agnostic reader ports', async () => {
    const strategy = createCharacterEvidenceStrategy({
      projectRoot: '/project',
      occurrenceReader: {
        listOccurrences: async () =>
          Array.from({ length: 8 }, (_, index) => ({
            entityRef,
            label: 'Lin',
            role: 'reference' as const,
            location: `cases/long.fountain:${index < 7 ? 10 + index : 220}`,
            source: {
              sourceId: 'fountain-content',
              sourceKind: 'story' as const,
              freshness: 'fresh' as const,
            },
          })),
      },
      projectSearchReader: { search: async () => [] },
      storyIndexReader: { getScriptIndex: async () => undefined },
      textReader: {
        readTextFile: async () =>
          makeNumberedScript(260, {
            220: 'LIN reveals the late-scene clue about the northern gate.',
          }),
      },
      maxWindowLines: 24,
    });

    const bundle = await strategy.loadEvidence({
      entityRef,
      mode: 'character-dialogue',
      query: 'What does Lin reveal about the northern gate?',
      projectRoot: '/project',
      budget: { maxChunks: 4, maxCharacters: 4000, perChunkMaxCharacters: 1200 },
    });

    expect(bundle.chunks.map((chunk) => chunk.text).join('\n')).toContain(
      '220: LIN reveals the late-scene clue about the northern gate.',
    );
    expect(bundle.chunks[0]?.sourceRefs[0]?.lineStart).toBeGreaterThanOrEqual(208);
  });

  it('dedupes occurrence, story index, and project search locators for one range', async () => {
    const strategy = createCharacterEvidenceStrategy({
      projectRoot: '/project',
      occurrenceReader: {
        listOccurrences: async () => [
          {
            entityRef,
            label: 'Lin',
            role: 'reference',
            location: 'cases/test.fountain:30-34',
            source: {
              sourceId: 'fountain-content',
              sourceKind: 'story',
              sourceRef: 'cases/test.fountain:30-34',
              providerId: 'fountain-content',
              freshness: 'fresh',
            },
          },
        ],
      },
      projectSearchReader: {
        search: async () => [makeSearchItem('story-scene-1', 'cases/test.fountain', 30, 34)],
      },
      storyIndexReader: {
        getScriptIndex: async () => ({
          uri: 'file:///project/cases/test.fountain',
          total_lines: 80,
          characters: [{ name: 'Lin', first_line: 29, scene_ids: ['scene-1'] }],
          scenes: [
            {
              id: 'scene-1',
              sceneId: 'scene-1',
              heading: 'INT. GATE - NIGHT',
              sceneTitle: 'Gate',
              intExt: 'INT',
              timeOfDay: 'NIGHT',
              location: 'GATE',
              time: 'NIGHT',
              sceneNumber: null,
              sceneCharacters: ['Lin'],
              actionSummary: '',
              estimatedDuration: 30,
              directives: [],
              line_start: 29,
              line_end: 33,
            },
          ],
        }),
      },
      textReader: {
        readTextFile: async () =>
          makeNumberedScript(80, {
            30: 'LIN notices the sealed door.',
            34: 'LIN keeps the clue private.',
          }),
      },
      maxWindowLines: 6,
    });

    const bundle = await strategy.loadEvidence({
      entityRef,
      mode: 'character-validation',
      query: 'sealed door clue',
      projectRoot: '/project',
      budget: { maxChunks: 8, maxCharacters: 6000, perChunkMaxCharacters: 1200 },
    });

    expect(bundle.chunks).toHaveLength(1);
    expect(bundle.chunks[0]?.text).toContain('LIN notices the sealed door.');
    expect(bundle.chunks[0]?.sourceRefs.map((sourceRef) => sourceRef.kind)).toEqual(
      expect.arrayContaining(['entity-occurrence', 'project-search', 'story-script-index']),
    );
  });

  it('records stale, unsafe, unsupported, and missing source omissions deterministically', async () => {
    const strategy = createCharacterEvidenceStrategy({
      projectRoot: '/project',
      projectSearchReader: {
        search: async () => [makeSearchItem('scene-stale', 'cases/search.fountain', 5, 8, 'stale')],
      },
      textReader: {
        readTextFile: async (filePath) => {
          if (filePath.endsWith('search.fountain')) {
            return makeNumberedScript(20, { 5: 'LIN remembers indexed project evidence.' });
          }
          throw new Error('missing');
        },
      },
    });

    const bundle = await strategy.loadEvidence({
      entityRef,
      mode: 'embody-character',
      query: 'indexed project evidence',
      projectRoot: '/project',
      budget: { maxChunks: 4, maxCharacters: 4000, perChunkMaxCharacters: 1200 },
      seedSourceRefs: [
        { id: 'abs', kind: 'manual', location: '/tmp/outside.fountain:10' },
        { id: 'escape', kind: 'manual', location: '../outside.fountain:10' },
        { id: 'unsupported', kind: 'manual', location: 'cases/image.png:10' },
        { id: 'missing', kind: 'manual', location: 'cases/missing.fountain:10' },
      ],
    });

    expect(bundle.chunks[0]?.text).toContain('LIN remembers indexed project evidence.');
    expect(bundle.omitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'safety' }),
        expect.objectContaining({ reason: 'unsupported-source' }),
        expect.objectContaining({ reason: 'missing-source' }),
        expect.objectContaining({ reason: 'stale' }),
      ]),
    );
  });
});

function makeChunk(
  id: string,
  text: string,
  line: number,
  relevance = { score: 1, signals: [] },
): CharacterEvidenceChunk {
  return {
    id,
    text,
    sourceRefs: [
      {
        id: `entity:cases/test.fountain:${line}`,
        kind: 'entity-occurrence',
        providerId: 'fountain-content',
        projectRelativePath: 'cases/test.fountain',
        location: `cases/test.fountain:${line}`,
        lineStart: line,
        lineEnd: line + 2,
        freshness: 'fresh',
      },
    ],
    authority: 'confirmed',
    relevance,
    freshness: 'fresh',
  };
}

function makeSearchItem(
  id: string,
  relativePath: string,
  lineStart: number,
  lineEnd: number,
  freshness: 'fresh' | 'partial' | 'building' | 'stale' | 'failed' = 'fresh',
) {
  const filePath = `/project/${relativePath}`;
  return {
    id,
    kind: 'story-scene' as const,
    label: 'Scene',
    source: {
      partition: 'story-symbols' as const,
      sourceId: id,
      sourceKind: 'story-scene',
      filePath,
      projectRelativePath: relativePath,
    },
    projectRoot: '/project',
    filePath,
    searchText: 'Lin scene',
    navigationData: {
      filePath,
      lineStart: lineStart - 1,
      lineEnd: lineEnd - 1,
    },
    freshness,
  };
}

function makeNumberedScript(
  lineCount: number,
  overrides: Readonly<Record<number, string>>,
): string {
  return Array.from({ length: lineCount }, (_, index) => {
    const line = index + 1;
    return overrides[line] ?? `Line ${line}`;
  }).join('\n');
}
