import {
  WORKSPACE_MEDIA_LIBRARY_SYNC_CONTRACT_VERSION,
  isEntityRepresentationRole,
  isCreativeEntityKind,
  validateContentLocator,
  validateWorkspaceLinkedMediaLibraryName,
  type ContentLocator,
  type CreativeEntityKind,
  type EntityRepresentationRole,
  type WorkspaceMediaLibraryRecoveryPlan,
  type WorkspaceMediaLibraryStatus,
} from '@neko/shared';

export const RESOURCE_BROWSER_CONTRACT_VERSION = 8 as const;

export const RESOURCE_BROWSER_ROUTES = {
  snapshotGet: 'snapshot.get',
  children: 'children',
  thumbnailResolve: 'thumbnail.resolve',
  quickPreviewResolve: 'quick-preview.resolve',
  quickPreviewRelease: 'quick-preview.release',
  recoveryPlan: 'source.recovery.plan',
  recoveryApply: 'source.recovery.apply',
  recoveryCancel: 'source.recovery.cancel',
  search: 'search',
  refresh: 'refresh',
  linkGlobalLibrary: 'source.link-global-library',
  addDirectoryLibrary: 'source.add-directory-library',
  relinkSource: 'source.relink',
  removeSource: 'source.remove',
  preview: 'preview',
  openCut: 'cut.open',
  addToCut: 'cut.add',
  reveal: 'reveal',
  addToCanvas: 'canvas.add',
} as const;

export type ResourceBrowserRoute =
  (typeof RESOURCE_BROWSER_ROUTES)[keyof typeof RESOURCE_BROWSER_ROUTES];
export type ResourceBrowserFacet = 'files' | 'media' | 'materials';
export type ResourceBrowserItemKind =
  | 'directory'
  | 'file'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'character'
  | 'scene'
  | 'object'
  | 'location'
  | 'style';
export type ResourceBrowserCapability =
  'preview' | 'open-cut' | 'add-to-cut' | 'reveal' | 'add-to-canvas' | 'add-to-agent';

export interface ResourceBrowserIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
  readonly endpointEpoch: string;
}

export interface ResourceBrowserEntityRef {
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
}

export interface ResourceBrowserThumbnailDescriptor {
  readonly descriptorId: string;
  readonly revision: string;
  readonly mediaType: string;
}

interface ResourceBrowserItemBase {
  readonly resourceId: string;
  readonly facet: ResourceBrowserFacet;
  readonly kind: ResourceBrowserItemKind;
  readonly label: string;
  readonly description?: string;
  readonly capabilities: readonly ResourceBrowserCapability[];
  readonly thumbnail?: ResourceBrowserThumbnailDescriptor;
  readonly role: 'directory' | 'library-root' | 'content' | 'entity';
  readonly parentResourceId?: string;
  readonly depth: number;
  readonly libraryName?: string;
  readonly libraryStatus?: WorkspaceMediaLibraryStatus;
}

export interface ResourceBrowserContentItem extends ResourceBrowserItemBase {
  readonly facet: 'files' | 'media';
  readonly locator: ContentLocator;
}

export interface ResourceBrowserEntityItem extends ResourceBrowserItemBase {
  readonly facet: 'materials';
  readonly entityRef: ResourceBrowserEntityRef;
  readonly entityStatus: 'confirmed';
  readonly representationAvailability: 'active' | 'unbound';
  readonly representationLocator?: ContentLocator;
  readonly representationBindingId?: string;
  readonly representationRole?: EntityRepresentationRole;
}

export type ResourceBrowserItem = ResourceBrowserContentItem | ResourceBrowserEntityItem;

export interface ResourceBrowserProjection {
  readonly schemaVersion: typeof RESOURCE_BROWSER_CONTRACT_VERSION;
  readonly identity: ResourceBrowserIdentity;
  readonly revision: number;
  readonly facet: ResourceBrowserFacet;
  readonly query: string;
  readonly items: readonly ResourceBrowserItem[];
}

export interface ResourceBrowserRequest {
  readonly schemaVersion: typeof RESOURCE_BROWSER_CONTRACT_VERSION;
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
}

export interface ResourceBrowserSearchRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.search;
  readonly facet: ResourceBrowserFacet;
  readonly query: string;
  readonly limit: number;
}

export interface ResourceBrowserChildrenRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.children;
  readonly facet: 'files' | 'media';
  readonly parentResourceId: string;
  readonly limit: number;
}

export interface ResourceBrowserSnapshotRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.snapshotGet;
}

export interface ResourceBrowserThumbnailRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.thumbnailResolve;
  readonly resourceId: string;
  readonly descriptorId: string;
  readonly revision: string;
}

export interface ResourceBrowserThumbnailResult {
  readonly schemaVersion: typeof RESOURCE_BROWSER_CONTRACT_VERSION;
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly resourceId: string;
  readonly descriptorId: string;
  readonly revision: string;
  readonly dataUrl: string;
}

export type ResourceBrowserQuickPreviewKind = 'image' | 'video' | 'audio';

export interface ResourceBrowserQuickPreviewDescriptor {
  readonly descriptorId: string;
  readonly revision: string;
  readonly contentLocator: ContentLocator;
  readonly url: string;
  readonly contentKind: ResourceBrowserQuickPreviewKind;
  readonly mediaType: string;
  readonly displayName: string;
  readonly byteLength: number;
}

export interface ResourceBrowserQuickPreviewRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.quickPreviewResolve;
  readonly resourceId: string;
}

export interface ResourceBrowserQuickPreviewResult {
  readonly schemaVersion: typeof RESOURCE_BROWSER_CONTRACT_VERSION;
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly resourceId: string;
  readonly previewSessionId: string;
  readonly descriptor: ResourceBrowserQuickPreviewDescriptor;
}

export interface ResourceBrowserQuickPreviewReleaseRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.quickPreviewRelease;
  readonly previewSessionId: string;
}

export interface ResourceBrowserQuickPreviewReleaseResult {
  readonly schemaVersion: typeof RESOURCE_BROWSER_CONTRACT_VERSION;
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly previewSessionId: string;
  readonly status: 'released';
}

export interface ResourceBrowserRecoveryPlanRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.recoveryPlan;
  readonly resourceId: string;
  readonly expectedRevision: number;
  readonly expectedOperationRevision: string;
  readonly candidate: 'existing-global' | 'select-directory';
}

