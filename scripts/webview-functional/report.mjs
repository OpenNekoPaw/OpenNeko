import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { REPORT_SCHEMA_VERSION } from './contracts.mjs';

const REDACTED = '<redacted>';
const SECRET_FIELD_PATTERN = /(authorization|cookie|credential|password|secret|token)/iu;
const SECRET_TEXT_PATTERNS = Object.freeze([
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/gu,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/giu,
]);

export function createFunctionalReport(input) {
  return redactEvidence({
    schemaVersion: REPORT_SCHEMA_VERSION,
    scenarioId: input.scenario.id,
    ownerPackage: input.scenario.ownerPackage,
    tier: input.scenario.tier,
    host: input.scenario.host,
    status: input.status,
    failureClassification: input.failureClassification,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    hostIdentity: input.hostIdentity,
    fixtureDigest: input.fixtureDigest,
    steps: input.steps,
    assertions: input.assertions,
    runtimeErrors: input.runtimeErrors,
    sideEffects: input.sideEffects,
    artifacts: input.artifacts,
  });
}

export async function writeFunctionalReport(report, outputRoot) {
  const reportDir = resolve(outputRoot, report.scenarioId, sanitizeTimestamp(report.startedAt));
  await mkdir(reportDir, { recursive: true });
  const resultPath = join(reportDir, 'result.json');
  await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { reportDir, resultPath };
}

export async function writeEvidenceFile(reportDir, relativePath, content, encoding = 'utf8') {
  const target = resolve(reportDir, relativePath);
  const relativeTarget = relative(reportDir, target);
  if (relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) {
    throw new Error(`Evidence path escapes report directory: ${relativePath}`);
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, encoding);
  return target;
}

export function redactEvidence(value, key = '') {
  if (SECRET_FIELD_PATTERN.test(key)) {
    return REDACTED;
  }
  if (typeof value === 'string') {
    return SECRET_TEXT_PATTERNS.reduce(
      (redacted, pattern) => redacted.replace(pattern, REDACTED),
      value,
    );
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactEvidence(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactEvidence(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

function sanitizeTimestamp(timestamp) {
  return timestamp.replace(/[:.]/gu, '-');
}
