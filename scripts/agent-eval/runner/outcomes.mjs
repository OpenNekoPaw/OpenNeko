const EVALUATION_OUTCOMES = Object.freeze([
  'pass',
  'case-fail',
  'infrastructure-blocked',
  'infrastructure-fail',
  'configuration-invalid',
  'non-comparable',
]);

export function classifyEvaluationError(error, fallback = 'infrastructure-fail') {
  const code = readErrorCode(error);
  return EVALUATION_OUTCOMES.includes(code) ? code : fallback;
}

export function classifyEvaluationOutcomes(outcomes) {
  for (const outcome of [
    'configuration-invalid',
    'infrastructure-fail',
    'infrastructure-blocked',
    'case-fail',
    'non-comparable',
  ]) {
    if (outcomes.includes(outcome)) return outcome;
  }
  return 'pass';
}

export function evaluationExitCode(outcome) {
  if (outcome === 'pass') return 0;
  if (outcome === 'configuration-invalid') return 3;
  if (outcome === 'infrastructure-fail' || outcome === 'infrastructure-blocked') return 2;
  if (outcome === 'case-fail' || outcome === 'non-comparable') return 1;
  throw new Error(`Unknown Agent Evaluation outcome: ${outcome}`);
}

export function annotateEvaluationError(error, input) {
  if (typeof error !== 'object' || error === null) {
    return Object.assign(new Error(String(error)), input);
  }
  for (const [key, value] of Object.entries(input)) {
    if (!(key in error)) error[key] = value;
  }
  return error;
}

function readErrorCode(error) {
  return typeof error === 'object' && error !== null && typeof error.code === 'string'
    ? error.code
    : undefined;
}
