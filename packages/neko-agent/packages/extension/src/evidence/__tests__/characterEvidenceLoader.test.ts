import { describe, expect, it, vi } from 'vitest';
import type {
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  ProjectSearchItem,
} from '@neko/shared';
import {
  createCharacterEvidenceLoader,
  parseCharacterEvidenceLocation,
  resolveCharacterEvidenceProjectPath,
} from '../characterEvidenceLoader';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

const projectRoot = '/workspace/project-a';
const entityRef: CreativeEntityRef = {
  entityId: 'char-lin',
  entityKind: 'character',
  projectRoot,
  source: 'neko-entity',
};

describe('CharacterEvidenceLoader', () => {
  it('loads late-scene evidence through canonical occurrence readers', async () => {
    const loader = createCharacterEvidenceLoader({
      projectRoot,
      entityReader: { getEntity: vi.fn(async () => makeEntity()) },
      occurrenceReader: {
        listOccurrences: vi.fn(async () =>
          Array.from({ length: 8 }, (_, index) =>
            makeOccurrence(`cases/long.fountain:${index < 7 ? 10 + index : 220}`),
          ),
        ),
      },
      projectSearchReader: { search: vi.fn(async () => []) },
      storyIndexReader: { getScriptIndex: vi.fn(async () => undefined) },
      textReader: {
        readTextFile: vi.fn(async () =>
          makeNumberedScript(260, {
            220: 'LIN reveals the late-scene clue about the northern gate.',
          }),
        ),
      },
      maxWindowLines: 24,
    });

    const bundle = await loader.loadEvidence({
      entityRef,
      mode: 'character-dialogue',
      query: 'What does Lin reveal about the northern gate?',
      projectRoot,
      budget: { maxChunks: 4, maxCharacters: 4000, perChunkMaxCharacters: 1200 },
    });

    expect(bundle.chunks.map((chunk) => chunk.text).join('\n')).toContain(
      '220: LIN reveals the late-scene clue about the northern gate.',
    );
    expect(bundle.chunks[0]?.sourceRefs[0]?.lineStart).toBeGreaterThanOrEqual(208);
  });

  it('rejects unsafe, unsupported, and missing explicit source refs', async () => {
    const missingReader = vi.fn(async () => {
      throw new Error('missing');
    });
    const loader = createCharacterEvidenceLoader({
      projectRoot,
      entityReader: { getEntity: vi.fn(async () => makeEntity()) },
      projectSearchReader: { search: vi.fn(async () => []) },
      storyIndexReader: { getScriptIndex: vi.fn(async () => undefined) },
      textReader: { readTextFile: missingReader },
    });

    const bundle = await loader.loadEvidence({
      entityRef,
      mode: 'embody-character',
      query: 'missing evidence',
      projectRoot,
      budget: { maxChunks: 4, maxCharacters: 4000, perChunkMaxCharacters: 1200 },
      seedSourceRefs: [
        { id: 'abs', kind: 'manual', location: '/tmp/outside.fountain:10' },
        { id: 'escape', kind: 'manual', location: '../outside.fountain:10' },
        { id: 'unsupported', kind: 'manual', location: 'cases/image.png:10' },
        { id: 'missing', kind: 'manual', location: 'cases/missing.fountain:10' },
      ],
    });

    expect(bundle.chunks).toEqual([]);
    expect(bundle.omitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'safety' }),
        expect.objectContaining({ reason: 'unsupported-source' }),
        expect.objectContaining({ reason: 'missing-source' }),
      ]),
    );
    expect(missingReader).toHaveBeenCalledTimes(1);
  });

  it('dedupes occurrence, Story, and search locators for the same range', async () => {
    const loader = createCharacterEvidenceLoader({
      projectRoot,
      entityReader: { getEntity: vi.fn(async () => makeEntity()) },
      occurrenceReader: {
        listOccurrences: vi.fn(async () => [makeOccurrence('cases/test.fountain:30-34')]),
      },
      projectSearchReader: {
        search: vi.fn(async (): Promise<readonly ProjectSearchItem[]> => [
          makeSearchItem('story-scene-1', 'cases/test.fountain', 30, 34),
        ]),
      },
      storyIndexReader: {
        getScriptIndex: vi.fn(async () => ({
          uri: 'file:///workspace/project-a/cases/test.fountain',
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
        })),
      },
      textReader: {
        readTextFile: vi.fn(async () =>
          makeNumberedScript(80, {
            30: 'LIN notices the sealed door.',
            34: 'LIN keeps the clue private.',
          }),
        ),
      },
      maxWindowLines: 6,
    });

    const bundle = await loader.loadEvidence({
      entityRef,
      mode: 'character-validation',
      query: 'sealed door clue',
      projectRoot,
      budget: { maxChunks: 8, maxCharacters: 6000, perChunkMaxCharacters: 1200 },
    });

    expect(bundle.chunks).toHaveLength(1);
    expect(bundle.chunks[0]?.sourceRefs.map((sourceRef) => sourceRef.kind)).toEqual(
      expect.arrayContaining(['entity-occurrence', 'project-search', 'story-script-index']),
    );
  });

  it('parses and resolves project-local evidence paths conservatively', () => {
    expect(parseCharacterEvidenceLocation('cases/test.fountain:10-20')).toEqual({
      candidatePath: 'cases/test.fountain',
      lineStart: 10,
      lineEnd: 20,
    });
    expect(
      resolveCharacterEvidenceProjectPath({
        projectRoot,
        candidatePath: 'cases/test.fountain:10',
        allowAbsolutePath: false,
      }),
    ).toEqual({
      filePath: '/workspace/project-a/cases/test.fountain',
      projectRelativePath: 'cases/test.fountain',
    });
    expect(
      resolveCharacterEvidenceProjectPath({
        projectRoot,
        candidatePath: '../escape.fountain',
        allowAbsolutePath: false,
      }),
    ).toBeNull();
  });
});

function makeEntity() {
  return {
    id: 'char-lin',
    kind: 'character' as const,
    canonicalName: 'Lin',
    aliases: ['林'],
    status: 'confirmed' as const,
  };
}

function makeOccurrence(location: string): CreativeEntityOccurrenceProjection {
  return {
    entityRef,
    label: 'Lin',
    role: 'reference',
    location,
    source: {
      sourceId: 'fountain-content',
      sourceKind: 'story',
      sourceRef: location,
      providerId: 'fountain-content',
      freshness: 'fresh',
    },
  };
}

function makeSearchItem(
  id: string,
  relativePath: string,
  lineStart: number,
  lineEnd: number,
): ProjectSearchItem {
  const filePath = `${projectRoot}/${relativePath}`;
  return {
    id,
    kind: 'story-scene',
    label: 'Scene',
    source: {
      partition: 'story-symbols',
      sourceId: id,
      sourceKind: 'story-scene',
      filePath,
      projectRelativePath: relativePath,
    },
    projectRoot,
    filePath,
    searchText: 'Lin scene',
    navigationData: { filePath, lineStart: lineStart - 1, lineEnd: lineEnd - 1 },
    freshness: 'fresh',
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
