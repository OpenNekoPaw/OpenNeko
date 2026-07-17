import type { InkColor } from '../types/theme';
import type { TerminalCapabilities } from '../utils/terminal';
import type {
  ResolvedTerminalStyle,
  TerminalMarkdownDiagnostic,
  TerminalStyledSegment,
} from './contracts';
import type { TerminalMarkdownThemeResolver } from './theme';

const ESC = '\u001b';
const BEL = '\u0007';
const ST = `${ESC}\\`;

export interface EncodedTerminalOutput {
  readonly text: string;
  readonly diagnostics: readonly TerminalMarkdownDiagnostic[];
}

export function encodeTerminalSegments(
  segments: readonly TerminalStyledSegment[],
  theme: TerminalMarkdownThemeResolver,
  capabilities: TerminalCapabilities,
): EncodedTerminalOutput {
  const diagnostics: TerminalMarkdownDiagnostic[] = [];
  let text = '';
  let index = 0;

  while (index < segments.length) {
    const segment = segments[index];
    if (segment === undefined) break;
    if (segment.hyperlink === undefined) {
      text += encodeSafeSegment(segment, theme, capabilities, diagnostics).styled;
      index += 1;
      continue;
    }

    const target = validateStructuredHyperlink(segment.hyperlink);
    if (target === undefined) {
      diagnostics.push({
        code: 'TUI_MD_UNSAFE_HYPERLINK',
        severity: 'warning',
        parameters: { target: makeTerminalTextInert(segment.hyperlink.target).text },
      });
      text += encodeSafeSegment(segment, theme, capabilities, diagnostics).styled;
      index += 1;
      continue;
    }

    const hyperlinkKey = structuredHyperlinkKey(segment.hyperlink, target);
    const group: EncodedSafeSegment[] = [];
    while (index < segments.length) {
      const candidate = segments[index];
      if (
        candidate?.hyperlink === undefined ||
        structuredHyperlinkKey(
          candidate.hyperlink,
          validateStructuredHyperlink(candidate.hyperlink),
        ) !== hyperlinkKey
      ) {
        break;
      }
      group.push(encodeSafeSegment(candidate, theme, capabilities, diagnostics));
      index += 1;
    }
    const styled = group.map((item) => item.styled).join('');
    const visible = group.map((item) => item.safeText).join('');

    if (!capabilities.supportsHyperlinks) {
      diagnostics.push({
        code: 'TUI_MD_HYPERLINK_UNAVAILABLE',
        severity: 'info',
        parameters: { target },
      });
      text += visible === target ? styled : `${styled} (${target})`;
      continue;
    }

    text += `${ESC}]8;;${target}${ST}${styled}${ESC}]8;;${ST}`;
  }

  return { text, diagnostics };
}

interface EncodedSafeSegment {
  readonly safeText: string;
  readonly styled: string;
}

function encodeSafeSegment(
  segment: TerminalStyledSegment,
  theme: TerminalMarkdownThemeResolver,
  capabilities: TerminalCapabilities,
  diagnostics: TerminalMarkdownDiagnostic[],
): EncodedSafeSegment {
  const safe = makeTerminalTextInert(segment.text);
  if (safe.replacements > 0) {
    diagnostics.push({
      code: 'TUI_MD_UNSAFE_CONTROL',
      severity: 'warning',
      parameters: { count: safe.replacements },
    });
  }
  return {
    safeText: safe.text,
    styled: encodeStyle(safe.text, theme.resolve(segment.style), capabilities.supportsColor),
  };
}

function structuredHyperlinkKey(
  hyperlink: NonNullable<TerminalStyledSegment['hyperlink']>,
  validatedTarget: string | undefined,
): string | undefined {
  if (validatedTarget === undefined) return undefined;
  return hyperlink.kind === 'web'
    ? `web\u0000${validatedTarget}`
    : `local\u0000${hyperlink.authorizationId}\u0000${validatedTarget}`;
}

function validateStructuredHyperlink(
  hyperlink: TerminalStyledSegment['hyperlink'],
): string | undefined {
  if (hyperlink === undefined) return undefined;
  if (hyperlink.kind === 'web') return validateWebHyperlink(hyperlink.target);
  if (
    hyperlink.authorizationId.length === 0 ||
    makeTerminalTextInert(hyperlink.target).replacements > 0
  ) {
    return undefined;
  }
  try {
    const url = new URL(hyperlink.target);
    return url.protocol === 'file:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function makeTerminalTextInert(value: string): {
  readonly text: string;
  readonly replacements: number;
} {
  let replacements = 0;
  let text = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint === 0x0a || codePoint === 0x09) {
      text += character;
      continue;
    }
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      text += visibleControl(codePoint);
      replacements += 1;
      continue;
    }
    text += character;
  }
  return { text, replacements };
}

export function validateWebHyperlink(target: string): string | undefined {
  if (makeTerminalTextInert(target).replacements > 0) return undefined;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return undefined;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
}

function visibleControl(codePoint: number): string {
  if (codePoint <= 0x1f) return String.fromCodePoint(0x2400 + codePoint);
  if (codePoint === 0x7f) return '␡';
  return `\\u{${codePoint.toString(16).toUpperCase().padStart(4, '0')}}`;
}

function encodeStyle(value: string, style: ResolvedTerminalStyle, supportsColor: boolean): string {
  const codes: number[] = [];
  if (style.bold) codes.push(1);
  if (style.dim) codes.push(2);
  if (style.italic) codes.push(3);
  if (style.underline) codes.push(4);
  if (style.strikethrough) codes.push(9);
  if (supportsColor && style.foreground !== undefined) {
    codes.push(colorCode(style.foreground));
  }
  if (codes.length === 0) return value;
  return `${ESC}[${codes.join(';')}m${value}${ESC}[0m`;
}

function colorCode(color: InkColor): number {
  const bright = color.endsWith('Bright');
  const base = color.replace(/Bright$/, '') as Exclude<InkColor, `${string}Bright`>;
  const codes: Record<typeof base, number> = {
    black: 30,
    red: 31,
    green: 32,
    yellow: 33,
    blue: 34,
    magenta: 35,
    cyan: 36,
    white: 37,
    gray: 90,
    grey: 90,
  };
  const code = codes[base];
  return bright && code < 90 ? code + 60 : code;
}
