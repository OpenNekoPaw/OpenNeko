import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertOptimizationArtifactSafe,
  checkApprovalValidity,
  validateOptimizationApproval,
  validateOptimizationCandidate,
  validateOptimizationPlan,
} from '../schemas/optimization-contracts.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_OUTPUT_ROOT = resolve(REPOSITORY_ROOT, 'reports/agent-eval');

export async function writeOptimizationCandidateArtifacts(input, options = {}) {
  const plan = validateOptimizationPlan(input.plan);
  const candidate = validateOptimizationCandidate(input.candidate, plan);
  const patchText = requireText(input.patchText, 'candidate patch');
  const expectedPatchFingerprint = hashOptimizationArtifact(patchText);
  if (candidate.patchFingerprint !== expectedPatchFingerprint) {
    throw candidateError(
      'candidate-patch-fingerprint-mismatch',
      'Candidate patch fingerprint does not match the artifact content',
    );
  }
  assertPatchScope(patchText, candidate.target.targetFile);
  assertOptimizationArtifactSafe({ plan, candidate, patchText }, 'optimizationCandidateArtifacts', {
    forbiddenTexts: options.forbiddenTexts,
  });
  const repositoryRoot = resolve(options.repositoryRoot ?? REPOSITORY_ROOT);
  const outputRoot = resolve(options.outputRoot ?? DEFAULT_OUTPUT_ROOT);
  const targetFile = resolveContained(
    repositoryRoot,
    candidate.target.targetFile,
    'candidate target',
  );
  if (outputRoot === dirname(targetFile) || outputRoot.startsWith(`${dirname(targetFile)}${sep}`)) {
    throw candidateError(
      'candidate-output-is-canonical',
      'Candidate artifacts must be written outside the canonical target directory',
    );
  }
  const relativeDirectory = `optimization/${plan.id}/${candidate.id}`;
  const expectedPatchPath = `${options.artifactPathPrefix ?? 'reports/agent-eval'}/${relativeDirectory}/candidate.patch`;
  if (candidate.patchPath !== expectedPatchPath) {
    throw candidateError(
      'candidate-patch-path-mismatch',
      `Candidate patch path must be ${expectedPatchPath}`,
    );
  }
  const directory = resolveContained(outputRoot, relativeDirectory, 'candidate output');
  const files = {
    plan: resolveContained(directory, 'optimization-plan.md', 'optimization plan'),
    candidate: resolveContained(directory, 'candidate.json', 'candidate metadata'),
    patch: resolveContained(directory, 'candidate.patch', 'candidate patch'),
  };
  await fs.mkdir(directory, { recursive: true });
  await Promise.all([
    fs.writeFile(files.plan, renderOptimizationPlan(plan, candidate), 'utf8'),
    writeJson(files.candidate, candidate),
    fs.writeFile(files.patch, patchText, 'utf8'),
  ]);
  return files;
}

export async function writeOptimizationApprovalRecord(approvalInput, input, options = {}) {
  const plan = validateOptimizationPlan(input.plan);
  const candidate = validateOptimizationCandidate(input.candidate, plan);
  const approval = validateOptimizationApproval(approvalInput, plan, candidate);
  const outputRoot = resolve(options.outputRoot ?? DEFAULT_OUTPUT_ROOT);
  const relativeFile = `optimization/${plan.id}/${candidate.id}/${approval.id}.json`;
  const file = resolveContained(outputRoot, relativeFile, 'approval record');
  await fs.mkdir(dirname(file), { recursive: true });
  await writeJson(file, approval);
  return { approval: file };
}

export function createOpenSpecApplicationHandoff(input) {
  const plan = validateOptimizationPlan(input.plan);
  const candidate = validateOptimizationCandidate(input.candidate, plan);
  const approval = validateOptimizationApproval(input.approval);
  const validity = checkApprovalValidity(approval, plan, candidate);
  if (!validity.valid) {
    throw candidateError(
      'candidate-approval-invalid',
      `Candidate application approval is invalid: ${validity.reasons.join('; ')}`,
    );
  }
  return assertOptimizationArtifactSafe(
    {
      schema: 'neko.agent-eval.openspec-application-handoff.v1',
      kind: 'openspec-apply-required',
      planId: plan.id,
      candidateId: candidate.id,
      approvalId: approval.id,
      targetFile: candidate.target.targetFile,
      patchPath: candidate.patchPath,
      baseFingerprint: candidate.baseFingerprint,
      candidateFingerprint: candidate.candidateFingerprint,
      canonicalMutationPerformed: false,
      commitPerformed: false,
    },
    'openSpecApplicationHandoff',
  );
}

