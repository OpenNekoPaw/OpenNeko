import type { ContentLocator } from '@neko/content';

export function projectContentLocatorPath(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
    case 'generated-output':
      return locator.path;
    case 'document-entry':
      return `${locator.source.path}#${locator.entryPath}`;
    case 'package-resource':
      return `${locator.packageId}/${locator.resourcePath}`;
  }
}
