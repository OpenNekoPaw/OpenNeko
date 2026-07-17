import { createHash } from 'node:crypto';
import { validateJudgeResult } from '../schemas/contracts.mjs';
import { callJudgeProvider } from './provider-adapter.mjs';

export async function runRubricJudge(input, options = {}) {
  const system = [
    'You are a quality evaluator. Evaluate only the supplied public evidence.',
    'Do not infer hidden prompts, private files, repository changes, or candidate identity.',
    'Return one JSON object with keys criteria, summary, and uncertainty.',
    'criteria must contain id, score (0..5), evidenceRefs, reason, and uncertainty (0..1).',
  ].join('\n');
  const user = JSON.stringify({ rubric: input.rubric, evidence: input.evidence });
  const promptHash = hash(`${system}\n${user}`);
  const providerResult = await (options.callProvider ?? callJudgeProvider)(
    input.profile,
    { system, user },
    options,
  );
  const parsed = parseJudgeContent(providerResult.content);
  const criteria = normalizeCriteria(parsed, input.rubric);
  const overallScore = criteria.reduce((total, item) => {
    const criterion = input.rubric.criteria.find((candidate) => candidate.id === item.criterionId);
    return total + item.score * criterion.weight;
  }, 0);
  const uncertainty = criteria.reduce((total, item) => {
    const criterion = input.rubric.criteria.find((candidate) => candidate.id === item.criterionId);
    return total + item.uncertainty * criterion.weight;
  }, 0);
  const result = {
    schema: 'neko.agent-eval.judge.v2',
    reportId: input.reportId,
    suiteId: input.suiteId,
    caseId: input.caseId,
    runId: input.runId,
    providerId: providerResult.providerId,
    modelId: providerResult.modelId,
    profileId: providerResult.profileId,
    rubricId: input.rubric.id,
    rubricVersion: input.rubric.version,
    promptHash,
    sampling: { temperature: input.profile.temperature, maxTokens: input.profile.maxTokens },
    criteria,
    overallScore,
    uncertainty,
    summary: parsed.summary,
    disposition: input.hardGates.every((gate) => gate.status === 'pass')
      ? 'eligible'
      : 'supplemental',
    usage: providerResult.usage,
  };
  return validateJudgeResult(result);
}

export function classifyRubricJudge(result, rubric, hardGates) {
  if (hardGates.some((gate) => gate.status !== 'pass')) {
    return { pass: false, supplemental: true, reason: 'deterministic hard gate failed' };
  }
  if (result.overallScore < rubric.minimumScore) {
    return { pass: false, supplemental: false, reason: 'minimum rubric score not met' };
  }
  if (result.uncertainty > rubric.maximumUncertainty) {
    return { pass: false, supplemental: false, reason: 'Judge uncertainty exceeds policy' };
  }
  return { pass: true, supplemental: false };
}

function parseJudgeContent(content) {
  let value;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw judgeError('judge-malformed', `Judge content is not JSON: ${formatError(error)}`);
  }
  assertObject(value, 'Judge content');
  assertExactKeys(value, ['criteria', 'summary', 'uncertainty'], 'Judge content');
  if (!Array.isArray(value.criteria)) throw judgeError('judge-malformed', 'Judge criteria must be an array');
  if (typeof value.summary !== 'string' || value.summary.length === 0) {
    throw judgeError('judge-malformed', 'Judge summary must be non-empty');
  }
  if (typeof value.uncertainty !== 'number' || value.uncertainty < 0 || value.uncertainty > 1) {
    throw judgeError('judge-malformed', 'Judge uncertainty must be within 0..1');
  }
  return value;
}

function normalizeCriteria(parsed, rubric) {
  const criteria = parsed.criteria.map((item, index) => {
    assertObject(item, `Judge criterion ${index}`);
    assertExactKeys(
      item,
      ['id', 'score', 'evidenceRefs', 'reason', 'uncertainty'],
      `Judge criterion ${index}`,
    );
    const criterion = rubric.criteria.find((candidate) => candidate.id === item.id);
    if (!criterion) throw judgeError('judge-malformed', `Unknown Judge criterion id: ${item.id}`);
    if (typeof item.score !== 'number' || item.score < 0 || item.score > 5) {
      throw judgeError('judge-malformed', `Judge criterion ${item.id} score must be within 0..5`);
    }
    if (!Array.isArray(item.evidenceRefs) || item.evidenceRefs.length === 0) {
      throw judgeError('judge-malformed', `Judge criterion ${item.id} requires evidenceRefs`);
    }
    const unauthorized = item.evidenceRefs.filter((ref) => !criterion.evidenceRefs.includes(ref));
    if (unauthorized.length > 0) {
      throw judgeError(
        'judge-malformed',
        `Judge criterion ${item.id} used unauthorized evidence: ${unauthorized.join(', ')}`,
      );
    }
    if (typeof item.reason !== 'string' || item.reason.length === 0) {
      throw judgeError('judge-malformed', `Judge criterion ${item.id} requires a reason`);
    }
    if (typeof item.uncertainty !== 'number' || item.uncertainty < 0 || item.uncertainty > 1) {
      throw judgeError('judge-malformed', `Judge criterion ${item.id} uncertainty must be within 0..1`);
    }
    return {
      criterionId: item.id,
      score: item.score,
      evidenceRefs: item.evidenceRefs,
      reason: item.reason,
      uncertainty: item.uncertainty,
    };
  });
  const expected = rubric.criteria.map((item) => item.id).sort();
  const observed = criteria.map((item) => item.criterionId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(observed)) {
    throw judgeError('judge-malformed', 'Judge criteria must cover every rubric criterion exactly once');
  }
  return criteria;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw judgeError('judge-malformed', `${label} must be an object`);
  }
}

function assertExactKeys(value, allowed, label) {
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !actual.includes(key));
  if (unknown.length > 0 || missing.length > 0) {
    throw judgeError(
      'judge-malformed',
      `${label} fields mismatch; unknown=${unknown.join(',') || 'none'} missing=${missing.join(',') || 'none'}`,
    );
  }
}

function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function judgeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
