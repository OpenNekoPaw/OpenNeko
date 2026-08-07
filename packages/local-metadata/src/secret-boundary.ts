import { LocalMetadataError } from './contracts';

export const LOCAL_METADATA_JSON_MAX_BYTES = 1024 * 1024;

const BYTE_ARRAY_MIN_LENGTH = 64;
const BASE64_MIN_LENGTH = 256;
const SERIALIZED_BINARY_TYPES = new Set([
  'Buffer',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int8Array',
  'Uint16Array',
  'Int16Array',
  'Uint32Array',
  'Int32Array',
  'BigUint64Array',
  'BigInt64Array',
  'Float32Array',
  'Float64Array',
  'ArrayBuffer',
  'DataView',
]);

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
  const violation = findForbiddenPersistenceValue(value);
  if (violation?.kind === 'secret') {
    throw new LocalMetadataError({
      code: 'metadata-secret-forbidden',
      operation,
      message: `Secret-bearing field cannot be persisted in local metadata for ${operation}: ${violation.path}`,
    });
  }
  if (violation?.kind === 'binary') {
    throwBinaryError(operation, violation.path);
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch (cause) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation,
      message: `JSON payload cannot be serialized for ${operation}`,
      cause,
    });
  }
  if (serialized === undefined) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation,
      message: `JSON payload cannot be undefined for ${operation}`,
    });
  }
  const serializedBytes = new TextEncoder().encode(serialized).length;
  if (serializedBytes > LOCAL_METADATA_JSON_MAX_BYTES) {
    throw new LocalMetadataError({
      code: 'metadata-record-too-large',
      operation,
      message: `JSON payload for ${operation} exceeds ${LOCAL_METADATA_JSON_MAX_BYTES} bytes: ${serializedBytes}`,
    });
  }
  const serializedViolation = findForbiddenPersistenceValue(JSON.parse(serialized));
  if (serializedViolation?.kind === 'secret') {
    throw new LocalMetadataError({
      code: 'metadata-secret-forbidden',
      operation,
      message: `Secret-bearing field cannot be persisted in local metadata for ${operation}: ${serializedViolation.path}`,
    });
  }
  if (serializedViolation?.kind === 'binary') {
    throwBinaryError(operation, serializedViolation.path);
  }
  return serialized;
}

interface PersistenceViolation {
  readonly kind: 'secret' | 'binary';
  readonly path: string;
}

function findForbiddenPersistenceValue(
  value: unknown,
  path = '$',
  visited = new Set<object>(),
): PersistenceViolation | null {
  if (isNativeBinaryContainer(value)) return { kind: 'binary', path };
  if (typeof value === 'string' && isBinaryString(value)) return { kind: 'binary', path };
  if (Array.isArray(value)) {
    if (isByteArray(value, BYTE_ARRAY_MIN_LENGTH)) return { kind: 'binary', path };
    if (visited.has(value)) return null;
    visited.add(value);
    for (const [index, item] of value.entries()) {
      const nested = findForbiddenPersistenceValue(item, `${path}[${index}]`, visited);
      if (nested) return nested;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (visited.has(value)) return null;
  visited.add(value);
  if (isSerializedBinaryContainer(value)) return { kind: 'binary', path };
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/gu, '').toLowerCase();
    if (FORBIDDEN_SECRET_KEYS.has(normalizedKey)) return { kind: 'secret', path: nextPath };
    const nested = findForbiddenPersistenceValue(entry, nextPath, visited);
    if (nested) return nested;
  }
  return null;
}

function throwBinaryError(operation: string, path: string): never {
  throw new LocalMetadataError({
    code: 'metadata-binary-forbidden',
    operation,
    message: `Binary-bearing value cannot be persisted in local metadata for ${operation}: ${path}`,
  });
}

function isNativeBinaryContainer(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Blob]' || tag === '[object File]';
}

function isBinaryString(value: string): boolean {
  if (/^(?:data|blob):/iu.test(value)) return true;
  if (value.length < BASE64_MIN_LENGTH) return false;
  return isCanonicalBase64(value, false) || isCanonicalBase64(value, true);
}

function isCanonicalBase64(value: string, urlSafe: boolean): boolean {
  let padding = 0;
  while (padding < value.length && value[value.length - padding - 1] === '=') padding += 1;
  if (padding > 2) return false;
  const payloadLength = value.length - padding;
  if (payloadLength % 4 === 1) return false;
  if (padding > 0 && value.length % 4 !== 0) return false;
  for (let index = 0; index < payloadLength; index += 1) {
    const code = value.charCodeAt(index);
    const alphanumeric =
      (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (alphanumeric) continue;
    if (urlSafe ? code === 45 || code === 95 : code === 43 || code === 47) continue;
    return false;
  }
  return true;
}

function isSerializedBinaryContainer(value: Record<string, unknown>): boolean {
  const type = value['type'] ?? value['constructor'];
  if (typeof type === 'string' && SERIALIZED_BINARY_TYPES.has(type)) return true;
  const entries = Object.entries(value);
  return (
    entries.length >= BYTE_ARRAY_MIN_LENGTH &&
    entries.every(
      ([key, entry], index) =>
        key === String(index) && typeof entry === 'number' && Number.isFinite(entry),
    )
  );
}

function isByteArray(value: readonly unknown[], minimumLength: number): boolean {
  return value.length >= minimumLength && value.every(isByteValue);
}

function isByteValue(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
