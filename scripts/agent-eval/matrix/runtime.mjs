import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCase } from '../runner/run-case.mjs';
import { assertShareableEvidence } from '../schemas/evidence-policy.mjs';

const RESOURCE_CLASSES = Object.freeze(['text', 'external-tool', 'media', 'visible-ui']);
const OUTCOME_PRECEDENCE = Object.freeze([
  'configuration-invalid',
  'infrastructure-fail',
  'infrastructure-blocked',
  'case-fail',
  'non-comparable',
  'pass',
]);

export async function createMatrixPlan(selections, options = {}) {
  if (!Array.isArray(selections) || selections.length === 0) {
    throw configurationError('Evaluation matrix requires at least one selected case.');
  }
  const matrixId = requireId(options.matrixId, 'matrix');
  const strategy = options.strategy ?? 'focused';
  if (!['focused', 'matrix'].includes(strategy)) {
    throw configurationError(`Evaluation matrix strategy is unsupported: ${strategy}`);
  }
  const evidenceLevel = options.evidenceLevel ?? 'hidden-desktop';
  if (!['key-free', 'hidden-desktop', 'visible-desktop'].includes(evidenceLevel)) {
    throw configurationError(`Evaluation evidence level is unsupported: ${evidenceLevel}`);
  }
  const shard = validateShard(options.shard ?? { index: 0, count: 1 });
  const build = await resolveDesktopBuildTarget(options.build, { strategy, evidenceLevel });
  const budgets = validateBudgets(options.budgets ?? {});
  const limits = validateLimits(options.limits ?? {});
  const descriptors = [];
  for (const selection of selections) {
    assertSelection(selection);
    const repetitions = options.repetitions ?? selection.scenario.budget.repetitions;
    if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
      throw configurationError('Evaluation matrix repetitions must be an integer in 1..100.');
    }
    const scenarioExecution = selection.scenario.execution;
    const sampleEvidence = scenarioExecution?.evidenceLevel ?? evidenceLevel;
    if (sampleEvidence === 'visible-desktop' && evidenceLevel !== 'visible-desktop') {
      throw configurationError(
        `Scenario ${selection.scenario.id} requires visible Desktop evidence.`,
      );
    }
    for (const modelProfileId of selection.scenario.modelProfileIds) {
      if (!selection.suite.modelProfiles.some((profile) => profile.id === modelProfileId)) {
        throw configurationError(`Unknown model profile ${modelProfileId}.`);
      }
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        const identity = {
          matrixId,
          suiteId: selection.suite.id,
          caseId: selection.scenario.id,
          runtimeProfileId: selection.scenario.runtimeProfileId,
          modelProfileId,
          buildId: build.id,
          buildFingerprint: build.fingerprint,
          repetition,
          evidenceLevel: sampleEvidence,
        };
        const sampleId = `sample-${digest(identity).slice(7, 31)}`;
        descriptors.push({
          sampleId,
          identity,
          resourceClass: scenarioExecution?.resourceClass ?? inferResourceClass(selection),
          selection: selectionForSample(selection, modelProfileId),
        });
      }
    }
  }
  descriptors.sort((left, right) =>
    stableStringify(left.identity).localeCompare(stableStringify(right.identity)),
  );
  assertUnique(
    descriptors.map((sample) => sample.sampleId),
    'matrix sample identities',
  );
  const policyDigest = digest({
    matrixId,
    strategy,
    evidenceLevel,
    build,
    budgets,
    limits,
    samples: descriptors.map((sample) => sample.identity),
  });
  const samples = descriptors.filter(
    (sample) => shardIndex(sample.sampleId, shard.count) === shard.index,
  );
  return deepFreeze(
    globalThis.structuredClone({
      schema: 'neko.agent-eval.matrix-plan',
      matrixId,
      strategy,
      evidenceLevel,
      policyDigest,
      build,
      budgets,
      limits,
      shard,
      allSampleIds: descriptors.map((sample) => sample.sampleId),
      samples,
    }),
  );
}

