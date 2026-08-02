import { validateContentLocator, type ContentLocator } from './content-locator';

export const CONTENT_LOCATOR_DRAG_MIME = 'application/x-openneko-content-locator+json' as const;
export const CONTENT_LOCATOR_DRAG_VERSION = 1 as const;

export interface ContentLocatorDragData {
  readonly schemaVersion: typeof CONTENT_LOCATOR_DRAG_VERSION;
  readonly type: 'content-locator';
  readonly locator: ContentLocator;
  readonly name: string;
}

export function createContentLocatorDragData(input: {
  readonly locator: ContentLocator;
  readonly name: string;
}): ContentLocatorDragData {
  return parseContentLocatorDragData({
    schemaVersion: CONTENT_LOCATOR_DRAG_VERSION,
    type: 'content-locator',
    locator: input.locator,
    name: input.name,
  });
}

export function parseContentLocatorDragData(value: unknown): ContentLocatorDragData {
  if (!isRecord(value)) {
    throw new Error('Content locator drag data must be an object.');
  }
  if (
    value['schemaVersion'] !== CONTENT_LOCATOR_DRAG_VERSION ||
    value['type'] !== 'content-locator'
  ) {
    throw new Error('Content locator drag data version or type is invalid.');
  }
  const locator = validateContentLocator(value['locator']);
  if (!locator.ok) {
    throw new Error(locator.diagnostics[0]?.message ?? 'Content locator drag data is invalid.');
  }
  const name = value['name'];
  if (typeof name !== 'string' || name.trim().length === 0 || name !== name.trim()) {
    throw new Error('Content locator drag display name is invalid.');
  }
  return {
    schemaVersion: CONTENT_LOCATOR_DRAG_VERSION,
    type: 'content-locator',
    locator: locator.locator,
    name,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