export type ResourceBrowserRecoveryPlanResult =
  | {
      readonly schemaVersion: typeof RESOURCE_BROWSER_CONTRACT_VERSION;
      readonly requestId: string;
      readonly identity: ResourceBrowserIdentity;
      readonly resourceId: string;
      readonly status: 'planned';
      readonly plan: WorkspaceMediaLibraryRecoveryPlan;
    }
  | {
      readonly schemaVersion: typeof RESOURCE_BROWSER_CONTRACT_VERSION;
      readonly requestId: string;
      readonly identity: ResourceBrowserIdentity;
      readonly resourceId: string;
      readonly status: 'cancelled';
    };

export interface ResourceBrowserRecoveryApplyRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.recoveryApply;
  readonly planId: string;
  readonly expectedRevision: number;
  readonly expectedOperationRevision: string;
}

export interface ResourceBrowserRecoveryCancelRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.recoveryCancel;
  readonly planId: string;
}

export interface ResourceBrowserRecoveryCancelResult {
  readonly schemaVersion: typeof RESOURCE_BROWSER_CONTRACT_VERSION;
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly planId: string;
  readonly status: 'cancelled';
}

export interface ResourceBrowserIntentRequest extends ResourceBrowserRequest {
  readonly route:
    | typeof RESOURCE_BROWSER_ROUTES.refresh
    | typeof RESOURCE_BROWSER_ROUTES.linkGlobalLibrary
    | typeof RESOURCE_BROWSER_ROUTES.addDirectoryLibrary
    | typeof RESOURCE_BROWSER_ROUTES.relinkSource
    | typeof RESOURCE_BROWSER_ROUTES.removeSource
    | typeof RESOURCE_BROWSER_ROUTES.preview
    | typeof RESOURCE_BROWSER_ROUTES.openCut
    | typeof RESOURCE_BROWSER_ROUTES.addToCut
    | typeof RESOURCE_BROWSER_ROUTES.reveal
    | typeof RESOURCE_BROWSER_ROUTES.addToCanvas;
  readonly resourceId?: string;
  readonly expectedRevision?: number;
  readonly targetPreview?: {
    readonly viewId: string;
    readonly presentation: 'temporary' | 'side';
    readonly expectedWorkbenchRevision: number;
  };
  readonly targetCut?: {
    readonly viewId: string;
    readonly viewEpoch: number;
    readonly documentId: string;
    readonly sessionId: string;
    readonly expectedRevision: number;
  };
  readonly targetCanvas?: {
    readonly documentId: string;
    readonly sessionId: string;
    readonly expectedRevision: number;
  };
}

export interface ResourceBrowserProjectionEvent {
  readonly schemaVersion: typeof RESOURCE_BROWSER_CONTRACT_VERSION;
  readonly sequence: number;
  readonly projection: ResourceBrowserProjection;
}

export interface ResourceBrowserHostRuntime {
  readonly identity: ResourceBrowserIdentity;
  getSnapshot(): Promise<ResourceBrowserProjection>;
  resolveThumbnail(
    request: ResourceBrowserThumbnailRequest,
  ): Promise<ResourceBrowserThumbnailResult>;
  resolveQuickPreview(
    request: ResourceBrowserQuickPreviewRequest,
  ): Promise<ResourceBrowserQuickPreviewResult>;
  releaseQuickPreview(
    request: ResourceBrowserQuickPreviewReleaseRequest,
  ): Promise<ResourceBrowserQuickPreviewReleaseResult>;
  planRecovery(
    request: ResourceBrowserRecoveryPlanRequest,
  ): Promise<ResourceBrowserRecoveryPlanResult>;
  applyRecovery(request: ResourceBrowserRecoveryApplyRequest): Promise<ResourceBrowserProjection>;
  cancelRecovery(
    request: ResourceBrowserRecoveryCancelRequest,
  ): Promise<ResourceBrowserRecoveryCancelResult>;
  subscribe(listener: (event: ResourceBrowserProjectionEvent) => void): () => void;
  children(request: ResourceBrowserChildrenRequest): Promise<ResourceBrowserProjection>;
  search(request: ResourceBrowserSearchRequest): Promise<ResourceBrowserProjection>;
  execute(request: ResourceBrowserIntentRequest): Promise<ResourceBrowserProjection>;
}

export class ResourceBrowserContractError extends Error {
  readonly code:
    | 'invalid-resource-browser-payload'
    | 'unsupported-resource-browser-version'
    | 'resource-browser-stale-identity';

  constructor(code: ResourceBrowserContractError['code'], message: string) {
    super(message);
    this.name = 'ResourceBrowserContractError';
    this.code = code;
  }
}

export function createResourceBrowserSearchRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly facet: ResourceBrowserFacet;
  readonly query: string;
  readonly limit?: number;
}): ResourceBrowserSearchRequest {
  return parseResourceBrowserSearchRequest({
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.search,
    facet: input.facet,
    query: input.query,
    limit: input.limit ?? 100,
  });
}

export function createResourceBrowserChildrenRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly facet: 'files' | 'media';
  readonly parentResourceId: string;
  readonly limit?: number;
}): ResourceBrowserChildrenRequest {
  return parseResourceBrowserChildrenRequest({
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.children,
    facet: input.facet,
    parentResourceId: input.parentResourceId,
    limit: input.limit ?? 100,
  });
}

export function createResourceBrowserSnapshotRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
}): ResourceBrowserSnapshotRequest {
  return parseResourceBrowserSnapshotRequest({
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.snapshotGet,
  });
}

export function createResourceBrowserThumbnailRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly resourceId: string;
  readonly descriptor: ResourceBrowserThumbnailDescriptor;
}): ResourceBrowserThumbnailRequest {
  return parseResourceBrowserThumbnailRequest({
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.thumbnailResolve,
    resourceId: input.resourceId,
    descriptorId: input.descriptor.descriptorId,
    revision: input.descriptor.revision,
  });
}

export function createResourceBrowserQuickPreviewRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly resourceId: string;
}): ResourceBrowserQuickPreviewRequest {
  return parseResourceBrowserQuickPreviewRequest({
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.quickPreviewResolve,
    resourceId: input.resourceId,
  });
}

