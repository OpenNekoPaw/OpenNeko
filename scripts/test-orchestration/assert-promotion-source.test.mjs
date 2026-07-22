import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertPromotionSource } from './assert-promotion-source.mjs';

describe('promotion source validation', () => {
  for (const headRef of ['dev', 'fix-ci-dependencies', 'feature/test']) {
    it(`accepts development branch ${headRef} to main`, () => {
      assert.deepEqual(assertPromotionSource({ headRef, baseRef: 'main' }), {
        headRef,
        baseRef: 'main',
      });
    });
  }

  for (const candidate of [
    { headRef: 'main', baseRef: 'main' },
    { headRef: 'dev', baseRef: 'release' },
    { headRef: '', baseRef: 'main' },
    { headRef: undefined, baseRef: 'main' },
    { headRef: 'fix-ci-dependencies', baseRef: '' },
  ]) {
    it(`rejects ${candidate.headRef || '<empty>'} to ${candidate.baseRef}`, () => {
      assert.throws(
        () => assertPromotionSource(candidate),
        new RegExp(
          `Merge Gate requires a non-main development branch -> main; received ${candidate.headRef || '<empty>'} -> ${candidate.baseRef || '<empty>'}`,
          'u',
        ),
      );
    });
  }
});
