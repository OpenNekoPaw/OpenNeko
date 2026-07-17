import { describe, expect, it, vi } from 'vitest';
import { ABLATION_METRICS, ABLATION_SCHEMAS } from '../schemas/ablation-contracts.mjs';
import { discoverSuites, selectSuiteCases } from '../suites/discovery.mjs';
import {
  createImplementationAblationDryRun,
  runImplementationAblation,
} from './implementation-runner.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const CONFIG_DIGEST = `sha256:${'d'.repeat(64)}`;

function plan() {
  return {
    schema: ABLATION_SCHEMAS.plan,
    id: 'media-production-guidance-pilot',
    mode: 'implementation',
    suiteId: 'skill.media-production',
    caseId: 'animation-production-plan',
    baselineVariantId: 'base-guidance',
    matrix: { strategy: 'focused', maxVariants: 2 },
    repetitions: 2,
    comparisonPolicy: {
      retainEverySample: true,
      correctnessDominates: true,
      metrics: [...ABLATION_METRICS],
      quality: { kind: 'hard-gates-only', reason: 'No content Judge is configured.' },
    },
    variants: ['base-guidance', 'without-rationale-guidance'].map((id, index) => ({
      id,
      role: index === 0 ? 'baseline' : 'variant',
      kind: 'implementation',
      description: index === 0 ? 'Canonical guidance.' : 'Guidance removed in an isolated patch.',
      changes: index === 0 ? [] : ['skill-content'],
      skillIdentity: {
        name: 'media-production',
        source: 'builtin',
        provenance: 'builtin',
        rootId: 'builtin-skills',
        relativePath: 'media-production',
        fingerprint: index === 0 ? HASH_A : HASH_B,
      },
      developmentCheckpoint: {
        kind: index === 0 ? 'git-revision' : 'working-tree-patch',
        ref: index === 0 ? 'base-revision' : 'without-rationale.patch',
        fingerprint: index === 0 ? HASH_A : HASH_B,
      },
      buildTarget: {
        sourceRevision: index === 0 ? 'base-revision' : 'variant-revision',
        sourceFingerprint: index === 0 ? HASH_A : HASH_B,
        buildRecipeFingerprint: HASH_C,
        buildCommands: [{ command: 'pnpm', args: ['build'], timeoutMs: 600_000 }],
        executablePath: 'dist/cli.js',
        launchCommand: { command: 'node', args: ['{executable}'] },
      },
      expectedPath: ['isolated worktree', 'isolated TUI build', 'TUI debug automation'],
      forbiddenFallback: [
        'working-tree executable',
        '__ablation marker',
        'direct AgentSession runner',
      ],
    })),
  };
}

function fakeRun(selected, executableFingerprint) {
  const samples = [1, 2].map((index) => ({
    reportId: `report-${executableFingerprint.slice(-2)}-${index}`,
    outcome: 'pass',
    result: {
      target: selected.suite.target,
      repositoryRevision: selected.suite.repositoryRevision,
      fixtureDigest: `sha256:${'e'.repeat(64)}`,
      modelIdentity: { providerId: 'openai', modelId: 'gpt-5' },
      effectiveConfiguration: {
        runtimeProfileId: 'markdown',
        modelProfileId: 'configured-default',
        digest: CONFIG_DIGEST,
      },
      assertions: selected.scenario.assertions.map((assertion) => ({
        id: assertion.id,
        status: 'pass',
        evidenceRefs: [assertion.evidenceRef],
      })),
    },
  }));
  const qualityMean = selected.suite.target.identity.fingerprint === HASH_A ? 4.5 : 3.5;
  return {
    outcome: 'pass',
    samples,
    aggregate: {
      passRate: 1,
      hardGates: { passed: 8, failed: 0, blocked: 0 },
      latency: { totalMs: 40, meanMs: 20, p50Ms: 20, p95Ms: 25 },
      tokens: { input: 20, output: 10 },
      cost: { status: 'unavailable' },
      iterations: { total: 4, mean: 2 },
      tools: { calls: 0, successes: 0, failures: 0 },
      retries: { count: 0 },
      tasks: { total: 0, completed: 0, failed: 0, cancelled: 0 },
      scoreDistribution: { samples: 0, passRate: 0 },
    },
  };
}

async function selection() {
  return selectSuiteCases(await discoverSuites(), {
    suiteId: 'skill.media-production',
    caseId: 'animation-production-plan',
  })[0];
}

