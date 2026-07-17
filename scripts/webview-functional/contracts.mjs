import { isAbsolute, normalize, sep } from 'node:path';

export const SCENARIO_SCHEMA_VERSION = 'neko.webview-functional.scenario.v1';
export const REPORT_SCHEMA_VERSION = 'neko.webview-functional.report.v1';

const HOST_KINDS = Object.freeze(['vscode', 'electron']);
const SCENARIO_TIERS = Object.freeze(['p0', 'p1', 'p2']);
const STEP_OPERATIONS = Object.freeze([
  'wait-visible',
  'click',
  'drag',
  'input',
  'select',
  'key',
  'wait-state',
  'host-command',
  'open-file',
  'read-workspace',
  'read-diagnostics',
  'save',
  'reload',
  'restart-host',
  'hide-reveal',
  'close-reopen',
  'screenshot',
]);
const ASSERTION_KINDS = Object.freeze([
  'visible',
  'hidden',
  'text',
  'value',
  'attribute',
  'file-json',
  'file-text',
  'observation',
  'forbidden-observation',
  'diagnostic',
  'engine-result',
  'lifecycle',
  'runtime-errors',
]);

const ROOT_FIELDS = Object.freeze([
  'schemaVersion',
  'id',
  'title',
  'ownerPackage',
  'tier',
  'host',
  'platforms',
  'fixture',
  'extensions',
  'prerequisites',
  'activation',
  'target',
  'steps',
  'assertions',
  'errorPolicy',
  'evidence',
  'timeoutMs',
  'tags',
]);

export function validateScenario(input) {
  const scenario = requireRecord(input, 'scenario');
  rejectUnknownFields(scenario, ROOT_FIELDS, 'scenario');
  requireExactString(scenario.schemaVersion, SCENARIO_SCHEMA_VERSION, 'scenario.schemaVersion');
  requireIdentifier(scenario.id, 'scenario.id');
  requireNonEmptyString(scenario.title, 'scenario.title');
  requireNonEmptyString(scenario.ownerPackage, 'scenario.ownerPackage');
  requireEnum(scenario.tier, SCENARIO_TIERS, 'scenario.tier');
  requireEnum(scenario.host, HOST_KINDS, 'scenario.host');
  requireStringArray(scenario.platforms, 'scenario.platforms', {
    allowed: ['darwin', 'linux', 'win32'],
    minLength: 1,
  });
  validateFixture(scenario.fixture);
  validateExtensions(scenario.extensions, scenario.host);
  validatePrerequisites(scenario.prerequisites);
  validateActivation(scenario.activation);
  validateTarget(scenario.target, scenario.host);
  validateSteps(scenario.steps);
  validateAssertions(scenario.assertions);
  validateErrorPolicy(scenario.errorPolicy);
  validateEvidence(scenario.evidence);
  requirePositiveInteger(scenario.timeoutMs, 'scenario.timeoutMs');
  requireStringArray(scenario.tags ?? [], 'scenario.tags');

  const stepIds = new Set();
  for (const step of scenario.steps) {
    if (stepIds.has(step.id)) {
      throw new Error(`scenario.steps contains duplicate id: ${step.id}`);
    }
    stepIds.add(step.id);
  }
  const assertionIds = new Set();
  for (const assertion of scenario.assertions) {
    if (assertionIds.has(assertion.id)) {
      throw new Error(`scenario.assertions contains duplicate id: ${assertion.id}`);
    }
    assertionIds.add(assertion.id);
  }

  if (!scenario.assertions.some((assertion) => isAuthoritativeAssertion(assertion.kind))) {
    throw new Error(
      'scenario.assertions must include an authoritative result assertion (file, observation, diagnostic, engine, or lifecycle)',
    );
  }
  if (!scenario.assertions.some((assertion) => assertion.kind === 'runtime-errors')) {
    throw new Error('scenario.assertions must include a runtime-errors assertion');
  }
  return structuredClone(scenario);
}

function validateFixture(input) {
  const fixture = requireRecord(input, 'scenario.fixture');
  rejectUnknownFields(fixture, ['workspace', 'copyFrom', 'digestFiles'], 'scenario.fixture');
  requireSafeRelativePath(fixture.workspace, 'scenario.fixture.workspace');
  if (fixture.copyFrom !== undefined) {
    requireSafeRelativePath(fixture.copyFrom, 'scenario.fixture.copyFrom');
  }
  requireStringArray(fixture.digestFiles ?? [], 'scenario.fixture.digestFiles');
  for (const [index, path] of (fixture.digestFiles ?? []).entries()) {
    requireSafeRelativePath(path, `scenario.fixture.digestFiles[${index}]`);
  }
}

