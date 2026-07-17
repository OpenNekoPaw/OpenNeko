import { createHash } from 'node:crypto';
import {
  SCHEMAS,
  validateBaseline,
  validateComparison,
} from '../schemas/contracts.mjs';

const COMPARABILITY_DIMENSIONS = Object.freeze([
  { id: 'target', key: 'target' },
  { id: 'repository-revision', key: 'repositoryRevision' },
  { id: 'fixture-digest', key: 'fixtureDigest' },
  { id: 'runtime-profile', key: 'runtimeProfileId' },
  { id: 'model-profiles', key: 'modelProfileIds' },
  { id: 'sampling-policy', key: 'samplingPolicy' },
  { id: 'budget', key: 'budget' },
  { id: 'validator-policy', key: 'validatorPolicy' },
  { id: 'judge-policy', key: 'judgePolicy' },
  { id: 'hard-gates', key: 'hardGateIds' },
]);

export function createCurrentBaselineDescriptor(input) {
  return {
    target: input.suite.target,
    repositoryRevision: input.suite.repositoryRevision,
    fixtureDigest: input.fixtureDigest,
    runtimeProfileId: input.scenario.runtimeProfileId,
    modelProfileIds: [...input.scenario.modelProfileIds],
    samplingPolicy: policyIdentity(
      'sampling',
      'v1',
      { repetitions: input.scenario.budget.repetitions },
    ),
    budget: input.scenario.budget,
    validatorPolicy: policyIdentity(
      'validators',
      'v1',
      input.scenario.artifactChecks.map((check) => ({
        kind: check.kind,
        validatorId: check.validatorId,
      })),
    ),
    judgePolicy: policyIdentity(
      input.scenario.rubric?.judgeProfileId ?? 'no-judge',
      'v1',
      input.scenario.rubric ?? { kind: 'none' },
    ),
    hardGateIds: input.scenario.assertions.map((assertion) => assertion.id),
    scoreDistribution: input.scoreDistribution,
    reportId: input.reportId,
  };
}

export function createApprovedBaseline(input) {
  if (input.current.repositoryRevision === 'working-tree') {
    throw new Error('approved baseline requires a concrete repository revision');
  }
  if (input.current.scoreDistribution.samples < 1) {
    throw new Error('approved baseline requires at least one scored sample');
  }
  return validateBaseline({
    schema: SCHEMAS.baseline,
    id: input.id,
    ...input.current,
    approver: input.approver,
    approvedAt: input.approvedAt,
  });
}

export function compareWithBaseline(input) {
  const allowed = new Set(input.allowDifferences ?? []);
  const dimensions = COMPARABILITY_DIMENSIONS.map(({ id, key }) => {
    const baseline = input.baseline[key];
    const current = input.current[key];
    const equal = stableStringify(baseline) === stableStringify(current);
    return {
      id,
      comparable: equal || allowed.has(id) || allowed.has(key),
      baseline: summarize(baseline),
      current: summarize(current),
    };
  });
  const comparable = dimensions.every((dimension) => dimension.comparable);
  const scoreComparable =
    input.current.scoreDistribution?.samples > 0 &&
    typeof input.current.scoreDistribution?.mean === 'number';
  if (!scoreComparable) {
    dimensions.push({
      id: 'score-distribution',
      comparable: false,
      baseline: summarize(input.baseline.scoreDistribution),
      current: summarize(input.current.scoreDistribution),
    });
  }
  if (!comparable || !scoreComparable) {
    return validateComparison({
      schema: SCHEMAS.comparison,
      id: input.id,
      baselineId: input.baseline.id,
      currentReportIds: input.currentReportIds,
      outcome: 'non-comparable',
      comparable: false,
      dimensions,
      evidenceRefs: input.evidenceRefs,
      reason: `Material mismatch: ${dimensions.filter((item) => !item.comparable).map((item) => item.id).join(', ')}`,
    });
  }
  const baselineMean = input.baseline.scoreDistribution.mean;
  const currentMean = input.current.scoreDistribution.mean;
  const delta = currentMean - baselineMean;
  const outcome = Math.abs(delta) < 1e-9 ? 'unchanged' : delta > 0 ? 'improved' : 'regressed';
  return validateComparison({
    schema: SCHEMAS.comparison,
    id: input.id,
    baselineId: input.baseline.id,
    currentReportIds: input.currentReportIds,
    outcome,
    comparable: true,
    dimensions,
    evidenceRefs: input.evidenceRefs,
    improvementPercent: baselineMean === 0 ? 0 : (delta / baselineMean) * 100,
  });
}

function policyIdentity(id, version, value) {
  return { id, version, digest: hash(value) };
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

function summarize(value) {
  const serialized = stableStringify(value);
  return serialized.length <= 1_000 ? serialized : `${serialized.slice(0, 980)}...`;
}
