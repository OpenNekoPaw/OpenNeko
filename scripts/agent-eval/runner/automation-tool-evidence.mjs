const AUTOMATION_RESULT_KEYS = Object.freeze(['actionId', 'evidence', 'session']);
const AUTOMATION_SESSION_KEYS = Object.freeze([
  'mode',
  'profileId',
  'remainingSteps',
  'sessionId',
  'status',
  'targetKey',
  'targetLabel',
]);

export function assertAutomationToolResult(assertion, value) {
  const result = requireRecord(value, 'Automation Tool result');
  assertExactKeys(result, AUTOMATION_RESULT_KEYS, 'Automation Tool result');
  requireIdentity(result.actionId, 'Automation action');

  const session = requireRecord(result.session, 'Automation Tool session');
  assertExactKeys(session, AUTOMATION_SESSION_KEYS, 'Automation Tool session');
  requireIdentity(session.sessionId, 'Automation session');
  requireIdentity(session.targetKey, 'Automation target');
  if (
    session.profileId !== assertion.profileId ||
    session.targetLabel !== assertion.targetLabel ||
    session.mode !== assertion.mode ||
    session.status !== assertion.sessionStatus ||
    session.remainingSteps !== assertion.remainingSteps
  ) {
    throw new Error('Automation Tool session result does not match the expected frozen identity.');
  }

  if (!Array.isArray(result.evidence)) {
    throw new Error('Automation Tool result evidence is unavailable.');
  }
  const evidenceKinds = result.evidence.map(validateEvidence);
  for (const required of assertion.requiredEvidenceKinds) {
    if (!evidenceKinds.includes(required)) {
      throw new Error(`Automation Tool result is missing '${required}' evidence.`);
    }
  }
  if (containsRawObservationPayload(result.evidence)) {
    throw new Error('Automation Tool result contains raw observation payload.');
  }

  return {
    actionId: result.actionId,
    sessionId: session.sessionId,
    profileId: session.profileId,
    targetKey: session.targetKey,
    targetLabel: session.targetLabel,
    mode: session.mode,
    status: session.status,
    remainingSteps: session.remainingSteps,
    evidenceKinds,
    observationTransport: assertion.observationTransport,
  };
}

function validateEvidence(value) {
  const evidence = requireRecord(value, 'Automation Tool evidence');
  switch (evidence.kind) {
    case 'text':
      assertExactKeys(evidence, ['kind', 'text'], 'Automation text evidence');
      if (typeof evidence.text !== 'string' || evidence.text.length === 0) {
        throw new Error('Automation text evidence is empty.');
      }
      return evidence.kind;
    case 'structured':
      assertExactKeys(evidence, ['data', 'kind'], 'Automation structured evidence');
      requireRecord(evidence.data, 'Automation structured evidence data');
      return evidence.kind;
    case 'transient-image':
      assertExactKeys(
        evidence,
        ['height', 'kind', 'mimeType', 'receiptId', 'width'],
        'Automation transient image evidence',
      );
      requireIdentity(evidence.receiptId, 'Automation observation receipt');
      if (evidence.mimeType !== 'image/png') {
        throw new Error('Automation transient image evidence must be PNG.');
      }
      requirePositiveInteger(evidence.width, 'Automation observation width');
      requirePositiveInteger(evidence.height, 'Automation observation height');
      return evidence.kind;
    case 'mutation':
      assertExactKeys(
        evidence,
        ['kind', 'operation', 'targetKey', 'verified'],
        'Automation mutation evidence',
      );
      requireIdentity(evidence.operation, 'Automation mutation operation');
      requireIdentity(evidence.targetKey, 'Automation mutation target');
      if (evidence.verified !== true) {
        throw new Error('Automation mutation evidence is not independently verified.');
      }
      return evidence.kind;
    default:
      throw new Error(`Automation Tool evidence kind '${String(evidence.kind)}' is unsupported.`);
  }
}

function containsRawObservationPayload(value, key = '') {
  if (typeof value === 'string') {
    return (
      /^data:image\//u.test(value) ||
      /^iVBORw0KGgo/u.test(value) ||
      /^\/9j\//u.test(value) ||
      (/^(?:base64|bytes|dataurl|imagedata|screenshotdata)$/iu.test(key) && value.length > 0)
    );
  }
  if (Array.isArray(value)) {
    if (
      value.length > 16 &&
      value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
    ) {
      return true;
    }
    return value.some((item) => containsRawObservationPayload(item));
  }
  if (!value || typeof value !== 'object') return false;
  if (ArrayBuffer.isView(value)) return true;
  return Object.entries(value).some(([childKey, child]) =>
    containsRawObservationPayload(child, childKey),
  );
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new Error(`${label} fields do not match the canonical contract.`);
  }
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requireIdentity(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  ) {
    throw new Error(`${label} identity is invalid.`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}
