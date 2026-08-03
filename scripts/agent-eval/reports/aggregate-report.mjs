import * as fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { SCHEMAS, validateAggregate } from '../schemas/contracts.mjs';

export function createAggregateReport(input) {
  if (input.samples.length !== input.repetitions) {
    throw configurationError(
      `Aggregate requires ${input.repetitions} completed sample(s); observed ${input.samples.length}.`,
    );
  }
  const relativeLocation = `${input.selection.suite.id}/${input.selection.scenario.id}/${input.reportId}/aggregate.json`;
  const outcomes = input.samples.map((sample) => sample.outcome);
  const scores = input.samples.flatMap((sample) =>
    sample.judge ? [sample.judge.overallScore] : [],
  );
  return validateAggregate({
    schema: SCHEMAS.aggregate,
    reportId: input.reportId,
    suiteId: input.selection.suite.id,
    caseId: input.selection.scenario.id,
    outcome: classifyOutcomes(outcomes),
    repetitions: input.repetitions,
    samples: input.samples.map((sample, index) => ({
      repetition: index + 1,
      result: sample.result,
      artifactChecks: sample.artifactChecks,
      artifacts: sample.artifacts,
      desktopReport: sample.desktopReportLocation,
      ...(sample.judge ? { judge: sample.judge } : {}),
      ...(sample.baselineDiff ? { baselineDiff: sample.baselineDiff } : {}),
    })),
    statistics: {
      samples: input.samples.length,
      passRate: outcomes.filter((outcome) => outcome === 'pass').length / input.samples.length,
      outcomeCounts: countOutcomes(outcomes),
      usageAvailability: {
        inputTokens: countAvailable(input.samples, 'inputTokens'),
        outputTokens: countAvailable(input.samples, 'outputTokens'),
        costUsd: countAvailable(input.samples, 'costUsd'),
      },
      usageTotals: {
        latencyMs: sumUsage(input.samples, 'latencyMs'),
        ...(hasAvailable(input.samples, 'inputTokens')
          ? { inputTokens: sumUsage(input.samples, 'inputTokens') }
          : {}),
        ...(hasAvailable(input.samples, 'outputTokens')
          ? { outputTokens: sumUsage(input.samples, 'outputTokens') }
          : {}),
        ...(hasAvailable(input.samples, 'costUsd')
          ? { costUsd: sumUsage(input.samples, 'costUsd') }
          : {}),
      },
      ...(scores.length === input.samples.length
        ? { scoreDistribution: distribution(scores, outcomes) }
        : {}),
    },
    residualRisk: [...new Set(input.samples.flatMap((sample) => sample.result.residualRisk))],
    aggregateLocation: relativeLocation,
  });
}

export async function writeAggregateReport(report, options = {}) {
  validateAggregate(report);
  const root = resolve(options.outputRoot ?? 'reports/agent-eval');
  const file = resolve(root, report.aggregateLocation);
  assertContained(root, file);
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

function classifyOutcomes(outcomes) {
  for (const outcome of [
    'configuration-invalid',
    'infrastructure-fail',
    'case-fail',
    'non-comparable',
  ]) {
    if (outcomes.includes(outcome)) return outcome;
  }
  return 'pass';
}

function countOutcomes(outcomes) {
  return {
    pass: outcomes.filter((outcome) => outcome === 'pass').length,
    caseFail: outcomes.filter((outcome) => outcome === 'case-fail').length,
    infrastructureFail: outcomes.filter((outcome) => outcome === 'infrastructure-fail').length,
    configurationInvalid: outcomes.filter((outcome) => outcome === 'configuration-invalid').length,
    nonComparable: outcomes.filter((outcome) => outcome === 'non-comparable').length,
  };
}

function countAvailable(samples, key) {
  return samples.filter((sample) => sample.result.usage[key] !== undefined).length;
}

function hasAvailable(samples, key) {
  return countAvailable(samples, key) > 0;
}

function sumUsage(samples, key) {
  return samples.reduce((total, sample) => total + (sample.result.usage[key] ?? 0), 0);
}

function distribution(values, outcomes) {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return {
    samples: values.length,
    passRate: outcomes.filter((outcome) => outcome === 'pass').length / outcomes.length,
    mean,
    variance,
  };
}

function assertContained(root, target) {
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new Error(`aggregate report path escapes output root: ${target}`);
  }
}

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'configuration-invalid' });
}
