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
  parseDesktopWindowComposition,
  type DesktopWindowCompositionProjection,
} from './desktop-window-composition-contract';
import {
  parseDesktopApplicationSidebarProjection,
  type DesktopApplicationSidebarProjection,
  type DesktopSceneTransitionIntent,
  type DesktopSceneTransitionResult,
} from './desktop-scene-contract';

export const DESKTOP_SHELL_CHANNELS = {
  snapshotGet: 'openneko:desktop:shell:snapshot:get',
  projectionEvent: 'openneko:desktop:shell:projection:event',
  projectOpenContent: 'openneko:desktop:project:content:open',
  projectOpenCatalog: 'openneko:desktop:project:catalog:open',
  projectRemove: 'openneko:desktop:project:remove',
  projectConversationDelete: 'openneko:desktop:project:conversation:delete',
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
  readonly requestId: string;
}

export interface DesktopWindowMutationRequest extends DesktopShellRequest {
  readonly rendererSessionId: string;
}

export interface DesktopProjectOpenRequest extends DesktopWindowMutationRequest {
  readonly projectId: string;
}

export interface DesktopProjectSelectionRequest extends DesktopWindowMutationRequest {
  readonly projectIds: readonly string[];
}

export interface DesktopProjectCatalogItem {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly profile: 'content';
  readonly displayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly unavailable?: {
    readonly fieldNames: readonly string[];
    readonly message: string;
  };
}

export interface DesktopProjectCatalogProjection {
  readonly projects: readonly DesktopProjectCatalogItem[];
}

export interface DesktopProjectTabProjection {
  readonly tabId: string;
  readonly projectId: string;
  readonly viewId: string;
  readonly viewInstanceId: string;
}

export type DesktopWindowActiveTarget =
  { readonly kind: 'home' } | { readonly kind: 'project'; readonly tabId: string };

export interface DesktopWindowShellProjection {
  readonly windowId: string;
  readonly activeTarget: DesktopWindowActiveTarget;
  readonly tabs: readonly DesktopProjectTabProjection[];
  readonly workbench: DesktopWindowCompositionProjection;
  readonly applicationSidebar: DesktopApplicationSidebarProjection;
}

export function resolveActiveDesktopWindowWorkbench(
  window: DesktopWindowShellProjection,
): DesktopWindowCompositionProjection {
  return window.workbench;
}

