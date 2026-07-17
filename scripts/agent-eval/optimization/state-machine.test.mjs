import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMAS } from '../schemas/contracts.mjs';
import { OPTIMIZATION_SCHEMAS } from '../schemas/optimization-contracts.mjs';
import {
  createOpenSpecApplicationHandoff,
  hashOptimizationArtifact,
  writeOptimizationCandidateArtifacts,
} from './candidate-artifacts.mjs';
import {
  appendOptimizationHistory,
  createCandidateAcceptanceDecision,
} from './candidate-decision.mjs';
import { loadDevelopmentHistory } from './history-store.mjs';
import { fingerprintHoldoutSelection } from './holdout-policy.mjs';
import { executeApprovedOptimizationMatrix } from './isolated-evaluator.mjs';
import { createOptimizationIntake, routeOptimizationOwnership } from './report-intake.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const HASH_D = `sha256:${'d'.repeat(64)}`;
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
    maxCandidates: 1,
    maxIterations: 1,
    timeoutMs: 600_000,
    targetTokenLimit: 100_000,
    controllerTokenLimit: 20_000,
    judgeTokenLimit: 30_000,
    costUsdLimit: 20,
    noImprovementLimit: 1,
  };
}

function holdoutSelection() {
  const selection = {
    schema: OPTIMIZATION_SCHEMAS.holdoutSelection,
    policyId: 'creation-persona-holdout-v1',
    suiteId: 'skill.creation-persona',
    caseIds: ['draft-coastal-radio-concept'],
    selectionDigest: HASH_A,
    visibility: 'optimizer-hidden',
    createdAt: NOW,
  };
  selection.selectionDigest = fingerprintHoldoutSelection(selection);
  return selection;
}

