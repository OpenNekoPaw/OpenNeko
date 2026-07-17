import { describe, expect, it } from 'vitest';
import { classifyRubricJudge, runRubricJudge } from './rubric-judge.mjs';

const PROFILE = {
  id: 'quality-judge',
  providerId: 'judge-provider',
  modelId: 'judge-model',
  temperature: 0,
  maxTokens: 1000,
};
const RUBRIC = {
  id: 'storyboard-quality',
  domain: 'storyboard',
  version: 'v1',
  minimumScore: 4,
  maximumUncertainty: 0.3,
  criteria: [
    {
      id: 'complete',
      description: 'Required fields are complete.',
      weight: 0.6,
      evidenceRefs: ['assistant-output', 'artifact-summary'],
    },
    {
      id: 'specific',
      description: 'The result is specific.',
      weight: 0.4,
      evidenceRefs: ['assistant-output'],
    },
  ],
};

describe('domain rubric Judge scoring', () => {
  it('computes weighted score and records reproducible Judge identity', async () => {
    const result = await runRubricJudge(baseInput(), {
      callProvider: async () => ({
        providerId: 'judge-provider',
        modelId: 'judge-model',
        profileId: 'quality-judge',
        content: JSON.stringify({
          criteria: [
            {
              id: 'complete',
              score: 5,
              evidenceRefs: ['assistant-output', 'artifact-summary'],
              reason: 'Complete.',
              uncertainty: 0.1,
            },
            {
              id: 'specific',
              score: 4,
              evidenceRefs: ['assistant-output'],
              reason: 'Specific.',
              uncertainty: 0.2,
            },
          ],
          summary: 'Good result.',
          uncertainty: 0.15,
        }),
        usage: { inputTokens: 20, outputTokens: 10 },
      }),
    });
    expect(result).toMatchObject({
      overallScore: 4.6,
      uncertainty: 0.14,
      disposition: 'eligible',
      providerId: 'judge-provider',
      modelId: 'judge-model',
      rubricId: 'storyboard-quality',
    });
    expect(result.promptHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(classifyRubricJudge(result, RUBRIC, baseInput().hardGates)).toEqual({
      pass: true,
      supplemental: false,
    });
  });

  it('never allows a high Judge score to override a hard-gate failure', async () => {
    const input = baseInput();
    input.hardGates[0].status = 'fail';
    const result = await runRubricJudge(input, { callProvider: perfectProvider });
    expect(result.disposition).toBe('supplemental');
    expect(classifyRubricJudge(result, RUBRIC, input.hardGates)).toMatchObject({
      pass: false,
      supplemental: true,
      reason: 'deterministic hard gate failed',
    });
  });

  it('fails quality thresholds for low score or excessive uncertainty', async () => {
    const low = await runRubricJudge(baseInput(), {
      callProvider: () => scoreProvider(3, 0.1),
    });
    expect(classifyRubricJudge(low, RUBRIC, baseInput().hardGates)).toMatchObject({
      pass: false,
      reason: 'minimum rubric score not met',
    });
    const uncertain = await runRubricJudge(baseInput(), {
      callProvider: () => scoreProvider(5, 0.8),
    });
    expect(classifyRubricJudge(uncertain, RUBRIC, baseInput().hardGates)).toMatchObject({
      pass: false,
      reason: 'Judge uncertainty exceeds policy',
    });
  });

  it.each([
    ['unknown criterion', (value) => (value.criteria[0].id = 'invented')],
    ['unauthorized evidence', (value) => value.criteria[0].evidenceRefs.push('hidden-prompt')],
    ['missing criterion', (value) => value.criteria.pop()],
    ['unknown field', (value) => (value.candidate = 'candidate-a')],
  ])('rejects malformed Judge output with %s', async (_label, mutate) => {
    const value = judgePayload(5, 0.1);
    mutate(value);
    await expect(
      runRubricJudge(baseInput(), {
        callProvider: async () => ({
          providerId: 'judge-provider',
          modelId: 'judge-model',
          profileId: 'quality-judge',
          content: JSON.stringify(value),
          usage: { inputTokens: 0, outputTokens: 0 },
        }),
      }),
    ).rejects.toMatchObject({ code: 'judge-malformed' });
  });
});

function baseInput() {
  return {
    reportId: 'report-1',
    suiteId: 'suite-1',
    caseId: 'case-1',
    runId: 'run-1',
    profile: PROFILE,
    rubric: RUBRIC,
    evidence: { schema: 'neko.agent-eval.judge-evidence.v2', assistantOutput: 'Public output.' },
    hardGates: [{ id: 'path', status: 'pass', evidenceRefs: ['runtime-facts'] }],
  };
}

async function perfectProvider() {
  return scoreProvider(5, 0.05);
}

async function scoreProvider(score, uncertainty) {
  return {
    providerId: 'judge-provider',
    modelId: 'judge-model',
    profileId: 'quality-judge',
    content: JSON.stringify(judgePayload(score, uncertainty)),
    usage: { inputTokens: 10, outputTokens: 5 },
  };
}

function judgePayload(score, uncertainty) {
  return {
    criteria: RUBRIC.criteria.map((criterion) => ({
      id: criterion.id,
      score,
      evidenceRefs: [criterion.evidenceRefs[0]],
      reason: 'Evidence-linked reason.',
      uncertainty,
    })),
    summary: 'Summary.',
    uncertainty,
  };
}