export function createResourceBrowserQuickPreviewReleaseRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly previewSessionId: string;
}): ResourceBrowserQuickPreviewReleaseRequest {
  return parseResourceBrowserQuickPreviewReleaseRequest({
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.quickPreviewRelease,
    previewSessionId: input.previewSessionId,
  });
}

export function createResourceBrowserRecoveryPlanRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly resourceId: string;
  readonly expectedRevision: number;
  readonly expectedOperationRevision: string;
  readonly candidate: ResourceBrowserRecoveryPlanRequest['candidate'];
}): ResourceBrowserRecoveryPlanRequest {
  return parseResourceBrowserRecoveryPlanRequest({
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.recoveryPlan,
    resourceId: input.resourceId,
    expectedRevision: input.expectedRevision,
    expectedOperationRevision: input.expectedOperationRevision,
    candidate: input.candidate,
  });
}

export function createResourceBrowserRecoveryApplyRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly planId: string;
  readonly expectedRevision: number;
  readonly expectedOperationRevision: string;
}): ResourceBrowserRecoveryApplyRequest {
  return parseResourceBrowserRecoveryApplyRequest({
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.recoveryApply,
    planId: input.planId,
    expectedRevision: input.expectedRevision,
    expectedOperationRevision: input.expectedOperationRevision,
  });
}

export function createResourceBrowserRecoveryCancelRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly planId: string;
}): ResourceBrowserRecoveryCancelRequest {
  return parseResourceBrowserRecoveryCancelRequest({
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.recoveryCancel,
    planId: input.planId,
  });
}

export function parseResourceBrowserSnapshotRequest(
  value: unknown,
): ResourceBrowserSnapshotRequest {
  const record = requireRecord(value, 'Resource Browser snapshot request must be an object.');
  requireVersion(record['schemaVersion']);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.snapshotGet) {
    throw invalidPayload('Resource Browser snapshot route is invalid.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.snapshotGet,
  };
}

export function parseResourceBrowserThumbnailRequest(
  value: unknown,
): ResourceBrowserThumbnailRequest {
  const record = requireRecord(value, 'Resource Browser thumbnail request must be an object.');
  requireVersion(record['schemaVersion']);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.thumbnailResolve) {
    throw invalidPayload('Resource Browser thumbnail route is invalid.');
  }
  const descriptorId = requireOpaqueIdentity(
    record['descriptorId'],
    'Resource Browser thumbnail descriptor identity is required.',
  );
  assertNoPathLikeValue(descriptorId, 'Resource Browser thumbnail descriptor');
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.thumbnailResolve,
    resourceId: requireOpaqueIdentity(
      record['resourceId'],
      'Resource Browser thumbnail resource identity is required.',
    ),
    descriptorId,
    revision: requireOpaqueIdentity(
      record['revision'],
      'Resource Browser thumbnail revision is required.',
    ),
  };
}

export function parseResourceBrowserThumbnailResult(
  value: unknown,
): ResourceBrowserThumbnailResult {
  const record = requireRecord(value, 'Resource Browser thumbnail result must be an object.');
  requireVersion(record['schemaVersion']);
  const dataUrl = requireNonEmptyString(
    record['dataUrl'],
    'Resource Browser thumbnail data URL is required.',
  );
  if (!/^data:image\/(?:avif|gif|jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/u.test(dataUrl)) {
    throw invalidPayload('Resource Browser thumbnail result must contain an image data URL.');
  }
  if (dataUrl.length > 4 * 1024 * 1024) {
    throw invalidPayload('Resource Browser thumbnail result exceeds the 4 MiB transport limit.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    resourceId: requireOpaqueIdentity(
      record['resourceId'],
      'Resource Browser thumbnail resource identity is required.',
    ),
    descriptorId: requireOpaqueIdentity(
      record['descriptorId'],
      'Resource Browser thumbnail descriptor identity is required.',
    ),
    revision: requireOpaqueIdentity(
      record['revision'],
      'Resource Browser thumbnail revision is required.',
    ),
    dataUrl,
  };
}

export function parseResourceBrowserQuickPreviewRequest(
  value: unknown,
): ResourceBrowserQuickPreviewRequest {
  const record = requireRecord(value, 'Resource Browser quick preview request must be an object.');
  requireVersion(record['schemaVersion']);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.quickPreviewResolve) {
    throw invalidPayload('Resource Browser quick preview route is invalid.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.quickPreviewResolve,
    resourceId: requireOpaqueIdentity(
      record['resourceId'],
      'Resource Browser quick preview resource identity is required.',
    ),
  };
}

export function parseResourceBrowserQuickPreviewReleaseRequest(
  value: unknown,
): ResourceBrowserQuickPreviewReleaseRequest {
  const record = requireRecord(
    value,
    'Resource Browser quick preview release request must be an object.',
  );
  requireVersion(record['schemaVersion']);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.quickPreviewRelease) {
    throw invalidPayload('Resource Browser quick preview release route is invalid.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.quickPreviewRelease,
    previewSessionId: requireOpaqueIdentity(
      record['previewSessionId'],
      'Resource Browser quick preview session identity is required.',
    ),
  };
}

export function parseResourceBrowserQuickPreviewResult(
  value: unknown,
): ResourceBrowserQuickPreviewResult {
  const record = requireRecord(value, 'Resource Browser quick preview result must be an object.');
  requireVersion(record['schemaVersion']);
  const descriptor = requireRecord(
    record['descriptor'],
    'Resource Browser quick preview descriptor is required.',
  );
  const contentKind = descriptor['contentKind'];
  if (contentKind !== 'image' && contentKind !== 'video' && contentKind !== 'audio') {
    throw invalidPayload('Resource Browser quick preview kind is invalid.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    resourceId: requireOpaqueIdentity(
      record['resourceId'],
      'Resource Browser quick preview resource identity is required.',
    ),
    previewSessionId: requireOpaqueIdentity(
      record['previewSessionId'],
      'Resource Browser quick preview session identity is required.',
    ),
    descriptor: {
      descriptorId: requireOpaqueIdentity(
        descriptor['descriptorId'],
        'Resource Browser quick preview descriptor identity is required.',
      ),
      revision: requireOpaqueIdentity(
        descriptor['revision'],
        'Resource Browser quick preview revision is required.',
      ),
      contentLocator: requireContentLocator(descriptor['contentLocator'], 'contentLocator'),
      url: requireLoopbackHttpUrl(descriptor['url']),
      contentKind,
      mediaType: requireNonEmptyString(
        descriptor['mediaType'],
        'Resource Browser quick preview media type is required.',
      ),
      displayName: requireNonEmptyString(
        descriptor['displayName'],
        'Resource Browser quick preview display name is required.',
      ),
      byteLength: requireNonNegativeInteger(
        descriptor['byteLength'],
        'Resource Browser quick preview byte length must be a non-negative integer.',
      ),
    },
  };
}

function requireLoopbackHttpUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw invalidPayload('Resource Browser quick preview URL is required.');
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.port.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new Error('not loopback HTTP');
    }
    return value;
  } catch {
    throw invalidPayload('Resource Browser quick preview URL must use authorized loopback HTTP.');
  }
}

