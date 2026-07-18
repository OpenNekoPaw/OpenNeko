export function decodePngDataUrl(value: string): Uint8Array {
  const prefix = 'data:image/png;base64,';
  if (!value.startsWith(prefix)) throw new Error('3D Reference capture is not a PNG data URL.');
  const bytes = Buffer.from(value.slice(prefix.length), 'base64');
  if (
    bytes.byteLength < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    throw new Error('3D Reference capture bytes do not contain a PNG signature.');
  }
  if (bytes.byteLength > 16 * 1024 * 1024) {
    throw new Error('3D Reference capture exceeds the 16 MiB materialization limit.');
  }
  return bytes;
}
