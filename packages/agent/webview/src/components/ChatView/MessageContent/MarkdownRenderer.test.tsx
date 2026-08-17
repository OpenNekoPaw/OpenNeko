import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { MarkdownResourceRenderingProjection } from '../../../presenters/markdown-resource-rendering-presenter';

describe('MarkdownRenderer Streamdown production path', () => {
  it('renders long and continued lists across many appends without losing completed items', () => {
    const view = render(<MarkdownRenderer content="- item 1" isStreaming />);
    for (let index = 2; index <= 80; index += 1) {
      const content = Array.from(
        { length: index },
        (_, itemIndex) => `- item ${itemIndex + 1}`,
      ).join('\n');
      view.rerender(<MarkdownRenderer content={content} isStreaming />);
    }

    expect(screen.getByText('item 1')).toBeDefined();
    expect(screen.getByText('item 80')).toBeDefined();
    expect(view.container.querySelector('[data-streamdown="unordered-list"]')).toBeDefined();
    expect(
      view.container.querySelectorAll('[data-streamdown="list-item"]').length,
    ).toBeGreaterThanOrEqual(80);
  });

  it.each([
    ['incomplete emphasis', '**bold text'],
    ['incomplete link', '[unfinished link'],
    ['incomplete fence', '```ts\nconst value = 1;'],
    ['incomplete table', '| a | b |\n| - | - |\n| 1 | 2 |'],
    ['incomplete list', '- one\n- two'],
    ['incomplete CJK', '中文段落继续'],
  ])('keeps %s visible in streaming mode', (_label, content) => {
    const view = render(<MarkdownRenderer content={content} isStreaming />);
    expect(view.container.textContent).not.toBe('');
    expect(view.container.querySelector('[data-markdown-renderer="streamdown"]')).toBeDefined();
  });

  it('uses the same Streamdown renderer for streaming and final text', () => {
    const view = render(<MarkdownRenderer content="Hello **wor" isStreaming />);
    expect(view.container.querySelector('[data-markdown-renderer="streamdown"]')).toBeDefined();

    view.rerender(<MarkdownRenderer content="Hello **world**" />);
    expect(view.container.querySelector('[data-markdown-renderer="streamdown"]')).toBeDefined();
    expect(screen.getByText('world')).toBeDefined();
    expect(view.container.querySelector('[data-markdown-renderer="streamdown"]')).toBeDefined();
  });

  it('projects authorized image, audio, and video resources without rewriting source', () => {
    const resources = markdownResources([
      {
        token: 'still',
        mimeType: 'image/png',
        renderUri: 'https://workspace.invalid/render/still',
      },
      {
        token: 'sound',
        mimeType: 'audio/mp4',
        renderUri: 'https://workspace.invalid/render/sound',
      },
      { token: 'clip', mimeType: 'video/mp4', renderUri: 'https://workspace.invalid/render/clip' },
    ]);
    const view = render(
      <MarkdownRenderer
        content="![still](still) ![sound](sound) ![clip](clip)"
        markdownResources={resources}
      />,
    );
    expect(
      view.container.querySelector('img[data-neko-resource-media="image"]')?.getAttribute('src'),
    ).toBe('https://workspace.invalid/render/still');
    expect(
      view.container.querySelector('audio[data-neko-resource-media="audio"]')?.getAttribute('src'),
    ).toBe('https://workspace.invalid/render/sound');
    expect(
      view.container.querySelector('video[data-neko-resource-media="video"]')?.getAttribute('src'),
    ).toBe('https://workspace.invalid/render/clip');
    expect(view.container.querySelector('img[data-neko-resource-media="image"]')).toBeDefined();
    expect(view.container.querySelector('audio[data-neko-resource-media="audio"]')).toBeDefined();
    expect(view.container.querySelector('video[data-neko-resource-media="video"]')).toBeDefined();
  });

  it('hardens malicious HTML and unsafe URLs', () => {
    const view = render(
      <MarkdownRenderer
        content={
          '<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![raw](file:///tmp/x.png)'
        }
      />,
    );

    expect(view.container.querySelector('script')).toBeNull();
    expect(view.container.querySelector('a[href="javascript:alert(1)"]')).toBeNull();
    expect(view.container.querySelector('img[src="file:///tmp/x.png"]')).toBeNull();
  });

  it('projects Neko extensions only from Markdown text nodes', () => {
    const view = render(
      <MarkdownRenderer
        content={'Ask @Rin about [[script.md]], [`@Skip`](https://example.com), and `<b>@Raw</b>`.'}
      />,
    );

    expect(view.container.querySelectorAll('[data-markdown-mention="true"]')).toHaveLength(1);
    expect(
      view.container.querySelectorAll('[data-markdown-resource-reference="true"]'),
    ).toHaveLength(1);
    expect(view.container.querySelector('[data-markdown-mention="true"]')?.textContent).toBe(
      '@Rin',
    );
  });

  it('contains no production import of the retired Agent Markdown session path', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const violations = collectProductionSourceFiles(root)
      .flatMap((relativePath) => {
        const source = readFileSync(join(root, relativePath), 'utf8');
        return [
          ...(source.includes('agent-markdown-session')
            ? [`${relativePath}: agent-markdown-session`]
            : []),
          ...(source.includes('MarkdownStreamingSession')
            ? [`${relativePath}: MarkdownStreamingSession`]
            : []),
          ...(source.includes('stableEndOffset') ? [`${relativePath}: stableEndOffset`] : []),
        ];
      })
      .filter((violation) => !violation.includes('__tests__'));

    expect(violations).toEqual([]);
  });
});

function markdownResources(
  entries: readonly {
    readonly token: string;
    readonly mimeType: string;
    readonly renderUri: string;
  }[],
): MarkdownResourceRenderingProjection {
  return {
    status: 'ready',
    tokens: entries.map((entry) => ({
      token: entry.token,
      status: 'bound',
      refs: [{ label: entry.token, mimeType: entry.mimeType, role: 'source' }],
      resources: [],
      renderUris: [entry.renderUri],
      diagnostics: [],
    })),
    diagnostics: [],
  };
}

function collectProductionSourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') visit(absolutePath);
        continue;
      }
      if (
        !entry.isFile() ||
        !/\.(?:ts|tsx)$/.test(entry.name) ||
        /\.test\.(?:ts|tsx)$/.test(entry.name)
      ) {
        continue;
      }
      files.push(absolutePath.slice(root.length + 1));
    }
  };
  visit(root);
  return files.sort();
}
