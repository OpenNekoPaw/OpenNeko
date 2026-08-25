export type CharaJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CharaJsonValue[]
  | { readonly [key: string]: CharaJsonValue };

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function requireExactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = requireRecord(value, label);
  const supported = new Set(keys);
  const unsupported = Object.keys(record).filter((key) => !supported.has(key));
  if (unsupported.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unsupported.sort().join(', ')}.`);
  }
  return record;
}

export function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}

export function requireIsoDate(value: unknown, label: string): string {
  const date = requireIdentity(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(date)) {
    throw new Error(`${label} must be an ISO 8601 UTC timestamp.`);
  }
  return date;
}

export function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

export function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

export function requireOneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(`${label} must be one of: ${values.join(', ')}.`);
  }
  return value as T[number];
}

export function requireArray<T>(
  value: unknown,
  parser: (item: unknown, index: number) => T,
  label: string,
): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map(parser);
}

export function requireUniqueIdentities<T>(
  values: readonly T[],
  identity: (value: T) => string,
  label: string,
): readonly T[] {
  const seen = new Set<string>();
  for (const value of values) {
    const id = identity(value);
    if (seen.has(id)) throw new Error(`${label} contains duplicate identity '${id}'.`);
    seen.add(id);
  }
  return values;
}

export function requireJsonValue(value: unknown, label: string): CharaJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => requireJsonValue(item, `${label}[${String(index)}]`));
  }
  const record = requireRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, requireJsonValue(item, `${label}.${key}`)]),
  );
}

export function optionalIdentity(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireIdentity(value, label);
}

export function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireString(value, label);
}

export function readDiagnosticIdentity(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const candidate = (value as Readonly<Record<string, unknown>>)[key];
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : undefined;
}
