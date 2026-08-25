import type { ContentLocator } from '@neko/content-domain';

export function projectContentLocatorPath(locator: ContentLocator): string {
  const filePath =
    locator.file.authority === 'workspace'
      ? locator.file.path
      : `${locator.file.packageId}/${locator.file.path}`;
  if (locator.selector?.kind === 'entry') return `${filePath}#${locator.selector.path}`;
  if (locator.selector?.kind === 'page') return `${filePath}#page=${locator.selector.pageNumber}`;
  return locator.selector ? `${filePath}#text-range` : filePath;
}