export function parseResourceBrowserQuickPreviewReleaseResult(
  value: unknown,
): ResourceBrowserQuickPreviewReleaseResult {
  const record = requireRecord(
    value,
    'Resource Browser quick preview release result must be an object.',
  );
  requireVersion(record['schemaVersion']);
  if (record['status'] !== 'released') {
    throw invalidPayload('Resource Browser quick preview release status is invalid.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    previewSessionId: requireOpaqueIdentity(
      record['previewSessionId'],
      'Resource Browser quick preview session identity is required.',
    ),
    status: 'released',
  };
}

export function parseResourceBrowserRecoveryPlanRequest(
  value: unknown,
): ResourceBrowserRecoveryPlanRequest {
  const record = requireRecord(value, 'Resource Browser recovery plan request must be an object.');
  requireOnlyKeys(record, [
    'schemaVersion',
    'requestId',
    'identity',
    'route',
    'resourceId',
    'expectedRevision',
    'expectedOperationRevision',
    'candidate',
  ]);
  requireVersion(record['schemaVersion']);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.recoveryPlan) {
    throw invalidPayload('Resource Browser recovery plan route is invalid.');
  }
  const candidate = record['candidate'];
  if (candidate !== 'existing-global' && candidate !== 'select-directory') {
    throw invalidPayload('Resource Browser recovery candidate choice is invalid.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.recoveryPlan,
    resourceId: requireOpaqueIdentity(
      record['resourceId'],
      'Resource Browser recovery resource identity is required.',
    ),
    expectedRevision: requireNonNegativeInteger(
      record['expectedRevision'],
      'Resource Browser recovery projection revision is invalid.',
    ),
    expectedOperationRevision: requireOpaqueIdentity(
      record['expectedOperationRevision'],
      'Resource Browser recovery operation revision is required.',
    ),
    candidate,
  };
}

export function parseResourceBrowserRecoveryPlanResult(
  value: unknown,
): ResourceBrowserRecoveryPlanResult {
  const record = requireRecord(value, 'Resource Browser recovery plan result must be an object.');
  requireOnlyKeys(record, [
    'schemaVersion',
    'requestId',
    'identity',
    'resourceId',
    'status',
    'plan',
  ]);
  requireVersion(record['schemaVersion']);
  const status = record['status'];
  const base = {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    resourceId: requireOpaqueIdentity(
      record['resourceId'],
      'Resource Browser recovery resource identity is required.',
    ),
  };
  if (status === 'cancelled') return { ...base, status };
  if (status !== 'planned') {
    throw invalidPayload('Resource Browser recovery plan status is invalid.');
  }
  return {
    ...base,
    status,
    plan: parseWorkspaceMediaLibraryRecoveryPlan(record['plan']),
  };
}

export function parseResourceBrowserRecoveryApplyRequest(
  value: unknown,
): ResourceBrowserRecoveryApplyRequest {
  const record = requireRecord(value, 'Resource Browser recovery apply request must be an object.');
  requireOnlyKeys(record, [
    'schemaVersion',
    'requestId',
    'identity',
    'route',
    'planId',
    'expectedRevision',
    'expectedOperationRevision',
  ]);
  requireVersion(record['schemaVersion']);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.recoveryApply) {
    throw invalidPayload('Resource Browser recovery apply route is invalid.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.recoveryApply,
    planId: requireOpaqueIdentity(
      record['planId'],
      'Resource Browser recovery plan identity is required.',
    ),
    expectedRevision: requireNonNegativeInteger(
      record['expectedRevision'],
      'Resource Browser recovery projection revision is invalid.',
    ),
    expectedOperationRevision: requireOpaqueIdentity(
      record['expectedOperationRevision'],
      'Resource Browser recovery operation revision is required.',
    ),
  };
}

export function parseResourceBrowserRecoveryCancelRequest(
  value: unknown,
): ResourceBrowserRecoveryCancelRequest {
  const record = requireRecord(
    value,
    'Resource Browser recovery cancel request must be an object.',
  );
  requireOnlyKeys(record, ['schemaVersion', 'requestId', 'identity', 'route', 'planId']);
  requireVersion(record['schemaVersion']);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.recoveryCancel) {
    throw invalidPayload('Resource Browser recovery cancel route is invalid.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.recoveryCancel,
    planId: requireOpaqueIdentity(
      record['planId'],
      'Resource Browser recovery plan identity is required.',
    ),
  };
}

export function parseResourceBrowserRecoveryCancelResult(
  value: unknown,
): ResourceBrowserRecoveryCancelResult {
  const record = requireRecord(value, 'Resource Browser recovery cancel result must be an object.');
  requireOnlyKeys(record, ['schemaVersion', 'requestId', 'identity', 'planId', 'status']);
  requireVersion(record['schemaVersion']);
  if (record['status'] !== 'cancelled') {
    throw invalidPayload('Resource Browser recovery cancel status is invalid.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    planId: requireOpaqueIdentity(
      record['planId'],
      'Resource Browser recovery plan identity is required.',
    ),
    status: 'cancelled',
  };
}

export function parseResourceBrowserSearchRequest(value: unknown): ResourceBrowserSearchRequest {
  const record = requireRecord(value, 'Resource Browser search request must be an object.');
  requireVersion(record['schemaVersion']);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.search) {
    throw invalidPayload('Resource Browser search route is invalid.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.search,
    facet: requireFacet(record['facet']),
    query: requireString(record['query'], 'Resource Browser query is invalid.').trim(),
    limit: requireBoundedInteger(
      record['limit'],
      1,
      200,
      'Resource Browser search limit must be between 1 and 200.',
    ),
  };
}

