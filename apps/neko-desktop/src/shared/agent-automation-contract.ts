import type { DesktopAgentConnectionIdentity } from '@neko-agent/contracts';
import {
  parseDesktopAgentNeutralFacts,
  type DesktopAgentNeutralFacts,
} from '@neko-agent/contracts';

export const DESKTOP_AGENT_AUTOMATION_VERSION = 1 as const;
export const DESKTOP_AGENT_AUTOMATION_CHANNEL =
  'openneko:desktop:agent:automation:execute' as const;

export type DesktopAgentAutomationOperation =
  | {
      readonly kind: 'submit' | 'queue';
      readonly conversationId: string;
      readonly prompt: string;
    }
  | {
      readonly kind: 'cancel';
      readonly conversationId: string;
      readonly turnId: string;
      readonly runId: string;
    }
  | {
      readonly kind: 'confirm';
      readonly conversationId: string;
      readonly turnId: string;
      readonly runId: string;
      readonly toolCallId: string;
      readonly approved: boolean;
    }
  | {
      readonly kind: 'resume';
      readonly conversationId: string;
    }
  | {
      readonly kind: 'wait-for-idle';
      readonly conversationId: string;
      readonly timeoutMs: number;
    }
  | {
      readonly kind: 'read-facts';
      readonly conversationId: string;
      readonly turnId: string;
      readonly runId: string;
    }
  | { readonly kind: 'reload-renderer' }
  | { readonly kind: 'close-application' };

export interface DesktopAgentAutomationRequest {
  readonly schemaVersion: typeof DESKTOP_AGENT_AUTOMATION_VERSION;
  readonly requestId: string;
  readonly connection: DesktopAgentConnectionIdentity;
  readonly operation: DesktopAgentAutomationOperation;
}

export type DesktopAgentAutomationResult =
  | {
      readonly schemaVersion: typeof DESKTOP_AGENT_AUTOMATION_VERSION;
      readonly requestId: string;
      readonly status: 'accepted';
    }
  | {
      readonly schemaVersion: typeof DESKTOP_AGENT_AUTOMATION_VERSION;
      readonly requestId: string;
      readonly status: 'idle';
      readonly identity: {
        readonly conversationId: string;
        readonly turnId: string;
        readonly runId: string;
      };
    }
  | {
      readonly schemaVersion: typeof DESKTOP_AGENT_AUTOMATION_VERSION;
      readonly requestId: string;
      readonly status: 'facts';
      readonly facts: DesktopAgentNeutralFacts;
    };

export interface OpenNekoDesktopAgentAutomationBridge {
  readonly agent: {
    readonly automation?: {
      execute(operation: DesktopAgentAutomationOperation): Promise<DesktopAgentAutomationResult>;
    };
  };
}

export function createDesktopAgentAutomationRequest(
  requestId: string,
  connection: DesktopAgentConnectionIdentity,
  operation: DesktopAgentAutomationOperation,
): DesktopAgentAutomationRequest {
  return parseDesktopAgentAutomationRequest({
    schemaVersion: DESKTOP_AGENT_AUTOMATION_VERSION,
    requestId,
    connection,
    operation,
  });
}

export function parseDesktopAgentAutomationResult(
  input: unknown,
  expectedRequestId: string,
): DesktopAgentAutomationResult {
  const source = requireRecord(input, 'Desktop Agent automation result');
  const status = source['status'];
  const keys =
    status === 'idle'
      ? ['schemaVersion', 'requestId', 'status', 'identity']
      : status === 'facts'
        ? ['schemaVersion', 'requestId', 'status', 'facts']
        : ['schemaVersion', 'requestId', 'status'];
  const record = requireExactRecord(source, keys, 'Desktop Agent automation result');
  if (record['schemaVersion'] !== DESKTOP_AGENT_AUTOMATION_VERSION) {
    throw new Error('Desktop Agent automation result version is unsupported.');
  }
  const requestId = requireIdentity(record['requestId'], 'automation result request');
  if (requestId !== expectedRequestId) {
    throw new Error('Desktop Agent automation result request identity does not match.');
  }
  if (status === 'accepted') {
    return { schemaVersion: DESKTOP_AGENT_AUTOMATION_VERSION, requestId, status };
  }
  if (status === 'idle') {
    const identity = requireExactRecord(
      record['identity'],
      ['conversationId', 'turnId', 'runId'],
      'Desktop Agent automation idle identity',
    );
    return {
      schemaVersion: DESKTOP_AGENT_AUTOMATION_VERSION,
      requestId,
      status,
      identity: {
        conversationId: requireIdentity(identity['conversationId'], 'Conversation'),
        turnId: requireIdentity(identity['turnId'], 'turn'),
        runId: requireIdentity(identity['runId'], 'run'),
      },
    };
  }
  if (status === 'facts') {
    return {
      schemaVersion: DESKTOP_AGENT_AUTOMATION_VERSION,
      requestId,
      status,
      facts: parseDesktopAgentNeutralFacts(record['facts']),
    };
  }
  throw new Error('Desktop Agent automation result status is unsupported.');
}

