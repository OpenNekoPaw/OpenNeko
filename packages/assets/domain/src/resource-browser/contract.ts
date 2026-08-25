import { validateContentLocator, type ContentLocator } from '@neko/content-domain';
import { isPortablePathSegment } from '@neko/shared/path';

export function createResourceBrowserViewId(projectViewId: string): string {
  return `resource-browser:${projectViewId}`;
}

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
  reconcile: 'projection.reconcile',
  linkGlobalLibrary: 'source.link-global-library',
  addDirectoryLibrary: 'source.add-directory-library',
  relinkSource: 'source.relink',
  removeSource: 'source.remove',
  createFile: 'workspace-entry.create-file',
  createDirectory: 'workspace-entry.create-directory',
  importFiles: 'workspace-entry.import-files',
  createCreativeDocument: 'creative-document.create',
  openCreativeDocument: 'creative-document.open',
  trashContent: 'content.trash',
  preview: 'preview',
  editText: 'text.edit',
  addToCut: 'cut.add',
  reveal: 'reveal',
  addToCanvas: 'canvas.add',
} as const;

export type ResourceBrowserRoute =
  (typeof RESOURCE_BROWSER_ROUTES)[keyof typeof RESOURCE_BROWSER_ROUTES];
export type ResourceBrowserSource = 'files' | 'media' | 'assets';
export type ResourceBrowserItemKind =
  'directory' | 'file' | 'image' | 'video' | 'audio' | 'document' | 'asset';
export type ResourceBrowserCapability =
  'preview' | 'edit-text' | 'open-creative-document' | 'add-to-cut' | 'reveal' | 'add-to-canvas';

export interface ResourceBrowserDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly recordId?: string;
}

export type ResourceBrowserMediaLibraryState =
  | 'available'
  | 'required-unlinked'
  | 'connection-missing'
  | 'target-unavailable'
  | 'content-incomplete'
  | 'binding-invalid'
  | 'entry-conflict'
  | 'unreferenced-local-binding';

export interface ResourceBrowserMediaLibraryStatus {
  readonly libraryName: string;
  readonly state: ResourceBrowserMediaLibraryState;
  readonly referenceCount: number;
  readonly missingCount: number;
  readonly operationFingerprint: string;
  readonly diagnostic?: {
    readonly code: Exclude<
      ResourceBrowserMediaLibraryState,
      'available' | 'unreferenced-local-binding'
    >;
    readonly severity: 'warning' | 'error';
    readonly message: string;
    readonly missingCount?: number;
  };
}

export interface ResourceBrowserIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly rendererSessionId: string;
}

export interface ResourceBrowserThumbnailDescriptor {
  readonly descriptorId: string;
  readonly sourceFingerprint: string;
  readonly mediaType: string;
}

interface ResourceBrowserItemBase {
  readonly resourceId: string;
  readonly source: ResourceBrowserSource;
  readonly kind: ResourceBrowserItemKind;
  readonly label: string;
  readonly description?: string;
  readonly capabilities: readonly ResourceBrowserCapability[];
  readonly thumbnail?: ResourceBrowserThumbnailDescriptor;
  readonly role: 'directory' | 'library-root' | 'content' | 'asset';
  readonly parentResourceId?: string;
  readonly depth: number;
  readonly libraryName?: string;
  readonly libraryStatus?: ResourceBrowserMediaLibraryStatus;
}

export interface ResourceBrowserContentItem extends ResourceBrowserItemBase {
  readonly source: 'files' | 'media';
  readonly role: 'directory' | 'content';
  readonly locator: ContentLocator;
}

export interface ResourceBrowserMediaLibraryRootItem extends ResourceBrowserItemBase {
  readonly source: 'media';
  readonly kind: 'directory';
  readonly role: 'library-root';
  readonly libraryName: string;
  readonly libraryStatus: ResourceBrowserMediaLibraryStatus;
}

export interface ResourceBrowserAssetItem extends ResourceBrowserItemBase {
  readonly source: 'assets';
  readonly kind: 'asset';
  readonly role: 'asset';
  readonly assetRef: {
    readonly assetId: string;
  };
  readonly availability: 'available' | 'unavailable';
}

export type ResourceBrowserItem =
  ResourceBrowserContentItem | ResourceBrowserMediaLibraryRootItem | ResourceBrowserAssetItem;

