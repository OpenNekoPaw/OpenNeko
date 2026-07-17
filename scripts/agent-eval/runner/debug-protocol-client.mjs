import { once } from 'node:events';
import { createInterface } from 'node:readline';

export const REQUEST_SCHEMA = 'neko.tui-debug-automation.request.v1';

export async function sendDebugRequest(childProcess, reader, input) {
  const request = { schema: REQUEST_SCHEMA, ...input };
  childProcess.stdin.write(`${JSON.stringify(request)}\n`);
  const response = await reader.next();
  if (response.done) throw new Error('debug automation process ended before responding');
  if (!response.value.ok) {
    const message = response.value.error?.message ?? 'debug automation request failed';
    const diagnostic = readProtocolDiagnostic(response.value.error?.details);
    const error = new Error(
      diagnostic ? `${message}${/[.!?]$/u.test(message) ? ' ' : ': '}${diagnostic}` : message,
    );
    error.code = response.value.error?.code;
    throw error;
  }
  return response.value.result;
}

function readProtocolDiagnostic(details) {
  const diagnostic =
    details && typeof details === 'object' && typeof details.diagnostic === 'string'
      ? details.diagnostic.trim()
      : '';
  return diagnostic || undefined;
}

export async function* createDebugResponseReader(output) {
  const lines = createInterface({ input: output });
  for await (const line of lines) {
    if (!line.trim()) continue;
    yield JSON.parse(line);
  }
  await once(output, 'close').catch(() => undefined);
}

export function readRequiredString(value, key) {
  if (!value || typeof value[key] !== 'string' || value[key].length === 0) {
    throw new Error(`debug automation response missing string field: ${key}`);
  }
  return value[key];
}
