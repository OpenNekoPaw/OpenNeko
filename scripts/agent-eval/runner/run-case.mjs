import { resolve } from 'node:path';
import { runAutomatedDesktopFunctional } from '../../desktop-functional/runner.mjs';
import { assertDesktopEvidenceSupport } from '../desktop/evidence.mjs';
import { createAggregateReport, writeAggregateReport } from '../reports/aggregate-report.mjs';
import { validateScenarioForExecution } from '../schemas/contracts.mjs';
import { runEvaluationPipeline } from './evaluation-pipeline.mjs';
import { annotateEvaluationError } from './outcomes.mjs';

export async function runCase(selection, options = {}) {
  if (!selection) throw configurationError('Desktop Agent Evaluation selection is required.');
  const executionCase = resolveExecutionCase(selection);
  assertDesktopEvidenceSupport(executionCase.assertions);
  const windowMode = resolveWindowMode(executionCase, options.windowMode);
  const authorization = readProviderAuthorization(options.providerAuthorization, options.env ?? {});
  assertAuthorizedModelProfiles(executionCase.modelProfiles, authorization);
  const runDesktop = options.runDesktop ?? runAutomatedDesktopFunctional;
  const scenarioFactory = options.createScenario;
  if (scenarioFactory === undefined) {
    throw infrastructureBlocker(
      'Desktop Agent Evaluation requires the canonical DSH composer/Conversation/approval driver; the retired Pi driver is disconnected.',
    );
  }
  const scenario = scenarioFactory(executionCase, authorization);
  const runId = options.runId ?? `${executionCase.caseId}-${Date.now().toString(36)}`;
  const outputRoot = resolve(options.outputRoot ?? 'reports/agent-eval');
  const startedAt = Date.now();
  let execution;
  try {
    execution = await runDesktop({
      scenario,
      target: options.target ?? 'development',
      windowMode,
      reportPath: resolve(outputRoot, runId, 'desktop-functional.json'),
      scenarioTimeoutMs: executionCase.budget.timeoutMs,
      executablePath: options.executablePath,
      executableFingerprint: options.executableFingerprint,
    });
  } catch (error) {
    throw annotateEvaluationError(error, {
      code: 'infrastructure-fail',
      phase: 'execution',
      executionIdentityCreated: true,
    });
  }
  const pipeline = await (options.runPipeline ?? runEvaluationPipeline)(
    {
      selection,
      executionCase,
      authorization,
      desktopEvidence: execution.report.evidence,
      desktopReportPath: execution.reportPath,
      runId,
      reportId: options.reportId,
      latencyMs: Date.now() - startedAt,
    },
    {
      outputRoot,
      env: options.env ?? {},
      fetch: options.fetch,
      callJudgeProvider: options.callJudgeProvider,
      judgeTargetVisibility: options.judgeTargetVisibility,
      command: options.command,
      residualRisk: options.residualRisk,
      writeReport: options.writeReport,
      runJudge: options.runJudge,
      compareBaseline: options.compareBaseline,
    },
  );
  return {
    ...pipeline,
    desktopReportPath: execution.reportPath,
    desktopReportLocation: `${runId}/desktop-functional.json`,
  };
}

function resolveWindowMode(executionCase, explicitMode) {
  const evidenceLevel = executionCase.execution?.evidenceLevel ?? 'hidden-desktop';
  if (evidenceLevel === 'key-free') {
    throw configurationError(
      `Desktop Agent case ${executionCase.caseId} is key-free and cannot run as real Desktop evidence.`,
    );
  }
  const requiredMode = evidenceLevel === 'visible-desktop' ? 'visible' : 'hidden';
  if (explicitMode !== undefined && explicitMode !== requiredMode) {
    throw configurationError(
      `Desktop Agent case ${executionCase.caseId} requires ${requiredMode} window mode.`,
    );
  }
  return requiredMode;
}

export async function runCaseRepeated(selection, options = {}) {
  const executionCase = resolveExecutionCase(selection);
  assertDesktopEvidenceSupport(executionCase.assertions);
  const repetitions = executionCase.budget.repetitions;
  const caseRunId = options.runId ?? `${executionCase.caseId}-${Date.now().toString(36)}`;
  const width = String(repetitions).length;
  const runSample = options.runSample ?? runCase;
  const samples = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const sampleRunId = `${caseRunId}-r${String(repetition).padStart(width, '0')}`;
    samples.push(
      await runSample(selection, {
        ...options,
        runId: sampleRunId,
        reportId: sampleRunId,
      }),
    );
  }
  const aggregate = createAggregateReport({
    reportId: caseRunId,
    selection,
    repetitions,
    samples,
  });
  const aggregateFile = await (options.writeAggregate ?? writeAggregateReport)(aggregate, {
    outputRoot: options.outputRoot,
  });
  return {
    outcome: aggregate.outcome,
    reportId: caseRunId,
    repetitions,
    samples,
    aggregate,
    aggregateFile,
  };
}

export function createDryRun(selection) {
  const executionCase = resolveExecutionCase(selection);
  return {
    ok: true,
    dryRun: true,
    schema: 'neko.agent-eval.dry-run',
    suiteId: executionCase.suiteId,
    caseId: executionCase.caseId,
    target: executionCase.target,
    caseGroup: executionCase.caseGroup,
    fixture: executionCase.fixture,
    runtimeProfile: executionCase.runtimeProfile,
    modelProfiles: executionCase.modelProfiles,
    steps: executionCase.steps,
    assertions: executionCase.assertions,
    reportPolicy: executionCase.reportPolicy,
  };
}

