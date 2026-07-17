import type { ResourceRef } from '@neko/shared';

export function resolveResourceRefDisplayName(resourceRef: ResourceRef): string {
  const locator = resourceRef.locator;
  const candidates = [
    resourceRef.source.projectRelativePath,
    locator?.kind === 'document' ? locator.entryPath : undefined,
    resourceRef.source.filePath,
    locator?.kind === 'file' ? (locator.path ?? locator.uri) : undefined,
    resourceRef.source.document?.filePath,
    resourceRef.source.uri,
  ];

  for (const candidate of candidates) {
    if (candidate) return extractResourceBasename(candidate);
  }
  return resourceRef.id;
}

export function extractResourceBasename(pathOrUri: string): string {
  const normalized = pathOrUri.replace(/\\/g, '/');
  const basename = normalized.split('/').pop();
  if (!basename) return pathOrUri;
  try {
    return decodeURIComponent(basename);
  } catch {
    return basename;
  }
}
