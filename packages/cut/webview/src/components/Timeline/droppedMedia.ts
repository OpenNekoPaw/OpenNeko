import {
  CONTENT_LOCATOR_DRAG_MIME,
  parseContentLocatorDragData,
  type ContentLocatorDragData,
} from '@neko/content-domain';

const URI_MIME_TYPES = ['application/vnd.code.uri-list', 'text/uri-list'] as const;

export type CutDroppedMediaSource =
  | { readonly kind: 'content-locator'; readonly data: ContentLocatorDragData }
  | { readonly kind: 'local-file-uris'; readonly uris: readonly string[] };

export function readDroppedMediaSource(
  transfer: Pick<DataTransfer, 'files' | 'getData'>,
): CutDroppedMediaSource | undefined {
  const contentLocator =
    transfer.getData(CONTENT_LOCATOR_DRAG_MIME) || transfer.getData('application/json');
  if (contentLocator.length > 0) {
    return {
      kind: 'content-locator',
      data: parseContentLocatorDragData(JSON.parse(contentLocator) as unknown),
    };
  }
  for (const mimeType of URI_MIME_TYPES) {
    const uris = readUriList(transfer.getData(mimeType));
    if (uris.length > 0) return { kind: 'local-file-uris', uris };
  }
  const plain = readUriList(transfer.getData('text/plain')).filter((uri) =>
    uri.startsWith('file:'),
  );
  if (plain.length > 0) return { kind: 'local-file-uris', uris: plain };
  const uris = Array.from(transfer.files).flatMap((candidate) => {
    const file = candidate as File & { readonly path?: string };
    return file.path ? [filePathToUri(file.path)] : [];
  });
  return uris.length > 0 ? { kind: 'local-file-uris', uris } : undefined;
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
