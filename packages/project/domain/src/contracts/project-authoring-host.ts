import {
  parseProjectAuthoringNavigation,
  type ProjectAuthoringNavigationItem,
} from './project-authoring-navigation';
import { parseProjectContentProjection, type ProjectContentProjection } from './project-content';
import {
  parseProjectGlobalReferenceMutation,
  parseProjectCreativeWorkspaceProjection,
  type ProjectGlobalReferenceMutation,
  type ProjectCreativeWorkspaceProjection,
  parseProjectWorkspaceObjectMutation,
  type ProjectWorkspaceObjectMutation,
} from './project-composition';

export const PROJECT_AUTHORING_HOST_CHANNEL = 'openneko:project:authoring-navigation' as const;

export interface ProjectAuthoringNavigationBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly projectId: string;
}

export type ProjectCreativeWorkspaceBinding = ProjectAuthoringNavigationBinding;

export interface ProjectAuthoringNavigationHostRequest extends ProjectAuthoringNavigationBinding {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly operation: 'navigation-get';
}

export interface ProjectContentHostRequest extends ProjectAuthoringNavigationBinding {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly operation: 'content-get';
}

export interface ProjectCreativeWorkspaceHostRequest extends ProjectAuthoringNavigationBinding {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly operation: 'creative-workspace-get';
}

export interface ProjectCreativeWorkspaceMutationHostRequest extends ProjectAuthoringNavigationBinding {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly operation: 'creative-workspace-reference-mutate';
  readonly mutation: ProjectGlobalReferenceMutation;
}

export interface ProjectCreativeWorkspaceObjectMutationHostRequest extends ProjectAuthoringNavigationBinding {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly operation: 'creative-workspace-object-mutate';
  readonly mutation: ProjectWorkspaceObjectMutation;
}

export interface ProjectAuthoringCatalogHostRequest {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly operation: 'catalog-get';
}

export type ProjectAuthoringHostRequest =
  | ProjectAuthoringNavigationHostRequest
  | ProjectAuthoringCatalogHostRequest
  | ProjectContentHostRequest
  | ProjectCreativeWorkspaceHostRequest
  | ProjectCreativeWorkspaceMutationHostRequest
  | ProjectCreativeWorkspaceObjectMutationHostRequest;

export interface ProjectAuthoringNavigationHostResult {
  readonly requestId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly navigation: readonly ProjectAuthoringNavigationItem[];
}

export interface ProjectAuthoringCatalogEntry {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly label: string;
  readonly navigation: readonly ProjectAuthoringNavigationItem[];
}

export interface ProjectAuthoringCatalogDiagnostic {
  readonly projectId: string;
  readonly message: string;
}

export interface ProjectAuthoringCatalogHostResult {
  readonly requestId: string;
  readonly projects: readonly ProjectAuthoringCatalogEntry[];
  readonly diagnostics: readonly ProjectAuthoringCatalogDiagnostic[];
}

export interface ProjectContentHostResult {
  readonly requestId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly projection: ProjectContentProjection;
}

export interface ProjectCreativeWorkspaceHostResult extends ProjectAuthoringNavigationBinding {
  readonly requestId: string;
  readonly projection: ProjectCreativeWorkspaceProjection;
}

export interface ProjectCreativeWorkspaceHostPort {
  getCreativeWorkspace(
    windowId: string,
    binding: ProjectAuthoringNavigationBinding,
  ): Promise<ProjectCreativeWorkspaceHostResult>;
  mutateCreativeWorkspaceReference(
    windowId: string,
    binding: ProjectAuthoringNavigationBinding,
    mutation: ProjectGlobalReferenceMutation,
  ): Promise<ProjectCreativeWorkspaceHostResult>;
  mutateCreativeWorkspaceObject(
    windowId: string,
    binding: ProjectAuthoringNavigationBinding,
    mutation: ProjectWorkspaceObjectMutation,
  ): Promise<ProjectCreativeWorkspaceHostResult>;
}

export interface OpenNekoDesktopProjectAuthoringBridge {
  readonly projectAuthoring: ProjectCreativeWorkspaceHostPort & {
    getCatalog(windowId: string): Promise<ProjectAuthoringCatalogHostResult>;
    getNavigation(
      windowId: string,
      binding: ProjectAuthoringNavigationBinding,
    ): Promise<ProjectAuthoringNavigationHostResult>;
    getContent(
      windowId: string,
      binding: ProjectAuthoringNavigationBinding,
    ): Promise<ProjectContentHostResult>;
  };
}

export function createProjectCreativeWorkspaceHostRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: ProjectAuthoringNavigationBinding;
}): ProjectCreativeWorkspaceHostRequest {
  const request = parseProjectAuthoringHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    operation: 'creative-workspace-get',
    ...input.binding,
  });
  if (request.operation !== 'creative-workspace-get') {
    throw new Error('Project authoring owner returned another Creative Workspace operation.');
  }
  return request;
}

export function createProjectCreativeWorkspaceMutationHostRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: ProjectAuthoringNavigationBinding;
  readonly mutation: ProjectGlobalReferenceMutation;
}): ProjectCreativeWorkspaceMutationHostRequest {
  const request = parseProjectAuthoringHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    operation: 'creative-workspace-reference-mutate',
    ...input.binding,
    mutation: input.mutation,
  });
  if (request.operation !== 'creative-workspace-reference-mutate') {
    throw new Error('Project authoring owner returned another Workspace mutation operation.');
  }
  return request;
}

export function createProjectCreativeWorkspaceObjectMutationHostRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: ProjectAuthoringNavigationBinding;
  readonly mutation: ProjectWorkspaceObjectMutation;
}): ProjectCreativeWorkspaceObjectMutationHostRequest {
  const request = parseProjectAuthoringHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    operation: 'creative-workspace-object-mutate',
    ...input.binding,
    mutation: input.mutation,
  });
  if (request.operation !== 'creative-workspace-object-mutate') {
    throw new Error('Project authoring owner returned another Workspace object operation.');
  }
  return request;
}

export function createProjectContentHostRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: ProjectAuthoringNavigationBinding;
}): ProjectContentHostRequest {
  return parseProjectContentHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    operation: 'content-get',
    ...input.binding,
  });
}

export function createProjectAuthoringCatalogHostRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
}): ProjectAuthoringCatalogHostRequest {
  return parseProjectAuthoringCatalogHostRequest({ ...input, operation: 'catalog-get' });
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
    'projectId',
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
    projectId: requireIdentity(record['projectId'], 'Project'),
  };
}

export function parseProjectAuthoringCatalogHostRequest(
  value: unknown,
): ProjectAuthoringCatalogHostRequest {
  const request = parseProjectAuthoringHostRequest(value);
  if (request.operation !== 'catalog-get') {
    throw new Error(`Project authoring request is '${request.operation}', not 'catalog-get'.`);
  }
  return request;
}

export function parseProjectContentHostRequest(value: unknown): ProjectContentHostRequest {
  const record = requireRecord(value, 'Project Content request');
  requireExactKeys(record, [
    'requestId',
    'rendererSessionId',
    'windowId',
    'operation',
    'workspaceId',
    'workspaceGrantId',
    'projectId',
  ]);
  if (record['operation'] !== 'content-get') {
    throw new Error(`Unknown Project authoring operation: ${String(record['operation'])}`);
  }
  return {
    requestId: requireIdentity(record['requestId'], 'Project Content request'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'Renderer session'),
    windowId: requireIdentity(record['windowId'], 'Desktop Window'),
    operation: 'content-get',
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
    projectId: requireIdentity(record['projectId'], 'Project'),
  };
}

export function parseProjectAuthoringHostRequest(value: unknown): ProjectAuthoringHostRequest {
  const record = requireRecord(value, 'Project authoring request');
  const operation = record['operation'];
  if (operation === 'catalog-get') {
    requireExactKeys(record, ['requestId', 'rendererSessionId', 'windowId', 'operation']);
    return {
      requestId: requireIdentity(record['requestId'], 'Project authoring request'),
      rendererSessionId: requireIdentity(record['rendererSessionId'], 'Renderer session'),
      windowId: requireIdentity(record['windowId'], 'Desktop Window'),
      operation,
    };
  }
  if (operation === 'navigation-get') {
    return parseProjectAuthoringNavigationHostRequest(record);
  }
  if (operation === 'content-get') {
    return parseProjectContentHostRequest(record);
  }
  if (operation === 'creative-workspace-get') {
    requireExactKeys(record, [
      'requestId',
      'rendererSessionId',
      'windowId',
      'operation',
      'workspaceId',
      'workspaceGrantId',
      'projectId',
    ]);
    return {
      ...parseProjectAuthoringBindingRequest(record),
      operation,
    };
  }
  if (operation === 'creative-workspace-reference-mutate') {
    requireExactKeys(record, [
      'requestId',
      'rendererSessionId',
      'windowId',
      'operation',
      'workspaceId',
      'workspaceGrantId',
      'projectId',
      'mutation',
    ]);
    return {
      ...parseProjectAuthoringBinding(record),
      operation,
      mutation: parseProjectGlobalReferenceMutation(record['mutation']),
    };
  }
  if (operation === 'creative-workspace-object-mutate') {
    requireExactKeys(record, [
      'requestId',
      'rendererSessionId',
      'windowId',
      'operation',
      'workspaceId',
      'workspaceGrantId',
      'projectId',
      'mutation',
    ]);
    return {
      ...parseProjectAuthoringBinding(record),
      operation,
      mutation: parseProjectWorkspaceObjectMutation(record['mutation']),
    };
  }
  throw new Error(`Unknown Project authoring operation: ${String(operation)}`);
}

export function parseProjectCreativeWorkspaceHostResult(
  value: unknown,
  expectedRequestId: string,
  expectedBinding: ProjectAuthoringNavigationBinding,
): ProjectCreativeWorkspaceHostResult {
  const record = requireRecord(value, 'Project Creative Workspace result');
  requireExactKeys(record, [
    'requestId',
    'workspaceId',
    'workspaceGrantId',
    'projectId',
    'projection',
  ]);
  const binding = parseAndRequireBindingResult(record, expectedRequestId, expectedBinding);
  const projection = parseProjectCreativeWorkspaceProjection(record['projection']);
  if (projection.composition.projectId !== binding.projectId) {
    throw new Error('Project Creative Workspace projection belongs to another Project.');
  }
  return { ...binding, projection };
}

