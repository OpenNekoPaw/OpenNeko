import { compareWithBaseline, createCurrentBaselineDescriptor } from '../comparison/baseline.mjs';
import { createDesktopEvaluationFacts } from '../desktop/evidence.mjs';
import { createJudgeEvidenceProjection } from '../judge/evidence-projection.mjs';
import { classifyRubricJudge, runRubricJudge } from '../judge/rubric-judge.mjs';
import { createM1ReportDocuments, writeEvaluationReport } from '../reports/report-writer.mjs';
import { createFailureAttribution } from '../reports/failure-attribution.mjs';
import { classifyEvaluation, evaluateHardGates } from './hard-gates.mjs';

export async function runEvaluationPipeline(input, options = {}) {
  const facts = createDesktopEvaluationFacts(input.desktopEvidence);
  const hardGates = (options.evaluateHardGates ?? evaluateHardGates)(
    input.executionCase.assertions,
    facts,
    {
      executionCase: input.executionCase,
      authorization: input.authorization,
      modelProfiles: input.executionCase.modelProfiles,
      outputSchemas: input.selection.outputSchemas ?? {},
    },
  );
  const artifactChecks = validateArtifactCheckResults(
    input.executionCase.artifactChecks,
    input.desktopEvidence.artifactChecks ?? [],
  );
  const artifacts = artifactChecks.flatMap((result) => toManifestArtifacts(result));
  const deterministicPass =
    classifyEvaluation({ hardGates }).outcome === 'pass' &&
    artifactChecks.every((result) => result.status === 'pass');
  const reportId = input.reportId ?? input.runId;
  let outcome = deterministicPass ? 'pass' : 'case-fail';
  let judge;
  let judgeClassification;
  if (deterministicPass && input.selection.scenario.rubric) {
    const { rubric, profile } = resolveJudge(input.selection);
    const judgeEvidence = createJudgeEvidenceProjection({
      userIntent: input.executionCase.evidenceContract.userBehavior,
      target: input.executionCase.target,
      expectedResult: input.executionCase.evidenceContract.expectedResult,
      assistantOutput: readFinalAssistantOutput(facts),
      artifacts,
      qualityEvidence: [],
      hardGates,
      targetVisibility: options.judgeTargetVisibility,
    });
    judge = await (options.runJudge ?? runRubricJudge)(
      {
        reportId,
        suiteId: input.executionCase.suiteId,
        caseId: input.executionCase.caseId,
        runId: input.runId,
        profile,
        rubric,
        evidence: judgeEvidence,
        hardGates,
      },
      { env: options.env, fetch: options.fetch, callProvider: options.callJudgeProvider },
    );
    judgeClassification = classifyRubricJudge(judge, rubric, hardGates);
    if (!judgeClassification.pass) outcome = 'case-fail';
  }
  let baselineDiff;
  if (deterministicPass && input.selection.baseline) {
    const score = judge?.overallScore ?? 1;
    const current = createCurrentBaselineDescriptor({
      suite: input.selection.suite,
      scenario: input.selection.scenario,
      fixtureDigest: input.executionCase.fixture.digest,
      scoreDistribution: {
        samples: 1,
        passRate: outcome === 'pass' ? 1 : 0,
        mean: score,
        variance: 0,
      },
      reportId,
    });
    baselineDiff = (options.compareBaseline ?? compareWithBaseline)({
      id: `comparison-${input.runId}`,
      baseline: input.selection.baseline,
      current,
      currentReportIds: [reportId],
      evidenceRefs: uniqueEvidenceRefs(input.executionCase.assertions, judge),
    });
    if (!baselineDiff.comparable) outcome = 'non-comparable';
    else if (baselineDiff.outcome === 'regressed') outcome = 'case-fail';
  }
  const skippedStages = [
    ...(input.executionCase.artifactChecks.length === 0 ? ['artifact-validator'] : []),
    ...(!judge ? ['judge'] : []),
    ...(!baselineDiff ? ['baseline'] : []),
  ];
  const failureAttribution = createFailureAttribution({
    reportId,
    hardGates,
    artifactChecks,
    ...(judgeClassification && !judgeClassification.pass
      ? { judgeFailure: { summary: judgeClassification.reason } }
      : {}),
  });
  const neutralFacts = facts.neutralFacts;
  const documents = createM1ReportDocuments({
    reportId,
    runId: input.runId,
    suite: input.selection.suite,
    scenario: input.selection.scenario,
    outcome,
    facts,
    hardGates,
    artifactChecks,
    artifacts,
    judge,
    baselineDiff,
    modelIdentity: neutralFacts.configuration.effective.values.modelBinding,
    effectiveConfiguration: {
      runtimeProfileId: input.executionCase.runtimeProfile.id,
      modelProfileId: input.executionCase.modelProfiles[0].id,
      digest: neutralFacts.configuration.effective.digest,
    },
    fixtureDigest: input.executionCase.fixture.digest,
    command: options.command ?? 'node scripts/agent-eval/local-run.mjs',
    usage: {
      latencyMs: input.latencyMs,
      retries: 0,
      ...(neutralFacts.usage.inputTokens === undefined
        ? {}
        : { inputTokens: neutralFacts.usage.inputTokens }),
      ...(neutralFacts.usage.outputTokens === undefined
        ? {}
        : { outputTokens: neutralFacts.usage.outputTokens }),
      ...(neutralFacts.usage.costUsd === undefined ? {} : { costUsd: neutralFacts.usage.costUsd }),
    },
    skippedStages,
    residualRisk: options.residualRisk ?? [],
    failureAttribution,
  });
  const files = await (options.writeReport ?? writeEvaluationReport)(documents, {
    outputRoot: options.outputRoot,
  });
  return {
    outcome,
    reportId,
    result: documents.result,
    hardGates,
    artifactChecks,
    artifacts,
    judge,
    judgeClassification,
    baselineDiff,
    failureAttribution,
    configurationEvidence: neutralFacts.configuration,
    comparisonPolicyEvidence: createComparisonPolicyEvidence(input),
    files,
  };
}

