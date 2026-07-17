import { describe, expect, it } from 'vitest';
import { tokens } from '../../theme/tokens';
import { detectCapabilities, getFallbackChars } from '../../utils/terminal';
import { encodeTerminalSegments, makeTerminalTextInert } from '../safe-encoding';
import { createTerminalMarkdownThemeResolver } from '../theme';

function capabilities(env: Readonly<Record<string, string | undefined>> = {}) {
  return detectCapabilities({
    env: { TERM: 'xterm-256color', TERM_PROGRAM: 'iTerm.app', ...env },
    isTTY: true,
    columns: 100,
    rows: 30,
  });
}

describe('Markdown theme and terminal capability resolution', () => {
  it('lets NO_COLOR win while preserving font attributes and inherited background', () => {
    const resolvedCapabilities = capabilities({ NO_COLOR: '1', FORCE_COLOR: '3' });
    const resolver = createTerminalMarkdownThemeResolver(tokens, resolvedCapabilities);
    expect(resolvedCapabilities.supportsColor).toBe(false);
    expect(resolver.resolve({ markdownRole: 'heading', attributes: { bold: true } })).toEqual({
      foreground: undefined,
      background: undefined,
      bold: true,
    });
  });

  it('resolves extended color, hyperlinks, and ASCII border fallback independently', () => {
    const rich = capabilities({ COLORTERM: 'truecolor' });
    expect(rich.supportsExtendedColor).toBe(true);
    expect(rich.supportsHyperlinks).toBe(true);

    const ascii = detectCapabilities({ env: { TERM: 'dumb' }, isTTY: true });
    expect(getFallbackChars(ascii).border).toEqual({
      tl: '+',
      tr: '+',
      bl: '+',
      br: '+',
      h: '-',
      v: '|',
    });
  });
});

describe('renderer-owned safe terminal encoding', () => {
  it('makes provider ESC, CSI, OSC, BEL, C0, and C1 controls inert and diagnosable', () => {
    const hostile = '\u001b]52;c;payload\u0007\u001b[2J\u0001\u0085safe';
    const inert = makeTerminalTextInert(hostile);
    expect(inert.text).toContain('␛]52;c;payload␇␛[2J␁\\u{0085}safe');
    expect(inert.replacements).toBe(5);

    const result = encodeTerminalSegments(
      [{ text: hostile }],
      createTerminalMarkdownThemeResolver(tokens, capabilities()),
      capabilities(),
    );
    expect(result.text).not.toContain('\u001b]52;c;payload');
    expect(result.text).not.toContain('\u001b[2J');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'TUI_MD_UNSAFE_CONTROL', parameters: { count: 5 } }),
    ]);
  });

  it('emits only renderer-owned SGR and validated HTTP(S) OSC 8 sequences', () => {
    const caps = capabilities();
    const result = encodeTerminalSegments(
      [
        {
          text: 'Neko',
          style: { markdownRole: 'link', attributes: { underline: true } },
          hyperlink: { kind: 'web', target: 'https://example.com/docs' },
        },
      ],
      createTerminalMarkdownThemeResolver(tokens, caps),
      caps,
    );
    expect(result.text).toContain('\u001b]8;;https://example.com/docs\u001b\\');
    expect(result.text).toContain('\u001b[4;94mNeko\u001b[0m');
    expect(result.diagnostics).toEqual([]);
  });

  it('adds one visible fallback target for contiguous styled segments of the same link', () => {
    const noLinks = detectCapabilities({ env: { TERM: 'xterm-256color' }, isTTY: true });
    const result = encodeTerminalSegments(
      [
        {
          text: 'bold',
          style: { markdownRole: 'strong', attributes: { bold: true } },
          hyperlink: { kind: 'web', target: 'https://example.com' },
        },
        {
          text: ' text',
          style: { markdownRole: 'link', attributes: { underline: true } },
          hyperlink: { kind: 'web', target: 'https://example.com/' },
        },
      ],
      createTerminalMarkdownThemeResolver(tokens, noLinks),
      noLinks,
    );
    expect(result.text.match(/https:\/\/example\.com\//gu)).toHaveLength(1);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'TUI_MD_HYPERLINK_UNAVAILABLE',
    ]);
  });

  it('rejects arbitrary schemes and shows safe targets when hyperlinks are unavailable', () => {
    const noLinks = detectCapabilities({ env: { TERM: 'xterm-256color' }, isTTY: true });
    const resolver = createTerminalMarkdownThemeResolver(tokens, noLinks);
    const result = encodeTerminalSegments(
      [
        { text: 'site', hyperlink: { kind: 'web', target: 'https://example.com' } },
        { text: ' local', hyperlink: { kind: 'web', target: 'file:///tmp/secret' } },
      ],
      resolver,
      noLinks,
    );
    expect(result.text).toContain('site (https://example.com/)');
    expect(result.text).toContain(' local');
    expect(result.text).not.toContain('file:///tmp/secret');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'TUI_MD_HYPERLINK_UNAVAILABLE',
      'TUI_MD_UNSAFE_HYPERLINK',
    ]);
  });
});
