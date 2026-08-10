import type { DesktopAgentConnectionIdentity } from '@neko/agent-contracts';
import {
  parseAutomationTargetSelectionDecision,
  parseAutomationTargetSelectionProjections,
  type AutomationTargetSelectionDecision,
  type AutomationTargetSelectionProjection,
} from '@neko/automation-contracts/target-selection';
import { parseDesktopAgentConnectionIdentity } from './agent-contract';

export const DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS = {
  execute: 'openneko:desktop:automation:target-selection:execute',
  changed: 'openneko:desktop:automation:target-selection:changed',
} as const;

interface DesktopAutomationTargetSelectionRequestBase {
  readonly requestId: string;
  readonly connection: DesktopAgentConnectionIdentity;
  readonly conversationId: string;
}

export type DesktopAutomationTargetSelectionRequest =
  | (DesktopAutomationTargetSelectionRequestBase & { readonly route: 'pending.list' })
  | (DesktopAutomationTargetSelectionRequestBase & {
      readonly route: 'selection.resolve';
      readonly decision: AutomationTargetSelectionDecision;
    });

export interface DesktopAutomationTargetSelectionResult {
  readonly requestId: string;
  readonly route: DesktopAutomationTargetSelectionRequest['route'];
  readonly pending: readonly AutomationTargetSelectionProjection[];
}

export interface DesktopAutomationTargetSelectionChangedEvent {
  readonly kind: 'changed';
}

export interface OpenNekoDesktopAutomationTargetSelectionBridge {
  readonly automationTargetSelection: {
    execute(
      request: DesktopAutomationTargetSelectionRequest,
    ): Promise<DesktopAutomationTargetSelectionResult>;
    subscribe(listener: () => void): () => void;
  };
}

export function parseDesktopAutomationTargetSelectionRequest(
  value: unknown,
): DesktopAutomationTargetSelectionRequest {
  const record = recordValue(value, 'Desktop Automation target selection request');
  const requestId = identity(record['requestId'], 'Desktop Automation target selection request');
  const connection = parseDesktopAgentConnectionIdentity(record['connection']);
  const conversationId = identity(
    record['conversationId'],
    'Desktop Automation target selection Conversation',
  );
  switch (record['route']) {
    case 'pending.list':
      exactRecord(
        record,
        ['requestId', 'connection', 'conversationId', 'route'],
        'Desktop Automation target selection request',
      );
      return { requestId, connection, conversationId, route: 'pending.list' };
    case 'selection.resolve':
      exactRecord(
        record,
        ['requestId', 'connection', 'conversationId', 'route', 'decision'],
        'Desktop Automation target selection request',
      );
      return {
        requestId,
        connection,
        conversationId,
        route: 'selection.resolve',
        decision: parseAutomationTargetSelectionDecision(record['decision']),
      };
    default:
      throw new Error('Desktop Automation target selection route is invalid.');
  }
}

export function parseDesktopAutomationTargetSelectionResult(
  value: unknown,
  request: DesktopAutomationTargetSelectionRequest,
): DesktopAutomationTargetSelectionResult {
  const record = exactRecord(
    value,
    ['requestId', 'route', 'pending'],
    'Desktop Automation target selection result',
  );
  if (record['requestId'] !== request.requestId || record['route'] !== request.route) {
    throw new Error('Desktop Automation target selection result identity is stale.');
  }
  return {
    requestId: request.requestId,
    route: request.route,
    pending: parseAutomationTargetSelectionProjections(record['pending']),
  };
}

export function parseDesktopAutomationTargetSelectionChangedEvent(
  value: unknown,
): DesktopAutomationTargetSelectionChangedEvent {
  const record = exactRecord(value, ['kind'], 'Desktop Automation target selection changed event');
  if (record['kind'] !== 'changed') {
    throw new Error('Desktop Automation target selection changed event is invalid.');
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
