import { createHash } from 'node:crypto';
import {
  OPTIMIZATION_SCHEMAS,
  checkApprovalValidity,
  validateOptimizationCandidate,
  validateOptimizationDecision,
  validateOptimizationPlan,
  hostIdentityKey,
} from '../schemas/optimization-contracts.mjs';
import { appendDevelopmentCheckpoints, loadDevelopmentHistory } from './history-store.mjs';

export function createCandidateAcceptanceDecision(input) {
  const plan = validateOptimizationPlan(input.plan);
  const candidate = validateOptimizationCandidate(input.candidate, plan);
  const approvalValidity = checkApprovalValidity(input.approval, plan, candidate);
  if (!approvalValidity.valid) {
    throw decisionError(
      'optimization-approval-invalid',
      `Candidate decision requires valid approval: ${approvalValidity.reasons.join('; ')}`,
    );
  }
  const evidence = summarizeEvaluation(input.evaluation);
  const budgetStatus = evaluateBudgetStatus(input.budgetUsage, plan.budget);
  const blindOutcome = aggregateBlindOutcome(input.evaluation.blindComparisons);
  const qualityAvailable =
    evidence.baselineJudgments.length > 0 &&
    evidence.candidateJudgments.length > 0 &&
    evidence.baselineJudgments.length === evidence.candidateJudgments.length;
  const quality = qualityAvailable
    ? summarizeQuality(evidence.baselineJudgments, evidence.candidateJudgments)
    : {
        status: 'unavailable',
        reason: 'Real output-content Judge samples are unavailable or unmatched.',
      };
  const checks = {
    hardGates: {
      status: evidence.hardGateStatus,
      reportIds: evidence.allReportIds,
    },
    holdout: {
      status: evidence.holdoutStatus,
      reportIds: evidence.holdoutReportIds,
    },
    protectedRegression: {
      status: evidence.regressionStatus,
      reportIds: evidence.regressionReportIds,
    },
  };
  const outcome = decideOutcome({
    evaluationOutcome: input.evaluation.outcome,
    checks,
    blindOutcome,
    quality,
    qualityAvailable,
    budgetStatus,
    plan,
  });
  const decision = {
    schema: OPTIMIZATION_SCHEMAS.decision,
    id: input.id,
    planId: plan.id,
    candidateId: candidate.id,
    approvalId: input.approval.id,
    outcome,
    target: candidate.target,
    baseFingerprint: candidate.baseFingerprint,
    candidateFingerprint: candidate.candidateFingerprint,
    reportIds: evidence.allReportIds,
    checks,
    blindComparison:
      blindOutcome === 'non-comparable'
        ? {
            id: `blind-${input.evaluation.runId}`,
            outcome: 'non-comparable',
            orderDigest: hash([]),
            mappingRefs: [],
            reportIds: [],
            reason: 'No complete current-run blind comparison evidence is available.',
          }
        : {
            id: `blind-${input.evaluation.runId}`,
            outcome: blindOutcome,
            orderDigest: hash(input.evaluation.blindComparisons.map((item) => item.orderDigest)),
            mappingRefs: input.evaluation.blindComparisons.map((item) => item.mappingRef),
            reportIds: [
              ...new Set(input.evaluation.blindComparisons.flatMap((item) => item.reportIds)),
            ],
          },
    quality,
    budgetUsage: input.budgetUsage,
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt,
    residualRisk: [
      ...(input.residualRisk ?? []),
      ...budgetStatus.diagnostics,
      ...(qualityAvailable ? [] : ['Output-content Judge samples are unavailable or unmatched.']),
      ...(blindOutcome === 'candidate-preferred'
        ? []
        : [`Blind comparison outcome is ${blindOutcome}.`]),
    ],
  };
  return validateOptimizationDecision(decision, {
    plan,
    candidate,
    approval: input.approval,
  });
}

