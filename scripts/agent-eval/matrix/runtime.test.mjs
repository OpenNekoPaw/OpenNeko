import { describe, expect, it, vi } from 'vitest';
import {
  aggregateMatrixShards,
  assertConcurrentSampleIsolation,
  createMatrixPlan,
  executeMatrixPlan,
} from './runtime.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

describe('Desktop Agent Evaluation matrix runtime', () => {
  it('expands stable identities and assigns every sample to exactly one deterministic shard', async () => {
    const selections = [selection('case-b'), selection('case-a')];
    const base = {
      matrixId: 'matrix-1',
      strategy: 'matrix',
      evidenceLevel: 'key-free',
      repetitions: 2,
      build: packagedBuild(),
    };
    const whole = await createMatrixPlan(selections, base);
    const shards = await Promise.all(
      [0, 1].map((index) => createMatrixPlan(selections, { ...base, shard: { index, count: 2 } })),
    );

    expect(whole.samples).toHaveLength(4);
    expect(shards[0].policyDigest).toBe(shards[1].policyDigest);
    expect(
      [...shards[0].samples, ...shards[1].samples].map((item) => item.sampleId).sort(),
    ).toEqual(whole.allSampleIds.toSorted());
    expect(Object.isFrozen(whole)).toBe(true);
    expect(Object.isFrozen(whole.samples[0].selection)).toBe(true);
  });

  it('rejects development builds for matrix mode and visible cases in a hidden lane', async () => {
    await expect(
      createMatrixPlan([selection('case-1')], {
        matrixId: 'matrix-1',
        strategy: 'matrix',
        evidenceLevel: 'key-free',
        build: { id: 'dev', kind: 'development' },
      }),
    ).rejects.toMatchObject({ code: 'configuration-invalid' });
    const visible = selection('case-visible', {
      execution: { evidenceLevel: 'visible-desktop', resourceClass: 'visible-ui' },
    });
    await expect(
      createMatrixPlan([visible], {
        matrixId: 'matrix-1',
        evidenceLevel: 'hidden-desktop',
      }),
    ).rejects.toThrow('requires visible Desktop evidence');
    await expect(
      createMatrixPlan([selection('case-1')], {
        matrixId: 'matrix-1',
        strategy: 'matrix',
        evidenceLevel: 'key-free',
        build: { ...packagedBuild(), fingerprint: 'unverified' },
      }),
    ).rejects.toThrow('fingerprint is invalid');
  });

  it('uses bounded independent resource limits and retains planned attempts', async () => {
    const plan = await createMatrixPlan(
      [selection('case-1'), selection('case-2'), selection('case-3')],
      {
        matrixId: 'matrix-1',
        evidenceLevel: 'key-free',
        limits: {
          capacitySource: 'measured-test-host',
          desktop: 2,
          provider: 2,
          text: 2,
          'external-tool': 1,
          media: 1,
          'visible-ui': 1,
        },
      },
    );
    let active = 0;
    let maximum = 0;
    const runSample = vi.fn(async (_selection, options) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return completedRun(options.runId);
    });

    const result = await executeMatrixPlan(plan, { runSample });

    expect(maximum).toBeLessThanOrEqual(2);
    expect(result.outcome).toBe('pass');
    expect(result.samples).toHaveLength(3);
    expect(result.samples.every((sample) => sample.attempts.length === 1)).toBe(true);
  });

  it('retries only pre-turn infrastructure failure and never retries behavior failure', async () => {
    const plan = await createMatrixPlan([selection('case-1')], {
      matrixId: 'matrix-1',
      evidenceLevel: 'key-free',
      budgets: { infrastructureRetries: 1 },
    });
    const preTurn = Object.assign(new Error('provider preflight unavailable'), {
      code: 'infrastructure-fail',
      phase: 'pre-turn',
      executionIdentityCreated: false,
    });
    const recovered = vi
      .fn()
      .mockRejectedValueOnce(preTurn)
      .mockResolvedValueOnce(completedRun('x'));
    const recoveredResult = await executeMatrixPlan(plan, { runSample: recovered });
    expect(recovered).toHaveBeenCalledTimes(2);
    expect(recoveredResult.samples[0].attempts).toHaveLength(2);

    const behavior = vi.fn().mockResolvedValue({ ...completedRun('x'), outcome: 'case-fail' });
    const behaviorResult = await executeMatrixPlan(plan, { runSample: behavior });
    expect(behavior).toHaveBeenCalledOnce();
    expect(behaviorResult.outcome).toBe('case-fail');
  });

  it('charges pre-turn retries to the provider quota before another attempt', async () => {
    const plan = await createMatrixPlan([selection('case-1')], {
      matrixId: 'matrix-1',
      evidenceLevel: 'key-free',
      budgets: { infrastructureRetries: 1, maxProviderRequests: 1 },
    });
    const preTurn = Object.assign(new Error('provider preflight unavailable'), {
      code: 'infrastructure-fail',
      phase: 'pre-turn',
      executionIdentityCreated: false,
    });
    const runSample = vi.fn().mockRejectedValue(preTurn);

    const result = await executeMatrixPlan(plan, { runSample });

    expect(runSample).toHaveBeenCalledOnce();
    expect(result.samples[0]).toMatchObject({
      outcome: 'infrastructure-blocked',
      residualCoverage: 'provider-quota-exhausted',
    });
  });

  it('stops admission at hard provider budget and records residual coverage', async () => {
    const plan = await createMatrixPlan([selection('case-1'), selection('case-2')], {
      matrixId: 'matrix-1',
      evidenceLevel: 'key-free',
      budgets: { maxProviderRequests: 1 },
      limits: { desktop: 1, provider: 1 },
    });
    const result = await executeMatrixPlan(plan, {
      runSample: vi.fn(async (_selection, options) => completedRun(options.runId)),
    });
    expect(result.samples.filter((sample) => sample.skipped)).toHaveLength(1);
    expect(result.samples.find((sample) => sample.skipped)?.residualCoverage).toBe(
      'provider-quota-exhausted',
    );
  });

  it('makes missing, duplicate or policy-drifted shard evidence non-comparable', async () => {
    const base = {
      matrixId: 'matrix-1',
      strategy: 'matrix',
      evidenceLevel: 'key-free',
      repetitions: 2,
      build: packagedBuild(),
      shard: { index: 0, count: 2 },
    };
    const plan = await createMatrixPlan([selection('case-1')], base);
    const aggregate = aggregateMatrixShards(plan, [
      {
        matrixId: 'matrix-1',
        policyDigest: 'sha256:drift',
        shard: { index: 0, count: 2 },
        samples: [],
      },
    ]);
    expect(aggregate.outcome).toBe('non-comparable');
    expect(aggregate.diagnostics).toEqual(
      expect.arrayContaining([
        'missing shard 1',
        'matrix policy drift',
        expect.stringContaining('missing sample'),
      ]),
    );
  });

  it('proves concurrent process identity, storage, port, report and cleanup isolation', () => {
    expect(() =>
      assertConcurrentSampleIsolation([isolated('a', 4101), isolated('b', 4102)]),
    ).not.toThrow();
    expect(() =>
      assertConcurrentSampleIsolation([isolated('a', 4101), isolated('a', 4101)]),
    ).toThrow('do not isolate');
  });
});

