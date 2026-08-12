import {
  projectEntityInspector,
  type ProjectEntityInspectorOwnerCapabilities,
  type ProjectEntityManagementProjection,
} from '@neko/entity-domain';
import { contentLocatorKey } from '@neko/content';
import { modeForTextDocument } from '@neko/text-editor-domain';
import { type MediaLibraryProjectionEntry } from '@neko/assets-domain/contracts';
import type { GlobalAssetItem } from '../global-library/contract';
import type {
  ResourceBrowserAssetItem,
  ResourceBrowserCapability,
  ResourceBrowserContentItem,
  ResourceBrowserEntityItem,
  ResourceBrowserItemKind,
} from './contract';
import type { ResourceBrowserContentEntry } from './ports';
import type { ProjectEntityCharacterResourceProjection } from '@neko/project/contracts';

export function presentResourceBrowserContentItem(
  entry: ResourceBrowserContentEntry,
  source: 'files' | 'media',
  options: { readonly canvasAvailable?: boolean } = {},
): ResourceBrowserContentItem {
  const kind = presentContentKind(entry.metadata?.mediaType);
  const parentResourceId = entry.parentLocator
    ? stableResourceId('content', `${source}:${contentLocatorKey(entry.parentLocator)}`)
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
      source,
      entry.locator,
    ),
  };
}

export function presentResourceBrowserEntityItem(
  projection: ProjectEntityManagementProjection,
  options: {
    readonly canvasAvailable?: boolean;
    readonly capabilities?: ProjectEntityInspectorOwnerCapabilities;
    readonly characterAssociation?: ProjectEntityCharacterResourceProjection | undefined;
  },
): ResourceBrowserEntityItem {
  const inspector = projectEntityInspector({
    projection,
    capabilities: options.capabilities,
  });
  if (projection.status === 'candidate') {
    const candidate = projection.candidate;
    return {
      resourceId: stableResourceId('candidate', candidate.candidateId),
      source: 'entities',
      kind: candidate.kind,
      label: candidate.proposedNames.display ?? candidate.proposedNames.canonical,
      ...(candidate.proposedNames.aliases.length > 0
        ? { description: candidate.proposedNames.aliases.join(', ') }
        : {}),
      candidateRef: { candidateId: candidate.candidateId, entityKind: candidate.kind },
      entityStatus: 'candidate',
      sourceOwners: projection.sourceOwners,
      evidenceCount: candidate.evidence.length,
      inspector,
      role: 'entity',
      depth: 0,
      capabilities: [],
    };
  }
  const entity = projection.entity;
  const binding =
    entity.representations.find((candidate) => candidate.isDefault) ?? entity.representations[0];
  const representationLocator = binding?.target;
  const attentionBindingIds = projection.bindingAvailability
    .filter((candidate) => candidate.availability === 'needs-attention')
    .map((candidate) => candidate.bindingId);
  return {
    resourceId: stableResourceId('entity', `${entity.kind}:${entity.entityId}`),
    source: 'entities',
    kind: entity.kind,
    label: entity.names.display ?? entity.names.canonical,
    ...(entity.names.aliases.length > 0 ? { description: entity.names.aliases.join(', ') } : {}),
    entityRef: {
      entityId: entity.entityId,
      entityKind: entity.kind,
    },
    entityStatus: projection.status,
    sourceOwners: projection.sourceOwners,
    attentionBindingIds,
    inspector,
    ...(options.characterAssociation ? { characterAssociation: options.characterAssociation } : {}),
    representationAvailability:
      attentionBindingIds.length > 0
        ? 'needs-attention'
        : representationLocator
          ? 'active'
          : 'unbound',
    role: 'entity',
    depth: 0,
    ...(representationLocator ? { representationLocator } : {}),
    ...(binding
      ? {
          representationBindingId: binding.bindingId,
          representationRole: binding.role,
        }
      : {}),
    ...(representationLocator
      ? {
          thumbnail: {
            descriptorId: stableResourceId('thumbnail', contentLocatorKey(representationLocator)),
            sourceFingerprint: binding?.acceptedAt ?? 'unknown',
            mediaType: 'entity-representation',
          },
        }
      : {}),
    capabilities:
      representationLocator && projection.status !== 'deprecated'
        ? ['preview', ...(options.canvasAvailable ? (['add-to-canvas'] as const) : [])]
        : [],
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
