export function requireCanonicalBase64(input: unknown, diagnostic: string): string {
  if (typeof input !== 'string' || input.length === 0 || input.length % 4 !== 0) {
    throw new Error(diagnostic);
  }
  const firstPadding = input.indexOf('=');
  const contentLength = firstPadding === -1 ? input.length : firstPadding;
  const padding = input.length - contentLength;
  if (padding > 2) throw new Error(diagnostic);
  for (let index = 0; index < contentLength; index += 1) {
    if (base64Value(input[index]) < 0) throw new Error(diagnostic);
  }
  for (let index = contentLength; index < input.length; index += 1) {
    if (input[index] !== '=') throw new Error(diagnostic);
  }
  const finalValue = base64Value(input[input.length - padding - 1]);
  if ((padding === 2 && (finalValue & 15) !== 0) || (padding === 1 && (finalValue & 3) !== 0)) {
    throw new Error(diagnostic);
  }
  return input;
}

export function decodedBase64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function base64Value(value: string | undefined): number {
  if (value === undefined) return -1;
  const code = value.codePointAt(0);
  if (code === undefined) return -1;
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (value === '+') return 62;
  if (value === '/') return 63;
  return -1;
}
