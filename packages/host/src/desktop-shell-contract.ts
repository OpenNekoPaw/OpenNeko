import type { HostDiagnostic } from '@neko/host/ports';
import {
  parseAgentHomeConversationSummary as parseCanonicalAgentHomeConversationSummary,
  parseAgentHomeNavigationIdentity as parseCanonicalAgentHomeNavigationIdentity,
  parseAgentHomeProjection,
  type AgentConversationOwnerRef,
  type AgentHomeActivityKind,
  type AgentHomeActivitySummary,
  type AgentHomeAttentionStatus,
  type AgentHomeConversationSummary,
  type AgentHomeNavigationIdentity,
  type AgentHomeProjection,
} from '@neko/agent-contracts';
import {
  parseDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from './desktop-workbench-contract';
import {
  parseDesktopApplicationSidebarProjection,
  parseDesktopWorkbenchSceneProjection,
  type DesktopApplicationSidebarProjection,
  type DesktopWorkbenchSceneProjection,
  type DesktopSceneTransitionIntent,
  type DesktopSceneTransitionResult,
} from './desktop-scene-contract';

export const DESKTOP_SHELL_CONTRACT_VERSION = 3 as const;
export const DESKTOP_CONVERSATION_NAVIGATION_VERSION = 1 as const;

export const DESKTOP_SHELL_CHANNELS = {
  snapshotGet: 'openneko:desktop:shell:snapshot:get',
  projectionEvent: 'openneko:desktop:shell:projection:event',
  projectOpenContent: 'openneko:desktop:project:content:open',
  projectOpenCatalog: 'openneko:desktop:project:catalog:open',
  projectRemoveRecent: 'openneko:desktop:project:recent:remove',
  projectRequestProfile: 'openneko:desktop:project:profile:request',
  conversationDelete: 'openneko:desktop:home:conversation:delete',
  homeActivate: 'openneko:desktop:home:activate',
  tabActivate: 'openneko:desktop:tab:activate',
  tabClose: 'openneko:desktop:tab:close',
  workbenchUpdate: 'openneko:desktop:workbench:update',
  applicationSidebarUpdate: 'openneko:desktop:application-sidebar:update',
  sceneTransition: 'openneko:desktop:scene:transition',
} as const;

export type DesktopProjectProfile = 'content' | 'character' | 'world';
export type DesktopUnavailableProjectProfile = Exclude<DesktopProjectProfile, 'content'>;
const DESKTOP_DOMAIN_SURFACES = [
  'agent',
  'media-library',
  'canvas',
  'cut',
  'preview',
  'generation',
  'quality',
  'character',
  'world',
  'tools',
] as const;

export type DesktopDomainSurface = (typeof DESKTOP_DOMAIN_SURFACES)[number];

export interface DesktopShellRequest {
  readonly schemaVersion: typeof DESKTOP_SHELL_CONTRACT_VERSION;
  readonly requestId: string;
}

export interface DesktopWindowMutationRequest extends DesktopShellRequest {
  readonly expectedEndpointEpoch: string;
  readonly expectedWindowRevision: number;
}

export interface DesktopProjectOpenRequest extends DesktopWindowMutationRequest {
  readonly projectId: string;
}

export interface DesktopProjectRemoveRecentRequest extends DesktopProjectOpenRequest {
  readonly expectedCatalogRevision: number;
}

export interface DesktopProjectCatalogItem {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly profile: 'content';
  readonly displayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DesktopProjectCatalogProjection {
  readonly revision: number;
  readonly projects: readonly DesktopProjectCatalogItem[];
}

export interface DesktopProjectTabProjection {
  readonly tabId: string;
  readonly projectId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
}

export type DesktopWindowActiveTarget =
  { readonly kind: 'home' } | { readonly kind: 'project'; readonly tabId: string };

export interface DesktopWindowShellProjection {
  readonly windowId: string;
  readonly revision: number;
  readonly activeTarget: DesktopWindowActiveTarget;
  readonly tabs: readonly DesktopProjectTabProjection[];
  readonly workbench: DesktopWorkbenchLayoutProjection;
  readonly scene: DesktopWorkbenchSceneProjection;
  readonly applicationSidebar: DesktopApplicationSidebarProjection;
}

export interface DesktopAttentionProjection {
  readonly needsInput: number;
  readonly needsReview: number;
  readonly running: number;
}

export type DesktopAgentHomeAttentionStatus = AgentHomeAttentionStatus;

export type DesktopAgentHomeActivityKind = AgentHomeActivityKind;

export type DesktopAgentHomeNavigationIdentity = AgentHomeNavigationIdentity;

export interface DesktopConversationDeleteRequest extends DesktopWindowMutationRequest {
  readonly expectedAgentHomeRevision: number;
  readonly navigation: DesktopAgentHomeNavigationIdentity;
}

export type DesktopAgentHomeActivitySummary = AgentHomeActivitySummary;

export type DesktopAgentHomeConversationSummary = AgentHomeConversationSummary;

export type DesktopAgentHomeProjection = AgentHomeProjection;

export type DesktopConversationNavigationGroup =
  | {
      readonly kind: 'project';
      readonly projectId: string;
      readonly workspaceId: string;
      readonly displayName: string;
      readonly conversations: readonly DesktopAgentHomeConversationSummary[];
    }
  | {
      readonly kind: 'assistant';
      readonly assistantSpaceId: string;
      readonly conversations: readonly DesktopAgentHomeConversationSummary[];
    }
  | {
      readonly kind: 'character';
      readonly characterId: string;
      readonly conversations: readonly DesktopAgentHomeConversationSummary[];
    }
  | {
      readonly kind: 'room';
      readonly roomId: string;
      readonly conversations: readonly DesktopAgentHomeConversationSummary[];
    };

export interface DesktopConversationNavigationProjection {
  readonly schemaVersion: typeof DESKTOP_CONVERSATION_NAVIGATION_VERSION;
  readonly projectCatalogRevision: number;
  readonly agentHomeRevision: number;
  readonly groups: readonly DesktopConversationNavigationGroup[];
}

export type DesktopReadyDomainCapabilityProjection =
  | {
      readonly surface: 'agent';
      readonly status: 'ready';
      readonly ownerSlice: 'P1.3';
    }
  | {
      readonly surface: 'media-library';
      readonly status: 'ready';
      readonly ownerSlice: 'P1.4';
    }
  | {
      readonly surface: 'canvas';
      readonly status: 'ready';
      readonly ownerSlice: 'P1.4';
    }
  | {
      readonly surface: 'preview';
      readonly status: 'ready';
      readonly ownerSlice: 'P1.5';
    }
  | {
      readonly surface: 'cut';
      readonly status: 'ready';
      readonly ownerSlice: 'P1.5';
    };

export interface DesktopUnavailableDomainCapabilityProjection {
  readonly surface: DesktopDomainSurface;
  readonly status: 'unavailable';
  readonly ownerSlice: 'P1.3' | 'P1.4' | 'P1.5' | 'P1.6';
  readonly diagnosticCode: 'desktop-domain-surface-unavailable';
}

export type DesktopDomainCapabilityProjection =
  DesktopReadyDomainCapabilityProjection | DesktopUnavailableDomainCapabilityProjection;

export interface DesktopShellProjection {
  readonly schemaVersion: typeof DESKTOP_SHELL_CONTRACT_VERSION;
  readonly applicationInstanceId: string;
  readonly endpointEpoch: string;
  readonly projectionRevision: number;
  readonly catalog: DesktopProjectCatalogProjection;
  readonly window: DesktopWindowShellProjection;
  readonly agentHome: DesktopAgentHomeProjection;
  readonly conversationNavigation: DesktopConversationNavigationProjection;
  readonly domains: readonly DesktopDomainCapabilityProjection[];
}

export interface DesktopShellResponse {
  readonly schemaVersion: typeof DESKTOP_SHELL_CONTRACT_VERSION;
  readonly requestId: string;
  readonly projection: DesktopShellProjection;
}

export interface DesktopOpenContentResult extends DesktopShellResponse {
  readonly status: 'opened' | 'cancelled';
}

export interface DesktopProfileRequest extends DesktopShellRequest {
  readonly profile: DesktopUnavailableProjectProfile;
}

export interface DesktopProfileRequestResult extends DesktopShellResponse {
  readonly status: 'unavailable';
  readonly diagnostic: HostDiagnostic & {
    readonly code: 'desktop-project-profile-unavailable';
    readonly severity: 'error';
  };
}

export interface DesktopTabMutationRequest extends DesktopShellRequest {
  readonly expectedEndpointEpoch: string;
  readonly tabId: string;
  readonly expectedWindowRevision: number;
}

export interface DesktopWorkbenchMutationRequest extends DesktopWindowMutationRequest {
  readonly expectedWorkbenchRevision: number;
  readonly workbench: DesktopWorkbenchLayoutProjection;
}

export interface DesktopShellProjectionEvent {
  readonly schemaVersion: typeof DESKTOP_SHELL_CONTRACT_VERSION;
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly rendererEpoch: number;
  readonly sequence: number;
  readonly projection: DesktopShellProjection;
}

export interface OpenNekoDesktopShellBridge {
  readonly shell: {
    getSnapshot(): Promise<DesktopShellProjection>;
    subscribe(listener: (event: DesktopShellProjectionEvent) => void): () => void;
  };
  readonly projects: {
    openContent(): Promise<DesktopOpenContentResult>;
    open(projectId: string): Promise<DesktopOpenContentResult>;
    removeRecent(
      projectId: string,
      expectedWindowRevision: number,
      expectedCatalogRevision: number,
    ): Promise<DesktopShellProjection>;
    requestProfile(profile: DesktopUnavailableProjectProfile): Promise<DesktopProfileRequestResult>;
  };
  readonly conversations: {
    delete(
      navigation: DesktopAgentHomeNavigationIdentity,
      expectedWindowRevision: number,
      expectedAgentHomeRevision: number,
    ): Promise<DesktopShellProjection>;
  };
  readonly tabs: {
    activateHome(expectedWindowRevision: number): Promise<DesktopShellProjection>;
    activate(tabId: string, expectedWindowRevision: number): Promise<DesktopShellProjection>;
    close(tabId: string, expectedWindowRevision: number): Promise<DesktopShellProjection>;
  };
  readonly workbench: {
    update(
      workbench: DesktopWorkbenchLayoutProjection,
      expectedWindowRevision: number,
      expectedWorkbenchRevision: number,
    ): Promise<DesktopShellProjection>;
  };
  readonly applicationSidebar: {
    update(
      windowId: string,
      visible: boolean,
      width: number,
      expectedSidebarRevision: number,
    ): Promise<DesktopShellProjection>;
  };
  readonly scenes: {
    transition(
      windowId: string,
      intent: DesktopSceneTransitionIntent,
      expectedWindowRevision: number,
      expectedSceneRevision: number,
    ): Promise<DesktopSceneTransitionResult>;
  };
}

export class DesktopShellContractError extends Error {
  readonly code:
    | 'invalid-desktop-shell-payload'
    | 'unsupported-desktop-shell-version'
    | 'desktop-shell-request-mismatch'
    | 'desktop-shell-stale-revision'
    | 'desktop-shell-project-not-found'
    | 'desktop-shell-project-identity-mismatch'
    | 'desktop-shell-conversation-not-found';

  constructor(code: DesktopShellContractError['code'], message: string) {
    super(message);
    this.name = 'DesktopShellContractError';
    this.code = code;
  }
}

export function projectDesktopConversationNavigation(
  catalog: DesktopProjectCatalogProjection,
  agentHome: DesktopAgentHomeProjection,
): DesktopConversationNavigationProjection {
  const projectGroups = new Map<
    string,
    Extract<DesktopConversationNavigationGroup, { readonly kind: 'project' }>
  >(
    catalog.projects.map((project) => [
      project.projectId,
      {
        kind: 'project',
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        displayName: project.displayName,
        conversations: [],
      },
    ]),
  );
  const projectsByWorkspace = new Map<string, DesktopProjectCatalogItem[]>();
  for (const project of catalog.projects) {
    projectsByWorkspace.set(project.workspaceId, [
      ...(projectsByWorkspace.get(project.workspaceId) ?? []),
      project,
    ]);
  }
  const standaloneGroups = new Map<string, DesktopConversationNavigationGroup>();
  for (const conversation of agentHome.conversations) {
    const explicitProjectId = conversation.groupedProjectId;
    if (explicitProjectId !== undefined) {
      const projectGroup = projectGroups.get(explicitProjectId);
      if (!projectGroup) {
        throw new DesktopShellContractError(
          'desktop-shell-project-identity-mismatch',
          `Agent Conversation '${conversation.navigation.conversationId}' references unknown Project '${explicitProjectId}'.`,
        );
      }
      if (
        conversation.navigation.owner.kind === 'workspace' &&
        conversation.navigation.owner.workspaceId !== projectGroup.workspaceId
      ) {
        throw new DesktopShellContractError(
          'desktop-shell-project-identity-mismatch',
          `Workspace Conversation '${conversation.navigation.conversationId}' is grouped under another Project.`,
        );
      }
      projectGroups.set(explicitProjectId, appendConversation(projectGroup, conversation));
      continue;
    }
    if (conversation.navigation.owner.kind === 'workspace') {
      const projects = projectsByWorkspace.get(conversation.navigation.owner.workspaceId) ?? [];
      if (projects.length !== 1) {
        throw new DesktopShellContractError(
          'desktop-shell-project-identity-mismatch',
          `Workspace Conversation '${conversation.navigation.conversationId}' does not resolve to one exact Project.`,
        );
      }
      const project = projects[0];
      if (!project) throw new Error('Exact Workspace Project resolution is missing.');
      const projectGroup = projectGroups.get(project.projectId);
      if (!projectGroup) throw new Error('Exact Workspace Project group is missing.');
      projectGroups.set(project.projectId, appendConversation(projectGroup, conversation));
      continue;
    }
    const key = standaloneGroupKey(conversation.navigation.owner);
    const current =
      standaloneGroups.get(key) ?? createStandaloneGroup(conversation.navigation.owner);
    standaloneGroups.set(key, appendConversation(current, conversation));
  }
  return Object.freeze({
    schemaVersion: DESKTOP_CONVERSATION_NAVIGATION_VERSION,
    projectCatalogRevision: catalog.revision,
    agentHomeRevision: agentHome.revision,
    groups: Object.freeze(
      [...projectGroups.values(), ...standaloneGroups.values()].map((group) =>
        Object.freeze({
          ...group,
          conversations: Object.freeze(
            [...group.conversations].sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            ),
          ),
        }),
      ),
    ),
  });
}

function appendConversation<T extends DesktopConversationNavigationGroup>(
  group: T,
  conversation: DesktopAgentHomeConversationSummary,
): T {
  return { ...group, conversations: [...group.conversations, conversation] };
}

function standaloneGroupKey(
  owner: Exclude<AgentConversationOwnerRef, { kind: 'workspace' }>,
): string {
  switch (owner.kind) {
    case 'assistant':
      return `assistant:${owner.assistantSpaceId}`;
    case 'character':
      return `character:${owner.characterId}`;
    case 'room':
      return `room:${owner.roomId}`;
  }
}

function createStandaloneGroup(
  owner: Exclude<AgentConversationOwnerRef, { kind: 'workspace' }>,
): DesktopConversationNavigationGroup {
  switch (owner.kind) {
    case 'assistant':
      return { kind: owner.kind, assistantSpaceId: owner.assistantSpaceId, conversations: [] };
    case 'character':
      return { kind: owner.kind, characterId: owner.characterId, conversations: [] };
    case 'room':
      return { kind: owner.kind, roomId: owner.roomId, conversations: [] };
  }
}

export function createDesktopShellRequest(requestId: string): DesktopShellRequest {
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Shell requestId is required.'),
  };
}

