import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAggregateReport, writeAggregateReport } from './aggregate-report.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});

describe('Agent Evaluation aggregate report', () => {
  it('retains every sample identity, assertion, artifact, usage availability and residual risk', async () => {
    const samples = [
      sample('case-run-r1', 'pass', {
        inputTokens: 10,
        outputTokens: 4,
        costUsd: 0.02,
        score: 4.5,
      }),
      sample('case-run-r2', 'non-comparable', { score: 3.5 }),
    ];
    const aggregate = createAggregateReport({
      reportId: 'case-run',
      selection: selection(),
      repetitions: 2,
      samples,
    });

    expect(aggregate).toMatchObject({
      schema: 'neko.agent-eval.aggregate.v2',
      outcome: 'non-comparable',
      repetitions: 2,
      statistics: {
        samples: 2,
        passRate: 0.5,
        usageAvailability: { inputTokens: 1, outputTokens: 1, costUsd: 1 },
        usageTotals: { latencyMs: 50, inputTokens: 10, outputTokens: 4, costUsd: 0.02 },
        scoreDistribution: { samples: 2, passRate: 0.5, mean: 4, variance: 0.25 },
      },
      residualRisk: ['provider variance remains'],
      samples: [
        expect.objectContaining({
          repetition: 1,
          result: expect.objectContaining({
            runId: 'case-run-r1',
            assertions: [expect.objectContaining({ id: 'answer', status: 'pass' })],
            artifactRefs: ['output.json'],
          }),
          artifactChecks: [expect.objectContaining({ id: 'output', status: 'pass' })],
          desktopReport: 'case-run-r1/desktop-functional.json',
        }),
        expect.objectContaining({ repetition: 2 }),
      ],
    });

    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-eval-aggregate-'));
    temporaryDirectories.push(outputRoot);
    const file = await writeAggregateReport(aggregate, { outputRoot });
    await expect(fs.readFile(file, 'utf8')).resolves.toContain('neko.agent-eval.aggregate.v2');
  });

  it('fails visible when a planned repetition has no completed sample', () => {
    expect(() =>
      createAggregateReport({
        reportId: 'case-run',
        selection: selection(),
        repetitions: 2,
        samples: [sample('case-run-r1', 'pass')],
      }),
    ).toThrow('requires 2 completed sample');
  });
});

function selection() {
  return {
    suite: { id: 'suite-1' },
    scenario: { id: 'case-1' },
  };
}

function sample(runId, outcome, options = {}) {
  const reportId = runId;
  const result = {
    schema: 'neko.agent-eval.result.v2',
    reportId,
    suiteId: 'suite-1',
    caseId: 'case-1',
    runId,
    outcome,
    target: { kind: 'runtime', id: 'runtime-1', contractHash: HASH },
    repositoryRevision: 'revision-1',
    modelIdentity: { providerId: 'provider-1', modelId: 'model-1' },
    effectiveConfiguration: {
      runtimeProfileId: 'runtime-1',
      modelProfileId: 'model-1',
      digest: HASH,
    },
    fixtureDigest: HASH,
    command: 'node scripts/agent-eval/local-run.mjs',
    assertions: [{ id: 'answer', status: 'pass', evidenceRefs: ['facts'] }],
    artifactRefs: ['output.json'],
    usage: {
      latencyMs: 25,
      retries: 0,
      ...(options.inputTokens === undefined ? {} : { inputTokens: options.inputTokens }),
      ...(options.outputTokens === undefined ? {} : { outputTokens: options.outputTokens }),
      ...(options.costUsd === undefined ? {} : { costUsd: options.costUsd }),
    },
    reportLocations: {
      result: `suite-1/case-1/${runId}/result.json`,
      evidence: `suite-1/case-1/${runId}/evidence.json`,
      artifactManifest: `suite-1/case-1/${runId}/artifact-manifest.json`,
      qualityReport: `suite-1/case-1/${runId}/quality-report.md`,
      judge: `suite-1/case-1/${runId}/judge.json`,
    },
    skippedStages: ['baseline'],
    residualRisk: ['provider variance remains'],
  };
  return {
    outcome,
    result,
    artifactChecks: [
      {
        id: 'output',
        kind: 'file',
        status: 'pass',
        evidenceRefs: ['facts'],
        details: {
          ref: 'output.json',
          kind: 'file',
          path: 'output.json',
          digest: HASH,
          provenance: 'fixture-workspace',
          deliveryStatus: 'delivered',
          validatorId: 'json-document-v1',
          validatorStatus: 'valid',
        },
      },
    ],
    artifacts: [
      {
        ref: 'output.json',
        kind: 'file',
        path: 'output.json',
        digest: HASH,
        provenance: 'fixture-workspace',
        deliveryStatus: 'delivered',
        validatorId: 'json-document-v1',
        validatorStatus: 'valid',
      },
    ],
    judge: judge(reportId, options.score ?? 4),
    desktopReportLocation: `${runId}/desktop-functional.json`,
  };
}

function judge(reportId, score) {
  return {
    schema: 'neko.agent-eval.judge.v2',
    reportId,
    suiteId: 'suite-1',
    caseId: 'case-1',
    runId: reportId,
    providerId: 'judge-provider',
    modelId: 'judge-model',
    profileId: 'quality-judge',
    rubricId: 'quality-rubric',
    rubricVersion: 'v1',
    promptHash: HASH,
    sampling: { temperature: 0, maxTokens: 1000 },
    criteria: [
      {
        criterionId: 'complete',
        score,
        evidenceRefs: ['assistant-output'],
        reason: 'Complete.',
        uncertainty: 0.1,
      },
    ],
    overallScore: score,
    uncertainty: 0.1,
    summary: 'Complete.',
    disposition: 'eligible',
    usage: { inputTokens: 5, outputTokens: 2 },
  };
}
