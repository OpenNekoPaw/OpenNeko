/**
 * Utilities for turning arbitrary error/cause values into JSON-safe data.
 */

export function toSerializableErrorCause(cause: unknown): unknown {
  if (cause === null || cause === undefined) {
    return cause;
  }

  if (typeof cause === 'string' || typeof cause === 'number' || typeof cause === 'boolean') {
    return cause;
  }

  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      ...(typeof cause.stack === 'string' ? { stack: cause.stack } : {}),
    };
  }

  try {
    return JSON.parse(JSON.stringify(cause)) as unknown;
  } catch {
    return {
      message: String(cause),
    };
  }
}