export interface ResourceBrowserProjection {
  readonly identity: ResourceBrowserIdentity;
  readonly source: ResourceBrowserSource;
  readonly query: string;
  readonly items: readonly ResourceBrowserItem[];
  readonly diagnostics?: readonly ResourceBrowserDiagnostic[];
}

export interface ResourceBrowserRequest {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
}

export interface ResourceBrowserSearchRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.search;
  readonly source: ResourceBrowserSource;
  readonly query: string;
  readonly limit: number;
}

export interface ResourceBrowserChildrenRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.children;
  readonly source: 'files' | 'media';
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
  readonly sourceFingerprint: string;
}

export interface ResourceBrowserThumbnailResult {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly resourceId: string;
  readonly descriptorId: string;
  readonly sourceFingerprint: string;
  readonly dataUrl: string;
}

export type ResourceBrowserQuickPreviewKind = 'image' | 'video' | 'audio';

export interface ResourceBrowserQuickPreviewDescriptor {
  readonly descriptorId: string;
  readonly sourceFingerprint: string;
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
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly previewSessionId: string;
  readonly status: 'released';
}

export interface ResourceBrowserRecoveryPlanRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.recoveryPlan;
  readonly resourceId: string;
  readonly expectedOperationFingerprint: string;
  readonly candidate: 'existing-global' | 'select-directory';
}

export interface ResourceBrowserMediaLibraryRecoveryPlan {
  readonly planId: string;
  readonly workspaceId: string;
  readonly libraryName: string;
  readonly requirementFingerprint: string;
  readonly operationFingerprint: string;
  readonly candidate:
    | {
        readonly kind: 'global-alias';
        readonly name: string;
        readonly locationKind: 'local' | 'nas' | 'cloud';
      }
    | { readonly kind: 'directory-selection-required'; readonly name: string };
  readonly referencedCount: number;
  readonly validatedCount: number;
}

export type ResourceBrowserRecoveryPlanResult =
  | {
      readonly requestId: string;
      readonly identity: ResourceBrowserIdentity;
      readonly resourceId: string;
      readonly status: 'planned';
      readonly plan: ResourceBrowserMediaLibraryRecoveryPlan;
    }
  | {
      readonly requestId: string;
      readonly identity: ResourceBrowserIdentity;
      readonly resourceId: string;
      readonly status: 'cancelled';
    };

export interface ResourceBrowserRecoveryApplyRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.recoveryApply;
  readonly planId: string;
  readonly expectedOperationFingerprint: string;
}

export interface ResourceBrowserRecoveryCancelRequest extends ResourceBrowserRequest {
  readonly route: typeof RESOURCE_BROWSER_ROUTES.recoveryCancel;
  readonly planId: string;
}

export interface ResourceBrowserRecoveryCancelResult {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly planId: string;
  readonly status: 'cancelled';
}

export interface ResourceBrowserIntentRequest extends ResourceBrowserRequest {
  readonly route:
    | typeof RESOURCE_BROWSER_ROUTES.reconcile
    | typeof RESOURCE_BROWSER_ROUTES.linkGlobalLibrary
    | typeof RESOURCE_BROWSER_ROUTES.addDirectoryLibrary
    | typeof RESOURCE_BROWSER_ROUTES.relinkSource
    | typeof RESOURCE_BROWSER_ROUTES.removeSource
    | typeof RESOURCE_BROWSER_ROUTES.createFile
    | typeof RESOURCE_BROWSER_ROUTES.createDirectory
    | typeof RESOURCE_BROWSER_ROUTES.importFiles
    | typeof RESOURCE_BROWSER_ROUTES.createCreativeDocument
    | typeof RESOURCE_BROWSER_ROUTES.openCreativeDocument
    | typeof RESOURCE_BROWSER_ROUTES.trashContent
    | typeof RESOURCE_BROWSER_ROUTES.preview
    | typeof RESOURCE_BROWSER_ROUTES.editText
    | typeof RESOURCE_BROWSER_ROUTES.addToCut
    | typeof RESOURCE_BROWSER_ROUTES.reveal
    | typeof RESOURCE_BROWSER_ROUTES.addToCanvas;
  readonly resourceId?: string;
  readonly entryName?: string;
  readonly documentKind?: 'canvas' | 'cut';
  readonly targetPreview?: {
    readonly viewId: string;
    readonly presentation: 'temporary' | 'side';
  };
  readonly targetCut?: {
    readonly viewId: string;
    readonly viewInstanceId: string;
    readonly documentId: string;
    readonly sessionId: string;
  };
  readonly targetCanvas?: {
    readonly documentId: string;
    readonly sessionId: string;
  };
}

