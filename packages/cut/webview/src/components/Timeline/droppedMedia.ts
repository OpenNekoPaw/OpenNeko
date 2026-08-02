const URI_MIME_TYPES = ['application/vnd.code.uri-list', 'text/uri-list'] as const;

export function readDroppedMediaUris(
  transfer: Pick<DataTransfer, 'files' | 'getData'>,
): readonly string[] {
  for (const mimeType of URI_MIME_TYPES) {
    const uris = readUriList(transfer.getData(mimeType));
    if (uris.length > 0) return uris;
  }
  const plain = readUriList(transfer.getData('text/plain')).filter((uri) =>
    uri.startsWith('file:'),
  );
  if (plain.length > 0) return plain;
  return Array.from(transfer.files).flatMap((candidate) => {
    const file = candidate as File & { readonly path?: string };
    return file.path ? [filePathToUri(file.path)] : [];
  });
}

function readUriList(value: string): readonly string[] {
  return value
    .split(/\r?\n/u)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0 && !candidate.startsWith('#'));
}

function filePathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/gu, '/');
  const prefix = /^[A-Za-z]:\//u.test(normalized) ? 'file:///' : 'file://';
  return encodeURI(`${prefix}${normalized}`);
}
