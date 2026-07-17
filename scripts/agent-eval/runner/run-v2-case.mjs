import { spawn as nodeSpawn } from 'node:child_process';
import { prepareWorkspaceFixture } from '../fixtures/workspace-fixture.mjs';
import {
  createM1ReportDocuments,
  writeEvaluationReport,
  writeBaselineDiffReport,
  writeRepeatedRunReport,
} from '../reports/report-writer.mjs';
import {
  SCHEMAS,
  validateRepeatedRun,
  validateScenarioForExecution,
} from '../schemas/contracts.mjs';
import { createDebugResponseReader } from './debug-protocol-client.mjs';
import { classifyEvaluation, evaluateHardGates } from './hard-gates.mjs';
import { evaluateArtifactChecks } from './artifact-checks.mjs';
import { runTuiWorkflowController } from './workflow-controller.mjs';
import { createJudgeEvidenceProjection } from '../judge/evidence-projection.mjs';
import { classifyRubricJudge, runRubricJudge } from '../judge/rubric-judge.mjs';
import { compareWithBaseline, createCurrentBaselineDescriptor } from '../comparison/baseline.mjs';
import { createFailureAttribution } from '../reports/failure-attribution.mjs';
import { resolveTuiDebugLaunch } from './tui-debug-launch.mjs';

export async function runV2Case(selection, options = {}) {
  const repetitions = selection.scenario.budget.repetitions;
  if (repetitions === 1) return runV2Sample(selection, options);
  const runId = options.runId ?? createRunId();
  const sampleSelection = {
    ...selection,
    scenario: {
      ...selection.scenario,
      budget: { ...selection.scenario.budget, repetitions: 1 },
    },
  };
  const samples = [];
  for (let index = 0; index < repetitions; index += 1) {
    samples.push(
      await runV2Sample(sampleSelection, {
        ...options,
        runId: `${runId}-sample-${index + 1}`,
        sampleIndex: index,
        skipBaseline: true,
      }),
    );
  }
  let aggregate = createRepeatedRunAggregate(selection, runId, samples);
  let baselineDiff;
  if (selection.baseline) {
    baselineDiff = compareSelectionWithBaseline(selection, {
      runId,
      reportId: `report-${runId}`,
      fixtureDigest: samples[0].result.fixtureDigest,
      scoreDistribution: aggregate.scoreDistribution,
      currentReportIds: samples.map((sample) => sample.reportId),
    });
    aggregate = validateRepeatedRun({
      ...aggregate,
      outcome: comparisonOutcome(aggregate.outcome, baselineDiff),
    });
  }
  const files = {
    ...(await writeRepeatedRunReport(aggregate, { outputRoot: options.outputRoot })),
    ...(baselineDiff
      ? await writeBaselineDiffReport(
          baselineDiff,
          { suiteId: selection.suite.id, caseId: selection.scenario.id, runId },
          { outputRoot: options.outputRoot },
        )
      : {}),
  };
  return {
    outcome: aggregate.outcome,
    runId,
    samples,
    aggregate,
    files,
    ...(baselineDiff ? { baselineDiff } : {}),
  };
}