export interface ResourceBrowserIntentCompletedResult {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly status: 'completed';
  readonly projection: ResourceBrowserProjection;
}

export interface ResourceBrowserIntentRejectedResult {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly status: 'rejected';
  readonly rejection: {
    readonly code: 'main-view-capacity-reached';
    readonly maximum: number;
  };
}

export type ResourceBrowserIntentResult =
  ResourceBrowserIntentCompletedResult | ResourceBrowserIntentRejectedResult;

export interface ResourceBrowserProjectionEvent {
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
  readonly code: 'invalid-resource-browser-payload' | 'resource-browser-stale-identity';

  constructor(code: ResourceBrowserContractError['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ResourceBrowserContractError';
    this.code = code;
  }
}

export class ResourceBrowserOperationRejectedError extends Error {
  readonly code: ResourceBrowserIntentRejectedResult['rejection']['code'];
  readonly maximum: number;

  constructor(rejection: ResourceBrowserIntentRejectedResult['rejection']) {
    super(`Resource Browser operation rejected: ${rejection.code}.`);
    this.name = 'ResourceBrowserOperationRejectedError';
    this.code = rejection.code;
    this.maximum = rejection.maximum;
  }
}

export function createResourceBrowserSearchRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly source: ResourceBrowserSource;
  readonly query: string;
  readonly limit?: number;
}): ResourceBrowserSearchRequest {
  return parseResourceBrowserSearchRequest({
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.search,
    source: input.source,
    query: input.query,
    limit: input.limit ?? 100,
  });
}

export function createResourceBrowserChildrenRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly source: 'files' | 'media';
  readonly parentResourceId: string;
  readonly limit?: number;
}): ResourceBrowserChildrenRequest {
  return parseResourceBrowserChildrenRequest({
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.children,
    source: input.source,
    parentResourceId: input.parentResourceId,
    limit: input.limit ?? 100,
  });
}

export function createResourceBrowserSnapshotRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
}): ResourceBrowserSnapshotRequest {
  return parseResourceBrowserSnapshotRequest({
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
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.thumbnailResolve,
    resourceId: input.resourceId,
    descriptorId: input.descriptor.descriptorId,
    sourceFingerprint: input.descriptor.sourceFingerprint,
  });
}

export function createResourceBrowserQuickPreviewRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly resourceId: string;
}): ResourceBrowserQuickPreviewRequest {
  return parseResourceBrowserQuickPreviewRequest({
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
  readonly expectedOperationFingerprint: string;
  readonly candidate: ResourceBrowserRecoveryPlanRequest['candidate'];
}): ResourceBrowserRecoveryPlanRequest {
  return parseResourceBrowserRecoveryPlanRequest({
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.recoveryPlan,
    resourceId: input.resourceId,
    expectedOperationFingerprint: input.expectedOperationFingerprint,
    candidate: input.candidate,
  });
}

export function createResourceBrowserRecoveryApplyRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly planId: string;
  readonly expectedOperationFingerprint: string;
}): ResourceBrowserRecoveryApplyRequest {
  return parseResourceBrowserRecoveryApplyRequest({
    requestId: input.requestId,
    identity: input.identity,
    route: RESOURCE_BROWSER_ROUTES.recoveryApply,
    planId: input.planId,
    expectedOperationFingerprint: input.expectedOperationFingerprint,
  });
}

