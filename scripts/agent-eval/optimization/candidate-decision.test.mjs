import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OPTIMIZATION_SCHEMAS } from '../schemas/optimization-contracts.mjs';
import {
  appendOptimizationHistory,
  createCandidateAcceptanceDecision,
  createOptimizationHistoryCheckpoints,
  decideNextOptimizationIteration,
} from './candidate-decision.mjs';
import { loadDevelopmentHistory } from './history-store.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const NOW = '2026-07-14T00:00:00.000Z';
const TARGET_FILE = 'packages/neko-skills/src/builtins/creation-persona.ts';
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function identity(fingerprint = HASH_A) {
  return {
    name: 'creation-persona',
    source: 'builtin',
    provenance: 'builtin',
    rootId: 'builtin-skills',
    relativePath: 'creation-persona',
    fingerprint,
  };
}

function budget() {
  return {
    maxCandidates: 2,
    maxIterations: 3,
    timeoutMs: 600_000,
    targetTokenLimit: 100_000,
    controllerTokenLimit: 20_000,
    judgeTokenLimit: 30_000,
    costUsdLimit: 20,
    noImprovementLimit: 2,
  };
}

function matrix() {
  return {
    suiteId: 'skill.creation-persona',
    developmentCaseIds: ['draft-rain-station-concept'],
    holdoutPolicy: {
      id: 'creation-persona-holdout-v1',
      selectionDigest: HASH_C,
      minimumCases: 1,
    },
    protectedRegressionCaseIds: ['reject-apply-execution'],
    runtimeProfileId: 'markdown',
    modelProfileId: 'configured-default',
    repetitions: 2,
    judgeProfileId: 'content-quality-judge',
    rubricRef: 'rubrics/draft-quality.json',
  };
}

function plan() {
  return {
    schema: OPTIMIZATION_SCHEMAS.plan,
    id: 'creation-persona-rationale-optimization',
    status: 'proposed',
    target: { kind: 'skill-content', identity: identity(), targetFile: TARGET_FILE },
    baseFingerprint: HASH_A,
    reportIds: ['report-quality-regression'],
    failedCases: [
      {
        suiteId: 'skill.creation-persona',
        caseId: 'draft-rain-station-concept',
        reportId: 'report-quality-regression',
        outcome: 'case-fail',
      },
    ],
    rubricDimensions: [{ id: 'creative-rationale', score: 2.5, evidenceRefs: ['turn-facts'] }],
    ownership: {
      observedFailure: 'Creative rationale is generic.',
      suspectedOwner: 'skill-content',
      confidence: 0.9,
      evidenceRefs: ['turn-facts'],
      missingEvidence: [],
    },
    expectedImprovement: 'Improve causal creative reasoning.',
    risks: ['Public-case overfitting.'],
    budget: budget(),
    requiredMatrix: matrix(),
    acceptanceThreshold: { minimumQualityDelta: 0.1, maximumJudgeUncertainty: 0.35 },
    createdBy: 'developer@example.invalid',
    createdAt: NOW,
  };
}

function candidate() {
  return {
    schema: OPTIMIZATION_SCHEMAS.candidate,
    id: 'creation-persona-candidate-1',
    planId: plan().id,
    target: plan().target,
    baseFingerprint: HASH_A,
    candidateFingerprint: HASH_B,
    patchPath: 'reports/agent-eval/optimization/plan/candidate.patch',
    patchFingerprint: HASH_C,
    changeSummary: 'Clarify creative rationale.',
    evidenceRefs: ['turn-facts'],
    expectedImprovement: 'Improve output-content quality.',
    risks: ['Potential verbosity.'],
    holdoutAccess: 'not-provided',
    canonicalMutation: false,
    commitRequested: false,
    createdBy: 'optimizer@example.invalid',
    createdAt: NOW,
  };
}

function approval() {
  return {
    schema: OPTIMIZATION_SCHEMAS.approval,
    id: 'approval-candidate-1',
    decision: 'approve',
    planId: plan().id,
    candidateId: candidate().id,
    target: plan().target,
    baseFingerprint: HASH_A,
    candidateFingerprint: HASH_B,
    approver: 'human@example.invalid',
    scope: { targetFiles: [TARGET_FILE], allowedSections: ['Rationale'] },
    budget: budget(),
    requiredMatrix: matrix(),
    decidedAt: NOW,
    reason: 'Approved for isolated Evaluation.',
  };
}