export async function executeMatrixPlan(plan, options = {}) {
  validatePlan(plan);
  const runSample = options.runSample ?? runCase;
  const startedAt = (options.now ?? Date.now)();
  const ledger = createBudgetLedger(plan.budgets, startedAt, options.now ?? Date.now);
  const desktop = new Semaphore(plan.limits.desktop);
  const provider = new Semaphore(plan.limits.provider);
  const resources = Object.fromEntries(
    RESOURCE_CLASSES.map((kind) => [kind, new Semaphore(plan.limits[kind])]),
  );
  const results = await Promise.all(
    plan.samples.map(async (sample) => {
      return desktop.run(() => {
        const admission = ledger.admit(sample);
        if (!admission.allowed) return budgetSkipped(sample, admission.reason);
        return provider.run(() =>
          resources[sample.resourceClass].run(() =>
            executeSampleAttempts(sample, plan, runSample, ledger, options),
          ),
        );
      });
    }),
  );
  const outcome = classifyOutcomes(results.map((result) => result.outcome));
  return {
    schema: 'neko.agent-eval.matrix-shard-result',
    matrixId: plan.matrixId,
    policyDigest: plan.policyDigest,
    shard: plan.shard,
    outcome,
    samples: results,
    scheduling: {
      limits: plan.limits,
      elapsedMs: Math.max(0, (options.now ?? Date.now)() - startedAt),
      budget: ledger.snapshot(),
    },
  };
}

export function aggregateMatrixShards(plan, shards) {
  validatePlan(plan);
  const diagnostics = [];
  const indexes = shards.map((item) => item.shard?.index);
  const expectedIndexes = Array.from({ length: plan.shard.count }, (_, index) => index);
  for (const index of expectedIndexes) {
    if (!indexes.includes(index)) diagnostics.push(`missing shard ${index}`);
  }
  const duplicateIndexes = indexes.filter((value, index) => indexes.indexOf(value) !== index);
  if (duplicateIndexes.length > 0) {
    diagnostics.push(`duplicate shard(s): ${[...new Set(duplicateIndexes)].join(',')}`);
  }
  for (const shard of shards) {
    if (shard.matrixId !== plan.matrixId) diagnostics.push('matrix identity drift');
    if (shard.policyDigest !== plan.policyDigest) diagnostics.push('matrix policy drift');
    try {
      assertShareableEvidence(shard, 'matrix-shard');
    } catch (error) {
      diagnostics.push(`unshareable shard evidence: ${formatError(error)}`);
    }
  }
  const samples = shards.flatMap((shard) => shard.samples ?? []);
  const sampleIds = samples.map((sample) => sample.sampleId);
  const duplicates = sampleIds.filter((value, index) => sampleIds.indexOf(value) !== index);
  if (duplicates.length > 0) {
    diagnostics.push(`duplicate sample(s): ${[...new Set(duplicates)].join(',')}`);
  }
  const missing = plan.allSampleIds.filter((id) => !sampleIds.includes(id));
  const unexpected = sampleIds.filter((id) => !plan.allSampleIds.includes(id));
  if (missing.length > 0) diagnostics.push(`missing sample(s): ${missing.join(',')}`);
  if (unexpected.length > 0) diagnostics.push(`unexpected sample(s): ${unexpected.join(',')}`);
  return {
    schema: 'neko.agent-eval.matrix-aggregate',
    matrixId: plan.matrixId,
    policyDigest: plan.policyDigest,
    outcome:
      diagnostics.length > 0
        ? 'non-comparable'
        : classifyOutcomes(samples.map((sample) => sample.outcome)),
    comparable: diagnostics.length === 0,
    diagnostics,
    sampleIds,
    counts: countOutcomes(samples),
  };
}