function selection(caseId, extraScenario = {}) {
  return {
    suite: {
      id: 'suite-1',
      modelProfiles: [{ id: 'model-1' }],
      runtimeProfiles: [{ id: 'runtime-1' }],
    },
    scenario: {
      id: caseId,
      suiteId: 'suite-1',
      runtimeProfileId: 'runtime-1',
      modelProfileIds: ['model-1'],
      budget: { timeoutMs: 1000, repetitions: 1 },
      assertions: [{ id: 'answer', kind: 'final-answer' }],
      ...extraScenario,
    },
  };
}

function packagedBuild() {
  return {
    id: 'desktop-build-1',
    kind: 'packaged',
    executablePath: 'out/OpenNeko.app/Contents/MacOS/OpenNeko',
    fingerprint: HASH,
  };
}

function completedRun(runId) {
  return {
    outcome: 'pass',
    reportId: runId,
    result: { usage: { latencyMs: 10, inputTokens: 5, outputTokens: 2, costUsd: 0.01 } },
  };
}

function isolated(id, controlPort) {
  return {
    isolation: {
      applicationInstanceId: `application-${id}`,
      fixtureId: `fixture-${id}`,
      userDataId: `user-data-${id}`,
      workspaceId: `workspace-${id}`,
      settingsStoreId: `settings-${id}`,
      credentialScopeId: `credentials-${id}`,
      piSessionId: `pi-session-${id}`,
      conversationId: `conversation-${id}`,
      controlPort,
      reportId: `report-${id}`,
      singleInstanceLock: 'isolated',
      cleanupStatus: 'complete',
    },
  };
}
