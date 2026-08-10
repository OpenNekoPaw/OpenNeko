import {
  parseAutomationProviderIdentity,
  type AutomationMode,
  type AutomationProviderIdentity,
} from './index';

const MAX_TARGET_SELECTION_ITEMS = 100;

export interface AutomationTargetSelectionOwner {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly toolCallId: string;
}

export type AutomationTargetSelectionCandidate =
  | {
      readonly kind: 'browser';
      readonly targetKey: string;
      readonly label: string;
      readonly origin: string;
      readonly allowedDomains: readonly string[];
    }
  | {
      readonly kind: 'computer';
      readonly targetKey: string;
      readonly label: string;
      readonly region: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      };
    };

export interface AutomationTargetSelectionProjection {
  readonly authorizationId: string;
  readonly profileId: string;
  readonly provider: AutomationProviderIdentity;
  readonly mode: AutomationMode;
  readonly timeoutMs: number;
  readonly stepBudget: number;
  readonly owner: AutomationTargetSelectionOwner;
  readonly candidates: readonly AutomationTargetSelectionCandidate[];
}

export interface AutomationTargetSelectionResult {
  readonly authorizationId: string;
  readonly targetKey: string;
}

export type AutomationTargetSelectionDecision =
  | (AutomationTargetSelectionResult & { readonly decision: 'select' })
  | { readonly authorizationId: string; readonly decision: 'cancel' };