export function assertConcurrentSampleIsolation(samples) {
  const fields = [
    'applicationInstanceId',
    'fixtureId',
    'userDataId',
    'workspaceId',
    'settingsStoreId',
    'credentialScopeId',
    'piSessionId',
    'conversationId',
    'controlPort',
    'reportId',
  ];
  for (const field of fields) {
    const values = samples.map((sample) => sample.isolation?.[field]);
    if (values.some((value) => value === undefined) || new Set(values).size !== values.length) {
      throw new Error(`Concurrent Desktop samples do not isolate ${field}.`);
    }
  }
  if (samples.some((sample) => sample.isolation?.singleInstanceLock !== 'isolated')) {
    throw new Error('Concurrent Desktop samples did not isolate the single-instance lock.');
  }
  if (samples.some((sample) => sample.isolation?.cleanupStatus !== 'complete')) {
    throw new Error('Concurrent Desktop sample cleanup is incomplete.');
  }
}

async function executeSampleAttempts(sample, plan, runSample, ledger, options) {
  const attempts = [];
  const maxAttempts = plan.budgets.infrastructureRetries + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const run = await runSample(sample.selection, {
        ...(options.caseOptions ?? {}),
        runId: sample.sampleId,
        reportId: sample.sampleId,
        target: plan.build.kind === 'packaged' ? 'packaged' : 'development',
        executablePath: plan.build.executablePath,
        executableFingerprint: plan.build.fingerprint,
        windowMode: sample.identity.evidenceLevel === 'visible-desktop' ? 'visible' : 'hidden',
      });
      const usage = run.result?.usage ?? {};
      ledger.record(usage);
      attempts.push({ attempt, status: 'completed', outcome: run.outcome, reportId: run.reportId });
      return {
        sampleId: sample.sampleId,
        identity: sample.identity,
        resourceClass: sample.resourceClass,
        outcome: run.outcome,
        attempts,
        run,
      };
    } catch (error) {
      const outcome = classifyError(error);
      const retryable = isPreTurnInfrastructureFailure(error) && attempt < maxAttempts;
      attempts.push({
        attempt,
        status: 'failed',
        outcome,
        diagnostic: formatError(error),
        retryable,
      });
      if (retryable) {
        const retryAdmission = ledger.admit(sample);
        if (retryAdmission.allowed) continue;
        attempts[attempts.length - 1].retryable = false;
        return {
          sampleId: sample.sampleId,
          identity: sample.identity,
          resourceClass: sample.resourceClass,
          outcome: 'infrastructure-blocked',
          attempts,
          skipped: true,
          residualCoverage: retryAdmission.reason,
        };
      }
      return {
        sampleId: sample.sampleId,
        identity: sample.identity,
        resourceClass: sample.resourceClass,
        outcome,
        attempts,
      };
    }
  }
  throw new Error('Evaluation sample attempt loop reached an impossible state.');
}

async function resolveDesktopBuildTarget(input, context) {
  const value = input ?? {
    id: context.strategy === 'matrix' ? 'packaged-required' : 'development',
    kind: context.strategy === 'matrix' ? 'packaged' : 'development',
  };
  if (!value || !['development', 'packaged'].includes(value.kind)) {
    throw configurationError('Evaluation Desktop build target is invalid.');
  }
  if (context.strategy === 'matrix' && value.kind !== 'packaged') {
    throw configurationError(
      'Matrix execution requires one fingerprinted packaged Desktop target.',
    );
  }
  if (value.kind === 'development') {
    return { id: requireId(value.id, 'build'), kind: 'development', fingerprint: 'development' };
  }
  if (typeof value.executablePath !== 'string' || typeof value.fingerprint !== 'string') {
    throw configurationError('Packaged Desktop target requires executablePath and fingerprint.');
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(value.fingerprint)) {
    throw configurationError('Packaged Desktop target fingerprint is invalid.');
  }
  if (optionsLikeKeyFree(context.evidenceLevel)) {
    return {
      id: requireId(value.id, 'build'),
      kind: 'packaged',
      executablePath: value.executablePath,
      fingerprint: value.fingerprint,
    };
  }
  const file = resolve(value.executablePath);
  const bytes = await fs.readFile(file).catch((error) => {
    throw infrastructureError(`Packaged Desktop executable is unavailable: ${formatError(error)}`);
  });
  const observed = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (observed !== value.fingerprint) {
    throw configurationError('Packaged Desktop executable fingerprint does not match.');
  }
  return {
    id: requireId(value.id, 'build'),
    kind: 'packaged',
    executablePath: file,
    fingerprint: observed,
  };
}

