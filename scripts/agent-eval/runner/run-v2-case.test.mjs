import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import process from 'node:process';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverSuites, selectSuiteCases } from '../suites/discovery.mjs';
import { runV2Case } from './run-v2-case.mjs';
import {
  createApprovedBaseline,
  createCurrentBaselineDescriptor,
} from '../comparison/baseline.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function selection() {
  const selected = selectSuiteCases(await discoverSuites(), {
    suiteId: 'agent-runtime.single-message-tui',
    caseId: 'canonical-answer',
  })[0];
  delete selected.scenario.rubric;
  selected.suite.judgeProfiles = [];
  selected.rubrics = {};
  return selected;
}

function facts(overrides = {}) {
  return {
    conversationId: 'conversation-1',
    model: { providerId: 'openai', modelId: 'gpt-5' },
    piRuntime: {
      implementation: 'pi-agent-core',
      transcriptAuthority: 'pi-session',
      productMetadataAuthority: 'sqlite',
      conversationId: 'conversation-1',
      branchId: 'main',
      piSessionId: 'pi-session-1',
      writerEpoch: 1,
      workspaceLocator: { kind: 'virtual', value: '/__neko_workspaces/workspace-1' },
      lastTurn: {
        turnId: 'turn-1',
        runId: 'run-1',
        purpose: 'agent.main',
        providerId: 'openai',
        modelId: 'gpt-5',
        parametersDigest: `sha256:${'a'.repeat(64)}`,
        snapshotDigest: `sha256:${'b'.repeat(64)}`,
        protocol: 'openai-completions',
        authMechanism: 'bearer',
        credentialSource: 'environment',
        durability: 'durable',
      },
    },
    configuration: {
      digest: `sha256:${'d'.repeat(64)}`,
      runtime: { temperature: 0.7, maxTokens: 8192, thinkingBudget: 0, outputFormat: 'text' },
      chat: { providerId: 'openai', modelId: 'gpt-5' },
      modelPurposes: {},
    },
    runtimeErrors: [],
    idle: { fullyIdle: true },
    turns: [
      { id: 'u1', role: 'user', source: 'user', content: 'hello' },
      { id: 'a1', role: 'assistant', content: 'done' },
    ],
    usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16, contextTokens: 120 },
    iteration: { current: 2, max: 100 },
    tasks: [],
    retries: { taskRetryCount: 1, tasksWithRetries: 1 },
    evidenceCompleteness: {
      runtimeErrors: { limit: 256, droppedCount: 0 },
      turns: { limit: 512, droppedCount: 0 },
    },
    ...overrides,
  };
}

