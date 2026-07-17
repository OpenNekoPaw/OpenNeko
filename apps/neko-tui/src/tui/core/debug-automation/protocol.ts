import {
  TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
  TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA,
  type TuiDebugAutomationError,
  type TuiDebugAutomationErrorCode,
  type TuiDebugAutomationMethod,
  type TuiDebugAutomationRequest,
  type TuiDebugAutomationResponse,
} from './types';

export class TuiDebugAutomationProtocolError extends Error {
  constructor(
    readonly code: TuiDebugAutomationErrorCode,
    message: string,
    readonly details?: unknown,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = 'TuiDebugAutomationProtocolError';
  }
}

export function parseTuiDebugAutomationRequest(line: string): TuiDebugAutomationRequest {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-json',
      'Debug automation request must be valid JSON.',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!isRecord(value)) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      'Debug automation request must be a JSON object.',
    );
  }

  const requestId = typeof value['id'] === 'string' ? value['id'] : null;
  if (value['schema'] !== TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-schema',
      `Debug automation request schema must be ${TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA}.`,
      { received: value['schema'] },
      requestId,
    );
  }

  if (typeof value['id'] !== 'string' || value['id'].trim().length === 0) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      'Debug automation request id must be a non-empty string.',
      undefined,
      requestId,
    );
  }

  if (!isTuiDebugAutomationMethod(value['method'])) {
    throw new TuiDebugAutomationProtocolError(
      'unknown-method',
      `Unknown debug automation method: ${String(value['method'])}`,
      { method: value['method'] },
      value['id'],
    );
  }

  return {
    schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
    id: value['id'],
    method: value['method'],
    ...(Object.prototype.hasOwnProperty.call(value, 'params') ? { params: value['params'] } : {}),
  };
}

export function createTuiDebugAutomationSuccessResponse(
  id: string,
  result: unknown,
): TuiDebugAutomationResponse {
  return {
    schema: TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA,
    id,
    ok: true,
    result,
  };
}

export function createTuiDebugAutomationErrorResponse(
  error: unknown,
  requestIdHint: string | null = null,
): TuiDebugAutomationResponse {
  const protocolError =
    error instanceof TuiDebugAutomationProtocolError
      ? error
      : new TuiDebugAutomationProtocolError(
          'internal-error',
          error instanceof Error ? error.message : String(error),
        );
  const responseError: TuiDebugAutomationError = {
    code: protocolError.code,
    message: protocolError.message,
    ...(protocolError.details !== undefined ? { details: protocolError.details } : {}),
  };
  return {
    schema: TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA,
    id: protocolError.requestId ?? requestIdHint,
    ok: false,
    error: responseError,
  };
}

export function validateTuiDebugAutomationTimeout(
  value: unknown,
  options: { readonly defaultMs: number; readonly label: string; readonly maxMs?: number },
): number {
  if (value === undefined) {
    return options.defaultMs;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-timeout',
      `${options.label} must be a positive integer in milliseconds.`,
      { received: value },
    );
  }
  const maxMs = options.maxMs ?? 30 * 60 * 1000;
  if (value > maxMs) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-timeout',
      `${options.label} must be <= ${maxMs}ms.`,
      { received: value, maxMs },
    );
  }
  return value;
}

export function assertRecordParams(
  value: unknown,
  method: TuiDebugAutomationMethod,
): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      `${method} params must be a JSON object.`,
      { received: value },
    );
  }
  return value;
}

export function assertAllowedParamKeys(
  params: Record<string, unknown>,
  allowedKeys: readonly string[],
  method: TuiDebugAutomationMethod,
  label = 'params',
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(params).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      `${method} ${label} contains unknown field(s): ${unknown.join(', ')}`,
      { unknown },
    );
  }
}

export function readRequiredStringParam(
  params: Record<string, unknown>,
  key: string,
  method: TuiDebugAutomationMethod,
): string {
  const value = params[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      `${method} params.${key} must be a non-empty string.`,
      { key, received: value },
    );
  }
  return value;
}

export function readRequiredPositiveIntegerParam(
  params: Record<string, unknown>,
  key: string,
  method: TuiDebugAutomationMethod,
  max: number,
): number {
  const value = params[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > max) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      `${method} params.${key} must be a positive integer <= ${max}.`,
      { key, received: value, max },
    );
  }
  return value;
}

export function readOptionalStringParam(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      `params.${key} must be a string when provided.`,
      { key, received: value },
    );
  }
  return value;
}

export function readOptionalBooleanParam(
  params: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      `params.${key} must be a boolean when provided.`,
      { key, received: value },
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTuiDebugAutomationMethod(value: unknown): value is TuiDebugAutomationMethod {
  return (
    value === 'session.create' ||
    value === 'session.resume' ||
    value === 'message.submit' ||
    value === 'message.cancel' ||
    value === 'terminal.resize' ||
    value === 'session.waitForIdle' ||
    value === 'session.facts' ||
    value === 'session.dispose'
  );
}