function createBudgetLedger(budget, startedAt, now) {
  let providerRequests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  return {
    admit() {
      const elapsed = now() - startedAt;
      if (elapsed >= budget.timeoutMs) return { allowed: false, reason: 'time-budget-exhausted' };
      if (providerRequests >= budget.maxProviderRequests) {
        return { allowed: false, reason: 'provider-quota-exhausted' };
      }
      if (inputTokens + outputTokens >= budget.maxTokens) {
        return { allowed: false, reason: 'token-budget-exhausted' };
      }
      if (costUsd >= budget.maxCostUsd) return { allowed: false, reason: 'cost-budget-exhausted' };
      providerRequests += 1;
      return { allowed: true };
    },
    record(usage) {
      inputTokens += usage.inputTokens ?? 0;
      outputTokens += usage.outputTokens ?? 0;
      costUsd += usage.costUsd ?? 0;
    },
    snapshot() {
      return { providerRequests, inputTokens, outputTokens, costUsd };
    },
  };
}

class Semaphore {
  #available;
  #waiters = [];
  constructor(limit) {
    this.#available = limit;
  }
  async run(operation) {
    await this.#acquire();
    try {
      return await operation();
    } finally {
      this.#release();
    }
  }
  async #acquire() {
    if (this.#available > 0) {
      this.#available -= 1;
      return;
    }
    await new Promise((resolveWaiter) => this.#waiters.push(resolveWaiter));
  }
  #release() {
    const waiter = this.#waiters.shift();
    if (waiter) waiter();
    else this.#available += 1;
  }
}

function validatePlan(plan) {
  if (plan?.schema !== 'neko.agent-eval.matrix-plan' || !Object.isFrozen(plan)) {
    throw configurationError('Evaluation matrix plan is invalid or mutable.');
  }
}

function assertSelection(selection) {
  if (!selection?.suite?.id || !selection?.scenario?.id) {
    throw configurationError('Evaluation matrix selection is incomplete.');
  }
  if (selection.scenario.suiteId !== selection.suite.id) {
    throw configurationError('Evaluation matrix suite/case identity is mismatched.');
  }
  if (!selection.suite.runtimeProfiles.some((p) => p.id === selection.scenario.runtimeProfileId)) {
    throw configurationError(`Unknown runtime profile ${selection.scenario.runtimeProfileId}.`);
  }
  const execution = selection.scenario.execution;
  if (
    execution?.evidenceLevel !== undefined &&
    !['key-free', 'hidden-desktop', 'visible-desktop'].includes(execution.evidenceLevel)
  ) {
    throw configurationError('Scenario evidence level is unsupported.');
  }
  if (
    execution?.resourceClass !== undefined &&
    !RESOURCE_CLASSES.includes(execution.resourceClass)
  ) {
    throw configurationError('Scenario resource class is unsupported.');
  }
}

function selectionForSample(selection, modelProfileId) {
  return {
    ...selection,
    scenario: {
      ...selection.scenario,
      modelProfileIds: [modelProfileId],
      budget: { ...selection.scenario.budget, repetitions: 1 },
    },
  };
}

function inferResourceClass(selection) {
  if (selection.scenario.assertions.some((item) => item.kind === 'resource-display-projection')) {
    return 'media';
  }
  if (
    selection.scenario.assertions.some((item) =>
      ['tool-call', 'automation-tool-result'].includes(item.kind),
    )
  ) {
    return 'external-tool';
  }
  return 'text';
}

