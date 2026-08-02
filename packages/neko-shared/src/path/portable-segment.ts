const WINDOWS_RESERVED_SEGMENT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export function isPortablePathSegment(value: string): boolean {
  const normalized = value.normalize('NFC');
  return (
    normalized === value &&
    normalized.length > 0 &&
    normalized.length <= 100 &&
    normalized !== '.' &&
    normalized !== '..' &&
    !normalized.startsWith('.') &&
    !/[\\/:*?"<>|\u0000-\u001f]/u.test(normalized) &&
    !/[. ]$/u.test(normalized) &&
    !WINDOWS_RESERVED_SEGMENT.test(normalized)
  );
}
