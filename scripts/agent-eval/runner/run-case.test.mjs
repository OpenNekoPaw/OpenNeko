import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolveExecutionCase, runCase, runCaseRepeated } from './run-case.mjs';

describe('Desktop Agent evaluation driver boundary', () => {
  it('keeps the retired Pi scenario disconnected from the production runner', async () => {
    const source = await readFile(new URL('./run-case.mjs', import.meta.url), 'utf8');
    expect(source).not.toContain('createDesktopAgentEvaluationScenario');
    expect(source).not.toContain("from '../desktop/scenario.mjs'");
    expect(source).toContain('the retired Pi driver is disconnected');
  });

  it('requires explicit provider/model/cost authorization before launch', async () => {
    await expect(runCase(selection())).rejects.toMatchObject({
      code: 'infrastructure-blocked',
      message: expect.stringContaining('provider, model and cost'),
    });
  });

  it('blocks every unapproved explicit model before Desktop launch', async () => {
    const input = selection();
    input.suite.modelProfiles = [
      {
        id: 'model-1',
        selection: 'explicit',
        chat: { providerId: 'provider-1', modelId: 'model-1' },
        configurationHash: `sha256:${'c'.repeat(64)}`,
      },
      {
        id: 'model-2',
        selection: 'explicit',
        chat: { providerId: 'provider-1', modelId: 'model-2' },
        configurationHash: `sha256:${'e'.repeat(64)}`,
      },
    ];
    input.scenario.modelProfileIds = ['model-1', 'model-2'];
    const runDesktop = vi.fn();

    await expect(
      runCase(input, {
        providerAuthorization: {
          providerId: 'provider-1',
          modelId: 'model-1',
          configurationFile: '/fixtures/config.toml',
          costApproved: true,
        },
        runDesktop,
      }),
    ).rejects.toMatchObject({
      code: 'infrastructure-blocked',
      message: expect.stringContaining('provider-1/model-2'),
    });
    expect(runDesktop).not.toHaveBeenCalled();
  });

  it('accepts an explicit same-provider model authorization set for switching cases', async () => {
    const input = selection();
    input.suite.modelProfiles = [
      {
        id: 'model-1',
        selection: 'explicit',
        chat: { providerId: 'provider-1', modelId: 'model-1' },
        configurationHash: `sha256:${'c'.repeat(64)}`,
      },
      {
        id: 'model-2',
        selection: 'explicit',
        chat: { providerId: 'provider-1', modelId: 'model-2' },
        configurationHash: `sha256:${'e'.repeat(64)}`,
      },
    ];
    input.scenario.modelProfileIds = ['model-1', 'model-2'];
    const runDesktop = vi.fn(async () => ({
      reportPath: '/reports/model-switch/desktop-functional.json',
      report: { evidence: { facts: {} } },
    }));

    await expect(
      runCase(input, {
        providerAuthorization: {
          providerId: 'provider-1',
          modelId: 'model-2',
          modelIds: ['model-1', 'model-2'],
          configurationFile: '/fixtures/config.toml',
          costApproved: true,
        },
        runDesktop,
        createScenario: () => ({ id: 'model-switch', owner: 'evaluation' }),
        runPipeline: async () => ({ outcome: 'pass', result: {} }),
        runId: 'model-switch',
      }),
    ).resolves.toMatchObject({ outcome: 'pass' });
    expect(runDesktop).toHaveBeenCalledOnce();
  });

  it('blocks the retired Pi Desktop driver before launching an authorized real case', async () => {
    const runDesktop = vi.fn();

    await expect(
      runCase(selection(), {
        providerAuthorization: {
          providerId: 'provider-1',
          modelId: 'model-1',
          configurationFile: '/fixtures/config.toml',
          costApproved: true,
        },
        runDesktop,
      }),
    ).rejects.toMatchObject({
      code: 'infrastructure-blocked',
      message: expect.stringContaining('canonical DSH composer/Conversation/approval driver'),
    });
    expect(runDesktop).not.toHaveBeenCalled();
  });

  it('launches one isolated Desktop sample through the injected functional boundary', async () => {
    const runDesktop = vi.fn(async (options) => ({
      reportPath: '/reports/sample/desktop-functional.json',
      report: { evidence: { facts: { status: 'captured' } }, scenario: options.scenario.id },
    }));
    const createScenario = vi.fn(() => ({ id: 'agent-eval-case-1', owner: 'evaluation' }));
    const runPipeline = vi.fn(async () => ({
      outcome: 'pass',
      reportId: 'sample',
      result: { schema: 'neko.agent-eval.result' },
      files: { result: '/reports/sample/result.json' },
    }));

    await expect(
      runCase(selection(), {
        env: {},
        providerAuthorization: {
          providerId: 'provider-1',
          modelId: 'model-1',
          configurationFile: '/fixtures/config.toml',
          costApproved: true,
        },
        runDesktop,
        createScenario,
        runPipeline,
        outputRoot: '/reports',
        runId: 'sample',
      }),
    ).resolves.toEqual({
      outcome: 'pass',
      reportId: 'sample',
      result: { schema: 'neko.agent-eval.result' },
      files: { result: '/reports/sample/result.json' },
      desktopReportPath: '/reports/sample/desktop-functional.json',
      desktopReportLocation: 'sample/desktop-functional.json',
    });
    expect(createScenario).toHaveBeenCalledOnce();
    expect(createScenario.mock.calls[0]?.[0]).toMatchObject({
      schema: 'neko.agent-eval.execution-case',
      caseId: 'ordinary-new-case',
    });
    expect(runDesktop).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'development',
        windowMode: 'hidden',
        reportPath: '/reports/sample/desktop-functional.json',
      }),
    );
    expect(runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: expect.any(Object),
        executionCase: expect.objectContaining({ caseId: 'ordinary-new-case' }),
        desktopEvidence: { facts: { status: 'captured' } },
        desktopReportPath: '/reports/sample/desktop-functional.json',
        runId: 'sample',
      }),
      expect.objectContaining({ outputRoot: '/reports' }),
    );
  });

  it('uses the declared visible window mode and rejects a mismatched launch', async () => {
    const input = selection();
    input.scenario.execution = {
      evidenceLevel: 'visible-desktop',
      resourceClass: 'visible-ui',
      protected: true,
    };
    const runDesktop = vi.fn(async (options) => ({
      reportPath: '/reports/visible/desktop-functional.json',
      report: { evidence: {}, scenario: options.scenario.id },
    }));
    const runPipeline = vi.fn(async () => ({ outcome: 'pass', result: {} }));
    const options = {
      providerAuthorization: {
        providerId: 'provider-1',
        modelId: 'model-1',
        configurationFile: '/fixtures/config.toml',
        costApproved: true,
      },
      runDesktop,
      createScenario: () => ({ id: 'visible', owner: 'evaluation' }),
      runPipeline,
      outputRoot: '/reports',
      runId: 'visible',
    };

    await runCase(input, options);
    expect(runDesktop).toHaveBeenCalledWith(expect.objectContaining({ windowMode: 'visible' }));
    await expect(runCase(input, { ...options, windowMode: 'hidden' })).rejects.toMatchObject({
      code: 'configuration-invalid',
      message: expect.stringContaining('requires visible window mode'),
    });
  });

  it('runs every repetition as a separately identified Desktop sample and writes one aggregate', async () => {
    const input = selection();
    input.scenario.budget.repetitions = 3;
    const runSample = vi.fn(async (_selection, options) => completedSample(options.runId));
    const writeAggregate = vi.fn(async () => '/reports/suite-1/case-1/case-run/aggregate.json');

    const result = await runCaseRepeated(input, {
      runId: 'case-run',
      runSample,
      writeAggregate,
      outputRoot: '/reports',
    });

    expect(runSample.mock.calls.map((call) => call[1].runId)).toEqual([
      'case-run-r1',
      'case-run-r2',
      'case-run-r3',
    ]);
    expect(result).toMatchObject({
      outcome: 'pass',
      reportId: 'case-run',
      repetitions: 3,
      aggregate: {
        schema: 'neko.agent-eval.aggregate',
        statistics: { samples: 3, passRate: 1 },
        samples: [{ repetition: 1 }, { repetition: 2 }, { repetition: 3 }],
      },
    });
    expect(writeAggregate).toHaveBeenCalledOnce();
  });

  it('resolves an immutable execution case without a case-id adapter whitelist', () => {
    const resolved = resolveExecutionCase(selection());

    expect(resolved.caseId).toBe('ordinary-new-case');
    expect(resolved.fixture.id).toBe('fixture-1');
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.steps)).toBe(true);
    expect(Object.isFrozen(resolved.steps[0])).toBe(true);
  });

  it('rejects schema-valid steps that the Desktop workflow boundary cannot execute', () => {
    const input = selection();
    input.scenario.steps = [
      { id: 'submit', kind: 'submit', prompt: 'hello' },
      { id: 'idle', kind: 'wait-for-idle', timeoutMs: 1000 },
      { id: 'resize', kind: 'resize', columns: 120, rows: 40 },
      { id: 'idle-again', kind: 'wait-for-idle', timeoutMs: 1000 },
    ];

    expect(() => resolveExecutionCase(input)).toThrow(
      "workflow step 'resize' is not supported by the Desktop execution boundary",
    );
  });

  it('rejects Skill-authored code registration and unsupported operations before launch', () => {
    const codeDraft = selection();
    codeDraft.scenario.register = { handler: 'return import("@neko/agent-runtime")' };
    expect(() => resolveExecutionCase(codeDraft)).toThrow('unknown field(s): register');

    const unsupportedDraft = selection();
    unsupportedDraft.scenario.steps = [
      { id: 'submit', kind: 'submit', prompt: 'hello' },
      { id: 'idle', kind: 'wait-for-idle', timeoutMs: 1000 },
      { id: 'resize', kind: 'resize', columns: 120, rows: 40 },
      { id: 'idle-again', kind: 'wait-for-idle', timeoutMs: 1000 },
    ];
    expect(() => resolveExecutionCase(unsupportedDraft)).toThrow(
      "workflow step 'resize' is not supported",
    );
  });
});