async function runV2Sample(selection, options = {}) {
  const { suite, scenario } = selection;
  validateScenarioForExecution(scenario);
  const fixture = readSingleFixture(suite, scenario);
  const runtimeProfile = readProfile(suite.runtimeProfiles, scenario.runtimeProfileId, 'runtime');
  const modelProfile = readProfile(suite.modelProfiles, scenario.modelProfileIds[0], 'model');
  if (scenario.modelProfileIds.length !== 1) {
    throw configurationError('M1 runner requires exactly one model profile per run');
  }
  const prepared = await prepareWorkspaceFixture(fixture);
  const runId = options.runId ?? createRunId();
  const reportId = `report-${runId}`;
  const startedAt = Date.now();
  let facts;
  let outcome;
  let executionError;
  let artifactCheckResults = [];
  let judgeResult;
  let judgeDiagnostic;
  try {
    const launch = resolveTuiDebugLaunch({
      debugCommand: options.debugCommand ?? options.env?.NEKO_DEBUG_COMMAND,
      debugCommandArgsPrefix: options.debugCommandArgsPrefix,
    });
    const commandArgs = [
      ...launch.argsPrefix,
      'debug',
      'automation',
      '--stdio',
      '-C',
      prepared.workspace,
    ];
    const child = (options.spawn ?? nodeSpawn)(launch.command, commandArgs, {
      cwd: options.cwd ?? process.cwd(),
      shell: launch.shell,
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    try {
      const driverInput = {
        sessionParams: createSessionParams(modelProfile, runtimeProfile),
        steps: scenario.steps,
        includeHistory: false,
      };
      facts = options.runDriver
        ? await options.runDriver({
            child,
            input: driverInput,
            sampleIndex: options.sampleIndex ?? 0,
          })
        : await runTuiWorkflowController(
            child,
            createDebugResponseReader(child.stdout),
            driverInput,
          );
      const configurationMismatch = validateEffectiveConfiguration(
        runtimeProfile,
        modelProfile,
        facts,
      );
      artifactCheckResults = await evaluateArtifactChecks(scenario.artifactChecks, {
        workspace: prepared.workspace,
        facts,
        ...(options.runValidator ? { runValidator: options.runValidator } : {}),
      });
      const hardGates = [
        ...evaluateHardGates(scenario.assertions, facts, {
          modelProfiles: suite.modelProfiles,
          outputSchemas: selection.outputSchemas,
        }),
        ...artifactCheckResults,
      ];
      outcome = configurationMismatch
        ? 'configuration-invalid'
        : classifyEvaluation({ hardGates }).outcome;
      if (configurationMismatch) executionError = configurationMismatch;
      if (!configurationMismatch && scenario.rubric && outcome === 'pass') {
        const rubric = selection.rubrics?.[scenario.rubric.ref];
        if (!rubric) throw configurationError(`rubric was not loaded: ${scenario.rubric.ref}`);
        const judgeProfile = readProfile(
          suite.judgeProfiles,
          scenario.rubric.judgeProfileId,
          'Judge',
        );
        const artifacts = projectReportArtifacts(facts, artifactCheckResults);
        const judgeEvidence = createJudgeEvidenceProjection({
          userIntent: scenario.evidenceContract.userBehavior,
          target: suite.target,
          expectedResult: scenario.evidenceContract.expectedResult,
          assistantOutput: readFinalAssistantOutput(facts),
          artifacts,
          qualityEvidence: options.qualityEvidence ?? [],
          hardGates,
          ...(options.judgeTargetVisibility
            ? { targetVisibility: options.judgeTargetVisibility }
            : {}),
        });
        try {
          judgeResult = await (options.runJudge ?? runRubricJudge)(
            {
              reportId,
              suiteId: suite.id,
              caseId: scenario.id,
              runId,
              profile: judgeProfile,
              rubric,
              evidence: judgeEvidence,
              hardGates,
            },
            { env: options.env, fetch: options.fetch },
          );
          const quality = classifyRubricJudge(judgeResult, rubric, hardGates);
          if (!quality.pass) {
            outcome = 'case-fail';
            judgeDiagnostic = new Error(quality.reason);
          }
        } catch (error) {
          judgeDiagnostic = error;
          outcome = 'infrastructure-fail';
        }
      }
    } catch (error) {
      executionError = error;
      outcome = classifyEvaluation({ phase: 'execution', error }).outcome;
      facts = failureFacts(error);
    }
    const hardGates = [
      ...evaluateHardGates(scenario.assertions, facts, {
        modelProfiles: suite.modelProfiles,
        outputSchemas: selection.outputSchemas,
      }),
      ...artifactCheckResults,
    ];
    const modelIdentity = readModelIdentity(facts);
    const effectiveConfiguration =
      typeof facts?.configuration?.digest === 'string'
        ? {
            runtimeProfileId: runtimeProfile.id,
            modelProfileId: modelProfile.id,
            digest: facts.configuration.digest,
          }
        : {
            runtimeProfileId: runtimeProfile.id,
            modelProfileId: modelProfile.id,
            status: 'missing',
            diagnostic: 'session facts did not expose an effective configuration digest',
          };
    let baselineDiff;
    if (selection.baseline && !options.skipBaseline) {
      baselineDiff = compareSelectionWithBaseline(selection, {
        runId,
        reportId,
        fixtureDigest: prepared.digest,
        scoreDistribution: {
          samples: judgeResult ? 1 : 0,
          passRate: outcome === 'pass' ? 1 : 0,
          ...(judgeResult ? { mean: judgeResult.overallScore, variance: 0 } : {}),
        },
        currentReportIds: [reportId],
      });
      outcome = comparisonOutcome(outcome, baselineDiff);
    }
    const documents = createM1ReportDocuments({
      reportId,
      runId,
      suite,
      scenario,
      outcome,
      facts,
      hardGates,
      modelIdentity,
      effectiveConfiguration,
      fixtureDigest: prepared.digest,
      command: `node scripts/agent-eval/protocol-smoke.mjs --suite ${suite.id} --case ${scenario.id}`,
      artifacts: projectReportArtifacts(facts, artifactCheckResults),
      usage: {
        latencyMs: Date.now() - startedAt,
        retries: readNonNegativeInteger(facts?.retries?.taskRetryCount),
        inputTokens: readNonNegativeInteger(facts?.usage?.inputTokens),
        outputTokens: readNonNegativeInteger(facts?.usage?.outputTokens),
        ...(readNonNegativeInteger(facts?.usage?.contextTokens) !== undefined
          ? { contextTokens: readNonNegativeInteger(facts?.usage?.contextTokens) }
          : {}),
        ...(readOptionalNonNegativeNumber(facts?.usage?.costUsd) !== undefined
          ? { costUsd: readOptionalNonNegativeNumber(facts?.usage?.costUsd) }
          : {}),
      },
      judge: judgeResult,
      baselineDiff,
      failureAttribution: createFailureAttribution({
        reportId,
        hardGates,
        executionError,
        judgeError: judgeDiagnostic,
      }),
      skippedStages: [...(judgeResult ? [] : ['judge']), ...(baselineDiff ? [] : ['baseline'])],
      residualRisk: [
        judgeResult
          ? 'One Judge sample is not a stability conclusion.'
          : 'No Judge score was available for this sample.',
        ...(executionError
          ? [`Execution/configuration diagnostic: ${formatError(executionError)}`]
          : []),
        ...(judgeDiagnostic ? [`Judge diagnostic: ${formatError(judgeDiagnostic)}`] : []),
      ],
    });
    const files = await writeEvaluationReport(documents, { outputRoot: options.outputRoot });
    return {
      outcome,
      reportId,
      files,
      result: documents.result,
      ...(documents.judge ? { judge: documents.judge } : {}),
      ...(documents.baselineDiff ? { baselineDiff: documents.baselineDiff } : {}),
      metrics: {
        ...readExecutionMetrics(facts),
        retries: readNonNegativeInteger(facts?.retries?.taskRetryCount),
      },
    };
  } finally {
    await prepared.cleanup();
  }
}

function compareSelectionWithBaseline(selection, input) {
  const current = createCurrentBaselineDescriptor({
    suite: selection.suite,
    scenario: selection.scenario,
    fixtureDigest: input.fixtureDigest,
    scoreDistribution: input.scoreDistribution,
    reportId: input.reportId,
  });
  return compareWithBaseline({
    id: `comparison-${input.runId}`,
    baseline: selection.baseline,
    current,
    currentReportIds: input.currentReportIds,
    evidenceRefs: input.scoreDistribution.samples > 0 ? ['judge.result'] : ['turn-facts'],
  });
}

function comparisonOutcome(currentOutcome, comparison) {
  if (currentOutcome !== 'pass') return currentOutcome;
  if (comparison.outcome === 'non-comparable') return 'non-comparable';
  if (comparison.outcome === 'regressed') return 'case-fail';
  return currentOutcome;
}

function createRepeatedRunAggregate(selection, runId, samples) {
  const outcomes = samples.map((sample) => sample.outcome);
  const outcome = outcomes.includes('configuration-invalid')
    ? 'configuration-invalid'
    : outcomes.includes('infrastructure-fail')
      ? 'infrastructure-fail'
      : outcomes.every((item) => item === 'pass')
        ? 'pass'
        : 'case-fail';
  const scores = samples
    .map((sample) => sample.judge?.overallScore)
    .filter((score) => typeof score === 'number');
  const scoreMean = scores.length > 0 ? mean(scores) : undefined;
  const latencyValues = samples.map((sample) => sample.result.usage.latencyMs);
  const hardGates = samples.flatMap((sample) => sample.result.assertions);
  const availableCosts = samples
    .map((sample) => sample.result.usage.costUsd)
    .filter((value) => typeof value === 'number');
  return validateRepeatedRun({
    schema: SCHEMAS.repeatedRun,
    suiteId: selection.suite.id,
    caseId: selection.scenario.id,
    runId,
    outcome,
    samples: samples.map((sample) => ({
      runId: sample.result.runId,
      reportId: sample.reportId,
      outcome: sample.outcome,
      result: sample.result.reportLocations.result,
      evidence: sample.result.reportLocations.evidence,
      ...(sample.result.reportLocations.judge
        ? { judge: sample.result.reportLocations.judge }
        : {}),
    })),
    passRate: samples.filter((sample) => sample.outcome === 'pass').length / samples.length,
    scoreDistribution: {
      samples: scores.length,
      passRate: samples.filter((sample) => sample.outcome === 'pass').length / samples.length,
      ...(scoreMean !== undefined
        ? {
            mean: scoreMean,
            variance: mean(scores.map((score) => (score - scoreMean) ** 2)),
          }
        : {}),
    },
    hardGates: {
      passed: hardGates.filter((gate) => gate.status === 'pass').length,
      failed: hardGates.filter((gate) => gate.status === 'fail').length,
      blocked: hardGates.filter((gate) => gate.status === 'blocked').length,
    },
    latency: {
      totalMs: sum(latencyValues),
      meanMs: mean(latencyValues),
      p50Ms: percentile(latencyValues, 0.5),
      p95Ms: percentile(latencyValues, 0.95),
    },
    tokens: {
      input: sum(samples.map((sample) => sample.result.usage.inputTokens ?? 0)),
      output: sum(samples.map((sample) => sample.result.usage.outputTokens ?? 0)),
    },
    cost:
      availableCosts.length === samples.length
        ? { status: 'available', totalUsd: sum(availableCosts) }
        : { status: 'unavailable' },
    iterations: {
      total: sum(samples.map((sample) => sample.metrics.iterations)),
      mean: mean(samples.map((sample) => sample.metrics.iterations)),
    },
    tools: {
      calls: sum(samples.map((sample) => sample.metrics.toolCalls)),
      successes: sum(samples.map((sample) => sample.metrics.toolSuccesses)),
      failures: sum(samples.map((sample) => sample.metrics.toolFailures)),
    },
    retries: { count: sum(samples.map((sample) => sample.metrics.retries)) },
    tasks: {
      total: sum(samples.map((sample) => sample.metrics.tasks.total)),
      completed: sum(samples.map((sample) => sample.metrics.tasks.completed)),
      failed: sum(samples.map((sample) => sample.metrics.tasks.failed)),
      cancelled: sum(samples.map((sample) => sample.metrics.tasks.cancelled)),
    },
  });
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * quantile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

export function createV2DryRun(selection) {
  validateScenarioForExecution(selection.scenario);
  const fixture = readSingleFixture(selection.suite, selection.scenario);
  const runtimeProfile = readProfile(
    selection.suite.runtimeProfiles,
    selection.scenario.runtimeProfileId,
    'runtime',
  );
  const modelProfiles = selection.scenario.modelProfileIds.map((id) =>
    readProfile(selection.suite.modelProfiles, id, 'model'),
  );
  return {
    ok: true,
    dryRun: true,
    schema: 'neko.agent-eval.dry-run.v2',
    suiteId: selection.suite.id,
    caseId: selection.scenario.id,
    target: selection.suite.target,
    caseGroup: selection.scenario.caseGroup,
    fixture,
    runtimeProfile,
    modelProfiles,
    steps: selection.scenario.steps,
    assertions: selection.scenario.assertions,
    reportPolicy: selection.suite.reportPolicy,
  };
}

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

function createSessionParams(profile, runtimeProfile) {
  return {
    ...(profile.selection === 'configured-default'
      ? {}
      : { provider: profile.chat.providerId, model: profile.chat.modelId }),
    ...(profile.selection === 'explicit' && profile.purposes
      ? { modelPurposes: profile.purposes }
      : {}),
    ...(Object.keys(runtimeProfile.settings).length > 0
      ? { runtimeConfig: runtimeProfile.settings }
      : {}),
  };
}

function validateEffectiveConfiguration(runtimeProfile, modelProfile, facts) {
  const effective = facts?.configuration;
  if (!effective || typeof effective.digest !== 'string') {
    return configurationError('session facts did not expose an effective configuration digest');
  }
  for (const [key, requested] of Object.entries(runtimeProfile.settings)) {
    if (!Object.is(effective.runtime?.[key], requested)) {
      return configurationError(
        `runtime setting ${key} was not applied: requested ${JSON.stringify(requested)}, observed ${JSON.stringify(effective.runtime?.[key])}`,
      );
    }
  }
  if (
    modelProfile.selection === 'explicit' &&
    (effective.chat?.providerId !== modelProfile.chat.providerId ||
      effective.chat?.modelId !== modelProfile.chat.modelId)
  ) {
    return configurationError(
      `explicit model profile was not applied: requested ${modelProfile.chat.providerId}/${modelProfile.chat.modelId}, observed ${effective.chat?.providerId}/${effective.chat?.modelId}`,
    );
  }
  if (modelProfile.selection === 'explicit' && modelProfile.purposes) {
    for (const [purpose, requested] of Object.entries(modelProfile.purposes)) {
      const observed = effective.modelPurposes?.[purpose];
      if (
        observed?.providerId !== requested.providerId ||
        observed?.modelId !== requested.modelId
      ) {
        return configurationError(
          `purpose model ${purpose} was not applied: requested ${requested.providerId}/${requested.modelId}, observed ${observed?.providerId ?? 'missing'}/${observed?.modelId ?? 'missing'}`,
        );
      }
    }
  }
  return undefined;
}

function readModelIdentity(facts) {
  const providerId = facts?.model?.providerId;
  const modelId = facts?.model?.modelId;
  return {
    providerId:
      typeof providerId === 'string' && providerId.length > 0 ? providerId : 'unavailable',
    modelId: typeof modelId === 'string' && modelId.length > 0 ? modelId : 'unavailable',
    ...(typeof facts?.model?.providerExpressionProfileId === 'string'
      ? { providerExpressionProfileId: facts.model.providerExpressionProfileId }
      : {}),
  };
}

function readFinalAssistantOutput(facts) {
  const output = (Array.isArray(facts?.turns) ? facts.turns : [])
    .filter((turn) => turn?.role === 'assistant' && turn?.isError !== true)
    .at(-1)?.content;
  if (typeof output !== 'string' || output.trim().length === 0) {
    throw Object.assign(new Error('Judge requires a non-empty final assistant output'), {
      code: 'judge-evidence-incomplete',
    });
  }
  return output;
}

function failureFacts(error) {
  return {
    model: { providerId: 'unavailable', modelId: 'unavailable' },
    idle: { fullyIdle: false },
    turns: [],
    runtimeErrors: [
      {
        code:
          typeof error === 'object' && error
            ? (error.code ?? 'execution-failed')
            : 'execution-failed',
        message: formatError(error),
      },
    ],
    evidenceCompleteness: {
      runtimeErrors: { limit: 256, droppedCount: 0 },
      turns: { limit: 512, droppedCount: 0 },
    },
  };
}

function projectReportArtifacts(facts, artifactCheckResults) {
  const runtimeArtifacts = (Array.isArray(facts?.artifacts) ? facts.artifacts : [])
    .filter(isReportableArtifact)
    .map((artifact) => {
      const common = {
        ref: artifact.ref,
        digest: artifact.digest,
        provenance: artifact.provenance.source,
        deliveryStatus:
          artifact.deliveryStatus === 'delivered' || artifact.deliveryStatus === 'failed'
            ? artifact.deliveryStatus
            : 'unknown',
        validatorId: artifact.validator.id,
        validatorStatus: artifact.validator.status,
      };
      if (artifact.kind === 'file') {
        return { ...common, kind: 'file', path: artifact.relativePath };
      }
      return {
        ...common,
        kind: artifact.kind,
        stableRef: artifact.ref,
      };
    });
  const checkedFiles = artifactCheckResults
    .filter((result) => result.status === 'pass' && result.kind === 'file')
    .map((result) => result.details);
  return [
    ...new Map(
      [...runtimeArtifacts, ...checkedFiles].map((artifact) => [artifact.ref, artifact]),
    ).values(),
  ];
}

function isReportableArtifact(artifact) {
  return (
    artifact &&
    typeof artifact.ref === 'string' &&
    typeof artifact.digest === 'string' &&
    typeof artifact.provenance?.source === 'string' &&
    typeof artifact.validator?.id === 'string' &&
    ['valid', 'invalid', 'unavailable'].includes(artifact.validator?.status) &&
    (artifact.kind !== 'file' || typeof artifact.relativePath === 'string') &&
    ['file', 'resource-ref', 'generated-asset', 'project-revision', 'composite-artifact'].includes(
      artifact.kind,
    )
  );
}

function readNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function readOptionalNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readExecutionMetrics(facts) {
  const toolCalls = (Array.isArray(facts?.turns) ? facts.turns : []).flatMap((turn) =>
    Array.isArray(turn?.toolCalls) ? turn.toolCalls : [],
  );
  const tasks = Array.isArray(facts?.tasks) ? facts.tasks : [];
  return {
    toolCalls: toolCalls.length,
    toolSuccesses: toolCalls.filter((call) => ['success', 'complete'].includes(call?.status))
      .length,
    toolFailures: toolCalls.filter((call) => call?.status === 'error').length,
    iterations: readNonNegativeInteger(facts?.iteration?.current),
    tasks: {
      total: tasks.length,
      completed: tasks.filter((task) => task?.status === 'completed').length,
      failed: tasks.filter((task) => task?.status === 'failed').length,
      cancelled: tasks.filter((task) => task?.status === 'cancelled').length,
    },
  };
}

function configurationError(message) {
  const error = new Error(message);
  error.code = 'configuration-invalid';
  return error;
}

function createRunId() {
  return `run-${Date.now().toString(36)}`;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