export function createDesktopProfileRequest(
  requestId: string,
  profile: DesktopUnavailableProjectProfile,
): DesktopProfileRequest {
  return {
    ...createDesktopShellRequest(requestId),
    profile: requireUnavailableProfile(profile),
  };
}

export function createDesktopTabMutationRequest(
  requestId: string,
  tabId: string,
  expectedEndpointEpoch: string,
  expectedWindowRevision: number,
): DesktopTabMutationRequest {
  return {
    ...createDesktopShellRequest(requestId),
    expectedEndpointEpoch: requireNonEmptyString(
      expectedEndpointEpoch,
      'Desktop expected endpoint epoch is required.',
    ),
    tabId: requireNonEmptyString(tabId, 'Desktop Project Tab identity is required.'),
    expectedWindowRevision: requireNonNegativeInteger(
      expectedWindowRevision,
      'Desktop expected Window revision must be a non-negative integer.',
    ),
  };
}

export function createDesktopWindowMutationRequest(
  requestId: string,
  expectedEndpointEpoch: string,
  expectedWindowRevision: number,
): DesktopWindowMutationRequest {
  return {
    ...createDesktopShellRequest(requestId),
    expectedEndpointEpoch: requireNonEmptyString(
      expectedEndpointEpoch,
      'Desktop expected endpoint epoch is required.',
    ),
    expectedWindowRevision: requireNonNegativeInteger(
      expectedWindowRevision,
      'Desktop expected Window revision must be a non-negative integer.',
    ),
  };
}

