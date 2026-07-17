import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createBlindABComparison,
  runBlindABJudge,
  writeBlindMapping,
} from './blind-comparison.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function sample(label, overrides = {}) {
  return {
    source: 'current-isolated-run',
    reportId: `report-${label}`,
    runId: `run-${label}`,
    suiteId: 'skill.creation-persona',
    caseId: 'draft-rain-station-concept',
    policyDigest: HASH,
    assistantOutput: `${label} public output that may naturally discuss a candidate choice.`,
    hardGates: [{ id: 'skill', status: 'pass', evidenceRefs: ['persona-facts'] }],
    artifactSummaries: [],
    qualityEvidence: [],
    ...overrides,
  };
}

function profile() {
  return {
    id: 'content-quality-judge',
    adapter: 'openai-chat-completions-v1',
    providerId: 'openai',
    modelId: 'gpt-5-mini',
    endpointEnv: 'JUDGE_ENDPOINT',
    apiKeyEnv: 'JUDGE_KEY',
    temperature: 0,
    maxTokens: 1_800,
    timeoutMs: 120_000,
  };
}

describe('blind A/B comparison', () => {
  it('randomizes public evidence and hides checkpoint, report, revision, build and diff identities', () => {
    const comparison = createBlindABComparison(
      {
        baseline: sample('base'),
        candidate: sample('variant'),
        rubric: { id: 'draft-quality', criteria: ['specificity', 'rationale'] },
      },
      { random: () => 0.1 },
    );
    expect(comparison.mapping).toEqual({ 'option-1': 'baseline', 'option-2': 'candidate' });
    const projection = JSON.stringify(comparison.projection);
    expect(projection).not.toContain('report-base');
    expect(projection).not.toContain('run-variant');
    expect(projection).not.toContain('repositoryRevision');
    expect(projection).not.toContain('fingerprint');
    expect(projection).not.toContain('diff --git');
  });

  it('resolves a provider-backed blind preference without exposing the mapping', async () => {
    const comparison = createBlindABComparison(
      {
        baseline: sample('base'),
        candidate: sample('variant'),
        rubric: { id: 'draft-quality' },
      },
      { random: () => 0.1 },
    );
    const judged = await runBlindABJudge(comparison, profile(), {
      callProvider: async (_profile, request) => {
        expect(request.user).not.toContain('report-base');
        expect(request.user).not.toContain('baseline');
        return {
          providerId: 'openai',
          modelId: 'gpt-5-mini',
          profileId: 'content-quality-judge',
          content: JSON.stringify({
            preferredOption: 'option-2',
            reason: 'Option 2 is more specific and causally reasoned.',
            uncertainty: 0.1,
          }),
          usage: { inputTokens: 100, outputTokens: 50 },
        };
      },
    });
    expect(judged).toMatchObject({ outcome: 'candidate-preferred', uncertainty: 0.1 });
  });

  it('rejects policy drift, historical aggregate, final-text-only and failed-gate substitutes', () => {
    expect(() =>
      createBlindABComparison({
        baseline: sample('base'),
        candidate: sample('variant', { policyDigest: `sha256:${'b'.repeat(64)}` }),
        rubric: { id: 'draft-quality' },
      }),
    ).toThrow('different execution/Judge policies');
    expect(() =>
      createBlindABComparison({
        baseline: sample('base'),
        candidate: sample('variant', { source: 'historical-aggregate' }),
        rubric: { id: 'draft-quality' },
      }),
    ).toThrow('current isolated run');
    expect(() =>
      createBlindABComparison({
        baseline: sample('base'),
        candidate: sample('variant', { hardGates: [] }),
        rubric: { id: 'draft-quality' },
      }),
    ).toThrow('hard-gate evidence');
    expect(() =>
      createBlindABComparison({
        baseline: sample('base'),
        candidate: sample('variant', {
          hardGates: [{ id: 'skill', status: 'fail', evidenceRefs: ['persona-facts'] }],
        }),
        rubric: { id: 'draft-quality' },
      }),
    ).toThrow('failed hard gate');
    expect(() =>
      createBlindABComparison({
        baseline: sample('base'),
        candidate: sample('variant', { repositoryRevision: 'secret-revision' }),
        rubric: { id: 'draft-quality' },
      }),
    ).toThrow('forbidden identity field');
  });

  it('writes the external blind order mapping outside Judge evidence', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-blind-map-'));
    temporaryDirectories.push(root);
    const comparison = createBlindABComparison(
      {
        baseline: sample('base'),
        candidate: sample('variant'),
        rubric: { id: 'draft-quality' },
      },
      { random: () => 0.9 },
    );
    const written = await writeBlindMapping(
      comparison,
      { planId: 'plan-1', runId: 'run-1' },
      { outputRoot: root },
    );
    expect(JSON.parse(await fs.readFile(written.file, 'utf8'))).toMatchObject({
      mapping: { 'option-1': 'candidate', 'option-2': 'baseline' },
      orderDigest: comparison.orderDigest,
    });
  });
});