function selection() {
  return {
    suite: {
      id: 'suite-1',
      target: { kind: 'runtime', id: 'runtime-1', contractHash: `sha256:${'a'.repeat(64)}` },
      runtimeProfiles: [
        {
          id: 'runtime-1',
          settings: {},
          configurationHash: `sha256:${'b'.repeat(64)}`,
        },
      ],
      modelProfiles: [
        {
          id: 'model-1',
          selection: 'configured-default',
          configurationHash: `sha256:${'c'.repeat(64)}`,
        },
      ],
      judgeProfiles: [],
      fixtures: [
        {
          id: 'fixture-1',
          root: 'shared-fixtures/fixture-1',
          source: 'repository',
          digest: `sha256:${'d'.repeat(64)}`,
          mutable: true,
        },
      ],
      reportPolicy: { rawRetentionDays: 14, trustedCiRetentionDays: 14, committedSummary: true },
    },
    scenario: {
      schema: 'neko.agent-eval.scenario',
      id: 'ordinary-new-case',
      suiteId: 'suite-1',
      caseGroup: 'regression',
      visibility: 'public',
      evidenceContract: {
        userBehavior: 'Run one Desktop turn.',
        canonicalPath: ['Desktop'],
        observables: [{ ref: 'facts', kind: 'runtime-fact', description: 'facts', required: true }],
        expectedResult: 'turn completes',
        expectedFailure: 'turn fails',
      },
      fixtureRefs: ['fixture-1'],
      runtimeProfileId: 'runtime-1',
      modelProfileIds: ['model-1'],
      steps: [
        { id: 'submit', kind: 'submit', prompt: 'hello' },
        { id: 'idle', kind: 'wait-for-idle', timeoutMs: 1000 },
      ],
      assertions: [{ id: 'answer', kind: 'final-answer', mode: 'non-empty', evidenceRef: 'facts' }],
      artifactChecks: [],
      budget: { timeoutMs: 1000, repetitions: 1 },
    },
  };
}