export function createResourceBrowserRecoveryCancelRequest(input: {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly planId: string;
}): ResourceBrowserRecoveryCancelRequest {
  return parseResourceBrowserRecoveryCancelRequest({
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
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.snapshotGet) {
    throw invalidPayload('Resource Browser snapshot route is invalid.');
  }
  return {
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
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.thumbnailResolve) {
    throw invalidPayload('Resource Browser thumbnail route is invalid.');
  }
  const descriptorId = requireOpaqueIdentity(
    record['descriptorId'],
    'Resource Browser thumbnail descriptor identity is required.',
  );
  assertNoPathLikeValue(descriptorId, 'Resource Browser thumbnail descriptor');
  return {
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
    sourceFingerprint: requireOpaqueIdentity(
      record['sourceFingerprint'],
      'Resource Browser thumbnail source fingerprint is required.',
    ),
  };
}

export function parseResourceBrowserThumbnailResult(
  value: unknown,
): ResourceBrowserThumbnailResult {
  const record = requireRecord(value, 'Resource Browser thumbnail result must be an object.');
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
    sourceFingerprint: requireOpaqueIdentity(
      record['sourceFingerprint'],
      'Resource Browser thumbnail source fingerprint is required.',
    ),
    dataUrl,
  };
}

export function parseResourceBrowserQuickPreviewRequest(
  value: unknown,
): ResourceBrowserQuickPreviewRequest {
  const record = requireRecord(value, 'Resource Browser quick preview request must be an object.');
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.quickPreviewResolve) {
    throw invalidPayload('Resource Browser quick preview route is invalid.');
  }
  return {
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
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.quickPreviewRelease) {
    throw invalidPayload('Resource Browser quick preview release route is invalid.');
  }
  return {
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
  const descriptor = requireRecord(
    record['descriptor'],
    'Resource Browser quick preview descriptor is required.',
  );
  const contentKind = descriptor['contentKind'];
  if (contentKind !== 'image' && contentKind !== 'video' && contentKind !== 'audio') {
    throw invalidPayload('Resource Browser quick preview kind is invalid.');
  }
  return {
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
      sourceFingerprint: requireOpaqueIdentity(
        descriptor['sourceFingerprint'],
        'Resource Browser quick preview source fingerprint is required.',
      ),
      contentLocator: requireContentLocator(descriptor['contentLocator'], 'contentLocator'),
      url: requireOpenNekoResourceUrl(descriptor['url']),
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

function requireOpenNekoResourceUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw invalidPayload('Resource Browser quick preview URL is required.');
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'openneko:' ||
      url.hostname !== 'resource' ||
      !/^\/[A-Za-z0-9_-]{32}$/u.test(url.pathname) ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.port.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new Error('not an OpenNeko resource URL');
    }
    return value;
  } catch {
    throw invalidPayload(
      'Resource Browser quick preview URL must use an authorized OpenNeko resource.',
    );
  }
}

export function parseResourceBrowserQuickPreviewReleaseResult(
  value: unknown,
): ResourceBrowserQuickPreviewReleaseResult {
  const record = requireRecord(
    value,
    'Resource Browser quick preview release result must be an object.',
  );
  if (record['status'] !== 'released') {
    throw invalidPayload('Resource Browser quick preview release status is invalid.');
  }
  return {
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
    'requestId',
    'identity',
    'route',
    'resourceId',
    'expectedOperationFingerprint',
    'candidate',
  ]);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.recoveryPlan) {
    throw invalidPayload('Resource Browser recovery plan route is invalid.');
  }
  const candidate = record['candidate'];
  if (candidate !== 'existing-global' && candidate !== 'select-directory') {
    throw invalidPayload('Resource Browser recovery candidate choice is invalid.');
  }
  return {
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
    expectedOperationFingerprint: requireOpaqueIdentity(
      record['expectedOperationFingerprint'],
      'Resource Browser recovery operation revision is required.',
    ),
    candidate,
  };
}

