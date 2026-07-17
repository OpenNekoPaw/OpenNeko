export function formatTerminalDiagnosticLiteral(value: unknown, maximumLength = 80): string {
  const raw = typeof value === 'string' ? value : String(value);
  const escaped = raw
    .replaceAll('\\', '\\\\')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('\t', '\\t')
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
  const bounded = escaped.length <= maximumLength ? escaped : `${escaped.slice(0, maximumLength)}…`;
  return `"${bounded}"`;
}
