import {
  contentLocatorKey,
  type CreativeEntity,
  type EntityRepresentationBinding,
  type MediaLibraryProjectionEntry,
} from '@neko/shared';
import type {
  ResourceBrowserCapability,
  ResourceBrowserContentItem,
  ResourceBrowserEntityItem,
  ResourceBrowserItemKind,
} from './contract';
import type { ResourceBrowserContentEntry } from './ports';

export function presentResourceBrowserContentItem(
  entry: ResourceBrowserContentEntry,
  facet: 'files' | 'media',
  options: { readonly canvasAvailable?: boolean } = {},
): ResourceBrowserContentItem {
  const kind = presentContentKind(entry.metadata?.mediaType);
  const parentResourceId = entry.parentLocator
    ? stableResourceId('content', `${facet}:${contentLocatorKey(entry.parentLocator)}`)
    : undefined;
  return {
    resourceId: stableResourceId('content', `${facet}:${contentLocatorKey(entry.locator)}`),
    facet,
    kind,
    label: entry.label,
    role: entry.role,
    depth: entry.depth,
    ...(parentResourceId ? { parentResourceId } : {}),
    ...(entry.libraryName ? { libraryName: entry.libraryName } : {}),
    ...(entry.libraryStatus ? { libraryStatus: entry.libraryStatus } : {}),
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
    ),
  };
}

export function presentResourceBrowserEntityItem(
  entity: CreativeEntity,
  bindings: readonly EntityRepresentationBinding[],
  options: { readonly canvasAvailable?: boolean } = {},
): ResourceBrowserEntityItem {
  const binding = bindings.find(
    (candidate) =>
      candidate.entityId === entity.id &&
      candidate.entityKind === entity.kind &&
      candidate.status === 'confirmed' &&
      candidate.availability === 'active',
  );
  const representationLocator = binding?.representation;
  return {
    resourceId: stableResourceId('entity', `${entity.kind}:${entity.id}`),
    facet: 'materials',
    kind: entity.kind,
    label: entity.displayName ?? entity.canonicalName,
    ...(entity.aliases.length > 0 ? { description: entity.aliases.join(', ') } : {}),
    entityRef: {
      entityId: entity.id,
      entityKind: entity.kind,
    },
    entityStatus: 'confirmed',
    representationAvailability: representationLocator ? 'active' : 'unbound',
    role: 'entity',
    depth: 0,
    ...(representationLocator ? { representationLocator } : {}),
    ...(binding
      ? {
          representationBindingId: binding.id,
          representationRole: binding.role,
        }
      : {}),
    ...(representationLocator
      ? {
          thumbnail: {
            descriptorId: stableResourceId('thumbnail', contentLocatorKey(representationLocator)),
            revision: binding?.updatedAt ?? 'unknown',
            mediaType: 'entity-representation',
          },
        }
      : {}),
    capabilities: representationLocator
      ? [
          'preview',
          ...(options.canvasAvailable ? (['add-to-canvas'] as const) : []),
          'add-to-agent',
        ]
      : ['add-to-agent'],
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
      revision: `${modifiedAt ?? 'unknown'}:${byteLength ?? 0}`,
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
): readonly ResourceBrowserCapability[] {
  const result: ResourceBrowserCapability[] = [];
  if (capabilities.includes('preview')) result.push('preview');
  if (mediaType === 'cut' && capabilities.includes('read') && capabilities.includes('bind')) {
    result.push('open-cut');
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
