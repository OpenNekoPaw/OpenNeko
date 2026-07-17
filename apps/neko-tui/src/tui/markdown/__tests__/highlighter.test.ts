import { describe, expect, it } from 'vitest';
import { createMarkdownRevision, createMarkdownSessionId } from '@neko/markdown';
import {
  acceptTerminalHighlightResult,
  copyCodeSource,
  LowlightTerminalCodeHighlighter,
} from '../highlighter';
import { DEFAULT_MARKDOWN_RESOURCE_POLICY } from '../resource-policy';

const sessionId = createMarkdownSessionId('highlight-test');
const revision = createMarkdownRevision(1);

describe('whole-block terminal code highlighter', () => {
  it('preserves multiline grammar state and authoritative source ranges', async () => {
    const code = 'const value = `line one\nline two`;\n/* multi\nline */';
    const result = await new LowlightTerminalCodeHighlighter().highlight({
      sessionId,
      revision,
      generation: 1,
      code,
      language: 'ts',
    });
    expect(result.status).toBe('highlighted');
    if (result.status !== 'highlighted') return;
    expect(result.tokens.map((token) => token.text).join('')).toBe(code);
    expect(
      result.tokens.some((token) => token.role === 'string' && token.text.includes('\n')),
    ).toBe(true);
    expect(
      result.tokens.some((token) => token.role === 'comment' && token.text.includes('\n')),
    ).toBe(true);
    expect(result.tokens.at(-1)?.sourceRange.endOffset).toBe(code.length);
  });

  it('enforces byte and line limits at limit minus one, limit, and limit plus one', async () => {
    const bytePolicy = {
      ...DEFAULT_MARKDOWN_RESOURCE_POLICY,
      highlightMaxBytes: 4,
      highlightMaxLines: 10,
    };
    const byteHighlighter = new LowlightTerminalCodeHighlighter(bytePolicy);
    const byteBelow = await byteHighlighter.highlight({
      sessionId,
      revision,
      generation: 1,
      code: 'abc',
      language: 'ts',
    });
    const byteExact = await byteHighlighter.highlight({
      sessionId,
      revision,
      generation: 2,
      code: 'abcd',
      language: 'ts',
    });
    const byteOver = await byteHighlighter.highlight({
      sessionId,
      revision,
      generation: 3,
      code: 'abcde',
      language: 'ts',
    });
    expect(byteBelow.status).toBe('highlighted');
    expect(byteExact.status).toBe('highlighted');
    expect(byteOver).toMatchObject({ status: 'plain', reason: 'budget-exceeded', code: 'abcde' });
    if (byteOver.status === 'plain')
      expect(byteOver.diagnostics[0]?.code).toBe('MD_HIGHLIGHT_LIMIT_EXCEEDED');

    const linePolicy = {
      ...DEFAULT_MARKDOWN_RESOURCE_POLICY,
      highlightMaxBytes: 100,
      highlightMaxLines: 2,
    };
    const lineHighlighter = new LowlightTerminalCodeHighlighter(linePolicy);
    const lineBelow = await lineHighlighter.highlight({
      sessionId,
      revision,
      generation: 4,
      code: 'a',
      language: 'ts',
    });
    const lineExact = await lineHighlighter.highlight({
      sessionId,
      revision,
      generation: 5,
      code: 'a\nb',
      language: 'ts',
    });
    const lineOver = await lineHighlighter.highlight({
      sessionId,
      revision,
      generation: 6,
      code: 'a\nb\nc',
      language: 'ts',
    });
    expect(lineBelow.status).toBe('highlighted');
    expect(lineExact.status).toBe('highlighted');
    expect(lineOver).toMatchObject({ status: 'plain', reason: 'budget-exceeded', code: 'a\nb\nc' });

    const unknown = await lineHighlighter.highlight({
      sessionId,
      revision,
      generation: 7,
      code: 'x',
      language: 'neko-unknown',
    });
    expect(unknown).toMatchObject({ status: 'plain', reason: 'unknown-language', code: 'x' });
  });

  it('discards cancellation and stale generations without user-facing failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const highlighter = new LowlightTerminalCodeHighlighter();
    const cancelled = await highlighter.highlight({
      sessionId,
      revision,
      generation: 4,
      code: 'const a = 1',
      language: 'ts',
      signal: controller.signal,
    });
    expect(cancelled).toEqual({
      sessionId,
      revision,
      generation: 4,
      status: 'discarded',
      reason: 'cancelled',
    });

    const current = acceptTerminalHighlightResult(
      { sessionId, revision: createMarkdownRevision(2), generation: 5 },
      {
        sessionId,
        revision,
        generation: 4,
        status: 'plain',
        code: 'x',
        reason: 'no-language',
        diagnostics: [],
      },
    );
    expect(current.status).toBe('discarded');
    if (current.status === 'discarded') expect(current.reason).toBe('stale');
  });

  it('copies normalized code instead of visual fragments or decoration', () => {
    const code = 'veryLongIdentifier();\nnext();';
    expect(copyCodeSource(code)).toBe(code);
  });
});