export function createDesktopWorkbenchMutationRequest(
  requestId: string,
  expectedEndpointEpoch: string,
  expectedWindowRevision: number,
  expectedWorkbenchRevision: number,
  workbench: DesktopWorkbenchLayoutProjection,
): DesktopWorkbenchMutationRequest {
  const request = createDesktopWindowMutationRequest(
    requestId,
    expectedEndpointEpoch,
    expectedWindowRevision,
  );
  const parsedWorkbench = parseDesktopWorkbenchLayout(workbench);
  const expectedRevision = requireNonNegativeInteger(
    expectedWorkbenchRevision,
    'Desktop expected Workbench revision must be a non-negative integer.',
  );
  if (parsedWorkbench.revision !== expectedRevision + 1) {
    throw invalidPayload(
      'Desktop Workbench mutation must advance the expected Workbench revision exactly once.',
    );
  }
  return {
    ...request,
    expectedWorkbenchRevision: expectedRevision,
    workbench: parsedWorkbench,
  };
}

export function createDesktopProjectOpenRequest(
  requestId: string,
  projectId: string,
  expectedEndpointEpoch: string,
  expectedWindowRevision: number,
): DesktopProjectOpenRequest {
  return {
    ...createDesktopWindowMutationRequest(requestId, expectedEndpointEpoch, expectedWindowRevision),
    projectId: requireNonEmptyString(projectId, 'Desktop Project identity is required.'),
  };
}

