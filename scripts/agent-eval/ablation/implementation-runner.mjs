import { runV2Case } from '../runner/run-v2-case.mjs';
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
  for (const variant of plan.variants) {
    let prepared;
    try {
      prepared = await (options.prepareBuild ?? prepareIsolatedBuildTarget)(variant.buildTarget, {
        repositoryRoot: options.repositoryRoot,
        workspaceParent: options.workspaceParent,
        env: options.env,
      });
      const variantSelection = createVariantSelection(selection, plan, variant, prepared);
      const run = await (options.runCase ?? runV2Case)(variantSelection, {
        ...(options.caseOptions ?? {}),
        runId: `${runId}-${variant.id}`,
        outputRoot: options.outputRoot,
        env: options.env,
        cwd: prepared.workspace,
        debugCommand: prepared.launch.command,
        debugCommandArgsPrefix: prepared.launch.args,
        judgeTargetVisibility: 'identity-only',
      });
      runs.push({
        variant,
        run,
        buildIdentity: {
          sourceRevision: prepared.revision,
          sourceFingerprint: prepared.sourceFingerprint,
          buildRecipeFingerprint: prepared.buildRecipeFingerprint,
          executableFingerprint: prepared.executableFingerprint,
        },
      });
    } finally {
      await prepared?.cleanup();
    }
  }
  const delta = createImplementationDelta(plan, runId, runs);
  const files = await (options.writeDelta ?? writeAblationDeltaReport)(delta, {
    outputRoot: options.outputRoot,
  });
  return { outcome: delta.outcome, runId, runs, delta, files };
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
    schema: 'neko.agent-eval.ablation-dry-run.v1',
    planId: plan.id,
    suiteId: plan.suiteId,
    caseId: plan.caseId,
    quality: plan.comparisonPolicy.quality,
    variants: plan.variants.map((variant) => {
      createVariantSelection(selection, plan, variant, {
        revision: variant.buildTarget.sourceRevision,
      });
      return {
        id: variant.id,
        role: variant.role,
        changes: variant.changes,
        skillIdentity: variant.skillIdentity,
        sourceRevision: variant.buildTarget.sourceRevision,
        repetitions: plan.repetitions,
      };
    }),
  };
}

export function createImplementationDelta(plan, runId, runs) {
  const baselineRun = runs.find(({ variant }) => variant.id === plan.baselineVariantId);
  if (!baselineRun) throw implementationError('implementation ablation baseline run is missing');
  const baselineSummary = summarizeRun(baselineRun, plan.comparisonPolicy.quality);
  const baselineConfiguration = effectiveConfigurationEvidence(baselineRun.run);
  const variants = runs.map((entry) => {
    const summary = summarizeRun(entry, plan.comparisonPolicy.quality);
    const diagnostics = compareRunPolicies(baselineRun.run, entry.run, {
      allowDifferences: ['target identity', 'repository revision'],
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
      'Build identity is external Evaluation evidence and is intentionally absent from TUI facts and blind Judge input.',
      'Ablation deltas remain descriptive; provider variance requires repeated independent runs.',
    ],
  });
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
      repositoryRevision: prepared.revision,
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
    metrics: projectAggregateMetrics(
      run.aggregate,
      qualityPolicy,
      run.samples,
    ),
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
