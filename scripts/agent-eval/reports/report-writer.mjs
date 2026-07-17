import * as fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEMAS,
  validateArtifactManifest,
  validateComparison,
  validateEvidence,
  validateFailureAttribution,
  validateJudgeResult,
  validateRepeatedRun,
  validateResult,
} from '../schemas/contracts.mjs';
import { validateAblationDelta } from '../schemas/ablation-contracts.mjs';
import { assertShareableEvidence } from '../schemas/evidence-policy.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DEFAULT_REPORT_ROOT = resolve(REPOSITORY_ROOT, 'reports/agent-eval');

export function createM1ReportDocuments(input) {
  const relativeDirectory = `${input.suite.id}/${input.scenario.id}/${input.runId}`;
  const reportLocations = {
    result: `${relativeDirectory}/result.json`,
    evidence: `${relativeDirectory}/evidence.json`,
    artifactManifest: `${relativeDirectory}/artifact-manifest.json`,
    qualityReport: `${relativeDirectory}/quality-report.md`,
    ...(input.judge ? { judge: `${relativeDirectory}/judge.json` } : {}),
    ...(input.baselineDiff ? { baselineDiff: `${relativeDirectory}/baseline-diff.json` } : {}),
  };
  const redacted = redactRuntimeEvidence(input.facts);
  const redactedAttribution = input.failureAttribution
    ? redactRuntimeEvidence(input.failureAttribution)
    : undefined;
  const redactedHardGates = redactRuntimeEvidence(input.hardGates);
  const redactedResidualRisk = redactRuntimeEvidence(input.residualRisk ?? []);
  for (const projection of [redactedAttribution, redactedHardGates, redactedResidualRisk]) {
    if (!projection) continue;
    for (const [kind, count] of Object.entries(projection.counts)) {
      redacted.counts[kind] = (redacted.counts[kind] ?? 0) + count;
    }
  }
  const failureAttribution = redactedAttribution?.value;
  const hardGates = redactedHardGates.value.map(projectHardGateResult);
  const result = validateResult({
    schema: SCHEMAS.result,
    reportId: input.reportId,
    suiteId: input.suite.id,
    caseId: input.scenario.id,
    runId: input.runId,
    outcome: input.outcome,
    target: input.suite.target,
    repositoryRevision: input.suite.repositoryRevision,
    modelIdentity: input.modelIdentity,
    effectiveConfiguration: input.effectiveConfiguration,
    fixtureDigest: input.fixtureDigest,
    command: input.command,
    assertions: hardGates,
    artifactRefs: input.artifacts?.map((item) => item.ref) ?? [],
    usage: input.usage,
    reportLocations,
    skippedStages: input.skippedStages ?? ['judge', 'baseline'],
    residualRisk: redactedResidualRisk.value,
  });
  const evidence = validateEvidence({
    schema: SCHEMAS.evidence,
    reportId: input.reportId,
    items: [
      {
        ref: 'turn-facts',
        kind: 'runtime-fact',
        source: 'session.facts',
        summary: summarizeFacts(redacted.value),
        complete: evidenceIsComplete(redacted.value),
        droppedCount: readDroppedCount(redacted.value),
        data: redacted.value,
      },
      ...hardGates.map((gate) => ({
        ref: `hard-gate.${gate.id}`,
        kind: 'hard-gate',
        source: gate.id,
        summary: gate.status === 'pass' ? 'Hard gate passed.' : gate.message,
        complete: true,
        data: gate,
      })),
      ...(input.judge
        ? [
            {
              ref: 'judge.result',
              kind: 'judge',
              source: input.judge.profileId,
              summary: `Judge score ${input.judge.overallScore.toFixed(2)}, uncertainty ${input.judge.uncertainty.toFixed(2)}.`,
              complete: true,
              data: input.judge,
            },
          ]
        : []),
      ...(failureAttribution
        ? [
            {
              ref: 'failure-attribution',
              kind: 'attribution',
              source: 'evaluation-report',
              summary: `${failureAttribution.observedFailures.length} observed failure(s), ${failureAttribution.hypotheses.length} attribution hypothesis/hypotheses.`,
              complete: true,
              data: failureAttribution,
            },
          ]
        : []),
    ],
    redactions: Object.entries(redacted.counts).map(([kind, count]) => ({ kind, count })),
  });
  const artifactManifest = validateArtifactManifest({
    schema: SCHEMAS.artifactManifest,
    reportId: input.reportId,
    artifacts: input.artifacts ?? [],
  });
  const qualityReport = renderQualityReport({
    result,
    hardGates,
    evidence,
    artifactManifest,
    judge: input.judge,
    failureAttribution,
  });
  const summary = createSanitizedSummary({
    result,
    judge: input.judge,
    failureAttribution,
  });
  return {
    result,
    evidence,
    artifactManifest,
    qualityReport,
    summary,
    ...(input.judge ? { judge: validateJudgeResult(input.judge) } : {}),
    ...(input.baselineDiff ? { baselineDiff: validateComparison(input.baselineDiff) } : {}),
    ...(failureAttribution
      ? { failureAttribution: validateFailureAttribution(failureAttribution) }
      : {}),
  };
}

