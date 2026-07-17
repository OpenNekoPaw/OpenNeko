import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import {
  ABLATION_METRICS,
  ABLATION_SCHEMAS,
  validateAblationPlan,
} from '../schemas/ablation-contracts.mjs';
import {
  checkApprovalValidity,
  hostIdentityKey,
  validateOptimizationCandidate,
  validateOptimizationPlan,
} from '../schemas/optimization-contracts.mjs';
import { runImplementationAblation } from '../ablation/implementation-runner.mjs';
import { discoverSuites, selectSuiteCases } from '../suites/discovery.mjs';
import {
  createBlindABComparison,
  runBlindABJudge,
  writeBlindMapping,
} from './blind-comparison.mjs';
import { loadTrustedHoldoutSelection, validateTrustedHoldoutSelection } from './holdout-policy.mjs';

export async function executeApprovedOptimizationMatrix(input, options = {}) {
  const plan = validateOptimizationPlan(input.plan);
  const candidate = validateOptimizationCandidate(input.candidate, plan);
  const validity = checkApprovalValidity(input.approval, plan, candidate);
  if (!validity.valid) {
    throw evaluationError(
      'optimization-approval-invalid',
      `Isolated Evaluation requires valid approval: ${validity.reasons.join('; ')}`,
    );
  }
  validateExecutionTargets(plan, candidate, input.targets);
  const holdout = validateTrustedHoldoutSelection(
    await (options.loadHoldoutSelection ?? loadTrustedHoldoutSelection)(
      input.holdoutSelectionFile,
      { plan, candidate, approval: input.approval },
      options,
    ),
  );
  if (
    holdout.policyId !== plan.requiredMatrix.holdoutPolicy.id ||
    holdout.selectionDigest !== plan.requiredMatrix.holdoutPolicy.selectionDigest ||
    holdout.suiteId !== plan.requiredMatrix.suiteId ||
    holdout.caseIds.length < plan.requiredMatrix.holdoutPolicy.minimumCases
  ) {
    throw evaluationError(
      'optimization-holdout-policy-mismatch',
      'Holdout selection differs from the approved required matrix',
    );
  }
  const discovered = options.discovered ?? (await discoverSuites());
  const selections = resolveMatrixSelections(plan, holdout, discovered);
  const runId = options.runId ?? `optimization-${Date.now().toString(36)}`;
  const runs = [];
  const blindComparisons = [];
  for (const selection of selections) {
    const ablationPlan = createOptimizationAblationPlan(plan, input.targets, selection);
    const matrixRun = await (options.runAblation ?? runImplementationAblation)(ablationPlan, {
      runId: `${runId}-${selection.scenario.id}`,
      discovered,
      repositoryRoot: options.repositoryRoot,
      workspaceParent: options.workspaceParent,
      outputRoot: options.outputRoot,
      env: options.env,
      caseOptions: options.caseOptions,
    });
    runs.push({
      group: selection.optimizationGroup,
      selection,
      ablationPlan,
      run: matrixRun,
    });
    if (selection.optimizationGroup === 'protected-regression') continue;
    if (!matrixRun.runs || matrixRun.runs.length !== 2) {
      throw evaluationError(
        'optimization-run-incomplete',
        `Case ${selection.scenario.id} did not retain both isolated targets`,
      );
    }
    const baselineRun = matrixRun.runs.find((entry) => entry.variant.role === 'baseline')?.run;
    const candidateRun = matrixRun.runs.find((entry) => entry.variant.role === 'variant')?.run;
    if (!baselineRun?.samples || !candidateRun?.samples) {
      throw evaluationError(
        'optimization-run-incomplete',
        `Case ${selection.scenario.id} did not retain repeated samples`,
      );
    }
    if (baselineRun.samples.length !== candidateRun.samples.length) {
      throw evaluationError(
        'optimization-run-non-comparable',
        `Case ${selection.scenario.id} sample counts differ`,
      );
    }
    const policyDigest = fingerprintSelectionPolicy(selection, plan.requiredMatrix.repetitions);
    const judgeProfile = readJudgeProfile(selection);
    const rubric = selection.rubrics[selection.scenario.rubric.ref];
    for (let index = 0; index < baselineRun.samples.length; index += 1) {
      const baseSample = await (options.projectBlindSample ?? projectCurrentBlindSample)(
        baselineRun.samples[index],
        { policyDigest },
      );
      const candidateSample = await (options.projectBlindSample ?? projectCurrentBlindSample)(
        candidateRun.samples[index],
        { policyDigest },
      );
      let comparison;
      try {
        comparison = createBlindABComparison(
          { baseline: baseSample, candidate: candidateSample, rubric },
          { random: options.random },
        );
      } catch (error) {
        if (readErrorCode(error)?.startsWith('blind-sample-hard-gate')) continue;
        throw error;
      }
      const judged = await (options.runBlindJudge ?? runBlindABJudge)(comparison, judgeProfile, {
        env: options.env,
        fetch: options.fetch,
      });
      const mapping = await (options.writeBlindMapping ?? writeBlindMapping)(
        comparison,
        { planId: plan.id, runId: `${runId}-${selection.scenario.id}-${index + 1}` },
        { outputRoot: options.outputRoot },
      );
      blindComparisons.push({
        suiteId: selection.suite.id,
        caseId: selection.scenario.id,
        group: selection.optimizationGroup,
        sampleIndex: index,
        outcome: judged.outcome,
        uncertainty: judged.uncertainty,
        providerId: judged.providerId,
        modelId: judged.modelId,
        reportIds: comparison.reportIds,
        orderDigest: comparison.orderDigest,
        mappingRef: relativeReportRef(mapping.file, options.outputRoot),
      });
    }
  }
  return {
    runId,
    outcome: aggregateOptimizationOutcome(runs, blindComparisons),
    runs,
    blindComparisons,
    reportIds: [
      ...new Set(
        runs.flatMap(
          (entry) =>
            entry.run.runs?.flatMap(
              (variant) => variant.run?.samples?.map((sample) => sample.reportId) ?? [],
            ) ?? [],
        ),
      ),
    ],
  };
}