function validateExtensions(input, host) {
  if (host === 'electron') {
    if (input !== undefined && (!Array.isArray(input) || input.length > 0)) {
      throw new Error('Electron scenarios must not declare VS Code extension development paths');
    }
    return;
  }
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('VS Code scenarios must declare at least one extension');
  }
  for (const [index, rawExtension] of input.entries()) {
    const path = `scenario.extensions[${index}]`;
    const extension = requireRecord(rawExtension, path);
    rejectUnknownFields(extension, ['id', 'developmentPath'], path);
    requireIdentifier(extension.id, `${path}.id`);
    requireSafeRelativePath(extension.developmentPath, `${path}.developmentPath`);
  }
}

function validatePrerequisites(input) {
  if (!Array.isArray(input)) {
    throw new Error('scenario.prerequisites must be an array');
  }
  for (const [index, rawPrerequisite] of input.entries()) {
    const path = `scenario.prerequisites[${index}]`;
    const prerequisite = requireRecord(rawPrerequisite, path);
    rejectUnknownFields(
      prerequisite,
      ['kind', 'package', 'script', 'platforms', 'environmentVariable', 'state'],
      path,
    );
    requireEnum(
      prerequisite.kind,
      ['package-script', 'engine', 'environment-variable'],
      `${path}.kind`,
    );
    if (prerequisite.kind === 'package-script') {
      requireNonEmptyString(prerequisite.package, `${path}.package`);
      requireIdentifier(prerequisite.script, `${path}.script`);
    }
    if (prerequisite.kind === 'environment-variable') {
      requireIdentifier(prerequisite.environmentVariable, `${path}.environmentVariable`);
    }
    if (prerequisite.kind === 'engine') {
      requireEnum(prerequisite.state, ['ready', 'unavailable'], `${path}.state`);
    }
    requireStringArray(prerequisite.platforms ?? [], `${path}.platforms`, {
      allowed: ['darwin', 'linux', 'win32'],
    });
  }
}

function validateActivation(input) {
  const activation = requireRecord(input, 'scenario.activation');
  rejectUnknownFields(activation, ['kind', 'command', 'path', 'viewType'], 'scenario.activation');
  requireEnum(
    activation.kind,
    ['launch', 'command', 'open-file', 'open-file-command', 'open-custom-editor'],
    'scenario.activation.kind',
  );
  if (activation.kind === 'launch') {
    if (Object.keys(activation).length !== 1) {
      throw new Error('scenario.activation launch must not declare command, path, or viewType');
    }
    return;
  }
  if (activation.kind === 'command') {
    requireIdentifier(activation.command, 'scenario.activation.command');
  } else if (activation.kind === 'open-file-command') {
    requireSafeRelativePath(activation.path, 'scenario.activation.path');
    requireIdentifier(activation.command, 'scenario.activation.command');
  } else {
    requireSafeRelativePath(activation.path, 'scenario.activation.path');
    if (activation.kind === 'open-custom-editor') {
      requireIdentifier(activation.viewType, 'scenario.activation.viewType');
    }
  }
}

function validateTarget(input, host) {
  const target = requireRecord(input, 'scenario.target');
  rejectUnknownFields(
    target,
    ['extensionId', 'viewType', 'titleIncludes', 'urlIncludes', 'type'],
    'scenario.target',
  );
  requireEnum(target.type, ['page', 'iframe'], 'scenario.target.type');
  if (host === 'vscode') {
    requireIdentifier(target.extensionId, 'scenario.target.extensionId');
  } else if (target.extensionId !== undefined) {
    throw new Error('Electron targets must not declare extensionId');
  }
  for (const field of ['viewType', 'titleIncludes', 'urlIncludes']) {
    if (target[field] !== undefined) {
      requireNonEmptyString(target[field], `scenario.target.${field}`);
    }
  }
}

function validateSteps(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('scenario.steps must be a non-empty array');
  }
  for (const [index, rawStep] of input.entries()) {
    const path = `scenario.steps[${index}]`;
    const step = requireRecord(rawStep, path);
    rejectUnknownFields(
      step,
      [
        'id',
        'operation',
        'selector',
        'delta',
        'value',
        'key',
        'command',
        'args',
        'path',
        'viewType',
        'state',
        'timeoutMs',
        'screenshotName',
      ],
      path,
    );
    requireIdentifier(step.id, `${path}.id`);
    requireEnum(step.operation, STEP_OPERATIONS, `${path}.operation`);
    if (step.selector !== undefined) {
      validateSelector(step.selector, `${path}.selector`);
    }
    validateStepFields(step, path);
  }
}