export function parseResourceBrowserChildrenRequest(
  value: unknown,
): ResourceBrowserChildrenRequest {
  const record = requireRecord(value, 'Resource Browser children request must be an object.');
  requireVersion(record['schemaVersion']);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.children) {
    throw invalidPayload('Resource Browser children route is invalid.');
  }
  const facet = requireFacet(record['facet']);
  if (facet !== 'files' && facet !== 'media') {
    throw invalidPayload('Resource Browser children facet must be Directory or Media.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.children,
    facet,
    parentResourceId: requireOpaqueIdentity(
      record['parentResourceId'],
      'Resource Browser parent identity is required.',
    ),
    limit: requireBoundedInteger(
      record['limit'],
      1,
      200,
      'Resource Browser children limit must be between 1 and 200.',
    ),
  };
}

export function parseResourceBrowserIntentRequest(value: unknown): ResourceBrowserIntentRequest {
  const record = requireRecord(value, 'Resource Browser intent request must be an object.');
  requireVersion(record['schemaVersion']);
  const route = record['route'];
  if (
    route !== RESOURCE_BROWSER_ROUTES.refresh &&
    route !== RESOURCE_BROWSER_ROUTES.linkGlobalLibrary &&
    route !== RESOURCE_BROWSER_ROUTES.addDirectoryLibrary &&
    route !== RESOURCE_BROWSER_ROUTES.relinkSource &&
    route !== RESOURCE_BROWSER_ROUTES.removeSource &&
    route !== RESOURCE_BROWSER_ROUTES.preview &&
    route !== RESOURCE_BROWSER_ROUTES.openCut &&
    route !== RESOURCE_BROWSER_ROUTES.addToCut &&
    route !== RESOURCE_BROWSER_ROUTES.reveal &&
    route !== RESOURCE_BROWSER_ROUTES.addToCanvas
  ) {
    throw invalidPayload('Resource Browser intent route is invalid.');
  }
  const request = {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route,
  } as const;
  if (route === RESOURCE_BROWSER_ROUTES.refresh) {
    return request;
  }
  const expectedRevision =
    route === RESOURCE_BROWSER_ROUTES.linkGlobalLibrary ||
    route === RESOURCE_BROWSER_ROUTES.addDirectoryLibrary ||
    route === RESOURCE_BROWSER_ROUTES.relinkSource ||
    route === RESOURCE_BROWSER_ROUTES.removeSource
      ? requireNonNegativeInteger(
          record['expectedRevision'],
          'Resource Browser source mutation revision must be a non-negative integer.',
        )
      : undefined;
  if (
    route === RESOURCE_BROWSER_ROUTES.linkGlobalLibrary ||
    route === RESOURCE_BROWSER_ROUTES.addDirectoryLibrary
  ) {
    return { ...request, expectedRevision };
  }
  const resourceId = requireOpaqueIdentity(
    record['resourceId'],
    'Resource Browser item identity is required.',
  );
  if (
    route === RESOURCE_BROWSER_ROUTES.relinkSource ||
    route === RESOURCE_BROWSER_ROUTES.removeSource
  ) {
    return { ...request, resourceId, expectedRevision };
  }
  if (route === RESOURCE_BROWSER_ROUTES.preview) {
    const target = requireRecord(
      record['targetPreview'],
      'Resource Browser Preview target is required.',
    );
    const presentation = target['presentation'];
    if (presentation !== 'temporary' && presentation !== 'side') {
      throw invalidPayload('Resource Browser Preview presentation is invalid.');
    }
    return {
      ...request,
      resourceId,
      targetPreview: {
        viewId: requireOpaqueIdentity(
          target['viewId'],
          'Resource Browser target Preview View identity is required.',
        ),
        presentation,
        expectedWorkbenchRevision: requireNonNegativeInteger(
          target['expectedWorkbenchRevision'],
          'Resource Browser target Preview workbench revision must be a non-negative integer.',
        ),
      },
    };
  }
  if (route === RESOURCE_BROWSER_ROUTES.addToCut) {
    const target = requireRecord(
      record['targetCut'],
      'Resource Browser add-to-Cut target is required.',
    );
    return {
      ...request,
      resourceId,
      targetCut: {
        viewId: requireOpaqueIdentity(
          target['viewId'],
          'Resource Browser target Cut View identity is required.',
        ),
        viewEpoch: requireNonNegativeInteger(
          target['viewEpoch'],
          'Resource Browser target Cut View epoch must be a non-negative integer.',
        ),
        documentId: requireOpaqueIdentity(
          target['documentId'],
          'Resource Browser target Cut document identity is required.',
        ),
        sessionId: requireOpaqueIdentity(
          target['sessionId'],
          'Resource Browser target Cut session identity is required.',
        ),
        expectedRevision: requireNonNegativeInteger(
          target['expectedRevision'],
          'Resource Browser target Cut revision must be a non-negative integer.',
        ),
      },
    };
  }
  if (route !== RESOURCE_BROWSER_ROUTES.addToCanvas) {
    return { ...request, resourceId };
  }
  const target = requireRecord(
    record['targetCanvas'],
    'Resource Browser add-to-Canvas target is required.',
  );
  return {
    ...request,
    resourceId,
    targetCanvas: {
      documentId: requireOpaqueIdentity(
        target['documentId'],
        'Resource Browser target Canvas document identity is required.',
      ),
      sessionId: requireOpaqueIdentity(
        target['sessionId'],
        'Resource Browser target Canvas session identity is required.',
      ),
      expectedRevision: requireNonNegativeInteger(
        target['expectedRevision'],
        'Resource Browser target Canvas revision must be a non-negative integer.',
      ),
    },
  };
}

