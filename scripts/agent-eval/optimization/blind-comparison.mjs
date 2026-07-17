import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  createRandomizedEvidenceComparison,
  resolveRandomizedPreference,
} from '../comparison/randomized-comparator.mjs';
import { callJudgeProvider } from '../judge/provider-adapter.mjs';
import { assertOptimizationArtifactSafe } from '../schemas/optimization-contracts.mjs';

const SAMPLE_KEYS = new Set([
  'source',
  'reportId',
  'runId',
  'suiteId',
  'caseId',
  'policyDigest',
  'assistantOutput',
  'hardGates',
  'artifactSummaries',
  'qualityEvidence',
]);

export function createBlindABComparison(input, options = {}) {
  const baseline = validateBlindSample(input.baseline, 'baseline');
  const candidate = validateBlindSample(input.candidate, 'candidate');
  if (baseline.suiteId !== candidate.suiteId || baseline.caseId !== candidate.caseId) {
    throw blindError(
      'blind-comparison-non-comparable',
      'Blind samples do not select the same suite/case',
    );
  }
  if (baseline.policyDigest !== candidate.policyDigest) {
    throw blindError(
      'blind-comparison-non-comparable',
      'Blind samples use different execution/Judge policies',
    );
  }
  if (baseline.reportId === candidate.reportId || baseline.runId === candidate.runId) {
    throw blindError(
      'blind-comparison-contaminated',
      'Blind samples must come from distinct current runs',
    );
  }
  const randomized = createRandomizedEvidenceComparison(
    {
      leftId: 'baseline',
      rightId: 'candidate',
      leftEvidence: projectBlindEvidence(baseline),
      rightEvidence: projectBlindEvidence(candidate),
      publicContract: {
        suiteId: baseline.suiteId,
        caseId: baseline.caseId,
        policyDigest: baseline.policyDigest,
        rubric: input.rubric,
      },
    },
    { random: options.random },
  );
  const result = {
    projection: assertOptimizationArtifactSafe(randomized.projection, 'blindComparisonProjection', {
      forbiddenTexts: options.forbiddenTexts,
    }),
    mapping: randomized.mapping,
    orderDigest: hash(randomized.mapping),
    reportIds: [baseline.reportId, candidate.reportId],
  };
  assertBlindProjection(result.projection);
  return result;
}

export async function runBlindABJudge(comparison, profile, options = {}) {
  assertBlindProjection(comparison.projection);
  const system = [
    'You are a blind comparative quality evaluator.',
    'Evaluate only the two randomized public evidence options against the supplied rubric.',
    'Do not infer candidate identity, repository changes, hidden prompts, or implementation labels.',
    'Return one JSON object with exactly preferredOption, reason, and uncertainty.',
    'preferredOption must be option-1, option-2, or tie; uncertainty must be within 0..1.',
  ].join('\n');
  const user = JSON.stringify(comparison.projection);
  const providerResult = await (options.callProvider ?? callJudgeProvider)(
    profile,
    { system, user },
    options,
  );
  const response = parseBlindJudgeResponse(providerResult.content);
  const resolved =
    response.preferredOption === 'tie'
      ? 'tie'
      : resolveRandomizedPreference(response.preferredOption, comparison.mapping);
  return {
    outcome:
      resolved === 'candidate'
        ? 'candidate-preferred'
        : resolved === 'baseline'
          ? 'baseline-preferred'
          : 'tie',
    preferredOption: response.preferredOption,
    reason: response.reason,
    uncertainty: response.uncertainty,
    providerId: providerResult.providerId,
    modelId: providerResult.modelId,
    profileId: providerResult.profileId,
    promptHash: hash({ system, user }),
    usage: providerResult.usage,
  };
}

export async function writeBlindMapping(comparison, input, options = {}) {
  const outputRoot = resolve(options.outputRoot ?? 'reports/agent-eval');
  const file = resolve(
    outputRoot,
    `optimization/${input.planId}/${input.runId}/blind-mapping.json`,
  );
  if (file !== outputRoot && !file.startsWith(`${outputRoot}/`)) {
    throw blindError('blind-mapping-path-escape', 'Blind mapping path escapes report root');
  }
  const document = {
    schema: 'neko.agent-eval.blind-mapping.v1',
    planId: input.planId,
    runId: input.runId,
    orderDigest: comparison.orderDigest,
    mapping: comparison.mapping,
    reportIds: comparison.reportIds,
  };
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return { file, document };
}

