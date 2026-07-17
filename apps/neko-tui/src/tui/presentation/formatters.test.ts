import { describe, expect, it } from 'vitest';
import { createAgentTerminalFormatters } from './formatters';

describe('createAgentTerminalFormatters', () => {
  it('formats deterministic values with an explicit locale and time zone', () => {
    const en = createAgentTerminalFormatters({ locale: 'en', timeZone: 'UTC' });
    const zh = createAgentTerminalFormatters({ locale: 'zh-cn', timeZone: 'UTC' });

    expect(en.count(12345)).toBe('12,345');
    expect(zh.count(12345)).toBe('12,345');
    expect(en.dateTime(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe('01/02/2026, 03:04:05');
    expect(zh.dateTime(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe('2026/01/02 03:04:05');
    expect(en.duration(3_723_004)).toBe('1h 2m 3s 4ms');
    expect(en.bytes(1536)).toBe('1.5 KiB');
  });

  it('rejects invalid formatter inputs visibly', () => {
    expect(() => createAgentTerminalFormatters({ locale: 'en', timeZone: '' })).toThrow(
      'timeZone must not be empty',
    );
    const format = createAgentTerminalFormatters({ locale: 'en', timeZone: 'UTC' });
    expect(() => format.count(-1)).toThrow('finite non-negative');
    expect(() => format.dateTime(Number.NaN)).toThrow('finite instant');
  });
});
