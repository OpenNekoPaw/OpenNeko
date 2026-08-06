import { describe, expect, it } from 'vitest';
import {
  compareWithBaseline,
  createApprovedBaseline,
  createCurrentBaselineDescriptor,
} from './baseline.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const TARGET = {
  kind: 'skill',
  identity: {
    name: 'storyboard',
    source: 'project',
    provenance: 'workspace',
    rootId: 'project-agent-skills',
    relativePath: 'storyboard',
    fingerprint: HASH,
  },
};

describe('approved baseline and comparability', () => {
  it('records Host-owned Skill identity without Market version or publication state', () => {
    const current = descriptor();
    const baseline = createApprovedBaseline({
      id: 'baseline-storyboard',
      current,
      approver: 'evaluation-owner',
      approvedAt: '2026-07-13T00:00:00.000Z',
    });
    expect(baseline.target).toEqual(TARGET);
    const serialized = JSON.stringify(baseline);
    expect(serialized).not.toMatch(/semver|packageId|published|installed/iu);
  });

  it('rejects unscored approved baselines', () => {
    const unscored = descriptor();
    unscored.scoreDistribution = { samples: 0, passRate: 0, mean: 0, variance: 0 };
    expect(() =>
      createApprovedBaseline({
        id: 'baseline-1',
        current: unscored,
        approver: 'owner',
        approvedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).toThrow('at least one scored sample');
  });

  it('compares equivalent inputs and reports score improvement', () => {
    const current = descriptor();
    const baseline = createApprovedBaseline({
      id: 'baseline-1',
      current,
      approver: 'owner',
      approvedAt: '2026-07-13T00:00:00.000Z',
    });
    const next = structuredClone(current);
    next.reportId = 'report-2';
    next.scoreDistribution = { samples: 3, passRate: 1, mean: 4.5, variance: 0.1 };
    const comparison = compareWithBaseline({
      id: 'comparison-1',
      baseline,
      current: next,
      currentReportIds: ['report-2'],
      evidenceRefs: ['judge.result'],
    });
    expect(comparison).toMatchObject({
      comparable: true,
      outcome: 'improved',
      improvementPercent: 12.5,
    });
  });

  it.each([
    ['target fingerprint', (current) => (current.target.identity.fingerprint = `sha256:${'b'.repeat(64)}`), 'target'],
    ['fixture', (current) => (current.fixtureDigest = `sha256:${'c'.repeat(64)}`), 'fixture-digest'],
    ['runtime profile', (current) => (current.runtimeProfileId = 'other'), 'runtime-profile'],
    ['model profile', (current) => (current.modelProfileIds = ['other']), 'model-profiles'],
    ['budget', (current) => (current.budget.timeoutMs = 1), 'budget'],
    ['Judge policy', (current) => (current.judgePolicy.id = 'other'), 'judge-policy'],
  ])('returns non-comparable for %s mismatch', (_label, mutate, dimension) => {
    const baseline = createApprovedBaseline({
      id: 'baseline-1',
      current: descriptor(),
      approver: 'owner',
      approvedAt: '2026-07-13T00:00:00.000Z',
    });
    const current = descriptor();
    mutate(current);
    const comparison = compareWithBaseline({
      id: 'comparison-1',
      baseline,
      current,
      currentReportIds: ['report-1'],
      evidenceRefs: ['judge.result'],
    });
    expect(comparison).toMatchObject({ comparable: false, outcome: 'non-comparable' });
    expect(comparison.improvementPercent).toBeUndefined();
    expect(comparison.dimensions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: dimension, comparable: false })]),
    );
  });

  it('allows explicitly named policy differences', () => {
    const baseline = createApprovedBaseline({
      id: 'baseline-1',
      current: descriptor(),
      approver: 'owner',
      approvedAt: '2026-07-13T00:00:00.000Z',
    });
    const current = descriptor();
    current.budget.timeoutMs = 1;
    expect(
      compareWithBaseline({
        id: 'comparison-1',
        baseline,
        current,
        currentReportIds: ['report-1'],
        evidenceRefs: ['judge.result'],
        allowDifferences: ['budget'],
      }).comparable,
    ).toBe(true);
  });
});

function descriptor() {
  return createCurrentBaselineDescriptor({
    suite: { target: structuredClone(TARGET) },
    scenario: {
      runtimeProfileId: 'runtime-default',
      modelProfileIds: ['model-default'],
      budget: { timeoutMs: 120_000, repetitions: 3 },
      artifactChecks: [{ kind: 'file', validatorId: 'json-document' }],
      rubric: { kind: 'domain-rubric', ref: 'rubrics/storyboard.json', judgeProfileId: 'judge' },
      assertions: [{ id: 'runtime' }, { id: 'artifact' }],
    },
    fixtureDigest: HASH,
    scoreDistribution: { samples: 3, passRate: 1, mean: 4, variance: 0.2 },
    reportId: 'report-1',
  });
}