export function parseResourceBrowserProjection(value: unknown): ResourceBrowserProjection {
  const record = requireRecord(value, 'Resource Browser projection must be an object.');
  requireVersion(record['schemaVersion']);
  const facet = requireFacet(record['facet']);
  const items = requireArray(
    record['items'],
    'Resource Browser projection items must be an array.',
  ).map(parseResourceBrowserItem);
  if (items.some((item) => item.facet !== facet)) {
    throw invalidPayload('Resource Browser item facet does not match the active facet.');
  }
  const resourceIds = new Set(items.map((item) => item.resourceId));
  if (resourceIds.size !== items.length) {
    throw invalidPayload('Resource Browser item identities must be unique.');
  }
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    identity: parseResourceBrowserIdentity(record['identity']),
    revision: requireNonNegativeInteger(
      record['revision'],
      'Resource Browser revision must be a non-negative integer.',
    ),
    facet,
    query: requireString(record['query'], 'Resource Browser query is invalid.'),
    items,
  };
}

export function parseResourceBrowserProjectionEvent(
  value: unknown,
): ResourceBrowserProjectionEvent {
  const record = requireRecord(value, 'Resource Browser event must be an object.');
  requireVersion(record['schemaVersion']);
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    sequence: requirePositiveInteger(
      record['sequence'],
      'Resource Browser event sequence must be a positive integer.',
    ),
    projection: parseResourceBrowserProjection(record['projection']),
  };
}

export function assertResourceBrowserIdentity(
  expected: ResourceBrowserIdentity,
  actual: ResourceBrowserIdentity,
): void {
  const matches =
    expected.projectId === actual.projectId &&
    expected.workspaceId === actual.workspaceId &&
    expected.windowId === actual.windowId &&
    expected.viewId === actual.viewId &&
    expected.viewEpoch === actual.viewEpoch &&
    expected.endpointEpoch === actual.endpointEpoch;
  if (!matches) {
    throw new ResourceBrowserContractError(
      'resource-browser-stale-identity',
      'Resource Browser request identity is stale or belongs to another owner.',
    );
  }
}

function parseResourceBrowserIdentity(value: unknown): ResourceBrowserIdentity {
  const record = requireRecord(value, 'Resource Browser owner identity is required.');
  return {
    projectId: requireOpaqueIdentity(
      record['projectId'],
      'Resource Browser Project identity is required.',
    ),
    workspaceId: requireOpaqueIdentity(
      record['workspaceId'],
      'Resource Browser Workspace identity is required.',
    ),
    windowId: requireOpaqueIdentity(
      record['windowId'],
      'Resource Browser Window identity is required.',
    ),
    viewId: requireOpaqueIdentity(record['viewId'], 'Resource Browser View identity is required.'),
    viewEpoch: requireNonNegativeInteger(
      record['viewEpoch'],
      'Resource Browser View epoch must be a non-negative integer.',
    ),
    endpointEpoch: requireOpaqueIdentity(
      record['endpointEpoch'],
      'Resource Browser endpoint epoch is required.',
    ),
  };
}

function parseResourceBrowserItem(value: unknown): ResourceBrowserItem {
  const record = requireRecord(value, 'Resource Browser item must be an object.');
  const facet = requireFacet(record['facet']);
  const base = {
    resourceId: requireOpaqueIdentity(
      record['resourceId'],
      'Resource Browser item identity is required.',
    ),
    kind: requireItemKind(record['kind']),
    label: requireNonEmptyString(record['label'], 'Resource Browser item label is required.'),
    ...readOptionalDescription(record['description']),
    capabilities: requireArray(
      record['capabilities'],
      'Resource Browser item capabilities must be an array.',
    ).map(requireCapability),
    ...readOptionalThumbnail(record['thumbnail']),
    role: requireItemRole(record['role']),
    depth: requireNonNegativeInteger(
      record['depth'],
      'Resource Browser item depth must be a non-negative integer.',
    ),
    ...readOptionalOpaqueIdentity(record['parentResourceId'], 'parentResourceId'),
    ...readOptionalLibraryName(record['libraryName']),
    ...readOptionalLibraryStatus(record['libraryStatus']),
  };
  if (facet === 'materials') {
    if (base.libraryStatus) {
      throw invalidPayload('Resource Browser Entity must not contain Media Library status.');
    }
    const entityRef = parseResourceBrowserEntityRef(record['entityRef']);
    if (base.kind !== entityRef.entityKind) {
      throw invalidPayload('Resource Browser Entity kind does not match its Entity identity.');
    }
    if (base.role !== 'entity') {
      throw invalidPayload('Resource Browser Entity item role is invalid.');
    }
    const representationAvailability = requireRepresentationAvailability(
      record['representationAvailability'],
    );
    const representation = readEntityRepresentation(
      representationAvailability,
      record['representationLocator'],
      record['representationBindingId'],
      record['representationRole'],
    );
    return {
      ...base,
      facet,
      entityRef,
      entityStatus: requireConfirmedEntityStatus(record['entityStatus']),
      representationAvailability,
      ...representation,
    };
  }
  if (base.role === 'entity') {
    throw invalidPayload('Resource Browser content item role is invalid.');
  }
  if (base.libraryStatus && base.role !== 'library-root') {
    throw invalidPayload('Resource Browser Media Library status requires a library root.');
  }
  if (base.libraryStatus && base.libraryStatus.libraryName !== base.libraryName) {
    throw invalidPayload('Resource Browser Media Library status identity does not match.');
  }
  return {
    ...base,
    facet,
    locator: requireContentLocator(record['locator'], 'locator'),
  };
}

function requireConfirmedEntityStatus(value: unknown): 'confirmed' {
  if (value !== 'confirmed') {
    throw invalidPayload('Resource Browser Entity status must be confirmed.');
  }
  return value;
}

function requireRepresentationAvailability(value: unknown): 'active' | 'unbound' {
  if (value !== 'active' && value !== 'unbound') {
    throw invalidPayload('Resource Browser Entity representation availability is invalid.');
  }
  return value;
}

function parseResourceBrowserEntityRef(value: unknown): ResourceBrowserEntityRef {
  const record = requireRecord(value, 'Resource Browser Entity identity is required.');
  if ('projectRoot' in record) {
    throw invalidPayload('Resource Browser Entity identity must not expose a project path.');
  }
  const entityKind = record['entityKind'];
  if (!isCreativeEntityKind(entityKind)) {
    throw invalidPayload('Resource Browser Entity kind is invalid.');
  }
  return {
    entityId: requireNonEmptyString(
      record['entityId'],
      'Resource Browser Entity identity is required.',
    ),
    entityKind,
  };
}