export function resolveExecutionCase(selection) {
  if (!selection?.suite || !selection?.scenario) {
    throw configurationError('Desktop Agent Evaluation suite and scenario are required.');
  }
  try {
    validateScenarioForExecution(selection.scenario);
  } catch (error) {
    throw configurationError(
      `Desktop Agent Evaluation scenario is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const unsupportedStep = selection.scenario.steps.find(
    (step) => !DESKTOP_WORKFLOW_STEP_KINDS.has(step.kind),
  );
  if (unsupportedStep) {
    throw configurationError(
      `Desktop Agent workflow step '${unsupportedStep.kind}' is not supported by the Desktop execution boundary.`,
    );
  }
  const fixture = readSingleFixture(selection.suite, selection.scenario);
  const runtimeProfile = readProfile(
    selection.suite.runtimeProfiles,
    selection.scenario.runtimeProfileId,
    'runtime',
  );
  const modelProfiles = selection.scenario.modelProfileIds.map((id) =>
    readProfile(selection.suite.modelProfiles, id, 'model'),
  );
  return deepFreeze(
    globalThis.structuredClone({
      schema: 'neko.agent-eval.execution-case',
      suiteId: selection.suite.id,
      caseId: selection.scenario.id,
      target: selection.suite.target,
      caseGroup: selection.scenario.caseGroup,
      fixture,
      runtimeProfile,
      modelProfiles,
      steps: selection.scenario.steps,
      assertions: selection.scenario.assertions,
      artifactChecks: selection.scenario.artifactChecks,
      evidenceContract: selection.scenario.evidenceContract,
      budget: selection.scenario.budget,
      reportPolicy: selection.suite.reportPolicy,
      execution: selection.scenario.execution,
    }),
  );
}

const DESKTOP_WORKFLOW_STEP_KINDS = new Set([
  'draft-bind',
  'draft-submit',
  'submit',
  'queue',
  'send-queued-now',
  'wait-for-idle',
  'cancel',
  'confirm',
  'resume',
  'restart',
  'feedback',
  'update-configuration',
  'invoke-input',
]);

function readSingleFixture(suite, scenario) {
  if (scenario.fixtureRefs.length !== 1) {
    throw configurationError('M1 runner requires exactly one isolated fixture per case');
  }
  return readProfile(suite.fixtures, scenario.fixtureRefs[0], 'fixture');
}

function readProfile(items, id, label) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw configurationError(`${label} ${id} is not declared by the suite`);
  return item;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function configurationError(message) {
  const error = new Error(message);
  error.code = 'configuration-invalid';
  return error;
}

function readProviderAuthorization(explicit, env) {
  const input =
    explicit ??
    (env.OPENNEKO_AGENT_EVAL_PROVIDER_ID ||
    env.OPENNEKO_AGENT_EVAL_MODEL_ID ||
    env.OPENNEKO_AGENT_EVAL_MODEL_IDS ||
    env.OPENNEKO_AGENT_EVAL_COST_APPROVED
      ? {
          providerId: env.OPENNEKO_AGENT_EVAL_PROVIDER_ID,
          modelId: env.OPENNEKO_AGENT_EVAL_MODEL_ID,
          modelIds: parseAuthorizedModelIds(env.OPENNEKO_AGENT_EVAL_MODEL_IDS),
          configurationFile: env.OPENNEKO_AGENT_EVAL_CONFIG_PATH,
          costApproved: env.OPENNEKO_AGENT_EVAL_COST_APPROVED === 'true',
        }
      : undefined);
  if (!input) {
    throw infrastructureBlocker(
      'Real Desktop Agent evaluation requires explicit provider, model and cost authorization.',
    );
  }
  for (const [label, value] of [
    ['provider', input.providerId],
    ['model', input.modelId],
    ['configuration file', input.configurationFile],
  ]) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw infrastructureBlocker(`Desktop Agent ${label} authorization is missing.`);
    }
  }
  if (input.costApproved !== true) {
    throw infrastructureBlocker('Desktop Agent provider cost authorization is not approved.');
  }
  return Object.freeze({
    providerId: input.providerId,
    modelId: input.modelId,
    modelIds: Object.freeze(normalizeAuthorizedModelIds(input.modelId, input.modelIds)),
    configurationFile: resolve(input.configurationFile),
    costApproved: true,
  });
}

function infrastructureBlocker(message) {
  return Object.assign(new Error(message), { code: 'infrastructure-blocked' });
}

function assertAuthorizedModelProfiles(profiles, authorization) {
  const unapproved = profiles.filter(
    (profile) =>
      profile.selection === 'explicit' &&
      (profile.chat.providerId !== authorization.providerId ||
        !authorization.modelIds.includes(profile.chat.modelId)),
  );
  if (unapproved.length > 0) {
    throw infrastructureBlocker(
      `Desktop Agent case requires additional explicit provider/model authorization: ${unapproved
        .map((profile) => `${profile.chat.providerId}/${profile.chat.modelId}`)
        .join(', ')}.`,
    );
  }
}

function parseAuthorizedModelIds(value) {
  if (value === undefined) return undefined;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAuthorizedModelIds(primaryModelId, modelIds) {
  if (modelIds !== undefined && !Array.isArray(modelIds)) {
    throw infrastructureBlocker('Desktop Agent authorized model identities must be an array.');
  }
  const identities = [primaryModelId, ...(modelIds ?? [])];
  if (identities.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw infrastructureBlocker('Desktop Agent authorized model identity is missing.');
  }
  return [...new Set(identities)];
}