export function createOptimizationAblationPlan(planInput, targets, selection) {
  const plan = validateOptimizationPlan(planInput);
  const quality = selection.scenario.rubric
    ? { kind: 'scenario-rubric', rubricRef: selection.scenario.rubric.ref }
    : {
        kind: 'hard-gates-only',
        reason:
          'Protected regression has deterministic path/behavior gates and no subjective rubric.',
      };
  return validateAblationPlan({
    schema: ABLATION_SCHEMAS.plan,
    id: `${plan.id}-${selection.scenario.id}`,
    mode: 'implementation',
    suiteId: selection.suite.id,
    caseId: selection.scenario.id,
    baselineVariantId: 'optimization-base',
    matrix: { strategy: 'focused', maxVariants: 2 },
    repetitions: plan.requiredMatrix.repetitions,
    comparisonPolicy: {
      retainEverySample: true,
      correctnessDominates: true,
      metrics: [...ABLATION_METRICS],
      quality,
    },
    variants: [
      createVariant('optimization-base', 'baseline', [], targets.baseline),
      createVariant('optimization-candidate', 'variant', ['skill-content'], targets.candidate),
    ],
  });
}

async function projectCurrentBlindSample(sample, options) {
  if (!sample?.files?.evidence || !sample?.files?.artifactManifest || !sample?.result) {
    throw evaluationError(
      'optimization-sample-evidence-missing',
      'Current isolated sample is missing standard report files',
    );
  }
  const [evidence, artifactManifest] = await Promise.all([
    readJson(sample.files.evidence),
    readJson(sample.files.artifactManifest),
  ]);
  const facts = evidence.items.find((item) => item.ref === 'turn-facts')?.data;
  const assistantOutput = (Array.isArray(facts?.turns) ? facts.turns : [])
    .filter((turn) => turn?.role === 'assistant' && turn?.isError !== true)
    .at(-1)?.content;
  if (typeof assistantOutput !== 'string' || assistantOutput.trim().length === 0) {
    throw evaluationError(
      'optimization-sample-output-missing',
      `Report ${sample.reportId} has no final assistant output`,
    );
  }
  return {
    source: 'current-isolated-run',
    reportId: sample.reportId,
    runId: sample.result.runId,
    suiteId: sample.result.suiteId,
    caseId: sample.result.caseId,
    policyDigest: options.policyDigest,
    assistantOutput,
    hardGates: sample.result.assertions,
    artifactSummaries: artifactManifest.artifacts.map((artifact) => ({
      ref: artifact.ref,
      kind: artifact.kind,
      digest: artifact.digest,
      deliveryStatus: artifact.deliveryStatus,
      validatorId: artifact.validatorId,
      validatorStatus: artifact.validatorStatus,
    })),
    qualityEvidence: evidence.items
      .filter((item) => item.kind === 'validator')
      .map((item) => ({ ref: item.ref, summary: item.summary, complete: item.complete })),
  };
}