function readOptionalDescription(value: unknown): { readonly description?: string } {
  return value === undefined
    ? {}
    : { description: requireNonEmptyString(value, 'Resource Browser description is invalid.') };
}

function readOptionalThumbnail(value: unknown): {
  readonly thumbnail?: ResourceBrowserThumbnailDescriptor;
} {
  if (value === undefined) return {};
  const record = requireRecord(value, 'Resource Browser thumbnail descriptor is invalid.');
  const descriptorId = requireNonEmptyString(
    record['descriptorId'],
    'Resource Browser thumbnail descriptor identity is required.',
  );
  assertNoPathLikeValue(descriptorId, 'Resource Browser thumbnail descriptor');
  return {
    thumbnail: {
      descriptorId,
      revision: requireNonEmptyString(
        record['revision'],
        'Resource Browser thumbnail revision is required.',
      ),
      mediaType: requireNonEmptyString(
        record['mediaType'],
        'Resource Browser thumbnail media type is required.',
      ),
    },
  };
}

function readOptionalLibraryStatus(value: unknown): {
  readonly libraryStatus?: WorkspaceMediaLibraryStatus;
} {
  return value === undefined ? {} : { libraryStatus: parseWorkspaceMediaLibraryStatus(value) };
}

function parseWorkspaceMediaLibraryStatus(value: unknown): WorkspaceMediaLibraryStatus {
  const record = requireRecord(value, 'Resource Browser Media Library status is invalid.');
  requireOnlyKeys(record, [
    'libraryName',
    'state',
    'referenceCount',
    'missingCount',
    'operationRevision',
    'diagnostic',
  ]);
  const state = record['state'];
  if (
    state !== 'available' &&
    state !== 'required-unlinked' &&
    state !== 'global-connection-missing' &&
    state !== 'target-unavailable' &&
    state !== 'content-incomplete' &&
    state !== 'entry-conflict' &&
    state !== 'unreferenced-linked'
  ) {
    throw invalidPayload('Resource Browser Media Library state is invalid.');
  }
  const diagnostic =
    record['diagnostic'] === undefined
      ? undefined
      : parseWorkspaceMediaLibraryDiagnostic(record['diagnostic']);
  return {
    libraryName: requireLibraryName(
      record['libraryName'],
      'Resource Browser Media Library name is invalid.',
    ),
    state,
    referenceCount: requireNonNegativeInteger(
      record['referenceCount'],
      'Resource Browser Media Library reference count is invalid.',
    ),
    missingCount: requireNonNegativeInteger(
      record['missingCount'],
      'Resource Browser Media Library missing count is invalid.',
    ),
    operationRevision: requireOpaqueIdentity(
      record['operationRevision'],
      'Resource Browser Media Library operation revision is required.',
    ),
    ...(diagnostic ? { diagnostic } : {}),
  };
}

function parseWorkspaceMediaLibraryDiagnostic(
  value: unknown,
): NonNullable<WorkspaceMediaLibraryStatus['diagnostic']> {
  const record = requireRecord(value, 'Resource Browser Media Library diagnostic is invalid.');
  requireOnlyKeys(record, ['code', 'severity', 'message', 'missingCount']);
  const code = record['code'];
  const allowedCodes = new Set([
    'coverage-incomplete',
    'global-connection-missing',
    'target-unavailable',
    'content-incomplete',
    'entry-conflict',
    'stale-recovery-plan',
    'recovery-candidate-missing',
    'recovery-candidate-incomplete',
    'recovery-cancelled',
    'snapshot-destination-conflict',
    'snapshot-source-stale',
    'snapshot-content-unavailable',
    'snapshot-checkpoint-unavailable',
    'nested-link-escape',
  ]);
  if (typeof code !== 'string' || !allowedCodes.has(code)) {
    throw invalidPayload('Resource Browser Media Library diagnostic code is invalid.');
  }
  const severity = record['severity'];
  if (severity !== 'warning' && severity !== 'error') {
    throw invalidPayload('Resource Browser Media Library diagnostic severity is invalid.');
  }
  const message = requireNonEmptyString(
    record['message'],
    'Resource Browser Media Library diagnostic message is required.',
  );
  assertNoPathLikeValue(message, 'Resource Browser Media Library diagnostic');
  const missingCount =
    record['missingCount'] === undefined
      ? undefined
      : requireNonNegativeInteger(
          record['missingCount'],
          'Resource Browser Media Library diagnostic missing count is invalid.',
        );
  return {
    code: code as NonNullable<WorkspaceMediaLibraryStatus['diagnostic']>['code'],
    severity,
    message,
    ...(missingCount === undefined ? {} : { missingCount }),
  };
}

function parseWorkspaceMediaLibraryRecoveryPlan(value: unknown): WorkspaceMediaLibraryRecoveryPlan {
  const record = requireRecord(value, 'Resource Browser Media Library recovery plan is invalid.');
  requireOnlyKeys(record, [
    'contractVersion',
    'planId',
    'workspaceId',
    'libraryName',
    'requirementRevision',
    'operationRevision',
    'candidate',
    'referencedCount',
    'validatedCount',
  ]);
  if (record['contractVersion'] !== WORKSPACE_MEDIA_LIBRARY_SYNC_CONTRACT_VERSION) {
    throw invalidPayload('Resource Browser Media Library recovery plan version is unsupported.');
  }
  const candidateRecord = requireRecord(
    record['candidate'],
    'Resource Browser Media Library recovery candidate is invalid.',
  );
  const kind = candidateRecord['kind'];
  requireOnlyKeys(
    candidateRecord,
    kind === 'global-alias' ? ['kind', 'name', 'locationKind'] : ['kind', 'name'],
  );
  const name = requireLibraryName(
    candidateRecord['name'],
    'Resource Browser Media Library recovery candidate name is invalid.',
  );
  const candidate =
    kind === 'directory-selection-required'
      ? ({ kind, name } as const)
      : kind === 'global-alias'
        ? ({
            kind,
            name,
            locationKind: requireMediaLibraryLocationKind(candidateRecord['locationKind']),
          } as const)
        : undefined;
  if (!candidate) {
    throw invalidPayload('Resource Browser Media Library recovery candidate kind is invalid.');
  }
  return {
    contractVersion: WORKSPACE_MEDIA_LIBRARY_SYNC_CONTRACT_VERSION,
    planId: requireOpaqueIdentity(
      record['planId'],
      'Resource Browser Media Library recovery plan identity is required.',
    ),
    workspaceId: requireOpaqueIdentity(
      record['workspaceId'],
      'Resource Browser Media Library recovery workspace identity is required.',
    ),
    libraryName: requireLibraryName(
      record['libraryName'],
      'Resource Browser Media Library recovery library name is invalid.',
    ),
    requirementRevision: requireRevision(
      record['requirementRevision'],
      'Resource Browser Media Library requirement revision is required.',
    ),
    operationRevision: requireOpaqueIdentity(
      record['operationRevision'],
      'Resource Browser Media Library operation revision is required.',
    ),
    candidate,
    referencedCount: requireNonNegativeInteger(
      record['referencedCount'],
      'Resource Browser Media Library referenced count is invalid.',
    ),
    validatedCount: requireNonNegativeInteger(
      record['validatedCount'],
      'Resource Browser Media Library validated count is invalid.',
    ),
  };
}

