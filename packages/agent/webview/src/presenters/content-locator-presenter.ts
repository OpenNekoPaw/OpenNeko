import { serializeContentReferenceTarget, type ContentLocator } from '@neko/content';

export function projectContentLocatorPath(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
    case 'generated-output':
      return locator.path;
    case 'media-library':
      return `${locator.libraryName}/${locator.relativePath}`;
    case 'document-entry':
      return `${serializeContentReferenceTarget(locator.source)}#${locator.entryPath}`;
    case 'package-resource':
      return `${locator.packageId}/${locator.resourcePath}`;
  }
}