function parseProjectAuthoringBindingRequest(
  record: Readonly<Record<string, unknown>>,
): ProjectCreativeWorkspaceHostRequest {
  return {
    ...parseProjectAuthoringBinding(record),
    operation: 'creative-workspace-get',
  };
}

function parseProjectAuthoringBinding(record: Readonly<Record<string, unknown>>): Readonly<{
  requestId: string;
  rendererSessionId: string;
  windowId: string;
}> &
  ProjectAuthoringNavigationBinding {
  return {
    requestId: requireIdentity(record['requestId'], 'Project authoring request'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'Renderer session'),
    windowId: requireIdentity(record['windowId'], 'Desktop Window'),
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
    projectId: requireIdentity(record['projectId'], 'Project'),
  };
}

function parseAndRequireBindingResult(
  record: Readonly<Record<string, unknown>>,
  expectedRequestId: string,
  expectedBinding: ProjectAuthoringNavigationBinding,
): Readonly<{ requestId: string }> & ProjectAuthoringNavigationBinding {
  const result = {
    requestId: requireMatchingRequestId(record['requestId'], expectedRequestId),
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
    projectId: requireIdentity(record['projectId'], 'Project'),
  };
  for (const key of ['workspaceId', 'workspaceGrantId', 'projectId'] as const) {
    if (result[key] !== expectedBinding[key]) {
      throw new Error(`Project authoring result ${key} mismatch.`);
    }
  }
  return result;
}

export function parseProjectContentHostResult(
  value: unknown,
  expectedRequestId: string,
): ProjectContentHostResult {
  const record = requireRecord(value, 'Project Content result');
  requireExactKeys(record, ['requestId', 'workspaceId', 'projectId', 'projection']);
  const requestId = requireMatchingRequestId(record['requestId'], expectedRequestId);
  const projectId = requireIdentity(record['projectId'], 'Project');
  const projection = parseProjectContentProjection(record['projection']);
  if (projection.projectId !== projectId) {
    throw new Error('Project Content result projection belongs to another Project.');
  }
  return {
    requestId,
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    projectId,
    projection,
  };
}

export function parseProjectAuthoringNavigationHostResult(
  value: unknown,
  expectedRequestId: string,
): ProjectAuthoringNavigationHostResult {
  const record = requireRecord(value, 'Project authoring navigation result');
  requireExactKeys(record, ['requestId', 'workspaceId', 'projectId', 'navigation']);
  const requestId = requireIdentity(record['requestId'], 'Project authoring request');
  if (requestId !== expectedRequestId) {
    throw new Error(
      `Project authoring result '${requestId}' does not match '${expectedRequestId}'.`,
    );
  }
  return {
    requestId,
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    projectId: requireIdentity(record['projectId'], 'Project'),
    navigation: parseProjectAuthoringNavigation(record['navigation']),
  };
}

export function parseProjectAuthoringCatalogHostResult(
  value: unknown,
  expectedRequestId: string,
): ProjectAuthoringCatalogHostResult {
  const record = requireRecord(value, 'Project authoring catalog result');
  requireExactKeys(record, ['requestId', 'projects', 'diagnostics']);
  const requestId = requireMatchingRequestId(record['requestId'], expectedRequestId);
  if (!Array.isArray(record['projects'])) {
    throw new Error('Project authoring catalog projects must be an array.');
  }
  if (!Array.isArray(record['diagnostics'])) {
    throw new Error('Project authoring catalog diagnostics must be an array.');
  }
  return {
    requestId,
    projects: record['projects'].map((value) => {
      const project = requireRecord(value, 'Project authoring catalog entry');
      requireExactKeys(project, ['workspaceId', 'projectId', 'label', 'navigation']);
      return {
        workspaceId: requireIdentity(project['workspaceId'], 'Workspace'),
        projectId: requireIdentity(project['projectId'], 'Project'),
        label: requireIdentity(project['label'], 'Project label'),
        navigation: parseProjectAuthoringNavigation(project['navigation']),
      };
    }),
    diagnostics: record['diagnostics'].map((value) => {
      const diagnostic = requireRecord(value, 'Project authoring catalog diagnostic');
      requireExactKeys(diagnostic, ['projectId', 'message']);
      return {
        projectId: requireIdentity(diagnostic['projectId'], 'Project'),
        message: requireIdentity(diagnostic['message'], 'Project authoring diagnostic'),
      };
    }),
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

function requireMatchingRequestId(value: unknown, expectedRequestId: string): string {
  const requestId = requireIdentity(value, 'Project authoring request');
  if (requestId !== expectedRequestId) {
    throw new Error(
      `Project authoring result '${requestId}' does not match '${expectedRequestId}'.`,
    );
  }
  return requestId;
}
