import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPTIMIZATION_SCHEMAS } from '../schemas/optimization-contracts.mjs';
import { fingerprintHoldoutSelection } from './holdout-policy.mjs';
import {
  createOptimizationAblationPlan,
  executeApprovedOptimizationMatrix,
} from './isolated-evaluator.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const HASH_D = `sha256:${'d'.repeat(64)}`;
const NOW = '2026-07-14T00:00:00.000Z';
const TARGET_FILE = 'packages/neko-skills/src/builtins/creation-persona.ts';
const temporaryDirectories = [];

afterEach(async () => {
  vi.restoreAllMocks();
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

function holdout() {
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
      id: holdout().policyId,
      selectionDigest: holdout().selectionDigest,
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

function buildTarget(sourceRevision, sourceFingerprint, recipeFingerprint) {
  return {
    sourceRevision,
    sourceFingerprint,
    buildRecipeFingerprint: recipeFingerprint,
    buildCommands: [
      { command: 'pnpm', args: ['--filter', '@neko/app-tui', 'build'], timeoutMs: 600_000 },
    ],
    executablePath: 'apps/neko-tui/dist/main.js',
    launchCommand: { command: 'node', args: ['{executable}'] },
  };
}

function targets(overrides = {}) {
  return {
    baseline: {
      skillIdentity: identity(HASH_A),
      developmentCheckpoint: { kind: 'git-revision', ref: 'base-revision', fingerprint: HASH_A },
      buildTarget: buildTarget('base-revision', HASH_C, HASH_D),
    },
    candidate: {
      skillIdentity: identity(HASH_B),
      developmentCheckpoint: {
        kind: 'git-revision',
        ref: 'candidate-revision',
        fingerprint: HASH_B,
      },
      buildTarget: buildTarget('candidate-revision', HASH_D, HASH_C),
    },
    ...overrides,
  };
}

function scenario(id, caseGroup, visibility, rubric = true) {
  return {
    schema: 'neko.agent-eval.scenario.v2',
    id,
    suiteId: 'skill.creation-persona',
    caseGroup,
    visibility,
    evidenceContract: {},
    fixtureRefs: ['empty-workspace'],
    runtimeProfileId: 'markdown',
    modelProfileIds: ['configured-default'],
    steps: [],
    assertions: [
      {
        id: 'skill',
        kind: 'skill',
        identity: identity(),
        status: 'injected',
        evidenceRef: 'persona-facts',
      },
    ],
    artifactChecks: [],
    ...(rubric
      ? {
          rubric: {
            kind: 'domain-rubric',
            ref: 'rubrics/draft-quality.json',
            judgeProfileId: 'content-quality-judge',
          },
        }
      : {}),
    budget: { timeoutMs: 180_000, repetitions: 1 },
  };
}

function discovered(overrides = {}) {
  const cases = [
    { scenario: scenario('draft-rain-station-concept', 'canonical', 'public') },
    { scenario: scenario('draft-coastal-radio-concept', 'holdout', 'holdout') },
    { scenario: scenario('reject-apply-execution', 'regression', 'public', false) },
  ];
  return [
    {
      suite: {
        id: 'skill.creation-persona',
        target: { kind: 'skill', identity: identity() },
        judgeProfiles: [
          {
            id: 'content-quality-judge',
            adapter: 'openai-chat-completions-v1',
            providerId: 'openai',
            modelId: 'gpt-5-mini',
            endpointEnv: 'JUDGE_ENDPOINT',
            apiKeyEnv: 'JUDGE_KEY',
            temperature: 0,
            maxTokens: 1_800,
            timeoutMs: 120_000,
          },
        ],
      },
      cases: overrides.cases ?? cases,
      rubrics: {
        'rubrics/draft-quality.json': {
          schema: 'neko.agent-eval.rubric.v2',
          id: 'draft-quality',
          domain: 'creation-persona',
          version: 'v1',
          minimumScore: 3.5,
          maximumUncertainty: 0.35,
          criteria: [],
        },
      },
      outputSchemas: {},
    },
  ];
}

function sample(variantId, caseId, index) {
  return {
    reportId: `report-${caseId}-${variantId}-${index}`,
    result: {
      runId: `run-${caseId}-${variantId}-${index}`,
      suiteId: 'skill.creation-persona',
      caseId,
      assertions: [{ id: 'skill', status: 'pass', evidenceRefs: ['persona-facts'] }],
    },
    blind: {
      source: 'current-isolated-run',
      reportId: `report-${caseId}-${variantId}-${index}`,
      runId: `run-${caseId}-${variantId}-${index}`,
      suiteId: 'skill.creation-persona',
      caseId,
      policyDigest: HASH_A,
      assistantOutput: `${variantId} output ${index}`,
      hardGates: [{ id: 'skill', status: 'pass', evidenceRefs: ['persona-facts'] }],
      artifactSummaries: [],
      qualityEvidence: [],
    },
  };
}

function fakeAblationRun(planInput, outcome = 'pass') {
  return {
    outcome,
    runs: planInput.variants.map((variant) => ({
      variant,
      run: {
        samples: [sample(variant.id, planInput.caseId, 1), sample(variant.id, planInput.caseId, 2)],
      },
    })),
  };
}

describe('approved optimization isolated evaluator', () => {
  it('runs development, hidden holdout and regression through the shared implementation path', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-optimization-eval-'));
    temporaryDirectories.push(outputRoot);
    const seenPlans = [];
    const runAblation = vi.fn(async (value) => {
      seenPlans.push(value);
      return fakeAblationRun(value);
    });
    const runBlindJudge = vi.fn(async () => ({
      outcome: 'candidate-preferred',
      uncertainty: 0.1,
      providerId: 'openai',
      modelId: 'gpt-5-mini',
    }));
    const result = await executeApprovedOptimizationMatrix(
      {
        plan: plan(),
        candidate: candidate(),
        approval: approval(),
        targets: targets(),
        holdoutSelectionFile: 'unused.json',
      },
      {
        runId: 'optimization-run-1',
        outputRoot,
        discovered: discovered(),
        loadHoldoutSelection: async () => holdout(),
        runAblation,
        projectBlindSample: async (value, { policyDigest }) => ({
          ...value.blind,
          policyDigest,
        }),
        runBlindJudge,
        writeBlindMapping: async (_comparison, input) => {
          const file = join(
            outputRoot,
            'optimization',
            input.planId,
            input.runId,
            'blind-mapping.json',
          );
          await fs.mkdir(dirname(file), { recursive: true });
          await fs.writeFile(file, '{}\n');
          return { file };
        },
      },
    );

    expect(result.outcome).toBe('pass');
    expect(runAblation).toHaveBeenCalledTimes(3);
    expect(runBlindJudge).toHaveBeenCalledTimes(4);
    expect(seenPlans.map((value) => value.caseId)).toEqual([
      'draft-rain-station-concept',
      'draft-coastal-radio-concept',
      'reject-apply-execution',
    ]);
    expect(seenPlans.every((value) => value.mode === 'implementation')).toBe(true);
    expect(seenPlans[0].variants[0].buildTarget).toEqual(targets().baseline.buildTarget);
    expect(seenPlans[0].variants.map((variant) => variant.skillIdentity.fingerprint)).toEqual([
      HASH_A,
      HASH_B,
    ]);
    expect(result.blindComparisons).toHaveLength(4);
    expect(result.reportIds).toHaveLength(12);
  });

  it('constructs one strict external implementation-ablation plan per selected case', () => {
    const selection = {
      ...discovered()[0],
      scenario: scenario('draft-rain-station-concept', 'canonical', 'public'),
    };
    const result = createOptimizationAblationPlan(plan(), targets(), selection);
    expect(result).toMatchObject({
      mode: 'implementation',
      baselineVariantId: 'optimization-base',
      repetitions: 2,
    });
    expect(result.variants.map((variant) => variant.developmentCheckpoint.ref)).toEqual([
      'base-revision',
      'candidate-revision',
    ]);
  });

  it('returns non-comparable for target policy drift and rejects unstable revisions', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-optimization-non-comparable-'));
    temporaryDirectories.push(outputRoot);
    const result = await executeApprovedOptimizationMatrix(
      {
        plan: plan(),
        candidate: candidate(),
        approval: approval(),
        targets: targets(),
        holdoutSelectionFile: 'unused.json',
      },
      {
        outputRoot,
        discovered: discovered(),
        loadHoldoutSelection: async () => holdout(),
        runAblation: async (value) =>
          fakeAblationRun(
            value,
            value.caseId === 'draft-rain-station-concept' ? 'non-comparable' : 'pass',
          ),
        projectBlindSample: async (value, { policyDigest }) => ({ ...value.blind, policyDigest }),
        runBlindJudge: async () => ({
          outcome: 'tie',
          uncertainty: 0.1,
          providerId: 'openai',
          modelId: 'gpt-5-mini',
        }),
        writeBlindMapping: async () => ({ file: join(outputRoot, 'mapping.json') }),
      },
    );
    expect(result.outcome).toBe('non-comparable');

    await expect(
      executeApprovedOptimizationMatrix(
        {
          plan: plan(),
          candidate: candidate(),
          approval: approval(),
          targets: targets({
            baseline: {
              ...targets().baseline,
              buildTarget: { ...targets().baseline.buildTarget, sourceRevision: 'working-tree' },
            },
          }),
          holdoutSelectionFile: 'unused.json',
        },
        { loadHoldoutSelection: async () => holdout() },
      ),
    ).rejects.toMatchObject({ code: 'optimization-revision-unstable' });
  });

  it('fails before execution when holdout or runtime policy does not match the approved matrix', async () => {
    const invalidCases = discovered()[0].cases.map((item) =>
      item.scenario.id === 'draft-coastal-radio-concept'
        ? { scenario: { ...item.scenario, visibility: 'public' } }
        : item,
    );
    await expect(
      executeApprovedOptimizationMatrix(
        {
          plan: plan(),
          candidate: candidate(),
          approval: approval(),
          targets: targets(),
          holdoutSelectionFile: 'unused.json',
        },
        {
          discovered: discovered({ cases: invalidCases }),
          loadHoldoutSelection: async () => holdout(),
          runAblation: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({ code: 'optimization-holdout-invalid' });
  });
});