export async function writeEvaluationReport(documents, options = {}) {
  validateResult(documents.result);
  validateEvidence(documents.evidence);
  validateArtifactManifest(documents.artifactManifest);
  if (documents.judge) validateJudgeResult(documents.judge);
  if (documents.baselineDiff) validateComparison(documents.baselineDiff);
  assertShareableEvidence(documents.summary, 'summary');
  const root = resolve(options.outputRoot ?? DEFAULT_REPORT_ROOT);
  const files = {
    result: resolve(root, documents.result.reportLocations.result),
    evidence: resolve(root, documents.result.reportLocations.evidence),
    artifactManifest: resolve(root, documents.result.reportLocations.artifactManifest),
    qualityReport: resolve(root, documents.result.reportLocations.qualityReport),
    summary: resolve(root, dirname(documents.result.reportLocations.result), 'summary.json'),
    ...(documents.judge ? { judge: resolve(root, documents.result.reportLocations.judge) } : {}),
    ...(documents.baselineDiff
      ? { baselineDiff: resolve(root, documents.result.reportLocations.baselineDiff) }
      : {}),
  };
  for (const file of Object.values(files)) assertContained(root, file);
  await fs.mkdir(dirname(files.result), { recursive: true });
  await Promise.all([
    writeJson(files.result, documents.result),
    writeJson(files.evidence, documents.evidence),
    writeJson(files.artifactManifest, documents.artifactManifest),
    fs.writeFile(files.qualityReport, documents.qualityReport, 'utf8'),
    writeJson(files.summary, documents.summary),
    ...(documents.judge ? [writeJson(files.judge, documents.judge)] : []),
    ...(documents.baselineDiff ? [writeJson(files.baselineDiff, documents.baselineDiff)] : []),
  ]);
  return files;
}

export async function writeRepeatedRunReport(document, options = {}) {
  validateRepeatedRun(document);
  const root = resolve(options.outputRoot ?? DEFAULT_REPORT_ROOT);
  const relativeFile = `${document.suiteId}/${document.caseId}/${document.runId}/aggregate.json`;
  const file = resolve(root, relativeFile);
  assertContained(root, file);
  await fs.mkdir(dirname(file), { recursive: true });
  await writeJson(file, document);
  return { aggregate: file };
}

export async function writeAblationDeltaReport(document, options = {}) {
  validateAblationDelta(document);
  const root = resolve(options.outputRoot ?? DEFAULT_REPORT_ROOT);
  const relativeFile = `ablation/${document.planId}/${document.runId}/variant-delta.json`;
  const file = resolve(root, relativeFile);
  assertContained(root, file);
  await fs.mkdir(dirname(file), { recursive: true });
  await writeJson(file, document);
  return { variantDelta: file };
}

export async function writeBaselineDiffReport(document, input, options = {}) {
  validateComparison(document);
  const root = resolve(options.outputRoot ?? DEFAULT_REPORT_ROOT);
  const file = resolve(root, `${input.suiteId}/${input.caseId}/${input.runId}/baseline-diff.json`);
  assertContained(root, file);
  await fs.mkdir(dirname(file), { recursive: true });
  await writeJson(file, document);
  return { baselineDiff: file };
}

export function createSanitizedSummary(input) {
  const { result } = input;
  const summary = {
    schema: 'neko.agent-eval.summary.v2',
    reportId: result.reportId,
    suiteId: result.suiteId,
    caseId: result.caseId,
    runId: result.runId,
    outcome: result.outcome,
    target: result.target,
    repositoryRevision: result.repositoryRevision,
    modelIdentity: result.modelIdentity,
    effectiveConfiguration: result.effectiveConfiguration,
    fixtureDigest: result.fixtureDigest,
    assertions: result.assertions,
    artifactRefs: result.artifactRefs,
    usage: result.usage,
    residualRisk: result.residualRisk,
    ...(input.judge
      ? {
          judge: {
            rubricId: input.judge.rubricId,
            rubricVersion: input.judge.rubricVersion,
            providerId: input.judge.providerId,
            modelId: input.judge.modelId,
            overallScore: input.judge.overallScore,
            uncertainty: input.judge.uncertainty,
            disposition: input.judge.disposition,
          },
        }
      : {}),
    ...(input.failureAttribution ? { failureAttribution: input.failureAttribution } : {}),
  };
  return assertShareableEvidence(summary, 'summary');
}

