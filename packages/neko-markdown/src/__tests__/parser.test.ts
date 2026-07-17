import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKDOWN_SOURCE_LIMIT_CODE_UNITS,
  parseNormalizedMarkdown,
  type MarkdownNode,
  type NormalizedMarkdownDocument,
} from '../index';

function parse(source: string, options: Parameters<typeof parseNormalizedMarkdown>[1] = {}) {
  const result = parseNormalizedMarkdown(source, options);
  if (result.status !== 'ready') throw new Error('Expected Markdown parse success.');
  return result.document;
}

function collect(document: NormalizedMarkdownDocument): readonly MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  visit(document.root);
  return nodes;

  function visit(node: MarkdownNode): void {
    nodes.push(node);
    if ('children' in node) {
      for (const child of node.children) visit(child);
    }
  }
}

describe('canonical CommonMark/GFM normalization', () => {
  it('preserves the standard semantic baseline as Neko-owned node variants', () => {
    const source = [
      '# Heading *em* **strong** ~~gone~~ `code`',
      '',
      '> quote  ',
      '> hard break',
      '',
      '1. ordered',
      '   - [x] task',
      '   - nested',
      '',
      '---',
      '',
      '    indented()',
      '',
      '```TS meta=value',
      'const value = 1;',
      '```',
      '',
      '[inline](https://example.com "title") <https://example.org> [ref][id]',
      '',
      '![alt](https://example.com/a.png "image") ![ref image][img]',
      '',
      '[id]: https://example.net "reference"',
      '[img]: https://example.net/image.png',
      '',
      '<span>inline html</span>',
      '',
      '<div>block html</div>',
    ].join('\n');
    const document = parse(source);
    const nodes = collect(document);
    const types = new Set(nodes.map((node) => node.type));

    expect(types).toEqual(
      new Set([
        'root',
        'heading',
        'text',
        'emphasis',
        'strong',
        'delete',
        'inlineCode',
        'blockquote',
        'paragraph',
        'hardBreak',
        'list',
        'listItem',
        'thematicBreak',
        'codeBlock',
        'link',
        'linkReference',
        'image',
        'imageReference',
        'definition',
        'html',
      ]),
    );
    expect(nodes.filter((node) => node.type === 'codeBlock').map((node) => node.kind)).toEqual([
      'indented',
      'fenced',
    ]);
    expect(nodes.find((node) => node.type === 'codeBlock' && node.kind === 'fenced')).toMatchObject(
      {
        language: { raw: 'TS', normalized: 'ts' },
        meta: 'meta=value',
      },
    );
    expect(nodes.find((node) => node.type === 'listItem' && node.checked === true)).toBeDefined();
    expect(nodes.filter((node) => node.type === 'html')).toHaveLength(3);
    expect(
      document.diagnostics.filter((diagnostic) => diagnostic.code === 'MD_RAW_HTML_PRESERVED'),
    ).toHaveLength(3);
  });

  it('retains GFM table alignment, source cell shape, and creative interpretation separately', () => {
    const source = [
      '| left | center | right | none |',
      '| :--- | :----: | ----: | ---- |',
      '| a | b | c | d |',
      '| short | row |',
    ].join('\n');
    const document = parse(source, { creativeTableKnownColumns: ['left', 'center'] });
    const table = collect(document).find((node) => node.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Expected table.');

    expect(table.alignments).toEqual(['left', 'center', 'right', 'unspecified']);
    expect(table.header.cells).toHaveLength(4);
    expect(table.rows.map((row) => row.cells.length)).toEqual([4, 2]);
    expect(document.annotations).toContainEqual(
      expect.objectContaining({
        type: 'creativeTable',
        targetNodeId: table.id,
        unknownColumns: ['right', 'none'],
      }),
    );
    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'MD_TABLE_ROW_WIDTH_MISMATCH',
        parameters: { expectedCells: 4, actualCells: 2 },
      }),
    );
  });

  it('preserves links, references, images, unsafe destinations, escapes, and decoded entities', () => {
    const source = String.raw`escaped \*star\* &amp; [safe](https://example.com) [bad](javascript:alert(1)) ![alt](image.png "title")`;
    const document = parse(source);
    const nodes = collect(document);
    expect(
      nodes.find((node) => node.type === 'text' && node.value.includes('*star* &')),
    ).toBeDefined();
    expect(nodes.find((node) => node.type === 'image')).toMatchObject({
      altText: 'alt',
      destination: 'image.png',
      title: 'title',
    });
    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'MD_UNSAFE_DESTINATION',
        parameters: { scheme: 'javascript' },
      }),
    );
  });

  it('projects Neko extensions only from eligible plain text source regions', () => {
    const source = [
      '@Rin ![[cover.png]] [[script.md#Scene 2]]',
      '',
      '`@Inline ![[inline.png]]`',
      '',
      '```txt',
      '@Code ![[code.png]]',
      '```',
      '',
      '<span>@Html ![[html.png]]</span>',
    ].join('\n');
    const document = parse(source);
    const nodes = collect(document);

    expect(nodes.filter((node) => node.type === 'nekoMention').map((node) => node.raw)).toEqual([
      '@Rin',
    ]);
    expect(nodes.filter((node) => node.type === 'nekoResourceReference')).toMatchObject([
      { embed: true, target: 'cover.png', lookupToken: 'cover.png' },
      {
        embed: false,
        target: 'script.md#Scene 2',
        lookupToken: 'script.md',
        placementHint: 'Scene 2',
      },
    ]);
    expect(nodes.find((node) => node.type === 'inlineCode')).toMatchObject({
      value: '@Inline ![[inline.png]]',
    });
    expect(nodes.find((node) => node.type === 'codeBlock')).toMatchObject({
      value: '@Code ![[code.png]]',
    });
  });

  it('preserves escaped pipes and extra cells in recognized GFM tables', () => {
    const document = parse(
      ['| key | value |', '| --- | --- |', String.raw`| a\|b | c | extra |`].join('\n'),
    );
    const table = collect(document).find((node) => node.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Expected table.');
    expect(table.rows[0]?.cells).toHaveLength(3);
    expect(table.rows[0]?.cells[0]?.children).toContainEqual(
      expect.objectContaining({
        type: 'text',
        value: 'a|b',
      }),
    );
    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'MD_TABLE_ROW_WIDTH_MISMATCH',
        parameters: { expectedCells: 2, actualCells: 3 },
      }),
    );
  });

  it('retains malformed extension-like provider text instead of inventing nodes', () => {
    const source = 'unfinished [[resource and ![[embed and ordinary @';
    const document = parse(source);
    expect(collect(document).filter((node) => node.type.startsWith('neko'))).toHaveLength(0);
    expect(document.source).toBe(source);
  });

  it('uses UTF-16 offsets while retaining Unicode source exactly', () => {
    const source = 'A👩🏽‍💻中 @Rin';
    const document = parse(source);
    const mention = collect(document).find((node) => node.type === 'nekoMention');
    if (!mention) throw new Error('Expected mention.');
    expect(source.slice(mention.range.startOffset, mention.range.endOffset)).toBe('@Rin');
    expect(mention.range.startOffset).toBe(source.indexOf('@Rin'));
    for (const node of collect(document)) {
      expect(source.slice(node.range.startOffset, node.range.endOffset)).toBe(
        source.slice(node.provenance.range.startOffset, node.provenance.range.endOffset),
      );
    }
  });

  it('enforces deterministic source limit boundaries without partial AST success', () => {
    const policy = { maxSourceCodeUnits: 8 };
    expect(parseNormalizedMarkdown('1234567', { policy }).status).toBe('ready');
    expect(parseNormalizedMarkdown('12345678', { policy }).status).toBe('ready');
    expect(parseNormalizedMarkdown('123456789', { policy })).toMatchObject({
      status: 'failed',
      source: '123456789',
      diagnostics: [
        {
          code: 'MD_SOURCE_LIMIT_EXCEEDED',
          severity: 'fatal',
          phase: 'admission',
          parameters: { actualCodeUnits: 9, maxCodeUnits: 8 },
        },
      ],
    });

    const limit = DEFAULT_MARKDOWN_SOURCE_LIMIT_CODE_UNITS;
    expect(parseNormalizedMarkdown('x'.repeat(limit - 1)).status).toBe('ready');
    expect(parseNormalizedMarkdown('x'.repeat(limit)).status).toBe('ready');
    expect(parseNormalizedMarkdown('x'.repeat(limit + 1))).toMatchObject({
      status: 'failed',
      diagnostics: [{ code: 'MD_SOURCE_LIMIT_EXCEEDED' }],
    });
  }, 30_000);
});
