import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createElementStateExpression, createSelectorExpression } from './selector.mjs';

export async function runAssertion(assertion, context) {
  switch (assertion.kind) {
    case 'visible':
      return assertBoolean(
        await context.webview.evaluate(
          createElementStateExpression(assertion.selector, { kind: 'visible' }),
        ),
        assertion,
      );
    case 'hidden':
      return assertBoolean(
        await context.webview.evaluate(
          createElementStateExpression(assertion.selector, { kind: 'hidden' }),
        ),
        assertion,
      );
    case 'text':
      return assertElementValue(assertion, context, 'textContent');
    case 'value':
      return assertElementValue(assertion, context, 'value');
    case 'attribute':
      return assertElementAttribute(assertion, context);
    case 'file-text':
      return assertFileText(assertion, context.fixtureRoot);
    case 'file-json':
      return assertFileJson(assertion, context.fixtureRoot);
    case 'observation':
    case 'lifecycle':
      return assertObservation(assertion, context.observations, true);
    case 'engine-result':
      return assertion.stepId
        ? assertStepResult(assertion, context.steps)
        : assertObservation(assertion, context.observations, true);
    case 'forbidden-observation':
      return assertObservation(assertion, context.observations, false);
    case 'diagnostic':
      return assertDiagnostic(assertion, context);
    case 'runtime-errors':
      return assertBoolean(context.runtimeClassification.failures.length === 0, assertion, {
        failures: context.runtimeClassification.failures,
      });
    default:
      throw new Error(`Unsupported assertion after validation: ${assertion.kind}`);
  }
}

async function assertElementValue(assertion, context, property) {
  const elementExpression = createSelectorExpression(assertion.selector);
  const actual = await context.webview.evaluate(
    `(() => { const element = ${elementExpression}; return element ? String(element.${property} ?? '') : null; })()`,
  );
  return assertBoolean(matchesExpected(actual, assertion.expected), assertion, { actual });
}

async function assertElementAttribute(assertion, context) {
  const elementExpression = createSelectorExpression(assertion.selector);
  const attribute = JSON.stringify(assertion.attribute);
  const actual = await context.webview.evaluate(
    `(() => { const element = ${elementExpression}; return element ? element.getAttribute(${attribute}) : null; })()`,
  );
  return assertBoolean(matchesExpected(actual, assertion.expected), assertion, { actual });
}

async function assertFileText(assertion, fixtureRoot) {
  const content = await readFile(resolveWithin(fixtureRoot, assertion.path), 'utf8');
  return assertBoolean(matchesExpected(content, assertion.expected), assertion, {
    path: assertion.path,
    length: content.length,
  });
}

async function assertFileJson(assertion, fixtureRoot) {
  const content = JSON.parse(await readFile(resolveWithin(fixtureRoot, assertion.path), 'utf8'));
  const actual = readJsonPath(content, assertion.jsonPath);
  return assertBoolean(matchesExpected(actual, assertion.expected), assertion, {
    path: assertion.path,
    jsonPath: assertion.jsonPath,
    actual,
  });
}

function assertObservation(assertion, observations, expectedPresence) {
  const matches = observations.filter((observation) => {
    return (
      observation.event === assertion.event &&
      (assertion.source === undefined || observation.source === assertion.source) &&
      (assertion.correlationId === undefined || observation.correlationId === assertion.correlationId)
    );
  });
  return assertBoolean(expectedPresence ? matches.length > 0 : matches.length === 0, assertion, {
    matchCount: matches.length,
  });
}

function assertDiagnostic(assertion, context) {
  const stepDiagnostics = assertion.stepId
    ? context.steps.find((step) => step.id === assertion.stepId)?.value?.diagnostics ?? []
    : [];
  const matches = [
    ...context.observations,
    ...context.runtimeClassification.events,
    ...stepDiagnostics,
  ].filter(
    (entry) => entry.diagnosticCode === assertion.code || entry.code === assertion.code,
  );
  return assertBoolean(matches.length > 0, assertion, {
    matchCount: matches.length,
    ...(assertion.stepId ? { stepId: assertion.stepId } : {}),
  });
}

function assertStepResult(assertion, steps) {
  const step = steps.find((candidate) => candidate.id === assertion.stepId);
  if (!step) {
    return assertBoolean(false, assertion, { missingStepId: assertion.stepId });
  }
  const actual = readJsonPath(step.value, assertion.jsonPath);
  return assertBoolean(matchesExpected(actual, assertion.expected), assertion, {
    stepId: assertion.stepId,
    jsonPath: assertion.jsonPath,
    actual,
  });
}

function assertBoolean(passed, assertion, evidence = {}) {
  if (!passed) {
    const error = new Error(`Assertion ${assertion.id} (${assertion.kind}) failed`);
    error.evidence = evidence;
    throw error;
  }
  return { passed: true, evidence };
}

function matchesExpected(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (typeof expected.contains === 'string') {
      return String(actual ?? '').includes(expected.contains);
    }
    if (expected.equals !== undefined) {
      return Object.is(actual, expected.equals);
    }
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }
  return Object.is(actual, expected);
}

function readJsonPath(value, path) {
  return path.split('.').filter(Boolean).reduce((current, segment) => {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      throw new Error(`JSON path not found: ${path}`);
    }
    return current[segment];
  }, value);
}

function resolveWithin(root, relativePath) {
  const target = resolve(root, relativePath);
  if (relative(root, target).startsWith('..')) {
    throw new Error(`Assertion path escapes fixture root: ${relativePath}`);
  }
  return target;
}
