import {
  isCreativeEntityKind,
  validateContentLocator,
  type ContentLocator,
  type CreativeEntityKind,
} from '@neko/shared';

export const RESOURCE_BROWSER_CONTRACT_VERSION = 4 as const;

export const RESOURCE_BROWSER_ROUTES = {
  snapshotGet: 'snapshot.get',
  children: 'children',
  thumbnailResolve: 'thumbnail.resolve',
  search: 'search',
  refresh: 'refresh',
  addSource: 'source.add',
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
export type ResourceBrowserFacet = 'all' | 'files' | 'media' | 'entities';
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
}

export interface ResourceBrowserContentItem extends ResourceBrowserItemBase {
  readonly facet: 'files' | 'media';
  readonly locator: ContentLocator;
}

export interface ResourceBrowserEntityItem extends ResourceBrowserItemBase {
  readonly facet: 'entities';
  readonly entityRef: ResourceBrowserEntityRef;
  readonly entityStatus: 'confirmed';
  readonly representationAvailability: 'active' | 'unbound';
  readonly representationLocator?: ContentLocator;
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

export interface ResourceBrowserIntentRequest extends ResourceBrowserRequest {
  readonly route:
    | typeof RESOURCE_BROWSER_ROUTES.refresh
    | typeof RESOURCE_BROWSER_ROUTES.addSource
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
    route !== RESOURCE_BROWSER_ROUTES.addSource &&
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
    route === RESOURCE_BROWSER_ROUTES.addSource ||
    route === RESOURCE_BROWSER_ROUTES.relinkSource ||
    route === RESOURCE_BROWSER_ROUTES.removeSource
      ? requireNonNegativeInteger(
          record['expectedRevision'],
          'Resource Browser source mutation revision must be a non-negative integer.',
        )
      : undefined;
  if (route === RESOURCE_BROWSER_ROUTES.addSource) {
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
  if (facet !== 'all' && items.some((item) => item.facet !== facet)) {
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
  };
  if (facet === 'entities') {
    const entityRef = parseResourceBrowserEntityRef(record['entityRef']);
    if (base.kind !== entityRef.entityKind) {
      throw invalidPayload('Resource Browser Entity kind does not match its Entity identity.');
    }
    if (base.role !== 'entity') {
      throw invalidPayload('Resource Browser Entity item role is invalid.');
    }
    return {
      ...base,
      facet,
      entityRef,
      entityStatus: requireConfirmedEntityStatus(record['entityStatus']),
      representationAvailability: requireRepresentationAvailability(
        record['representationAvailability'],
      ),
      ...readOptionalLocator(record['representationLocator'], 'representationLocator'),
    };
  }
  if (facet === 'all') {
    throw invalidPayload('Resource Browser items must belong to a concrete facet.');
  }
  if (base.role === 'entity') {
    throw invalidPayload('Resource Browser content item role is invalid.');
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

function readOptionalLocator(
  value: unknown,
  field: string,
): { readonly representationLocator?: ContentLocator } {
  return value === undefined ? {} : { representationLocator: requireContentLocator(value, field) };
}

function requireContentLocator(value: unknown, field: string): ContentLocator {
  const result = validateContentLocator(value);
  if (!result.ok) {
    throw invalidPayload(`Resource Browser ${field} is not a valid portable ContentLocator.`);
  }
  return result.locator;
}

function requireFacet(value: unknown): ResourceBrowserFacet {
  if (value !== 'all' && value !== 'files' && value !== 'media' && value !== 'entities') {
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
        libraryName: requireNonEmptyString(value, 'Resource Browser library name is invalid.'),
      };
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
