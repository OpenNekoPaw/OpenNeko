const SQLITE_CORRUPTION_CODES = new Set<unknown>([11, 26, 'SQLITE_CORRUPT', 'SQLITE_NOTADB']);

const SQLITE_CORRUPTION_MESSAGES = [
  'database disk image is malformed',
  'file is not a database',
] as const;

export function isSqliteCorruptionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = Reflect.get(error, 'code');
  const errcode = Reflect.get(error, 'errcode');
  if (SQLITE_CORRUPTION_CODES.has(code) || SQLITE_CORRUPTION_CODES.has(errcode)) {
    return true;
  }
  const message = Reflect.get(error, 'message');
  return (
    typeof message === 'string' &&
    SQLITE_CORRUPTION_MESSAGES.some((fragment) => message.toLocaleLowerCase().includes(fragment))
  );
}
