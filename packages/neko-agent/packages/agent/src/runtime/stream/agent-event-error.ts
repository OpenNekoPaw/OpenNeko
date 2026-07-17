import type { AgentEvent } from '../../session/types';

export const AGENT_ERROR_WITHOUT_DETAIL_CODE = 'agent-error-without-detail' as const;

export function readAgentEventErrorMessage(error: AgentEvent['error']): string | undefined {
  const message = error?.message;
  return typeof message === 'string' && message.trim().length > 0 ? message : undefined;
}

export function readAgentEventErrorCode(error: AgentEvent['error']): string | undefined {
  if (!isRecord(error)) return undefined;
  const code = error['code'];
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

export function readAgentEventErrorDetails(
  error: AgentEvent['error'],
): Record<string, unknown> | undefined {
  if (!isRecord(error)) return undefined;
  const context = error['context'];
  return isRecord(context) ? context : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
