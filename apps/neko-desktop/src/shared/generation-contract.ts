import {
  parseDirectGenerationOperationInput,
  parseDirectGenerationOperationProjection,
  type DirectGenerationOperationInput,
  type DirectGenerationOperationProjection,
} from '@neko/generation';
import {
  parseAgentLaunchConnectionIdentity,
  type AgentLaunchConnectionIdentity,
  type DesktopAgentConnectionIdentity,
} from '@neko/agent-contracts';
import { parseDesktopAgentConnectionIdentity } from './agent-contract';

export const DESKTOP_DIRECT_GENERATION_CHANNEL =
  'openneko:desktop:generation:direct:submit' as const;

export type DesktopDirectGenerationScope =
  | {
      readonly kind: 'agent-draft';
      readonly connection: AgentLaunchConnectionIdentity;
    }
  | {
      readonly kind: 'agent-session';
      readonly connection: DesktopAgentConnectionIdentity;
    };

export interface DesktopDirectGenerationRequest {
  readonly requestId: string;
  readonly scope: DesktopDirectGenerationScope;
  readonly operation: DirectGenerationOperationInput;
}

export interface DesktopDirectGenerationResult {
  readonly requestId: string;
  readonly projection: DirectGenerationOperationProjection;
}

export interface OpenNekoDesktopDirectGenerationBridge {
  readonly directGeneration: {
    submit(
      scope: DesktopDirectGenerationScope,
      operation: DirectGenerationOperationInput,
    ): Promise<DirectGenerationOperationProjection>;
  };
}

export function createDesktopDirectGenerationRequest(
  requestId: string,
  scope: DesktopDirectGenerationScope,
  operation: DirectGenerationOperationInput,
): DesktopDirectGenerationRequest {
  return parseDesktopDirectGenerationRequest({ requestId, scope, operation });
}

export function parseDesktopDirectGenerationRequest(
  value: unknown,
): DesktopDirectGenerationRequest {
  const record = requireRecord(value, 'Desktop Direct Generation request must be an object.');
  requireExactKeys(record, ['requestId', 'scope', 'operation']);
  return {
    requestId: requireIdentity(record['requestId'], 'request'),
    scope: parseScope(record['scope']),
    operation: parseDirectGenerationOperationInput(record['operation']),
  };
}

export function parseDesktopDirectGenerationResult(
  value: unknown,
  expectedRequestId?: string,
): DesktopDirectGenerationResult {
  const record = requireRecord(value, 'Desktop Direct Generation result must be an object.');
  requireExactKeys(record, ['requestId', 'projection']);
  const requestId = requireIdentity(record['requestId'], 'result request');
  if (expectedRequestId !== undefined && requestId !== expectedRequestId) {
    throw new Error(
      `Desktop Direct Generation result '${requestId}' does not match request '${expectedRequestId}'.`,
    );
  }
  return {
    requestId,
    projection: parseDirectGenerationOperationProjection(record['projection']),
  };
}

function parseScope(value: unknown): DesktopDirectGenerationScope {
  const record = requireRecord(value, 'Desktop Direct Generation scope must be an object.');
  requireExactKeys(record, ['kind', 'connection']);
  if (record['kind'] === 'agent-draft') {
    return {
      kind: 'agent-draft',
      connection: parseAgentLaunchConnectionIdentity(record['connection']),
    };
  }
  if (record['kind'] === 'agent-session') {
    return {
      kind: 'agent-session',
      connection: parseDesktopAgentConnectionIdentity(record['connection']),
    };
  }
  throw new Error('Desktop Direct Generation scope kind is invalid.');
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): void {
  const actual = Object.keys(record);
  if (actual.length !== expected.length || actual.some((key) => !expected.includes(key))) {
    throw new Error('Desktop Direct Generation contract contains unsupported fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Desktop Direct Generation ${label} identity is required.`);
  }
  return value;
}