export function decideNextOptimizationIteration(input) {
  const plan = validateOptimizationPlan(input.plan);
  const budgetStatus = evaluateBudgetStatus(input.budgetUsage, plan.budget);
  if (!budgetStatus.withinBudget) {
    return { action: 'stop', retryAllowed: false, reasons: budgetStatus.diagnostics };
  }
  if (['case-fail', 'non-comparable', 'configuration-invalid'].includes(input.lastOutcome)) {
    return {
      action: 'reject-candidate',
      retryAllowed: false,
      reasons: [`Behavior outcome ${input.lastOutcome} cannot be retried into success.`],
    };
  }
  if (input.lastOutcome === 'infrastructure-fail') {
    return {
      action: 'retry-infrastructure',
      retryAllowed: true,
      reasons: ['Only infrastructure recovery may retry the unchanged candidate.'],
    };
  }
  if (input.budgetUsage.noImprovementIterations >= plan.budget.noImprovementLimit) {
    return {
      action: 'stop',
      retryAllowed: false,
      reasons: ['No-improvement limit reached.'],
    };
  }
  return { action: 'continue', retryAllowed: false, reasons: [] };
}

export function createOptimizationHistoryCheckpoints(input) {
  const plan = validateOptimizationPlan(input.plan);
  if (!plan.target.identity) {
    throw decisionError(
      'optimization-history-target-unsupported',
      'Skill development history accepts only Host-identified Skill targets',
    );
  }
  const candidate = validateOptimizationCandidate(input.candidate, plan);
  const approvalValidity = checkApprovalValidity(input.approval, plan, candidate);
  if (!approvalValidity.valid) {
    throw decisionError(
      'optimization-approval-invalid',
      `Optimization history requires valid approval: ${approvalValidity.reasons.join('; ')}`,
    );
  }
  const decision = validateOptimizationDecision(input.decision, {
    plan,
    candidate,
    approval: input.approval,
  });
  const baselineId = checkpointId(plan.id, candidate.id, decision.id, 'baseline');
  const candidateId = checkpointId(plan.id, candidate.id, decision.id, 'candidate');
  const evaluatedId = checkpointId(plan.id, candidate.id, decision.id, 'evaluated');
  const finalState = decision.outcome === 'accepted' ? 'accepted' : 'rejected';
  const finalId = checkpointId(plan.id, candidate.id, decision.id, finalState);
  const common = {
    reportIds: plan.reportIds,
    attribution: plan.ownership,
    actor: input.actor,
    recordedAt: input.recordedAt,
    residualRisk: decision.residualRisk,
  };
  return [
    {
      schema: OPTIMIZATION_SCHEMAS.checkpoint,
      id: baselineId,
      state: 'baseline',
      identity: plan.target.identity,
      fingerprint: plan.baseFingerprint,
      origin: { kind: 'evaluation-baseline', ref: plan.reportIds[0] },
      decision: 'none',
      planId: plan.id,
      ...(input.baselineParent ? { parent: input.baselineParent } : {}),
      ...common,
    },
    {
      schema: OPTIMIZATION_SCHEMAS.checkpoint,
      id: candidateId,
      state: 'candidate',
      identity: { ...plan.target.identity, fingerprint: candidate.candidateFingerprint },
      fingerprint: candidate.candidateFingerprint,
      parent: { entryId: baselineId, fingerprint: plan.baseFingerprint },
      origin: { kind: 'optimizer-candidate', ref: candidate.id },
      decision: 'approved',
      planId: plan.id,
      candidateId: candidate.id,
      approvalId: input.approval.id,
      ...common,
    },
    {
      schema: OPTIMIZATION_SCHEMAS.checkpoint,
      id: evaluatedId,
      state: 'evaluated',
      identity: { ...plan.target.identity, fingerprint: candidate.candidateFingerprint },
      fingerprint: candidate.candidateFingerprint,
      parent: { entryId: candidateId, fingerprint: candidate.candidateFingerprint },
      origin: { kind: 'evaluation-result', ref: decision.id },
      reportIds: decision.reportIds,
      decision: 'none',
      planId: plan.id,
      candidateId: candidate.id,
      approvalId: input.approval.id,
      attribution: plan.ownership,
      actor: input.actor,
      recordedAt: input.recordedAt,
      residualRisk: decision.residualRisk,
    },
    {
      schema: OPTIMIZATION_SCHEMAS.checkpoint,
      id: finalId,
      state: finalState,
      identity: { ...plan.target.identity, fingerprint: candidate.candidateFingerprint },
      fingerprint: candidate.candidateFingerprint,
      parent: { entryId: evaluatedId, fingerprint: candidate.candidateFingerprint },
      origin: { kind: 'human-decision', ref: decision.id },
      reportIds: decision.reportIds,
      decision: finalState,
      planId: plan.id,
      candidateId: candidate.id,
      approvalId: input.approval.id,
      decisionId: decision.id,
      attribution: plan.ownership,
      actor: input.actor,
      recordedAt: input.recordedAt,
      residualRisk: decision.residualRisk,
    },
  ];
}