function completedSample(runId) {
  const hash = `sha256:${'a'.repeat(64)}`;
  return {
    outcome: 'pass',
    result: {
      schema: 'neko.agent-eval.result',
      reportId: runId,
      suiteId: 'suite-1',
      caseId: 'ordinary-new-case',
      runId,
      outcome: 'pass',
      target: { kind: 'runtime', id: 'runtime-1', contractHash: hash },
      modelIdentity: { providerId: 'provider-1', modelId: 'model-1' },
      effectiveConfiguration: {
        runtimeProfileId: 'runtime-1',
        modelProfileId: 'model-1',
        digest: hash,
      },
      fixtureDigest: hash,
      command: 'node scripts/agent-eval/local-run.mjs',
      assertions: [{ id: 'answer', status: 'pass', evidenceRefs: ['facts'] }],
      artifactRefs: [],
      usage: { latencyMs: 10, retries: 0 },
      reportLocations: {
        result: `suite-1/ordinary-new-case/${runId}/result.json`,
        evidence: `suite-1/ordinary-new-case/${runId}/evidence.json`,
        artifactManifest: `suite-1/ordinary-new-case/${runId}/artifact-manifest.json`,
        qualityReport: `suite-1/ordinary-new-case/${runId}/quality-report.md`,
      },
      skippedStages: ['artifact-validator', 'judge', 'baseline'],
      residualRisk: ['single provider sample'],
    },
    artifactChecks: [],
    artifacts: [],
    desktopReportLocation: `${runId}/desktop-functional.json`,
  };
}
