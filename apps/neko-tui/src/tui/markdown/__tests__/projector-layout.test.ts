import { describe, expect, it } from 'vitest';
import { parseNormalizedMarkdown } from '@neko/markdown';
import { createTestTerminalMarkdownMessages } from '../../presentation/testing';
import { layoutTerminalMarkdown } from '../layout';
import { projectTerminalMarkdown } from '../projector';
import { DEFAULT_MARKDOWN_RESOURCE_POLICY } from '../resource-policy';
import { layoutTerminalTable } from '../table-layout';
import { terminalTextMetrics } from '../text-metrics';
import type { TerminalTableBlock } from '../terminal-blocks';

function project(source: string) {
  const parsed = parseNormalizedMarkdown(source);
  if (parsed.status !== 'ready')
    throw new Error(`Parse failed: ${JSON.stringify(parsed.diagnostics)}`);
  return projectTerminalMarkdown(parsed.document, {
    labels: createTestTerminalMarkdownMessages('en'),
  });
}

function text(segments: readonly { readonly text: string }[]): string {
  return segments.map((segment) => segment.text).join('');
}

describe('pure terminal Markdown projector', () => {
  it('projects nested inline roles, lists, raw HTML, extensions, images, and links with provenance', () => {
    const projection = project(
      [
        '# **Strong _nested_**',
        '',
        '- [x] Visit [safe](https://example.com) and [local](file:///tmp/x)',
        '- `code` ~~gone~~ @Neko ![[asset.png]]',
        '',
        '<span>literal</span>',
        '',
        '![cat](https://example.com/cat.png)',
      ].join('\n'),
    );

    expect(projection.blocks.map((block) => block.kind)).toEqual([
      'heading',
      'list',
      'paragraph',
      'paragraph',
    ]);
    const heading = projection.blocks[0];
    expect(heading?.kind).toBe('heading');
    if (heading?.kind !== 'heading') throw new Error('expected heading');
    expect(text(heading.segments)).toBe('Strong nested');
    expect(heading.segments.some((segment) => segment.style?.attributes?.bold)).toBe(true);
    expect(heading.segments.some((segment) => segment.style?.attributes?.italic)).toBe(true);
    expect(heading.provenance.kind).toBe('source');

    const list = projection.blocks[1];
    if (list?.kind !== 'list') throw new Error('expected list');
    expect(list.items[0]?.checked).toBe(true);
    const firstParagraph = list.items[0]?.blocks[0];
    if (firstParagraph?.kind !== 'paragraph') throw new Error('expected paragraph');
    expect(
      firstParagraph.segments.some(
        (segment) => segment.hyperlink?.target === 'https://example.com/',
      ),
    ).toBe(true);
    expect(text(firstParagraph.segments)).toContain('file:///tmp/x');

    const raw = projection.blocks[2];
    if (raw?.kind !== 'paragraph') throw new Error('expected inline raw html paragraph');
    expect(text(raw.segments)).toContain('<span>literal</span>');
  });

  it('lays out without React, Ink, or ANSI and preserves Unicode width', () => {
    const projection = project('## 你好 👩🏽‍💻\n\n> **quoted** text');
    const layout = layoutTerminalMarkdown(
      { projection, viewportWidth: 12, supportsUnicode: true },
      { labels: createTestTerminalMarkdownMessages('en') },
    );
    expect(layout.lines.every((line) => line.displayWidth <= 12)).toBe(true);
    expect(layout.lines.map((line) => text(line.segments)).join('\n')).toContain('## 你好 👩🏽‍💻');
    expect(layout.lines.map((line) => text(line.segments)).join('\n')).toContain('│ quoted');
    expect(layout.lines.map((line) => text(line.segments)).join('')).not.toContain('\u001b');
  });

  it('keeps unsafe controls as inert semantic text until the encoding boundary', () => {
    const projection = project('provider \u001b[2J text');
    const paragraph = projection.blocks[0];
    if (paragraph?.kind !== 'paragraph') throw new Error('expected paragraph');
    expect(text(paragraph.segments)).toContain('\u001b[2J');
  });
});