export function createDesktopProjectRemoveRecentRequest(
  requestId: string,
  projectId: string,
  expectedEndpointEpoch: string,
  expectedWindowRevision: number,
  expectedCatalogRevision: number,
): DesktopProjectRemoveRecentRequest {
  return {
    ...createDesktopProjectOpenRequest(
      requestId,
      projectId,
      expectedEndpointEpoch,
      expectedWindowRevision,
    ),
    expectedCatalogRevision: requireNonNegativeInteger(
      expectedCatalogRevision,
      'Desktop expected Project catalog revision must be a non-negative integer.',
    ),
  };
}

export function createDesktopConversationDeleteRequest(
  requestId: string,
  navigation: DesktopAgentHomeNavigationIdentity,
  expectedEndpointEpoch: string,
  expectedWindowRevision: number,
  expectedAgentHomeRevision: number,
): DesktopConversationDeleteRequest {
  return {
    ...createDesktopWindowMutationRequest(requestId, expectedEndpointEpoch, expectedWindowRevision),
    expectedAgentHomeRevision: requireNonNegativeInteger(
      expectedAgentHomeRevision,
      'Desktop expected Agent Home revision must be a non-negative integer.',
    ),
    navigation: parseDesktopAgentHomeNavigationIdentity(navigation),
  };
}

export function parseDesktopShellRequest(value: unknown): DesktopShellRequest {
  const record = requireRecord(value, 'Desktop Shell request must be an object.');
  requireVersion(record['schemaVersion']);
  return createDesktopShellRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Shell requestId is required.'),
  );
}

export function parseDesktopProfileRequest(value: unknown): DesktopProfileRequest {
  const record = requireRecord(value, 'Desktop profile request must be an object.');
  const request = parseDesktopShellRequest(record);
  return {
    ...request,
    profile: requireUnavailableProfile(record['profile']),
  };
}

export function parseDesktopTabMutationRequest(value: unknown): DesktopTabMutationRequest {
  const record = requireRecord(value, 'Desktop Tab mutation request must be an object.');
  const request = parseDesktopShellRequest(record);
  return createDesktopTabMutationRequest(
    request.requestId,
    requireNonEmptyString(record['tabId'], 'Desktop Project Tab identity is required.'),
    requireNonEmptyString(
      record['expectedEndpointEpoch'],
      'Desktop expected endpoint epoch is required.',
    ),
    requireNonNegativeInteger(
      record['expectedWindowRevision'],
      'Desktop expected Window revision must be a non-negative integer.',
    ),
  );
}