export async function appendOptimizationHistory(input, options = {}) {
  const plan = validateOptimizationPlan(input.plan);
  const history = await (options.loadHistory ?? loadDevelopmentHistory)(options.file, options);
  const baselineParent = findBaselineParent(history, plan);
  const checkpoints = createOptimizationHistoryCheckpoints({ ...input, baselineParent });
  return (options.appendCheckpoints ?? appendDevelopmentCheckpoints)(checkpoints, {
    file: options.file,
    fs: options.fs,
    expectedEntryCount: history.entries.length,
  });
}

function summarizeEvaluation(evaluation) {
  const allSamples = evaluation.runs.flatMap(
    (entry) =>
      entry.run.runs?.flatMap(
        (variant) =>
          variant.run?.samples?.map((sample) => ({
            ...sample,
            role: variant.variant.role,
            group: entry.group,
            variantOutcome: variant.run.outcome ?? entry.run.outcome,
          })) ?? [],
      ) ?? [],
  );
  const allReportIds = [...new Set(allSamples.map((sample) => sample.reportId))];
  const holdoutSamples = allSamples.filter((sample) => sample.group === 'holdout');
  const regressionSamples = allSamples.filter((sample) => sample.group === 'protected-regression');
  const candidateSamples = allSamples.filter((sample) => sample.role === 'variant');
  const baselineJudgments = allSamples
    .filter((sample) => sample.role === 'baseline' && sample.group !== 'protected-regression')
    .map((sample) => sample.judge)
    .filter((judge) => typeof judge?.overallScore === 'number');
  const candidateJudgments = allSamples
    .filter((sample) => sample.role === 'variant' && sample.group !== 'protected-regression')
    .map((sample) => sample.judge)
    .filter((judge) => typeof judge?.overallScore === 'number');
  return {
    allReportIds,
    holdoutReportIds: unique(holdoutSamples.map((sample) => sample.reportId)),
    regressionReportIds: unique(regressionSamples.map((sample) => sample.reportId)),
    hardGateStatus: classifyAssertions(candidateSamples),
    holdoutStatus: classifySamples(holdoutSamples.filter((sample) => sample.role === 'variant')),
    regressionStatus: classifySamples(
      regressionSamples.filter((sample) => sample.role === 'variant'),
    ),
    baselineJudgments,
    candidateJudgments,
  };
}

function classifyAssertions(samples) {
  const assertions = samples.flatMap((sample) => sample.result?.assertions ?? []);
  if (assertions.length === 0) return 'blocked';
  if (assertions.some((assertion) => assertion.status === 'blocked')) return 'blocked';
  if (assertions.some((assertion) => assertion.status === 'fail')) return 'fail';
  return 'pass';
}

function classifySamples(samples) {
  if (samples.length === 0) return 'blocked';
  const outcomes = samples.map((sample) => sample.variantOutcome ?? sample.outcome);
  if (
    outcomes.some((outcome) =>
      ['infrastructure-fail', 'configuration-invalid', 'non-comparable'].includes(outcome),
    )
  ) {
    return 'blocked';
  }
  if (outcomes.some((outcome) => outcome !== 'pass')) return 'fail';
  return classifyAssertions(samples);
}

function summarizeQuality(baselineJudgments, candidateJudgments) {
  const baselineScores = baselineJudgments.map((judge) => judge.overallScore);
  const candidateScores = candidateJudgments.map((judge) => judge.overallScore);
  const baselineMean = mean(baselineScores);
  const candidateMean = mean(candidateScores);
  return {
    status: 'available',
    baselineMean,
    candidateMean,
    delta: candidateMean - baselineMean,
    samples: baselineScores.length + candidateScores.length,
    maximumUncertainty: Math.max(
      ...baselineJudgments.map((judge) => judge.uncertainty ?? 1),
      ...candidateJudgments.map((judge) => judge.uncertainty ?? 1),
    ),
  };
}

