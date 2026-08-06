import { runCaseRepeated } from '../runner/run-case.mjs';
import { writeAblationDeltaReport } from '../reports/report-writer.mjs';
import {
  ABLATION_SCHEMAS,
  validateAblationDelta,
  validateAblationPlan,
  validateAblationQualityContract,
} from '../schemas/ablation-contracts.mjs';
import { discoverSuites, selectSuiteCases } from '../suites/discovery.mjs';
import { prepareIsolatedBuildTarget } from './isolated-build-target.mjs';
import {
  aggregateOutcome,
  compareRunPolicies,
  metricDelta,
  projectAggregateMetrics,
  sameValues,
} from './variant-delta.mjs';

export async function runImplementationAblation(planInput, options = {}) {
  const plan = validateAblationPlan(planInput);
  if (plan.mode !== 'implementation') {
    throw implementationError('implementation runner requires an implementation ablation plan');
  }
  const selection = await resolveSelection(plan, options);
  validateAblationQualityContract(plan, selection);
  const runId = options.runId ?? `ablation-${Date.now().toString(36)}`;
  const runs = [];
  const executionOrder = randomize(plan.variants, options.random ?? Math.random);
  const preparedTargets = new Map();
  try {
    for (const variant of executionOrder) {
      const cacheKey = buildCacheKey(variant.buildTarget);
      let prepared = preparedTargets.get(cacheKey);
      if (!prepared) {
        prepared = await (options.prepareBuild ?? prepareIsolatedBuildTarget)(variant.buildTarget, {
          repositoryRoot: options.repositoryRoot,
          workspaceParent: options.workspaceParent,
          env: options.env,
        });
        preparedTargets.set(cacheKey, prepared);
      }
      const variantSelection = createVariantSelection(selection, plan, variant, prepared);
      const run = await (options.runCase ?? runCaseRepeated)(variantSelection, {
        ...(options.caseOptions ?? {}),
        runId: `${runId}-${variant.id}`,
        outputRoot: options.outputRoot,
        env: options.env,
        target: 'packaged',
        executablePath: prepared.executablePath,
        executableFingerprint: prepared.executableFingerprint,
        judgeTargetVisibility: 'identity-only',
      });
      runs.push({
        variant,
        run,
        buildIdentity: {
          sourceCommit: prepared.commit,
          sourceFingerprint: prepared.sourceFingerprint,
          buildRecipeFingerprint: prepared.buildRecipeFingerprint,
          executableFingerprint: prepared.executableFingerprint,
        },
      });
    }
  } finally {
    for (const prepared of preparedTargets.values()) await prepared.cleanup();
  }
  const delta = createImplementationDelta(plan, runId, runs);
  const files = await (options.writeDelta ?? writeAblationDeltaReport)(delta, {
    outputRoot: options.outputRoot,
  });
  return {
    outcome: delta.outcome,
    runId,
    executionOrder: executionOrder.map((variant) => variant.id),
    runs,
    delta,
    files,
  };
}

export function createImplementationAblationDryRun(planInput, selection) {
  const plan = validateAblationPlan(planInput);
  if (plan.mode !== 'implementation') {
    throw implementationError('implementation dry-run requires an implementation ablation plan');
  }
  validateAblationQualityContract(plan, selection);
  return {
    ok: true,
    dryRun: true,
    schema: 'neko.agent-eval.ablation-dry-run',
    planId: plan.id,
    suiteId: plan.suiteId,
    caseId: plan.caseId,
    quality: plan.comparisonPolicy.quality,
    variants: plan.variants.map((variant) => {
      createVariantSelection(selection, plan, variant, {
        commit: variant.buildTarget.sourceCommit,
      });
      return {
        id: variant.id,
        role: variant.role,
        changes: variant.changes,
        skillIdentity: variant.skillIdentity,
        sourceCommit: variant.buildTarget.sourceCommit,
        repetitions: plan.repetitions,
      };
    }),
  };
}

