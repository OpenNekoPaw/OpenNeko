import {
  parseProjectAuthoringNavigation,
  type ProjectAuthoringNavigationItem,
} from './project-authoring-navigation';

export const PROJECT_AUTHORING_HOST_CHANNEL = 'openneko:project:authoring-navigation' as const;

export interface ProjectAuthoringNavigationBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly contentProjectId: string;
}

export interface ProjectAuthoringNavigationHostRequest extends ProjectAuthoringNavigationBinding {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly operation: 'navigation-get';
}

export interface ProjectAuthoringNavigationHostResult {
  readonly requestId: string;
  readonly workspaceId: string;
  readonly contentProjectId: string;
  readonly navigation: readonly ProjectAuthoringNavigationItem[];
}

export interface OpenNekoDesktopProjectAuthoringBridge {
  readonly projectAuthoring: {
    getNavigation(
      windowId: string,
      binding: ProjectAuthoringNavigationBinding,
    ): Promise<ProjectAuthoringNavigationHostResult>;
  };
}

export function createProjectAuthoringNavigationHostRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: ProjectAuthoringNavigationBinding;
}): ProjectAuthoringNavigationHostRequest {
  return parseProjectAuthoringNavigationHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    operation: 'navigation-get',
    ...input.binding,
  });
}

export function parseProjectAuthoringNavigationHostRequest(
  value: unknown,
): ProjectAuthoringNavigationHostRequest {
  const record = requireRecord(value, 'Project authoring navigation request');
  requireExactKeys(record, [
    'requestId',
    'rendererSessionId',
    'windowId',
    'operation',
    'workspaceId',
    'workspaceGrantId',
    'contentProjectId',
  ]);
  if (record['operation'] !== 'navigation-get') {
    throw new Error(`Unknown Project authoring operation: ${String(record['operation'])}`);
  }
  return {
    requestId: requireIdentity(record['requestId'], 'Project authoring request'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'Renderer session'),
    windowId: requireIdentity(record['windowId'], 'Desktop Window'),
    operation: 'navigation-get',
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
    contentProjectId: requireIdentity(record['contentProjectId'], 'Content Project'),
  };
}

export function parseProjectAuthoringNavigationHostResult(
  value: unknown,
  expectedRequestId: string,
): ProjectAuthoringNavigationHostResult {
  const record = requireRecord(value, 'Project authoring navigation result');
  requireExactKeys(record, ['requestId', 'workspaceId', 'contentProjectId', 'navigation']);
  const requestId = requireIdentity(record['requestId'], 'Project authoring request');
  if (requestId !== expectedRequestId) {
    throw new Error(
      `Project authoring result '${requestId}' does not match '${expectedRequestId}'.`,
    );
  }
  return {
    requestId,
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    contentProjectId: requireIdentity(record['contentProjectId'], 'Content Project'),
    navigation: parseProjectAuthoringNavigation(record['navigation']),
  };
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(record: Readonly<Record<string, unknown>>, expected: readonly string[]) {
  const actual = Object.keys(record).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    throw new Error('Project authoring host payload has unknown or missing fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}
