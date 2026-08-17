import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

const { streamdownChildren } = vi.hoisted(() => ({
  streamdownChildren: vi.fn((children: string) => {
    if (children === 'bad') throw new Error('Markdown render boom');
    return <div data-streamdown-mock="true">{children}</div>;
  }),
}));

vi.mock('streamdown', () => ({
  defaultRemarkPlugins: { gfm: () => undefined, codeMeta: () => undefined },
  defaultRehypePlugins: {
    raw: () => undefined,
    sanitize: [() => undefined, { tagNames: [], attributes: {} }],
    harden: () => undefined,
  },
  Streamdown: ({ children }: { readonly children: string }) => streamdownChildren(children),
}));

import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer failure isolation', () => {
  it('keeps a Markdown presentation failure block-local and preserves sibling blocks', () => {
    const view = render(
      <div>
        <MarkdownRenderer content="bad" />
        <MarkdownRenderer content="good" />
      </div>,
    );

    expect(view.container.querySelector('[data-markdown-block-error="true"]')).toBeDefined();
    expect(view.container.querySelector('[data-streamdown-mock="true"]')?.textContent).toBe('good');
    expect(streamdownChildren).toHaveBeenCalledWith('bad');
    expect(streamdownChildren).toHaveBeenCalledWith('good');
  });

  it('retries the same block only after authoritative content changes', () => {
    const view = render(<MarkdownRenderer content="bad" />);
    expect(view.container.querySelector('[data-markdown-block-error="true"]')).toBeDefined();

    view.rerender(<MarkdownRenderer content="good" />);
    expect(view.container.querySelector('[data-markdown-block-error="true"]')).toBeNull();
    expect(view.container.querySelector('[data-streamdown-mock="true"]')?.textContent).toBe('good');
  });
});