export function parseDesktopWindowMutationRequest(value: unknown): DesktopWindowMutationRequest {
  const record = requireRecord(value, 'Desktop Window mutation request must be an object.');
  const request = parseDesktopShellRequest(record);
  return createDesktopWindowMutationRequest(
    request.requestId,
    requireNonEmptyString(
      record['expectedEndpointEpoch'],
      'Desktop expected endpoint epoch is required.',
    ),
    requireNonNegativeInteger(
      record['expectedWindowRevision'],
      'Desktop expected Window revision must be a non-negative integer.',
    ),
  );
}

export function parseDesktopProjectOpenRequest(value: unknown): DesktopProjectOpenRequest {
  const record = requireRecord(value, 'Desktop Project open request must be an object.');
  const request = parseDesktopWindowMutationRequest(record);
  return createDesktopProjectOpenRequest(
    request.requestId,
    requireNonEmptyString(record['projectId'], 'Desktop Project identity is required.'),
    request.expectedEndpointEpoch,
    request.expectedWindowRevision,
  );
}

export function parseDesktopProjectRemoveRecentRequest(
  value: unknown,
): DesktopProjectRemoveRecentRequest {
  const record = requireRecord(value, 'Desktop Project remove-recent request must be an object.');
  const request = parseDesktopProjectOpenRequest(record);
  return createDesktopProjectRemoveRecentRequest(
    request.requestId,
    request.projectId,
    request.expectedEndpointEpoch,
    request.expectedWindowRevision,
    requireNonNegativeInteger(
      record['expectedCatalogRevision'],
      'Desktop expected Project catalog revision must be a non-negative integer.',
    ),
  );
}

export function parseDesktopConversationDeleteRequest(
  value: unknown,
): DesktopConversationDeleteRequest {
  const record = requireRecord(
    value,
    'Desktop Agent Home conversation delete request must be an object.',
  );
  const request = parseDesktopWindowMutationRequest(record);
  return createDesktopConversationDeleteRequest(
    request.requestId,
    parseDesktopAgentHomeNavigationIdentity(record['navigation']),
    request.expectedEndpointEpoch,
    request.expectedWindowRevision,
    requireNonNegativeInteger(
      record['expectedAgentHomeRevision'],
      'Desktop expected Agent Home revision must be a non-negative integer.',
    ),
  );
}

export function parseDesktopWorkbenchMutationRequest(
  value: unknown,
): DesktopWorkbenchMutationRequest {
  const record = requireRecord(value, 'Desktop Workbench mutation request must be an object.');
  const request = parseDesktopWindowMutationRequest(record);
  return createDesktopWorkbenchMutationRequest(
    request.requestId,
    request.expectedEndpointEpoch,
    request.expectedWindowRevision,
    requireNonNegativeInteger(
      record['expectedWorkbenchRevision'],
      'Desktop expected Workbench revision must be a non-negative integer.',
    ),
    parseDesktopWorkbenchLayout(record['workbench']),
  );
}

export function parseDesktopShellResponse(
  value: unknown,
  expectedRequestId: string,
): DesktopShellResponse {
  const record = requireRecord(value, 'Desktop Shell response must be an object.');
  requireVersion(record['schemaVersion']);
  const requestId = requireMatchingRequestId(record['requestId'], expectedRequestId);
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    requestId,
    projection: parseDesktopShellProjection(record['projection']),
  };
}

export function parseDesktopOpenContentResult(
  value: unknown,
  expectedRequestId: string,
): DesktopOpenContentResult {
  const record = requireRecord(value, 'Desktop open Content result must be an object.');
  const response = parseDesktopShellResponse(record, expectedRequestId);
  const status = record['status'];
  if (status !== 'opened' && status !== 'cancelled') {
    throw invalidPayload('Desktop open Content result status is invalid.');
  }
  return { ...response, status };
}

export function parseDesktopProfileRequestResult(
  value: unknown,
  expectedRequestId: string,
): DesktopProfileRequestResult {
  const record = requireRecord(value, 'Desktop profile result must be an object.');
  const response = parseDesktopShellResponse(record, expectedRequestId);
  if (record['status'] !== 'unavailable') {
    throw invalidPayload('Desktop unavailable profile result status is invalid.');
  }
  const diagnostic = requireRecord(
    record['diagnostic'],
    'Desktop unavailable profile diagnostic is required.',
  );
  if (
    diagnostic['code'] !== 'desktop-project-profile-unavailable' ||
    diagnostic['severity'] !== 'error'
  ) {
    throw invalidPayload('Desktop unavailable profile diagnostic identity is invalid.');
  }
  return {
    ...response,
    status: 'unavailable',
    diagnostic: {
      code: diagnostic['code'],
      severity: diagnostic['severity'],
      message: requireNonEmptyString(
        diagnostic['message'],
        'Desktop unavailable profile diagnostic message is required.',
      ),
      ...readOptionalMetadata(diagnostic),
    },
  };
}

