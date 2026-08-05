import { describe, expect, it, vi } from 'vitest';
import { runEvaluationPipeline } from './evaluation-pipeline.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

describe('Desktop Agent Evaluation pipeline', () => {
  it('runs hard gates, owning validator evidence, Judge, baseline and report in order', async () => {
    const calls = [];
    const input = pipelineInput({ withArtifact: true, withJudge: true, withBaseline: true });
    const runJudge = vi.fn(async (judgeInput) => {
      calls.push('judge');
      expect(judgeInput.hardGates.every((gate) => gate.status === 'pass')).toBe(true);
      return judgeResult();
    });
    const compareBaseline = vi.fn((comparisonInput) => {
      calls.push('baseline');
      expect(comparisonInput.current.scoreDistribution.mean).toBe(4.5);
      return baselineDiff();
    });
    const writeReport = vi.fn(async (documents) => {
      calls.push('report');
      expect(documents.result.outcome).toBe('pass');
      expect(documents.evidence.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ref: 'artifact-check.output', kind: 'validator' }),
          expect.objectContaining({ ref: 'judge.result', kind: 'judge' }),
        ]),
      );
      return { result: '/reports/result.json' };
    });

    const result = await runEvaluationPipeline(input, {
      runJudge,
      compareBaseline,
      writeReport,
      outputRoot: '/reports',
    });

    expect(calls).toEqual(['judge', 'baseline', 'report']);
    expect(result).toMatchObject({
      outcome: 'pass',
      reportId: 'run-1',
      result: {
        schema: 'neko.agent-eval.result.v2',
        outcome: 'pass',
        skippedStages: [],
      },
      artifacts: [expect.objectContaining({ ref: 'output.json', validatorStatus: 'valid' })],
      judge: expect.objectContaining({ overallScore: 4.5 }),
      baselineDiff: expect.objectContaining({ comparable: true }),
    });
  });

  it('keeps deterministic failure dominant and skips Judge and baseline', async () => {
    const input = pipelineInput({ withJudge: true, withBaseline: true });
    input.executionCase.assertions[1].text = ['MISSING_MARKER'];
    input.selection.scenario.assertions = input.executionCase.assertions;
    const runJudge = vi.fn();
    const compareBaseline = vi.fn();
    const writeReport = vi.fn(async () => ({ result: '/reports/result.json' }));

    const result = await runEvaluationPipeline(input, {
      runJudge,
      compareBaseline,
      writeReport,
    });

    expect(result.outcome).toBe('case-fail');
    expect(result.hardGates).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'answer', status: 'fail' })]),
    );
    expect(result.result.skippedStages).toEqual(
      expect.arrayContaining(['artifact-validator', 'judge', 'baseline']),
    );
    expect(runJudge).not.toHaveBeenCalled();
    expect(compareBaseline).not.toHaveBeenCalled();
    expect(writeReport).toHaveBeenCalledOnce();
  });

  it('treats an owning artifact-validator failure as deterministic and skips Judge and baseline', async () => {
    const input = pipelineInput({ withArtifact: true, withJudge: true, withBaseline: true });
    input.desktopEvidence.artifactChecks = [
      {
        id: 'output',
        kind: 'file',
        status: 'fail',
        evidenceRefs: ['facts'],
        message: 'artifact digest mismatch for output.json',
      },
    ];
    const runJudge = vi.fn();
    const compareBaseline = vi.fn();
    const writeReport = vi.fn(async (documents) => {
      expect(documents.result.outcome).toBe('case-fail');
      expect(documents.evidence.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ref: 'artifact-check.output',
            kind: 'validator',
            summary: 'artifact digest mismatch for output.json',
          }),
        ]),
      );
      return { result: '/reports/result.json' };
    });

    const result = await runEvaluationPipeline(input, {
      runJudge,
      compareBaseline,
      writeReport,
    });

    expect(result.outcome).toBe('case-fail');
    expect(result.artifactChecks).toEqual([
      expect.objectContaining({ id: 'output', status: 'fail' }),
    ]);
    expect(result.result.skippedStages).toEqual(expect.arrayContaining(['judge', 'baseline']));
    expect(result.result.skippedStages).not.toContain('artifact-validator');
    expect(runJudge).not.toHaveBeenCalled();
    expect(compareBaseline).not.toHaveBeenCalled();
    expect(writeReport).toHaveBeenCalledOnce();
  });

  it('rejects missing or reordered artifact-validator results', async () => {
    const input = pipelineInput({ withArtifact: true });
    input.desktopEvidence.artifactChecks = [];

    await expect(runEvaluationPipeline(input, { writeReport: vi.fn() })).rejects.toMatchObject({
      code: 'configuration-invalid',
      message: expect.stringContaining('artifact check results do not match'),
    });
  });
});

