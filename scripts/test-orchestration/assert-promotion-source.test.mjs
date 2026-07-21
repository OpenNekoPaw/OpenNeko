import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertPromotionSource } from './assert-promotion-source.mjs';

describe('promotion source validation', () => {
  it('accepts only dev to main', () => {
    assert.deepEqual(assertPromotionSource({ headRef: 'dev', baseRef: 'main' }), {
      headRef: 'dev',
      baseRef: 'main',
    });
  });

  for (const candidate of [
    { headRef: 'feature/test', baseRef: 'main' },
    { headRef: 'dev', baseRef: 'release' },
    { headRef: '', baseRef: 'main' },
  ]) {
    it(`rejects ${candidate.headRef || '<empty>'} to ${candidate.baseRef}`, () => {
      assert.throws(
        () => assertPromotionSource(candidate),
        new RegExp(
          `Merge Gate requires dev -> main; received ${candidate.headRef || '<empty>'} -> ${candidate.baseRef}`,
          'u',
        ),
      );
    });
  }
});
