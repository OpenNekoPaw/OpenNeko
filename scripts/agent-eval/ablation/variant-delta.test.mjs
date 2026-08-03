import { describe, expect, it } from 'vitest';
import { compareRunPolicies, metricDelta, projectAggregateMetrics } from './variant-delta.mjs';

function aggregate(overrides = {}) {
  return {
    outcome: 'pass',
    passRate: 1,
    hardGates: { passed: 4, failed: 0, blocked: 0 },
    tokens: { input: 20, output: 10 },
    cost: { status: 'unavailable' },
    latency: { meanMs: 20, p50Ms: 20, p95Ms: 25 },
    iterations: { total: 2, mean: 1 },
    tools: { calls: 0, successes: 0, failures: 0 },
    retries: { count: 0 },
    scoreDistribution: { samples: 0, passRate: 1 },
    ...overrides,
  };
}

describe('ablation content-quality projection', () => {
  it('keeps hard-gate success explicitly outside content quality', () => {
    const metrics = projectAggregateMetrics(aggregate(), {
      kind: 'hard-gates-only',
      reason: 'Only deterministic correctness applies.',
    });
    expect(metrics.quality).toEqual({
      status: 'not-evaluated',
      reason: 'hard-gates-only',
    });
  });

  it('rejects Judge scores under hard-gates-only instead of relabeling them', () => {
    expect(() =>
      projectAggregateMetrics(
        aggregate({
          scoreDistribution: { samples: 1, passRate: 1, mean: 4, variance: 0 },
        }),
        { kind: 'hard-gates-only', reason: 'Only deterministic correctness applies.' },
      ),
    ).toThrow('must not contain content-quality Judge scores');
  });

  it('requires real Judge samples before a passing rubric run exposes quality', () => {
    const policy = { kind: 'scenario-rubric', rubricRef: 'rubrics/content-quality.json' };
    expect(() => projectAggregateMetrics(aggregate(), policy)).toThrow(
      'passed without content-quality Judge scores',
    );

    const metrics = projectAggregateMetrics(
      aggregate({
        scoreDistribution: { samples: 1, passRate: 1, mean: 4.25, variance: 0 },
      }),
      policy,
      [{ judge: { overallScore: 4.25 } }],
    );
    expect(metrics.quality).toEqual({
      status: 'available',
      rubricRef: 'rubrics/content-quality.json',
      samples: 1,
      mean: 4.25,
      variance: 0,
    });
  });

  it('emits quality deltas only when both variants have rubric scores', () => {
    const base = projectAggregateMetrics(
      aggregate({
        scoreDistribution: { samples: 1, passRate: 1, mean: 4, variance: 0 },
      }),
      { kind: 'scenario-rubric', rubricRef: 'rubrics/content-quality.json' },
      [{ judge: { overallScore: 4 } }],
    );
    const candidate = projectAggregateMetrics(
      aggregate({
        scoreDistribution: { samples: 1, passRate: 1, mean: 4.5, variance: 0 },
      }),
      { kind: 'scenario-rubric', rubricRef: 'rubrics/content-quality.json' },
      [{ judge: { overallScore: 4.5 } }],
    );
    expect(metricDelta(base, candidate).qualityMean).toBe(0.5);

    candidate.quality = {
      status: 'unavailable',
      rubricRef: 'rubrics/content-quality.json',
      reason: 'judge-not-completed',
    };
    expect(metricDelta(base, candidate)).not.toHaveProperty('qualityMean');
  });

  it('compares Judge policy without treating candidate-dependent prompt hashes as drift', () => {
    const run = (promptHash, modelId = 'gpt-5-mini') => ({
      samples: [
        {
          result: {
            target: { kind: 'runtime', id: 'target' },
            repositoryRevision: 'working-tree',
            fixtureDigest: 'fixture-digest',
            modelIdentity: { providerId: 'target-provider', modelId: 'target-model' },
            assertions: [{ id: 'path' }],
          },
          judge: {
            providerId: 'openai',
            modelId,
            profileId: 'content-quality-judge',
            rubricId: 'content-quality',
            rubricVersion: 'v1',
            promptHash,
            sampling: { temperature: 0, maxTokens: 1800 },
          },
        },
      ],
    });
    expect(compareRunPolicies(run('base-output-hash'), run('variant-output-hash'))).toEqual([]);
    expect(
      compareRunPolicies(
        run('base-output-hash'),
        run('variant-output-hash', 'different-judge-model'),
      ),
    ).toContain('content-quality Judge policy differs');
  });

  it('detects prompt, permission, validator and budget policy drift', () => {
    const sample = (overrides = {}) => ({
      result: {
        target: { kind: 'runtime', id: 'target' },
        repositoryRevision: 'revision',
        fixtureDigest: 'fixture',
        modelIdentity: { providerId: 'provider', modelId: 'model' },
        effectiveConfiguration: { runtimeProfileId: 'runtime', modelProfileId: 'model-profile' },
        assertions: [{ id: 'path' }],
      },
      comparisonPolicyEvidence: {
        scenario: { id: 'case' },
        prompts: [{ id: 'submit', prompt: 'same' }],
        skills: [],
        tools: [{ name: 'Write', status: 'success' }],
        permissions: [{ toolName: 'Write', approved: true }],
        validators: [{ id: 'artifact', validatorId: 'json-document-v1' }],
        budget: { timeoutMs: 1000, repetitions: 2 },
        ...overrides,
      },
    });
    const baseline = { samples: [sample()] };
    const current = {
      samples: [
        sample({
          prompts: [{ id: 'submit', prompt: 'drift' }],
          permissions: [{ toolName: 'Write', approved: false }],
          validators: [{ id: 'artifact', validatorId: 'other' }],
          budget: { timeoutMs: 2000, repetitions: 2 },
        }),
      ],
    };

    expect(compareRunPolicies(baseline, current)).toEqual(
      expect.arrayContaining([
        'prompt policy differs',
        'permission policy differs',
        'validator policy differs',
        'budget and sampling policy differs',
      ]),
    );
  });
});
