import { describe, expect, it } from 'vitest';
import {
  OPTIMIZATION_SCHEMAS,
  assertOptimizationArtifactSafe,
  checkApprovalValidity,
  hostIdentityKey,
  validateDevelopmentCheckpoint,
  validateDevelopmentHistory,
  validateOptimizationApproval,
  validateOptimizationCandidate,
  validateOptimizationDecision,
  validateOptimizationPlan,
  validateRenameLineage,
} from './optimization-contracts.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const HASH_D = `sha256:${'d'.repeat(64)}`;
const NOW = '2026-07-14T00:00:00.000Z';

function identity(fingerprint = HASH_A, overrides = {}) {
  return {
    name: 'creation-persona',
    source: 'builtin',
    provenance: 'builtin',
    rootId: 'builtin-skills',
    relativePath: 'creation-persona',
    fingerprint,
    ...overrides,
  };
}

function budget(overrides = {}) {
  return {
    maxCandidates: 2,
    maxIterations: 3,
    timeoutMs: 600_000,
    targetTokenLimit: 100_000,
    controllerTokenLimit: 20_000,
    judgeTokenLimit: 30_000,
    costUsdLimit: 20,
    noImprovementLimit: 2,
    ...overrides,
  };
}

function matrix(overrides = {}) {
  return {
    suiteId: 'skill.creation-persona',
    developmentCaseIds: ['draft-rain-station-concept'],
    holdoutPolicy: {
      id: 'creation-persona-holdout-v1',
      selectionDigest: HASH_D,
      minimumCases: 1,
    },
    protectedRegressionCaseIds: ['reject-apply-execution'],
    runtimeProfileId: 'markdown',
    modelProfileId: 'configured-default',
    repetitions: 3,
    judgeProfileId: 'content-quality-judge',
    rubricRef: 'rubrics/rain-station-draft-quality.json',
    ...overrides,
  };
}

function target(fingerprint = HASH_A) {
  return {
    kind: 'skill-content',
    identity: identity(fingerprint),
    targetFile: 'packages/neko-skills/src/builtins/creation-persona.ts',
  };
}

function plan(overrides = {}) {
  return {
    schema: OPTIMIZATION_SCHEMAS.plan,
    id: 'creation-persona-rationale-optimization',
    status: 'proposed',
    target: target(),
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
    rubricDimensions: [{ id: 'creative-rationale', score: 2.5, evidenceRefs: ['failure-1'] }],
    ownership: {
      observedFailure: 'Creative rationale is generic and not tied to visible choices.',
      suspectedOwner: 'skill-content',
      confidence: 0.9,
      evidenceRefs: ['failure-1'],
      missingEvidence: ['A second independent sample is still required.'],
    },
    expectedImprovement:
      'Make creative tradeoffs causally traceable without adding execution steps.',
    risks: ['The candidate may become verbose or overfit the public case.'],
    budget: budget(),
    requiredMatrix: matrix(),
    acceptanceThreshold: { minimumQualityDelta: 0.1, maximumJudgeUncertainty: 0.35 },
    createdBy: 'developer@example.invalid',
    createdAt: NOW,
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    schema: OPTIMIZATION_SCHEMAS.candidate,
    id: 'creation-persona-rationale-candidate-1',
    planId: 'creation-persona-rationale-optimization',
    target: target(),
    baseFingerprint: HASH_A,
    candidateFingerprint: HASH_B,
    patchPath:
      'reports/agent-eval/optimization/creation-persona-rationale-optimization/candidate.patch',
    patchFingerprint: HASH_C,
    changeSummary: 'Clarify evidence-to-decision rationale while preserving the Draft boundary.',
    evidenceRefs: ['failure-1'],
    expectedImprovement: 'Improve creative-rationale content scores.',
    risks: ['Additional guidance may increase output length.'],
    holdoutAccess: 'not-provided',
    canonicalMutation: false,
    commitRequested: false,
    createdBy: 'optimizer@example.invalid',
    createdAt: NOW,
    ...overrides,
  };
}

function approval(overrides = {}) {
  return {
    schema: OPTIMIZATION_SCHEMAS.approval,
    id: 'approval-creation-persona-candidate-1',
    decision: 'approve',
    planId: 'creation-persona-rationale-optimization',
    candidateId: 'creation-persona-rationale-candidate-1',
    target: target(),
    baseFingerprint: HASH_A,
    candidateFingerprint: HASH_B,
    approver: 'human@example.invalid',
    scope: {
      targetFiles: ['packages/neko-skills/src/builtins/creation-persona.ts'],
      allowedSections: ['Rationale'],
    },
    budget: budget(),
    requiredMatrix: matrix(),
    decidedAt: NOW,
    reason: 'The candidate is narrow and its required matrix covers holdout and regression.',
    ...overrides,
  };
}