function pipelineInput(options = {}) {
  const assertions = [
    { id: 'runtime', kind: 'runtime-errors-empty', evidenceRef: 'facts' },
    {
      id: 'answer',
      kind: 'final-answer',
      mode: 'contains',
      text: ['CASE_OK'],
      evidenceRef: 'facts',
    },
  ];
  const artifactChecks = options.withArtifact
    ? [
        {
          id: 'output',
          kind: 'file',
          path: 'output.json',
          digest: HASH,
          validatorId: 'json-document-v1',
          evidenceRef: 'facts',
        },
      ]
    : [];
  const rubricPolicy = options.withJudge
    ? {
        kind: 'domain-rubric',
        ref: 'rubrics/quality.json',
        judgeProfileId: 'quality-judge',
      }
    : undefined;
  const scenario = {
    id: 'ordinary-case',
    runtimeProfileId: 'runtime-1',
    modelProfileIds: ['model-1'],
    budget: { timeoutMs: 1000, repetitions: 1 },
    assertions,
    artifactChecks,
    ...(rubricPolicy ? { rubric: rubricPolicy } : {}),
  };
  const selection = {
    suite: {
      id: 'suite-1',
      target: { kind: 'runtime', id: 'runtime-1', contractHash: HASH },
      repositoryRevision: 'revision-1',
      judgeProfiles: options.withJudge ? [judgeProfile()] : [],
    },
    scenario,
    outputSchemas: {},
    rubrics: options.withJudge ? { 'rubrics/quality.json': rubric() } : {},
    baseline: options.withBaseline ? { id: 'baseline-1' } : undefined,
  };
  return {
    selection,
    executionCase: {
      schema: 'neko.agent-eval.execution-case.v1',
      suiteId: 'suite-1',
      caseId: 'ordinary-case',
      target: selection.suite.target,
      fixture: { id: 'fixture-1', digest: HASH },
      runtimeProfile: { id: 'runtime-1' },
      modelProfiles: [{ id: 'model-1', selection: 'configured-default' }],
      assertions,
      artifactChecks,
      evidenceContract: {
        userBehavior: 'Ask the Agent to complete the case.',
        expectedResult: 'A complete answer is returned.',
      },
    },
    authorization: { providerId: 'provider-1', modelId: 'model-1' },
    desktopEvidence: desktopEvidence(artifactChecks),
    runId: 'run-1',
    latencyMs: 25,
  };
}

function desktopEvidence(artifactChecks) {
  const identity = { conversationId: 'conversation-1', turnId: 'turn-1', runId: 'agent-run-1' };
  const bounded = (items = []) => ({ limit: 100, items, droppedCount: 0 });
  return {
    identity,
    workflow: { terminalIdle: { identity }, receipts: {} },
    projection: { events: [] },
    snapshot: {
      messages: [
        { id: 'user-1', role: 'user', content: 'hello' },
        { id: 'assistant-1', role: 'assistant', content: 'done\nCASE_OK' },
      ],
    },
    facts: {
      identity: { ...identity, branchId: 'branch-1', piSessionId: 'pi-session-1' },
      runtimePath: {
        controller: 'sender-bound-desktop-agent-controller',
        runtime: 'pi-conversation-runtime',
        transcript: 'pi-session',
        metadata: 'sqlite',
        projection: 'conversation-projection-store',
        forbiddenPathCount: 0,
      },
      configuration: {
        effective: {
          digest: HASH,
          values: {
            modelBinding: {
              purpose: 'agent.main',
              providerId: 'provider-1',
              modelId: 'model-1',
            },
          },
        },
      },
      receipts: {
        prompts: bounded(),
        skills: bounded(),
        tools: bounded(),
        permissions: bounded(),
      },
      projection: { terminalState: 'completed' },
      resourceDisplayProjections: bounded(),
      persistence: { durability: 'durable', checkpoint: 'observed' },
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.01 },
      diagnostics: bounded(),
      disposal: { status: 'disposed' },
    },
    artifactChecks: artifactChecks.map((check) => ({
      id: check.id,
      kind: check.kind,
      status: 'pass',
      evidenceRefs: [check.evidenceRef],
      details: {
        ref: check.path,
        kind: 'file',
        path: check.path,
        digest: check.digest,
        provenance: 'fixture-workspace',
        deliveryStatus: 'delivered',
        validatorId: check.validatorId,
        validatorStatus: 'valid',
      },
    })),
  };
}

function judgeProfile() {
  return {
    id: 'quality-judge',
    adapter: 'openai-chat-completions-v1',
    providerId: 'judge-provider',
    modelId: 'judge-model',
    endpointEnv: 'JUDGE_ENDPOINT',
    apiKeyEnv: 'JUDGE_KEY',
    temperature: 0,
    maxTokens: 1000,
    timeoutMs: 1000,
  };
}

function rubric() {
  return {
    id: 'quality-rubric',
    domain: 'test',
    version: 'v1',
    minimumScore: 4,
    maximumUncertainty: 0.3,
    criteria: [
      {
        id: 'complete',
        description: 'The response is complete.',
        weight: 1,
        evidenceRefs: ['assistant-output'],
      },
    ],
  };
}

function judgeResult() {
  return {
    schema: 'neko.agent-eval.judge.v2',
    reportId: 'run-1',
    suiteId: 'suite-1',
    caseId: 'ordinary-case',
    runId: 'run-1',
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
        score: 4.5,
        evidenceRefs: ['assistant-output'],
        reason: 'Complete.',
        uncertainty: 0.1,
      },
    ],
    overallScore: 4.5,
    uncertainty: 0.1,
    summary: 'Complete.',
    disposition: 'eligible',
    usage: { inputTokens: 5, outputTokens: 2 },
  };
}

function baselineDiff() {
  return {
    schema: 'neko.agent-eval.comparison.v2',
    id: 'comparison-run-1',
    baselineId: 'baseline-1',
    currentReportIds: ['run-1'],
    outcome: 'unchanged',
    comparable: true,
    dimensions: [{ id: 'target', comparable: true, baseline: 'same', current: 'same' }],
    evidenceRefs: ['facts', 'judge.result'],
    improvementPercent: 0,
  };
}