function createComparisonPolicyEvidence(input) {
  const scenario = input.selection.scenario;
  const steps = scenario.steps ?? input.executionCase.steps ?? [];
  const assertions = scenario.assertions ?? input.executionCase.assertions ?? [];
  const artifactChecks = scenario.artifactChecks ?? input.executionCase.artifactChecks ?? [];
  return Object.freeze({
    scenario: {
      id: scenario.id,
      suiteId: scenario.suiteId,
      fixtureRefs: scenario.fixtureRefs,
      evidenceContract: scenario.evidenceContract,
    },
    runtime: {
      runtimeProfileId: input.executionCase.runtimeProfile.id,
      modelProfileIds: input.executionCase.modelProfiles.map((profile) => profile.id),
    },
    prompts: steps
      .filter((step) => ['submit', 'queue', 'feedback'].includes(step.kind))
      .map((step) => ({ id: step.id, kind: step.kind, prompt: step.prompt })),
    skills: assertions
      .filter((assertion) => assertion.kind === 'skill')
      .map((assertion) => assertion.identity),
    tools: assertions
      .filter((assertion) => assertion.kind === 'tool-call')
      .map((assertion) => ({ name: assertion.name, status: assertion.status })),
    permissions: steps
      .filter((step) => step.kind === 'confirm')
      .map((step) => ({ toolName: step.toolName, approved: step.approved })),
    validators: artifactChecks.map((check) => ({
      id: check.id,
      kind: check.kind,
      validatorId: check.validatorId,
    })),
    judge: scenario.rubric ?? { kind: 'none' },
    budget: scenario.budget,
  });
}

function validateArtifactCheckResults(checks, results) {
  const expected = checks.map((check) => check.id);
  const observed = results.map((result) => result.id);
  if (
    observed.length !== new Set(observed).size ||
    expected.length !== observed.length ||
    expected.some((id, index) => observed[index] !== id)
  ) {
    throw configurationError(
      `Desktop Agent artifact check results do not match the resolved case; expected=${expected.join(',') || 'none'} observed=${observed.join(',') || 'none'}`,
    );
  }
  return results;
}

function toManifestArtifacts(result) {
  if (result.status !== 'pass' || !result.details) return [];
  if (
    result.details.kind === 'file' ||
    [
      'content-locator',
      'resource-ref',
      'generated-asset',
      'project-revision',
      'composite-artifact',
    ].includes(result.details.kind)
  ) {
    return [result.details];
  }
  return [];
}

function resolveJudge(selection) {
  const policy = selection.scenario.rubric;
  const rubric = selection.rubrics?.[policy.ref];
  const profile = selection.suite.judgeProfiles.find(
    (candidate) => candidate.id === policy.judgeProfileId,
  );
  if (!rubric || !profile) {
    throw configurationError('Desktop Agent Judge rubric or profile is unavailable.');
  }
  return { rubric, profile };
}

function readFinalAssistantOutput(facts) {
  const assistant = facts.snapshot.messages
    .filter((message) => message?.role === 'assistant' && message.isError !== true)
    .at(-1);
  if (typeof assistant?.content !== 'string' || assistant.content.trim().length === 0) {
    throw new Error('Desktop Agent Judge requires a non-empty final assistant output.');
  }
  return assistant.content;
}

function uniqueEvidenceRefs(assertions, judge) {
  return [
    ...new Set([
      ...assertions.map((assertion) => assertion.evidenceRef),
      ...(judge ? ['judge.result'] : []),
    ]),
  ];
}

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'configuration-invalid' });
}