export function resolveDesktopWindowWorkspaceWorkbench(
  window: DesktopWindowShellProjection,
  workspaceId: string,
): DesktopWindowCompositionProjection {
  const exactWorkspaceId = requireNonEmptyString(
    workspaceId,
    'Desktop Workspace identity is required.',
  );
  const interaction = window.workbench.scene.slots.interaction;
  if (
    window.workbench.scene.context.kind !== 'agent' ||
    window.workbench.scene.context.scope.kind !== 'workspace' ||
    window.workbench.scene.context.scope.workspaceId !== exactWorkspaceId ||
    interaction?.kind !== 'agent' ||
    interaction.scope.kind !== 'workspace' ||
    interaction.scope.workspaceId !== exactWorkspaceId
  ) {
    throw invalidPayload(`Desktop Workspace '${exactWorkspaceId}' is not the current composition.`);
  }
  return window.workbench;
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
  readonly navigations: readonly DesktopAgentHomeNavigationIdentity[];
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
      readonly kind: 'workspace';
      readonly workspaceId: string;
      readonly fieldNames: readonly string[];
      readonly message: string;
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
  readonly recentProjectIds: readonly string[];
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

export interface DesktopStoredWindowInvalidDiagnosticProjection {
  readonly code: 'desktop-stored-window-invalid';
  readonly severity: 'error';
  readonly windowId: string;
  readonly message: string;
}

export interface DesktopStoredStateInvalidDiagnosticProjection {
  readonly code: 'desktop-stored-state-invalid';
  readonly severity: 'error';
  readonly authorityKey: 'desktop.shell' | 'desktop.application-settings';
  readonly rejectionId: number;
  readonly message: string;
}

export interface DesktopShellComponentInvalidDiagnosticProjection {
  readonly code: 'desktop-shell-component-invalid';
  readonly severity: 'error';
  readonly component: 'project-catalog' | 'agent-runtime-settings';
  readonly message: string;
}

export interface DesktopStoredStateMetadataRetainedDiagnosticProjection {
  readonly code: 'desktop-stored-state-metadata-retained';
  readonly severity: 'warning';
  readonly authorityKey: 'desktop.shell' | 'desktop.application-settings';
  readonly fieldNames: readonly string[];
  readonly message: string;
}

interface DesktopCutPresentationResetDiagnosticProjection {
  readonly code: 'desktop-presentation-reset';
  readonly severity: 'warning';
  readonly windowId: string;
  readonly owner: 'cut';
  readonly removedViewIds: readonly string[];
  readonly message: string;
}

interface DesktopSceneResetDiagnosticProjection {
  readonly code: 'desktop-presentation-reset';
  readonly severity: 'warning';
  readonly windowId: string;
  readonly owner: 'character' | 'world' | 'workspace';
  readonly resetSceneId: string;
  readonly message: string;
}

export type DesktopPresentationResetDiagnosticProjection =
  DesktopCutPresentationResetDiagnosticProjection | DesktopSceneResetDiagnosticProjection;

export type DesktopShellStateDiagnosticProjection =
  | DesktopStoredWindowInvalidDiagnosticProjection
  | DesktopStoredStateInvalidDiagnosticProjection
  | DesktopShellComponentInvalidDiagnosticProjection
  | DesktopStoredStateMetadataRetainedDiagnosticProjection
  | DesktopPresentationResetDiagnosticProjection;

export interface DesktopShellProjection {
  readonly applicationInstanceId: string;
  readonly rendererSessionId: string;
  readonly catalog: DesktopProjectCatalogProjection;
  readonly window: DesktopWindowShellProjection;
  readonly agentHome: DesktopAgentHomeProjection;
  readonly conversationNavigation: DesktopConversationNavigationProjection;
  readonly domains: readonly DesktopDomainCapabilityProjection[];
  /** Absent permanently means that no persisted Shell records were rejected. */
  readonly stateDiagnostics?: readonly DesktopShellStateDiagnosticProjection[];
}

export interface DesktopShellResponse {
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
  readonly rendererSessionId: string;
  readonly tabId: string;
}

export interface DesktopWorkbenchMutationRequest extends DesktopWindowMutationRequest {
  readonly workbenchInstanceId: string;
  readonly workbench: DesktopWorkbenchLayoutProjection;
}

export interface DesktopShellProjectionEvent {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly rendererSessionId: string;
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
    remove(projectIds: readonly string[]): Promise<DesktopShellProjection>;
    deleteConversations(projectIds: readonly string[]): Promise<DesktopShellProjection>;
    requestProfile(profile: DesktopUnavailableProjectProfile): Promise<DesktopProfileRequestResult>;
  };
  readonly conversations: {
    delete(
      navigations: readonly DesktopAgentHomeNavigationIdentity[],
    ): Promise<DesktopShellProjection>;
  };
  readonly tabs: {
    activateHome(): Promise<DesktopShellProjection>;
    activate(tabId: string): Promise<DesktopShellProjection>;
    close(tabId: string): Promise<DesktopShellProjection>;
  };
  readonly workbench: {
    update(
      workbenchInstanceId: string,
      workbench: DesktopWorkbenchLayoutProjection,
    ): Promise<DesktopShellProjection>;
  };
  readonly applicationSidebar: {
    update(windowId: string, visible: boolean, width: number): Promise<DesktopShellProjection>;
  };
  readonly scenes: {
    transition(
      windowId: string,
      intent: DesktopSceneTransitionIntent,
      sceneId: string,
    ): Promise<DesktopSceneTransitionResult>;
  };
}

