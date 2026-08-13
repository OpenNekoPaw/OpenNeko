import { contentLocatorKey } from '@neko/content';
import { modeForTextDocument } from '@neko/text-editor-domain';
import { type MediaLibraryProjectionEntry } from '@neko/assets-domain/contracts';
import type { GlobalAssetItem } from '../global-library/contract';
import type {
  ResourceBrowserAssetItem,
  ResourceBrowserCapability,
  ResourceBrowserContentItem,
  ResourceBrowserItemKind,
  ResourceBrowserMediaLibraryRootItem,
} from './contract';
import type { ResourceBrowserContentEntry, ResourceBrowserMediaLibraryRootEntry } from './ports';

export function presentResourceBrowserContentItem(
  entry: ResourceBrowserContentEntry,
  source: 'files' | 'media',
  options: { readonly canvasAvailable?: boolean } = {},
): ResourceBrowserContentItem {
  const kind = presentContentKind(entry.metadata?.mediaType);
  const parentResourceId = entry.parentLocator
    ? stableResourceId('content', `${source}:${contentLocatorKey(entry.parentLocator)}`)
    : source === 'media' && entry.libraryName
      ? mediaLibraryRootResourceId(entry.libraryName)
      : undefined;
  return {
    resourceId: stableResourceId('content', `${source}:${contentLocatorKey(entry.locator)}`),
    source,
    kind,
    label: entry.label,
    role: entry.role,
    depth: entry.depth,
    ...(parentResourceId ? { parentResourceId } : {}),
    ...(entry.libraryName ? { libraryName: entry.libraryName } : {}),
    ...(entry.description ? { description: entry.description } : {}),
    locator: entry.locator,
    ...presentThumbnail(
      contentLocatorKey(entry.locator),
      entry.metadata?.mediaType,
      entry.metadata?.modifiedAt,
      entry.metadata?.byteLength,
    ),
    capabilities: presentContentCapabilities(
      entry.capabilities,
      options.canvasAvailable ?? false,
      entry.metadata?.mediaType,
      source,
      entry.locator,
    ),
  };
}

export function presentResourceBrowserMediaLibraryRootItem(
  entry: ResourceBrowserMediaLibraryRootEntry,
): ResourceBrowserMediaLibraryRootItem {
  return {
    resourceId: mediaLibraryRootResourceId(entry.libraryName),
    source: 'media',
    kind: 'directory',
    label: entry.label,
    role: 'library-root',
    depth: 0,
    libraryName: entry.libraryName,
    libraryStatus: entry.libraryStatus,
    ...(entry.description ? { description: entry.description } : {}),
    capabilities: [],
  };
}

export function presentResourceBrowserAssetItem(asset: GlobalAssetItem): ResourceBrowserAssetItem {
  return {
    resourceId: stableResourceId('asset', asset.id),
    source: 'assets',
    kind: 'asset',
    label: asset.label,
    ...(asset.description ? { description: asset.description } : {}),
    role: 'asset',
    depth: 0,
    assetRef: { assetId: asset.id },
    availability: asset.availability,
    ...(asset.thumbnail
      ? {
          thumbnail: {
            descriptorId: asset.thumbnail.descriptorId,
            sourceFingerprint: asset.thumbnail.sourceFingerprint,
            mediaType: asset.thumbnail.mediaType,
          },
        }
      : {}),
    capabilities: [],
  };
}

function presentThumbnail(
  locatorKey: string,
  mediaType: string | undefined,
  modifiedAt: string | undefined,
  byteLength: number | undefined,
) {
  if (mediaType !== 'image' && mediaType !== 'video') return {};
  return {
    thumbnail: {
      descriptorId: stableResourceId('thumbnail', locatorKey),
      sourceFingerprint: `${modifiedAt ?? 'unknown'}:${byteLength ?? 0}`,
      mediaType,
    },
  };
}

function presentContentKind(mediaType: string | undefined): ResourceBrowserItemKind {
  switch (mediaType) {
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return mediaType;
    case 'directory':
      return 'directory';
    default:
      return 'file';
  }
}

function presentContentCapabilities(
  capabilities: MediaLibraryProjectionEntry['capabilities'],
  canvasAvailable: boolean,
  mediaType: string | undefined,
  source: 'files' | 'media',
  locator: ResourceBrowserContentItem['locator'],
): readonly ResourceBrowserCapability[] {
  const result: ResourceBrowserCapability[] = [];
  if (
    source === 'files' &&
    locator.kind === 'workspace-file' &&
    capabilities.includes('read') &&
    modeForTextDocument(locator.path)
  ) {
    result.push('edit-text');
  }
  if (capabilities.includes('preview')) result.push('preview');
  if (
    (mediaType === 'canvas' || mediaType === 'cut') &&
    capabilities.includes('read') &&
    capabilities.includes('bind')
  ) {
    result.push('open-creative-document');
  }
  if (capabilities.includes('read')) result.push('reveal');
  if (canvasAvailable && capabilities.includes('bind')) result.push('add-to-canvas');
  if (capabilities.includes('bind') && (mediaType === 'video' || mediaType === 'audio')) {
    result.push('add-to-cut');
  }
  return result;
}

function stableResourceId(namespace: string, value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${namespace}:${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
}

function mediaLibraryRootResourceId(libraryName: string): string {
  return stableResourceId('media-library-root', libraryName);
}
