import type { DesktopAgentConnectionIdentity } from '@neko/agent-contracts';
import {
  parseAutomationSessionControlCommand,
  parseAutomationSessionControlProjections,
  type AutomationSessionControlCommand,
  type AutomationSessionControlProjection,
} from '@neko/automation-contracts/session-control';
import { parseDesktopAgentConnectionIdentity } from './agent-contract';

export const DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS = {
  execute: 'openneko:desktop:automation:session-control:execute',
  changed: 'openneko:desktop:automation:session-control:changed',
} as const;

interface DesktopAutomationSessionControlRequestBase {
  readonly requestId: string;
  readonly connection: DesktopAgentConnectionIdentity;
  readonly conversationId: string;
}

export type DesktopAutomationSessionControlRequest =
  | (DesktopAutomationSessionControlRequestBase & { readonly route: 'controls.list' })
  | (DesktopAutomationSessionControlRequestBase & {
      readonly route: 'session.control';
      readonly command: AutomationSessionControlCommand;
    });

export interface DesktopAutomationSessionControlResult {
  readonly requestId: string;
  readonly route: DesktopAutomationSessionControlRequest['route'];
  readonly controls: readonly AutomationSessionControlProjection[];
}

export interface DesktopAutomationSessionControlChangedEvent {
  readonly kind: 'changed';
}

export interface OpenNekoDesktopAutomationSessionControlBridge {
  readonly automationSessionControl: {
    execute(
      request: DesktopAutomationSessionControlRequest,
    ): Promise<DesktopAutomationSessionControlResult>;
    subscribe(listener: () => void): () => void;
  };
}

export function parseDesktopAutomationSessionControlRequest(
  value: unknown,
): DesktopAutomationSessionControlRequest {
  const record = recordValue(value, 'Desktop Automation session control request');
  const requestId = identity(record['requestId'], 'Desktop Automation session control request');
  const connection = parseDesktopAgentConnectionIdentity(record['connection']);
  const conversationId = identity(
    record['conversationId'],
    'Desktop Automation session control Conversation',
  );
  switch (record['route']) {
    case 'controls.list':
      exactRecord(
        record,
        ['requestId', 'connection', 'conversationId', 'route'],
        'Desktop Automation session control request',
      );
      return { requestId, connection, conversationId, route: 'controls.list' };
    case 'session.control':
      exactRecord(
        record,
        ['requestId', 'connection', 'conversationId', 'route', 'command'],
        'Desktop Automation session control request',
      );
      return {
        requestId,
        connection,
        conversationId,
        route: 'session.control',
        command: parseAutomationSessionControlCommand(record['command']),
      };
    default:
      throw new Error('Desktop Automation session control route is invalid.');
  }
}

export function parseDesktopAutomationSessionControlResult(
  value: unknown,
  request: DesktopAutomationSessionControlRequest,
): DesktopAutomationSessionControlResult {
  const record = exactRecord(
    value,
    ['requestId', 'route', 'controls'],
    'Desktop Automation session control result',
  );
  if (record['requestId'] !== request.requestId || record['route'] !== request.route) {
    throw new Error('Desktop Automation session control result identity is stale.');
  }
  return {
    requestId: request.requestId,
    route: request.route,
    controls: parseAutomationSessionControlProjections(record['controls']),
  };
}

export function parseDesktopAutomationSessionControlChangedEvent(
  value: unknown,
): DesktopAutomationSessionControlChangedEvent {
  const record = exactRecord(value, ['kind'], 'Desktop Automation session control changed event');
  if (record['kind'] !== 'changed') {
    throw new Error('Desktop Automation session control changed event is invalid.');
  }
  return { kind: 'changed' };
}

function identity(value: unknown, label: string): string {
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