function validateStepFields(step, path) {
  const selectorOperations = new Set(['wait-visible', 'click', 'drag', 'input', 'select', 'wait-state']);
  if (selectorOperations.has(step.operation) && step.selector === undefined) {
    throw new Error(`${path}.selector is required for ${step.operation}`);
  }
  if (step.operation === 'input' || step.operation === 'select') {
    requireNonEmptyString(step.value, `${path}.value`);
  }
  if (step.operation === 'drag') {
    const delta = requireRecord(step.delta, `${path}.delta`);
    rejectUnknownFields(delta, ['x', 'y'], `${path}.delta`);
    requireFiniteNumber(delta.x, `${path}.delta.x`);
    requireFiniteNumber(delta.y, `${path}.delta.y`);
    if (delta.x === 0 && delta.y === 0) {
      throw new Error(`${path}.delta must move the pointer`);
    }
  }
  if (step.operation === 'key') {
    requireNonEmptyString(step.key, `${path}.key`);
  }
  if (step.operation === 'host-command') {
    requireIdentifier(step.command, `${path}.command`);
    if (step.args !== undefined && !Array.isArray(step.args)) {
      throw new Error(`${path}.args must be an array`);
    }
  }
  if (
    ['open-file', 'read-workspace', 'read-diagnostics', 'close-reopen'].includes(step.operation)
  ) {
    requireSafeRelativePath(step.path, `${path}.path`);
  }
  if (step.viewType !== undefined) {
    if (step.operation !== 'close-reopen') {
      throw new Error(`${path}.viewType is only valid with close-reopen`);
    }
    requireIdentifier(step.viewType, `${path}.viewType`);
  }
  if (step.operation === 'wait-state') {
    const state = requireRecord(step.state, `${path}.state`);
    rejectUnknownFields(state, ['kind', 'value'], `${path}.state`);
    requireEnum(state.kind, ['visible', 'hidden', 'text', 'value', 'enabled'], `${path}.state.kind`);
    if (['text', 'value'].includes(state.kind)) {
      requireNonEmptyString(state.value, `${path}.state.value`);
    }
  }
  if (step.timeoutMs !== undefined) {
    requirePositiveInteger(step.timeoutMs, `${path}.timeoutMs`);
  }
  if (step.screenshotName !== undefined) {
    requireIdentifier(step.screenshotName, `${path}.screenshotName`);
  }
}

function validateAssertions(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('scenario.assertions must be a non-empty array');
  }
  for (const [index, rawAssertion] of input.entries()) {
    const path = `scenario.assertions[${index}]`;
    const assertion = requireRecord(rawAssertion, path);
    rejectUnknownFields(
      assertion,
      [
        'id',
        'kind',
        'selector',
        'expected',
        'attribute',
        'path',
        'jsonPath',
        'code',
        'event',
        'source',
        'correlationId',
        'stepId',
      ],
      path,
    );
    requireIdentifier(assertion.id, `${path}.id`);
    requireEnum(assertion.kind, ASSERTION_KINDS, `${path}.kind`);
    if (['visible', 'hidden', 'text', 'value', 'attribute'].includes(assertion.kind)) {
      validateSelector(assertion.selector, `${path}.selector`);
    }
    if (['file-json', 'file-text'].includes(assertion.kind)) {
      requireSafeRelativePath(assertion.path, `${path}.path`);
    }
    if (assertion.kind === 'file-json') {
      requireNonEmptyString(assertion.jsonPath, `${path}.jsonPath`);
    }
    if (assertion.kind === 'attribute') {
      requireIdentifier(assertion.attribute, `${path}.attribute`);
    }
    if (assertion.kind === 'diagnostic') {
      requireIdentifier(assertion.code, `${path}.code`);
      if (assertion.stepId !== undefined) {
        requireIdentifier(assertion.stepId, `${path}.stepId`);
      }
    }
    if (['observation', 'forbidden-observation', 'lifecycle'].includes(assertion.kind)) {
      requireIdentifier(assertion.event, `${path}.event`);
    }
    if (assertion.kind === 'engine-result') {
      const hasEvent = assertion.event !== undefined;
      const hasStep = assertion.stepId !== undefined;
      if (hasEvent === hasStep) {
        throw new Error(`${path} must declare exactly one of event or stepId`);
      }
      if (hasEvent) requireIdentifier(assertion.event, `${path}.event`);
      if (hasStep) {
        requireIdentifier(assertion.stepId, `${path}.stepId`);
        requireNonEmptyString(assertion.jsonPath, `${path}.jsonPath`);
        if (!Object.hasOwn(assertion, 'expected')) {
          throw new Error(`${path}.expected is required with stepId`);
        }
      }
    }
    if (assertion.source !== undefined) {
      requireIdentifier(assertion.source, `${path}.source`);
    }
    if (assertion.correlationId !== undefined) {
      requireIdentifier(assertion.correlationId, `${path}.correlationId`);
    }
  }
}

