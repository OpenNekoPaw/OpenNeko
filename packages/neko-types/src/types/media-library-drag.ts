export const MEDIA_LIBRARY_DRAG_MIME = 'application/json';

export interface MediaLibraryDragItem {
  readonly path: string;
  readonly name: string;
  readonly mediaType: 'video' | 'audio' | 'image';
}

export interface MediaLibraryDragData {
  readonly type: 'media-file';
  readonly files: readonly MediaLibraryDragItem[];
}

export function isMediaLibraryDragData(value: unknown): value is MediaLibraryDragData {
  if (!isRecord(value) || value['type'] !== 'media-file' || !Array.isArray(value['files'])) {
    return false;
  }
  return value['files'].every(isMediaLibraryDragItem);
}

function isMediaLibraryDragItem(value: unknown): value is MediaLibraryDragItem {
  if (!isRecord(value)) return false;
  return (
    typeof value['path'] === 'string' &&
    value['path'].length > 0 &&
    typeof value['name'] === 'string' &&
    value['name'].length > 0 &&
    (value['mediaType'] === 'video' ||
      value['mediaType'] === 'audio' ||
      value['mediaType'] === 'image')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
