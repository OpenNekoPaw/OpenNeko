import {
  isAgentAuthorizedContentReferenceContextData,
  type AgentContextPayload,
  type AgentFileReference,
  type MessageContextReference,
} from '@neko/agent-contracts';
import { isContentLocator, type ContentLocator } from '@neko/content';
import { projectContentLocatorPath } from './content-locator-presenter';

export function projectContextReferencesFromPayloads(
  payloads: readonly AgentContextPayload[] | undefined,
): MessageContextReference[] | undefined {
  if (!payloads || payloads.length === 0) return undefined;
  return payloads.map((payload) => {
    const navigationData = projectContextNavigationData(payload);
    const authorizedContent = isAgentAuthorizedContentReferenceContextData(payload.data)
      ? payload.data
      : undefined;
    const contentLocator = authorizedContent?.locator ?? projectContextContentLocator(payload);
    return {
      type: authorizedContent
        ? authorizedContentReferenceType(authorizedContent.mediaType)
        : payload.type,
      id: payload.id,
      label: payload.label,
      summary: payload.summary,
      ...(authorizedContent?.mediaType ? { mediaType: authorizedContent.mediaType } : {}),
      ...(contentLocator ? { contentLocator } : {}),
      ...(Object.keys(navigationData).length > 0 ? { navigationData } : {}),
    };
  });
}

export function projectContextReferencesFromFileReferences(
  references: readonly AgentFileReference[] | undefined,
): MessageContextReference[] | undefined {
  if (!references || references.length === 0) return undefined;
  return references.map((reference) => ({
    type: fileReferenceContextType(reference),
    id: reference.id,
    label: reference.label,
    summary: projectContentLocatorPath(reference.contentLocator),
    ...(reference.thumbnailUri ? { thumbnailUri: reference.thumbnailUri } : {}),
    ...(reference.mediaType ? { mediaType: reference.mediaType } : {}),
    contentLocator: reference.contentLocator,
  }));
}

export function projectMessageContextReferences(input: {
  readonly payloads?: readonly AgentContextPayload[];
  readonly fileReferences?: readonly AgentFileReference[];
}): MessageContextReference[] | undefined {
  return mergeContextReferences(
    projectContextReferencesFromPayloads(input.payloads),
    projectContextReferencesFromFileReferences(input.fileReferences),
  );
}

function authorizedContentReferenceType(
  mediaType: import('@neko/agent-contracts').AgentFileReferenceMediaType | undefined,
): MessageContextReference['type'] {
  if (mediaType === 'image') return 'image';
  if (mediaType === 'audio') return 'audio-clip';
  if (mediaType === 'video' || mediaType === 'sequence') return 'media';
  return 'file';
}

function fileReferenceContextType(reference: AgentFileReference): MessageContextReference['type'] {
  if (reference.mediaType === 'image') return 'image';
  if (reference.mediaType === 'audio') return 'audio-clip';
  if (
    reference.mediaType === 'video' ||
    reference.mediaType === 'sequence' ||
    reference.source === 'media-library'
  ) {
    return 'media';
  }
  if (reference.source === 'entity-graph') return 'entity';
  return 'file';
}

function mergeContextReferences(
  payloadReferences: readonly MessageContextReference[] | undefined,
  fileReferences: readonly MessageContextReference[] | undefined,
): MessageContextReference[] | undefined {
  const merged: MessageContextReference[] = [];
  const seenIds = new Set<string>();

  for (const reference of payloadReferences ?? []) {
    merged.push(reference);
    seenIds.add(reference.id);
  }

  for (const reference of fileReferences ?? []) {
    if (seenIds.has(reference.id)) continue;
    merged.push(reference);
    seenIds.add(reference.id);
  }

  return merged.length > 0 ? merged : undefined;
}

function projectContextNavigationData(payload: AgentContextPayload): Record<string, string> {
  const data = payload.data as Record<string, unknown> | null | undefined;
  const nav: Record<string, string> = {};

  if (data && typeof data === 'object') {
    const embeddedNavigation = data.navigationData;
    if (embeddedNavigation && typeof embeddedNavigation === 'object') {
      for (const [key, value] of Object.entries(embeddedNavigation)) {
        if (typeof value === 'string' && !isPathNavigationKey(key)) nav[key] = value;
      }
    }
  }

  if (payload.type === 'canvas-node') nav.nodeId = payload.id;
  if (payload.type === 'canvas-storyboard-action-intent') {
    const intent = readRecord(readRecord(payload.data)?.intent);
    const target = readRecord(intent?.target);
    const nodeId = target?.nodeId;
    if (typeof nodeId === 'string') nav.nodeId = nodeId;
  }
  return nav;
}

function projectContextContentLocator(payload: AgentContextPayload): ContentLocator | undefined {
  const data = readRecord(payload.data);
  return data && isContentLocator(data.contentLocator) ? data.contentLocator : undefined;
}

function isPathNavigationKey(key: string): boolean {
  return (
    key === 'filePath' ||
    key === 'path' ||
    key === 'resolvedPath' ||
    key === 'portablePath' ||
    key === 'projectRoot'
  );
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
