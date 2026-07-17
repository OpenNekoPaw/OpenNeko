export const RAW_RETENTION_POLICY = Object.freeze({
  localReportDirectory: 'reports/agent-eval',
  localRetentionDays: 14,
  trustedCiRetentionDays: 14,
  committedRetention: 'approved-sanitized-only',
});

export const EVIDENCE_ALLOWLISTS = deepFreeze({
  prompt: {
    rawLocal: ['user-authored-content'],
    judge: ['user-intent', 'public-target-contract', 'assistant-output'],
    committed: ['user-intent-summary', 'prompt-hash'],
    never: ['hidden-prompt-body', 'system-prompt-body', 'skill-injected-body'],
  },
  promptComposition: {
    rawLocal: ['fragment-id', 'source', 'order', 'version', 'hash'],
    judge: [],
    committed: ['fragment-id', 'source', 'order', 'version', 'hash'],
    never: ['fragment-body'],
  },
  history: {
    rawLocal: ['user-turn', 'assistant-turn', 'public-tool-summary'],
    judge: ['user-intent', 'assistant-output'],
    committed: ['turn-id', 'role', 'source', 'content-hash'],
    never: ['system-turn-body', 'internal-continuation-prompt', 'provider-request-body'],
  },
  providerConfiguration: {
    rawLocal: ['provider-id', 'model-id', 'profile-id', 'configuration-digest'],
    judge: ['provider-id', 'model-id', 'profile-id'],
    committed: ['provider-id', 'model-id', 'profile-id', 'configuration-digest'],
    never: [
      'api-key',
      'authorization-header',
      'cookie',
      'raw-provider-config',
      'secret-bearing-url',
    ],
  },
  logs: {
    rawLocal: ['typed-diagnostic', 'redacted-message', 'timestamp', 'runtime-component'],
    judge: ['typed-diagnostic-code', 'hard-gate-summary'],
    committed: ['typed-diagnostic-code', 'severity', 'evidence-ref'],
    never: ['unredacted-log-line', 'environment-dump', 'request-header', 'response-body'],
  },
  paths: {
    rawLocal: ['fixture-relative-path', 'report-relative-path', 'stable-resource-ref'],
    judge: ['fixture-relative-path', 'stable-resource-ref'],
    committed: ['fixture-relative-path', 'stable-resource-ref'],
    never: ['absolute-user-path', 'cache-path', 'webview-uri', 'runtime-handle', 'temp-path'],
  },
  artifactSummary: {
    rawLocal: [
      'stable-ref',
      'relative-path',
      'kind',
      'format',
      'digest',
      'revision',
      'provenance',
      'delivery-status',
      'validator-id',
      'validator-status',
      'quality-evidence',
    ],
    judge: [
      'stable-ref',
      'kind',
      'format',
      'digest',
      'provenance',
      'validator-status',
      'quality-evidence',
    ],
    committed: [
      'stable-ref',
      'relative-path',
      'kind',
      'format',
      'digest',
      'revision',
      'provenance',
      'delivery-status',
      'validator-id',
      'validator-status',
      'approved-quality-summary',
    ],
    never: ['binary-payload', 'cache-identity', 'runtime-token', 'unauthorized-file-content'],
  },
  rawReport: {
    rawLocal: [
      'result',
      'evidence',
      'artifact-manifest',
      'judge',
      'baseline-diff',
      'quality-report',
    ],
    judge: [],
    committed: [],
    never: ['credential', 'hidden-prompt', 'unauthorized-content'],
  },
  committedBaseline: {
    rawLocal: [],
    judge: [],
    committed: [
      'target-identity',
      'target-fingerprint',
      'repository-revision',
      'fixture-digest',
      'runtime-profile-id',
      'model-profile-id',
      'sampling-policy',
      'budget-policy',
      'validator-policy',
      'judge-policy',
      'hard-gate-results',
      'score-distribution',
      'report-id',
      'approver',
      'approval-time',
      'sanitized-evidence-refs',
    ],
    never: ['raw-sample', 'raw-history', 'raw-log', 'candidate-label', 'repository-diff'],
  },
});

const SECRET_FIELD_NAMES = Object.freeze([
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'credentials',
  'password',
  'secret',
  'token',
]);

export function assertShareableEvidence(value, label = 'shareableEvidence') {
  visit(value, label);
  return value;
}

function visit(value, path) {
  if (typeof value === 'string') {
    if (isAbsoluteUserPath(value)) {
      throw new Error(`${path} contains a machine-specific absolute path`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (isSecretFieldName(key)) {
      throw new Error(`${path}.${key} is not allowed in shareable evidence`);
    }
    visit(item, `${path}.${key}`);
  }
}

function isSecretFieldName(key) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
  return SECRET_FIELD_NAMES.some((name) => {
    const candidate = name.toLowerCase().replace(/[^a-z0-9]/gu, '');
    if (candidate === 'token') {
      return (
        normalized === 'token' || (normalized.endsWith('token') && !normalized.endsWith('tokens'))
      );
    }
    return normalized.includes(candidate);
  });
}

function isAbsoluteUserPath(value) {
  return (
    value.startsWith('/Users/') ||
    value.startsWith('/home/') ||
    /^[A-Za-z]:[\\/]Users[\\/]/u.test(value)
  );
}

function deepFreeze(value) {
  Object.values(value).forEach((item) => {
    if (item && typeof item === 'object') deepFreeze(item);
  });
  return Object.freeze(value);
}
