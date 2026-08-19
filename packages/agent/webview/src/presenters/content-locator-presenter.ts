import type { ContentLocator } from '@neko/content';

export function projectContentLocatorPath(locator: ContentLocator): string {
  const filePath =
    locator.file.authority === 'workspace'
      ? locator.file.path
      : `${locator.file.packageId}/${locator.file.path}`;
  return locator.selector ? `${filePath}#${locator.selector.path}` : filePath;
}