export function parseDesktopShellProjection(value: unknown): DesktopShellProjection {
  const record = requireRecord(value, 'Desktop Shell projection must be an object.');
  requireVersion(record['schemaVersion']);
  const catalogRecord = requireRecord(
    record['catalog'],
    'Desktop Project catalog projection is required.',
  );
  const windowRecord = requireRecord(record['window'], 'Desktop Window projection is required.');
  const agentHomeRecord = requireRecord(
    record['agentHome'],
    'Desktop Agent Home projection is required.',
  );
  const agentHome = parseAgentHomeProjection(agentHomeRecord);
  const conversationNavigation = parseDesktopConversationNavigationProjection(
    record['conversationNavigation'],
  );
  const projects = requireArray(
    catalogRecord['projects'],
    'Desktop Project catalog items must be an array.',
  ).map(parseProjectCatalogItem);
  const catalog: DesktopProjectCatalogProjection = {
    revision: requireNonNegativeInteger(
      catalogRecord['revision'],
      'Desktop Project catalog revision must be a non-negative integer.',
    ),
    projects,
  };
  const tabs = requireArray(windowRecord['tabs'], 'Desktop Project Tabs must be an array.').map(
    parseProjectTab,
  );
  const activeTarget = parseActiveTarget(windowRecord['activeTarget']);
  const workbench = parseDesktopWorkbenchLayout(windowRecord['workbench']);
  const scene = parseDesktopWorkbenchSceneProjection(windowRecord['scene']);
  const applicationSidebar = parseDesktopApplicationSidebarProjection(
    windowRecord['applicationSidebar'],
  );
  const windowId = requireNonEmptyString(
    windowRecord['windowId'],
    'Desktop Window identity is required.',
  );
  if (workbench.windowId !== windowId) {
    throw invalidPayload('Desktop Workbench projection belongs to another Window.');
  }
  if (scene.windowId !== windowId || applicationSidebar.windowId !== windowId) {
    throw invalidPayload('Desktop Scene or Application Sidebar belongs to another Window.');
  }
  if (activeTarget.kind === 'project' && !tabs.some((tab) => tab.tabId === activeTarget.tabId)) {
    throw invalidPayload('Desktop active Project Tab is not present in the Window projection.');
  }
  const projectIds = new Set(projects.map((project) => project.projectId));
  if (tabs.some((tab) => !projectIds.has(tab.projectId))) {
    throw invalidPayload('Desktop Project Tab references an unknown Project.');
  }
  if (workbench.main.views.some((view) => !projectIds.has(view.projectId))) {
    throw invalidPayload('Desktop Workbench View references an unknown Project.');
  }
  if (activeTarget.kind === 'project') {
    const activeTab = tabs.find((tab) => tab.tabId === activeTarget.tabId);
    if (!activeTab || workbench.main.views.some((view) => view.projectId !== activeTab.projectId)) {
      throw invalidPayload('Desktop Workbench View belongs to another active Project.');
    }
  }
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    applicationInstanceId: requireNonEmptyString(
      record['applicationInstanceId'],
      'Desktop Shell application instance identity is required.',
    ),
    endpointEpoch: requireNonEmptyString(
      record['endpointEpoch'],
      'Desktop Shell endpoint epoch is required.',
    ),
    projectionRevision: requireNonNegativeInteger(
      record['projectionRevision'],
      'Desktop Shell projection revision must be a non-negative integer.',
    ),
    catalog,
    window: {
      windowId,
      revision: requireNonNegativeInteger(
        windowRecord['revision'],
        'Desktop Window revision must be a non-negative integer.',
      ),
      activeTarget,
      tabs,
      workbench,
      scene,
      applicationSidebar,
    },
    agentHome,
    conversationNavigation: assertConversationNavigationProjection(
      conversationNavigation,
      catalog,
      agentHome,
    ),
    domains: requireArray(
      record['domains'],
      'Desktop domain capability projection must be an array.',
    ).map(parseDesktopDomainCapabilityProjection),
  };
}

export function parseDesktopConversationNavigationProjection(
  value: unknown,
): DesktopConversationNavigationProjection {
  const record = requireRecord(
    value,
    'Desktop Conversation navigation projection must be an object.',
  );
  requireExactKeys(
    record,
    ['schemaVersion', 'projectCatalogRevision', 'agentHomeRevision', 'groups'],
    'Desktop Conversation navigation projection',
  );
  if (record['schemaVersion'] !== DESKTOP_CONVERSATION_NAVIGATION_VERSION) {
    throw invalidPayload(
      `Unsupported Desktop Conversation navigation version '${String(record['schemaVersion'])}'.`,
    );
  }
  const groups = requireArray(
    record['groups'],
    'Desktop Conversation navigation groups must be an array.',
  ).map(parseDesktopConversationNavigationGroup);
  const conversationIds = groups.flatMap((group) =>
    group.conversations.map((conversation) => conversation.navigation.conversationId),
  );
  if (new Set(conversationIds).size !== conversationIds.length) {
    throw invalidPayload('Desktop Conversation navigation places a Conversation more than once.');
  }
  return Object.freeze({
    schemaVersion: DESKTOP_CONVERSATION_NAVIGATION_VERSION,
    projectCatalogRevision: requireNonNegativeInteger(
      record['projectCatalogRevision'],
      'Desktop Conversation Project catalog revision is invalid.',
    ),
    agentHomeRevision: requireNonNegativeInteger(
      record['agentHomeRevision'],
      'Desktop Conversation Agent Home revision is invalid.',
    ),
    groups: Object.freeze(groups),
  });
}