export function parseResourceBrowserRecoveryPlanResult(
  value: unknown,
): ResourceBrowserRecoveryPlanResult {
  const record = requireRecord(value, 'Resource Browser recovery plan result must be an object.');
  requireOnlyKeys(record, ['requestId', 'identity', 'resourceId', 'status', 'plan']);
  const status = record['status'];
  const base = {
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
    'requestId',
    'identity',
    'route',
    'planId',
    'expectedOperationFingerprint',
  ]);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.recoveryApply) {
    throw invalidPayload('Resource Browser recovery apply route is invalid.');
  }
  return {
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
    expectedOperationFingerprint: requireOpaqueIdentity(
      record['expectedOperationFingerprint'],
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
  requireOnlyKeys(record, ['requestId', 'identity', 'route', 'planId']);
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.recoveryCancel) {
    throw invalidPayload('Resource Browser recovery cancel route is invalid.');
  }
  return {
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
  requireOnlyKeys(record, ['requestId', 'identity', 'planId', 'status']);
  if (record['status'] !== 'cancelled') {
    throw invalidPayload('Resource Browser recovery cancel status is invalid.');
  }
  return {
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
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.search) {
    throw invalidPayload('Resource Browser search route is invalid.');
  }
  return {
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.search,
    source: requireSource(record['source']),
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
  if (record['route'] !== RESOURCE_BROWSER_ROUTES.children) {
    throw invalidPayload('Resource Browser children route is invalid.');
  }
  const source = requireSource(record['source']);
  if (source !== 'files' && source !== 'media') {
    throw invalidPayload('Resource Browser children source must be Directory or Media.');
  }
  return {
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route: RESOURCE_BROWSER_ROUTES.children,
    source,
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
  requireOnlyKeys(record, [
    'requestId',
    'identity',
    'route',
    'resourceId',
    'entryName',
    'documentKind',
    'targetPreview',
    'targetCut',
    'targetCanvas',
  ]);
  const route = record['route'];
  if (
    route !== RESOURCE_BROWSER_ROUTES.reconcile &&
    route !== RESOURCE_BROWSER_ROUTES.linkGlobalLibrary &&
    route !== RESOURCE_BROWSER_ROUTES.addDirectoryLibrary &&
    route !== RESOURCE_BROWSER_ROUTES.relinkSource &&
    route !== RESOURCE_BROWSER_ROUTES.removeSource &&
    route !== RESOURCE_BROWSER_ROUTES.createFile &&
    route !== RESOURCE_BROWSER_ROUTES.createDirectory &&
    route !== RESOURCE_BROWSER_ROUTES.importFiles &&
    route !== RESOURCE_BROWSER_ROUTES.createCreativeDocument &&
    route !== RESOURCE_BROWSER_ROUTES.trashContent &&
    route !== RESOURCE_BROWSER_ROUTES.preview &&
    route !== RESOURCE_BROWSER_ROUTES.openCreativeDocument &&
    route !== RESOURCE_BROWSER_ROUTES.editText &&
    route !== RESOURCE_BROWSER_ROUTES.addToCut &&
    route !== RESOURCE_BROWSER_ROUTES.reveal &&
    route !== RESOURCE_BROWSER_ROUTES.addToCanvas
  ) {
    throw invalidPayload('Resource Browser intent route is invalid.');
  }
  const request = {
    requestId: requireNonEmptyString(
      record['requestId'],
      'Resource Browser request identity is required.',
    ),
    identity: parseResourceBrowserIdentity(record['identity']),
    route,
  } as const;
  if (route === RESOURCE_BROWSER_ROUTES.reconcile) {
    return request;
  }
  if (
    route === RESOURCE_BROWSER_ROUTES.linkGlobalLibrary ||
    route === RESOURCE_BROWSER_ROUTES.addDirectoryLibrary
  ) {
    return request;
  }
  if (route === RESOURCE_BROWSER_ROUTES.importFiles) {
    const resourceId =
      record['resourceId'] === undefined
        ? undefined
        : requireOpaqueIdentity(
            record['resourceId'],
            'Resource Browser import destination identity is invalid.',
          );
    return { ...request, ...(resourceId ? { resourceId } : {}) };
  }
  if (
    route === RESOURCE_BROWSER_ROUTES.createFile ||
    route === RESOURCE_BROWSER_ROUTES.createDirectory ||
    route === RESOURCE_BROWSER_ROUTES.createCreativeDocument
  ) {
    const resourceId =
      record['resourceId'] === undefined
        ? undefined
        : requireOpaqueIdentity(
            record['resourceId'],
            'Resource Browser parent identity is invalid.',
          );
    return {
      ...request,
      ...(resourceId ? { resourceId } : {}),
      entryName: requirePortableEntryName(record['entryName']),
      ...(route === RESOURCE_BROWSER_ROUTES.createCreativeDocument
        ? { documentKind: requireCreativeDocumentKind(record['documentKind']) }
        : {}),
    };
  }
  const resourceId = requireOpaqueIdentity(
    record['resourceId'],
    'Resource Browser item identity is required.',
  );
  if (
    route === RESOURCE_BROWSER_ROUTES.relinkSource ||
    route === RESOURCE_BROWSER_ROUTES.removeSource ||
    route === RESOURCE_BROWSER_ROUTES.trashContent
  ) {
    return { ...request, resourceId };
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
      },
    };
  }
  if (route === RESOURCE_BROWSER_ROUTES.editText) {
    return { ...request, resourceId };
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
        viewInstanceId: requireNonEmptyString(
          target['viewInstanceId'],
          'Resource Browser target Cut View instance identity is required.',
        ),
        documentId: requireOpaqueIdentity(
          target['documentId'],
          'Resource Browser target Cut document identity is required.',
        ),
        sessionId: requireOpaqueIdentity(
          target['sessionId'],
          'Resource Browser target Cut session identity is required.',
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
    },
  };
}

export function parseResourceBrowserIntentResult(value: unknown): ResourceBrowserIntentResult {
  const record = requireRecord(value, 'Resource Browser intent result must be an object.');
  const status = record['status'];
  if (status === 'completed') {
    requireOnlyKeys(record, ['requestId', 'identity', 'status', 'projection']);
    const identity = parseResourceBrowserIdentity(record['identity']);
    const projection = parseResourceBrowserProjection(record['projection']);
    assertResourceBrowserIdentity(identity, projection.identity);
    return {
      requestId: requireNonEmptyString(
        record['requestId'],
        'Resource Browser request identity is required.',
      ),
      identity,
      status,
      projection,
    };
  }
  if (status === 'rejected') {
    requireOnlyKeys(record, ['requestId', 'identity', 'status', 'rejection']);
    const rejection = requireRecord(
      record['rejection'],
      'Resource Browser intent rejection is required.',
    );
    requireOnlyKeys(rejection, ['code', 'maximum']);
    if (rejection['code'] !== 'main-view-capacity-reached') {
      throw invalidPayload('Resource Browser intent rejection code is invalid.');
    }
    return {
      requestId: requireNonEmptyString(
        record['requestId'],
        'Resource Browser request identity is required.',
      ),
      identity: parseResourceBrowserIdentity(record['identity']),
      status,
      rejection: {
        code: rejection['code'],
        maximum: requireBoundedInteger(
          rejection['maximum'],
          1,
          100,
          'Resource Browser Main View maximum must be between 1 and 100.',
        ),
      },
    };
  }
  throw invalidPayload('Resource Browser intent result status is invalid.');
}

function requireCreativeDocumentKind(value: unknown): 'canvas' | 'cut' {
  if (value !== 'canvas' && value !== 'cut') {
    throw invalidPayload('Resource Browser creative document kind must be Canvas or Cut.');
  }
  return value;
}

function requirePortableEntryName(value: unknown): string {
  const name = requireNonEmptyString(value, 'Resource Browser entry name is required.').normalize(
    'NFC',
  );
  if (!isPortablePathSegment(name)) {
    throw invalidPayload('Resource Browser entry name is not a portable visible path segment.');
  }
  return name;
}

export function parseResourceBrowserProjection(value: unknown): ResourceBrowserProjection {
  const record = requireRecord(value, 'Resource Browser projection must be an object.');
  requireOnlyKeys(record, ['identity', 'source', 'query', 'items', 'diagnostics']);
  const source = requireSource(record['source']);
  const items = requireArray(
    record['items'],
    'Resource Browser projection items must be an array.',
  ).map(parseResourceBrowserItem);
  if (items.some((item) => item.source !== source)) {
    throw invalidPayload('Resource Browser item source does not match the active source.');
  }
  const resourceIds = new Set(items.map((item) => item.resourceId));
  if (resourceIds.size !== items.length) {
    throw invalidPayload('Resource Browser item identities must be unique.');
  }
  const diagnostics =
    record['diagnostics'] === undefined
      ? undefined
      : requireArray(record['diagnostics'], 'Resource Browser diagnostics must be an array.').map(
          parseResourceBrowserDiagnostic,
        );
  return {
    identity: parseResourceBrowserIdentity(record['identity']),
    source,
    query: requireString(record['query'], 'Resource Browser query is invalid.'),
    items,
    ...(diagnostics && diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

function parseResourceBrowserDiagnostic(value: unknown): ResourceBrowserDiagnostic {
  const record = requireRecord(value, 'Resource Browser diagnostic must be an object.');
  requireOnlyKeys(record, ['code', 'message', 'recordId']);
  return {
    code: requireOpaqueIdentity(record['code'], 'Resource Browser diagnostic code is required.'),
    message: requireNonEmptyString(
      record['message'],
      'Resource Browser diagnostic message is required.',
    ),
    ...(record['recordId'] === undefined
      ? {}
      : {
          recordId: requireOpaqueIdentity(
            record['recordId'],
            'Resource Browser diagnostic record identity is invalid.',
          ),
        }),
  };
}

export function parseResourceBrowserProjectionEvent(
  value: unknown,
): ResourceBrowserProjectionEvent {
  const record = requireRecord(value, 'Resource Browser event must be an object.');
  return {
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
    expected.viewInstanceId === actual.viewInstanceId &&
    expected.rendererSessionId === actual.rendererSessionId;
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
    viewInstanceId: requireNonEmptyString(
      record['viewInstanceId'],
      'Resource Browser View instance identity is required.',
    ),
    rendererSessionId: requireOpaqueIdentity(
      record['rendererSessionId'],
      'Resource Browser renderer session identity is required.',
    ),
  };
}

function parseResourceBrowserItem(value: unknown): ResourceBrowserItem {
  const record = requireRecord(value, 'Resource Browser item must be an object.');
  const source = requireSource(record['source']);
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
  if (source === 'assets') {
    if (base.libraryStatus) {
      throw invalidPayload('Resource Browser Asset must not contain Media Library status.');
    }
    if (base.kind !== 'asset' || base.role !== 'asset') {
      throw invalidPayload('Resource Browser Asset kind or role is invalid.');
    }
    return {
      ...base,
      source,
      kind: base.kind,
      role: base.role,
      assetRef: parseResourceBrowserAssetRef(record['assetRef']),
      availability: requireResourceAvailability(record['availability']),
    };
  }
  if (base.role === 'asset') {
    throw invalidPayload('Resource Browser content item role is invalid.');
  }
  if (base.role === 'library-root') {
    if (
      source !== 'media' ||
      base.kind !== 'directory' ||
      !base.libraryName ||
      !base.libraryStatus ||
      record['locator'] !== undefined
    ) {
      throw invalidPayload('Resource Browser Media Library root is invalid.');
    }
    if (base.libraryStatus.libraryName !== base.libraryName) {
      throw invalidPayload('Resource Browser Media Library status identity does not match.');
    }
    return {
      ...base,
      source,
      kind: base.kind,
      role: base.role,
      libraryName: base.libraryName,
      libraryStatus: base.libraryStatus,
    };
  }
  if (base.libraryStatus) {
    throw invalidPayload('Resource Browser Media Library status requires a library root.');
  }
  if (base.role !== 'directory' && base.role !== 'content') {
    throw invalidPayload('Resource Browser content role is invalid.');
  }
  return {
    ...base,
    source,
    role: base.role,
    locator: requireContentLocator(record['locator'], 'locator'),
  };
}

function parseResourceBrowserAssetRef(value: unknown): { readonly assetId: string } {
  const record = requireRecord(value, 'Resource Browser Asset identity is required.');
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'assetId') {
    throw invalidPayload('Resource Browser Asset identity contains unsupported fields.');
  }
  return {
    assetId: requireOpaqueIdentity(
      record['assetId'],
      'Resource Browser Asset identity is required.',
    ),
  };
}

function requireResourceAvailability(value: unknown): 'available' | 'unavailable' {
  if (value !== 'available' && value !== 'unavailable') {
    throw invalidPayload('Resource Browser Asset availability is invalid.');
  }
  return value;
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
      sourceFingerprint: requireNonEmptyString(
        record['sourceFingerprint'],
        'Resource Browser thumbnail source fingerprint is required.',
      ),
      mediaType: requireNonEmptyString(
        record['mediaType'],
        'Resource Browser thumbnail media type is required.',
      ),
    },
  };
}

function readOptionalLibraryStatus(value: unknown): {
  readonly libraryStatus?: ResourceBrowserMediaLibraryStatus;
} {
  return value === undefined
    ? {}
    : { libraryStatus: parseResourceBrowserMediaLibraryStatus(value) };
}

function parseResourceBrowserMediaLibraryStatus(value: unknown): ResourceBrowserMediaLibraryStatus {
  const record = requireRecord(value, 'Resource Browser Media Library status is invalid.');
  requireOnlyKeys(record, [
    'libraryName',
    'state',
    'referenceCount',
    'missingCount',
    'operationFingerprint',
    'diagnostic',
  ]);
  const state = record['state'];
  if (
    state !== 'available' &&
    state !== 'required-unlinked' &&
    state !== 'connection-missing' &&
    state !== 'target-unavailable' &&
    state !== 'content-incomplete' &&
    state !== 'binding-invalid' &&
    state !== 'entry-conflict' &&
    state !== 'unreferenced-local-binding'
  ) {
    throw invalidPayload('Resource Browser Media Library state is invalid.');
  }
  const diagnostic =
    record['diagnostic'] === undefined
      ? undefined
      : parseResourceBrowserMediaLibraryDiagnostic(record['diagnostic']);
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
    operationFingerprint: requireOpaqueIdentity(
      record['operationFingerprint'],
      'Resource Browser Media Library operation revision is required.',
    ),
    ...(diagnostic ? { diagnostic } : {}),
  };
}