function validateSelector(input, path) {
  const selector = requireRecord(input, path);
  rejectUnknownFields(selector, ['role', 'name', 'testId', 'css', 'auditedSelectorReason'], path);
  const strategies = ['role', 'testId', 'css'].filter((field) => selector[field] !== undefined);
  if (strategies.length !== 1) {
    throw new Error(`${path} must declare exactly one of role, testId, or css`);
  }
  requireNonEmptyString(selector[strategies[0]], `${path}.${strategies[0]}`);
  if (selector.name !== undefined) {
    requireNonEmptyString(selector.name, `${path}.name`);
  }
  if (selector.css !== undefined) {
    requireNonEmptyString(selector.auditedSelectorReason, `${path}.auditedSelectorReason`);
  } else if (selector.auditedSelectorReason !== undefined) {
    throw new Error(`${path}.auditedSelectorReason is only valid with css`);
  }
}

function validateErrorPolicy(input) {
  const policy = requireRecord(input, 'scenario.errorPolicy');
  rejectUnknownFields(
    policy,
    ['knownBenignWarningIds', 'expectedDiagnosticCodes', 'failOnConsoleWarning'],
    'scenario.errorPolicy',
  );
  requireStringArray(policy.knownBenignWarningIds, 'scenario.errorPolicy.knownBenignWarningIds');
  requireStringArray(policy.expectedDiagnosticCodes, 'scenario.errorPolicy.expectedDiagnosticCodes');
  if (typeof policy.failOnConsoleWarning !== 'boolean') {
    throw new Error('scenario.errorPolicy.failOnConsoleWarning must be a boolean');
  }
}

function validateEvidence(input) {
  const evidence = requireRecord(input, 'scenario.evidence');
  rejectUnknownFields(
    evidence,
    ['domSnapshot', 'screenshot', 'logs', 'sideEffects'],
    'scenario.evidence',
  );
  for (const field of ['domSnapshot', 'screenshot', 'logs', 'sideEffects']) {
    if (typeof evidence[field] !== 'boolean') {
      throw new Error(`scenario.evidence.${field} must be a boolean`);
    }
  }
}

function isAuthoritativeAssertion(kind) {
  return [
    'file-json',
    'file-text',
    'observation',
    'forbidden-observation',
    'diagnostic',
    'engine-result',
    'lifecycle',
  ].includes(kind);
}

function requireSafeRelativePath(value, path) {
  requireNonEmptyString(value, path);
  const normalized = normalize(value);
  if (
    isAbsolute(value) ||
    normalized === '..' ||
    normalized.startsWith(`..${sep}`) ||
    normalized.includes(`${sep}..${sep}`)
  ) {
    throw new Error(`${path} must stay within the repository or fixture root`);
  }
}

function rejectUnknownFields(record, allowedFields, path) {
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(record).filter((field) => !allowed.has(field));
  if (unknown.length > 0) {
    throw new Error(`${path} contains unknown field(s): ${unknown.join(', ')}`);
  }
}

function requireRecord(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value;
}

function requireNonEmptyString(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function requireIdentifier(value, path) {
  requireNonEmptyString(value, path);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value)) {
    throw new Error(`${path} must be a stable identifier`);
  }
}

function requireEnum(value, values, path) {
  if (!values.includes(value)) {
    throw new Error(`${path} must be one of: ${values.join(', ')}`);
  }
}

function requireExactString(value, expected, path) {
  if (value !== expected) {
    throw new Error(`${path} must be ${expected}`);
  }
}

function requirePositiveInteger(value, path) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }
}

function requireFiniteNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
}

function requireStringArray(value, path, options = {}) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  if (options.minLength !== undefined && value.length < options.minLength) {
    throw new Error(`${path} must contain at least ${options.minLength} item(s)`);
  }
  for (const [index, item] of value.entries()) {
    requireNonEmptyString(item, `${path}[${index}]`);
    if (options.allowed && !options.allowed.includes(item)) {
      throw new Error(`${path}[${index}] must be one of: ${options.allowed.join(', ')}`);
    }
  }
}