function usage(overrides = {}) {
  return {
    candidates: 1,
    iterations: 1,
    wallTimeMs: 200_000,
    targetTokens: 30_000,
    controllerTokens: 5_000,
    judgeTokens: 10_000,
    cost: { status: 'available', totalUsd: 4 },
    noImprovementIterations: 0,
    ...overrides,
  };
}

function sample(group, role, index, overrides = {}) {
  return {
    reportId: `report-${group}-${role}-${index}`,
    outcome: 'pass',
    result: {
      assertions: [{ id: 'skill', status: 'pass', evidenceRefs: ['persona-facts'] }],
    },
    ...(group === 'protected-regression'
      ? {}
      : {
          judge: {
            overallScore: role === 'baseline' ? 3.8 : 4.3,
            uncertainty: 0.15,
          },
        }),
    ...overrides,
  };
}

function groupRun(group, overrides = {}) {
  return {
    group,
    run: {
      outcome: 'pass',
      runs: [
        {
          variant: { role: 'baseline' },
          run: {
            outcome: 'pass',
            samples: [sample(group, 'baseline', 1), sample(group, 'baseline', 2)],
          },
        },
        {
          variant: { role: 'variant' },
          run: {
            outcome: 'pass',
            samples: [sample(group, 'candidate', 1), sample(group, 'candidate', 2)],
          },
        },
      ],
      ...overrides,
    },
  };
}

function evaluation(overrides = {}) {
  return {
    runId: 'optimization-run-1',
    outcome: 'pass',
    runs: [groupRun('development'), groupRun('holdout'), groupRun('protected-regression')],
    blindComparisons: [
      ['development', 1],
      ['development', 2],
      ['holdout', 1],
      ['holdout', 2],
    ].map(([group, index], order) => ({
      outcome: 'candidate-preferred',
      uncertainty: 0.1,
      orderDigest: `sha256:${String(order + 1).repeat(64)}`,
      mappingRef: `reports/agent-eval/optimization/run-${order + 1}/blind-mapping.json`,
      reportIds: [`report-${group}-baseline-${index}`, `report-${group}-candidate-${index}`],
    })),
    ...overrides,
  };
}

function decide(evaluationInput = evaluation(), usageInput = usage()) {
  return createCandidateAcceptanceDecision({
    id: 'decision-candidate-1',
    plan: plan(),
    candidate: candidate(),
    approval: approval(),
    evaluation: evaluationInput,
    budgetUsage: usageInput,
    decidedBy: 'human@example.invalid',
    decidedAt: NOW,
    residualRisk: ['One Skill does not prove cross-domain quality.'],
  });
}

