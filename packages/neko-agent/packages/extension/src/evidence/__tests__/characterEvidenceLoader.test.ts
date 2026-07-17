import { describe, expect, it, vi } from 'vitest';
import type {
  CreativeEntityRef,
  DashboardCreativeEntityDetail,
  ProjectSearchItem,
} from '@neko/shared';
import {
  createCharacterEvidenceLoader,
  parseCharacterEvidenceLocation,
  resolveCharacterEvidenceProjectPath,
} from '../characterEvidenceLoader';

const projectRoot = '/workspace/project-a';
const entityRef: CreativeEntityRef = {
  entityId: 'char-lin',
  entityKind: 'character',
  projectRoot,
  source: 'neko-story',
};

describe('CharacterEvidenceLoader', () => {
  it('loads late-scene evidence beyond the first six occurrences', async () => {
    const details = [
      makeDetail(
        Array.from({ length: 8 }, (_, index) => ({
          location: `cases/long.fountain:${index < 7 ? 10 + index : 220}`,
          label: 'Lin',
        })),
      ),
    ];
    const script = makeNumberedScript(260, {
      220: 'LIN reveals the late-scene clue about the northern gate.',
    });
    const loader = createCharacterEvidenceLoader({
      projectRoot,
      dashboardReader: { listDetails: vi.fn(async () => details) },
      projectSearchReader: { search: vi.fn(async () => []) },
      storyIndexReader: { getScriptIndex: vi.fn(async () => undefined) },
      textReader: {
        readTextFile: vi.fn(async (filePath) => {
          expect(filePath).toBe('/workspace/project-a/cases/long.fountain');
          return script;
        }),
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

  it('rejects absolute, parent-directory escape, unsupported, and missing sources with omissions', async () => {
    const missingReader = vi.fn(async () => {
      throw new Error('missing');
    });
    const loader = createCharacterEvidenceLoader({
      projectRoot,
      dashboardReader: {
        listDetails: vi.fn(async () => [
          makeDetail([
            { location: '/tmp/outside.fountain:10', label: 'Abs' },
            { location: '../outside.fountain:10', label: 'Escape' },
            { location: 'cases/image.png:10', label: 'Unsupported' },
            { location: 'cases/missing.fountain:10', label: 'Missing' },
          ]),
        ]),
      },
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
    });

    expect(bundle.chunks).toEqual([]);
    expect(bundle.omitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'safety',
          message: expect.stringContaining('/tmp/outside.fountain'),
        }),
        expect.objectContaining({
          reason: 'safety',
          message: expect.stringContaining('../outside.fountain'),
        }),
        expect.objectContaining({
          reason: 'unsupported-source',
          message: expect.stringContaining('cases/image.png'),
        }),
        expect.objectContaining({
          reason: 'missing-source',
          message: expect.stringContaining('cases/missing.fountain'),
        }),
      ]),
    );
    expect(missingReader).toHaveBeenCalledTimes(1);
  });

  it('dedupes Dashboard, occurrence, Story, and search locators for the same range', async () => {
    const projectSearchReader = vi.fn(
      async (): Promise<readonly ProjectSearchItem[]> => [
        makeSearchItem('story-scene-1', 'cases/test.fountain', 30, 34),
      ],
    );
    const loader = createCharacterEvidenceLoader({
      projectRoot,
      dashboardReader: {
        listDetails: vi.fn(async () => [
          makeDetail([{ location: 'cases/test.fountain:30-34', label: 'Lin' }]),
        ]),
      },
      occurrenceReader: {
        listOccurrences: vi.fn(async () => [
          {
            entityRef,
            label: 'Lin',
            role: 'reference',
            location: 'cases/test.fountain:30-34',
            source: {
              sourceId: 'neko-story',
              sourceKind: 'story',
              sourceRef: 'cases/test.fountain:30-34',
              providerId: 'neko-story',
              freshness: 'fresh',
            },
          },
        ]),
      },
      projectSearchReader: { search: projectSearchReader },
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
    expect(bundle.chunks[0]?.text).toContain('LIN notices the sealed door.');
    expect(bundle.chunks[0]?.sourceRefs.map((sourceRef) => sourceRef.kind)).toEqual(
      expect.arrayContaining([
        'dashboard-detail',
        'entity-occurrence',
        'project-search',
        'story-script-index',
      ]),
    );
  });

  it('uses ProjectSearchItem only as a locator and records stale freshness', async () => {
    const loader = createCharacterEvidenceLoader({
      projectRoot,
      dashboardReader: { listDetails: vi.fn(async () => []) },
      projectSearchReader: {
        search: vi.fn(async () => [
          makeSearchItem('scene-stale', 'cases/search.fountain', 5, 8, 'stale'),
        ]),
      },
      storyIndexReader: { getScriptIndex: vi.fn(async () => undefined) },
      textReader: {
        readTextFile: vi.fn(async () =>
          makeNumberedScript(20, { 5: 'LIN remembers only indexed project evidence.' }),
        ),
      },
    });

    const bundle = await loader.loadEvidence({
      entityRef,
      mode: 'character-dialogue',
      query: 'indexed project evidence',
      projectRoot,
      budget: { maxChunks: 4, maxCharacters: 4000, perChunkMaxCharacters: 1000 },
    });

    expect(bundle.chunks[0]?.text).toContain('LIN remembers only indexed project evidence.');
    expect(bundle.omitted).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'stale' })]),
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
        candidatePath: '/workspace/project-a/cases/test.fountain',
        allowAbsolutePath: false,
      }),
    ).toBeNull();
    expect(
      resolveCharacterEvidenceProjectPath({
        projectRoot,
        candidatePath: '/workspace/project-a/cases/test.fountain',
        allowAbsolutePath: true,
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
    expect(
      resolveCharacterEvidenceProjectPath({
        projectRoot,
        candidatePath: 'cases/image.png',
        allowAbsolutePath: false,
      }),
    ).toBeNull();
  });
});

function makeDetail(
  occurrences: readonly { readonly location: string; readonly label: string }[],
): DashboardCreativeEntityDetail {
  return {
    ref: {
      source: 'neko-story',
      sourceEntityId: 'entity:char-lin',
      entityId: 'char-lin',
      entityKind: 'character',
      projectRoot,
    },
    label: 'Lin',
    kind: 'character',
    status: 'confirmed',
    sourceKind: 'script',
    aliases: ['林'],
    relationships: [],
    occurrences: occurrences.map((occurrence) => ({
      source: 'script',
      role: 'reference',
      label: occurrence.label,
      location: occurrence.location,
    })),
    bindings: [],
    defaults: [],
    requirements: [],
    visualDrafts: [],
    syncSuggestions: [],
    freshness: 'fresh',
    actions: [],
  };
}

function makeSearchItem(
  id: string,
  relativePath: string,
  lineStart: number,
  lineEnd: number,
  freshness: ProjectSearchItem['freshness'] = 'fresh',
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
