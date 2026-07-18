import type { MessageContextReference } from '@neko-agent/types';
import { isModelPreviewContextData, type AgentContextPayload } from '@neko/shared';

export function projectContextReferencesFromPayloads(
  payloads: AgentContextPayload[] | undefined,
): MessageContextReference[] | undefined {
  if (!payloads || payloads.length === 0) return undefined;
  return payloads.map((payload) => {
    const navigationData = projectContextNavigationData(payload);
    return {
      type: payload.type,
      id: payload.id,
      label: payload.label,
      summary: payload.summary,
      ...(Object.keys(navigationData).length > 0 ? { navigationData } : {}),
    };
  });
}

function projectContextNavigationData(payload: AgentContextPayload): Record<string, string> {
  const data = payload.data as Record<string, unknown> | null | undefined;
  const nav: Record<string, string> = {};

  if (data && typeof data === 'object') {
    copyStringField(nav, 'filePath', data.filePath);
    copyStringField(nav, 'path', data.path);
    if (typeof data.resolvedPath === 'string') nav.filePath = data.resolvedPath;
    copyStringField(nav, 'assetId', data.assetId);

    const embeddedNavigation = data.navigationData;
    if (embeddedNavigation && typeof embeddedNavigation === 'object') {
      for (const [key, value] of Object.entries(embeddedNavigation)) {
        if (typeof value === 'string') nav[key] = value;
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
  if (payload.type === 'asset' && !nav.assetId) nav.assetId = payload.id;
  if (payload.type === 'model-preview' && isModelPreviewContextData(payload.data)) {
    nav.resourceId = payload.data.source.id;
    nav.previewResourceId = payload.data.previewImage.id;
    const sourcePath =
      payload.data.source.source.projectRelativePath ?? payload.data.source.source.uri;
    if (sourcePath) nav.path = sourcePath;
  }

  return nav;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function copyStringField(target: Record<string, string>, key: string, value: unknown): void {
  if (typeof value === 'string') target[key] = value;
}
