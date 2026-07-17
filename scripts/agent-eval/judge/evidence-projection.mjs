const ALLOWED_INPUT_KEYS = new Set([
  'userIntent',
  'target',
  'expectedResult',
  'assistantOutput',
  'artifacts',
  'qualityEvidence',
  'hardGates',
  'targetVisibility',
]);
const MAX_ASSISTANT_OUTPUT_LENGTH = 50_000;

export function createJudgeEvidenceProjection(input) {
  const unknown = Object.keys(input).filter((key) => !ALLOWED_INPUT_KEYS.has(key));
  if (unknown.length > 0) {
    throw projectionError(
      'judge-evidence-forbidden',
      `Judge evidence input contains forbidden field(s): ${unknown.join(', ')}`,
    );
  }
  for (const key of ['userIntent', 'expectedResult', 'assistantOutput']) {
    if (typeof input[key] !== 'string' || input[key].trim().length === 0) {
      throw projectionError('judge-evidence-incomplete', `Judge evidence requires ${key}`);
    }
  }
  if (
    input.targetVisibility !== undefined &&
    !['full', 'identity-only'].includes(input.targetVisibility)
  ) {
    throw projectionError(
      'judge-evidence-forbidden',
      `Judge evidence has unsupported targetVisibility: ${String(input.targetVisibility)}`,
    );
  }
  if (input.assistantOutput.length > MAX_ASSISTANT_OUTPUT_LENGTH) {
    throw projectionError(
      'judge-evidence-incomplete',
      `Assistant output exceeds Judge evidence limit ${MAX_ASSISTANT_OUTPUT_LENGTH}`,
    );
  }
  const redactions = new Map();
  const redact = (value) => redactText(value, redactions);
  return {
    schema: 'neko.agent-eval.judge-evidence.v2',
    userIntent: redact(input.userIntent),
    targetContract: {
      target: projectTarget(input.target, input.targetVisibility ?? 'full'),
      expectedResult: redact(input.expectedResult),
    },
    assistantOutput: redact(input.assistantOutput),
    artifactSummaries: (input.artifacts ?? []).map((artifact) => ({
      ref: requireString(artifact?.ref, 'artifact ref'),
      kind: requireString(artifact?.kind, 'artifact kind'),
      digest: requireString(artifact?.digest, 'artifact digest'),
      deliveryStatus: requireString(artifact?.deliveryStatus, 'artifact delivery status'),
      validatorId: requireString(artifact?.validatorId, 'artifact validator id'),
      validatorStatus: requireString(artifact?.validatorStatus, 'artifact validator status'),
    })),
    qualityEvidence: (input.qualityEvidence ?? []).map((evidence) => ({
      id: requireString(evidence?.id, 'QualityEvidence id'),
      domain: requireString(evidence?.domain, 'QualityEvidence domain'),
      summary: redact(requireString(evidence?.summary, 'QualityEvidence summary')),
      evidenceRefs: readStringArray(evidence?.evidenceRefs, 'QualityEvidence evidenceRefs'),
      ...(typeof evidence?.score === 'number' ? { score: evidence.score } : {}),
    })),
    hardGates: (input.hardGates ?? []).map((gate) => ({
      id: requireString(gate?.id, 'hard gate id'),
      status: readEnum(gate?.status, ['pass', 'fail', 'blocked'], 'hard gate status'),
      evidenceRefs: readStringArray(gate?.evidenceRefs, 'hard gate evidenceRefs'),
      ...(typeof gate?.message === 'string' ? { message: redact(gate.message) } : {}),
    })),
    redactions: [...redactions.entries()].map(([kind, count]) => ({ kind, count })),
  };
}

function projectTarget(target, visibility) {
  if (!target || typeof target !== 'object') {
    throw projectionError('judge-evidence-incomplete', 'Judge evidence requires target identity');
  }
  if (target.kind === 'skill') {
    const identity = target.identity;
    const projectedIdentity = {
      name: requireString(identity?.name, 'Skill name'),
      source: requireString(identity?.source, 'Skill source'),
      provenance: requireString(identity?.provenance, 'Skill provenance'),
      rootId: requireString(identity?.rootId, 'Skill rootId'),
      relativePath: requirePortablePath(identity?.relativePath),
    };
    return {
      kind: 'skill',
      identity:
        visibility === 'identity-only'
          ? projectedIdentity
          : {
              ...projectedIdentity,
              fingerprint: requireString(identity?.fingerprint, 'Skill fingerprint'),
            },
    };
  }
  return {
    kind: requireString(target.kind, 'target kind'),
    id: requireString(target.id, 'target id'),
    contractHash: requireString(target.contractHash, 'target contractHash'),
  };
}

function redactText(value, counts) {
  let output = value;
  output = replace(
    output,
    /\b(?:sk|key|token)-[A-Za-z0-9_-]{8,}\b/gu,
    '[REDACTED_SECRET]',
    'secret',
    counts,
  );
  output = replace(
    output,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}\b/giu,
    'Bearer [REDACTED_SECRET]',
    'secret',
    counts,
  );
  output = replace(
    output,
    /\b(?:api[_-]?key|token)\s*[:=]\s*\S+/giu,
    '[REDACTED_SECRET_ASSIGNMENT]',
    'secret',
    counts,
  );
  output = replace(
    output,
    /(?:\/Users|\/home)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/ -]+/gu,
    '[REDACTED_ABSOLUTE_PATH]',
    'absolute-path',
    counts,
  );
  output = replace(
    output,
    /\b[A-Za-z]:\\(?:[^\s\\]+\\)*[^\s\\]+/gu,
    '[REDACTED_ABSOLUTE_PATH]',
    'absolute-path',
    counts,
  );
  return output;
}

function replace(value, pattern, replacement, kind, counts) {
  let count = 0;
  const output = value.replace(pattern, () => {
    count += 1;
    return replacement;
  });
  if (count > 0) counts.set(kind, (counts.get(kind) ?? 0) + count);
  return output;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw projectionError('judge-evidence-incomplete', `Judge evidence requires ${label}`);
  }
  return value;
}

function requirePortablePath(value) {
  const path = requireString(value, 'Skill relativePath');
  if (path.startsWith('/') || path.includes('..') || path.startsWith('~')) {
    throw projectionError('judge-evidence-forbidden', 'Judge Skill path must be portable');
  }
  return path;
}

function readStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw projectionError('judge-evidence-incomplete', `Judge evidence requires ${label}`);
  }
  return value;
}

function readEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw projectionError('judge-evidence-incomplete', `Judge evidence has invalid ${label}`);
  }
  return value;
}

function projectionError(code, message) {
  return Object.assign(new Error(message), { code });
}
