import type { AgentContextPayload, MessageContextReference } from '@neko/agent-contracts';
import { isContentLocator, type ContentLocator } from '@neko/content';

export function projectContextReferencesFromPayloads(
  payloads: AgentContextPayload[] | undefined,
): MessageContextReference[] | undefined {
  if (!payloads || payloads.length === 0) return undefined;
  return payloads.map((payload) => {
    const navigationData = projectContextNavigationData(payload);
    const contentLocator = projectContextContentLocator(payload);
    return {
      type: payload.type,
      id: payload.id,
      label: payload.label,
      summary: payload.summary,
      ...(contentLocator ? { contentLocator } : {}),
      ...(Object.keys(navigationData).length > 0 ? { navigationData } : {}),
    };
  });
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
