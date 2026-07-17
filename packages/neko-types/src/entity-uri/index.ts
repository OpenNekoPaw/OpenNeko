import type { AssetMediaType, FilePurpose } from '../types/asset/entity';

const ENTITY_URI_PATTERN = /^entity:\/\/([^/]+)(?:\/([a-z]+))?$/;

const VALID_PURPOSES = new Set<FilePurpose>([
  'main',
  'thumbnail',
  'preview',
  'texture',
  'reference',
  'source',
]);

export interface ParsedEntityUri {
  readonly entityId: string;
  readonly purpose: FilePurpose;
}

export interface ResolvedEntityRef {
  readonly entityId: string;
  readonly variantId: string;
  readonly filePath: string;
  readonly resolvedPath: string;
  readonly mediaType: AssetMediaType;
}

export function parseEntityUri(uri: string): ParsedEntityUri | null {
  const match = uri.match(ENTITY_URI_PATTERN);
  if (!match) return null;

  const entityId = match[1]!;
  if (!entityId) return null;

  const rawPurpose = match[2] as FilePurpose | undefined;
  if (rawPurpose && !VALID_PURPOSES.has(rawPurpose)) return null;

  return { entityId, purpose: rawPurpose ?? 'thumbnail' };
}

export function isEntityUri(uri: string): boolean {
  return ENTITY_URI_PATTERN.test(uri);
}

export function buildEntityUri(entityId: string, purpose?: FilePurpose): string {
  if (!purpose || purpose === 'thumbnail') return `entity://${entityId}`;
  return `entity://${entityId}/${purpose}`;
}
