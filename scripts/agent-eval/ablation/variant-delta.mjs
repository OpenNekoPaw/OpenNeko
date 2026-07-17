import { createHash } from 'node:crypto';

export function projectAggregateMetrics(aggregate, qualityPolicy, samples = []) {
  const toolCalls = aggregate.tools.calls;
  const taskTotal = aggregate.tasks.total;
  const quality = projectContentQuality(aggregate, qualityPolicy, samples);
  return {
    passRate: aggregate.passRate,
    hardGates: aggregate.hardGates,
    tokens: aggregate.tokens,
    cost: aggregate.cost,
    latency: {
      meanMs: aggregate.latency.meanMs,
      p50Ms: aggregate.latency.p50Ms,
      p95Ms: aggregate.latency.p95Ms,
    },
    iterations: aggregate.iterations,
    tools: {
      ...aggregate.tools,
      successRate: toolCalls === 0 ? 1 : aggregate.tools.successes / toolCalls,
    },
    retries: aggregate.retries,
    tasks: {
      ...aggregate.tasks,
      successRate: taskTotal === 0 ? 1 : aggregate.tasks.completed / taskTotal,
    },
    quality,
  };
}

function projectContentQuality(aggregate, policy, samples) {
  const distribution = aggregate.scoreDistribution;
  if (!policy || !distribution) {
    throw new Error('ablation aggregate requires an explicit content-quality policy');
  }
  const judgedSamples = samples.filter(
    (sample) => typeof sample?.judge?.overallScore === 'number',
  ).length;
  const hasMean = typeof distribution.mean === 'number';
  const hasVariance = typeof distribution.variance === 'number';
  if (
    (distribution.samples === 0 && (hasMean || hasVariance)) ||
    (distribution.samples > 0 && (!hasMean || !hasVariance))
  ) {
    throw new Error('ablation content-quality score distribution is internally inconsistent');
  }
  if (samples.length > 0 && judgedSamples !== distribution.samples) {
    throw new Error(
      `ablation Judge sample count does not match aggregate: samples=${judgedSamples} aggregate=${distribution.samples}`,
    );
  }
  if (policy.kind === 'hard-gates-only') {
    if (distribution.samples !== 0 || hasMean || hasVariance || judgedSamples !== 0) {
      throw new Error('hard-gates-only ablation must not contain content-quality Judge scores');
    }
    return { status: 'not-evaluated', reason: 'hard-gates-only' };
  }
  if (
    distribution.samples > 0 &&
    hasMean &&
    hasVariance
  ) {
    return {
      status: 'available',
      rubricRef: policy.rubricRef,
      samples: distribution.samples,
      mean: distribution.mean,
      variance: distribution.variance,
    };
  }
  if (aggregate.outcome === 'pass' || aggregate.passRate > 0) {
    throw new Error('scenario-rubric ablation passed without content-quality Judge scores');
  }
  return {
    status: 'unavailable',
    rubricRef: policy.rubricRef,
    reason: 'judge-not-completed',
  };
}

export function compareRunPolicies(baseline, current, options = {}) {
  const diagnostics = [];
  const allowed = new Set(options.allowDifferences ?? []);
  if (baseline.samples.length !== current.samples.length) diagnostics.push('sample count differs');
  const baselineResults = baseline.samples.map((sample) => sample.result);
  const currentResults = current.samples.map((sample) => sample.result);
  for (const [label, read] of [
    ['target identity', (result) => result.target],
    ['repository revision', (result) => result.repositoryRevision],
    ['fixture digest', (result) => result.fixtureDigest],
    ['model identity', (result) => result.modelIdentity],
    ['hard-gate policy', (result) => result.assertions.map((item) => item.id)],
  ]) {
    if (!allowed.has(label) && !sameValues(baselineResults.map(read), currentResults.map(read))) {
      diagnostics.push(`${label} differs`);
    }
  }
  if (
    !allowed.has('content-quality Judge policy') &&
    !sameValues(
      baseline.samples.map(projectJudgePolicy),
      current.samples.map(projectJudgePolicy),
    )
  ) {
    diagnostics.push('content-quality Judge policy differs');
  }
  return diagnostics;
}

function projectJudgePolicy(sample) {
  const judge = sample.judge;
  if (!judge) return { status: 'not-run' };
  return {
    providerId: judge.providerId,
    modelId: judge.modelId,
    profileId: judge.profileId,
    rubricId: judge.rubricId,
    rubricVersion: judge.rubricVersion,
    sampling: judge.sampling,
  };
}

export function metricDelta(baseline, current) {
  const delta = {
    passRate: current.passRate - baseline.passRate,
    inputTokens: current.tokens.input - baseline.tokens.input,
    outputTokens: current.tokens.output - baseline.tokens.output,
    latencyP50Ms: current.latency.p50Ms - baseline.latency.p50Ms,
    latencyP95Ms: current.latency.p95Ms - baseline.latency.p95Ms,
    iterations: current.iterations.total - baseline.iterations.total,
    toolCalls: current.tools.calls - baseline.tools.calls,
    retries: current.retries.count - baseline.retries.count,
    completedTasks: current.tasks.completed - baseline.tasks.completed,
  };
  if (baseline.cost.status === 'available' && current.cost.status === 'available') {
    delta.costUsd = current.cost.totalUsd - baseline.cost.totalUsd;
  }
  if (baseline.quality.status === 'available' && current.quality.status === 'available') {
    delta.qualityMean = current.quality.mean - baseline.quality.mean;
  }
  return delta;
}

export function aggregateOutcome(variants) {
  for (const outcome of ['configuration-invalid', 'infrastructure-fail', 'case-fail']) {
    if (variants.some((variant) => variant.outcome === outcome)) return outcome;
  }
  if (variants.some((variant) => !variant.comparable)) return 'non-comparable';
  if (variants.some((variant) => variant.outcome === 'non-comparable')) return 'non-comparable';
  return 'pass';
}

export function sameValues(left, right) {
  return hashJson(left) === hashJson(right);
}

function hashJson(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
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