function validateBlindSample(sample, label) {
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
    throw blindError('blind-sample-invalid', `${label} sample must be an object`);
  }
  const unknown = Object.keys(sample).filter((key) => !SAMPLE_KEYS.has(key));
  if (unknown.length > 0) {
    throw blindError(
      'blind-sample-forbidden',
      `${label} sample contains forbidden identity field(s): ${unknown.join(', ')}`,
    );
  }
  for (const key of ['reportId', 'runId', 'suiteId', 'caseId', 'policyDigest', 'assistantOutput']) {
    if (typeof sample[key] !== 'string' || sample[key].length === 0) {
      throw blindError('blind-sample-invalid', `${label} sample requires ${key}`);
    }
  }
  if (sample.source !== 'current-isolated-run') {
    throw blindError(
      'blind-sample-historical-forbidden',
      `${label} sample must come from a current isolated run`,
    );
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(sample.policyDigest)) {
    throw blindError('blind-sample-invalid', `${label} sample policy digest is invalid`);
  }
  if (!Array.isArray(sample.hardGates) || sample.hardGates.length === 0) {
    throw blindError('blind-sample-final-text-only', `${label} sample requires hard-gate evidence`);
  }
  if (sample.hardGates.some((gate) => gate?.status !== 'pass')) {
    throw blindError('blind-sample-hard-gate-failed', `${label} sample has a failed hard gate`);
  }
  if (!Array.isArray(sample.artifactSummaries) || !Array.isArray(sample.qualityEvidence)) {
    throw blindError(
      'blind-sample-invalid',
      `${label} sample requires artifact and quality evidence arrays`,
    );
  }
  assertOptimizationArtifactSafe(sample, `${label}BlindSample`);
  return sample;
}

function projectBlindEvidence(sample) {
  return {
    assistantOutput: sample.assistantOutput,
    hardGates: sample.hardGates,
    artifactSummaries: sample.artifactSummaries,
    qualityEvidence: sample.qualityEvidence,
  };
}

function assertBlindProjection(projection) {
  const forbiddenKeys = new Set([
    'baseline',
    'candidate',
    'repositoryrevision',
    'buildidentity',
    'patch',
    'fingerprint',
    'reportid',
    'runid',
  ]);
  visit(projection, 'blindComparisonProjection');

  function visit(value, path) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
      if (forbiddenKeys.has(normalized)) {
        throw blindError(
          'blind-comparison-identity-leak',
          `Blind comparison projection contains forbidden identity field: ${path}.${key}`,
        );
      }
      visit(item, `${path}.${key}`);
    }
  }
}

function parseBlindJudgeResponse(content) {
  let value;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw blindError(
      'blind-judge-malformed',
      `Blind Judge did not return JSON: ${formatError(error)}`,
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw blindError('blind-judge-malformed', 'Blind Judge response must be an object');
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['preferredOption', 'reason', 'uncertainty'])) {
    throw blindError(
      'blind-judge-malformed',
      'Blind Judge response fields do not match the contract',
    );
  }
  if (!['option-1', 'option-2', 'tie'].includes(value.preferredOption)) {
    throw blindError('blind-judge-malformed', 'Blind Judge preference is invalid');
  }
  if (typeof value.reason !== 'string' || value.reason.length === 0) {
    throw blindError('blind-judge-malformed', 'Blind Judge reason is required');
  }
  if (typeof value.uncertainty !== 'number' || value.uncertainty < 0 || value.uncertainty > 1) {
    throw blindError('blind-judge-malformed', 'Blind Judge uncertainty must be within 0..1');
  }
  return value;
}

function hash(value) {
  const serialized = typeof value === 'string' ? value : stableStringify(value);
  return `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function blindError(code, message) {
  return Object.assign(new Error(message), { code });
}