function checkpoint(state, overrides = {}) {
  const origins = {
    baseline: 'evaluation-baseline',
    candidate: 'optimizer-candidate',
    evaluated: 'evaluation-result',
    accepted: 'human-decision',
    rejected: 'human-decision',
    superseded: 'superseded',
  };
  const decisions = {
    baseline: 'none',
    candidate: 'approved',
    evaluated: 'none',
    accepted: 'accepted',
    rejected: 'rejected',
    superseded: 'superseded',
  };
  const fingerprint = state === 'baseline' ? HASH_A : HASH_B;
  return {
    schema: OPTIMIZATION_SCHEMAS.checkpoint,
    id: `checkpoint-${state}`,
    state,
    identity: identity(fingerprint),
    fingerprint,
    origin: { kind: origins[state], ref: `origin-${state}` },
    reportIds: ['report-quality-regression'],
    attribution: plan().ownership,
    decision: decisions[state],
    actor: 'developer@example.invalid',
    recordedAt: NOW,
    residualRisk: ['Single-domain pilot does not prove generalization.'],
    ...(state === 'baseline'
      ? {}
      : { parent: { entryId: 'checkpoint-baseline', fingerprint: HASH_A } }),
    ...overrides,
  };
}

describe('optimization contracts', () => {
  it('accepts an evidence-linked plan, candidate and bound approval', () => {
    const currentPlan = plan();
    const currentCandidate = candidate();
    expect(validateOptimizationPlan(currentPlan)).toBe(currentPlan);
    expect(validateOptimizationCandidate(currentCandidate, currentPlan)).toBe(currentCandidate);
    expect(validateOptimizationApproval(approval(), currentPlan, currentCandidate).decision).toBe(
      'approve',
    );
  });

  it.each([
    [
      'missing evidence refs',
      () => validateOptimizationCandidate(candidate({ evidenceRefs: ['unknown'] }), plan()),
    ],
    [
      'incomplete Host identity',
      () => {
        const value = plan();
        delete value.target.identity.rootId;
        return validateOptimizationPlan(value);
      },
    ],
    [
      'unsupported owner',
      () =>
        validateOptimizationPlan(
          plan({ ownership: { ...plan().ownership, suspectedOwner: 'capability-tool' } }),
        ),
    ],
    [
      'unauthorized Marketplace target',
      () =>
        validateOptimizationPlan(
          plan({
            target: {
              ...target(),
              identity: identity(HASH_A, {
                source: 'market',
                provenance: 'marketplace',
                rootId: 'market-skills',
              }),
            },
          }),
        ),
    ],
    [
      'unbounded iteration policy',
      () => validateOptimizationPlan(plan({ budget: budget({ maxIterations: 999 }) })),
    ],
    [
      'secret-bearing artifact',
      () => assertOptimizationArtifactSafe({ note: 'api_key=sk-secret-value-123456' }),
    ],
  ])('rejects %s', (_label, operation) => {
    expect(operation).toThrow();
  });

  it('invalidates approval when any bound candidate policy changes', () => {
    const currentPlan = plan();
    const currentCandidate = candidate();
    expect(checkApprovalValidity(approval(), currentPlan, currentCandidate)).toEqual({
      valid: true,
      reasons: [],
    });
    expect(
      checkApprovalValidity(approval(), currentPlan, candidate({ candidateFingerprint: HASH_D })),
    ).toMatchObject({ valid: false });
    expect(
      checkApprovalValidity(
        approval(),
        plan({ budget: budget({ maxCandidates: 3 }) }),
        currentCandidate,
      ),
    ).toMatchObject({ valid: false });
    expect(
      checkApprovalValidity(
        approval(),
        plan({ requiredMatrix: matrix({ repetitions: 4 }) }),
        currentCandidate,
      ),
    ).toMatchObject({ valid: false });
  });

  it('accepts a candidate only from content-quality and protected-check evidence', () => {
    const decision = {
      schema: OPTIMIZATION_SCHEMAS.decision,
      id: 'decision-candidate-1',
      planId: plan().id,
      candidateId: candidate().id,
      approvalId: approval().id,
      outcome: 'accepted',
      target: target(),
      baseFingerprint: HASH_A,
      candidateFingerprint: HASH_B,
      reportIds: ['report-base-1', 'report-candidate-1', 'report-holdout-1', 'report-regression-1'],
      checks: {
        hardGates: { status: 'pass', reportIds: ['report-candidate-1'] },
        holdout: { status: 'pass', reportIds: ['report-holdout-1'] },
        protectedRegression: { status: 'pass', reportIds: ['report-regression-1'] },
      },
      blindComparison: {
        id: 'blind-comparison-1',
        outcome: 'candidate-preferred',
        orderDigest: HASH_C,
        mappingRefs: ['reports/agent-eval/optimization/run-1/blind-mapping.json'],
        reportIds: ['report-base-1', 'report-candidate-1'],
      },
      quality: {
        status: 'available',
        baselineMean: 3.8,
        candidateMean: 4.2,
        delta: 0.4,
        samples: 6,
        maximumUncertainty: 0.2,
      },
      budgetUsage: {
        candidates: 1,
        iterations: 1,
        wallTimeMs: 200_000,
        targetTokens: 30_000,
        controllerTokens: 5_000,
        judgeTokens: 10_000,
        cost: { status: 'available', totalUsd: 4 },
        noImprovementIterations: 0,
      },
      decidedBy: 'human@example.invalid',
      decidedAt: NOW,
      residualRisk: ['One Skill does not prove cross-domain quality.'],
    };
    expect(validateOptimizationDecision(decision, { plan: plan() }).outcome).toBe('accepted');
    expect(() =>
      validateOptimizationDecision(
        {
          ...decision,
          checks: {
            ...decision.checks,
            holdout: { status: 'fail', reportIds: ['report-holdout-1'] },
          },
        },
        { plan: plan() },
      ),
    ).toThrow('protected check');
    expect(() =>
      validateOptimizationDecision(
        {
          ...decision,
          outcome: 'rejected',
          checks: { ...decision.checks, holdout: { status: 'fail', reportIds: [] } },
        },
        { plan: plan() },
      ),
    ).toThrow('requires report evidence');
    expect(() =>
      validateOptimizationDecision(
        { ...decision, quality: { ...decision.quality, delta: 1 } },
        { plan: plan() },
      ),
    ).toThrow('quality delta');
    expect(() =>
      validateOptimizationDecision(
        {
          ...decision,
          budgetUsage: { ...decision.budgetUsage, cost: { status: 'unavailable' } },
        },
        { plan: plan() },
      ),
    ).toThrow('cost evidence is unavailable');
  });
});

