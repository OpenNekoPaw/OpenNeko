import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OPTIMIZATION_SCHEMAS } from '../schemas/optimization-contracts.mjs';
import {
  createOptimizerContext,
  fingerprintHoldoutSelection,
  loadTrustedHoldoutSelection,
} from './holdout-policy.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
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

function selection() {
  const value = {
    schema: OPTIMIZATION_SCHEMAS.holdoutSelection,
    policyId: 'creation-persona-holdout-v1',
    suiteId: 'skill.creation-persona',
    caseIds: ['draft-coastal-radio-concept'],
    selectionDigest: HASH_A,
    visibility: 'optimizer-hidden',
    createdAt: NOW,
  };
  value.selectionDigest = fingerprintHoldoutSelection(value);
  return value;
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
      id: selection().policyId,
      selectionDigest: selection().selectionDigest,
      minimumCases: 1,
    },
    protectedRegressionCaseIds: ['reject-apply-execution'],
    runtimeProfileId: 'markdown',
    modelProfileId: 'configured-default',
    repetitions: 3,
    judgeProfileId: 'content-quality-judge',
    rubricRef: 'rubrics/rain-station-draft-quality.json',
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
    patchFingerprint: HASH_A,
    changeSummary: 'Clarify creative rationale.',
    evidenceRefs: ['turn-facts'],
    expectedImprovement: 'Improve content quality.',
    risks: ['Potential verbosity.'],
    holdoutAccess: 'not-provided',
    canonicalMutation: false,
    commitRequested: false,
    createdBy: 'optimizer@example.invalid',
    createdAt: NOW,
  };
}

function approval(overrides = {}) {
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
    ...overrides,
  };
}

function intake() {
  return {
    schema: OPTIMIZATION_SCHEMAS.intake,
    reportId: 'report-quality-regression',
    suiteId: 'skill.creation-persona',
    caseId: 'draft-rain-station-concept',
    outcome: 'case-fail',
    target: { kind: 'skill', identity: identity() },
    modelIdentity: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
    effectiveConfigurationDigest: HASH_A,
    evidenceProjection: [
      {
        ref: 'turn-facts',
        kind: 'runtime-fact',
        source: 'session.facts',
        summary: 'Sanitized report summary.',
        complete: true,
      },
    ],
    observedFailures: [
      {
        id: 'quality-failure',
        kind: 'quality',
        summary: 'Weak rationale.',
        evidenceRefs: ['turn-facts'],
      },
    ],
    hypotheses: [
      {
        observedFailureId: 'quality-failure',
        suspectedOwner: 'skill-content',
        confidence: 0.9,
        evidenceRefs: ['turn-facts'],
        missingEvidence: [],
        handoffRecommendation: 'Evaluate candidate.',
      },
    ],
    rubricDimensions: [],
    hardGateFailures: [],
    incompleteEvidenceRefs: [],
    residualRisk: [],
  };
}

describe('optimizer-hidden holdout policy', () => {
  it('does not expose holdout case ids or inputs in optimizer context', () => {
    const context = createOptimizerContext(plan(), [intake()]);
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('draft-coastal-radio-concept');
    expect(context.requiredMatrix.holdoutPolicy).toMatchObject({
      inputsAvailable: false,
      resultsAvailable: false,
      minimumCases: 1,
    });
  });

  it('loads the trusted selection only after candidate finalization and valid approval', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-holdout-selection-'));
    temporaryDirectories.push(root);
    const file = join(root, 'selection.json');
    await fs.writeFile(file, `${JSON.stringify(selection(), null, 2)}\n`);
    await expect(
      loadTrustedHoldoutSelection(file, {
        plan: plan(),
        candidate: candidate(),
        approval: approval({ candidateFingerprint: `sha256:${'c'.repeat(64)}` }),
      }),
    ).rejects.toMatchObject({ code: 'holdout-approval-invalid' });
    await expect(
      loadTrustedHoldoutSelection(file, {
        plan: plan(),
        candidate: candidate(),
        approval: approval(),
      }),
    ).resolves.toEqual(selection());
  });

  it('rejects stale or mismatched holdout selections', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-holdout-stale-'));
    temporaryDirectories.push(root);
    const file = join(root, 'selection.json');
    await fs.writeFile(
      file,
      `${JSON.stringify({ ...selection(), selectionDigest: HASH_A }, null, 2)}\n`,
    );
    await expect(
      loadTrustedHoldoutSelection(file, {
        plan: plan(),
        candidate: candidate(),
        approval: approval(),
      }),
    ).rejects.toMatchObject({ code: 'holdout-selection-stale' });
  });
});
