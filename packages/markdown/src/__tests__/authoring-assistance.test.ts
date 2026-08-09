import { describe, expect, it } from 'vitest';
import {
  isPortableMarkdownResourceTarget,
  projectMarkdownAuthoringAssistance,
  type MarkdownAuthoringCandidate,
} from '../authoring-assistance';

const candidates: readonly MarkdownAuthoringCandidate[] = [
  {
    kind: 'mention',
    label: '小橘',
    detail: 'Character',
    ref: { kind: 'character', id: 'character-1' },
  },
  {
    kind: 'mention',
    label: '小橘',
    detail: 'Canvas node',
    ref: { kind: 'canvas-node', id: 'node-2', namespace: 'canvas-1' },
  },
  {
    kind: 'resource',
    label: '封面',
    target: 'assets/cover.png',
    detail: 'PNG image',
    embeddable: true,
    ref: { kind: 'workspace-file', id: 'assets/cover.png' },
  },
  {
    kind: 'resource',
    label: '剧本',
    target: 'script/story.md#第二幕',
    embeddable: false,
    ref: { kind: 'workspace-file', id: 'script/story.md' },
  },
];

describe('Markdown authoring assistance', () => {
  it('projects duplicate mention labels as distinct stable candidates with one exact range', () => {
    const source = '参与者：@小';
    const projection = projectMarkdownAuthoringAssistance({
      source,
      caretOffset: source.length,
      candidates,
    });

    expect(projection?.context).toEqual({
      kind: 'mention',
      query: '小',
      replacementRange: { startOffset: 4, endOffset: 6 },
    });
    expect(projection?.items).toEqual([
      expect.objectContaining({
        id: 'mention::character:character-1',
        insertText: '@小橘',
      }),
      expect.objectContaining({
        id: 'mention:canvas-1:canvas-node:node-2',
        insertText: '@小橘',
      }),
    ]);
  });

  it('projects resource links and embeds with portable source tokens', () => {
    const linkSource = '参见 [[story';
    const link = projectMarkdownAuthoringAssistance({
      source: linkSource,
      caretOffset: linkSource.length,
      candidates,
    });
    expect(link?.context).toEqual({
      kind: 'resource-link',
      query: 'story',
      replacementRange: { startOffset: 3, endOffset: linkSource.length },
    });
    expect(link?.items).toEqual([
      expect.objectContaining({ insertText: '[[script/story.md#第二幕]]' }),
    ]);

    const embedSource = '![[cover';
    const embed = projectMarkdownAuthoringAssistance({
      source: embedSource,
      caretOffset: embedSource.length,
      candidates,
    });
    expect(embed?.context.kind).toBe('resource-embed');
    expect(embed?.items).toEqual([
      expect.objectContaining({ insertText: '![[assets/cover.png]]' }),
    ]);
  });

  it.each([
    '`@小`',
    '```md\n@小',
    '<span>@小</span>',
    '[label](target@小)',
    '`![[assets/co`',
    '```md\n![[assets/co',
    '<span>![[assets/co</span>',
  ])('does not offer Workspace completion in excluded parser context: %s', (source) => {
    const caretOffset = source.includes('</')
      ? source.indexOf('</')
      : source.startsWith('`') && source.endsWith('`')
        ? source.length - 1
        : source.length;
    expect(projectMarkdownAuthoringAssistance({ source, caretOffset, candidates })).toBeUndefined();
  });

  it('keeps incomplete trigger input available without requiring a complete document parse node', () => {
    expect(
      projectMarkdownAuthoringAssistance({ source: '资源 ![[', caretOffset: 6, candidates })
        ?.context,
    ).toEqual({
      kind: 'resource-embed',
      query: '',
      replacementRange: { startOffset: 3, endOffset: 6 },
    });
    expect(
      projectMarkdownAuthoringAssistance({ source: '角色 @', caretOffset: 4, candidates })?.context,
    ).toEqual({
      kind: 'mention',
      query: '',
      replacementRange: { startOffset: 3, endOffset: 4 },
    });
  });

  it('keeps an extra resource opening bracket as malformed source instead of another trigger', () => {
    expect(
      projectMarkdownAuthoringAssistance({ source: '![[[', caretOffset: 4, candidates }),
    ).toBeUndefined();
  });

  it('offers bounded GFM snippets only at an eligible line prefix', () => {
    const source = '# Title\n\n';
    const projection = projectMarkdownAuthoringAssistance({
      source,
      caretOffset: source.length,
      includeGfmSnippets: true,
    });
    expect(projection?.context.kind).toBe('gfm-snippet');
    expect(projection?.items.map((item) => item.id)).toEqual([
      'gfm:heading',
      'gfm:task-list',
      'gfm:table',
      'gfm:fenced-code',
    ]);
    expect(
      projectMarkdownAuthoringAssistance({
        source: '```\n\n```',
        caretOffset: 5,
        includeGfmSnippets: true,
      }),
    ).toBeUndefined();
  });

  it('rejects invalid candidate syntax locally while preserving valid siblings', () => {
    const source = '@';
    const projection = projectMarkdownAuthoringAssistance({
      source,
      caretOffset: source.length,
      candidates: [
        ...candidates,
        {
          kind: 'mention',
          label: 'name with spaces',
          ref: { kind: 'character', id: 'invalid' },
        },
      ],
    });
    expect(projection?.items).toHaveLength(2);
    expect(projection?.diagnostics).toEqual([
      expect.objectContaining({
        code: 'MD_AUTHORING_CANDIDATE_INVALID',
        parameters: { field: 'mention-label', value: 'name with spaces' },
      }),
    ]);
  });

  it.each([
    '/Users/neko/image.png',
    'C:\\Users\\neko\\image.png',
    '\\\\server\\image.png',
    'file:///tmp/image.png',
    'openneko://resource/0123456789abcdefghijklmnopqrstuv',
    'assets/../secret.png',
    './assets/image.png',
    'assets//image.png',
    'assets\\image.png',
    'assets/.hidden.png',
    'assets/image:alternate.png',
    ' assets/image.png',
  ])('rejects non-portable resource candidate target: %s', (target) => {
    expect(isPortableMarkdownResourceTarget(target)).toBe(false);
    const projection = projectMarkdownAuthoringAssistance({
      source: '![[',
      caretOffset: 3,
      candidates: [
        ...candidates,
        {
          kind: 'resource',
          label: 'Invalid',
          target,
          embeddable: true,
          ref: { kind: 'workspace-file', id: 'invalid' },
        },
      ],
    });
    expect(projection?.items.some((item) => item.ref?.id === 'invalid')).toBe(false);
    expect(projection?.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'MD_AUTHORING_CANDIDATE_INVALID',
        parameters: { field: 'resource-target', value: target },
      }),
    );
  });

  it('throws on a caret outside the authoritative source', () => {
    expect(() => projectMarkdownAuthoringAssistance({ source: 'text', caretOffset: 5 })).toThrow(
      'outside source length 4',
    );
  });
});

describe('portable Markdown resource targets', () => {
  it.each(['assets/cover.png', 'script/story.md#第二幕', 'neko/assets/library/clip.mp4'])(
    'accepts Workspace-relative target %s',
    (target) => expect(isPortableMarkdownResourceTarget(target)).toBe(true),
  );
});
