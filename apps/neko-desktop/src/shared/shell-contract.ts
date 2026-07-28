import type { HostDiagnostic } from '@neko/host/ports';

export const DESKTOP_SHELL_CONTRACT_VERSION = 1 as const;

export const DESKTOP_SHELL_CHANNELS = {
  snapshotGet: 'openneko:desktop:shell:snapshot:get',
  projectionEvent: 'openneko:desktop:shell:projection:event',
  projectOpenContent: 'openneko:desktop:project:content:open',
  projectRequestProfile: 'openneko:desktop:project:profile:request',
  homeActivate: 'openneko:desktop:home:activate',
  tabActivate: 'openneko:desktop:tab:activate',
  tabClose: 'openneko:desktop:tab:close',
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
}

export interface DesktopAttentionProjection {
  readonly needsInput: number;
  readonly needsReview: number;
  readonly running: number;
}

export interface DesktopDomainCapabilityProjection {
  readonly surface: DesktopDomainSurface;
  readonly status: 'unavailable';
  readonly ownerSlice: 'P1.3' | 'P1.4' | 'P1.5' | 'P1.6';
  readonly diagnosticCode: 'desktop-domain-surface-unavailable';
}

export interface DesktopShellProjection {
  readonly schemaVersion: typeof DESKTOP_SHELL_CONTRACT_VERSION;
  readonly applicationInstanceId: string;
  readonly endpointEpoch: string;
  readonly projectionRevision: number;
  readonly catalog: DesktopProjectCatalogProjection;
  readonly window: DesktopWindowShellProjection;
  readonly attention: DesktopAttentionProjection;
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
    requestProfile(profile: DesktopUnavailableProjectProfile): Promise<DesktopProfileRequestResult>;
  };
  readonly tabs: {
    activateHome(expectedWindowRevision: number): Promise<DesktopShellProjection>;
    activate(tabId: string, expectedWindowRevision: number): Promise<DesktopShellProjection>;
    close(tabId: string, expectedWindowRevision: number): Promise<DesktopShellProjection>;
  };
}

export class DesktopShellContractError extends Error {
  readonly code:
    | 'invalid-desktop-shell-payload'
    | 'unsupported-desktop-shell-version'
    | 'desktop-shell-request-mismatch'
    | 'desktop-shell-stale-revision';

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
  const attentionRecord = requireRecord(
    record['attention'],
    'Desktop Attention projection is required.',
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
      windowId: requireNonEmptyString(
        windowRecord['windowId'],
        'Desktop Window identity is required.',
      ),
      revision: requireNonNegativeInteger(
        windowRecord['revision'],
        'Desktop Window revision must be a non-negative integer.',
      ),
      activeTarget,
      tabs,
    },
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
    domains: requireArray(
      record['domains'],
      'Desktop domain capability projection must be an array.',
    ).map(parseDomainCapability),
  };
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

function parseDomainCapability(value: unknown): DesktopDomainCapabilityProjection {
  const record = requireRecord(value, 'Desktop domain capability must be an object.');
  const surface = requireDomainSurface(record['surface']);
  const ownerSlice = requireOwnerSlice(record['ownerSlice']);
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