function createImplementationDelta(plan, runId, runs) {
  const baselineRun = runs.find(({ variant }) => variant.id === plan.baselineVariantId);
  if (!baselineRun) throw implementationError('implementation ablation baseline run is missing');
  const baselineSummary = summarizeRun(baselineRun, plan.comparisonPolicy.quality);
  const baselineConfiguration = effectiveConfigurationEvidence(baselineRun.run);
  const variants = plan.variants.map((variant) => {
    const entry = requireVariantRun(runs, variant.id);
    const summary = summarizeRun(entry, plan.comparisonPolicy.quality);
    const diagnostics = compareRunPolicies(baselineRun.run, entry.run, {
      allowDifferences: ['target identity', 'skill policy'],
    });
    const configuration = effectiveConfigurationEvidence(entry.run);
    if (configuration.status === 'missing') {
      diagnostics.push(...configuration.diagnostics);
    } else if (baselineConfiguration.status === 'missing') {
      diagnostics.push(...baselineConfiguration.diagnostics);
    } else if (!sameValues(baselineConfiguration.digests, configuration.digests)) {
      diagnostics.push('effective runtime configuration differs');
    }
    if (
      entry.variant.role === 'variant' &&
      entry.buildIdentity.executableFingerprint === baselineRun.buildIdentity.executableFingerprint
    ) {
      diagnostics.push('isolated executable fingerprint did not change from baseline');
    }
    return {
      ...summary,
      comparable: diagnostics.length === 0,
      comparabilityDiagnostics: diagnostics,
      ...(entry.variant.role === 'variant'
        ? { deltaFromBaseline: metricDelta(baselineSummary.metrics, summary.metrics) }
        : {}),
    };
  });
  return validateAblationDelta({
    schema: ABLATION_SCHEMAS.delta,
    id: `delta-${runId}`,
    planId: plan.id,
    runId,
    mode: plan.mode,
    suiteId: plan.suiteId,
    caseId: plan.caseId,
    baselineVariantId: plan.baselineVariantId,
    outcome: aggregateOutcome(variants),
    variants,
    residualRisk: [
      'Build identity is external Evaluation evidence and is intentionally absent from Desktop runtime facts and blind Judge input.',
      'Ablation deltas remain descriptive; provider variance requires repeated independent runs.',
    ],
  });
}

function requireVariantRun(runs, variantId) {
  const entry = runs.find(({ variant }) => variant.id === variantId);
  if (!entry) throw implementationError(`implementation ablation run is missing ${variantId}`);
  return entry;
}

async function resolveSelection(plan, options) {
  const discovered = options.discovered ?? (await discoverSuites());
  return selectSuiteCases(discovered, { suiteId: plan.suiteId, caseId: plan.caseId })[0];
}

function createVariantSelection(selection, plan, variant, prepared) {
  if (selection.suite.target.kind !== 'skill') {
    throw implementationError('Skill implementation ablation requires a Skill-owned suite');
  }
  const assertions = selection.scenario.assertions.map((assertion) =>
    assertion.kind === 'skill' ? { ...assertion, identity: variant.skillIdentity } : assertion,
  );
  if (!assertions.some((assertion) => assertion.kind === 'skill')) {
    throw implementationError('Skill implementation ablation requires a Skill hard gate');
  }
  return {
    ...selection,
    suite: {
      ...selection.suite,
      target: { kind: 'skill', identity: variant.skillIdentity },
    },
    scenario: {
      ...selection.scenario,
      assertions,
      budget: { ...selection.scenario.budget, repetitions: plan.repetitions },
    },
  };
}

function summarizeRun(entry, qualityPolicy) {
  const { variant, run, buildIdentity } = entry;
  if (!run.aggregate || !Array.isArray(run.samples)) {
    throw implementationError(`variant ${variant.id} did not return repeated Evaluation evidence`);
  }
  for (const sample of run.samples) {
    if (
      sample.result.target.kind !== 'skill' ||
      !sameValues(sample.result.target.identity, variant.skillIdentity)
    ) {
      throw implementationError(`variant ${variant.id} report lost its Host Skill identity`);
    }
  }
  return {
    id: variant.id,
    role: variant.role,
    outcome: run.outcome,
    reportIds: run.samples.map((sample) => sample.reportId),
    executionIdentity: {
      kind: 'implementation',
      ...buildIdentity,
      skillIdentity: variant.skillIdentity,
    },
    metrics: projectAggregateMetrics(run.aggregate, qualityPolicy, run.samples),
  };
}

function effectiveConfigurationEvidence(run) {
  const identities = run.samples.map((sample) => sample.result.effectiveConfiguration);
  const digests = identities
    .map((identity) => identity?.digest)
    .filter((digest) => typeof digest === 'string');
  if (digests.length === identities.length) return { status: 'observed', digests };
  const diagnostics = identities
    .filter((identity) => typeof identity?.digest !== 'string')
    .map(
      (identity) =>
        identity?.diagnostic ??
        'implementation variant is missing effective configuration evidence',
    );
  return { status: 'missing', diagnostics: [...new Set(diagnostics)] };
}

function implementationError(message) {
  return Object.assign(new Error(message), { code: 'configuration-invalid' });
}

function randomize(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

function buildCacheKey(target) {
  return JSON.stringify({
    sourceFingerprint: target.sourceFingerprint,
    buildRecipeFingerprint: target.buildRecipeFingerprint,
    executablePath: target.executablePath,
    patchFingerprint: target.patchFingerprint,
  });
}
