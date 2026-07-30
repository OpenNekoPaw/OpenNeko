import * as fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { discoverSuites, selectSuiteCases } from '../suites/discovery.mjs';
import {
  createConfigurationAblationDryRun,
  runConfigurationAblation,
} from './configuration-runner.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HASH_ZERO = `sha256:${'0'.repeat(64)}`;
const HASH_ONE = `sha256:${'1'.repeat(64)}`;

async function plan() {
  return JSON.parse(
    await fs.readFile(resolve(ROOT, 'ablation/plans/thinking-budget.json'), 'utf8'),
  );
}

async function selection() {
  return selectSuiteCases(await discoverSuites(), {
    suiteId: 'agent-runtime.model-binding',
    caseId: 'explicit-chat-model',
  })[0];
}

function fakeRun(runtimeProfileId, effectiveDigest, overrides = {}) {
  const samples = [1, 2, 3].map((index) => ({
    reportId: `report-${runtimeProfileId}-${index}`,
    outcome: 'pass',
    result: {
      runId: `${runtimeProfileId}-${index}`,
      target: {
        kind: 'runtime',
        id: 'model-binding',
        contractHash: `sha256:${'a'.repeat(64)}`,
      },
      repositoryRevision: 'working-tree',
      fixtureDigest: `sha256:${'b'.repeat(64)}`,
      modelIdentity: { providerId: 'openai', modelId: 'gpt-5' },
      effectiveConfiguration: {
        runtimeProfileId,
        modelProfileId: 'nekoapi-gpt-5.5',
        digest: effectiveDigest,
      },
      assertions: [
        { id: 'runtime', status: 'pass', evidenceRefs: ['turn-facts'] },
        { id: 'idle', status: 'pass', evidenceRefs: ['turn-facts'] },
      ],
    },
  }));
  return {
    outcome: 'pass',
    samples,
    aggregate: {
      passRate: 1,
      hardGates: { passed: 6, failed: 0, blocked: 0 },
      latency: { totalMs: 60, meanMs: 20, p50Ms: 20, p95Ms: 29 },
      tokens: { input: 30, output: 12 },
      cost: { status: 'available', totalUsd: 0.03 },
      iterations: { total: 6, mean: 2 },
      tools: { calls: 3, successes: 3, failures: 0 },
      retries: { count: 0 },
      scoreDistribution: { samples: 0, passRate: 0 },
    },
    ...overrides,
  };
}

describe('configuration ablation runner', () => {
  it('selects supported profiles, runs every repetition through runV2Case, and writes one delta extension', async () => {
    const selectedPlan = await plan();
    const runCase = vi.fn(async (selected) => {
      expect(selected.scenario.budget.repetitions).toBe(3);
      const profileId = selected.scenario.runtimeProfileId;
      return fakeRun(profileId, profileId === 'thinking-0' ? HASH_ZERO : HASH_ONE);
    });
    const writeDelta = vi.fn(async () => ({ variantDelta: '/tmp/variant-delta.json' }));
    const run = await runConfigurationAblation(selectedPlan, {
      runId: 'config-pilot',
      runCase,
      writeDelta,
    });
    expect(runCase).toHaveBeenCalledTimes(2);
    expect(runCase.mock.calls.map(([selected]) => selected.scenario.runtimeProfileId)).toEqual([
      'thinking-0',
      'thinking-128',
    ]);
    expect(run).toMatchObject({
      outcome: 'pass',
      files: { variantDelta: '/tmp/variant-delta.json' },
      delta: {
        schema: 'neko.agent-eval.ablation-delta.v1',
        baselineVariantId: 'thinking-0',
        variants: [
          { id: 'thinking-0', comparable: true },
          {
            id: 'thinking-128',
            comparable: true,
            deltaFromBaseline: { inputTokens: 0, latencyP95Ms: 0 },
          },
        ],
      },
    });
    expect(writeDelta).toHaveBeenCalledOnce();
  });

  it('fails before execution when declared profile identity drifts', async () => {
    const selectedPlan = await plan();
    selectedPlan.variants[1].expectedConfiguration.runtimeConfigurationHash = `sha256:${'f'.repeat(64)}`;
    await expect(
      runConfigurationAblation(selectedPlan, { runCase: vi.fn() }),
    ).rejects.toMatchObject({ code: 'configuration-invalid' });
  });

  it('retains missing effective configuration evidence as configuration-invalid', async () => {
    const selectedPlan = await plan();
    const run = await runConfigurationAblation(selectedPlan, {
      runCase: async (selected) => {
        const result = fakeRun(selected.scenario.runtimeProfileId, HASH_ZERO, {
          outcome: 'configuration-invalid',
        });
        result.samples[0].result.effectiveConfiguration = {
          runtimeProfileId: selected.scenario.runtimeProfileId,
        modelProfileId: 'nekoapi-gpt-5.5',
          status: 'missing',
          diagnostic: 'missing fact',
        };
        return result;
      },
      writeDelta: async () => ({ variantDelta: '/tmp/missing-config.json' }),
    });
    expect(run.outcome).toBe('configuration-invalid');
    expect(run.delta.variants[0]).toMatchObject({
      comparable: false,
      executionIdentity: { status: 'missing', diagnostics: ['missing fact'] },
    });
  });

  it('marks policy drift and an unchanged effective digest as non-comparable', async () => {
    const selectedPlan = await plan();
    const run = await runConfigurationAblation(selectedPlan, {
      runCase: async (selected) => {
        const result = fakeRun(selected.scenario.runtimeProfileId, HASH_ZERO);
        if (selected.scenario.runtimeProfileId === 'thinking-128') {
          result.samples[0].result.modelIdentity.modelId = 'fallback-model';
        }
        return result;
      },
      writeDelta: async () => ({ variantDelta: '/tmp/non-comparable.json' }),
    });
    expect(run.outcome).toBe('non-comparable');
    expect(run.delta.variants[1].comparabilityDiagnostics).toEqual(
      expect.arrayContaining([
        'model identity differs',
        'effective configuration digest did not change from baseline',
      ]),
    );
  });

  it('creates a key-free dry-run without starting a Desktop session driver', async () => {
    const dryRun = createConfigurationAblationDryRun(await plan(), await selection());
    expect(dryRun).toMatchObject({
      ok: true,
      dryRun: true,
      planId: 'thinking-budget-pilot',
      quality: {
        kind: 'hard-gates-only',
      },
      variants: [
        { runtimeProfileId: 'thinking-0', repetitions: 3 },
        { runtimeProfileId: 'thinking-128', repetitions: 3 },
      ],
    });
  });
});