function resolveMatrixSelections(plan, holdout, discovered) {
  const groups = [
    ...plan.requiredMatrix.developmentCaseIds.map((caseId) => ({
      caseId,
      optimizationGroup: 'development',
    })),
    ...holdout.caseIds.map((caseId) => ({ caseId, optimizationGroup: 'holdout' })),
    ...plan.requiredMatrix.protectedRegressionCaseIds.map((caseId) => ({
      caseId,
      optimizationGroup: 'protected-regression',
    })),
  ];
  return groups.map(({ caseId, optimizationGroup }) => {
    const selection = selectSuiteCases(discovered, {
      suiteId: plan.requiredMatrix.suiteId,
      caseId,
    })[0];
    validateSelectionPolicy(selection, plan, optimizationGroup);
    return { ...selection, optimizationGroup };
  });
}

function validateSelectionPolicy(selection, plan, group) {
  const matrix = plan.requiredMatrix;
  if (selection.scenario.runtimeProfileId !== matrix.runtimeProfileId) {
    throw evaluationError(
      'optimization-policy-mismatch',
      `Case ${selection.scenario.id} runtime profile differs`,
    );
  }
  if (
    selection.scenario.modelProfileIds.length !== 1 ||
    selection.scenario.modelProfileIds[0] !== matrix.modelProfileId
  ) {
    throw evaluationError(
      'optimization-policy-mismatch',
      `Case ${selection.scenario.id} model profile differs`,
    );
  }
  if (group === 'holdout') {
    if (selection.scenario.caseGroup !== 'holdout' || selection.scenario.visibility !== 'holdout') {
      throw evaluationError(
        'optimization-holdout-invalid',
        `Case ${selection.scenario.id} is not an optimizer-hidden holdout`,
      );
    }
  } else if (group === 'protected-regression') {
    if (selection.scenario.caseGroup !== 'regression') {
      throw evaluationError(
        'optimization-regression-invalid',
        `Case ${selection.scenario.id} is not a regression case`,
      );
    }
  } else if (
    selection.scenario.visibility !== 'public' ||
    selection.scenario.caseGroup === 'holdout'
  ) {
    throw evaluationError(
      'optimization-development-invalid',
      `Case ${selection.scenario.id} is not optimizer-visible development coverage`,
    );
  }
  if (group !== 'protected-regression') {
    if (
      selection.scenario.rubric?.ref !== matrix.rubricRef ||
      selection.scenario.rubric?.judgeProfileId !== matrix.judgeProfileId
    ) {
      throw evaluationError(
        'optimization-policy-mismatch',
        `Case ${selection.scenario.id} Judge/rubric policy differs`,
      );
    }
  }
}