export function hashOptimizationArtifact(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function assertPatchScope(patchText, targetFile) {
  const paths = [...patchText.matchAll(/^diff --git a\/(.+) b\/(.+)$/gmu)].flatMap((match) => [
    match[1],
    match[2],
  ]);
  if (paths.length === 0) {
    throw candidateError('candidate-patch-invalid', 'Candidate patch has no Git file header');
  }
  const unique = [...new Set(paths)];
  if (unique.length !== 1 || unique[0] !== targetFile) {
    throw candidateError(
      'candidate-patch-scope-violation',
      `Candidate patch may modify only ${targetFile}; observed ${unique.join(', ')}`,
    );
  }
  if (/^(?:---|\+\+\+) \/dev\/null$/gmu.test(patchText)) {
    throw candidateError(
      'candidate-patch-scope-violation',
      'Optimization candidates cannot create or delete the canonical target',
    );
  }
}

function renderOptimizationPlan(plan, candidate) {
  const identity = plan.target.identity;
  const lines = [
    '# Optimization Plan',
    '',
    `- Plan: \`${plan.id}\``,
    `- Candidate: \`${candidate.id}\``,
    `- Target kind: \`${plan.target.kind}\``,
    ...(identity
      ? [
          `- Skill identity: \`${identity.source}/${identity.rootId}/${identity.relativePath}\``,
          `- Base fingerprint: \`${plan.baseFingerprint}\``,
          `- Candidate fingerprint: \`${candidate.candidateFingerprint}\``,
        ]
      : [
          `- Prompt identity: \`${plan.target.promptId}\``,
          `- Base fingerprint: \`${plan.baseFingerprint}\``,
          `- Candidate fingerprint: \`${candidate.candidateFingerprint}\``,
        ]),
    `- Evidence reports: ${plan.reportIds.map((id) => `\`${id}\``).join(', ')}`,
    `- Evidence refs: ${plan.ownership.evidenceRefs.map((ref) => `\`${ref}\``).join(', ')}`,
    '',
    '## Observed Failure',
    '',
    plan.ownership.observedFailure,
    '',
    `Suspected owner: \`${plan.ownership.suspectedOwner}\` (confidence ${plan.ownership.confidence.toFixed(2)}).`,
    ...(plan.ownership.missingEvidence.length > 0
      ? ['', 'Missing evidence:', '', ...plan.ownership.missingEvidence.map((item) => `- ${item}`)]
      : []),
    '',
    '## Expected Improvement',
    '',
    plan.expectedImprovement,
    '',
    '## Risks',
    '',
    ...plan.risks.map((risk) => `- ${risk}`),
    '',
    '## Required Evaluation Matrix',
    '',
    `- Suite: \`${plan.requiredMatrix.suiteId}\``,
    `- Development: ${plan.requiredMatrix.developmentCaseIds.map((id) => `\`${id}\``).join(', ')}`,
    `- Holdout policy: \`${plan.requiredMatrix.holdoutPolicy.id}\` (${plan.requiredMatrix.holdoutPolicy.minimumCases} case(s), selection hidden)`,
    `- Protected regression: ${plan.requiredMatrix.protectedRegressionCaseIds.map((id) => `\`${id}\``).join(', ')}`,
    `- Repetitions: ${plan.requiredMatrix.repetitions}`,
    `- Judge: \`${plan.requiredMatrix.judgeProfileId}\` / \`${plan.requiredMatrix.rubricRef}\``,
    '',
    '## Budget',
    '',
    `- Candidates / iterations: ${plan.budget.maxCandidates} / ${plan.budget.maxIterations}`,
    `- Wall time: ${plan.budget.timeoutMs} ms`,
    `- Target / controller / Judge tokens: ${plan.budget.targetTokenLimit} / ${plan.budget.controllerTokenLimit} / ${plan.budget.judgeTokenLimit}`,
    `- Cost: ${plan.budget.costUsdLimit} USD`,
    `- No-improvement limit: ${plan.budget.noImprovementLimit}`,
    '',
    'Candidate application requires the recorded human approval and the normal OpenSpec apply workflow.',
    '',
  ];
  return lines.join('\n');
}

function resolveContained(root, value, label) {
  const target = resolve(root, value);
  const relation = relative(root, target);
  if (relation === '' || (!relation.startsWith('..') && !relation.startsWith(sep))) return target;
  throw candidateError('candidate-path-escape', `${label} escapes its owning root`);
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw candidateError('candidate-artifact-invalid', `${label} must be non-empty`);
  }
  return value;
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function candidateError(code, message) {
  return Object.assign(new Error(message), { code });
}