function requireMediaLibraryLocationKind(value: unknown): 'local' | 'nas' | 'cloud' {
  if (value !== 'local' && value !== 'nas' && value !== 'cloud') {
    throw invalidPayload('Resource Browser Media Library location kind is invalid.');
  }
  return value;
}

function readEntityRepresentation(
  availability: 'active' | 'unbound',
  locator: unknown,
  bindingId: unknown,
  role: unknown,
):
  | {
      readonly representationLocator: ContentLocator;
      readonly representationBindingId: string;
      readonly representationRole: EntityRepresentationRole;
    }
  | Record<string, never> {
  if (availability === 'unbound') {
    if (locator !== undefined || bindingId !== undefined || role !== undefined) {
      throw invalidPayload('Unbound Resource Browser Entity must not contain representation data.');
    }
    return {};
  }
  if (!isEntityRepresentationRole(role)) {
    throw invalidPayload('Resource Browser Entity representation role is invalid.');
  }
  return {
    representationLocator: requireContentLocator(locator, 'representationLocator'),
    representationBindingId: requireOpaqueIdentity(
      bindingId,
      'Resource Browser Entity representation binding identity is required.',
    ),
    representationRole: role,
  };
}

function requireContentLocator(value: unknown, field: string): ContentLocator {
  const result = validateContentLocator(value);
  if (!result.ok) {
    throw invalidPayload(`Resource Browser ${field} is not a valid portable ContentLocator.`);
  }
  return result.locator;
}

function requireFacet(value: unknown): ResourceBrowserFacet {
  if (value !== 'files' && value !== 'media' && value !== 'materials') {
    throw invalidPayload('Resource Browser facet is invalid.');
  }
  return value;
}

function requireItemKind(value: unknown): ResourceBrowserItemKind {
  const allowed: readonly ResourceBrowserItemKind[] = [
    'file',
    'directory',
    'image',
    'video',
    'audio',
    'document',
    'character',
    'scene',
    'object',
    'location',
    'style',
  ];
  const match = allowed.find((candidate) => candidate === value);
  if (!match) {
    throw invalidPayload('Resource Browser item kind is invalid.');
  }
  return match;
}

function requireItemRole(value: unknown): 'directory' | 'library-root' | 'content' | 'entity' {
  if (
    value !== 'directory' &&
    value !== 'library-root' &&
    value !== 'content' &&
    value !== 'entity'
  ) {
    throw invalidPayload('Resource Browser item role is invalid.');
  }
  return value;
}

function readOptionalOpaqueIdentity(
  value: unknown,
  field: string,
): { readonly parentResourceId?: string } {
  return value === undefined
    ? {}
    : {
        parentResourceId: requireOpaqueIdentity(value, `Resource Browser ${field} is invalid.`),
      };
}

function readOptionalLibraryName(value: unknown): { readonly libraryName?: string } {
  return value === undefined
    ? {}
    : {
        libraryName: requireLibraryName(value, 'Resource Browser library name is invalid.'),
      };
}

function requireLibraryName(value: unknown, message: string): string {
  const name = requireNonEmptyString(value, message);
  if (validateWorkspaceLinkedMediaLibraryName(name)) throw invalidPayload(message);
  return name;
}

function requireCapability(value: unknown): ResourceBrowserCapability {
  const allowed: readonly ResourceBrowserCapability[] = [
    'preview',
    'open-cut',
    'add-to-cut',
    'reveal',
    'add-to-canvas',
    'add-to-agent',
  ];
  const match = allowed.find((candidate) => candidate === value);
  if (!match) {
    throw invalidPayload('Resource Browser item capability is invalid.');
  }
  return match;
}

function requireVersion(value: unknown): void {
  if (value !== RESOURCE_BROWSER_CONTRACT_VERSION) {
    throw new ResourceBrowserContractError(
      'unsupported-resource-browser-version',
      `Unsupported Resource Browser contract version: ${String(value)}.`,
    );
  }
}

function assertNoPathLikeValue(value: string, label: string): void {
  if (
    value.startsWith('/') ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    value.startsWith('file://') ||
    value.includes('\\')
  ) {
    throw invalidPayload(`${label} must not contain a local path.`);
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidPayload(message);
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw invalidPayload('Resource Browser payload contains unsupported fields.');
  }
}

function requireArray(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw invalidPayload(message);
  }
  return value;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw invalidPayload(message);
  }
  return value;
}

function requireNonEmptyString(value: unknown, message: string): string {
  const text = requireString(value, message);
  if (text.trim().length === 0) {
    throw invalidPayload(message);
  }
  return text;
}

function requireOpaqueIdentity(value: unknown, message: string): string {
  const identity = requireNonEmptyString(value, message);
  assertNoPathLikeValue(identity, 'Resource Browser identity');
  return identity;
}

function requireRevision(value: unknown, message: string): string {
  const revision = requireNonEmptyString(value, message);
  assertNoPathLikeValue(revision, 'Resource Browser revision');
  return revision;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requirePositiveInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw invalidPayload(message);
  }
  return value;
}

function requireBoundedInteger(value: unknown, min: number, max: number, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw invalidPayload(message);
  }
  return value;
}

function invalidPayload(message: string): ResourceBrowserContractError {
  return new ResourceBrowserContractError('invalid-resource-browser-payload', message);
}
