import { describe, expect, it } from 'vitest';
import { en } from './en';
import { zhCN } from './zh-cn';

describe('Canvas locale bundles', () => {
  it('keeps English and Simplified Chinese message keys identical', () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
  });
});
