import { describe, expect, it } from 'vitest';
import { isRecord, readNonEmptyString } from '../command-args';

describe('extension command argument helpers', () => {
  it('recognizes plain object command payloads only', () => {
    expect(isRecord({ path: '/tmp/asset.png' })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(['/tmp/asset.png'])).toBe(false);
    expect(isRecord('path')).toBe(false);
  });

  it('trims non-empty strings and rejects empty values', () => {
    expect(readNonEmptyString('  Hero  ')).toBe('Hero');
    expect(readNonEmptyString('   ')).toBeUndefined();
    expect(readNonEmptyString(123)).toBeUndefined();
  });
});