describe('adaptive table layout', () => {
  const table = project(
    [
      '| 名称 | Description | URL |',
      '| :--- | :----------: | ---: |',
      '| 猫 | narrative value with several words | https://example.com/very/long/token |',
      '| 缺失 | short | |',
    ].join('\n'),
  ).blocks[0] as TerminalTableBlock;

  it('profiles columns and selects grid, vertical, and stacked modes deterministically', () => {
    const labels = createTestTerminalMarkdownMessages('en');
    const wide = layoutTerminalTable(
      table,
      100,
      terminalTextMetrics,
      DEFAULT_MARKDOWN_RESOURCE_POLICY,
      labels,
      true,
    );
    const narrow = layoutTerminalTable(
      table,
      30,
      terminalTextMetrics,
      DEFAULT_MARKDOWN_RESOURCE_POLICY,
      labels,
      true,
    );
    const tiny = layoutTerminalTable(
      table,
      16,
      terminalTextMetrics,
      DEFAULT_MARKDOWN_RESOURCE_POLICY,
      labels,
      false,
    );
    expect(wide.mode).toBe('aligned-grid');
    expect(narrow.mode).toBe('vertical-records');
    expect(tiny.mode).toBe('stacked-records');
    expect(wide.profiles.map((profile) => profile.kind)).toContain('token-heavy');
    expect(wide.lines.map((line) => text(line.segments)).join('\n')).toContain('猫');
    expect(narrow.lines.map((line) => text(line.segments)).join('\n')).toContain('Description:');
    expect(tiny.lines.map((line) => text(line.segments)).join('\n')).toContain('URL');
  });

  it('rectangularizes ragged rows for presentation without dropping extra columns', () => {
    const ragged = project('| A |\n| - |\n| one | extra |').blocks[0];
    if (ragged?.kind !== 'table') throw new Error('expected table');
    expect(ragged.header).toHaveLength(2);
    expect(ragged.header[1]?.provenance.reason).toBe('synthetic-table-header');
    expect(ragged.rows[0]).toHaveLength(2);
    expect(text(ragged.rows[0]?.[1]?.segments ?? [])).toBe('extra');
  });

  it('enforces grid budget at limit minus one, limit, and limit plus one with a diagnostic', () => {
    const labels = createTestTerminalMarkdownMessages('en');
    const policy = { ...DEFAULT_MARKDOWN_RESOURCE_POLICY, tableGridMaxCells: 3 };
    const below = project('| A |\n| - |\n| one |').blocks[0] as TerminalTableBlock;
    const exact = project('| A |\n| - |\n| one |\n| two |').blocks[0] as TerminalTableBlock;
    const over = project('| A |\n| - |\n| one |\n| two |\n| three |')
      .blocks[0] as TerminalTableBlock;
    expect(
      layoutTerminalTable(below, 100, terminalTextMetrics, policy, labels, true).gridBudgetExceeded,
    ).toBe(false);
    expect(
      layoutTerminalTable(exact, 100, terminalTextMetrics, policy, labels, true).gridBudgetExceeded,
    ).toBe(false);
    const overResult = layoutTerminalTable(over, 100, terminalTextMetrics, policy, labels, true);
    expect(overResult.gridBudgetExceeded).toBe(true);
    expect(overResult.mode).not.toBe('aligned-grid');
    const layout = layoutTerminalMarkdown(
      {
        projection: project('| A |\n| - |\n| one |\n| two |\n| three |'),
        viewportWidth: 100,
        supportsUnicode: true,
      },
      { labels, policy },
    );
    expect(layout.lines.map((line) => text(line.segments)).join('\n')).toContain(
      'table grid budget exceeded (4 cells)',
    );
  });

  it('preserves escaped pipes, multiline cell segments, GFM alignment, Unicode, and long tokens', () => {
    const escaped = project(
      '| Left | Center | Right |\n| :--- | :---: | ---: |\n| a \\| b | 你好 | veryLongTokenWithoutBreaks |',
    ).blocks[0];
    if (escaped?.kind !== 'table') throw new Error('expected table');
    expect(text(escaped.rows[0]?.[0]?.segments ?? [])).toBe('a | b');
    expect(escaped.alignments).toEqual(['left', 'center', 'right']);
    const multiline: TerminalTableBlock = {
      ...escaped,
      rows: [
        [
          { ...escaped.rows[0]![0]!, segments: [{ text: 'first\nsecond' }] },
          escaped.rows[0]![1]!,
          escaped.rows[0]![2]!,
        ],
      ],
    };
    const result = layoutTerminalTable(
      multiline,
      100,
      terminalTextMetrics,
      DEFAULT_MARKDOWN_RESOURCE_POLICY,
      createTestTerminalMarkdownMessages('en'),
      true,
    );
    const output = result.lines.map((line) => text(line.segments)).join('\n');
    expect(output).toContain('first');
    expect(output).toContain('second');
    expect(output).toContain('你好');
    expect(output).toContain('veryLongTokenWithoutBreaks');
  });
});

