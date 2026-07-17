/**
 * Media generation error normalization.
 *
 * AI SDK/provider errors often carry useful fields as non-enumerable
 * properties. Normalize them before logging so Extension Host logs stay
 * actionable instead of printing only `Object`.
 */

export interface MediaGenerationErrorSummary {
  readonly name?: string;
  readonly message: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly code?: string;
  readonly url?: string;
  readonly responseBody?: string;
  readonly isRetryable?: boolean;
  readonly cause?: MediaGenerationErrorSummary;
}

const MAX_LOG_FIELD_LENGTH = 4000;
const MAX_ERROR_MESSAGE_LENGTH = 2000;

export function summarizeMediaGenerationError(error: unknown): MediaGenerationErrorSummary {
  return summarizeError(error, 0);
}

export function formatMediaGenerationErrorSummary(summary: MediaGenerationErrorSummary): string {
  const details: string[] = [];

  if (summary.status !== undefined && !summary.message.includes(String(summary.status))) {
    details.push(`status=${summary.status}`);
  }
  if (summary.code && !summary.message.includes(summary.code)) {
    details.push(`code=${summary.code}`);
  }
  if (summary.responseBody && !summary.message.includes(summary.responseBody)) {
    details.push(`body=${summary.responseBody}`);
  }

  const message =
    details.length > 0 ? `${summary.message} (${details.join(', ')})` : summary.message;
  return truncateLogField(message, MAX_ERROR_MESSAGE_LENGTH);
}

export function getMediaGenerationHttpStatus(error: unknown): number | undefined {
  for (const key of ['statusCode', 'status', 'responseStatus']) {
    const status = toStatusNumber(readObjectField(error, key));
    if (status !== undefined) {
      return status;
    }
  }

  const response = readObjectField(error, 'response');
  const responseStatus = toStatusNumber(readObjectField(response, 'status'));
  if (responseStatus !== undefined) {
    return responseStatus;
  }

  return undefined;
}

function summarizeError(error: unknown, depth: number): MediaGenerationErrorSummary {
  const message = getMediaGenerationErrorMessage(error);
  if (!isObjectLike(error)) {
    return { message };
  }

  const response = readObjectField(error, 'response');
  const cause = readObjectField(error, 'cause');

  return {
    name: firstString(readObjectField(error, 'name')),
    message,
    status: getMediaGenerationHttpStatus(error),
    statusText: firstString(
      readObjectField(error, 'statusText'),
      readObjectField(response, 'statusText'),
    ),
    code: firstString(
      readObjectField(error, 'code'),
      readObjectField(error, 'errorCode'),
      readObjectField(error, 'type'),
    ),
    url: firstString(readObjectField(error, 'url'), readObjectField(error, 'requestUrl')),
    responseBody: firstLogString(
      readObjectField(error, 'responseBody'),
      readObjectField(response, 'body'),
      readObjectField(error, 'body'),
      readObjectField(error, 'data'),
    ),
    isRetryable: firstBoolean(readObjectField(error, 'isRetryable')),
    cause:
      depth < 2 && cause !== undefined && cause !== null
        ? summarizeError(cause, depth + 1)
        : undefined,
  };
}

function getMediaGenerationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return truncateLogField(error.message, MAX_ERROR_MESSAGE_LENGTH);
  }

  const message = firstString(readObjectField(error, 'message'));
  if (message) {
    return truncateLogField(message, MAX_ERROR_MESSAGE_LENGTH);
  }

  const serialized = stringifyForLog(error);
  if (serialized) {
    return truncateLogField(serialized, MAX_ERROR_MESSAGE_LENGTH);
  }

  return 'Unknown media generation error';
}

function readObjectField(value: unknown, key: string): unknown {
  if (!isObjectLike(value)) {
    return undefined;
  }

  try {
    const field: unknown = Reflect.get(value, key);
    return field;
  } catch {
    return undefined;
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return truncateLogField(value, MAX_LOG_FIELD_LENGTH);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
  }
  return undefined;
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return undefined;
}

function firstLogString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const serialized = stringifyForLog(value);
    if (serialized) {
      return truncateLogField(serialized, MAX_LOG_FIELD_LENGTH);
    }
  }
  return undefined;
}

function stringifyForLog(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  try {
    return JSON.stringify(value, createLogReplacer());
  } catch {
    try {
      return String(value);
    } catch {
      return undefined;
    }
  }
}

function createLogReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();

  return (_key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
      };
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'function') {
      return `[Function ${value.name || 'anonymous'}]`;
    }

    if (isObjectLike(value)) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }

    return value;
  };
}

function toStatusNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d{3}$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}

function truncateLogField(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}
