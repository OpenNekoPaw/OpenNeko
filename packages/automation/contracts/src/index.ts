export type AutomationProviderKind = 'browser' | 'computer';
export type AutomationMode = 'observe' | 'browse-read' | 'interact';
export type AutomationPermission = 'screen-recording' | 'accessibility' | 'input-control';
export type AutomationSessionStatus = 'active' | 'paused' | 'stopped' | 'taken-over';

export interface AutomationProviderIdentity {
  readonly extensionId: string;
  readonly providerId: string;
  readonly kind: AutomationProviderKind;
  /** Third-party release identity qualified with the extension artifact. */
  readonly upstreamRelease: string;
}

export interface AutomationActionTrait {
  readonly effect: 'observe' | 'navigate' | 'input';
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly sensitive: boolean;
  readonly requiresApproval: boolean;
}

export interface AutomationReviewedOperation {
  readonly name: string;
  /** Digest of the exact third-party MCP input schema reviewed for this release. */
  readonly inputSchemaDigest: string;
  readonly modes: readonly AutomationMode[];
  readonly trait: AutomationActionTrait;
}

export interface AutomationProfile {
  readonly id: string;
  readonly provider: AutomationProviderIdentity;
  readonly operations: readonly AutomationReviewedOperation[];
  readonly requiredPermissions: Readonly<
    Partial<Record<AutomationMode, readonly AutomationPermission[]>>
  >;
}

export interface AutomationProviderOperation {
  readonly name: string;
  readonly inputSchemaDigest: string;
  readonly annotations: {
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
  };
}

export interface AutomationProviderInspection {
  readonly provider: AutomationProviderIdentity;
  readonly operations: readonly AutomationProviderOperation[];
}

export interface BrowserAutomationTarget {
  readonly kind: 'browser';
  readonly targetKey: string;
  readonly browserProfileId: string;
  readonly browserSessionId: string;
  readonly tabId: string;
  readonly origin: string;
  readonly allowedDomains: readonly string[];
  readonly label: string;
}