function validateExecutionTargets(plan, candidate, targets) {
  if (!targets?.baseline || !targets?.candidate) {
    throw evaluationError(
      'optimization-target-missing',
      'Baseline and candidate isolated targets are required',
    );
  }
  const baseIdentity = targets.baseline.skillIdentity;
  const candidateIdentity = targets.candidate.skillIdentity;
  if (
    hostIdentityKey(baseIdentity) !== hostIdentityKey(plan.target.identity) ||
    baseIdentity.fingerprint !== plan.baseFingerprint
  ) {
    throw evaluationError(
      'optimization-target-stale',
      'Baseline target does not match the approved Host identity/fingerprint',
    );
  }
  if (
    hostIdentityKey(candidateIdentity) !== hostIdentityKey(plan.target.identity) ||
    candidateIdentity.fingerprint !== candidate.candidateFingerprint
  ) {
    throw evaluationError(
      'optimization-target-stale',
      'Candidate target does not match the approved Host identity/fingerprint',
    );
  }
  for (const [label, target] of Object.entries(targets)) {
    if (target.developmentCheckpoint.fingerprint !== target.skillIdentity.fingerprint) {
      throw evaluationError(
        'optimization-checkpoint-stale',
        `${label} development checkpoint fingerprint differs from Host identity`,
      );
    }
    if (target.buildTarget.sourceRevision === 'working-tree') {
      throw evaluationError(
        'optimization-revision-unstable',
        `${label} target requires a concrete development revision`,
      );
    }
  }
}

function createVariant(id, role, changes, target) {
  return {
    id,
    role,
    kind: 'implementation',
    description:
      role === 'baseline'
        ? 'Approved optimization baseline isolated target.'
        : 'Approved optimization candidate isolated target.',
    changes,
    skillIdentity: target.skillIdentity,
    developmentCheckpoint: target.developmentCheckpoint,
    buildTarget: target.buildTarget,
    expectedPath: [
      'detached Git worktree',
      'isolated TUI build',
      'TUI App session owner',
      'Skill lifecycle',
      'session.facts',
    ],
    forbiddenFallback: [
      'working-tree executable',
      'direct AgentSession runner',
      'optimizer runtime flag',
      'candidate label in TUI facts',
    ],
  };
}

function fingerprintSelectionPolicy(selection, repetitions) {
  return hash({
    suiteId: selection.suite.id,
    caseId: selection.scenario.id,
    fixtureRefs: selection.scenario.fixtureRefs,
    runtimeProfileId: selection.scenario.runtimeProfileId,
    modelProfileIds: selection.scenario.modelProfileIds,
    repetitions,
    assertions: selection.scenario.assertions,
    artifactChecks: selection.scenario.artifactChecks,
    rubric: selection.scenario.rubric,
  });
}

function readJudgeProfile(selection) {
  const id = selection.scenario.rubric?.judgeProfileId;
  const profile = selection.suite.judgeProfiles.find((item) => item.id === id);
  if (!profile) {
    throw evaluationError(
      'optimization-judge-missing',
      `Case ${selection.scenario.id} has no declared Judge profile`,
    );
  }
  return profile;
}

function aggregateOptimizationOutcome(runs, blindComparisons) {
  const outcomes = runs.map((entry) => entry.run.outcome);
  if (outcomes.includes('configuration-invalid') || outcomes.includes('non-comparable')) {
    return 'non-comparable';
  }
  if (outcomes.includes('infrastructure-fail')) return 'infrastructure-fail';
  if (outcomes.includes('case-fail')) return 'case-fail';
  if (blindComparisons.length === 0) return 'case-fail';
  return 'pass';
}

function relativeReportRef(file, outputRoot) {
  const root = resolve(outputRoot ?? 'reports/agent-eval');
  const path = relative(root, resolve(file)).replaceAll('\\', '/');
  return `reports/agent-eval/${path}`;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function hash(value) {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function readErrorCode(error) {
  return typeof error === 'object' && error && typeof error.code === 'string' ? error.code : '';
}

function evaluationError(code, message) {
  return Object.assign(new Error(message), { code });
}
