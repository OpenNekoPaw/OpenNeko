// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InlineMarkdownEditor,
  MarkdownDiagnostics,
  MarkdownGenerationPromptParts,
  MarkdownInlineText,
  MarkdownDocumentView,
  MarkdownPreview,
  createMarkdownRenderableTokens,
  isValidCompletionEdit,
  projectMarkdownForUi,
  type MarkdownCompletionProvider,
  type MarkdownTokenRenderContext,
} from './index';

describe('@neko/ui markdown primitives', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('projects markdown tokens without rewriting the source text', () => {
    const value = '**bold** `code` ![cover](P1#panel_2) ![[asset/card]] @Rin';
    const result = projectMarkdownForUi({
      value,
      profile: 'resource-markdown',
      projectionOptions: {
        resourceReferences: 'enabled',
        mentionResolver: {
          resolveMention: () => ({ status: 'resolved', ref: { kind: 'entity', id: 'rin' } }),
        },
        resourceResolver: {
          resolveResource: () => ({ status: 'resolved', ref: { kind: 'asset', id: 'asset-1' } }),
        },
      },
    });

    const tokens = createMarkdownRenderableTokens({
      value,
      projection: result.projection,
      semanticSpans: result.semanticSpans,
    });

    expect(result.projection.source).toBe(value);
    expect(tokens.map((token) => token.kind)).toEqual([
      'strong',
      'code',
      'commonmark-image',
      'resource-reference',
      'mention',
    ]);
  });

  it('exposes invalid semantic span diagnostics visibly', () => {
    const result = projectMarkdownForUi({
      value: 'short',
      profile: 'semantic-prompt',
      semanticSpans: [{ kind: 'scene', range: { startOffset: 0, endOffset: 99 } }],
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'markdown-ui-invalid-span-range',
        source: 'editor',
      }),
    );
  });

  it('exposes overlapping caller semantic spans as diagnostics', () => {
    const result = projectMarkdownForUi({
      value: 'Rainy hallway',
      profile: 'semantic-prompt',
      semanticSpans: [
        { kind: 'scene', range: { startOffset: 0, endOffset: 8 } },
        { kind: 'camera', range: { startOffset: 6, endOffset: 13 } },
      ],
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'markdown-ui-overlapping-span-range',
        source: 'editor',
      }),
    );
  });

  it('keeps caller semantic spans ahead of overlapping mention tokens', () => {
    const value = '@RefFrame';
    const result = projectMarkdownForUi({
      value,
      profile: 'semantic-prompt',
      semanticSpans: [{ kind: 'resource', range: { startOffset: 0, endOffset: value.length } }],
    });

    const tokens = createMarkdownRenderableTokens({
      value,
      projection: result.projection,
      semanticSpans: result.semanticSpans,
    });

    expect(result.projection.mentions).toHaveLength(1);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.kind).toBe('semantic-span');
    expect(tokens[0]?.span?.kind).toBe('resource');
  });

  it('renders inline tokens and diagnostics as reusable UI primitives', () => {
    act(() => {
      root.render(
        <>
          <MarkdownInlineText
            value="**bold** and ![[cover]]"
            semanticSpans={[{ kind: 'scene', range: { startOffset: 0, endOffset: 8 } }]}
          />
          <MarkdownDiagnostics
            diagnostics={[
              {
                severity: 'warning',
                code: 'missing-resource',
                phase: 'resolve',
                parameters: {},
                message: 'Resource is unresolved.',
                source: 'caller',
              },
            ]}
          />
        </>,
      );
    });

    expect(host.querySelector('[data-markdown-inline-text="true"]')).not.toBeNull();
    expect(host.querySelector('[data-markdown-semantic-span="true"]')).not.toBeNull();
    expect(host.querySelector('[data-markdown-diagnostic="missing-resource"]')).not.toBeNull();
  });

  it('renders a normalized Markdown document without executing or fetching embedded content', () => {
    act(() => {
      root.render(
        <MarkdownDocumentView
          value={
            '# Heading\n\n- **Bold**\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1)) ![cover](./cover.png)'
          }
        />,
      );
    });

    expect(host.querySelector('h1')?.textContent).toBe('Heading');
    expect(host.querySelector('strong')?.textContent).toBe('Bold');
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('[data-markdown-html-inert="true"]')?.textContent).toContain(
      '<script>',
    );
    expect(host.querySelector('[data-markdown-unsafe-link="true"]')?.textContent).toBe('unsafe');
    expect(host.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('[data-markdown-image-placeholder="true"]')?.textContent).toContain(
      'cover',
    );
  });

  it('keeps safe external links navigable and renders GFM tables', () => {
    act(() => {
      root.render(
        <MarkdownDocumentView
          value={'[Open](https://example.com)\n\n| A | B |\n| - | - |\n| 1 | 2 |'}
        />,
      );
    });

    expect(host.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(host.querySelectorAll('table th')).toHaveLength(2);
    expect(host.querySelectorAll('table td')).toHaveLength(2);
  });

  it('renders generation prompt parts as shared semantic chips', () => {
    act(() => {
      root.render(
        <MarkdownGenerationPromptParts value="图像编辑：以 P04#panel_1 为输入，`裁切`为竖幅，保持人物比例，并参考 ![[ref/frame]]" />,
      );
    });

    expect(host.querySelector('[data-markdown-generation-prompt-parts="true"]')).not.toBeNull();
    expect(
      host.querySelector('[data-markdown-generation-prompt-part-kind="intent"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-markdown-generation-prompt-part-kind="reference"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-markdown-generation-prompt-part-kind="operation"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-markdown-generation-prompt-part-kind="constraint"]'),
    ).not.toBeNull();
    expect(host.querySelector('[data-markdown-inline-code="true"]')).not.toBeNull();
    expect(host.querySelector('[data-markdown-resource-reference="true"]')).not.toBeNull();
  });

  it('lets callers render resources and mentions without resolving them in shared UI', () => {
    const renderToken = vi.fn(({ token, key }: MarkdownTokenRenderContext) => (
      <span
        key={key}
        data-caller-markdown-token={token.kind}
        data-caller-markdown-token-status={token.status}
      >
        {token.display}
      </span>
    ));

    act(() => {
      root.render(
        <MarkdownPreview value="Use ![[asset/cover]] and @Rin" renderToken={renderToken} />,
      );
    });

    expect(host.querySelector('[data-caller-markdown-token="resource-reference"]')).not.toBeNull();
    expect(host.querySelector('[data-caller-markdown-token="mention"]')).not.toBeNull();
    expect(
      host
        .querySelector('[data-caller-markdown-token="resource-reference"]')
        ?.getAttribute('data-caller-markdown-token-status'),
    ).toBe('unresolved');
    expect(renderToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({ kind: 'resource-reference' }),
      }),
    );
    expect(renderToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({ kind: 'mention' }),
      }),
    );
  });

  it('keeps InlineMarkdownEditor controlled and keyboard-boundary aware', () => {
    const onChange = vi.fn();
    const textareaRef = vi.fn();
    const value = '**bold** `code` ![[cover]]';

    act(() => {
      root.render(
        <InlineMarkdownEditor
          value={value}
          onChange={onChange}
          keyboardOwnerId="markdown:test"
          ariaLabel="Prompt"
          placeholder="Write prompt"
          textareaRef={textareaRef}
        />,
      );
    });

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    const highlight = host.querySelector<HTMLElement>('[data-inline-markdown-highlight="true"]');
    expect(textarea?.getAttribute('aria-label')).toBe('Prompt');
    expect(textarea?.getAttribute('aria-placeholder')).toBe('Write prompt');
    expect(textarea?.getAttribute('placeholder')).toBeNull();
    expect(textarea?.getAttribute('data-neko-keyboard-scope')).toBe('text-input');
    expect(textarea?.getAttribute('data-neko-keyboard-owner')).toBe('markdown:test');
    expect(textareaRef).toHaveBeenCalledWith(textarea);
    expect(highlight?.textContent).toContain('**bold**');
    expect(highlight?.textContent).toContain('`code`');
    expect(highlight?.textContent).toContain('![[cover]]');

    act(() => {
      setTextareaValue(textarea, 'hello world');
      textarea?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('hello world');
  });

  it('renders semantic-prompt editor highlights as generation prompt parts when spans are absent', () => {
    act(() => {
      root.render(
        <InlineMarkdownEditor
          value="图像编辑：以 P04#panel_1 为输入，裁切为竖幅，保持人物比例"
          onChange={() => undefined}
          profile="semantic-prompt"
          keyboardOwnerId="markdown:semantic-prompt"
          ariaLabel="Prompt"
        />,
      );
    });

    const highlight = host.querySelector<HTMLElement>('[data-inline-markdown-highlight="true"]');
    expect(
      highlight?.querySelector('[data-markdown-generation-prompt-parts="true"]'),
    ).not.toBeNull();
    expect(
      highlight?.querySelector('[data-markdown-generation-prompt-part-kind="intent"]'),
    ).not.toBeNull();
    expect(
      highlight?.querySelector('[data-markdown-generation-prompt-part-kind="operation"]'),
    ).not.toBeNull();
  });

  it('synchronizes the highlight layer with textarea scroll', () => {
    act(() => {
      root.render(
        <InlineMarkdownEditor
          value={'line\n'.repeat(20)}
          onChange={() => undefined}
          keyboardOwnerId="markdown:scroll"
        />,
      );
    });

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    const highlight = host.querySelector<HTMLElement>('[data-inline-markdown-highlight="true"]');
    expect(textarea).not.toBeNull();
    expect(highlight).not.toBeNull();

    act(() => {
      if (textarea) {
        textarea.scrollTop = 42;
        textarea.scrollLeft = 7;
        textarea.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });

    expect(highlight?.scrollTop).toBe(42);
    expect(highlight?.scrollLeft).toBe(7);
  });

  it('applies completion provider text edits only', () => {
    const onChange = vi.fn();
    const provider: MarkdownCompletionProvider = {
      id: 'mentions',
      triggerCharacters: ['@'],
      provideCompletions: (context) => [
        {
          id: 'rin',
          label: 'Rin',
          edit: { from: context.cursor, to: context.cursor, insert: '@Rin' },
        },
      ],
    };

    act(() => {
      root.render(
        <InlineMarkdownEditor
          value=""
          onChange={onChange}
          keyboardOwnerId="markdown:completion"
          completionProviders={[provider]}
        />,
      );
    });

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    act(() => {
      textarea?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '@' }));
    });

    const completion = host.querySelector<HTMLButtonElement>(
      '[data-markdown-completion-item="rin"]',
    );
    expect(completion).not.toBeNull();

    act(() => {
      completion?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('@Rin');
  });

  it('rejects completion edits outside the current text range', () => {
    expect(
      isValidCompletionEdit('abc', {
        id: 'bad',
        label: 'Bad',
        edit: { from: -1, to: 0, insert: 'x' },
      }),
    ).toBe(false);
  });
});

function setTextareaValue(input: HTMLTextAreaElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