export interface ComputerAutomationTarget {
  readonly kind: 'computer';
  readonly targetKey: string;
  readonly applicationId: string;
  readonly processId: number;
  readonly windowId: string;
  readonly label: string;
  readonly region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export type AutomationTarget = BrowserAutomationTarget | ComputerAutomationTarget;

export interface AutomationSessionGrant {
  readonly grantId: string;
  readonly sessionId: string;
  readonly extensionId: string;
  readonly profileId: string;
  readonly provider: AutomationProviderIdentity;
  readonly target: AutomationTarget;
  readonly mode: AutomationMode;
  readonly timeoutMs: number;
  readonly stepBudget: number;
  readonly conversationId: string;
  readonly runId: string;
  readonly toolCallId: string;
}

export interface AutomationSessionRequest {
  readonly sessionId: string;
  readonly profileId: string;
  readonly target: AutomationTarget;
  readonly mode: AutomationMode;
  readonly timeoutMs: number;
  readonly stepBudget: number;
  readonly owner: {
    readonly conversationId: string;
    readonly runId: string;
    readonly toolCallId: string;
  };
  readonly grant: AutomationSessionGrant;
}

export interface AutomationSessionSnapshot {
  readonly sessionId: string;
  readonly profileId: string;
  readonly provider: AutomationProviderIdentity;
  readonly target: AutomationTarget;
  readonly mode: AutomationMode;
  readonly status: AutomationSessionStatus;
  readonly remainingSteps: number;
}

export interface AutomationActionRequest {
  readonly actionId: string;
  readonly sessionId: string;
  readonly operation: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface AutomationActionApproval {
  readonly approvalId: string;
  readonly actionId: string;
  readonly sessionId: string;
  readonly operation: string;
  readonly targetKey: string;
  readonly approved: boolean;
}

export type AutomationEvidence =
  | {
      readonly kind: 'text';
      readonly text: string;
    }
  | {
      readonly kind: 'structured';
      readonly data: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: 'transient-image';
      readonly receiptId: string;
      readonly mimeType: string;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly kind: 'mutation';
      readonly operation: string;
      readonly targetKey: string;
      readonly verified: boolean;
    };

export interface AutomationActionResult {
  readonly actionId: string;
  readonly session: AutomationSessionSnapshot;
  readonly evidence: readonly AutomationEvidence[];
}

export type AutomationDiagnosticCode =
  | 'provider-unavailable'
  | 'provider-mismatch'
  | 'operation-unreviewed'
  | 'operation-schema-changed'
  | 'operation-annotations-contradictory'
  | 'permission-required'
  | 'session-grant-invalid'
  | 'session-grant-replayed'
  | 'session-unavailable'
  | 'session-not-active'
  | 'step-budget-exhausted'
  | 'approval-required'
  | 'approval-invalid'
  | 'approval-replayed'
  | 'target-mismatch'
  | 'provider-failed';

export function parseAutomationProfile(value: unknown): AutomationProfile {
  const record = exactRecord(
    value,
    ['id', 'provider', 'operations', 'requiredPermissions'],
    'Automation profile',
  );
  if (!Array.isArray(record['operations']))
    throw new Error('Automation profile operations are invalid.');
  const operations = record['operations'].map(parseReviewedOperation);
  requireUnique(
    operations.map((operation) => operation.name),
    'Automation profile operations',
  );
  const requiredPermissions = parseRequiredPermissions(record['requiredPermissions']);
  return {
    id: identity(record['id'], 'Automation profile'),
    provider: parseProviderIdentity(record['provider']),
    operations,
    requiredPermissions,
  };
}

export function parseAutomationProviderInspection(value: unknown): AutomationProviderInspection {
  const record = exactRecord(value, ['provider', 'operations'], 'Automation provider inspection');
  if (!Array.isArray(record['operations']))
    throw new Error('Automation provider operations are invalid.');
  const operations = record['operations'].map((value) => {
    const operation = exactRecord(
      value,
      ['name', 'inputSchemaDigest', 'annotations'],
      'Automation provider operation',
    );
    const annotations = recordWithAllowedKeys(
      operation['annotations'],
      ['readOnlyHint', 'destructiveHint'],
      'Automation provider annotations',
    );
    return {
      name: identity(operation['name'], 'Automation provider operation'),
      inputSchemaDigest: digest(operation['inputSchemaDigest']),
      annotations: {
        ...(annotations['readOnlyHint'] === undefined
          ? {}
          : { readOnlyHint: booleanValue(annotations['readOnlyHint'], 'readOnlyHint') }),
        ...(annotations['destructiveHint'] === undefined
          ? {}
          : { destructiveHint: booleanValue(annotations['destructiveHint'], 'destructiveHint') }),
      },
    };
  });
  requireUnique(
    operations.map((operation) => operation.name),
    'Automation provider operations',
  );
  return { provider: parseProviderIdentity(record['provider']), operations };
}

export function parseAutomationSessionRequest(value: unknown): AutomationSessionRequest {
  const record = exactRecord(
    value,
    ['sessionId', 'profileId', 'target', 'mode', 'timeoutMs', 'stepBudget', 'owner', 'grant'],
    'Automation session request',
  );
  const owner = exactRecord(
    record['owner'],
    ['conversationId', 'runId', 'toolCallId'],
    'Automation owner',
  );
  return {
    sessionId: identity(record['sessionId'], 'Automation session'),
    profileId: identity(record['profileId'], 'Automation profile'),
    target: parseAutomationTarget(record['target']),
    mode: mode(record['mode']),
    timeoutMs: positiveInteger(record['timeoutMs'], 'Automation timeout'),
    stepBudget: positiveInteger(record['stepBudget'], 'Automation step budget'),
    owner: {
      conversationId: identity(owner['conversationId'], 'Conversation'),
      runId: identity(owner['runId'], 'Run'),
      toolCallId: identity(owner['toolCallId'], 'Tool Call'),
    },
    grant: parseAutomationSessionGrant(record['grant']),
  };
}

export function parseAutomationActionRequest(value: unknown): AutomationActionRequest {
  const record = exactRecord(
    value,
    ['actionId', 'sessionId', 'operation', 'arguments'],
    'Automation action request',
  );
  return {
    actionId: identity(record['actionId'], 'Automation action'),
    sessionId: identity(record['sessionId'], 'Automation session'),
    operation: identity(record['operation'], 'Automation operation'),
    arguments: recordValue(record['arguments'], 'Automation arguments'),
  };
}

export function parseAutomationActionApproval(value: unknown): AutomationActionApproval {
  const record = exactRecord(
    value,
    ['approvalId', 'actionId', 'sessionId', 'operation', 'targetKey', 'approved'],
    'Automation action approval',
  );
  return {
    approvalId: identity(record['approvalId'], 'Automation approval'),
    actionId: identity(record['actionId'], 'Automation action'),
    sessionId: identity(record['sessionId'], 'Automation session'),
    operation: identity(record['operation'], 'Automation operation'),
    targetKey: identity(record['targetKey'], 'Automation target'),
    approved: booleanValue(record['approved'], 'Automation approval decision'),
  };
}

export function sameAutomationTarget(left: AutomationTarget, right: AutomationTarget): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'browser' && right.kind === 'browser') {
    return (
      left.targetKey === right.targetKey &&
      left.browserProfileId === right.browserProfileId &&
      left.browserSessionId === right.browserSessionId &&
      left.tabId === right.tabId &&
      left.origin === right.origin &&
      sameOrderedStrings(left.allowedDomains, right.allowedDomains) &&
      left.label === right.label
    );
  }
  if (left.kind === 'computer' && right.kind === 'computer') {
    return (
      left.targetKey === right.targetKey &&
      left.applicationId === right.applicationId &&
      left.processId === right.processId &&
      left.windowId === right.windowId &&
      left.label === right.label &&
      left.region.x === right.region.x &&
      left.region.y === right.region.y &&
      left.region.width === right.region.width &&
      left.region.height === right.region.height
    );
  }
  return false;
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseProviderIdentity(value: unknown): AutomationProviderIdentity {
  const record = exactRecord(
    value,
    ['extensionId', 'providerId', 'kind', 'upstreamRelease'],
    'Automation provider identity',
  );
  const kind = record['kind'];
  if (kind !== 'browser' && kind !== 'computer')
    throw new Error('Automation provider kind is invalid.');
  return {
    extensionId: identity(record['extensionId'], 'Automation extension'),
    providerId: identity(record['providerId'], 'Automation provider'),
    kind,
    upstreamRelease: nonEmptyString(record['upstreamRelease'], 'Automation upstream release'),
  };
}

function parseReviewedOperation(value: unknown): AutomationReviewedOperation {
  const record = exactRecord(
    value,
    ['name', 'inputSchemaDigest', 'modes', 'trait'],
    'Automation reviewed operation',
  );
  if (!Array.isArray(record['modes']) || record['modes'].length === 0) {
    throw new Error('Automation reviewed operation modes are invalid.');
  }
  const modes = record['modes'].map(mode);
  requireUnique(modes, 'Automation reviewed operation modes');
  const trait = exactRecord(
    record['trait'],
    ['effect', 'readOnly', 'destructive', 'sensitive', 'requiresApproval'],
    'Automation action trait',
  );
  const effect = trait['effect'];
  if (effect !== 'observe' && effect !== 'navigate' && effect !== 'input') {
    throw new Error('Automation action effect is invalid.');
  }
  const parsedTrait: AutomationActionTrait = {
    effect,
    readOnly: booleanValue(trait['readOnly'], 'Automation read-only trait'),
    destructive: booleanValue(trait['destructive'], 'Automation destructive trait'),
    sensitive: booleanValue(trait['sensitive'], 'Automation sensitive trait'),
    requiresApproval: booleanValue(trait['requiresApproval'], 'Automation approval trait'),
  };
  if (
    (effect === 'observe') !== parsedTrait.readOnly ||
    (effect === 'input' && !parsedTrait.requiresApproval)
  ) {
    throw new Error('Automation action traits are contradictory.');
  }
  return {
    name: identity(record['name'], 'Automation reviewed operation'),
    inputSchemaDigest: digest(record['inputSchemaDigest']),
    modes,
    trait: parsedTrait,
  };
}

function parseRequiredPermissions(value: unknown): AutomationProfile['requiredPermissions'] {
  const record = recordWithAllowedKeys(
    value,
    ['observe', 'browse-read', 'interact'],
    'Automation required permissions',
  );
  const result: Partial<Record<AutomationMode, readonly AutomationPermission[]>> = {};
  for (const currentMode of ['observe', 'browse-read', 'interact'] as const) {
    const permissions = record[currentMode];
    if (permissions === undefined) continue;
    if (!Array.isArray(permissions))
      throw new Error('Automation required permissions are invalid.');
    const parsed = permissions.map(permission);
    requireUnique(parsed, 'Automation required permissions');
    result[currentMode] = parsed;
  }
  return result;
}

export function parseAutomationSessionGrant(value: unknown): AutomationSessionGrant {
  const record = exactRecord(
    value,
    [
      'grantId',
      'sessionId',
      'extensionId',
      'profileId',
      'provider',
      'target',
      'mode',
      'timeoutMs',
      'stepBudget',
      'conversationId',
      'runId',
      'toolCallId',
    ],
    'Automation session grant',
  );
  return {
    grantId: identity(record['grantId'], 'Automation session grant'),
    sessionId: identity(record['sessionId'], 'Automation session'),
    extensionId: identity(record['extensionId'], 'Automation extension'),
    profileId: identity(record['profileId'], 'Automation profile'),
    provider: parseProviderIdentity(record['provider']),
    target: parseAutomationTarget(record['target']),
    mode: mode(record['mode']),
    timeoutMs: positiveInteger(record['timeoutMs'], 'Automation timeout'),
    stepBudget: positiveInteger(record['stepBudget'], 'Automation step budget'),
    conversationId: identity(record['conversationId'], 'Conversation'),
    runId: identity(record['runId'], 'Run'),
    toolCallId: identity(record['toolCallId'], 'Tool Call'),
  };
}

export function parseAutomationTarget(value: unknown): AutomationTarget {
  const source = recordValue(value, 'Automation target');
  if (source['kind'] === 'browser') {
    const record = exactRecord(
      source,
      [
        'kind',
        'targetKey',
        'browserProfileId',
        'browserSessionId',
        'tabId',
        'origin',
        'allowedDomains',
        'label',
      ],
      'Browser automation target',
    );
    const origin = nonEmptyString(record['origin'], 'Browser target origin');
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
      throw new Error('Browser target origin is invalid.');
    }
    if (!Array.isArray(record['allowedDomains']) || record['allowedDomains'].length === 0) {
      throw new Error('Browser target allowed domains are invalid.');
    }
    const allowedDomains = record['allowedDomains'].map(parseDomain);
    requireUnique(allowedDomains, 'Browser target allowed domains');
    if (!allowedDomains.includes(url.hostname)) {
      throw new Error('Browser target origin is outside the allowed domains.');
    }
    return {
      kind: 'browser',
      targetKey: identity(record['targetKey'], 'Automation target'),
      browserProfileId: identity(record['browserProfileId'], 'Browser profile'),
      browserSessionId: identity(record['browserSessionId'], 'Browser session'),
      tabId: identity(record['tabId'], 'Browser tab'),
      origin,
      allowedDomains,
      label: nonEmptyString(record['label'], 'Browser target label'),
    };
  }
  if (source['kind'] === 'computer') {
    const record = exactRecord(
      source,
      ['kind', 'targetKey', 'applicationId', 'processId', 'windowId', 'label', 'region'],
      'Computer automation target',
    );
    const region = exactRecord(
      record['region'],
      ['x', 'y', 'width', 'height'],
      'Computer target region',
    );
    return {
      kind: 'computer',
      targetKey: identity(record['targetKey'], 'Automation target'),
      applicationId: identity(record['applicationId'], 'Application'),
      processId: positiveInteger(record['processId'], 'Process'),
      windowId: identity(record['windowId'], 'Window'),
      label: nonEmptyString(record['label'], 'Computer target label'),
      region: {
        x: finiteNumber(region['x'], 'Computer target x'),
        y: finiteNumber(region['y'], 'Computer target y'),
        width: positiveNumber(region['width'], 'Computer target width'),
        height: positiveNumber(region['height'], 'Computer target height'),
      },
    };
  }
  throw new Error('Automation target kind is invalid.');
}

