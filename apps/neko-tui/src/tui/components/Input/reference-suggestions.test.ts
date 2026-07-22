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

  it('treats ordinary asset and media directories as workspace files', async () => {
    await fs.mkdir(path.join(tempRoot, 'assets', 'shots'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'media'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'assets', 'shots', 'hero image.png'), 'image\n');
    await fs.writeFile(path.join(tempRoot, 'media', 'voice.wav'), 'audio\n');
    await fs.writeFile(path.join(tempRoot, 'notes.md'), 'notes\n');

    const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'assets/shots/hero image.png',
          kind: 'file',
          description: expect.stringContaining('workspace file'),
          insertText: '@"assets/shots/hero image.png" ',
        }),
        expect.objectContaining({
          name: 'media/voice.wav',
          kind: 'file',
          description: expect.stringContaining('workspace file'),
          insertText: '@media/voice.wav ',
        }),
      ]),
    );
    expect(suggestions.map((suggestion) => suggestion.name)).toContain('notes.md');
  });

  it('localizes linked Media Library descriptions when TUI locale is Chinese', async () => {
    const mediaRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-media-zh-'));
    try {
      await fs.writeFile(path.join(mediaRoot, 'hero.png'), 'image\n');
      const assetsRoot = path.join(tempRoot, 'neko', 'assets');
      await fs.mkdir(assetsRoot, { recursive: true });
      await fs.symlink(mediaRoot, path.join(assetsRoot, '图片'), directoryLinkType());

      const suggestions = await createTuiReferenceSuggestionsWithOptions({
        workspaceRoot: tempRoot,
        presentation: TEST_ZH_PRESENTATION,
      });

      expect(suggestions[0]).toMatchObject({
        name: 'neko/assets/图片/hero.png',
        kind: 'media',
        description: expect.stringContaining('图片 · 图像'),
      });
    } finally {
      await fs.rm(mediaRoot, { recursive: true, force: true });
    }
  });

  it('projects workspace-linked media libraries through canonical workspace paths', async () => {
    const mediaRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-media-root-'));
    const overrideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-media-override-'));
    try {
      await fs.mkdir(path.join(mediaRoot, 'voice'), { recursive: true });
      await fs.mkdir(path.join(overrideRoot, 'shots'), { recursive: true });
      await fs.writeFile(path.join(mediaRoot, 'voice', 'line.wav'), 'audio\n');
      await fs.writeFile(path.join(overrideRoot, 'shots', 'take.mov'), 'video\n');
      const assetsRoot = path.join(tempRoot, 'neko', 'assets');
      await fs.mkdir(assetsRoot, { recursive: true });
      await fs.symlink(mediaRoot, path.join(assetsRoot, 'Project Media'), directoryLinkType());
      await fs.symlink(overrideRoot, path.join(assetsRoot, 'Local Override'), directoryLinkType());
      await fs.symlink(
        path.join(tempRoot, 'missing-media-root'),
        path.join(assetsRoot, 'Disabled Media'),
        directoryLinkType(),
      );

      const suggestions = await createTuiReferenceSuggestions({ workspaceRoot: tempRoot });

      expect(suggestions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'neko/assets/Project Media/voice/line.wav',
            kind: 'media',
            description: expect.stringContaining('Project Media · audio'),
            insertText: '@"neko/assets/Project Media/voice/line.wav" ',
          }),
          expect.objectContaining({
            name: 'neko/assets/Local Override/shots/take.mov',
            kind: 'media',
            description: expect.stringContaining('Local Override · video'),
            insertText: '@"neko/assets/Local Override/shots/take.mov" ',
          }),
        ]),
      );
      expect(suggestions.map((suggestion) => suggestion.name)).not.toContain(
        'neko/assets/Disabled Media/voice/line.wav',
      );
    } finally {
      await fs.rm(mediaRoot, { recursive: true, force: true });
      await fs.rm(overrideRoot, { recursive: true, force: true });
    }
  });

  it('finds workspace file query matches amid many generated workspace files', async () => {
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
            sourceId: 'neko/assets/Reference Books/BLAME/volume-01.epub',
            filePath: 'neko/assets/Reference Books/BLAME/volume-01.epub',
          },
          fileKey: 'neko/assets/Reference Books/BLAME/volume-01.epub',
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
          insertText: '@"neko/assets/Reference Books/BLAME/volume-01.epub" ',
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
          kind: 'media',
          id: 'media-hero',
          label: 'Hero Key Art',
          description: 'Approved cover frame',
          filePath: 'neko/assets/Images/hero.png',
          source: 'media-library',
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
      kind: 'media',
      description: expect.stringContaining('media-library · image'),
      matchText: expect.stringContaining('cover poster'),
      insertText: '@neko/assets/Images/hero.png ',
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
          id: 'media-library',
          displayName: 'Media Library',
          search: async () => ({
            diagnostics: [],
            candidates: [
              {
                id: 'media:hero',
                label: 'Hero Concept',
                source: 'media-library',
                kind: 'media',
                insertText: '@neko/assets/Images/hero.png',
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
      kind: 'media',
      description: 'media-library · media · Main character key art',
      insertText: '@neko/assets/Images/hero.png ',
    });
    expect(suggestions[0]?.description).not.toContain('/tmp/');
    expect(suggestions.map((suggestion) => suggestion.name)).toContain('brief.md');
  });
});

function directoryLinkType(): 'dir' | 'junction' {
  return process.platform === 'win32' ? 'junction' : 'dir';
}