describe('Skill development history contracts', () => {
  it('uses complete Host identity and immutable fingerprint checkpoints', () => {
    const baseline = checkpoint('baseline');
    const candidateEntry = checkpoint('candidate');
    expect(validateDevelopmentCheckpoint(baseline)).toBe(baseline);
    expect(validateDevelopmentCheckpoint(candidateEntry)).toBe(candidateEntry);
    expect(hostIdentityKey(identity(HASH_A))).toBe(hostIdentityKey(identity(HASH_B)));
  });

  it('requires explicit rename or move lineage for changed identity', () => {
    const lineage = {
      schema: OPTIMIZATION_SCHEMAS.renameLineage,
      id: 'move-creation-persona',
      kind: 'move',
      fromIdentity: identity(HASH_A),
      toIdentity: identity(HASH_A, {
        name: 'creation-partner',
        relativePath: 'creation-partner',
      }),
      reason: 'The portable package was explicitly renamed.',
      actor: 'developer@example.invalid',
      recordedAt: NOW,
    };
    expect(validateRenameLineage(lineage)).toBe(lineage);
    expect(() => validateRenameLineage({ ...lineage, toIdentity: identity(HASH_A) })).toThrow(
      'changed Host identity',
    );
  });

  it('rejects Market package/version state from history', () => {
    const history = {
      schema: OPTIMIZATION_SCHEMAS.history,
      entries: [checkpoint('baseline')],
      renameLineage: [],
    };
    expect(validateDevelopmentHistory(history)).toBe(history);
    expect(() =>
      validateDevelopmentHistory({
        ...history,
        entries: [{ ...history.entries[0], packageId: 'market.creation-persona' }],
      }),
    ).toThrow();
    expect(() =>
      validateDevelopmentHistory({
        ...history,
        semver: '1.0.0',
      }),
    ).toThrow();
  });
});
