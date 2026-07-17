import { runV2Case } from '../runner/run-v2-case.mjs';
import { writeAblationDeltaReport } from '../reports/report-writer.mjs';
import {
  ABLATION_SCHEMAS,
  validateAblationDelta,
  validateAblationPlan,
  validateAblationQualityContract,
} from '../schemas/ablation-contracts.mjs';
import { discoverSuites, selectSuiteCases } from '../suites/discovery.mjs';
import {
  aggregateOutcome,
  compareRunPolicies,
  metricDelta,
  projectAggregateMetrics,
  sameValues,
} from './variant-delta.mjs';

export async function runConfigurationAblation(planInput, options = {}) {
  const plan = validateAblationPlan(planInput);
  if (plan.mode !== 'configuration') {
    throw configurationError('configuration runner requires a configuration ablation plan');
  }
  const selection = await resolveSelection(plan, options);
  validateAblationQualityContract(plan, selection);
  const runId = options.runId ?? `ablation-${Date.now().toString(36)}`;
  const runs = [];
  for (const variant of plan.variants) {
    const variantSelection = createVariantSelection(selection, plan, variant);
    const run = await (options.runCase ?? runV2Case)(variantSelection, {
      ...(options.caseOptions ?? {}),
      runId: `${runId}-${variant.id}`,
      outputRoot: options.outputRoot,
      env: options.env,
    });
    runs.push({ variant, run });
  }
  const delta = createConfigurationDelta(plan, runId, runs);
  const files = await (options.writeDelta ?? writeAblationDeltaReport)(delta, {
    outputRoot: options.outputRoot,
  });
  return { outcome: delta.outcome, runId, runs, delta, files };
}

export function createConfigurationAblationDryRun(planInput, selection) {
  const plan = validateAblationPlan(planInput);
  if (plan.mode !== 'configuration') {
    throw configurationError('configuration dry-run requires a configuration ablation plan');
  }
  validateAblationQualityContract(plan, selection);
  return {
    ok: true,
    dryRun: true,
    schema: 'neko.agent-eval.ablation-dry-run.v1',
    planId: plan.id,
    suiteId: plan.suiteId,
    caseId: plan.caseId,
    quality: plan.comparisonPolicy.quality,
    variants: plan.variants.map((variant) => {
      createVariantSelection(selection, plan, variant);
      return {
        id: variant.id,
        role: variant.role,
        changes: variant.changes,
        runtimeProfileId: variant.runtimeProfileId,
        modelProfileId: variant.modelProfileId,
        repetitions: plan.repetitions,
      };
    }),
  };
}

export function createConfigurationDelta(plan, runId, runs) {
  const baselineRun = runs.find(({ variant }) => variant.id === plan.baselineVariantId);
  if (!baselineRun) throw configurationError('configuration ablation baseline run is missing');
  const baselineSummary = summarizeRun(
    baselineRun.variant,
    baselineRun.run,
    plan.comparisonPolicy.quality,
  );
  const variants = runs.map(({ variant, run }) => {
    const summary = summarizeRun(variant, run, plan.comparisonPolicy.quality);
    const diagnostics = compareRunPolicies(baselineRun.run, run);
    if (
      variant.role === 'variant' &&
      variant.changes.length > 0 &&
      summary.executionIdentity.status === 'observed' &&
      baselineSummary.executionIdentity.status === 'observed' &&
      sameValues(
        summary.executionIdentity.effectiveDigests,
        baselineSummary.executionIdentity.effectiveDigests,
      )
    ) {
      diagnostics.push('effective configuration digest did not change from baseline');
    }
    if (summary.executionIdentity.status === 'missing') {
      diagnostics.push(...summary.executionIdentity.diagnostics);
    }
    return {
      ...summary,
      comparable: diagnostics.length === 0,
      comparabilityDiagnostics: diagnostics,
      ...(variant.role === 'variant'
        ? { deltaFromBaseline: metricDelta(baselineSummary.metrics, summary.metrics) }
        : {}),
    };
  });
  const outcome = aggregateOutcome(variants);
  return validateAblationDelta({
    schema: ABLATION_SCHEMAS.delta,
    id: `delta-${runId}`,
    planId: plan.id,
    runId,
    mode: plan.mode,
    suiteId: plan.suiteId,
    caseId: plan.caseId,
    baselineVariantId: plan.baselineVariantId,
    outcome,
    variants,
    residualRisk: [
      'Ablation deltas remain descriptive; provider variance requires repeated independent runs.',
      ...(plan.comparisonPolicy.quality.kind === 'hard-gates-only'
        ? ['No subjective quality rubric was applicable to this pilot.']
        : []),
    ],
  });
}

async function resolveSelection(plan, options) {
  const discovered = options.discovered ?? (await discoverSuites());
  return selectSuiteCases(discovered, { suiteId: plan.suiteId, caseId: plan.caseId })[0];
}

function createVariantSelection(selection, plan, variant) {
  const runtimeProfile = findProfile(
    selection.suite.runtimeProfiles,
    variant.runtimeProfileId,
    'runtime',
  );
  const modelProfile = findProfile(selection.suite.modelProfiles, variant.modelProfileId, 'model');
  if (runtimeProfile.configurationHash !== variant.expectedConfiguration.runtimeConfigurationHash) {
    throw configurationError(`variant ${variant.id} runtime profile hash does not match the suite`);
  }
  if (modelProfile.configurationHash !== variant.expectedConfiguration.modelConfigurationHash) {
    throw configurationError(`variant ${variant.id} model profile hash does not match the suite`);
  }
  return {
    ...selection,
    scenario: {
      ...selection.scenario,
      runtimeProfileId: variant.runtimeProfileId,
      modelProfileIds: [variant.modelProfileId],
      budget: { ...selection.scenario.budget, repetitions: plan.repetitions },
    },
  };
}

function summarizeRun(variant, run, qualityPolicy) {
  const aggregate = run.aggregate;
  if (!aggregate || !Array.isArray(run.samples)) {
    throw configurationError(`variant ${variant.id} did not return repeated Evaluation evidence`);
  }
  const effectiveIdentities = run.samples.map((sample) => {
    const identity = sample.result.effectiveConfiguration;
    if (
      identity.runtimeProfileId !== variant.runtimeProfileId ||
      identity.modelProfileId !== variant.modelProfileId
    ) {
      throw configurationError(
        `variant ${variant.id} is missing matching effective configuration evidence`,
      );
    }
    return identity;
  });
  const effectiveDigests = effectiveIdentities
    .map((identity) => identity.digest)
    .filter((digest) => typeof digest === 'string');
  const missingDiagnostics = effectiveIdentities
    .filter((identity) => typeof identity.digest !== 'string')
    .map((identity) => identity.diagnostic ?? 'effective configuration digest is missing');
  return {
    id: variant.id,
    role: variant.role,
    outcome: run.outcome,
    reportIds: run.samples.map((sample) => sample.reportId),
    executionIdentity: {
      kind: 'configuration',
      ...variant.expectedConfiguration,
      ...(effectiveDigests.length === effectiveIdentities.length
        ? { status: 'observed', effectiveDigests }
        : { status: 'missing', diagnostics: [...new Set(missingDiagnostics)] }),
    },
    metrics: projectAggregateMetrics(aggregate, qualityPolicy, run.samples),
  };
}

function findProfile(profiles, id, label) {
  const profile = profiles.find((candidate) => candidate.id === id);
  if (!profile) throw configurationError(`${label} profile ${id} is not declared by the suite`);
  return profile;
}

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'configuration-invalid' });
}