describe('candidate acceptance state machine', () => {
  it('accepts only real output-content improvement with blind, holdout and regression protection', () => {
    const decision = decide();
    expect(decision).toMatchObject({
      outcome: 'accepted',
      quality: {
        status: 'available',
        baselineMean: 3.8,
        candidateMean: 4.3,
        delta: 0.5,
        samples: 8,
      },
      checks: {
        hardGates: { status: 'pass' },
        holdout: { status: 'pass' },
        protectedRegression: { status: 'pass' },
      },
      blindComparison: { outcome: 'candidate-preferred' },
    });
  });

  it.each(['hard-gate', 'holdout', 'protected-regression'])(
    'rejects on %s failure regardless of Judge improvement',
    (kind) => {
      const current = evaluation();
      if (kind === 'hard-gate') {
        current.runs[0].run.runs[1].run.samples[0].result.assertions[0].status = 'fail';
      } else {
        const group = kind === 'holdout' ? 'holdout' : 'protected-regression';
        const run = current.runs.find((entry) => entry.group === group).run.runs[1].run;
        run.outcome = 'case-fail';
        run.samples[0].outcome = 'case-fail';
      }
      expect(decide(current).outcome).toBe('rejected');
    },
  );

  it('rejects blind baseline preference and does not derive quality from hard gates', () => {
    const blindRegression = evaluation({
      blindComparisons: evaluation().blindComparisons.map((item) => ({
        ...item,
        outcome: 'baseline-preferred',
      })),
    });
    expect(decide(blindRegression).outcome).toBe('rejected');

    const noJudge = evaluation();
    for (const entry of noJudge.runs) {
      for (const variant of entry.run.runs) {
        for (const currentSample of variant.run.samples) delete currentSample.judge;
      }
    }
    const decision = decide(noJudge);
    expect(decision.outcome).toBe('non-comparable');
    expect(decision.quality).toEqual({
      status: 'unavailable',
      reason: 'Real output-content Judge samples are unavailable or unmatched.',
    });
  });

  it('does not attach unrelated report evidence when protected groups are missing', () => {
    const current = evaluation({
      runs: [groupRun('development')],
      blindComparisons: evaluation().blindComparisons.filter((comparison) =>
        comparison.reportIds[0].includes('development'),
      ),
    });
    const decision = decide(current);
    expect(decision.outcome).toBe('rejected');
    expect(decision.checks.holdout).toEqual({ status: 'blocked', reportIds: [] });
    expect(decision.checks.protectedRegression).toEqual({ status: 'blocked', reportIds: [] });
  });

  it('blocks when cost/time/token limits are exceeded or no improvement limit is reached', () => {
    expect(
      decide(evaluation(), usage({ cost: { status: 'available', totalUsd: 21 } })).outcome,
    ).toBe('blocked');
    const unavailableCost = decide(evaluation(), usage({ cost: { status: 'unavailable' } }));
    expect(unavailableCost.outcome).toBe('blocked');
    expect(unavailableCost.budgetUsage.cost).toEqual({ status: 'unavailable' });
    expect(unavailableCost.residualRisk).toContain('Provider cost evidence is unavailable.');
    expect(decide(evaluation(), usage({ noImprovementIterations: 2 })).outcome).toBe('blocked');
  });

  it('never retries behavior failures into success and separates infrastructure retry', () => {
    expect(
      decideNextOptimizationIteration({
        plan: plan(),
        lastOutcome: 'case-fail',
        budgetUsage: usage(),
      }),
    ).toMatchObject({ action: 'reject-candidate', retryAllowed: false });
    expect(
      decideNextOptimizationIteration({
        plan: plan(),
        lastOutcome: 'infrastructure-fail',
        budgetUsage: usage(),
      }),
    ).toMatchObject({ action: 'retry-infrastructure', retryAllowed: true });
    expect(
      decideNextOptimizationIteration({
        plan: plan(),
        lastOutcome: 'pass',
        budgetUsage: usage({ cost: { status: 'unavailable' } }),
      }),
    ).toMatchObject({ action: 'stop', retryAllowed: false });
    expect(
      decideNextOptimizationIteration({
        plan: plan(),
        lastOutcome: 'pass',
        budgetUsage: usage({ noImprovementIterations: 2 }),
      }),
    ).toMatchObject({ action: 'stop', retryAllowed: false });
  });
});