describe('structured terminal resource targets', () => {
  it('keeps arbitrary file targets visible and non-clickable with a typed diagnostic', () => {
    const projection = project('[workspace](file:///tmp/secret)');
    const paragraph = projection.blocks[0];
    if (paragraph?.kind !== 'paragraph') throw new Error('expected paragraph');
    expect(text(paragraph.segments)).toBe('workspace (file:///tmp/secret)');
    expect(paragraph.segments.every((segment) => segment.hyperlink === undefined)).toBe(true);
    expect(projection.diagnostics.map((diagnostic) => text(diagnostic.segments))).toContain(
      'unsupported destination: file:///tmp/secret',
    );
  });

  it('accepts only an explicitly authorization-associated local-resource result', () => {
    const parsed = parseNormalizedMarkdown('[workspace](file:///workspace/asset.png)');
    if (parsed.status !== 'ready') throw new Error('parse failed');
    const projection = projectTerminalMarkdown(parsed.document, {
      labels: createTestTerminalMarkdownMessages('en'),
      targetResolver: {
        resolve(request) {
          return {
            kind: 'authorized-local-resource',
            target: request.destination,
            displayTarget: '${WORKSPACE}/asset.png',
            authorizationId: 'workspace-root-v1',
          };
        },
      },
    });
    const paragraph = projection.blocks[0];
    if (paragraph?.kind !== 'paragraph') throw new Error('expected paragraph');
    expect(paragraph.segments[0]?.hyperlink).toEqual({
      kind: 'authorized-local-resource',
      target: 'file:///workspace/asset.png',
      authorizationId: 'workspace-root-v1',
    });
    expect(projection.diagnostics).toHaveLength(0);
  });

  it('projects images as alt plus destination in an ordinary terminal representation', () => {
    const projection = project('![cat](https://example.com/cat.png)');
    const paragraph = projection.blocks[0];
    if (paragraph?.kind !== 'paragraph') throw new Error('expected paragraph');
    expect(text(paragraph.segments)).toContain('[image: cat] (https://example.com/cat.png)');
    expect(paragraph.segments[0]?.hyperlink?.kind).toBe('web');
  });
});

describe('code visual wrapping', () => {
  it('expands tabs from the current visual column', () => {
    const projection = project('```text\na\tb\n```');
    const layout = layoutTerminalMarkdown(
      { projection, viewportWidth: 8, supportsUnicode: true },
      { labels: createTestTerminalMarkdownMessages('en') },
    );
    const codeLine = layout.lines.find((line) => line.logicalLine === 1);
    const visualCode = codeLine?.segments
      .filter((segment) => segment.style?.markdownRole !== 'code-border')
      .map((segment) => segment.text)
      .join('');
    expect(visualCode).toBe('a   b');
    expect(codeLine?.displayWidth).toBe(7);
  });

  it('prefers natural boundaries, preserves long tokens, and associates fragments with source lines', () => {
    const projection = project(
      '```ts\nconst longIdentifierWithoutBreaks = "👩🏽‍💻👩🏽‍💻👩🏽‍💻";\nnext();\n```',
    );
    const layout = layoutTerminalMarkdown(
      { projection, viewportWidth: 12, supportsUnicode: true },
      { labels: createTestTerminalMarkdownMessages('en') },
    );
    const codeLines = layout.lines.filter((line) => line.logicalLine !== undefined);
    expect(codeLines.length).toBeGreaterThan(2);
    expect(codeLines.some((line) => line.continuation)).toBe(true);
    expect(codeLines.every((line) => line.sourceRange !== undefined)).toBe(true);
    const visualCode = codeLines
      .flatMap((line) => line.segments)
      .filter((segment) => segment.style?.markdownRole !== 'code-border')
      .map((segment) => segment.text)
      .join('');
    expect(visualCode).toBe('const longIdentifierWithoutBreaks = "👩🏽‍💻👩🏽‍💻👩🏽‍💻";next();');
  });
});
