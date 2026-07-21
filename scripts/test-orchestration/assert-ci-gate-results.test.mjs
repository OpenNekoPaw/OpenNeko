import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertCiGateResults } from './assert-ci-gate-results.mjs';

describe('CI gate result aggregation', () => {
  it('accepts successful required jobs and skipped optional jobs', () => {
    const summary = assertCiGateResults({
      gateName: 'Manual Gate',
      jobs: {
        build: { result: 'success' },
        test: { result: 'success' },
        proto: { result: 'skipped' },
      },
      requiredSuccess: ['build', 'test'],
    });

    assert.deepEqual(summary, {
      gateName: 'Manual Gate',
      observedJobs: 3,
      requiredJobs: 2,
    });
  });

  it('rejects a failed optional or required job', () => {
    assert.throws(
      () =>
        assertCiGateResults({
          gateName: 'Manual Gate',
          jobs: {
            build: { result: 'success' },
            audit: { result: 'failure' },
          },
          requiredSuccess: ['build'],
        }),
      /Manual Gate failed: audit=failure/u,
    );
  });

  it('rejects a cancelled job', () => {
    assert.throws(
      () =>
        assertCiGateResults({
          gateName: 'Merge Gate',
          jobs: {
            build: { result: 'success' },
            package: { result: 'cancelled' },
          },
          requiredSuccess: ['build'],
        }),
      /package=cancelled/u,
    );
  });

  it('rejects a missing required job', () => {
    assert.throws(
      () =>
        assertCiGateResults({
          gateName: 'Merge Gate',
          jobs: { build: { result: 'success' } },
          requiredSuccess: ['build', 'package'],
        }),
      /package=missing/u,
    );
  });

  it('rejects a skipped required job', () => {
    assert.throws(
      () =>
        assertCiGateResults({
          gateName: 'Merge Gate',
          jobs: {
            build: { result: 'success' },
            package: { result: 'skipped' },
          },
          requiredSuccess: ['build', 'package'],
        }),
      /package=required-skipped/u,
    );
  });

  it('rejects an unknown job result', () => {
    assert.throws(
      () =>
        assertCiGateResults({
          gateName: 'Manual Gate',
          jobs: {
            build: { result: 'success' },
            audit: { result: 'neutral' },
          },
          requiredSuccess: ['build'],
        }),
      /audit=unknown\(neutral\)/u,
    );
  });
});