describe('v2 single-case orchestration', () => {
  it('runs the isolated positive pilot and writes all reports', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-pass-'));
    temporaryDirectories.push(outputRoot);
    const spawn = vi.fn(() => ({ stdout: null }));
    let workspace;
    const run = await runV2Case(await selection(), {
      outputRoot,
      runId: 'run-pass',
      spawn,
      runDriver: async ({ child, input }) => {
        expect(child).toEqual({ stdout: null });
        expect(input).toMatchObject({ sessionParams: {}, includeHistory: false });
        workspace = spawn.mock.calls[0][1].at(-1);
        expect(workspace).toContain(join('reports', 'agent-eval', '.workspaces'));
        await expect(fs.readFile(join(workspace, '.fixture-id'), 'utf8')).resolves.toContain(
          'empty-agent-eval-workspace-v1',
        );
        return facts({
          artifacts: [
            {
              ref: 'asset:scene-1',
              kind: 'generated-asset',
              digest: `sha256:${'a'.repeat(64)}`,
              provenance: { source: 'generated-asset', taskId: 'task-1' },
              deliveryStatus: 'delivered',
              validator: { id: 'durable-resource-ref', status: 'valid' },
              diagnostics: [],
            },
          ],
        });
      },
    });
    expect(run).toMatchObject({ outcome: 'pass', reportId: 'report-run-pass' });
    await expect(fs.readFile(run.files.result, 'utf8')).resolves.toContain('"outcome": "pass"');
    await expect(fs.readFile(run.files.qualityReport, 'utf8')).resolves.toContain('Hard Gates');
    await expect(fs.readFile(run.files.artifactManifest, 'utf8')).resolves.toContain(
      'asset:scene-1',
    );
    expect(run.result).toMatchObject({
      artifactRefs: ['asset:scene-1'],
      usage: { inputTokens: 12, outputTokens: 4, contextTokens: 120, retries: 1 },
    });
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['apps/neko-tui/dist/main.js', 'debug', 'automation', '--stdio', '-C', workspace],
      { cwd: process.cwd(), shell: false, stdio: ['pipe', 'pipe', 'inherit'] },
    );
    await expect(fs.stat(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves an explicit v2 debug command override', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-command-'));
    temporaryDirectories.push(outputRoot);
    const spawn = vi.fn(() => ({ stdout: null }));
    let workspace;
    const run = await runV2Case(await selection(), {
      outputRoot,
      runId: 'run-command-override',
      cwd: '/repo',
      debugCommand: 'custom-neko-debug',
      spawn,
      runDriver: async () => {
        workspace = spawn.mock.calls[0][1].at(-1);
        return facts();
      },
    });
    expect(run.outcome).toBe('pass');
    expect(spawn).toHaveBeenCalledWith(
      'custom-neko-debug',
      ['debug', 'automation', '--stdio', '-C', workspace],
      { cwd: '/repo', shell: true, stdio: ['pipe', 'pipe', 'inherit'] },
    );
  });

  it('records a negative runtime-fact pilot as case-fail', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-fail-'));
    temporaryDirectories.push(outputRoot);
    const run = await runV2Case(await selection(), {
      outputRoot,
      runId: 'run-case-fail',
      spawn: vi.fn(() => ({ stdout: null })),
      runDriver: async () =>
        facts({ runtimeErrors: [{ code: 'target-failed', message: 'failed visibly' }] }),
    });
    expect(run.outcome).toBe('case-fail');
    expect(run.result.assertions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'runtime', status: 'fail' })]),
    );
  });

  it('runs contained artifact post-checks and records validated files', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-artifact-'));
    temporaryDirectories.push(outputRoot);
    const selected = await selection();
    const content = '{"status":"complete"}\n';
    selected.scenario.artifactChecks = [
      {
        id: 'result-file',
        kind: 'file',
        evidenceRef: 'turn-facts',
        path: 'output/result.json',
        digest: `sha256:${createHash('sha256').update(content).digest('hex')}`,
        validatorId: 'json-document-v1',
      },
    ];
    const spawn = vi.fn(() => ({ stdout: null }));
    const run = await runV2Case(selected, {
      outputRoot,
      runId: 'run-artifact',
      spawn,
      runDriver: async () => {
        const workspace = spawn.mock.calls[0][1].at(-1);
        await fs.mkdir(join(workspace, 'output'), { recursive: true });
        await fs.writeFile(join(workspace, 'output/result.json'), content);
        return facts();
      },
    });
    expect(run.outcome).toBe('pass');
    expect(run.result.assertions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'result-file', status: 'pass' })]),
    );
    await expect(fs.readFile(run.files.artifactManifest, 'utf8')).resolves.toContain(
      'output/result.json',
    );
  });

  it('writes infrastructure-fail evidence when canonical execution throws', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-infra-'));
    temporaryDirectories.push(outputRoot);
    const run = await runV2Case(await selection(), {
      outputRoot,
      runId: 'run-infra-fail',
      spawn: vi.fn(() => ({ stdout: null })),
      runDriver: async () => {
        throw Object.assign(new Error('provider unavailable'), { code: 'internal-error' });
      },
    });
    expect(run.outcome).toBe('infrastructure-fail');
    await expect(fs.readFile(run.files.evidence, 'utf8')).resolves.toContain(
      'provider unavailable',
    );
  });

  it('returns configuration-invalid when requested runtime settings are not effective', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-config-'));
    temporaryDirectories.push(outputRoot);
    const selected = await selection();
    selected.suite.runtimeProfiles[0].settings = { temperature: 0.2 };
    const run = await runV2Case(selected, {
      outputRoot,
      runId: 'run-config-invalid',
      spawn: vi.fn(() => ({ stdout: null })),
      runDriver: async ({ input }) => {
        expect(input.sessionParams).toMatchObject({ runtimeConfig: { temperature: 0.2 } });
        return facts();
      },
    });
    expect(run.outcome).toBe('configuration-invalid');
    expect(run.result.effectiveConfiguration.digest).toBe(`sha256:${'d'.repeat(64)}`);
    expect(run.result.residualRisk).toEqual(
      expect.arrayContaining([expect.stringContaining('temperature was not applied')]),
    );
  });

  it('passes flat purpose bindings to the TUI session and verifies the effective projection', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-purpose-'));
    temporaryDirectories.push(outputRoot);
    const selected = await selection();
    Object.assign(selected.suite.modelProfiles[0], {
      selection: 'explicit',
      chat: { providerId: 'openai', modelId: 'gpt-5' },
      purposes: {
        'image.understand': { providerId: 'vision-provider', modelId: 'vision-config' },
      },
    });
    const run = await runV2Case(selected, {
      outputRoot,
      runId: 'run-purpose-binding',
      spawn: vi.fn(() => ({ stdout: null })),
      runDriver: async ({ input }) => {
        expect(input.sessionParams).toMatchObject({
          provider: 'openai',
          model: 'gpt-5',
          modelPurposes: {
            'image.understand': {
              providerId: 'vision-provider',
              modelId: 'vision-config',
            },
          },
        });
        const observed = facts();
        observed.configuration.modelPurposes = {
          'image.understand': {
            providerId: 'vision-provider',
            modelId: 'vision-config',
          },
        };
        return observed;
      },
    });

    expect(run.outcome).toBe('pass');
  });

  it('runs an evidence-restricted rubric Judge and writes judge.json without overriding gates', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-judge-'));
    temporaryDirectories.push(outputRoot);
    const selected = await selection();
    addJudge(selected);
    const runJudge = vi.fn(async (input) => {
      expect(input.evidence).toMatchObject({
        schema: 'neko.agent-eval.judge-evidence.v2',
        assistantOutput: 'done',
      });
      expect(JSON.stringify(input.evidence)).not.toContain('promptComposition');
      return judgeResult(input, 4.5, 0.1);
    });
    const run = await runV2Case(selected, {
      outputRoot,
      runId: 'run-judge-pass',
      spawn: vi.fn(() => ({ stdout: null })),
      runDriver: async () => facts(),
      runJudge,
    });
    expect(run.outcome).toBe('pass');
    expect(runJudge).toHaveBeenCalledOnce();
    await expect(fs.readFile(run.files.judge, 'utf8')).resolves.toContain(
      'neko.agent-eval.judge.v2',
    );
    expect(run.result.skippedStages).toEqual(['baseline']);
  });

  it('classifies Judge threshold failure and Judge infrastructure failure separately', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-judge-fail-'));
    temporaryDirectories.push(outputRoot);
    const lowSelection = await selection();
    addJudge(lowSelection);
    const low = await runV2Case(lowSelection, {
      outputRoot,
      runId: 'run-judge-low',
      spawn: vi.fn(() => ({ stdout: null })),
      runDriver: async () => facts(),
      runJudge: async (input) => judgeResult(input, 2, 0.1),
    });
    expect(low.outcome).toBe('case-fail');

    const unavailableSelection = await selection();
    addJudge(unavailableSelection);
    const unavailable = await runV2Case(unavailableSelection, {
      outputRoot,
      runId: 'run-judge-unavailable',
      spawn: vi.fn(() => ({ stdout: null })),
      runDriver: async () => facts(),
      runJudge: async () => {
        throw Object.assign(new Error('Judge unavailable'), { code: 'judge-infrastructure-fail' });
      },
    });
    expect(unavailable.outcome).toBe('infrastructure-fail');
    expect(unavailable.result.assertions.every((gate) => gate.status === 'pass')).toBe(true);
    expect(unavailable.result.residualRisk).toEqual(
      expect.arrayContaining([expect.stringContaining('Judge unavailable')]),
    );
  });

  it('retains every isolated repetition and aggregates distributions without best-run selection', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-repeated-'));
    temporaryDirectories.push(outputRoot);
    const selected = await selection();
    selected.scenario.budget.repetitions = 3;
    const spawn = vi.fn(() => ({ stdout: null }));
    const runDriver = vi.fn(async ({ sampleIndex }) => {
      const sampleFacts = facts();
      sampleFacts.turns[1].toolCalls = [
        { id: `tool-${sampleIndex}`, name: 'GetContext', status: 'success' },
      ];
      if (sampleIndex === 1) {
        sampleFacts.runtimeErrors = [{ code: 'behavior-failed', message: 'sample failed' }];
      }
      return sampleFacts;
    });
    const run = await runV2Case(selected, {
      outputRoot,
      runId: 'run-repeated',
      spawn,
      runDriver,
    });
    expect(runDriver).toHaveBeenCalledTimes(3);
    expect(run.outcome).toBe('case-fail');
    expect(run.samples.map((sample) => sample.outcome)).toEqual(['pass', 'case-fail', 'pass']);
    expect(run.aggregate).toMatchObject({
      schema: 'neko.agent-eval.repeated-run.v2',
      passRate: 2 / 3,
      scoreDistribution: { samples: 0 },
      tokens: { input: 36, output: 12 },
      cost: { status: 'unavailable' },
      iterations: { total: 6, mean: 2 },
      tools: { calls: 3, successes: 3, failures: 0 },
      retries: { count: 3 },
      tasks: { total: 0, completed: 0, failed: 0, cancelled: 0 },
    });
    expect(new Set(run.aggregate.samples.map((sample) => sample.runId)).size).toBe(3);
    await expect(fs.readFile(run.files.aggregate, 'utf8')).resolves.toContain(
      'neko.agent-eval.repeated-run.v2',
    );
    const workspaces = spawn.mock.calls.map((call) => call[1].at(-1));
    expect(new Set(workspaces).size).toBe(3);
    for (const workspace of workspaces) {
      await expect(fs.stat(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('writes baseline-diff.json and returns non-comparable for material drift', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-v2-baseline-'));
    temporaryDirectories.push(outputRoot);
    const selected = await selection();
    addJudge(selected);
    selected.suite.repositoryRevision = 'abc123';
    const current = createCurrentBaselineDescriptor({
      suite: selected.suite,
      scenario: selected.scenario,
      fixtureDigest: selected.suite.fixtures[0].digest,
      scoreDistribution: { samples: 3, passRate: 1, mean: 4, variance: 0.1 },
      reportId: 'report-baseline',
    });
    selected.baseline = createApprovedBaseline({
      id: 'baseline-1',
      current,
      approver: 'owner',
      approvedAt: '2026-07-13T00:00:00.000Z',
    });
    const comparable = await runV2Case(selected, {
      outputRoot,
      runId: 'run-baseline-comparable',
      spawn: vi.fn(() => ({ stdout: null })),
      runDriver: async () => facts(),
      runJudge: async (input) => judgeResult(input, 4.5, 0.1),
    });
    expect(comparable.outcome).toBe('pass');
    expect(comparable.baselineDiff).toMatchObject({ comparable: true, outcome: 'improved' });
    await expect(fs.readFile(comparable.files.baselineDiff, 'utf8')).resolves.toContain(
      'neko.agent-eval.comparison.v2',
    );

    selected.baseline.fixtureDigest = `sha256:${'e'.repeat(64)}`;
    const drift = await runV2Case(selected, {
      outputRoot,
      runId: 'run-baseline-drift',
      spawn: vi.fn(() => ({ stdout: null })),
      runDriver: async () => facts(),
      runJudge: async (input) => judgeResult(input, 4.5, 0.1),
    });
    expect(drift.outcome).toBe('non-comparable');
    expect(drift.baselineDiff).toMatchObject({ comparable: false, outcome: 'non-comparable' });
  });
});

function addJudge(selected) {
  selected.suite.judgeProfiles = [
    {
      id: 'quality-judge',
      adapter: 'openai-chat-completions-v1',
      providerId: 'judge-provider',
      modelId: 'judge-model',
      endpointEnv: 'JUDGE_ENDPOINT',
      apiKeyEnv: 'JUDGE_API_KEY',
      temperature: 0,
      maxTokens: 1000,
      timeoutMs: 1000,
    },
  ];
  selected.scenario.rubric = {
    kind: 'domain-rubric',
    ref: 'rubrics/answer-quality.json',
    judgeProfileId: 'quality-judge',
  };
  selected.rubrics = {
    'rubrics/answer-quality.json': {
      schema: 'neko.agent-eval.rubric.v2',
      id: 'answer-quality',
      domain: 'agent-runtime',
      version: 'v1',
      minimumScore: 4,
      maximumUncertainty: 0.3,
      criteria: [
        {
          id: 'complete',
          description: 'The answer completes the request.',
          weight: 1,
          evidenceRefs: ['turn-facts'],
        },
      ],
    },
  };
}

function judgeResult(input, overallScore, uncertainty) {
  return {
    schema: 'neko.agent-eval.judge.v2',
    reportId: input.reportId,
    suiteId: input.suiteId,
    caseId: input.caseId,
    runId: input.runId,
    providerId: 'judge-provider',
    modelId: 'judge-model',
    profileId: 'quality-judge',
    rubricId: 'answer-quality',
    rubricVersion: 'v1',
    promptHash: `sha256:${'f'.repeat(64)}`,
    sampling: { temperature: 0, maxTokens: 1000 },
    criteria: [
      {
        criterionId: 'complete',
        score: overallScore,
        evidenceRefs: ['turn-facts'],
        reason: 'Evidence-linked score.',
        uncertainty,
      },
    ],
    overallScore,
    uncertainty,
    summary: 'Quality summary.',
    disposition: 'eligible',
    usage: { inputTokens: 10, outputTokens: 5 },
  };
}
