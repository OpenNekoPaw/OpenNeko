import { LocalMetadataError } from './contracts';

const FORBIDDEN_SECRET_KEYS = new Set([
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authtoken',
  'sessiontoken',
  'enginetoken',
  'authorization',
  'clientsecret',
  'secret',
  'secretkey',
  'password',
  'credential',
  'credentials',
]);

export function serializeLocalMetadataJson(value: unknown, operation: string): string {
  const secretPath = findForbiddenSecretPath(value);
  if (secretPath) {
    throw new LocalMetadataError({
      code: 'metadata-secret-forbidden',
      operation,
      message: `Secret-bearing field cannot be persisted in local metadata: ${secretPath}`,
    });
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation,
      message: `JSON payload cannot be undefined for ${operation}`,
    });
  }
  return serialized;
}

function findForbiddenSecretPath(
  value: unknown,
  path = '$',
  visited = new Set<object>(),
): string | null {
  if (Array.isArray(value)) {
    if (visited.has(value)) return null;
    visited.add(value);
    for (const [index, item] of value.entries()) {
      const nested = findForbiddenSecretPath(item, `${path}[${index}]`, visited);
      if (nested) return nested;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (visited.has(value)) return null;
  visited.add(value);
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/gu, '').toLowerCase();
    if (FORBIDDEN_SECRET_KEYS.has(normalizedKey)) return nextPath;
    const nested = findForbiddenSecretPath(entry, nextPath, visited);
    if (nested) return nested;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
