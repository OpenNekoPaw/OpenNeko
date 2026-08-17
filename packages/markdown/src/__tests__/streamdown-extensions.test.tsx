import { describe, expect, it } from 'vitest';
import {
  createNekoMarkdownRemarkPlugins,
  createNekoMarkdownUrlTransform,
} from '../browser/streamdown-extensions';

interface TestNode {
  type: string;
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  children?: TestNode[];
  value?: string;
}

function runRemarkPlugin(tree: TestNode): TestNode {
  const [plugin] = createNekoMarkdownRemarkPlugins();
  const attacher = plugin as unknown as () => (root: unknown) => void;
  attacher()(tree);
  return tree;
}

describe('Streamdown-facing Neko Markdown extensions', () => {
  it('projects mention and resource reference syntax from plain text into HAST elements', () => {
    const tree = runRemarkPlugin({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: 'Ask @Rin to review [[script.md]] and embed ![[cover.png]].',
            },
          ],
        },
      ],
    });

    const children = tree.children?.[0]?.children;
    expect(children).toEqual([
      { type: 'text', value: 'Ask ' },
      {
        type: 'nekoMention',
        data: {
          hName: 'neko-mention',
          hProperties: {
            'data-neko-mention': 'true',
            'data-neko-label': 'Rin',
            'data-neko-raw': '@Rin',
          },
        },
        children: [{ type: 'text', value: '@Rin' }],
      },
      { type: 'text', value: ' to review ' },
      {
        type: 'nekoResourceReference',
        data: {
          hName: 'neko-resource-reference',
          hProperties: {
            'data-neko-resource-reference': 'true',
            'data-neko-resource-reference-embed': 'false',
            'data-neko-resource-reference-target': 'script.md',
            'data-neko-resource-reference-lookup-token': 'script.md',
            'data-neko-raw': '[[script.md]]',
          },
        },
        children: [{ type: 'text', value: '[[script.md]]' }],
      },
      { type: 'text', value: ' and embed ' },
      {
        type: 'nekoResourceReference',
        data: {
          hName: 'neko-resource-reference',
          hProperties: {
            'data-neko-resource-reference': 'true',
            'data-neko-resource-reference-embed': 'true',
            'data-neko-resource-reference-target': 'cover.png',
            'data-neko-resource-reference-lookup-token': 'cover.png',
            'data-neko-raw': '![[cover.png]]',
          },
        },
        children: [{ type: 'text', value: '![[cover.png]]' }],
      },
      { type: 'text', value: '.' },
    ]);
  });

  it('does not project extension syntax inside code, links, or raw HTML', () => {
    const tree = runRemarkPlugin({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'inlineCode', value: '@Rin [[script.md]]' },
            { type: 'link', children: [{ type: 'text', value: '@Rin [[inside-link.md]]' }] },
            { type: 'html', value: '<span>@Rin [[inside-html.md]]</span>' },
          ],
        },
      ],
    });

    expect(tree.children?.[0]?.children).toEqual([
      { type: 'inlineCode', value: '@Rin [[script.md]]' },
      { type: 'link', children: [{ type: 'text', value: '@Rin [[inside-link.md]]' }] },
      { type: 'html', value: '<span>@Rin [[inside-html.md]]</span>' },
    ]);
  });

  it('rejects raw/blob/cache/private identities while preserving safe link classes', () => {
    const transform = createNekoMarkdownUrlTransform({
      authorizedResourceUris: new Set(['https://workspace.invalid/render/abc']),
    });

    expect(transform('https://workspace.invalid/render/abc', 'src')).toBe(
      'https://workspace.invalid/render/abc',
    );
    expect(transform('https://example.com/a.png', 'src')).toBeNull();
    expect(transform('file:///tmp/a.png', 'src')).toBeNull();
    expect(transform('blob:http://localhost/a', 'src')).toBeNull();
    expect(transform('cache://token', 'src')).toBeNull();
    expect(transform('/raw/path.png', 'src')).toBeNull();
    expect(transform('https://example.com', 'href')).toBe('https://example.com');
    expect(transform('mailto:user@example.com', 'href')).toBe('mailto:user@example.com');
    expect(transform('#section', 'href')).toBe('#section');
    expect(transform('/workspace/file.md', 'href')).toBeNull();
    expect(transform('../workspace/file.md', 'href')).toBeNull();
    expect(transform('javascript:alert(1)', 'href')).toBeNull();
    expect(transform('data:text/html,x', 'href')).toBeNull();
  });
});
