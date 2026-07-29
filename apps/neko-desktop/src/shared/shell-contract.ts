import type { HostDiagnostic } from '@neko/host/ports';
import {
  parseDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from './workbench-contract';

export const DESKTOP_SHELL_CONTRACT_VERSION = 1 as const;

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
} as const;

export type DesktopProjectProfile = 'content' | 'character' | 'world';
export type DesktopUnavailableProjectProfile = Exclude<DesktopProjectProfile, 'content'>;
export type DesktopDomainSurface =
  | 'agent'
  | 'media-library'
  | 'canvas'
  | 'cut'
  | 'preview'
  | 'generation'
  | 'quality'
  | 'character'
  | 'world'
  | 'tools';

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
  | { readonly kind: 'home' }
  | { readonly kind: 'project'; readonly tabId: string };

export interface DesktopWindowShellProjection {
  readonly windowId: string;
  readonly revision: number;
  readonly activeTarget: DesktopWindowActiveTarget;
  readonly tabs: readonly DesktopProjectTabProjection[];
  readonly workbench: DesktopWorkbenchLayoutProjection;
}

export interface DesktopAttentionProjection {
  readonly needsInput: number;
  readonly needsReview: number;
  readonly running: number;
}

export type DesktopAgentHomeAttentionStatus =
  | 'none'
  | 'needs-input'
  | 'needs-review'
  | 'running';

export type DesktopAgentHomeActivityKind =
  | 'conversation-updated'
  | 'turn-running'
  | 'turn-completed'
  | 'turn-cancelled'
  | 'turn-failed'
  | 'tool-confirmation-required';

export interface DesktopAgentHomeNavigationIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly conversationId: string;
}

export interface DesktopConversationDeleteRequest extends DesktopWindowMutationRequest {
  readonly expectedAgentHomeRevision: number;
  readonly navigation: DesktopAgentHomeNavigationIdentity;
}

export interface DesktopAgentHomeActivitySummary {
  readonly kind: DesktopAgentHomeActivityKind;
  readonly occurredAt: string;
  readonly turnId?: string;
  readonly runId?: string;
  readonly toolCallId?: string;
  readonly generationJob?: {
    readonly jobId: string;
    readonly revision: number;
    readonly phase: string;
  };
}

export interface DesktopAgentHomeConversationSummary {
  readonly navigation: DesktopAgentHomeNavigationIdentity;
  readonly title: string;
  readonly updatedAt: string;
  readonly attention: DesktopAgentHomeAttentionStatus;
  readonly lastActivity: DesktopAgentHomeActivitySummary;
}

export interface DesktopAgentHomeProjection {
  readonly revision: number;
  readonly conversations: readonly DesktopAgentHomeConversationSummary[];
  readonly attention: DesktopAttentionProjection;
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
  | DesktopReadyDomainCapabilityProjection
  | DesktopUnavailableDomainCapabilityProjection;

export interface DesktopShellProjection {
  readonly schemaVersion: typeof DESKTOP_SHELL_CONTRACT_VERSION;
  readonly applicationInstanceId: string;
  readonly endpointEpoch: string;
  readonly projectionRevision: number;
  readonly catalog: DesktopProjectCatalogProjection;
  readonly window: DesktopWindowShellProjection;
  readonly agentHome: DesktopAgentHomeProjection;
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