export function redactRuntimeEvidence(value) {
  const counts = {};
  return { value: visit(value, ''), counts };

  function visit(current, key) {
    if (isSensitiveKey(key)) {
      increment('secret-field');
      return '[REDACTED]';
    }
    if (key === 'history') {
      increment('history');
      return '[REDACTED]';
    }
    if (typeof current === 'string') {
      let sanitized = current.replace(/(?:\/Users|\/home)\/[^/\s]+/gu, '<user-home>');
      if (sanitized !== current) increment('absolute-user-path');
      const withoutBearer = sanitized.replace(/\bBearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]');
      if (withoutBearer !== sanitized) increment('diagnostic-secret');
      sanitized = withoutBearer;
      const withoutAssignments = sanitized.replace(
        /\b([a-z0-9_-]*(?:api[_ -]?key|authorization|credential|password|secret|token)[a-z0-9_-]*)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
        '$1=[REDACTED]',
      );
      if (withoutAssignments !== sanitized) increment('diagnostic-secret');
      return withoutAssignments;
    }
    if (Array.isArray(current)) return current.map((item) => visit(item, key));
    if (current === null || typeof current !== 'object') return current;
    return Object.fromEntries(
      Object.entries(current).map(([childKey, item]) => [childKey, visit(item, childKey)]),
    );
  }

  function increment(kind) {
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
}

function projectHardGateResult(gate) {
  return {
    id: gate.id,
    status: gate.status,
    evidenceRefs: gate.evidenceRefs,
    ...(gate.message ? { message: gate.message } : {}),
  };
}

function summarizeFacts(facts) {
  return `Observed ${Array.isArray(facts?.turns) ? facts.turns.length : 0} turn(s), ${Array.isArray(facts?.runtimeErrors) ? facts.runtimeErrors.length : 0} runtime error(s), fullyIdle=${facts?.idle?.fullyIdle === true}.`;
}

function evidenceIsComplete(facts) {
  return readDroppedCount(facts) === 0;
}

function readDroppedCount(value) {
  if (value?.evidenceCompleteness && typeof value.evidenceCompleteness === 'object') {
    return Object.values(value.evidenceCompleteness).reduce(
      (total, item) =>
        total +
        (item && typeof item === 'object' && Number.isInteger(item.droppedCount)
          ? Math.max(0, item.droppedCount)
          : 0),
      0,
    );
  }
  let total = 0;
  visit(value);
  return total;
  function visit(current) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!current || typeof current !== 'object') return;
    for (const [key, item] of Object.entries(current)) {
      if (/^dropped.*count$/iu.test(key) && Number.isInteger(item) && item > 0) total += item;
      else visit(item);
    }
  }
}

function renderQualityReport(input) {
  const lines = [
    '# Agent Evaluation Quality Report',
    '',
    `- Report: \`${input.result.reportId}\``,
    `- Suite / case / run: \`${input.result.suiteId}\` / \`${input.result.caseId}\` / \`${input.result.runId}\``,
    `- Outcome: \`${input.result.outcome}\``,
    `- Model: \`${input.result.modelIdentity.providerId}/${input.result.modelIdentity.modelId}\``,
    `- Fixture: \`${input.result.fixtureDigest}\``,
    '',
    '## Hard Gates',
    '',
    '| Gate | Status | Evidence |',
    '| --- | --- | --- |',
    ...input.hardGates.map(
      (gate) =>
        `| ${gate.id} | ${gate.status} | ${gate.evidenceRefs.map((ref) => `\`${ref}\``).join(', ')} |`,
    ),
    '',
    '## Artifacts',
    '',
    input.artifactManifest.artifacts.length > 0
      ? input.artifactManifest.artifacts
          .map((item) => `- \`${item.ref}\`: ${item.validatorStatus}`)
          .join('\n')
      : '- None.',
    '',
    '## Output Content Quality',
    '',
    ...(input.judge
      ? [
          `- Rubric: \`${input.judge.rubricId}@${input.judge.rubricVersion}\``,
          `- Provider / model: \`${input.judge.providerId}/${input.judge.modelId}\``,
          `- Score: \`${input.judge.overallScore.toFixed(2)}\``,
          `- Uncertainty: \`${input.judge.uncertainty.toFixed(2)}\``,
          `- Disposition: \`${input.judge.disposition}\``,
        ]
      : [
          '- Not evaluated: no rubric Judge result is available.',
          '- Hard-gate, format, schema, latency, token, and cost results do not constitute output-content quality evidence.',
        ]),
    '',
    '## Failure Attribution',
    '',
    ...(input.failureAttribution
      ? [
          ...input.failureAttribution.observedFailures.map(
            (failure) => `- Observed \`${failure.id}\`: ${failure.summary}`,
          ),
          ...input.failureAttribution.hypotheses.map(
            (hypothesis) =>
              `- Suspected \`${hypothesis.suspectedOwner}\` for \`${hypothesis.observedFailureId}\` (confidence ${hypothesis.confidence.toFixed(2)}); missing: ${hypothesis.missingEvidence.join('; ')}`,
          ),
        ]
      : ['- No observed failure.']),
    '',
    '## Skipped Stages',
    '',
    ...(input.result.skippedStages.length > 0
      ? input.result.skippedStages.map((stage) => `- ${stage}`)
      : ['- None.']),
    '',
    '## Residual Risk',
    '',
    ...(input.result.residualRisk.length > 0
      ? input.result.residualRisk.map((risk) => `- ${risk}`)
      : ['- None recorded.']),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function isSensitiveKey(key) {
  return /api.?key|authorization|cookie|credential|password|secret|system.?prompt|hidden.?prompt/iu.test(
    key,
  );
}

function assertContained(root, target) {
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new Error(`report path escapes output root: ${target}`);
  }
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