function parseDesktopConversationNavigationGroup(
  value: unknown,
): DesktopConversationNavigationGroup {
  const record = requireRecord(value, 'Desktop Conversation navigation group must be an object.');
  const kind = record['kind'];
  const conversations = requireArray(
    record['conversations'],
    'Desktop Conversation navigation group conversations must be an array.',
  ).map(parseAgentHomeConversationSummary);
  if (kind === 'project') {
    requireExactKeys(
      record,
      ['kind', 'projectId', 'workspaceId', 'displayName', 'conversations'],
      'Desktop Project Conversation group',
    );
    return Object.freeze({
      kind,
      projectId: requireNonEmptyString(
        record['projectId'],
        'Desktop Project identity is required.',
      ),
      workspaceId: requireNonEmptyString(
        record['workspaceId'],
        'Desktop Workspace identity is required.',
      ),
      displayName: requireNonEmptyString(
        record['displayName'],
        'Desktop Project display name is required.',
      ),
      conversations: Object.freeze(conversations),
    });
  }
  if (kind === 'assistant') {
    requireExactKeys(
      record,
      ['kind', 'assistantSpaceId', 'conversations'],
      'Desktop Assistant Conversation group',
    );
    return Object.freeze({
      kind,
      assistantSpaceId: requireNonEmptyString(
        record['assistantSpaceId'],
        'Desktop Assistant Space identity is required.',
      ),
      conversations: Object.freeze(conversations),
    });
  }
  if (kind === 'character') {
    requireExactKeys(
      record,
      ['kind', 'characterId', 'conversations'],
      'Desktop Character Conversation group',
    );
    return Object.freeze({
      kind,
      characterId: requireNonEmptyString(
        record['characterId'],
        'Desktop Character identity is required.',
      ),
      conversations: Object.freeze(conversations),
    });
  }
  if (kind === 'room') {
    requireExactKeys(
      record,
      ['kind', 'roomId', 'conversations'],
      'Desktop Room Conversation group',
    );
    return Object.freeze({
      kind,
      roomId: requireNonEmptyString(record['roomId'], 'Desktop Room identity is required.'),
      conversations: Object.freeze(conversations),
    });
  }
  throw invalidPayload(`Unknown Desktop Conversation navigation group '${String(kind)}'.`);
}

function assertConversationNavigationProjection(
  actual: DesktopConversationNavigationProjection,
  catalog: DesktopProjectCatalogProjection,
  agentHome: DesktopAgentHomeProjection,
): DesktopConversationNavigationProjection {
  const expected = projectDesktopConversationNavigation(catalog, agentHome);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw invalidPayload(
      'Desktop Conversation navigation projection does not match Project and Agent authorities.',
    );
  }
  return actual;
}

function parseAgentHomeConversationSummary(value: unknown): DesktopAgentHomeConversationSummary {
  return parseCanonicalAgentHomeConversationSummary(value);
}

function parseDesktopAgentHomeNavigationIdentity(
  value: unknown,
): DesktopAgentHomeNavigationIdentity {
  return parseCanonicalAgentHomeNavigationIdentity(value);
}

export function parseDesktopShellProjectionEvent(value: unknown): DesktopShellProjectionEvent {
  const record = requireRecord(value, 'Desktop Shell projection event must be an object.');
  requireVersion(record['schemaVersion']);
  const projection = parseDesktopShellProjection(record['projection']);
  const applicationInstanceId = requireNonEmptyString(
    record['applicationInstanceId'],
    'Desktop Shell event application instance identity is required.',
  );
  const windowId = requireNonEmptyString(
    record['windowId'],
    'Desktop Shell event Window identity is required.',
  );
  if (
    applicationInstanceId !== projection.applicationInstanceId ||
    windowId !== projection.window.windowId
  ) {
    throw invalidPayload('Desktop Shell event identity does not match its projection.');
  }
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    applicationInstanceId,
    windowId,
    rendererEpoch: requireNonNegativeInteger(
      record['rendererEpoch'],
      'Desktop Shell renderer epoch must be a non-negative integer.',
    ),
    sequence: requireNonNegativeInteger(
      record['sequence'],
      'Desktop Shell event sequence must be a non-negative integer.',
    ),
    projection,
  };
}

function parseProjectCatalogItem(value: unknown): DesktopProjectCatalogItem {
  const record = requireRecord(value, 'Desktop Project catalog item must be an object.');
  if (record['profile'] !== 'content') {
    throw invalidPayload('Desktop Project catalog only accepts Content projects.');
  }
  return {
    projectId: requireNonEmptyString(record['projectId'], 'Desktop Project identity is required.'),
    workspaceId: requireNonEmptyString(
      record['workspaceId'],
      'Desktop Workspace identity is required.',
    ),
    profile: 'content',
    displayName: requireNonEmptyString(
      record['displayName'],
      'Desktop Project display name is required.',
    ),
    createdAt: requireNonEmptyString(record['createdAt'], 'Desktop Project createdAt is required.'),
    updatedAt: requireNonEmptyString(record['updatedAt'], 'Desktop Project updatedAt is required.'),
  };
}