export interface AutomationTargetSelectionRuntime {
  readonly identity: Pick<AutomationTargetSelectionOwner, 'workspaceId' | 'conversationId'>;
  listPending(): Promise<readonly AutomationTargetSelectionProjection[]>;
  resolve(decision: AutomationTargetSelectionDecision): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function parseAutomationTargetSelectionProjection(
  value: unknown,
): AutomationTargetSelectionProjection {
  const record = exactRecord(
    value,
    [
      'authorizationId',
      'profileId',
      'provider',
      'mode',
      'timeoutMs',
      'stepBudget',
      'owner',
      'candidates',
    ],
    'Automation target selection projection',
  );
  if (
    !Array.isArray(record['candidates']) ||
    record['candidates'].length === 0 ||
    record['candidates'].length > MAX_TARGET_SELECTION_ITEMS
  ) {
    throw new Error('Automation target selection candidates are invalid.');
  }
  const candidates = record['candidates'].map(parseCandidate);
  requireUnique(
    candidates.map((candidate) => candidate.targetKey),
    'Automation target selection candidates',
  );
  const provider = parseAutomationProviderIdentity(record['provider']);
  if (candidates.some((candidate) => candidate.kind !== provider.kind)) {
    throw new Error('Automation target selection candidate kind is inconsistent.');
  }
  return {
    authorizationId: identity(record['authorizationId'], 'Automation target authorization'),
    profileId: identity(record['profileId'], 'Automation profile'),
    provider,
    mode: parseMode(record['mode']),
    timeoutMs: positiveInteger(record['timeoutMs'], 'Automation timeout'),
    stepBudget: positiveInteger(record['stepBudget'], 'Automation step budget'),
    owner: parseOwner(record['owner']),
    candidates,
  };
}

export function parseAutomationTargetSelectionProjections(
  value: unknown,
): readonly AutomationTargetSelectionProjection[] {
  if (!Array.isArray(value)) {
    throw new Error('Automation target selections are invalid.');
  }
  if (value.length > MAX_TARGET_SELECTION_ITEMS) {
    throw new Error('Automation target selections exceed the supported limit.');
  }
  const projections = value.map(parseAutomationTargetSelectionProjection);
  requireUnique(
    projections.map((projection) => projection.authorizationId),
    'Automation target selections',
  );
  return projections;
}

export function parseAutomationTargetSelectionResult(
  value: unknown,
): AutomationTargetSelectionResult {
  const record = exactRecord(
    value,
    ['authorizationId', 'targetKey'],
    'Automation target selection result',
  );
  return {
    authorizationId: identity(record['authorizationId'], 'Automation target authorization'),
    targetKey: identity(record['targetKey'], 'Automation target'),
  };
}

export function parseAutomationTargetSelectionDecision(
  value: unknown,
): AutomationTargetSelectionDecision {
  const record = recordValue(value, 'Automation target selection decision');
  switch (record['decision']) {
    case 'select': {
      const selected = exactRecord(
        record,
        ['authorizationId', 'decision', 'targetKey'],
        'Automation target selection decision',
      );
      return {
        authorizationId: identity(selected['authorizationId'], 'Automation target authorization'),
        decision: 'select',
        targetKey: identity(selected['targetKey'], 'Automation target'),
      };
    }
    case 'cancel': {
      const cancelled = exactRecord(
        record,
        ['authorizationId', 'decision'],
        'Automation target selection decision',
      );
      return {
        authorizationId: identity(cancelled['authorizationId'], 'Automation target authorization'),
        decision: 'cancel',
      };
    }
    default:
      throw new Error('Automation target selection decision is invalid.');
  }
}

function parseOwner(value: unknown): AutomationTargetSelectionOwner {
  const record = exactRecord(
    value,
    ['workspaceId', 'conversationId', 'runId', 'toolCallId'],
    'Automation target selection owner',
  );
  return {
    workspaceId: identity(record['workspaceId'], 'Workspace'),
    conversationId: identity(record['conversationId'], 'Conversation'),
    runId: identity(record['runId'], 'Run'),
    toolCallId: identity(record['toolCallId'], 'Tool Call'),
  };
}

function parseCandidate(value: unknown): AutomationTargetSelectionCandidate {
  const source = recordValue(value, 'Automation target selection candidate');
  if (source['kind'] === 'browser') {
    const record = exactRecord(
      source,
      ['kind', 'targetKey', 'label', 'origin', 'allowedDomains'],
      'Browser target selection candidate',
    );
    const origin = nonEmptyString(record['origin'], 'Browser target origin');
    const parsedOrigin = new URL(origin);
    if (
      parsedOrigin.origin !== origin ||
      (parsedOrigin.protocol !== 'https:' && parsedOrigin.protocol !== 'http:')
    ) {
      throw new Error('Browser target origin is invalid.');
    }
    if (!Array.isArray(record['allowedDomains']) || record['allowedDomains'].length === 0) {
      throw new Error('Browser target allowed domains are invalid.');
    }
    const allowedDomains = record['allowedDomains'].map(parseDomain);
    requireUnique(allowedDomains, 'Browser target allowed domains');
    if (!allowedDomains.includes(parsedOrigin.hostname)) {
      throw new Error('Browser target origin is outside the allowed domains.');
    }
    return {
      kind: 'browser',
      targetKey: identity(record['targetKey'], 'Automation target'),
      label: nonEmptyString(record['label'], 'Browser target label'),
      origin,
      allowedDomains,
    };
  }
  if (source['kind'] === 'computer') {
    const record = exactRecord(
      source,
      ['kind', 'targetKey', 'label', 'region'],
      'Computer target selection candidate',
    );
    const region = exactRecord(
      record['region'],
      ['x', 'y', 'width', 'height'],
      'Computer target selection region',
    );
    return {
      kind: 'computer',
      targetKey: identity(record['targetKey'], 'Automation target'),
      label: nonEmptyString(record['label'], 'Computer target label'),
      region: {
        x: finiteNumber(region['x'], 'Computer target x'),
        y: finiteNumber(region['y'], 'Computer target y'),
        width: positiveNumber(region['width'], 'Computer target width'),
        height: positiveNumber(region['height'], 'Computer target height'),
      },
    };
  }
  throw new Error('Automation target selection candidate kind is invalid.');
}

function parseMode(value: unknown): AutomationMode {
  if (value !== 'observe' && value !== 'browse-read' && value !== 'interact') {
    throw new Error('Automation target selection mode is invalid.');
  }
  return value;
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

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  const result = finiteNumber(value, label);
  if (result <= 0) throw new Error(`${label} is invalid.`);
  return result;
}

function identity(value: unknown, label: string): string {
  const result = nonEmptyString(value, `${label} identity`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(result)) {
    throw new Error(`${label} identity is invalid.`);
  }
  return result;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = recordValue(value, label);
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`${label} has unsupported or missing fields.`);
  }
  return record;
}

function recordValue(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contain duplicate identities.`);
  }
}
