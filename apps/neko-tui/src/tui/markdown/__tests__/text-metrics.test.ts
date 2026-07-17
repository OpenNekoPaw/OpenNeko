import { describe, expect, it } from 'vitest';
import type { TerminalStyledSegment } from '../contracts';
import { DefaultTerminalTextMetrics } from '../text-metrics';

const metrics = new DefaultTerminalTextMetrics({ tabWidth: 4 });

describe('TerminalTextMetrics', () => {
  it.each([
    ['abc', 3],
    ['你好', 4],
    ['e\u0301', 1],
    ['👩🏽‍💻', 2],
    ['🇨🇳', 2],
    ['👍🏽', 2],
    ['क्ष', 1],
    ['क्‍ष', 1],
    ['abc你好👩🏽‍💻', 9],
  ])('measures %s as %i display columns', (value, expected) => {
    expect(metrics.displayWidth(value)).toBe(expected);
  });

  it('segments complex graphemes without UTF-16 visible slicing', () => {
    expect(metrics.segmentGraphemes('Ae\u0301👩🏽‍💻🇨🇳👍🏽क्ष')).toEqual([
      'A',
      'e\u0301',
      '👩🏽‍💻',
      '🇨🇳',
      '👍🏽',
      'क्ष',
    ]);
  });

  it('wraps nested styled spans while retaining style identity and grapheme integrity', () => {
    const strong = { markdownRole: 'strong' as const, attributes: { bold: true } };
    const emphasis = { markdownRole: 'emphasis' as const, attributes: { italic: true } };
    const segments: readonly TerminalStyledSegment[] = [
      { text: '你', style: strong, sourceStartOffset: 0, sourceEndOffset: 1 },
      { text: 'e\u0301👩🏽‍💻', style: emphasis, sourceStartOffset: 1, sourceEndOffset: 10 },
      { text: 'Z', style: strong, sourceStartOffset: 10, sourceEndOffset: 11 },
    ];

    const lines = metrics.wrapStyledSegments(segments, 3);

    expect(lines.map((line) => line.displayWidth)).toEqual([3, 3]);
    expect(lines.map((line) => line.segments.map((segment) => segment.text).join(''))).toEqual([
      '你e\u0301',
      '👩🏽‍💻Z',
    ]);
    expect(lines[0]?.segments[1]?.style).toBe(emphasis);
    expect(lines[1]?.segments[0]?.style).toBe(emphasis);
  });

  it('expands tabs at display-column tab stops and pads by display width', () => {
    expect(metrics.expandTabs('你\tx')).toBe('你  x');
    expect(metrics.displayWidth('你\tx')).toBe(5);
    expect(metrics.pad('你', 6, 'left')).toBe('你    ');
    expect(metrics.pad('你', 6, 'right')).toBe('    你');
    expect(metrics.pad('你', 7, 'center')).toBe('  你   ');
  });

  it('wraps a long token at grapheme boundaries without truncation', () => {
    const value = 'prefix-👩🏽‍💻-suffix';
    const lines = metrics.wrapStyledSegments([{ text: value }], 5);
    expect(
      lines.map((line) => line.segments.map((segment) => segment.text).join('')).join(''),
    ).toBe(value);
    expect(lines.every((line) => line.displayWidth <= 5)).toBe(true);
  });
});
