import { validateContentLocator, type ContentLocator } from './content-locator';

export const CONTENT_LOCATOR_DRAG_MIME = 'application/x-openneko-content-locator+json' as const;

export interface ContentLocatorDragData {
  readonly type: 'content-locator';
  readonly locator: ContentLocator;
  readonly name: string;
}

export function createContentLocatorDragData(input: {
  readonly locator: ContentLocator;
  readonly name: string;
}): ContentLocatorDragData {
  return parseContentLocatorDragData({
    type: 'content-locator',
    locator: input.locator,
    name: input.name,
  });
}

export function parseContentLocatorDragData(value: unknown): ContentLocatorDragData {
  if (!isRecord(value)) {
    throw new Error('Content locator drag data must be an object.');
  }
  if (!hasOnlyKeys(value, ['type', 'locator', 'name']) || value['type'] !== 'content-locator') {
    throw new Error('Content locator drag data shape or type is invalid.');
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
    type: 'content-locator',
    locator: locator.locator,
    name,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
