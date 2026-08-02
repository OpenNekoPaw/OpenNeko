const ENTITY_URI_PATTERN = /^entity:\/\/([^/]+)(?:\/([a-z]+))?$/;

export type EntityRepresentationPurpose =
  'main' | 'thumbnail' | 'preview' | 'texture' | 'reference' | 'source';

const VALID_PURPOSES = new Set<EntityRepresentationPurpose>([
  'main',
  'thumbnail',
  'preview',
  'texture',
  'reference',
  'source',
]);

export interface ParsedEntityUri {
  readonly entityId: string;
  readonly purpose: EntityRepresentationPurpose;
}

export function parseEntityUri(uri: string): ParsedEntityUri | null {
  const match = uri.match(ENTITY_URI_PATTERN);
  if (!match) return null;

  const entityId = match[1]!;
  if (!entityId) return null;

  const rawPurpose = match[2] as EntityRepresentationPurpose | undefined;
  if (rawPurpose && !VALID_PURPOSES.has(rawPurpose)) return null;

  return { entityId, purpose: rawPurpose ?? 'thumbnail' };
}

export function isEntityUri(uri: string): boolean {
  return ENTITY_URI_PATTERN.test(uri);
}

export function buildEntityUri(entityId: string, purpose?: EntityRepresentationPurpose): string {
  if (!purpose || purpose === 'thumbnail') return `entity://${entityId}`;
  return `entity://${entityId}/${purpose}`;
}