function requiredMatrix() {
  return {
    suiteId: 'skill.creation-persona',
    developmentCaseIds: ['draft-rain-station-concept'],
    holdoutPolicy: {
      id: holdoutSelection().policyId,
      selectionDigest: holdoutSelection().selectionDigest,
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

function syntheticReport() {
  const result = {
    schema: SCHEMAS.result,
    reportId: 'report-quality-regression',
    suiteId: 'skill.creation-persona',
    caseId: 'draft-rain-station-concept',
    runId: 'run-quality-regression',
    outcome: 'case-fail',
    target: { kind: 'skill', identity: identity() },
    repositoryRevision: 'base-revision',
    modelIdentity: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
    effectiveConfiguration: {
      runtimeProfileId: 'markdown',
      modelProfileId: 'configured-default',
      digest: HASH_A,
    },
    fixtureDigest: HASH_A,
    command: 'node scripts/agent-eval/protocol-smoke.mjs',
    assertions: [{ id: 'output', status: 'fail', evidenceRefs: ['turn-facts'] }],
    artifactRefs: [],
    usage: { latencyMs: 1_000, retries: 0, inputTokens: 100, outputTokens: 200 },
    reportLocations: {
      result: 'skill.creation-persona/case/run/result.json',
      evidence: 'skill.creation-persona/case/run/evidence.json',
      artifactManifest: 'skill.creation-persona/case/run/artifact-manifest.json',
      qualityReport: 'skill.creation-persona/case/run/quality-report.md',
      judge: 'skill.creation-persona/case/run/judge.json',
    },
    skippedStages: ['baseline'],
    residualRisk: ['Holdout is required before acceptance.'],
  };
  const evidence = {
    schema: SCHEMAS.evidence,
    reportId: result.reportId,
    items: [
      {
        ref: 'turn-facts',
        kind: 'runtime-fact',
        source: 'session.facts',
        summary: 'Complete sanitized final-output evidence.',
        complete: true,
        data: { hiddenPrompt: 'MUST_NOT_ENTER_OPTIMIZER' },
      },
      {
        ref: 'judge.result',
        kind: 'judge',
        source: 'content-quality-judge',
        summary: 'Creative rationale quality regressed.',
        complete: true,
      },
    ],
    redactions: [{ kind: 'hidden-prompt', count: 1 }],
  };
  const failureAttribution = {
    schema: SCHEMAS.failureAttribution,
    reportId: result.reportId,
    observedFailures: [
      {
        id: 'quality-failure',
        kind: 'quality',
        summary: 'Creative rationale does not connect observations to decisions.',
        evidenceRefs: ['turn-facts', 'judge.result'],
      },
    ],
    hypotheses: [
      {
        observedFailureId: 'quality-failure',
        suspectedOwner: 'skill-content',
        confidence: 0.9,
        evidenceRefs: ['turn-facts', 'judge.result'],
        missingEvidence: ['Protected holdout is still required.'],
        handoffRecommendation: 'Evaluate a narrow Skill-content candidate.',
      },
    ],
  };
  const judge = {
    schema: SCHEMAS.judge,
    reportId: result.reportId,
    suiteId: result.suiteId,
    caseId: result.caseId,
    runId: result.runId,
    providerId: 'openai',
    modelId: 'gpt-5-mini',
    profileId: 'content-quality-judge',
    rubricId: 'draft-quality',
    rubricVersion: 'v1',
    promptHash: HASH_A,
    sampling: { temperature: 0, maxTokens: 1_800 },
    criteria: [
      {
        criterionId: 'creative-rationale',
        score: 2.5,
        evidenceRefs: ['turn-facts'],
        reason: 'Choices are listed without causal audience effect.',
        uncertainty: 0.1,
      },
    ],
    overallScore: 2.5,
    uncertainty: 0.1,
    summary: 'Creative rationale requires improvement.',
    disposition: 'eligible',
    usage: { inputTokens: 200, outputTokens: 100 },
  };
  return { result, evidence, failureAttribution, judge };
}

function scenario(id, caseGroup, visibility, rubric = true) {
  return {
    id,
    caseGroup,
    visibility,
    fixtureRefs: ['empty-workspace'],
    runtimeProfileId: 'markdown',
    modelProfileIds: ['configured-default'],
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
  };
}

function discovered() {
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
      cases: [
        { scenario: scenario('draft-rain-station-concept', 'canonical', 'public') },
        { scenario: scenario('draft-coastal-radio-concept', 'holdout', 'holdout') },
        { scenario: scenario('reject-apply-execution', 'regression', 'public', false) },
      ],
      rubrics: {
        'rubrics/draft-quality.json': { id: 'draft-quality', criteria: ['creative-rationale'] },
      },
      outputSchemas: {},
    },
  ];
}

function buildTarget(revision, sourceFingerprint, recipeFingerprint) {
  return {
    sourceRevision: revision,
    sourceFingerprint,
    buildRecipeFingerprint: recipeFingerprint,
    buildCommands: [
      { command: 'pnpm', args: ['--filter', '@neko/app-tui', 'build'], timeoutMs: 600_000 },
    ],
    executablePath: 'apps/neko-tui/dist/main.js',
    launchCommand: { command: 'node', args: ['{executable}'] },
  };
}

function sample(caseId, variant, index) {
  return {
    reportId: `report-${caseId}-${variant.id}-${index}`,
    result: {
      assertions: [{ id: 'skill', status: 'pass', evidenceRefs: ['persona-facts'] }],
    },
    judge:
      caseId === 'reject-apply-execution'
        ? undefined
        : {
            overallScore: variant.role === 'baseline' ? 3.8 : 4.3,
            uncertainty: 0.15,
          },
    blind: {
      source: 'current-isolated-run',
      reportId: `report-${caseId}-${variant.id}-${index}`,
      runId: `run-${caseId}-${variant.id}-${index}`,
      suiteId: 'skill.creation-persona',
      caseId,
      policyDigest: HASH_A,
      assistantOutput: `${variant.role} public output ${index}`,
      hardGates: [{ id: 'skill', status: 'pass', evidenceRefs: ['persona-facts'] }],
      artifactSummaries: [],
      qualityEvidence: [],
    },
  };
}

describe('optimization key-free end-to-end state machine', () => {
  it('moves from synthetic report to accepted history without canonical or Market mutation', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-optimization-state-'));
    temporaryDirectories.push(root);
    const targetFile = join(root, TARGET_FILE);
    const outputRoot = join(root, 'artifacts');
    const historyFile = join(root, 'quality', 'history.json');
    await fs.mkdir(dirname(targetFile), { recursive: true });
    await fs.writeFile(targetFile, 'canonical-skill-content\n');

    const intake = createOptimizationIntake(syntheticReport());
    const routed = routeOptimizationOwnership(intake, {
      kind: 'skill-content',
      identity: identity(),
      targetFile: TARGET_FILE,
    });
    expect(routed.disposition).toBe('candidate-eligible');
    const plan = {
      schema: OPTIMIZATION_SCHEMAS.plan,
      id: 'creation-persona-rationale-optimization',
      status: 'proposed',
      target: routed.target,
      baseFingerprint: HASH_A,
      reportIds: routed.reportIds,
      failedCases: [
        {
          suiteId: intake.suiteId,
          caseId: intake.caseId,
          reportId: intake.reportId,
          outcome: 'case-fail',
        },
      ],
      rubricDimensions: routed.rubricDimensions.map(({ id, score, evidenceRefs }) => ({
        id,
        score,
        evidenceRefs,
      })),
      ownership: routed.ownership,
      expectedImprovement: 'Connect observations, decisions and intended audience effect.',
      risks: ['The candidate may overfit the visible brief.'],
      budget: budget(),
      requiredMatrix: requiredMatrix(),
      acceptanceThreshold: { minimumQualityDelta: 0.1, maximumJudgeUncertainty: 0.35 },
      createdBy: 'developer@example.invalid',
      createdAt: NOW,
    };
    const patchText = [
      `diff --git a/${TARGET_FILE} b/${TARGET_FILE}`,
      `--- a/${TARGET_FILE}`,
      `+++ b/${TARGET_FILE}`,
      '@@ -1 +1 @@',
      '-generic rationale',
      '+connect observation, decision, and audience effect',
      '',
    ].join('\n');
    const candidate = {
      schema: OPTIMIZATION_SCHEMAS.candidate,
      id: 'creation-persona-candidate-1',
      planId: plan.id,
      target: plan.target,
      baseFingerprint: HASH_A,
      candidateFingerprint: HASH_B,
      patchPath:
        'artifacts/optimization/creation-persona-rationale-optimization/creation-persona-candidate-1/candidate.patch',
      patchFingerprint: hashOptimizationArtifact(patchText),
      changeSummary: 'Clarify causal creative rationale.',
      evidenceRefs: routed.ownership.evidenceRefs,
      expectedImprovement: 'Improve creative-rationale content quality.',
      risks: plan.risks,
      holdoutAccess: 'not-provided',
      canonicalMutation: false,
      commitRequested: false,
      createdBy: 'optimizer@example.invalid',
      createdAt: NOW,
    };
    await writeOptimizationCandidateArtifacts(
      { plan, candidate, patchText },
      { repositoryRoot: root, outputRoot, artifactPathPrefix: 'artifacts' },
    );
    expect(await fs.readFile(targetFile, 'utf8')).toBe('canonical-skill-content\n');

    const approval = {
      schema: OPTIMIZATION_SCHEMAS.approval,
      id: 'approval-candidate-1',
      decision: 'approve',
      planId: plan.id,
      candidateId: candidate.id,
      target: plan.target,
      baseFingerprint: HASH_A,
      candidateFingerprint: HASH_B,
      approver: 'human@example.invalid',
      scope: { targetFiles: [TARGET_FILE], allowedSections: ['Rationale'] },
      budget: budget(),
      requiredMatrix: requiredMatrix(),
      decidedAt: NOW,
      reason: 'Approved for the protected matrix.',
    };
    expect(createOpenSpecApplicationHandoff({ plan, candidate, approval })).toMatchObject({
      kind: 'openspec-apply-required',
      canonicalMutationPerformed: false,
      commitPerformed: false,
    });

    const targets = {
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
    };
    const evaluation = await executeApprovedOptimizationMatrix(
      {
        plan,
        candidate,
        approval,
        targets,
        holdoutSelectionFile: 'trusted-after-freeze.json',
      },
      {
        runId: 'optimization-run-1',
        outputRoot,
        discovered: discovered(),
        loadHoldoutSelection: async () => holdoutSelection(),
        runAblation: async (ablationPlan) => ({
          outcome: 'pass',
          runs: ablationPlan.variants.map((variant) => ({
            variant,
            run: {
              outcome: 'pass',
              samples: [
                sample(ablationPlan.caseId, variant, 1),
                sample(ablationPlan.caseId, variant, 2),
              ],
            },
          })),
        }),
        projectBlindSample: async (value, { policyDigest }) => ({
          ...value.blind,
          policyDigest,
        }),
        runBlindJudge: async () => ({
          outcome: 'candidate-preferred',
          uncertainty: 0.1,
          providerId: 'openai',
          modelId: 'gpt-5-mini',
        }),
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
    const decision = createCandidateAcceptanceDecision({
      id: 'decision-candidate-1',
      plan,
      candidate,
      approval,
      evaluation,
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
      residualRisk: ['One synthetic state-machine run does not prove real model quality.'],
    });
    expect(decision.outcome).toBe('accepted');
    await appendOptimizationHistory(
      {
        plan,
        candidate,
        approval,
        decision,
        actor: 'human@example.invalid',
        recordedAt: NOW,
      },
      { file: historyFile },
    );
    const history = await loadDevelopmentHistory(historyFile);
    expect(history.entries.map((entry) => entry.state)).toEqual([
      'baseline',
      'candidate',
      'evaluated',
      'accepted',
    ]);
    expect(JSON.stringify(history)).not.toContain('packageId');
    expect(JSON.stringify(history)).not.toContain('semver');
    expect(JSON.stringify(history)).not.toContain('MUST_NOT_ENTER_OPTIMIZER');
    expect(await fs.readFile(targetFile, 'utf8')).toBe('canonical-skill-content\n');
  });
});