function parseResourceBrowserMediaLibraryDiagnostic(
  value: unknown,
): NonNullable<ResourceBrowserMediaLibraryStatus['diagnostic']> {
  const record = requireRecord(value, 'Resource Browser Media Library diagnostic is invalid.');
  requireOnlyKeys(record, ['code', 'severity', 'message', 'missingCount']);
  const code = record['code'];
  const allowedCodes = new Set([
    'required-unlinked',
    'target-unavailable',
    'content-incomplete',
    'entry-conflict',
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
    code: code as NonNullable<ResourceBrowserMediaLibraryStatus['diagnostic']>['code'],
    severity,
    message,
    ...(missingCount === undefined ? {} : { missingCount }),
  };
}

function parseWorkspaceMediaLibraryRecoveryPlan(
  value: unknown,
): ResourceBrowserMediaLibraryRecoveryPlan {
  const record = requireRecord(value, 'Resource Browser Media Library recovery plan is invalid.');
  requireOnlyKeys(record, [
    'planId',
    'workspaceId',
    'libraryName',
    'requirementFingerprint',
    'operationFingerprint',
    'candidate',
    'referencedCount',
    'validatedCount',
  ]);
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
    requirementFingerprint: requireFingerprint(
      record['requirementFingerprint'],
      'Resource Browser Media Library requirement revision is required.',
    ),
    operationFingerprint: requireOpaqueIdentity(
      record['operationFingerprint'],
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

function requireContentLocator(value: unknown, field: string): ContentLocator {
  const result = validateContentLocator(value);
  if (!result.ok) {
    throw invalidPayload(`Resource Browser ${field} is not a valid portable ContentLocator.`);
  }
  return result.locator;
}

function requireSource(value: unknown): ResourceBrowserSource {
  if (value !== 'files' && value !== 'media' && value !== 'assets') {
    throw invalidPayload('Resource Browser source is invalid.');
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
    'asset',
  ];
  const match = allowed.find((candidate) => candidate === value);
  if (!match) {
    throw invalidPayload('Resource Browser item kind is invalid.');
  }
  return match;
}

function requireItemRole(value: unknown): 'directory' | 'library-root' | 'content' | 'asset' {
  if (
    value !== 'directory' &&
    value !== 'library-root' &&
    value !== 'content' &&
    value !== 'asset'
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
  if (!isPortablePathSegment(name)) throw invalidPayload(message);
  return name;
}

function requireCapability(value: unknown): ResourceBrowserCapability {
  const allowed: readonly ResourceBrowserCapability[] = [
    'preview',
    'edit-text',
    'open-creative-document',
    'add-to-cut',
    'reveal',
    'add-to-canvas',
  ];
  const match = allowed.find((candidate) => candidate === value);
  if (!match) {
    throw invalidPayload('Resource Browser item capability is invalid.');
  }
  return match;
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

function requireFingerprint(value: unknown, message: string): string {
  const fingerprint = requireNonEmptyString(value, message);
  assertNoPathLikeValue(fingerprint, 'Resource Browser fingerprint');
  return fingerprint;
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