describe('optimization decision history', () => {
  it('creates baseline, candidate, evaluated and accepted evidence-linked checkpoints', async () => {
    const decision = decide();
    expect(
      createOptimizationHistoryCheckpoints({
        plan: plan(),
        candidate: candidate(),
        approval: approval(),
        decision,
        actor: 'human@example.invalid',
        recordedAt: NOW,
      }).map((checkpoint) => checkpoint.state),
    ).toEqual(['baseline', 'candidate', 'evaluated', 'accepted']);

    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-optimization-history-'));
    temporaryDirectories.push(root);
    const file = join(root, 'history.json');
    await appendOptimizationHistory(
      {
        plan: plan(),
        candidate: candidate(),
        approval: approval(),
        decision,
        actor: 'human@example.invalid',
        recordedAt: NOW,
      },
      { file },
    );
    const history = await loadDevelopmentHistory(file);
    expect(history.entries).toHaveLength(4);
    expect(history.entries.at(-1)).toMatchObject({
      state: 'accepted',
      fingerprint: HASH_B,
      decisionId: decision.id,
      reportIds: decision.reportIds,
    });
    expect(JSON.stringify(history)).not.toContain('packageId');
    expect(JSON.stringify(history)).not.toContain('semver');
  });

  it('continues a later candidate from the prior terminal checkpoint', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-optimization-history-'));
    temporaryDirectories.push(root);
    const file = join(root, 'history.json');
    const firstDecision = decide();
    await appendOptimizationHistory(
      {
        plan: plan(),
        candidate: candidate(),
        approval: approval(),
        decision: firstDecision,
        actor: 'human@example.invalid',
        recordedAt: NOW,
      },
      { file },
    );

    const nextPlan = {
      ...plan(),
      id: 'creation-persona-rationale-optimization-2',
      target: {
        ...plan().target,
        identity: identity(HASH_B),
      },
      baseFingerprint: HASH_B,
      reportIds: ['report-quality-regression-2'],
      failedCases: [
        {
          ...plan().failedCases[0],
          reportId: 'report-quality-regression-2',
        },
      ],
    };
    const nextCandidate = {
      ...candidate(),
      id: 'creation-persona-candidate-2',
      planId: nextPlan.id,
      target: nextPlan.target,
      baseFingerprint: HASH_B,
      candidateFingerprint: HASH_C,
    };
    const nextApproval = {
      ...approval(),
      id: 'approval-candidate-2',
      planId: nextPlan.id,
      candidateId: nextCandidate.id,
      target: nextPlan.target,
      baseFingerprint: HASH_B,
      candidateFingerprint: HASH_C,
    };
    const nextDecision = createCandidateAcceptanceDecision({
      id: 'decision-candidate-2',
      plan: nextPlan,
      candidate: nextCandidate,
      approval: nextApproval,
      evaluation: evaluation(),
      budgetUsage: usage(),
      decidedBy: 'human@example.invalid',
      decidedAt: NOW,
      residualRisk: ['The second candidate uses the same synthetic matrix.'],
    });
    await appendOptimizationHistory(
      {
        plan: nextPlan,
        candidate: nextCandidate,
        approval: nextApproval,
        decision: nextDecision,
        actor: 'human@example.invalid',
        recordedAt: NOW,
      },
      { file },
    );

    const entries = (await loadDevelopmentHistory(file)).entries;
    expect(entries.map((entry) => entry.state)).toEqual([
      'baseline',
      'candidate',
      'evaluated',
      'accepted',
      'baseline',
      'candidate',
      'evaluated',
      'accepted',
    ]);
    expect(entries[4].parent).toEqual({
      entryId: entries[3].id,
      fingerprint: HASH_B,
    });
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(8);
  });

  it('records a failed protected matrix as rejected history, never least-failing success', () => {
    const current = evaluation();
    current.runs[1].run.runs[1].run.outcome = 'case-fail';
    current.runs[1].run.runs[1].run.samples[0].outcome = 'case-fail';
    const decision = decide(current);
    expect(decision.outcome).toBe('rejected');
    expect(
      createOptimizationHistoryCheckpoints({
        plan: plan(),
        candidate: candidate(),
        approval: approval(),
        decision,
        actor: 'human@example.invalid',
        recordedAt: NOW,
      }).at(-1),
    ).toMatchObject({ state: 'rejected', decision: 'rejected' });
  });

  it('binds history checkpoints to the approved candidate and decision', () => {
    const decision = decide();
    expect(() =>
      createOptimizationHistoryCheckpoints({
        plan: plan(),
        candidate: { ...candidate(), id: 'different-candidate' },
        approval: approval(),
        decision,
        actor: 'human@example.invalid',
        recordedAt: NOW,
      }),
    ).toThrow('valid approval');
    expect(() =>
      createOptimizationHistoryCheckpoints({
        plan: plan(),
        candidate: candidate(),
        approval: approval(),
        decision: { ...decision, candidateId: 'different-candidate' },
        actor: 'human@example.invalid',
        recordedAt: NOW,
      }),
    ).toThrow('candidate is stale');
  });
});
