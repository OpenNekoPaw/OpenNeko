import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import {
  checkApprovalValidity,
  validateHoldoutSelection,
  validateOptimizationCandidate,
  validateOptimizationIntake,
  validateOptimizationPlan,
} from '../schemas/optimization-contracts.mjs';

export function fingerprintHoldoutSelection(input) {
  return `sha256:${createHash('sha256')
    .update(
      stableStringify({
        policyId: input.policyId,
        suiteId: input.suiteId,
        caseIds: [...input.caseIds].sort(),
      }),
    )
    .digest('hex')}`;
}

export function validateTrustedHoldoutSelection(input) {
  const selection = validateHoldoutSelection(input);
  if (selection.selectionDigest !== fingerprintHoldoutSelection(selection)) {
    throw holdoutError(
      'holdout-selection-stale',
      'Holdout selection digest does not match its policy and case ids',
    );
  }
  return selection;
}

export async function loadTrustedHoldoutSelection(file, context, options = {}) {
  const plan = validateOptimizationPlan(context.plan);
  const candidate = validateOptimizationCandidate(context.candidate, plan);
  const validity = checkApprovalValidity(context.approval, plan, candidate);
  if (!validity.valid) {
    throw holdoutError(
      'holdout-approval-invalid',
      `Holdout selection requires a valid frozen candidate approval: ${validity.reasons.join('; ')}`,
    );
  }
  const selection = validateTrustedHoldoutSelection(
    JSON.parse(await (options.fs ?? fs).readFile(file, 'utf8')),
  );
  const policy = plan.requiredMatrix.holdoutPolicy;
  if (
    selection.policyId !== policy.id ||
    selection.suiteId !== plan.requiredMatrix.suiteId ||
    selection.selectionDigest !== policy.selectionDigest ||
    selection.caseIds.length < policy.minimumCases
  ) {
    throw holdoutError(
      'holdout-selection-policy-mismatch',
      'Trusted holdout selection does not match the approved required matrix',
    );
  }
  return selection;
}

export function createOptimizerContext(planInput, intakeInputs) {
  const plan = validateOptimizationPlan(planInput);
  const intakes = intakeInputs.map(validateOptimizationIntake);
  const allowedReports = new Set(plan.reportIds);
  const unauthorized = intakes.filter((intake) => !allowedReports.has(intake.reportId));
  if (unauthorized.length > 0) {
    throw holdoutError(
      'optimizer-context-report-unauthorized',
      `Optimizer context includes unauthorized report(s): ${unauthorized.map((item) => item.reportId).join(', ')}`,
    );
  }
  return {
    schema: 'neko.agent-eval.optimizer-context.v1',
    planId: plan.id,
    target: plan.target,
    baseFingerprint: plan.baseFingerprint,
    reports: intakes,
    expectedImprovement: plan.expectedImprovement,
    risks: plan.risks,
    budget: plan.budget,
    requiredMatrix: {
      suiteId: plan.requiredMatrix.suiteId,
      developmentCaseIds: plan.requiredMatrix.developmentCaseIds,
      protectedRegressionCaseIds: plan.requiredMatrix.protectedRegressionCaseIds,
      runtimeProfileId: plan.requiredMatrix.runtimeProfileId,
      modelProfileId: plan.requiredMatrix.modelProfileId,
      repetitions: plan.requiredMatrix.repetitions,
      judgeProfileId: plan.requiredMatrix.judgeProfileId,
      rubricRef: plan.requiredMatrix.rubricRef,
      holdoutPolicy: {
        id: plan.requiredMatrix.holdoutPolicy.id,
        selectionDigest: plan.requiredMatrix.holdoutPolicy.selectionDigest,
        minimumCases: plan.requiredMatrix.holdoutPolicy.minimumCases,
        inputsAvailable: false,
        resultsAvailable: false,
      },
    },
  };
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

function holdoutError(code, message) {
  return Object.assign(new Error(message), { code });
}