export function parseDesktopAgentAutomationRequest(input: unknown): DesktopAgentAutomationRequest {
  const record = requireExactRecord(
    input,
    ['schemaVersion', 'requestId', 'connection', 'operation'],
    'Desktop Agent automation request',
  );
  if (record['schemaVersion'] !== DESKTOP_AGENT_AUTOMATION_VERSION) {
    throw new Error('Desktop Agent automation request version is unsupported.');
  }
  return {
    schemaVersion: DESKTOP_AGENT_AUTOMATION_VERSION,
    requestId: requireIdentity(record['requestId'], 'automation request'),
    connection: parseConnection(record['connection']),
    operation: parseOperation(record['operation']),
  };
}

export function assertDesktopAgentAutomationLaunch(input: {
  readonly fixtureLaunch: boolean;
  readonly isolatedUserData: boolean;
}): void {
  if (!input.fixtureLaunch || !input.isolatedUserData) {
    throw new Error(
      'Desktop Agent automation requires an explicit fixture launch with isolated userData.',
    );
  }
}

function parseOperation(input: unknown): DesktopAgentAutomationOperation {
  const record = requireRecord(input, 'Desktop Agent automation operation');
  switch (record['kind']) {
    case 'submit':
    case 'queue':
      requireExactKeys(
        record,
        ['kind', 'conversationId', 'prompt'],
        'automation message operation',
      );
      return {
        kind: record['kind'],
        conversationId: requireIdentity(record['conversationId'], 'Conversation'),
        prompt: requirePrompt(record['prompt']),
      };
    case 'cancel':
      requireExactKeys(
        record,
        ['kind', 'conversationId', 'turnId', 'runId'],
        'automation cancel operation',
      );
      return {
        kind: 'cancel',
        conversationId: requireIdentity(record['conversationId'], 'Conversation'),
        turnId: requireIdentity(record['turnId'], 'turn'),
        runId: requireIdentity(record['runId'], 'run'),
      };
    case 'confirm':
      requireExactKeys(
        record,
        ['kind', 'conversationId', 'turnId', 'runId', 'toolCallId', 'approved'],
        'automation confirmation operation',
      );
      if (typeof record['approved'] !== 'boolean') {
        throw new Error('Desktop Agent automation confirmation decision must be boolean.');
      }
      return {
        kind: 'confirm',
        conversationId: requireIdentity(record['conversationId'], 'Conversation'),
        turnId: requireIdentity(record['turnId'], 'turn'),
        runId: requireIdentity(record['runId'], 'run'),
        toolCallId: requireIdentity(record['toolCallId'], 'Tool Call'),
        approved: record['approved'],
      };
    case 'resume':
      requireExactKeys(record, ['kind', 'conversationId'], 'automation resume operation');
      return {
        kind: 'resume',
        conversationId: requireIdentity(record['conversationId'], 'Conversation'),
      };
    case 'wait-for-idle':
      requireExactKeys(
        record,
        ['kind', 'conversationId', 'timeoutMs'],
        'automation idle operation',
      );
      return {
        kind: 'wait-for-idle',
        conversationId: requireIdentity(record['conversationId'], 'Conversation'),
        timeoutMs: requireTimeout(record['timeoutMs']),
      };
    case 'read-facts':
      requireExactKeys(
        record,
        ['kind', 'conversationId', 'turnId', 'runId'],
        'automation facts operation',
      );
      return {
        kind: 'read-facts',
        conversationId: requireIdentity(record['conversationId'], 'Conversation'),
        turnId: requireIdentity(record['turnId'], 'turn'),
        runId: requireIdentity(record['runId'], 'run'),
      };
    case 'reload-renderer':
    case 'close-application':
      requireExactKeys(record, ['kind'], `automation ${record['kind']} operation`);
      return { kind: record['kind'] };
    default:
      throw new Error('Desktop Agent automation operation kind is unsupported.');
  }
}

function parseConnection(input: unknown): DesktopAgentConnectionIdentity {
  const record = requireExactRecord(
    input,
    [
      'applicationInstanceId',
      'windowId',
      'projectId',
      'workspaceId',
      'viewId',
      'viewEpoch',
      'rendererEpoch',
      'connectionId',
    ],
    'Desktop Agent automation connection',
  );
  return {
    applicationInstanceId: requireIdentity(record['applicationInstanceId'], 'application'),
    windowId: requireIdentity(record['windowId'], 'Window'),
    projectId: requireIdentity(record['projectId'], 'Project'),
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    viewId: requireIdentity(record['viewId'], 'View'),
    viewEpoch: requirePositiveInteger(record['viewEpoch'], 'View epoch'),
    rendererEpoch: requirePositiveInteger(record['rendererEpoch'], 'renderer epoch'),
    connectionId: requireIdentity(record['connectionId'], 'connection'),
  };
}

function requireExactRecord(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = requireRecord(input, label);
  requireExactKeys(record, keys, label);
  return record;
}

function requireRecord(input: unknown, label: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error(`${label} must be an object.`);
  }
  return input;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const expected = new Set(keys);
  const unknown = Object.keys(record).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in record));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      `${label} fields are invalid; unknown=${unknown.join(',') || 'none'} missing=${missing.join(',') || 'none'}.`,
    );
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 300) {
    throw new Error(`Desktop Agent ${label} identity is invalid.`);
  }
  return value;
}

function requirePrompt(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 100_000) {
    throw new Error('Desktop Agent automation prompt is invalid.');
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Desktop Agent ${label} must be a positive integer.`);
  }
  return value;
}

function requireTimeout(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 600_000) {
    throw new Error('Desktop Agent automation timeout must be between 1 and 600000ms.');
  }
  return value;
}