function validateShard(shard) {
  if (
    !Number.isInteger(shard.index) ||
    !Number.isInteger(shard.count) ||
    shard.count < 1 ||
    shard.index < 0 ||
    shard.index >= shard.count
  ) {
    throw configurationError('Evaluation matrix shard index/count is invalid.');
  }
  return { index: shard.index, count: shard.count };
}

function validateBudgets(value) {
  const result = {
    timeoutMs: value.timeoutMs ?? 3_600_000,
    maxTokens: value.maxTokens ?? 1_000_000,
    maxCostUsd: value.maxCostUsd ?? 100,
    maxProviderRequests: value.maxProviderRequests ?? 1_000,
    infrastructureRetries: value.infrastructureRetries ?? 0,
  };
  if (
    !Number.isInteger(result.timeoutMs) ||
    result.timeoutMs < 1 ||
    !Number.isInteger(result.maxTokens) ||
    result.maxTokens < 1 ||
    typeof result.maxCostUsd !== 'number' ||
    result.maxCostUsd < 0 ||
    !Number.isInteger(result.maxProviderRequests) ||
    result.maxProviderRequests < 1 ||
    !Number.isInteger(result.infrastructureRetries) ||
    result.infrastructureRetries < 0 ||
    result.infrastructureRetries > 3
  ) {
    throw configurationError('Evaluation matrix budgets are invalid.');
  }
  return result;
}

function validateLimits(value) {
  const result = {
    capacitySource: value.capacitySource ?? 'conservative-local-defaults',
    desktop: value.desktop ?? 2,
    provider: value.provider ?? 2,
    text: value.text ?? 2,
    'external-tool': value['external-tool'] ?? 1,
    media: value.media ?? 1,
    'visible-ui': value['visible-ui'] ?? 1,
  };
  for (const key of ['desktop', 'provider', ...RESOURCE_CLASSES]) {
    if (!Number.isInteger(result[key]) || result[key] < 1 || result[key] > 32) {
      throw configurationError(`Evaluation matrix concurrency limit '${key}' is invalid.`);
    }
  }
  return result;
}

function budgetSkipped(sample, reason) {
  return {
    sampleId: sample.sampleId,
    identity: sample.identity,
    resourceClass: sample.resourceClass,
    outcome: 'infrastructure-blocked',
    skipped: true,
    residualCoverage: reason,
    attempts: [],
  };
}

function classifyError(error) {
  const code = error?.code;
  if (code === 'configuration-invalid') return 'configuration-invalid';
  if (code === 'infrastructure-blocked') return 'infrastructure-blocked';
  if (code === 'case-fail') return 'case-fail';
  if (code === 'non-comparable') return 'non-comparable';
  return 'infrastructure-fail';
}

function isPreTurnInfrastructureFailure(error) {
  return (
    ['infrastructure-fail', 'infrastructure-blocked'].includes(classifyError(error)) &&
    error?.phase === 'pre-turn' &&
    error?.executionIdentityCreated === false
  );
}

function classifyOutcomes(outcomes) {
  return OUTCOME_PRECEDENCE.find((outcome) => outcomes.includes(outcome)) ?? 'pass';
}

function countOutcomes(samples) {
  return Object.fromEntries(
    OUTCOME_PRECEDENCE.map((outcome) => [
      outcome,
      samples.filter((sample) => sample.outcome === outcome).length,
    ]),
  );
}

function shardIndex(sampleId, count) {
  return Number.parseInt(digest(sampleId).slice(7, 15), 16) % count;
}

function requireId(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/u.test(value)) {
    throw configurationError(`Evaluation ${label} identity is invalid.`);
  }
  return value;
}

function optionsLikeKeyFree(evidenceLevel) {
  return evidenceLevel === 'key-free';
}

function digest(value) {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([key]) => key !== 'selection')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertUnique(values, label) {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw configurationError(`${label} must be unique; duplicate=${duplicate}`);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'configuration-invalid' });
}

function infrastructureError(message) {
  return Object.assign(new Error(message), {
    code: 'infrastructure-blocked',
    phase: 'pre-turn',
    executionIdentityCreated: false,
  });
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
