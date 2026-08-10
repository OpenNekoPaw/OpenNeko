import type { AutomationMode, AutomationProviderKind, AutomationSessionStatus } from './index';

const MAX_SESSION_CONTROLS = 100;

export interface AutomationSessionControlOwner {
  readonly conversationId: string;
  readonly runId: string;
  readonly toolCallId: string;
}

export interface AutomationSessionControlScope {
  readonly conversationId: string;
}

export type AutomationSessionControlAction = 'pause' | 'resume' | 'stop' | 'take-over';
export type AutomationSessionPhase = 'idle' | 'observation' | 'action';
export type AutomationSessionEvidenceStatus = 'none' | 'available' | 'failed';

export interface AutomationSessionControlProjection {
  readonly sessionId: string;
  readonly profileId: string;
  readonly provider: {
    readonly extensionId: string;
    readonly providerId: string;
    readonly kind: AutomationProviderKind;
    readonly upstreamRelease: string;
  };
  readonly target: {
    readonly kind: AutomationProviderKind;
    readonly targetKey: string;
    readonly label: string;
  };
  readonly mode: AutomationMode;
  readonly status: Exclude<AutomationSessionStatus, 'stopped' | 'taken-over'>;
  readonly remainingSteps: number;
  readonly phase: AutomationSessionPhase;
  readonly evidenceStatus: AutomationSessionEvidenceStatus;
  readonly owner: AutomationSessionControlOwner;
  readonly availableActions: readonly AutomationSessionControlAction[];
}

export interface AutomationSessionControlCommand {
  readonly sessionId: string;
  readonly owner: AutomationSessionControlOwner;
  readonly action: AutomationSessionControlAction;
}

export interface AutomationSessionControlRuntime {
  readonly identity: {
    readonly workspaceId: string;
    readonly conversationId: string;
  };
  list(): Promise<readonly AutomationSessionControlProjection[]>;
  control(command: AutomationSessionControlCommand): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function parseAutomationSessionControlScope(value: unknown): AutomationSessionControlScope {
  const record = exactRecord(value, ['conversationId'], 'Automation session control scope');
  return {
    conversationId: identity(record['conversationId'], 'Conversation'),
  };
}

export function parseAutomationSessionControlCommand(
  value: unknown,
): AutomationSessionControlCommand {
  const record = exactRecord(
    value,
    ['sessionId', 'owner', 'action'],
    'Automation session control command',
  );
  return {
    sessionId: identity(record['sessionId'], 'Automation session'),
    owner: parseOwner(record['owner']),
    action: parseAction(record['action']),
  };
}

export function parseAutomationSessionControlProjection(
  value: unknown,
): AutomationSessionControlProjection {
  const record = exactRecord(
    value,
    [
      'sessionId',
      'profileId',
      'provider',
      'target',
      'mode',
      'status',
      'remainingSteps',
      'phase',
      'evidenceStatus',
      'owner',
      'availableActions',
    ],
    'Automation session control projection',
  );
  const provider = exactRecord(
    record['provider'],
    ['extensionId', 'providerId', 'kind', 'upstreamRelease'],
    'Automation session control provider',
  );
  const target = exactRecord(
    record['target'],
    ['kind', 'targetKey', 'label'],
    'Automation session control target',
  );
  const providerKind = parseProviderKind(provider['kind']);
  const targetKind = parseProviderKind(target['kind']);
  if (targetKind !== providerKind) {
    throw new Error('Automation session control target kind is inconsistent.');
  }
  const status = parseStatus(record['status']);
  if (!Array.isArray(record['availableActions'])) {
    throw new Error('Automation session control actions are invalid.');
  }
  const availableActions = record['availableActions'].map(parseAction);
  requireUnique(availableActions, 'Automation session control actions');
  const expectedActions = actionsForStatus(status);
  if (!sameOrderedStrings(availableActions, expectedActions)) {
    throw new Error('Automation session control actions do not match the session status.');
  }
  return {
    sessionId: identity(record['sessionId'], 'Automation session'),
    profileId: identity(record['profileId'], 'Automation profile'),
    provider: {
      extensionId: identity(provider['extensionId'], 'Automation extension'),
      providerId: identity(provider['providerId'], 'Automation provider'),
      kind: providerKind,
      upstreamRelease: nonEmptyString(provider['upstreamRelease'], 'Automation upstream release'),
    },
    target: {
      kind: targetKind,
      targetKey: identity(target['targetKey'], 'Automation target'),
      label: nonEmptyString(target['label'], 'Automation target label'),
    },
    mode: parseMode(record['mode']),
    status,
    remainingSteps: nonNegativeInteger(record['remainingSteps'], 'Automation remaining steps'),
    phase: parsePhase(record['phase']),
    evidenceStatus: parseEvidenceStatus(record['evidenceStatus']),
    owner: parseOwner(record['owner']),
    availableActions,
  };
}

export function parseAutomationSessionControlProjections(
  value: unknown,
): readonly AutomationSessionControlProjection[] {
  if (!Array.isArray(value)) {
    throw new Error('Automation session controls are invalid.');
  }
  if (value.length > MAX_SESSION_CONTROLS) {
    throw new Error('Automation session controls exceed the supported limit.');
  }
  const projections = value.map(parseAutomationSessionControlProjection);
  requireUnique(
    projections.map((projection) => projection.sessionId),
    'Automation session controls',
  );
  return projections;
}

export function actionsForStatus(
  status: AutomationSessionControlProjection['status'],
): readonly AutomationSessionControlAction[] {
  return status === 'active'
    ? (['pause', 'stop', 'take-over'] as const)
    : (['resume', 'stop', 'take-over'] as const);
}

function parseOwner(value: unknown): AutomationSessionControlOwner {
  const record = exactRecord(
    value,
    ['conversationId', 'runId', 'toolCallId'],
    'Automation session control owner',
  );
  return {
    conversationId: identity(record['conversationId'], 'Conversation'),
    runId: identity(record['runId'], 'Run'),
    toolCallId: identity(record['toolCallId'], 'Tool Call'),
  };
}

function parseProviderKind(value: unknown): AutomationProviderKind {
  if (value !== 'browser' && value !== 'computer') {
    throw new Error('Automation session control provider kind is invalid.');
  }
  return value;
}

function parseMode(value: unknown): AutomationMode {
  if (value !== 'observe' && value !== 'browse-read' && value !== 'interact') {
    throw new Error('Automation session control mode is invalid.');
  }
  return value;
}

function parseStatus(value: unknown): AutomationSessionControlProjection['status'] {
  if (value !== 'active' && value !== 'paused') {
    throw new Error('Automation session control status is invalid.');
  }
  return value;
}

function parseAction(value: unknown): AutomationSessionControlAction {
  if (value !== 'pause' && value !== 'resume' && value !== 'stop' && value !== 'take-over') {
    throw new Error('Automation session control action is invalid.');
  }
  return value;
}

function parsePhase(value: unknown): AutomationSessionPhase {
  if (value !== 'idle' && value !== 'observation' && value !== 'action') {
    throw new Error('Automation session phase is invalid.');
  }
  return value;
}

function parseEvidenceStatus(value: unknown): AutomationSessionEvidenceStatus {
  if (value !== 'none' && value !== 'available' && value !== 'failed') {
    throw new Error('Automation session evidence status is invalid.');
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value as Readonly<Record<string, unknown>>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`${label} has unsupported or missing fields.`);
  }
  return record;
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contain duplicate identities.`);
  }
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