function parseProjectTab(value: unknown): DesktopProjectTabProjection {
  const record = requireRecord(value, 'Desktop Project Tab must be an object.');
  return {
    tabId: requireNonEmptyString(record['tabId'], 'Desktop Project Tab identity is required.'),
    projectId: requireNonEmptyString(record['projectId'], 'Desktop Project identity is required.'),
    viewId: requireNonEmptyString(record['viewId'], 'Desktop View identity is required.'),
    viewEpoch: requireNonNegativeInteger(
      record['viewEpoch'],
      'Desktop View epoch must be a non-negative integer.',
    ),
  };
}

function parseActiveTarget(value: unknown): DesktopWindowActiveTarget {
  const record = requireRecord(value, 'Desktop Window active target must be an object.');
  if (record['kind'] === 'home') return { kind: 'home' };
  if (record['kind'] === 'project') {
    return {
      kind: 'project',
      tabId: requireNonEmptyString(
        record['tabId'],
        'Desktop active Project Tab identity is required.',
      ),
    };
  }
  throw invalidPayload('Desktop Window active target is invalid.');
}

function parseDesktopDomainCapabilityProjection(value: unknown): DesktopDomainCapabilityProjection {
  const record = requireRecord(value, 'Desktop domain capability must be an object.');
  const surface = requireDomainSurface(record['surface']);
  const ownerSlice = requireOwnerSlice(record['ownerSlice']);
  if (record['status'] === 'ready') {
    const isReadyCapability =
      (surface === 'agent' && ownerSlice === 'P1.3') ||
      (surface === 'media-library' && ownerSlice === 'P1.4') ||
      (surface === 'canvas' && ownerSlice === 'P1.4') ||
      (surface === 'cut' && ownerSlice === 'P1.5') ||
      (surface === 'preview' && ownerSlice === 'P1.5');
    if (!isReadyCapability) {
      throw invalidPayload(
        `Desktop domain capability '${surface}' cannot be ready in owner slice '${ownerSlice}'.`,
      );
    }
    if (surface === 'agent') return { surface, status: 'ready', ownerSlice: 'P1.3' };
    if (surface === 'media-library') {
      return { surface, status: 'ready', ownerSlice: 'P1.4' };
    }
    if (surface === 'canvas') {
      return { surface, status: 'ready', ownerSlice: 'P1.4' };
    }
    if (surface === 'cut') {
      return { surface, status: 'ready', ownerSlice: 'P1.5' };
    }
    return { surface, status: 'ready', ownerSlice: 'P1.5' };
  }
  if (
    record['status'] !== 'unavailable' ||
    record['diagnosticCode'] !== 'desktop-domain-surface-unavailable'
  ) {
    throw invalidPayload(`Desktop domain capability '${surface}' must be explicitly unavailable.`);
  }
  return {
    surface,
    status: 'unavailable',
    ownerSlice,
    diagnosticCode: 'desktop-domain-surface-unavailable',
  };
}

function requireDomainSurface(value: unknown): DesktopDomainSurface {
  const matched = DESKTOP_DOMAIN_SURFACES.find((surface) => surface === value);
  if (!matched) throw invalidPayload(`Unknown Desktop domain surface '${String(value)}'.`);
  return matched;
}

function requireOwnerSlice(value: unknown): DesktopDomainCapabilityProjection['ownerSlice'] {
  if (value === 'P1.3' || value === 'P1.4' || value === 'P1.5' || value === 'P1.6') {
    return value;
  }
  throw invalidPayload(`Unknown Desktop domain owner slice '${String(value)}'.`);
}

function requireUnavailableProfile(value: unknown): DesktopUnavailableProjectProfile {
  if (value === 'character' || value === 'world') return value;
  throw invalidPayload(`Desktop project profile '${String(value)}' is not requestable here.`);
}

function requireVersion(value: unknown): void {
  if (value !== DESKTOP_SHELL_CONTRACT_VERSION) {
    throw new DesktopShellContractError(
      'unsupported-desktop-shell-version',
      `Unsupported Desktop Shell version '${String(value)}'.`,
    );
  }
}

function requireMatchingRequestId(value: unknown, expectedRequestId: string): string {
  const requestId = requireNonEmptyString(value, 'Desktop Shell response requestId is required.');
  if (requestId !== expectedRequestId) {
    throw new DesktopShellContractError(
      'desktop-shell-request-mismatch',
      `Desktop Shell response '${requestId}' does not match request '${expectedRequestId}'.`,
    );
  }
  return requestId;
}

function requireArray(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) throw invalidPayload(message);
  return value;
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (!isUnknownRecord(value)) throw invalidPayload(message);
  return value;
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw invalidPayload(message);
  return value;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidPayload(message);
  }
  return value;
}

function readOptionalMetadata(record: Readonly<Record<string, unknown>>): {
  readonly metadata?: Readonly<Record<string, unknown>>;
} {
  const metadata = record['metadata'];
  if (metadata === undefined) return {};
  return { metadata: requireRecord(metadata, 'Desktop diagnostic metadata must be an object.') };
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  const expected = new Set(keys);
  const unknown = Object.keys(record).find((key) => !expected.has(key));
  if (unknown) throw invalidPayload(`${label} contains unknown field '${unknown}'.`);
  const missing = keys.find((key) => !(key in record));
  if (missing) throw invalidPayload(`${label} is missing field '${missing}'.`);
}

function invalidPayload(message: string): DesktopShellContractError {
  return new DesktopShellContractError('invalid-desktop-shell-payload', message);
}