function parseDomain(value: unknown): string {
  const result = nonEmptyString(value, 'Browser allowed domain');
  const parsed = new URL(`https://${result}`);
  if (
    parsed.host !== result ||
    parsed.port !== '' ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'Browser allowed domain must be a canonical host without scheme, port or path.',
    );
  }
  return parsed.hostname;
}

function mode(value: unknown): AutomationMode {
  if (value !== 'observe' && value !== 'browse-read' && value !== 'interact') {
    throw new Error('Automation mode is invalid.');
  }
  return value;
}

function permission(value: unknown): AutomationPermission {
  if (value !== 'screen-recording' && value !== 'accessibility' && value !== 'input-control') {
    throw new Error('Automation permission is invalid.');
  }
  return value;
}

function digest(value: unknown): string {
  const result = nonEmptyString(value, 'Automation schema digest');
  if (!/^sha256:[0-9a-f]{64}$/u.test(result))
    throw new Error('Automation schema digest is invalid.');
  return result;
}

function identity(value: unknown, label: string): string {
  const result = nonEmptyString(value, `${label} identity`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(result))
    throw new Error(`${label} identity is invalid.`);
  return result;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = recordValue(value, label);
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !keys.includes(key))
  ) {
    throw new Error(`${label} has unsupported or missing fields.`);
  }
  return record;
}

function recordWithAllowedKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = recordValue(value, label);
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw new Error(`${label} has unsupported fields.`);
  }
  return record;
}

function recordValue(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${label} is required.`);
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${label} must be finite.`);
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  const result = finiteNumber(value, label);
  if (result <= 0) throw new Error(`${label} must be positive.`);
  return result;
}