export class DesktopShellContractError extends Error {
  readonly code:
    | 'invalid-desktop-shell-payload'
    | 'desktop-shell-request-mismatch'
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
  recentProjectIds: readonly string[],
): DesktopConversationNavigationProjection {
  const recentProjectIdSet = new Set(recentProjectIds);
  if (recentProjectIds.length !== recentProjectIdSet.size) {
    throw invalidPayload('Desktop recent Project identities must be unique.');
  }
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
  for (const projectId of recentProjectIds) {
    if (!projectGroups.has(projectId)) {
      throw invalidPayload(
        `Desktop recent Project '${projectId}' is not present in the Project catalog.`,
      );
    }
  }
  const projectsByWorkspace = new Map<string, DesktopProjectCatalogItem[]>();
  for (const project of catalog.projects) {
    projectsByWorkspace.set(project.workspaceId, [
      ...(projectsByWorkspace.get(project.workspaceId) ?? []),
      project,
    ]);
  }
  const standaloneGroups = new Map<string, DesktopConversationNavigationGroup>();
  const unavailableWorkspaceGroups = new Map<
    string,
    Extract<DesktopConversationNavigationGroup, { readonly kind: 'workspace' }>
  >();
  for (const conversation of agentHome.conversations) {
    const explicitProjectId = conversation.groupedProjectId;
    if (explicitProjectId !== undefined) {
      const projectGroup = projectGroups.get(explicitProjectId);
      if (!projectGroup) {
        if (conversation.navigation.owner.kind === 'workspace') {
          const workspaceId = conversation.navigation.owner.workspaceId;
          const current = unavailableWorkspaceGroups.get(workspaceId) ?? {
            kind: 'workspace' as const,
            workspaceId,
            fieldNames: ['groupedProjectId'],
            message: `Project '${explicitProjectId}' is not present in the Project catalog.`,
            conversations: [],
          };
          unavailableWorkspaceGroups.set(workspaceId, appendConversation(current, conversation));
        } else {
          const key = standaloneGroupKey(conversation.navigation.owner);
          const current =
            standaloneGroups.get(key) ?? createStandaloneGroup(conversation.navigation.owner);
          standaloneGroups.set(key, appendConversation(current, conversation));
        }
        continue;
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
        const workspaceId = conversation.navigation.owner.workspaceId;
        const current = unavailableWorkspaceGroups.get(workspaceId) ?? {
          kind: 'workspace' as const,
          workspaceId,
          fieldNames: ['workspaceId'],
          message:
            projects.length === 0
              ? `Workspace '${workspaceId}' is not present in the Project catalog.`
              : `Workspace '${workspaceId}' resolves to multiple Project records.`,
          conversations: [],
        };
        unavailableWorkspaceGroups.set(workspaceId, appendConversation(current, conversation));
        continue;
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
    recentProjectIds: Object.freeze([...recentProjectIds]),
    groups: Object.freeze(
      [
        ...[...projectGroups.values()].filter(
          (group) => group.conversations.length > 0 || recentProjectIdSet.has(group.projectId),
        ),
        ...unavailableWorkspaceGroups.values(),
        ...standaloneGroups.values(),
      ].map((group) =>
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
  rendererSessionId: string,
): DesktopTabMutationRequest {
  return {
    ...createDesktopShellRequest(requestId),
    rendererSessionId: requireNonEmptyString(
      rendererSessionId,
      'Desktop renderer session identity is required.',
    ),
    tabId: requireNonEmptyString(tabId, 'Desktop Project Tab identity is required.'),
  };
}

export function createDesktopWindowMutationRequest(
  requestId: string,
  rendererSessionId: string,
): DesktopWindowMutationRequest {
  return {
    ...createDesktopShellRequest(requestId),
    rendererSessionId: requireNonEmptyString(
      rendererSessionId,
      'Desktop renderer session identity is required.',
    ),
  };
}

export function createDesktopWorkbenchMutationRequest(
  requestId: string,
  rendererSessionId: string,
  workbenchInstanceId: string,
  workbench: DesktopWorkbenchLayoutProjection,
): DesktopWorkbenchMutationRequest {
  const request = createDesktopWindowMutationRequest(requestId, rendererSessionId);
  const parsedWorkbench = parseDesktopWorkbenchLayout(workbench);
  return {
    ...request,
    workbenchInstanceId: requireNonEmptyString(
      workbenchInstanceId,
      'Desktop Workbench instance identity is required.',
    ),
    workbench: parsedWorkbench,
  };
}

export function createDesktopProjectOpenRequest(
  requestId: string,
  projectId: string,
  rendererSessionId: string,
): DesktopProjectOpenRequest {
  return {
    ...createDesktopWindowMutationRequest(requestId, rendererSessionId),
    projectId: requireNonEmptyString(projectId, 'Desktop Project identity is required.'),
  };
}

export function createDesktopProjectSelectionRequest(
  requestId: string,
  projectIds: readonly string[],
  rendererSessionId: string,
): DesktopProjectSelectionRequest {
  return {
    ...createDesktopWindowMutationRequest(requestId, rendererSessionId),
    projectIds: requireUniqueProjectIds(projectIds),
  };
}

export function createDesktopConversationDeleteRequest(
  requestId: string,
  navigations: readonly DesktopAgentHomeNavigationIdentity[],
  rendererSessionId: string,
): DesktopConversationDeleteRequest {
  return {
    ...createDesktopWindowMutationRequest(requestId, rendererSessionId),
    navigations: requireUniqueConversationNavigations(navigations),
  };
}

export function parseDesktopShellRequest(value: unknown): DesktopShellRequest {
  const record = requireRecord(value, 'Desktop Shell request must be an object.');
  requireExactKeys(record, ['requestId'], 'Desktop Shell request');
  return createDesktopShellRequest(parseDesktopShellRequestId(record));
}

export function parseDesktopProfileRequest(value: unknown): DesktopProfileRequest {
  const record = requireRecord(value, 'Desktop profile request must be an object.');
  requireExactKeys(record, ['requestId', 'profile'], 'Desktop profile request');
  return {
    ...createDesktopShellRequest(parseDesktopShellRequestId(record)),
    profile: requireUnavailableProfile(record['profile']),
  };
}

export function parseDesktopTabMutationRequest(value: unknown): DesktopTabMutationRequest {
  const record = requireRecord(value, 'Desktop Tab mutation request must be an object.');
  requireExactKeys(
    record,
    ['requestId', 'rendererSessionId', 'tabId'],
    'Desktop Tab mutation request',
  );
  return createDesktopTabMutationRequest(
    parseDesktopShellRequestId(record),
    requireNonEmptyString(record['tabId'], 'Desktop Project Tab identity is required.'),
    requireNonEmptyString(
      record['rendererSessionId'],
      'Desktop renderer session identity is required.',
    ),
  );
}

export function parseDesktopWindowMutationRequest(value: unknown): DesktopWindowMutationRequest {
  const record = requireRecord(value, 'Desktop Window mutation request must be an object.');
  requireExactKeys(record, ['requestId', 'rendererSessionId'], 'Desktop Window mutation request');
  return createDesktopWindowMutationRequest(
    parseDesktopShellRequestId(record),
    requireNonEmptyString(
      record['rendererSessionId'],
      'Desktop renderer session identity is required.',
    ),
  );
}

export function parseDesktopProjectOpenRequest(value: unknown): DesktopProjectOpenRequest {
  const record = requireRecord(value, 'Desktop Project open request must be an object.');
  requireExactKeys(
    record,
    ['requestId', 'projectId', 'rendererSessionId'],
    'Desktop Project open request',
  );
  return createDesktopProjectOpenRequest(
    parseDesktopShellRequestId(record),
    requireNonEmptyString(record['projectId'], 'Desktop Project identity is required.'),
    requireNonEmptyString(
      record['rendererSessionId'],
      'Desktop renderer session identity is required.',
    ),
  );
}

export function parseDesktopProjectSelectionRequest(
  value: unknown,
): DesktopProjectSelectionRequest {
  const record = requireRecord(value, 'Desktop Project selection request must be an object.');
  requireExactKeys(
    record,
    ['requestId', 'projectIds', 'rendererSessionId'],
    'Desktop Project selection request',
  );
  return createDesktopProjectSelectionRequest(
    parseDesktopShellRequestId(record),
    requireUniqueProjectIds(
      requireArray(record['projectIds'], 'Desktop Project identities must be an array.'),
    ),
    requireNonEmptyString(
      record['rendererSessionId'],
      'Desktop renderer session identity is required.',
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
  requireExactKeys(
    record,
    ['requestId', 'navigations', 'rendererSessionId'],
    'Desktop Agent Home conversation delete request',
  );
  return {
    requestId: parseDesktopShellRequestId(record),
    navigations: requireUniqueConversationNavigations(
      requireArray(
        record['navigations'],
        'Desktop Agent Home conversation identities must be an array.',
      ),
    ),
    rendererSessionId: requireNonEmptyString(
      record['rendererSessionId'],
      'Desktop renderer session identity is required.',
    ),
  };
}

export function parseDesktopWorkbenchMutationRequest(
  value: unknown,
): DesktopWorkbenchMutationRequest {
  const record = requireRecord(value, 'Desktop Workbench mutation request must be an object.');
  requireExactKeys(
    record,
    ['requestId', 'rendererSessionId', 'workbenchInstanceId', 'workbench'],
    'Desktop Workbench mutation request',
  );
  return createDesktopWorkbenchMutationRequest(
    parseDesktopShellRequestId(record),
    requireNonEmptyString(
      record['rendererSessionId'],
      'Desktop renderer session identity is required.',
    ),
    requireNonEmptyString(
      record['workbenchInstanceId'],
      'Desktop Workbench instance identity is required.',
    ),
    parseDesktopWorkbenchLayout(record['workbench']),
  );
}

export function parseDesktopShellResponse(
  value: unknown,
  expectedRequestId: string,
): DesktopShellResponse {
  const record = requireRecord(value, 'Desktop Shell response must be an object.');
  requireExactKeys(record, ['requestId', 'projection'], 'Desktop Shell response');
  return parseDesktopShellResponseRecord(record, expectedRequestId);
}

export function parseDesktopOpenContentResult(
  value: unknown,
  expectedRequestId: string,
): DesktopOpenContentResult {
  const record = requireRecord(value, 'Desktop open Content result must be an object.');
  requireExactKeys(record, ['requestId', 'projection', 'status'], 'Desktop open Content result');
  const response = parseDesktopShellResponseRecord(record, expectedRequestId);
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
  requireExactKeys(
    record,
    ['requestId', 'projection', 'status', 'diagnostic'],
    'Desktop profile result',
  );
  const response = parseDesktopShellResponseRecord(record, expectedRequestId);
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
  requireExactKeys(
    record,
    record['stateDiagnostics'] === undefined
      ? [
          'applicationInstanceId',
          'rendererSessionId',
          'catalog',
          'window',
          'agentHome',
          'conversationNavigation',
          'domains',
        ]
      : [
          'applicationInstanceId',
          'rendererSessionId',
          'catalog',
          'window',
          'agentHome',
          'conversationNavigation',
          'domains',
          'stateDiagnostics',
        ],
    'Desktop Shell projection',
  );
  const windowRecord = requireRecord(record['window'], 'Desktop Window projection is required.');
  requireExactKeys(
    windowRecord,
    ['windowId', 'activeTarget', 'tabs', 'workbench', 'applicationSidebar'],
    'Desktop Window projection',
  );
  const agentHomeRecord = requireRecord(
    record['agentHome'],
    'Desktop Agent Home projection is required.',
  );
  const agentHome = parseAgentHomeProjection(agentHomeRecord);
  const conversationNavigation = parseDesktopConversationNavigationProjection(
    record['conversationNavigation'],
  );
  const catalogResult = parseProjectCatalogProjection(record['catalog']);
  const catalog = catalogResult.catalog;
  const projects = catalog.projects;
  const tabs = requireArray(windowRecord['tabs'], 'Desktop Project Tabs must be an array.').map(
    parseProjectTab,
  );
  const activeTarget = parseActiveTarget(windowRecord['activeTarget']);
  const workbench = parseDesktopWindowComposition(windowRecord['workbench']);
  const applicationSidebar = parseDesktopApplicationSidebarProjection(
    windowRecord['applicationSidebar'],
  );
  const windowId = requireNonEmptyString(
    windowRecord['windowId'],
    'Desktop Window identity is required.',
  );
  if (workbench.windowId !== windowId) {
    throw invalidPayload('Desktop Window composition belongs to another Window.');
  }
  if (applicationSidebar.windowId !== windowId) {
    throw invalidPayload('Desktop Application Sidebar belongs to another Window.');
  }
  if (activeTarget.kind === 'project' && !tabs.some((tab) => tab.tabId === activeTarget.tabId)) {
    throw invalidPayload('Desktop active Project Tab is not present in the Window projection.');
  }
  const projectIds = new Set(projects.map((project) => project.projectId));
  if (!catalogResult.diagnostic && tabs.some((tab) => !projectIds.has(tab.projectId))) {
    throw invalidPayload('Desktop Project Tab references an unknown Project.');
  }
  if (
    !catalogResult.diagnostic &&
    workbench.layout.main.views.some((view) => !projectIds.has(view.projectId))
  ) {
    throw invalidPayload('Desktop Workbench View references an unknown Project.');
  }
  if (activeTarget.kind === 'project') {
    const activeTab = tabs.find((tab) => tab.tabId === activeTarget.tabId);
    if (
      !activeTab ||
      (workbench.scene.context.kind === 'agent' &&
        workbench.scene.context.scope.kind === 'workspace' &&
        workbench.layout.main.views.some((view) => view.projectId !== activeTab.projectId))
    ) {
      throw invalidPayload('Desktop Workbench View belongs to another active Project.');
    }
  }
  return {
    applicationInstanceId: requireNonEmptyString(
      record['applicationInstanceId'],
      'Desktop Shell application instance identity is required.',
    ),
    rendererSessionId: requireNonEmptyString(
      record['rendererSessionId'],
      'Desktop Shell renderer session identity is required.',
    ),
    catalog,
    window: {
      windowId,
      activeTarget,
      tabs,
      workbench,
      applicationSidebar,
    },
    agentHome,
    conversationNavigation: catalogResult.diagnostic
      ? conversationNavigation
      : assertConversationNavigationProjection(conversationNavigation, catalog, agentHome),
    domains: requireArray(
      record['domains'],
      'Desktop domain capability projection must be an array.',
    ).map(parseDesktopDomainCapabilityProjection),
    stateDiagnostics: [
      ...(catalogResult.diagnostic ? [catalogResult.diagnostic] : []),
      ...(record['stateDiagnostics'] === undefined
        ? []
        : requireArray(
            record['stateDiagnostics'],
            'Desktop Shell state diagnostics must be an array.',
          ).map(parseDesktopShellStateDiagnosticProjection)),
    ],
  };
}

function parseProjectCatalogProjection(value: unknown): {
  readonly catalog: DesktopProjectCatalogProjection;
  readonly diagnostic?: DesktopShellComponentInvalidDiagnosticProjection;
} {
  try {
    const record = requireRecord(value, 'Desktop Project catalog projection is required.');
    requireExactKeys(record, ['projects'], 'Desktop Project catalog projection');
    return {
      catalog: {
        projects: requireArray(
          record['projects'],
          'Desktop Project catalog items must be an array.',
        ).map(parseProjectCatalogItem),
      },
    };
  } catch (error) {
    return {
      catalog: { projects: [] },
      diagnostic: {
        code: 'desktop-shell-component-invalid',
        severity: 'error',
        component: 'project-catalog',
        message: `Desktop Project catalog projection was rejected without reading or rewriting it: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
}

function parseDesktopShellStateDiagnosticProjection(
  value: unknown,
): DesktopShellStateDiagnosticProjection {
  const record = requireRecord(value, 'Desktop Shell state diagnostic must be an object.');
  if (record['code'] === 'desktop-presentation-reset') {
    if (
      record['owner'] === 'character' ||
      record['owner'] === 'world' ||
      record['owner'] === 'workspace'
    ) {
      requireExactKeys(
        record,
        ['code', 'severity', 'windowId', 'owner', 'resetSceneId', 'message'],
        'Desktop Shell state diagnostic',
      );
      if (record['severity'] !== 'warning') {
        throw invalidPayload('Desktop presentation reset diagnostic identity is invalid.');
      }
      return {
        code: 'desktop-presentation-reset',
        severity: 'warning',
        windowId: requireNonEmptyString(
          record['windowId'],
          'Desktop presentation reset Window identity is required.',
        ),
        owner: record['owner'],
        resetSceneId: requireNonEmptyString(
          record['resetSceneId'],
          'Desktop presentation reset Scene identity is required.',
        ),
        message: requireNonEmptyString(
          record['message'],
          'Desktop presentation reset message is required.',
        ),
      };
    }
    requireExactKeys(
      record,
      ['code', 'severity', 'windowId', 'owner', 'removedViewIds', 'message'],
      'Desktop Shell state diagnostic',
    );
    if (record['severity'] !== 'warning' || record['owner'] !== 'cut') {
      throw invalidPayload('Desktop presentation reset diagnostic identity is invalid.');
    }
    const removedViewIds = requireArray(
      record['removedViewIds'],
      'Desktop presentation reset View identities must be an array.',
    ).map((viewId) =>
      requireNonEmptyString(viewId, 'Desktop presentation reset View identity is required.'),
    );
    if (removedViewIds.length === 0 || new Set(removedViewIds).size !== removedViewIds.length) {
      throw invalidPayload(
        'Desktop presentation reset View identities must be unique and non-empty.',
      );
    }
    return {
      code: 'desktop-presentation-reset',
      severity: 'warning',
      windowId: requireNonEmptyString(
        record['windowId'],
        'Desktop presentation reset Window identity is required.',
      ),
      owner: 'cut',
      removedViewIds,
      message: requireNonEmptyString(
        record['message'],
        'Desktop presentation reset message is required.',
      ),
    };
  }
  if (record['code'] === 'desktop-stored-state-metadata-retained') {
    requireExactKeys(
      record,
      ['code', 'severity', 'authorityKey', 'fieldNames', 'message'],
      'Desktop Shell state diagnostic',
    );
    if (
      record['severity'] !== 'warning' ||
      (record['authorityKey'] !== 'desktop.shell' &&
        record['authorityKey'] !== 'desktop.application-settings')
    ) {
      throw invalidPayload('Desktop stored state metadata diagnostic identity is invalid.');
    }
    const fieldNames = requireArray(
      record['fieldNames'],
      'Desktop Shell metadata diagnostic fields must be an array.',
    ).map((fieldName) =>
      requireNonEmptyString(fieldName, 'Desktop Shell metadata diagnostic field name is required.'),
    );
    if (fieldNames.length === 0 || new Set(fieldNames).size !== fieldNames.length) {
      throw invalidPayload(
        'Desktop Shell metadata diagnostic fields must be unique and non-empty.',
      );
    }
    return {
      code: 'desktop-stored-state-metadata-retained',
      severity: 'warning',
      authorityKey: record['authorityKey'],
      fieldNames,
      message: requireNonEmptyString(
        record['message'],
        'Desktop Shell metadata diagnostic message is required.',
      ),
    };
  }
  if (record['code'] === 'desktop-shell-component-invalid') {
    requireExactKeys(
      record,
      ['code', 'severity', 'component', 'message'],
      'Desktop Shell state diagnostic',
    );
    if (
      record['severity'] !== 'error' ||
      (record['component'] !== 'project-catalog' &&
        record['component'] !== 'agent-runtime-settings')
    ) {
      throw invalidPayload('Desktop Shell component diagnostic identity is invalid.');
    }
    return {
      code: 'desktop-shell-component-invalid',
      severity: 'error',
      component: record['component'],
      message: requireNonEmptyString(
        record['message'],
        'Desktop Shell component diagnostic message is required.',
      ),
    };
  }
  if (record['code'] === 'desktop-stored-state-invalid') {
    requireExactKeys(
      record,
      ['code', 'severity', 'authorityKey', 'rejectionId', 'message'],
      'Desktop Shell state diagnostic',
    );
    if (
      record['severity'] !== 'error' ||
      (record['authorityKey'] !== 'desktop.shell' &&
        record['authorityKey'] !== 'desktop.application-settings')
    ) {
      throw invalidPayload('Desktop Shell state diagnostic identity is invalid.');
    }
    const rejectionId = requireNonNegativeInteger(
      record['rejectionId'],
      'Desktop rejected state identity is invalid.',
    );
    if (rejectionId === 0) {
      throw invalidPayload('Desktop rejected state identity is invalid.');
    }
    return {
      code: 'desktop-stored-state-invalid',
      severity: 'error',
      authorityKey: record['authorityKey'],
      rejectionId,
      message: requireNonEmptyString(
        record['message'],
        'Desktop invalid stored state diagnostic message is required.',
      ),
    };
  }
  requireExactKeys(
    record,
    ['code', 'severity', 'windowId', 'message'],
    'Desktop Shell state diagnostic',
  );
  if (record['code'] !== 'desktop-stored-window-invalid' || record['severity'] !== 'error') {
    throw invalidPayload('Desktop Shell state diagnostic identity is invalid.');
  }
  return {
    code: 'desktop-stored-window-invalid',
    severity: 'error',
    windowId: requireNonEmptyString(
      record['windowId'],
      'Desktop invalid stored Window identity is required.',
    ),
    message: requireNonEmptyString(
      record['message'],
      'Desktop invalid stored Window diagnostic message is required.',
    ),
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
    ['recentProjectIds', 'groups'],
    'Desktop Conversation navigation projection',
  );
  const recentProjectIds = requireArray(
    record['recentProjectIds'],
    'Desktop recent Project identities must be an array.',
  ).map((projectId) =>
    requireNonEmptyString(projectId, 'Desktop recent Project identity is required.'),
  );
  if (new Set(recentProjectIds).size !== recentProjectIds.length) {
    throw invalidPayload('Desktop recent Project identities must be unique.');
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
    recentProjectIds: Object.freeze(recentProjectIds),
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
  if (kind === 'workspace') {
    requireExactKeys(
      record,
      ['kind', 'workspaceId', 'fieldNames', 'message', 'conversations'],
      'Desktop unavailable Workspace Conversation group',
    );
    const fieldNames = requireArray(
      record['fieldNames'],
      'Desktop unavailable Workspace fields must be an array.',
    ).map((fieldName) =>
      requireNonEmptyString(fieldName, 'Desktop unavailable Workspace field is required.'),
    );
    if (fieldNames.length === 0 || new Set(fieldNames).size !== fieldNames.length) {
      throw invalidPayload('Desktop unavailable Workspace fields must be unique and non-empty.');
    }
    return Object.freeze({
      kind,
      workspaceId: requireNonEmptyString(
        record['workspaceId'],
        'Desktop unavailable Workspace identity is required.',
      ),
      fieldNames: Object.freeze(fieldNames),
      message: requireNonEmptyString(
        record['message'],
        'Desktop unavailable Workspace diagnostic is required.',
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
  const expected = projectDesktopConversationNavigation(
    catalog,
    agentHome,
    actual.recentProjectIds,
  );
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
  requireExactKeys(
    record,
    ['applicationInstanceId', 'windowId', 'rendererSessionId', 'sequence', 'projection'],
    'Desktop Shell projection event',
  );
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
    applicationInstanceId,
    windowId,
    rendererSessionId: requireNonEmptyString(
      record['rendererSessionId'],
      'Desktop Shell renderer session identity is required.',
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
  const unavailable =
    record['unavailable'] === undefined
      ? undefined
      : parseDesktopProjectUnavailable(record['unavailable']);
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
    ...(unavailable ? { unavailable } : {}),
  };
}

function parseDesktopProjectUnavailable(
  value: unknown,
): NonNullable<DesktopProjectCatalogItem['unavailable']> {
  const record = requireRecord(value, 'Desktop unavailable Project diagnostic must be an object.');
  requireExactKeys(record, ['fieldNames', 'message'], 'Desktop unavailable Project diagnostic');
  const fieldNames = requireArray(
    record['fieldNames'],
    'Desktop unavailable Project fields must be an array.',
  ).map((fieldName) =>
    requireNonEmptyString(fieldName, 'Desktop unavailable Project field name is required.'),
  );
  if (fieldNames.length === 0 || new Set(fieldNames).size !== fieldNames.length) {
    throw invalidPayload('Desktop unavailable Project fields must be unique and non-empty.');
  }
  return {
    fieldNames,
    message: requireNonEmptyString(
      record['message'],
      'Desktop unavailable Project diagnostic message is required.',
    ),
  };
}

function parseProjectTab(value: unknown): DesktopProjectTabProjection {
  const record = requireRecord(value, 'Desktop Project Tab must be an object.');
  return {
    tabId: requireNonEmptyString(record['tabId'], 'Desktop Project Tab identity is required.'),
    projectId: requireNonEmptyString(record['projectId'], 'Desktop Project identity is required.'),
    viewId: requireNonEmptyString(record['viewId'], 'Desktop View identity is required.'),
    viewInstanceId: requireNonEmptyString(
      record['viewInstanceId'],
      'Desktop View instance identity is required.',
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

function parseDesktopShellRequestId(record: Readonly<Record<string, unknown>>): string {
  return requireNonEmptyString(record['requestId'], 'Desktop Shell requestId is required.');
}

function parseDesktopShellResponseRecord(
  record: Readonly<Record<string, unknown>>,
  expectedRequestId: string,
): DesktopShellResponse {
  return {
    requestId: requireMatchingRequestId(record['requestId'], expectedRequestId),
    projection: parseDesktopShellProjection(record['projection']),
  };
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

function requireUniqueProjectIds(value: readonly unknown[]): readonly string[] {
  if (value.length === 0) {
    throw invalidPayload('At least one Desktop Project identity is required.');
  }
  const projectIds = value.map((projectId) =>
    requireNonEmptyString(projectId, 'Desktop Project identity is required.'),
  );
  if (new Set(projectIds).size !== projectIds.length) {
    throw invalidPayload('Desktop Project identities must be unique.');
  }
  return projectIds;
}

function requireUniqueConversationNavigations(
  value: readonly unknown[],
): readonly DesktopAgentHomeNavigationIdentity[] {
  if (value.length === 0) {
    throw invalidPayload('At least one Desktop Agent Home conversation identity is required.');
  }
  const navigations = value.map(parseDesktopAgentHomeNavigationIdentity);
  const conversationIds = navigations.map((navigation) => navigation.conversationId);
  if (new Set(conversationIds).size !== conversationIds.length) {
    throw invalidPayload('Desktop Agent Home conversation identities must be unique.');
  }
  return navigations;
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