  constructor(
    code: DesktopShellContractError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'DesktopShellContractError';
    this.code = code;
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
    ...createDesktopWindowMutationRequest(
      requestId,
      expectedEndpointEpoch,
      expectedWindowRevision,
    ),
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
    ...createDesktopWindowMutationRequest(
      requestId,
      expectedEndpointEpoch,
      expectedWindowRevision,
    ),
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

export function parseDesktopWindowMutationRequest(
  value: unknown,
): DesktopWindowMutationRequest {
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
  const record = requireRecord(
    value,
    'Desktop Project remove-recent request must be an object.',
  );
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
  const attentionRecord = requireRecord(
    agentHomeRecord['attention'],
    'Desktop Agent Home Attention projection is required.',
  );
  const projects = requireArray(
    catalogRecord['projects'],
    'Desktop Project catalog items must be an array.',
  ).map(parseProjectCatalogItem);
  const tabs = requireArray(
    windowRecord['tabs'],
    'Desktop Project Tabs must be an array.',
  ).map(parseProjectTab);
  const activeTarget = parseActiveTarget(windowRecord['activeTarget']);
  const workbench = parseDesktopWorkbenchLayout(windowRecord['workbench']);
  const windowId = requireNonEmptyString(
    windowRecord['windowId'],
    'Desktop Window identity is required.',
  );
  if (workbench.windowId !== windowId) {
    throw invalidPayload('Desktop Workbench projection belongs to another Window.');
  }
  if (
    activeTarget.kind === 'project' &&
    !tabs.some((tab) => tab.tabId === activeTarget.tabId)
  ) {
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
    if (
      !activeTab ||
      workbench.main.views.some((view) => view.projectId !== activeTab.projectId)
    ) {
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
    catalog: {
      revision: requireNonNegativeInteger(
        catalogRecord['revision'],
        'Desktop Project catalog revision must be a non-negative integer.',
      ),
      projects,
    },
    window: {
      windowId,
      revision: requireNonNegativeInteger(
        windowRecord['revision'],
        'Desktop Window revision must be a non-negative integer.',
      ),
      activeTarget,
      tabs,
      workbench,
    },
    agentHome: {
      revision: requireNonNegativeInteger(
        agentHomeRecord['revision'],
        'Desktop Agent Home revision must be a non-negative integer.',
      ),
      conversations: requireArray(
        agentHomeRecord['conversations'],
        'Desktop Agent Home conversations must be an array.',
      ).map(parseAgentHomeConversationSummary),
      attention: {
        needsInput: requireNonNegativeInteger(
          attentionRecord['needsInput'],
          'Desktop Attention needsInput count is invalid.',
        ),
        needsReview: requireNonNegativeInteger(
          attentionRecord['needsReview'],
          'Desktop Attention needsReview count is invalid.',
        ),
        running: requireNonNegativeInteger(
          attentionRecord['running'],
          'Desktop Attention running count is invalid.',
        ),
      },
    },
    domains: requireArray(
      record['domains'],
      'Desktop domain capability projection must be an array.',
    ).map(parseDesktopDomainCapabilityProjection),
  };
}

function parseAgentHomeConversationSummary(
  value: unknown,
): DesktopAgentHomeConversationSummary {
  const record = requireRecord(
    value,
    'Desktop Agent Home conversation summary must be an object.',
  );
  const navigation = parseDesktopAgentHomeNavigationIdentity(record['navigation']);
  const lastActivity = requireRecord(
    record['lastActivity'],
    'Desktop Agent Home last activity is required.',
  );
  const attention = record['attention'];
  if (
    attention !== 'none' &&
    attention !== 'needs-input' &&
    attention !== 'needs-review' &&
    attention !== 'running'
  ) {
    throw invalidPayload('Desktop Agent Home attention status is invalid.');
  }
  const kind = lastActivity['kind'];
  if (
    kind !== 'conversation-updated' &&
    kind !== 'turn-running' &&
    kind !== 'turn-completed' &&
    kind !== 'turn-cancelled' &&
    kind !== 'turn-failed' &&
    kind !== 'tool-confirmation-required'
  ) {
    throw invalidPayload('Desktop Agent Home activity kind is invalid.');
  }
  return {
    navigation: {
      ...navigation,
    },
    title: requireNonEmptyString(
      record['title'],
      'Desktop Agent Home conversation title is required.',
    ),
    updatedAt: requireIsoDateString(
      record['updatedAt'],
      'Desktop Agent Home conversation updatedAt is invalid.',
    ),
    attention,
    lastActivity: {
      kind,
      occurredAt: requireIsoDateString(
        lastActivity['occurredAt'],
        'Desktop Agent Home activity occurredAt is invalid.',
      ),
      ...readOptionalIdentity(lastActivity, 'turnId'),
      ...readOptionalIdentity(lastActivity, 'runId'),
      ...readOptionalIdentity(lastActivity, 'toolCallId'),
      ...parseOptionalGenerationJob(lastActivity['generationJob']),
    },
  };
}

function parseDesktopAgentHomeNavigationIdentity(
  value: unknown,
): DesktopAgentHomeNavigationIdentity {
  const navigation = requireRecord(
    value,
    'Desktop Agent Home navigation identity is required.',
  );
  return {
    projectId: requireNonEmptyString(
      navigation['projectId'],
      'Desktop Agent Home Project identity is required.',
    ),
    workspaceId: requireNonEmptyString(
      navigation['workspaceId'],
      'Desktop Agent Home Workspace identity is required.',
    ),
    conversationId: requireNonEmptyString(
      navigation['conversationId'],
      'Desktop Agent Home Conversation identity is required.',
    ),
  };
}

function parseOptionalGenerationJob(
  value: unknown,
): Pick<DesktopAgentHomeActivitySummary, 'generationJob'> | Record<string, never> {
  if (value === undefined) return {};
  const record = requireRecord(
    value,
    'Desktop Agent Home GenerationJob summary must be an object.',
  );
  return {
    generationJob: {
      jobId: requireNonEmptyString(
        record['jobId'],
        'Desktop Agent Home GenerationJob identity is required.',
      ),
      revision: requireNonNegativeInteger(
        record['revision'],
        'Desktop Agent Home GenerationJob revision is invalid.',
      ),
      phase: requireNonEmptyString(
        record['phase'],
        'Desktop Agent Home GenerationJob phase is required.',
      ),
    },
  };
}

function readOptionalIdentity(
  record: Record<string, unknown>,
  key: 'turnId' | 'runId' | 'toolCallId',
): Partial<Record<'turnId' | 'runId' | 'toolCallId', string>> {
  const value = record[key];
  if (value === undefined) return {};
  return { [key]: requireNonEmptyString(value, `Desktop Agent Home ${key} is invalid.`) };
}

function requireIsoDateString(value: unknown, message: string): string {
  const date = requireNonEmptyString(value, message);
  if (Number.isNaN(Date.parse(date))) throw invalidPayload(message);
  return date;
}

export function parseDesktopShellProjectionEvent(
  value: unknown,
): DesktopShellProjectionEvent {
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
    createdAt: requireNonEmptyString(
      record['createdAt'],
      'Desktop Project createdAt is required.',
    ),
    updatedAt: requireNonEmptyString(
      record['updatedAt'],
      'Desktop Project updatedAt is required.',
    ),
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

export function parseDesktopDomainCapabilityProjection(
  value: unknown,
): DesktopDomainCapabilityProjection {
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
  const surfaces: readonly DesktopDomainSurface[] = [
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
  ];
  const matched = surfaces.find((surface) => surface === value);
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

function readOptionalMetadata(
  record: Readonly<Record<string, unknown>>,
): { readonly metadata?: Readonly<Record<string, unknown>> } {
  const metadata = record['metadata'];
  if (metadata === undefined) return {};
  return { metadata: requireRecord(metadata, 'Desktop diagnostic metadata must be an object.') };
}

function invalidPayload(message: string): DesktopShellContractError {
  return new DesktopShellContractError('invalid-desktop-shell-payload', message);
}