describe('implementation ablation runner', () => {
  it('uses isolated executables with the same TUI runner and keeps build identity external', async () => {
    const cleanups = [vi.fn(), vi.fn()];
    let preparedIndex = 0;
    const prepareBuild = vi.fn(async () => {
      const index = preparedIndex++;
      return {
        workspace: `/tmp/worktree-${index}`,
        revision: `revision-${index}`,
        sourceFingerprint: index === 0 ? HASH_A : HASH_B,
        buildRecipeFingerprint: HASH_C,
        executableFingerprint: index === 0 ? HASH_A : HASH_B,
        launch: { command: 'node', args: [`/tmp/worktree-${index}/dist/cli.js`] },
        cleanup: cleanups[index],
      };
    });
    const runCase = vi.fn(async (selected, options) => {
      expect(options).toMatchObject({
        debugCommand: 'node',
        judgeTargetVisibility: 'identity-only',
      });
      expect(options.debugCommandArgsPrefix[0]).toContain('/dist/cli.js');
      expect(JSON.stringify(selected)).not.toContain('buildRecipeFingerprint');
      expect(JSON.stringify(selected)).not.toContain('__ablation');
      const skillGate = selected.scenario.assertions.find(
        (assertion) => assertion.kind === 'skill',
      );
      expect(skillGate.identity).toEqual(selected.suite.target.identity);
      return fakeRun(selected, selected.suite.target.identity.fingerprint);
    });
    const run = await runImplementationAblation(plan(), {
      runId: 'implementation-pilot',
      prepareBuild,
      runCase,
      writeDelta: async () => ({ variantDelta: '/tmp/implementation-delta.json' }),
    });
    expect(runCase).toHaveBeenCalledTimes(2);
    expect(cleanups[0]).toHaveBeenCalledOnce();
    expect(cleanups[1]).toHaveBeenCalledOnce();
    expect(run).toMatchObject({
      outcome: 'pass',
      delta: {
        variants: [
          {
            id: 'base-guidance',
            executionIdentity: { kind: 'implementation', executableFingerprint: HASH_A },
          },
          {
            id: 'without-rationale-guidance',
            executionIdentity: { kind: 'implementation', executableFingerprint: HASH_B },
          },
        ],
      },
    });
  });

  it('cleans a prepared worktree when the TUI run throws', async () => {
    const cleanup = vi.fn();
    await expect(
      runImplementationAblation(plan(), {
        prepareBuild: async () => ({
          workspace: '/tmp/worktree',
          revision: 'revision',
          sourceFingerprint: HASH_A,
          buildRecipeFingerprint: HASH_C,
          executableFingerprint: HASH_A,
          launch: { command: 'node', args: ['/tmp/worktree/dist/cli.js'] },
          cleanup,
        }),
        runCase: async () => {
          throw new Error('runner failed');
        },
      }),
    ).rejects.toThrow('runner failed');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('marks identical executables or configuration drift as non-comparable', async () => {
    let index = 0;
    const selectedPlan = plan();
    const run = await runImplementationAblation(selectedPlan, {
      prepareBuild: async () => ({
        workspace: `/tmp/worktree-${index}`,
        revision: `revision-${index++}`,
        sourceFingerprint: HASH_A,
        buildRecipeFingerprint: HASH_C,
        executableFingerprint: HASH_A,
        launch: { command: 'node', args: ['/tmp/worktree/dist/cli.js'] },
        cleanup: async () => {},
      }),
      runCase: async (selected) => {
        const result = fakeRun(selected, HASH_A);
        if (selected.suite.target.identity.fingerprint === HASH_B) {
          result.samples[0].result.effectiveConfiguration.digest = HASH_C;
        }
        return result;
      },
      writeDelta: async () => ({ variantDelta: '/tmp/non-comparable.json' }),
    });
    expect(run.outcome).toBe('non-comparable');
    expect(run.delta.variants[1].comparabilityDiagnostics).toEqual(
      expect.arrayContaining([
        'effective runtime configuration differs',
        'isolated executable fingerprint did not change from baseline',
      ]),
    );
  });

  it('validates the complete build matrix in a key-free dry-run', async () => {
    const dryRun = createImplementationAblationDryRun(plan(), await selection());
    expect(dryRun).toMatchObject({
      ok: true,
      dryRun: true,
      planId: 'media-production-guidance-pilot',
      quality: {
        kind: 'hard-gates-only',
      },
      variants: [
        { id: 'base-guidance', repetitions: 2 },
        { id: 'without-rationale-guidance', repetitions: 2 },
      ],
    });
  });
});
