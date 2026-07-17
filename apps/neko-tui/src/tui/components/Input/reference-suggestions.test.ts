import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator } from '@neko/shared/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentTerminalPresentationContext } from '../../presentation/context';
import { createAgentTerminalFormatters } from '../../presentation/formatters';
import { CLI_TERMINAL_MESSAGE_SOURCE } from '../../presentation/terminal-messages';
import {
  createTuiReferenceSuggestions as createTuiReferenceSuggestionsWithOptions,
  type TuiReferenceSuggestionOptions,
} from './reference-suggestions';

let tempRoot: string;
function createTestPresentation(locale: 'en' | 'zh-cn') {
  return createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: createAgentTerminalFormatters({ locale, timeZone: 'UTC' }),
  });
}

const TEST_PRESENTATION = createTestPresentation('en');
const TEST_ZH_PRESENTATION = createTestPresentation('zh-cn');

async function createTuiReferenceSuggestions(
  options: Omit<TuiReferenceSuggestionOptions, 'presentation'>,
) {
  return createTuiReferenceSuggestionsWithOptions({
    ...options,
    presentation: TEST_PRESENTATION,
  });
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-refs-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('createTuiReferenceSuggestions', () => {
  it('returns terminal-safe workspace-relative file references', async () => {
    await fs.mkdir(path.join(tempRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'src', 'story.md'), '# Story\n');
    await fs.writeFile(path.join(tempRoot, 'src', 'shot list.md'), 'shot 1\n');

    const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });

    expect(suggestions.map((suggestion) => suggestion.name)).toEqual([
      'src/shot list.md',
      'src/story.md',
    ]);
    expect(suggestions[0]).toMatchObject({
      trigger: '@',
      kind: 'file',
      insertText: '@"src/shot list.md" ',
    });
    expect(suggestions[1]?.insertText).toBe('@src/story.md ');
  });

  it('skips mention-excluded workspace directories', async () => {
    await fs.mkdir(path.join(tempRoot, 'node_modules/pkg'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, '.neko'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'node_modules/pkg/index.ts'), 'hidden\n');
    await fs.writeFile(path.join(tempRoot, '.neko', 'memory.md'), 'hidden\n');
    await fs.writeFile(path.join(tempRoot, 'visible.md'), 'ok\n');

    const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });

    expect(suggestions.map((suggestion) => suggestion.name)).toEqual(['visible.md']);
  });

  it('respects scan limit and depth', async () => {
    await fs.mkdir(path.join(tempRoot, 'a/b/c'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'a', 'one.md'), '1\n');
    await fs.writeFile(path.join(tempRoot, 'a', 'two.md'), '2\n');
    await fs.writeFile(path.join(tempRoot, 'a/b/c', 'deep.md'), 'deep\n');

    const suggestions = await createTuiReferenceSuggestions({
      workspaceRoot: tempRoot,
      limit: 1,
      maxDepth: 1,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.name).toBe('a/one.md');
  });

  it('projects local asset and media library files before ordinary workspace files', async () => {
    await fs.mkdir(path.join(tempRoot, 'assets', 'shots'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'media'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'assets', 'shots', 'hero image.png'), 'image\n');
    await fs.writeFile(path.join(tempRoot, 'media', 'voice.wav'), 'audio\n');
    await fs.writeFile(path.join(tempRoot, 'notes.md'), 'notes\n');

    const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });

    expect(suggestions.slice(0, 2)).toMatchObject([
      {
        name: 'assets/shots/hero image.png',
        kind: 'asset',
        description: expect.stringContaining('asset-library · image'),
        insertText: '@"assets/shots/hero image.png" ',
      },
      {
        name: 'media/voice.wav',
        kind: 'media',
        description: expect.stringContaining('media-library · audio'),
        insertText: '@media/voice.wav ',
      },
    ]);
    expect(suggestions.map((suggestion) => suggestion.name)).toContain('notes.md');
  });

  it('localizes local library descriptions when TUI locale is Chinese', async () => {
    await fs.mkdir(path.join(tempRoot, 'assets'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'assets', 'hero.png'), 'image\n');

    const suggestions = await createTuiReferenceSuggestionsWithOptions({
      workspaceRoot: tempRoot,
      presentation: TEST_ZH_PRESENTATION,
    });

    expect(suggestions[0]).toMatchObject({
      name: 'assets/hero.png',
      kind: 'asset',
      description: expect.stringContaining('素材库 · 图像'),
    });
  });

  it('projects configured media library roots through durable variable references', async () => {
    const mediaRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-media-root-'));
    const overrideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-media-override-'));
    try {
      await fs.mkdir(path.join(mediaRoot, 'voice'), { recursive: true });
      await fs.mkdir(path.join(overrideRoot, 'shots'), { recursive: true });
      await fs.writeFile(path.join(mediaRoot, 'voice', 'line.wav'), 'audio\n');
      await fs.writeFile(path.join(overrideRoot, 'shots', 'take.mov'), 'video\n');
      await fs.mkdir(path.join(tempRoot, 'neko'), { recursive: true });
      await fs.mkdir(path.join(tempRoot, '.neko'), { recursive: true });
      await fs.writeFile(
        path.join(tempRoot, 'neko', 'settings.json'),
        JSON.stringify({
          mediaLibraries: [
            { name: 'Project Media', path: mediaRoot, variable: 'PROJECT_MEDIA' },
            {
              name: 'Local Override',
              path: path.join(tempRoot, 'missing-media-root'),
              variable: 'LOCAL_MEDIA',
            },
            { name: 'Disabled Media', path: mediaRoot, variable: 'DISABLED_MEDIA', enabled: false },
          ],
        }),
      );
      await fs.writeFile(
        path.join(tempRoot, '.neko', 'settings.local.json'),
        JSON.stringify({
          mediaLibraryOverrides: {
            LOCAL_MEDIA: overrideRoot,
          },
        }),
      );

      const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });

      expect(suggestions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: '${PROJECT_MEDIA}/voice/line.wav',
            kind: 'media',
            description: expect.stringContaining('Project Media · audio'),
            insertText: '@${PROJECT_MEDIA}/voice/line.wav ',
          }),
          expect.objectContaining({
            name: '${LOCAL_MEDIA}/shots/take.mov',
            kind: 'media',
            description: expect.stringContaining('Local Override · video'),
            insertText: '@${LOCAL_MEDIA}/shots/take.mov ',
          }),
        ]),
      );
      expect(suggestions.map((suggestion) => suggestion.name)).not.toContain(
        '${DISABLED_MEDIA}/voice/line.wav',
      );
    } finally {
      await fs.rm(mediaRoot, { recursive: true, force: true });
      await fs.rm(overrideRoot, { recursive: true, force: true });
    }
  });

  it('projects asset library facts as stable asset references', async () => {
    await fs.mkdir(path.join(tempRoot, 'neko', 'assets'), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, 'neko', 'assets', 'library.json'),
      JSON.stringify({
        version: 1,
        entities: [
          {
            id: 'asset-hero',
            name: 'Hero Concept',
            category: 'image',
            description: 'Approved key art',
            metadata: {},
            variants: [
              {
                id: 'variant-hero',
                entityId: 'asset-hero',
                name: 'Default',
                attributes: {},
                files: [
                  {
                    id: 'file-hero',
                    variantId: 'variant-hero',
                    name: 'hero.png',
                    path: '${ASSETS}/hero.png',
                    mediaType: 'image',
                    metadata: {},
                    createdAt: 1,
                  },
                ],
                createdAt: 1,
              },
            ],
            tags: ['cover'],
            aliases: ['protagonist'],
            usageCount: 0,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    );

    const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });
    const hero = suggestions.find((suggestion) => suggestion.name === 'Hero Concept');

    expect(hero).toMatchObject({
      kind: 'asset',
      description: expect.stringContaining('asset-library · image · image · Approved key art'),
      matchText: expect.stringContaining('protagonist'),
      insertText: '@asset:asset-hero ',
    });
  });

  it('finds workspace file query matches even when library candidates fill the default list', async () => {
    await fs.mkdir(path.join(tempRoot, 'neko', 'generated', 'image'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'cases'), { recursive: true });
    for (let index = 0; index < 100; index += 1) {
      await fs.writeFile(
        path.join(tempRoot, 'neko', 'generated', 'image', `asset-${index}.png`),
        'image\n',
      );
    }
    await fs.writeFile(path.join(tempRoot, 'cases', 'target-shot.fountain'), 'shot\n');

    const suggestions = await createTuiReferenceSuggestions({
      workspaceRoot: tempRoot,
      query: 'target-shot',
      limit: 20,
    });

    expect(suggestions[0]).toMatchObject({
      name: 'cases/target-shot.fountain',
      kind: 'file',
      insertText: '@cases/target-shot.fountain ',
    });
  });

  it('does not project the retired workspace search index', async () => {
    const mediaRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-index-media-'));
    try {
      await fs.mkdir(path.join(tempRoot, 'neko'), { recursive: true });
      await fs.mkdir(path.join(tempRoot, '.neko', '.cache'), { recursive: true });
      await fs.writeFile(
        path.join(tempRoot, 'neko', 'settings.json'),
        JSON.stringify({
          mediaLibraries: [{ name: '素材', path: mediaRoot, variable: 'A' }],
        }),
      );
      await fs.writeFile(
        path.join(tempRoot, '.neko', '.cache', 'search-index.json'),
        JSON.stringify({
          version: 1,
          entries: [
            {
              filePath: path.join(
                mediaRoot,
                'epub',
                'animation',
                'Blame',
                '[Kmoe][BLAME！(新裝版)]卷01.epub',
              ),
              fileName: '[Kmoe][BLAME！(新裝版)]卷01.epub',
              libraryName: '素材',
              mediaType: 'document',
            },
          ],
        }),
      );

      const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });
      const blame = suggestions.find((suggestion) => suggestion.name.includes('BLAME'));

      expect(blame).toBeUndefined();
    } finally {
      await fs.rm(mediaRoot, { recursive: true, force: true });
    }
  });

  it('projects shared SQLite search documents without reading a workspace cache index', async () => {
    const suggestions = await createTuiReferenceSuggestions({
      workspaceRoot: tempRoot,
      searchDocuments: async () => [
        {
          documentId: 'media:blame',
          partition: 'media-library',
          kind: 'media',
          label: 'BLAME volume 01.epub',
          description: 'Reference Books',
          source: {
            partition: 'media-library',
            sourceId: '${BOOKS}/BLAME/volume-01.epub',
            filePath: '${BOOKS}/BLAME/volume-01.epub',
          },
          fileKey: '${BOOKS}/BLAME/volume-01.epub',
          searchText: 'BLAME volume 01 Reference Books document',
          freshness: 'fresh',
          metadata: { mediaType: 'document', libraryName: 'Reference Books' },
          updatedAt: '2026-07-13T05:00:00.000Z',
        },
      ],
    });

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'BLAME volume 01.epub',
          kind: 'file',
          description: expect.stringContaining('media-library · document · Reference Books'),
          insertText: '@${BOOKS}/BLAME/volume-01.epub ',
        }),
      ]),
    );
  });

  it('accepts host-provided mention candidates without inserting unsafe durable paths', async () => {
    await fs.writeFile(path.join(tempRoot, 'brief.md'), 'brief\n');

    const suggestions = await createTuiReferenceSuggestions({
      workspaceRoot: tempRoot,
      extraReferences: [
        {
          kind: 'asset',
          id: 'asset-hero',
          label: 'Hero Key Art',
          description: 'Approved cover frame',
          filePath: '${ASSETS}/hero.png',
          source: 'asset-library',
          mediaType: 'image',
          searchText: 'cover poster',
        },
        {
          kind: 'media',
          id: 'unsafe-video',
          label: 'Unsafe Preview',
          filePath: '/tmp/neko-cache/preview.mp4',
          source: 'media-library',
          mediaType: 'video',
        },
      ],
    });

    const hero = suggestions.find((suggestion) => suggestion.name === 'Hero Key Art');
    const unsafe = suggestions.find((suggestion) => suggestion.name === 'Unsafe Preview');

    expect(hero).toMatchObject({
      kind: 'asset',
      description: expect.stringContaining('asset-library · image'),
      matchText: expect.stringContaining('cover poster'),
      insertText: '@${ASSETS}/hero.png ',
    });
    expect(unsafe?.insertText).toBe('@media:unsafe-video ');
    expect(unsafe?.insertText).not.toContain('/tmp/');
  });

  it('merges terminal-safe contributor references before ordinary workspace files', async () => {
    await fs.writeFile(path.join(tempRoot, 'brief.md'), 'brief\n');

    const suggestions = await createTuiReferenceSuggestions({
      workspaceRoot: tempRoot,
      referenceContributors: [
        {
          id: 'neko-assets',
          displayName: 'Assets',
          search: async () => ({
            diagnostics: [],
            candidates: [
              {
                id: 'asset:hero',
                label: 'Hero Concept',
                source: 'assets',
                kind: 'asset',
                insertText: '@asset:hero',
                description: 'Main character key art',
                path: '/tmp/rendered-preview.png',
              },
            ],
          }),
        },
      ],
    });

    expect(suggestions[0]).toMatchObject({
      name: 'Hero Concept',
      kind: 'asset',
      description: 'assets · asset · Main character key art',
      insertText: '@asset:hero ',
    });
    expect(suggestions[0]?.description).not.toContain('/tmp/');
    expect(suggestions.map((suggestion) => suggestion.name)).toContain('brief.md');
  });
});