function aggregateBlindOutcome(comparisons) {
  if (!Array.isArray(comparisons) || comparisons.length === 0) return 'non-comparable';
  const counts = { candidate: 0, baseline: 0, tie: 0 };
  for (const comparison of comparisons) {
    if (comparison.outcome === 'candidate-preferred') counts.candidate += 1;
    else if (comparison.outcome === 'baseline-preferred') counts.baseline += 1;
    else if (comparison.outcome === 'tie') counts.tie += 1;
    else return 'non-comparable';
  }
  if (counts.candidate > counts.baseline + counts.tie) return 'candidate-preferred';
  if (counts.baseline > counts.candidate + counts.tie) return 'baseline-preferred';
  return 'tie';
}

function decideOutcome(input) {
  if (input.evaluationOutcome === 'non-comparable' || !input.qualityAvailable) {
    return 'non-comparable';
  }
  if (input.evaluationOutcome === 'infrastructure-fail' || !input.budgetStatus.withinBudget) {
    return 'blocked';
  }
  if (Object.values(input.checks).some((check) => check.status !== 'pass')) return 'rejected';
  if (input.blindOutcome !== 'candidate-preferred') return 'rejected';
  if (input.quality.status !== 'available') return 'non-comparable';
  if (input.quality.delta < input.plan.acceptanceThreshold.minimumQualityDelta) return 'rejected';
  if (input.quality.maximumUncertainty > input.plan.acceptanceThreshold.maximumJudgeUncertainty) {
    return 'rejected';
  }
  return 'accepted';
}

function evaluateBudgetStatus(usage, budget) {
  const dimensions = [
    ['candidates', 'maxCandidates'],
    ['iterations', 'maxIterations'],
    ['wallTimeMs', 'timeoutMs'],
    ['targetTokens', 'targetTokenLimit'],
    ['controllerTokens', 'controllerTokenLimit'],
    ['judgeTokens', 'judgeTokenLimit'],
  ];
  const diagnostics = dimensions
    .filter(([used, limit]) => usage[used] > budget[limit])
    .map(([used, limit]) => `${used} ${usage[used]} exceeded ${limit} ${budget[limit]}`);
  if (usage.cost.status === 'unavailable') {
    diagnostics.push('Provider cost evidence is unavailable.');
  } else if (usage.cost.totalUsd > budget.costUsdLimit) {
    diagnostics.push(`cost ${usage.cost.totalUsd} exceeded costUsdLimit ${budget.costUsdLimit}`);
  }
  if (
    usage.noImprovementIterations > 0 &&
    usage.noImprovementIterations >= budget.noImprovementLimit
  ) {
    diagnostics.push(
      `noImprovementIterations ${usage.noImprovementIterations} reached noImprovementLimit ${budget.noImprovementLimit}`,
    );
  }
  return { withinBudget: diagnostics.length === 0, diagnostics };
}

function findBaselineParent(history, plan) {
  const key = hostIdentityKey(plan.target.identity);
  const matching = history.entries.filter((entry) => hostIdentityKey(entry.identity) === key);
  if (matching.length === 0) return undefined;
  const referencedParents = new Set(
    history.entries.flatMap((entry) => (entry.parent ? [entry.parent.entryId] : [])),
  );
  const leaves = matching.filter((entry) => !referencedParents.has(entry.id));
  if (leaves.length !== 1) {
    throw decisionError(
      'optimization-history-ambiguous',
      `Skill development history has ${leaves.length} current checkpoints for ${key}`,
    );
  }
  const [current] = leaves;
  if (!['accepted', 'rejected'].includes(current.state)) {
    throw decisionError(
      'optimization-history-incomplete',
      `Skill development history ends at non-terminal state ${current.state}`,
    );
  }
  if (current.fingerprint !== plan.baseFingerprint) {
    throw decisionError(
      'optimization-history-base-stale',
      'Optimization plan base fingerprint differs from current Skill development history',
    );
  }
  return { entryId: current.id, fingerprint: current.fingerprint };
}

function unique(values) {
  return [...new Set(values)];
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function checkpointId(planId, candidateId, decisionId, state) {
  return `optimization-${state}-${createHash('sha256')
    .update(JSON.stringify({ planId, candidateId, decisionId, state }))
    .digest('hex')}`;
}

function decisionError(code, message) {
  return Object.assign(new Error(message), { code });
}
