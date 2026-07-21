/**
 * Canvas Editor Provider - Custom editor for .nkc files
 *
 * Supports inline media playback via MediaPlaybackService
 * from @neko/neko-client (direct engine connection).
 */
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'path';
import { buildFountainScriptIndex } from '@neko/content';
import {
  createDocumentResourceRefFromArchiveRef,
  createHostContentAccessRuntime,
  createFocusedWebviewRegistry,
  DocumentResourceCacheProvider,
  GeneratedAssetDerivativeResourceCacheProvider,
  PreviewVariantResourceCacheProvider,
  ThumbnailResourceCacheProvider,
  createVSCodeWorkspaceMediaPathContext,
  createProjectSnapshotPackage,
  createVSCodeProjectFileIoAdapter,
  hasWebviewKeyboardEditableOwner,
  injectLocaleAttribute,
  ProjectFileSaveSession,
  contractHostContentMediaPath,
  requestWebviewProjectSnapshot,
  createVSCodeProjectSourceAddRequest,
  normalizeVSCodeProjectSourceAddRequest,
  resolveNekoExtension,
  resolveHostContentMediaPath,
  resolveGeneratedAssetResourceRef,
  updateWebviewKeyboardEditableOwner,
  type IFocusedWebviewRegistry,
  type ContentAccessService,
  type LocalResourceAccessService,
  type PreviewVariantResourceApi,
  type ResourceCacheProvider,
  type ResourceCacheService,
} from '@neko/shared/vscode/extension';
import type { NodeWorkspaceResourceCacheMetadataBinding } from '@neko/shared';
import {
  buildStoryboardImportTimelineSyncPayload,
  createCanvasStoryboardExecutionSummary,
  getPanoramicPreviewRoute,
  inferCanvasDocumentType,
  inferCanvasDroppedAssetKind,
  inferCanvasMediaType,
  inferCanvasModelType,
  inferCanvasTextFileFormat,
  inferNkProjectType,
  isDocumentArchiveResourceRef,
  isResourceRef,
  isDocumentResourceStatusReason,
  isCanvasNodeType,
  isProjectedCanvasData,
  isProjectedCanvasSource,
  createDefaultProjectFormatCodecRegistry,
  ingestProjectSourceAddRequest,
  nkcSourcePathPolicy,
  ProjectFileStore,
  projectCanvasPlaybackRouteToCutDraft,
  createProjectionAdapterRegistry,
  NEKO_EXTENSION_IDS,
  isNekoAssetsAPI,
  isNekoCutAPI,
  normalizeNarrativePreviewFeatureToggles,
  PathResolver,
  resolveEffectiveCanvasPlaybackRoutes,
  contractWorkspaceMediaPath,
  createProjectFileDiagnostic,
  handleProjectSourceAddRequest,
  handleProjectSourceAddHostRequest,
  postProjectSourceAddResult,
  createWorkspaceMediaPathCandidates,
  type ProjectSourceAddRequest,
  type ProjectSourceAddResult,
  resolveWorkspaceMediaPath,
  summarizeCanvasSubsystems,
  resolveStorageLayout,
  validateCanvasStoryboardActionIntent,
  validateCanvasBoardRef,
  isCanvasCreativeAiActionId,
  isCanvasStoryboardPromptState,
  isCanvasTextDocumentReadRequest,
  createCreativeAiDiagnostic,
} from '@neko/shared';
import type {
  CanvasCreativeAiActionId,
  CanvasCutDraftPayload,
  CutCanvasDraftImportResult,
  CanvasPlaybackPlan,
  CanvasPlaybackRouteCandidate,
  CanvasPlaybackUnit,
  CanvasPlaybackCreateCutDraftRequest,
  CanvasPlaybackReorderUnitsRequest,
  CanvasPlaybackReorderUnitsResult,
  NekoCutAPI,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasCreateConnectionRequest,
  CanvasCreateConnectionResult,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasData,
  CanvasBoardSummary,
  CanvasBoardRef,
  CanvasCreativeScope,
  CanvasNode,
  CanvasNodeType,
  ContentAccessRequest,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
  CanvasTimelineSyncPayload,
  CreativeEntityChangedRef,
  CanvasStoryboardExecutionSummary,
  CanvasStoryboardExecutionSummaryRequest,
  CanvasStoryboardActionIntent,
  CanvasStoryboardPayload,
  CanvasRelatedBoardRef,
  CreatedCanvasStoryboard,
  ExternalCreativeAiInvocation,
  CreativeAiDiagnostic,
  CanvasAgentActiveContextRequest,
  CanvasAgentActiveContextResult,
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasImportAssetRequest,
  CanvasImportAssetResult,
  CanvasHostAppliedDocumentMessage,
  DocumentResourceStatusReason,
  DocumentArchiveResourceRef,
  ProjectionAdapter,
  ProjectionAdapterRegistry,
  ProjectionDisposable,
  ProjectionSourceChangeEvent,
  ProjectionWriteBack,
  ProjectionWriteBackResult,
  ProjectedCanvasData,
  ProjectedCanvasSource,
  ProjectFileDiagnostic,
  ProjectFileSaveReason,
  NekoAssetsAPI,
  FountainScriptIndex,
  NarrativePreviewFeatureToggles,
  ResourceRef,
  ResourceVariantRole,
  ScriptScene,
  NarrativeGraphSnapshot,
  PreviewToCanvasMessage,
  CanvasTextDocumentReadResult,
} from '@neko/shared';
import type { CanvasChangeEvent, ShapeConfig } from '../api';
import type { CanvasOutlineProvider, CanvasOutlineData } from '../views/canvasOutlineProvider';
import type { CanvasStatusBar } from '../views/canvasStatusBar';
import { EngineClient, MediaPlaybackService } from '@neko/neko-client';
import type { PlaybackHandle, PlaybackMediaType } from '@neko/neko-client';
import { getLogger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';
import { createCanvasDocumentEntryReader } from '../services/documentEntryReader';
import { readCanvasTextDocumentProjection } from '../services/textDocumentProjection';
import { resolveCanvasPickerAssetKind } from '../services/canvasSourceSelection';
import {
  createCanvasPlaybackPlanFromCanvasData,
  createNarrativeGraphSnapshotFromCanvasData,
  NarrativePreviewBridge,
} from './narrativePreviewBridge';
import { handleCanvasEntityRoute, isCanvasEntityRouteMessage } from './canvasEntityRoutes';
import {
  applyCandidateEntityBackfill,
  mergePendingCandidateEntityBackfill,
  type CanvasEntityBackfillDiagnostic,
  type CanvasEntityPendingBackfill,
} from './canvasEntityBackfill';
import {
  CanvasCreativeAiApplyAdapter,
  buildCanvasCreativeActionExternalInvocation,
  CANVAS_CREATIVE_AI_INVOKE_EXTERNAL_COMMAND,
  createCanvasDocumentRevision,
  type CanvasCreativeAiHostInvocationResult,
  type CanvasCreativeAiDocumentIdentity,
} from '../creativeAiCanvasAdapter';

const logger = getLogger('CanvasEditorProvider');
const CANVAS_KEYBOARD_OWNER_PREFIX = 'neko.canvasEditor:';
const CONTENT_ACCESS_WEBVIEW_RESOLVER_TOKEN_METADATA_KEY = 'webviewResolverToken';
const PREVIEW_RESOURCE_VARIANT_TIMEOUT_MS = 4500;
const CANVAS_PREVIEW_SEMANTIC_FINGERPRINT_KEYS = [
  'name',
  'nodes',
  'connections',
  'narrative',
  'projectionStatus',
] as const;
const CANVAS_EDITOR_LEVEL_KEYBOARD_ACTIONS = new Set([
  'deleteSelected',
  'escape',
  'selectAll',
  'undo',
  'redo',
  'copy',
  'cut',
  'paste',
  'pasteInPlace',
  'duplicate',
  'resetZoom',
  'generateSelected',
]);

type CanvasHeadlessAssetImporter = (
  asset: CanvasImportAssetRequest,
) => Promise<CanvasImportAssetResult>;

type CanvasPlaybackPreviewSourceKind =
  'generated-image' | 'generated-media' | 'reference-image' | 'source-media' | 'media-asset';

interface CanvasPlaybackPreviewSourceProjection {
  readonly url: string;
  readonly kind: CanvasPlaybackPreviewSourceKind;
  readonly label?: string;
  readonly mediaType?: string;
  readonly refId?: string;
  readonly source?: CanvasPlaybackPreviewSourceCandidate;
  readonly playableAssetPath?: string;
}

interface CanvasPlaybackPreviewSourceCandidate {
  readonly source?: string;
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
}

interface CanvasPlaybackPreviewSourceResolution {
  readonly url: string;
  readonly source: CanvasPlaybackPreviewSourceCandidate;
  readonly playableAssetPath?: string;
}

interface PreviewResourceVariantRequestContext {
  readonly requestId?: string;
  readonly sourceId?: string;
}

interface CanvasPlaybackWorkspaceRevealRequest {
  readonly sourceCanvasUri?: string;
  readonly routeId?: string;
  readonly unitId?: string;
}

function isCanvasEditorLevelKeyboardAction(action: string): boolean {
  return CANVAS_EDITOR_LEVEL_KEYBOARD_ACTIONS.has(action);
}

function readPlaybackMediaType(value: unknown): PlaybackMediaType {
  return value === 'video' || value === 'audio' ? value : 'auto';
}

function isWorkspaceScopedVariablePath(value: string): boolean {
  return (
    value === '${WORKSPACE}' ||
    value.startsWith('${WORKSPACE}/') ||
    value === '${PROJECT}' ||
    value.startsWith('${PROJECT}/')
  );
}

function createWorkspacePathResolver(workspaceRoot: string): PathResolver {
  return new PathResolver(
    new Map([
      ['WORKSPACE', workspaceRoot],
      ['PROJECT', workspaceRoot],
    ]),
  );
}

function requestCanvasProjectSnapshot(
  webview: Pick<vscode.Webview, 'postMessage' | 'onDidReceiveMessage'>,
  saveReason: ProjectFileSaveReason,
): Promise<CanvasData> {
  return requestWebviewProjectSnapshot<CanvasData>(webview, {
    formatId: 'nkc',
    saveReason,
  });
}

function assertCanvasNodeType(type: CanvasNodeType | undefined): void {
  if (type !== undefined && !isCanvasNodeType(type)) {
    throw new Error(`Unsupported Canvas node type "${type}"`);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanvasDataSnapshot(value: Record<string, unknown>): value is CanvasData {
  return (
    typeof value['version'] === 'string' &&
    typeof value['name'] === 'string' &&
    Array.isArray(value['nodes']) &&
    Array.isArray(value['connections'])
  );
}

function normalizeCanvasAssetPreviewBindings(value: unknown, bindingPath: string): void {
  if (Array.isArray(value)) {
    value.forEach((item) => normalizeCanvasAssetPreviewBindings(item, bindingPath));
    return;
  }
  if (!isPlainRecord(value)) return;

  if (value['kind'] === 'asset-preview') {
    const binding = value['binding'];
    if (isPlainRecord(binding)) {
      value['binding'] = { ...binding, path: bindingPath };
    }
  }

  const assetBinding = value['assetBinding'];
  if (isPlainRecord(assetBinding)) {
    value['assetBinding'] = { ...assetBinding, path: bindingPath };
  }

  for (const child of Object.values(value)) {
    normalizeCanvasAssetPreviewBindings(child, bindingPath);
  }
}

function createCanvasPreviewSemanticFingerprint(canvasData: Record<string, unknown>): string {
  const previewState: Record<string, unknown> = {};
  for (const key of CANVAS_PREVIEW_SEMANTIC_FINGERPRINT_KEYS) {
    previewState[key] = canvasData[key];
  }
  return stableCanvasPreviewStringify(previewState);
}

function stableCanvasPreviewStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableCanvasPreviewStringify(item)).join(',')}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, entryValue]) => `${JSON.stringify(key)}:${stableCanvasPreviewStringify(entryValue)}`,
    )
    .join(',')}}`;
}

function resolveCanvasPreviewVariantRole(
  resourceRef: ResourceRef,
  preferredRole: ResourceVariantRole | undefined,
): ResourceVariantRole {
  if (resourceRef.kind === 'document' || resourceRef.source.kind === 'document') {
    return preferredRole === 'source' || preferredRole === 'page-image'
      ? 'page-image'
      : 'document-entry';
  }
  if (resourceRef.kind === 'generated' || resourceRef.source.kind === 'generated-asset') {
    return preferredRole === 'source' ||
      preferredRole === 'thumbnail' ||
      preferredRole === 'preview'
      ? preferredRole
      : 'preview';
  }
  if (resourceRef.kind === 'media') {
    return preferredRole === 'source' ||
      preferredRole === 'thumbnail' ||
      preferredRole === 'proxy' ||
      preferredRole === 'fov-crop'
      ? preferredRole
      : 'thumbnail';
  }
  if (resourceRef.kind === 'preview') {
    return preferredRole === 'source' ||
      preferredRole === 'thumbnail' ||
      preferredRole === 'preview' ||
      preferredRole === 'proxy' ||
      preferredRole === 'fov-crop'
      ? preferredRole
      : 'preview';
  }
  return preferredRole ?? 'thumbnail';
}

function isWebviewOrRemoteUri(value: string): boolean {
  return /^(vscode-webview-resource:|vscode-resource:|webview:|https?:|data:|blob:)/i.test(value);
}

function readCanvasSubsystemSummary(
  canvasData: Record<string, unknown>,
  nodes: readonly unknown[],
): string | undefined {
  const reportedStatus = canvasData._subsystemStatus;
  if (
    reportedStatus &&
    typeof reportedStatus === 'object' &&
    !Array.isArray(reportedStatus) &&
    Array.isArray((reportedStatus as { activeSubsystems?: unknown }).activeSubsystems)
  ) {
    const activeSubsystems = (
      reportedStatus as { activeSubsystems: readonly unknown[] }
    ).activeSubsystems.filter((item): item is string => typeof item === 'string');
    return activeSubsystems.length > 0 ? activeSubsystems.join(', ') : undefined;
  }

  const structurallyTypedNodes = nodes.filter(
    (node): node is CanvasNode =>
      typeof node === 'object' &&
      node !== null &&
      !Array.isArray(node) &&
      typeof (node as { type?: unknown }).type === 'string' &&
      isCanvasNodeType((node as { type: string }).type),
  );
  const summary = summarizeCanvasSubsystems({ nodes: structurallyTypedNodes });
  return summary.activeSubsystems.length > 0 ? summary.activeSubsystems.join(', ') : undefined;
}

function readCanvasProjectionSummary(canvasData: Record<string, unknown>): string | undefined {
  const projectionStatus = canvasData.projectionStatus;
  if (
    !projectionStatus ||
    typeof projectionStatus !== 'object' ||
    Array.isArray(projectionStatus)
  ) {
    return undefined;
  }
  const status = projectionStatus as { state?: unknown; message?: unknown };
  if (typeof status.state !== 'string' || status.state.length === 0) {
    return undefined;
  }

  return typeof status.message === 'string' && status.message.length > 0
    ? `Projected: ${status.state} - ${status.message}`
    : `Projected: ${status.state}`;
}

function readCanvasBoardSummaryInput(canvasData: Record<string, unknown> | undefined): {
  readonly boardSummary?: CanvasBoardSummary;
  readonly creativeScope?: CanvasCreativeScope;
  readonly relatedBoards?: readonly CanvasRelatedBoardRef[];
} {
  if (!canvasData) return {};
  const creativeScope = isCanvasCreativeScopeLike(canvasData['creativeScope'])
    ? (canvasData['creativeScope'] as CanvasCreativeScope)
    : undefined;
  const relatedBoards = Array.isArray(canvasData['relatedBoards'])
    ? (canvasData['relatedBoards'].filter(isCanvasRelatedBoardRefLike) as CanvasRelatedBoardRef[])
    : undefined;
  if (!creativeScope && !relatedBoards) return {};
  const nodes = Array.isArray(canvasData['nodes']) ? canvasData['nodes'] : [];
  const nodeTypeSummary: Record<string, number> = {};
  for (const node of nodes) {
    if (
      typeof node === 'object' &&
      node !== null &&
      !Array.isArray(node) &&
      typeof (node as { type?: unknown }).type === 'string'
    ) {
      const type = (node as { type: string }).type;
      nodeTypeSummary[type] = (nodeTypeSummary[type] ?? 0) + 1;
    }
  }
  const boardSummary: CanvasBoardSummary = {
    name: typeof canvasData['name'] === 'string' ? canvasData['name'] : 'Untitled Canvas',
    ...(creativeScope ? { scope: creativeScope } : {}),
    ...(relatedBoards ? { relatedBoards } : {}),
    ...(Object.keys(nodeTypeSummary).length > 0 ? { nodeTypeSummary } : {}),
  };
  return {
    boardSummary,
    ...(creativeScope ? { creativeScope } : {}),
    ...(relatedBoards ? { relatedBoards } : {}),
  };
}

function isCanvasCreativeScopeLike(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { kind?: unknown }).kind === 'string'
  );
}

function isCanvasRelatedBoardRefLike(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { role?: unknown }).role === 'string' &&
    typeof (value as { ref?: unknown }).ref === 'object' &&
    (value as { ref?: unknown }).ref !== null
  );
}

function readCanvasBoardRef(value: unknown): CanvasBoardRef | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  switch (record['kind']) {
    case 'workspace-path':
      return typeof record['path'] === 'string'
        ? { kind: 'workspace-path', path: record['path'] }
        : undefined;
    case 'uri':
      return typeof record['uri'] === 'string' ? { kind: 'uri', uri: record['uri'] } : undefined;
    case 'resource':
      return isResourceRef(record['resourceRef'])
        ? { kind: 'resource', resourceRef: record['resourceRef'] }
        : undefined;
    case 'project':
      return typeof record['projectId'] === 'string'
        ? {
            kind: 'project',
            projectId: record['projectId'],
            ...(typeof record['canvasId'] === 'string' ? { canvasId: record['canvasId'] } : {}),
          }
        : undefined;
    default:
      return undefined;
  }
}

function isUnsafeCanvasBoardUri(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length === 0 ||
    /^vscode-webview:\/\//i.test(trimmed) ||
    /^vscode-resource:\/\//i.test(trimmed) ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed) ||
    /^file:\/\//i.test(trimmed)
  );
}

function findOpenCanvasDocumentUriByProjectRef(
  ref: Extract<CanvasBoardRef, { kind: 'project' }>,
  snapshots: ReadonlyMap<string, Record<string, unknown>>,
): vscode.Uri | undefined {
  for (const [documentUri, canvasData] of snapshots.entries()) {
    const canvasId = typeof canvasData['id'] === 'string' ? canvasData['id'] : undefined;
    const scope = isCanvasCreativeScopeLike(canvasData['creativeScope'])
      ? (canvasData['creativeScope'] as CanvasCreativeScope)
      : undefined;
    if (ref.canvasId && ref.canvasId !== canvasId && ref.canvasId !== scope?.workId) {
      continue;
    }
    if (scope?.projectId === ref.projectId || (!scope && ref.canvasId === canvasId)) {
      return vscode.Uri.parse(documentUri);
    }
  }
  return undefined;
}

function createProjectionSourceKey(source: ProjectedCanvasSource): string {
  return `${source.kind}:${source.uri}`;
}

function hashProjectionSource(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

function readCanvasNodeContainerChildIds(node: Record<string, unknown>): string[] {
  const container = node.container;
  if (typeof container !== 'object' || container === null || Array.isArray(container)) {
    return [];
  }

  const childIds = (container as { childIds?: unknown }).childIds;
  return Array.isArray(childIds)
    ? childIds.filter((childId): childId is string => typeof childId === 'string')
    : [];
}

function mapStoryScriptIndexToCanvasScenes(index: FountainScriptIndex | undefined): ScriptScene[] {
  if (!index) {
    return [];
  }

  return Array.from(index.scenes, (scene) => ({
    id: scene.sceneId,
    title: scene.sceneTitle || scene.heading,
    lineStart: scene.line_start,
    lineEnd: scene.line_end,
  }));
}

function mapOperationToCanvasChangeEvent(operation: {
  type?: string;
  payload?: Record<string, unknown>;
}): CanvasChangeEvent {
  const opType = operation.type ?? 'unknown';
  const payload = operation.payload ?? {};
  const payloadNode = payload['node'];
  const payloadGroupNode = payload['groupNode'];
  const nodeId =
    typeof payload['nodeId'] === 'string'
      ? payload['nodeId']
      : typeof payloadNode === 'object' &&
          payloadNode !== null &&
          typeof (payloadNode as { id?: unknown }).id === 'string'
        ? (payloadNode as { id: string }).id
        : typeof payloadGroupNode === 'object' &&
            payloadGroupNode !== null &&
            typeof (payloadGroupNode as { id?: unknown }).id === 'string'
          ? (payloadGroupNode as { id: string }).id
          : undefined;
  const nodeIds = Array.isArray(payload['childIds'])
    ? (payload['childIds'] as unknown[]).filter(
        (value): value is string => typeof value === 'string',
      )
    : nodeId
      ? [nodeId]
      : undefined;

  return {
    type: opType.includes('.add')
      ? 'add'
      : opType.includes('.remove') || opType.includes('.ungroup')
        ? 'delete'
        : 'update',
    nodeId,
    nodeIds,
    entityType: opType.startsWith('canvas.connection')
      ? 'connection'
      : opType.startsWith('canvas.node')
        ? 'node'
        : 'operation',
    reason: 'operationApplied',
    operationType: opType,
  };
}

interface NekoPreviewVariantAPI {
  registerPreviewAsset(request: {
    source: string;
    kind?: 'image' | 'video' | 'audio' | 'document' | 'unknown';
    expectedProjection?: 'flat' | 'equirectangular' | 'cubemap' | 'fisheye' | 'unknown';
    explicitOpen?: boolean;
  }): ReturnType<PreviewVariantResourceApi['registerPreviewAsset']>;
  requestPreviewVariant(
    assetId: string,
    request: {
      role: 'thumbnail' | 'proxy' | 'fov-crop';
      width?: number;
      height?: number;
      format?: 'jpeg' | 'png' | 'webp';
    },
  ): Promise<{ url?: string }>;
  unregisterPreviewAsset(assetIdOrToken: string): Promise<void>;
}

function isPreviewVariantAPI(api: unknown): api is NekoPreviewVariantAPI {
  const candidate = api as Partial<NekoPreviewVariantAPI> | null;
  return (
    typeof candidate?.registerPreviewAsset === 'function' &&
    typeof candidate.requestPreviewVariant === 'function' &&
    typeof candidate.unregisterPreviewAsset === 'function'
  );
}

export interface CanvasDocumentLifecycleEvent {
  readonly type: 'opened' | 'ready' | 'dirty' | 'saved' | 'reverted' | 'closed';
  readonly documentUri: string;
}

export class CanvasEditorProvider implements vscode.CustomEditorProvider<vscode.CustomDocument> {
  public static readonly viewType = 'neko.canvasEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentContentChangeEvent<vscode.CustomDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private readonly _onDidChangeCanvas = new vscode.EventEmitter<CanvasChangeEvent>();
  public readonly onDidChangeCanvas = this._onDidChangeCanvas.event;

  private readonly _onDidChangeDocumentLifecycle =
    new vscode.EventEmitter<CanvasDocumentLifecycleEvent>();
  public readonly onDidChangeDocumentLifecycle = this._onDidChangeDocumentLifecycle.event;

  private readonly _onSelectionChange = new vscode.EventEmitter<CanvasNode[]>();
  public readonly onSelectionChange = this._onSelectionChange.event;

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private activeDocument: vscode.CustomDocument | undefined;
  private readonly webviewPanelsByDocumentUri = new Map<string, vscode.WebviewPanel>();
  private readonly documentsByDocumentUri = new Map<string, vscode.CustomDocument>();
  private readonly canvasSnapshotsByDocumentUri = new Map<string, Record<string, unknown>>();
  private readonly canvasRevisionsByDocumentUri = new Map<string, number>();
  private readonly dirtyCanvasDocumentUris = new Set<string>();
  private readonly canvasPreviewFingerprintsByDocumentUri = new Map<string, string>();
  private readonly canvasDataReadyDocumentUris = new Set<string>();
  private pendingEntityBackfills: CanvasEntityPendingBackfill[] = [];
  private readonly narrativePreviewBridge: NarrativePreviewBridge;

  // External providers for VSCode integration
  private outlineProvider: CanvasOutlineProvider | undefined;
  private statusBar: CanvasStatusBar | undefined;

  // Direct media playback via neko-client (no cross-extension dependency)
  private _engineClient: EngineClient | null = null;
  private _mediaPlayback: MediaPlaybackService | null = null;
  // Track active streams per panel for cleanup
  private _activeStreams = new Map<vscode.WebviewPanel, Map<string, PlaybackHandle>>();
  private readonly localResourceAccess: LocalResourceAccessService;
  private readonly resourceCache: ResourceCacheService | undefined;
  private readonly contentAccess: ContentAccessService | undefined;
  private readonly contentAccessWebviewsByToken = new Map<string, vscode.Webview>();
  private contentAccessWebviewResolverSequence = 0;
  private readonly projectionAdapters: ProjectionAdapterRegistry =
    createProjectionAdapterRegistry();
  private readonly projectionSubscriptions = new Map<string, ProjectionDisposable>();
  private readonly focusedWebviews: IFocusedWebviewRegistry;
  private readonly projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  private readonly projectFileStore = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: this.projectFileAdapter.fileOps,
    logger,
  });
  private readonly projectFileSession = new ProjectFileSaveSession<CanvasData>({
    formatId: 'nkc',
    store: this.projectFileStore,
    sourcePolicy: nkcSourcePathPolicy,
    createSourcePolicyOptions: (uri) => ({
      context: this.createCanvasProjectFileContext(uri),
    }),
    logger,
  });
  private headlessAssetImporter: CanvasHeadlessAssetImporter | undefined;
  private creativeAiApplyAdapter: CanvasCreativeAiApplyAdapter | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    focusedWebviews: IFocusedWebviewRegistry = createFocusedWebviewRegistry(),
    getNarrativePreviewFeatureToggles: () => NarrativePreviewFeatureToggles = () =>
      normalizeNarrativePreviewFeatureToggles(undefined),
    private readonly resourceCacheMetadata?: Pick<
      NodeWorkspaceResourceCacheMetadataBinding,
      'manifestStore' | 'dispose'
    >,
  ) {
    this.focusedWebviews = focusedWebviews;
    this.narrativePreviewBridge = new NarrativePreviewBridge(this, {
      getFeatureToggles: getNarrativePreviewFeatureToggles,
      getMediaRuntimeScriptUri: () =>
        vscode.Uri.joinPath(
          this.context.extensionUri,
          'dist',
          'webview',
          'assets',
          'narrative-preview-media-runtime.js',
        ),
      getWebviewOptions: (sourceCanvasUri?: string) => ({
        localResourceRoots: [...this.getNarrativePreviewLocalResourceRoots(sourceCanvasUri)],
      }),
    });
    const contentRuntime = this.createCanvasContentAccessRuntime(context);
    this.localResourceAccess = contentRuntime.localResourceAccess;
    this.resourceCache = contentRuntime.resourceCache;
    this.contentAccess = contentRuntime.contentAccess;
  }

  dispose(): void {
    this.narrativePreviewBridge.dispose();
    for (const subscription of this.projectionSubscriptions.values()) {
      subscription.dispose();
    }
    this.projectionSubscriptions.clear();
    this._onSelectionChange.dispose();
    this._onDidChangeCanvas.dispose();
    this._onDidChangeDocumentLifecycle.dispose();
    this._onDidChangeCustomDocument.dispose();
    void this.resourceCache
      ?.dispose()
      .catch((error) => logger.warn('Failed to dispose Canvas ResourceCache', { error }))
      .finally(() => this.disposeResourceCacheMetadata());
    if (!this.resourceCache) {
      this.disposeResourceCacheMetadata();
    }
  }

  private createCanvasContentAccessRuntime(context: vscode.ExtensionContext): {
    readonly localResourceAccess: LocalResourceAccessService;
    readonly resourceCache?: ResourceCacheService;
    readonly contentAccess: ContentAccessService;
  } {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const layout = workspaceRoot
      ? resolveStorageLayout(workspaceRoot, os.homedir() || workspaceRoot)
      : undefined;
    const manifestStore = this.resourceCacheMetadata?.manifestStore;
    if (workspaceRoot && !manifestStore) {
      throw new Error('Canvas ResourceCache requires the canonical local metadata store.');
    }
    const runtime = createHostContentAccessRuntime({
      extensionUri: context.extensionUri,
      context,
      workspaceRoot,
      resourceCacheOptions:
        workspaceRoot && layout && manifestStore
          ? {
              cacheRoot: layout.project.local.cache.resources,
              manifestStore,
              projectRoot: workspaceRoot,
              providers: this.createCanvasResourceCacheProviders(workspaceRoot),
            }
          : undefined,
      generatedAssetSourceProvider: {
        resolveAsset: async (ref) =>
          resolveGeneratedAssetResourceRef(
            ref,
            createWorkspacePathResolver(workspaceRoot),
            workspaceRoot,
          ),
      },
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
      webviewResolver: (request) => this.resolveContentAccessWebview(request),
      logger,
    });
    if (!runtime.localResourceAccess) {
      throw new Error('Canvas content access runtime requires LocalResourceAccessService.');
    }
    return {
      localResourceAccess: runtime.localResourceAccess,
      ...(runtime.resourceCache ? { resourceCache: runtime.resourceCache } : {}),
      contentAccess: runtime.contentAccess,
    };
  }

  private disposeResourceCacheMetadata(): void {
    void this.resourceCacheMetadata
      ?.dispose()
      .catch((error) => logger.warn('Failed to dispose Canvas metadata store', { error }));
  }

  private createCanvasResourceCacheProviders(
    workspaceRoot: string,
  ): readonly ResourceCacheProvider[] {
    return [
      new GeneratedAssetDerivativeResourceCacheProvider({
        pathResolver: createWorkspacePathResolver(workspaceRoot),
        projectRoot: workspaceRoot,
        generator: {
          generate: async (filePath, request) => {
            const api = await this.getNekoAssetsApi();
            await api?.getThumbnailVisual?.(filePath, {
              role: 'thumbnail',
              width: request.width,
              height: request.height,
              mimeType: 'image/jpeg',
            });
            const thumbnailPath = await api?.getThumbnailPath(filePath);
            if (!thumbnailPath) return undefined;
            return {
              bytes: await fs.promises.readFile(thumbnailPath),
              width: request.width ?? request.height ?? 256,
              height: request.height ?? request.width ?? 256,
              mimeType: 'image/jpeg',
            };
          },
        },
      }),
      new ThumbnailResourceCacheProvider({
        generator: {
          generate: async (filePath, options) => {
            const api = await this.getNekoAssetsApi();
            const visual = await api?.getThumbnailVisual?.(filePath, {
              role: 'thumbnail',
              width: options.maxWidth,
              height: options.maxHeight,
              mimeType: 'image/jpeg',
            });
            const thumbnailPath =
              visual?.projectedUri && !isWebviewOrRemoteUri(visual.projectedUri)
                ? visual.projectedUri
                : await api?.getThumbnailPath(filePath);
            return thumbnailPath
              ? {
                  path: thumbnailPath,
                  width: options.maxWidth,
                  height: options.maxHeight,
                  mimeType: 'image/jpeg',
                }
              : null;
          },
        },
      }),
      new PreviewVariantResourceCacheProvider({
        preview: this.createLazyPreviewVariantResourceApi(),
      }),
      new DocumentResourceCacheProvider({
        entryReader: createCanvasDocumentEntryReader(),
      }),
    ];
  }

  private resolveContentAccessWebview(request: ContentAccessRequest): vscode.Webview | undefined {
    const token = request.metadata?.[CONTENT_ACCESS_WEBVIEW_RESOLVER_TOKEN_METADATA_KEY];
    return typeof token === 'string'
      ? this.contentAccessWebviewsByToken.get(token)
      : this.activeWebviewPanel?.webview;
  }

  private async withContentAccessWebview<T>(
    webview: vscode.Webview,
    operation: (webviewResolverToken: string) => Promise<T>,
  ): Promise<T> {
    this.contentAccessWebviewResolverSequence += 1;
    const webviewResolverToken = `neko-canvas-webview:${Date.now()}:${this.contentAccessWebviewResolverSequence}`;
    this.contentAccessWebviewsByToken.set(webviewResolverToken, webview);
    try {
      return await operation(webviewResolverToken);
    } finally {
      this.contentAccessWebviewsByToken.delete(webviewResolverToken);
    }
  }

  private async getNekoAssetsApi(): Promise<NekoAssetsAPI | null> {
    try {
      const ext = resolveNekoExtension(NEKO_EXTENSION_IDS.NEKO_ASSETS, (id) =>
        vscode.extensions.getExtension(id),
      );
      if (!ext) return null;
      const api = ext.isActive ? ext.exports : await ext.activate();
      return isNekoAssetsAPI(api) ? api : null;
    } catch {
      return null;
    }
  }

  private createLazyPreviewVariantResourceApi(): PreviewVariantResourceApi {
    return {
      registerPreviewAsset: async (request) => {
        const api = await this.getPreviewVariantApi();
        if (!api) throw new Error('Preview variant API not available');
        return api.registerPreviewAsset(request);
      },
      requestPreviewVariant: async (assetId, request) => {
        const api = await this.getPreviewVariantApi();
        if (!api) throw new Error('Preview variant API not available');
        const variant = await api.requestPreviewVariant(assetId, request);
        return {
          id: `${assetId}:${request.role}`,
          assetId,
          role: request.role,
          ...variant,
        };
      },
      unregisterPreviewAsset: async (assetIdOrToken) => {
        const api = await this.getPreviewVariantApi();
        await api?.unregisterPreviewAsset(assetIdOrToken);
      },
    };
  }

  private async getMediaPlayback(): Promise<MediaPlaybackService | null> {
    if (this._mediaPlayback) return this._mediaPlayback;
    try {
      const result = await vscode.commands.executeCommand<{ port: number } | null>(
        'neko.engine.ensureFrameServer',
      );
      if (!result) {
        logger.warn('ensureFrameServer returned null');
        return null;
      }
      this._engineClient = new EngineClient(result.port);
      this._mediaPlayback = new MediaPlaybackService(this._engineClient);
      return this._mediaPlayback;
    } catch (error) {
      logger.error(`Failed to init media playback: ${error}`);
      return null;
    }
  }

  private async getPreviewVariantApi(): Promise<NekoPreviewVariantAPI | null> {
    try {
      const ext = resolveNekoExtension('neko.neko-preview', (id) =>
        vscode.extensions.getExtension(id),
      );
      if (!ext) return null;
      if (!ext.isActive) await ext.activate();
      const api = ext.exports;
      return isPreviewVariantAPI(api) ? api : null;
    } catch {
      return null;
    }
  }

  private async disposeMediaPlaybackPanel(webviewPanel: vscode.WebviewPanel): Promise<void> {
    const panelStreams = this._activeStreams.get(webviewPanel);
    if (!panelStreams || panelStreams.size === 0) return;
    const playback = await this.getMediaPlayback();
    for (const handle of panelStreams.values()) {
      await playback?.stopPlayback(handle).catch(() => {});
    }
    this._activeStreams.delete(webviewPanel);
  }

  /** Wire up external providers after construction */
  setProviders(opts: { outline?: CanvasOutlineProvider; statusBar?: CanvasStatusBar }): void {
    this.outlineProvider = opts.outline;
    this.statusBar = opts.statusBar;
  }

  setCreativeAiApplyAdapter(adapter: CanvasCreativeAiApplyAdapter): void {
    this.creativeAiApplyAdapter = adapter;
  }

  setHeadlessAssetImporter(importer: CanvasHeadlessAssetImporter): void {
    this.headlessAssetImporter = importer;
  }

  private getPanelForWorkspacePath(targetPath: string): vscode.WebviewPanel | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return undefined;
    const documentUri = vscode.Uri.file(
      path.join(workspaceFolder.uri.fsPath, targetPath),
    ).toString();
    return this.webviewPanelsByDocumentUri.get(documentUri);
  }

  private setActiveCanvasEditor(
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): void {
    const documentUri = document.uri.toString();
    this.focusedWebviews.markActive(documentUri);
    this.activeWebviewPanel = webviewPanel;
    this.activeDocument = document;
    this.syncActiveCanvasChrome(documentUri);
    this.statusBar?.show();
  }

  private clearActiveCanvasEditor(webviewPanel: vscode.WebviewPanel): void {
    if (this.activeWebviewPanel !== webviewPanel) {
      return;
    }

    this.activeWebviewPanel = undefined;
    this.activeDocument = undefined;
    this.outlineProvider?.updateData(null);
    this.statusBar?.hide();
  }

  private getWebviewPanelForDocument(
    document: vscode.CustomDocument,
  ): vscode.WebviewPanel | undefined {
    return this.webviewPanelsByDocumentUri.get(document.uri.toString());
  }

  hasActiveCanvasEditorReady(): boolean {
    const documentUri = this.activeDocument?.uri.toString();
    return documentUri !== undefined && this.canvasDataReadyDocumentUris.has(documentUri);
  }

  hasActiveCanvasEditor(): boolean {
    return this.activeWebviewPanel !== undefined && this.activeDocument !== undefined;
  }

  getActiveCanvasDocumentUri(): vscode.Uri | undefined {
    return this.activeDocument?.uri;
  }

  applyHostCanvasData(uri: vscode.Uri, canvasData: CanvasData): void {
    const documentUri = uri.toString();
    const canvasRecord = canvasData as unknown as Record<string, unknown>;
    this.updateRememberedCanvasSnapshot(documentUri, canvasRecord);
    this.dirtyCanvasDocumentUris.delete(documentUri);
    const panel = this.webviewPanelsByDocumentUri.get(documentUri);
    const message: CanvasHostAppliedDocumentMessage = {
      type: 'canvas.hostAppliedDocument',
      documentUri,
      data: canvasData,
      reason: 'headless-authoring',
    };
    panel?.webview.postMessage(message);
    if (this.activeDocument?.uri.toString() === documentUri) {
      this.syncOutline(documentUri, canvasRecord);
      this.syncStatusBar(canvasRecord);
    }
  }

  async revealCanvasDocument(uri: vscode.Uri): Promise<void> {
    const documentUri = uri.toString();
    const panel = this.webviewPanelsByDocumentUri.get(documentUri);
    const document = this.documentsByDocumentUri.get(documentUri);
    if (panel) {
      panel.reveal();
      if (document) {
        this.setActiveCanvasEditor(panel, document);
      }
      return;
    }
    await vscode.commands.executeCommand('vscode.openWith', uri, CanvasEditorProvider.viewType);
  }

  getOpenCanvasDocumentSnapshot(
    documentUri: string,
  ): { readonly canvasData: CanvasData; readonly dirty: boolean } | undefined {
    const snapshot = this.canvasSnapshotsByDocumentUri.get(documentUri);
    if (!snapshot || !isCanvasDataSnapshot(snapshot)) return undefined;
    return {
      canvasData: snapshot,
      dirty: this.dirtyCanvasDocumentUris.has(documentUri),
    };
  }

  async revealPlaybackWorkspace(
    request: CanvasPlaybackWorkspaceRevealRequest = {},
  ): Promise<boolean> {
    const targetDocumentUri = request.sourceCanvasUri ?? this.activeDocument?.uri.toString();
    const targetPanel = targetDocumentUri
      ? this.webviewPanelsByDocumentUri.get(targetDocumentUri)
      : this.activeWebviewPanel;
    if (!targetPanel) {
      return false;
    }

    targetPanel.reveal();
    const targetDocument = targetDocumentUri
      ? this.documentsByDocumentUri.get(targetDocumentUri)
      : this.activeDocument;
    if (targetDocument) {
      this.setActiveCanvasEditor(targetPanel, targetDocument);
    }
    return targetPanel.webview.postMessage({
      type: 'playback:revealWorkspace',
      ...(request.routeId ? { routeId: request.routeId } : {}),
      ...(request.unitId ? { unitId: request.unitId } : {}),
    });
  }

  getPlaybackPlan(sourceCanvasUri?: string): CanvasPlaybackPlan {
    const documentUri = sourceCanvasUri ?? this.activeDocument?.uri.toString();
    if (!documentUri) {
      throw new Error('No active Canvas document for playback plan query.');
    }
    const plan = this.extractCanvasPlaybackPlan(documentUri);
    if (!plan) {
      throw new Error(`Canvas playback plan is unavailable for ${documentUri}.`);
    }
    return this.attachCanvasPlaybackSourceMetadata(plan, documentUri);
  }

  getPlaybackRoutes(sourceCanvasUri?: string): readonly CanvasPlaybackRouteCandidate[] {
    return resolveEffectiveCanvasPlaybackRoutes(this.getPlaybackPlan(sourceCanvasUri)).routes;
  }

  createCutDraftFromRoute(
    request: CanvasPlaybackCreateCutDraftRequest = {},
  ): CanvasCutDraftPayload {
    const documentUri = request.sourceCanvasUri ?? this.activeDocument?.uri.toString();
    if (!documentUri) {
      throw new Error('No active Canvas document for Cut draft creation.');
    }
    const plan = this.getPlaybackPlan(documentUri);
    const sourceRevision = this.getCanvasRevision(documentUri);
    const result = projectCanvasPlaybackRouteToCutDraft({
      plan,
      sourceCanvasUri: documentUri,
      sourceRevision,
      currentSourceRevision: sourceRevision,
      routeId: request.routeId,
      projectName: request.projectName,
      createdAt: new Date().toISOString(),
      allowedExtensionNamespaces: ['neko.canvas'],
    });
    if (!result.ok) {
      throw new Error(
        `Canvas route cannot be projected to Cut draft: ${result.diagnostics
          .map((diagnostic) => diagnostic.message)
          .join('; ')}`,
      );
    }
    return result.payload;
  }

  async reorderPlaybackUnits(
    request: CanvasPlaybackReorderUnitsRequest,
  ): Promise<CanvasPlaybackReorderUnitsResult> {
    if (request.approvalContext === 'agent-inferred') {
      throw new Error('Agent-inferred Canvas playback reorder requires confirmation.');
    }
    if (
      request.approvalContext !== 'explicit-user-instruction' &&
      request.approvalContext !== 'agent-confirmed'
    ) {
      throw new Error(
        'Canvas playback reorder requires explicit user instruction or confirmation.',
      );
    }
    const documentUri = request.sourceCanvasUri ?? this.activeDocument?.uri.toString();
    if (!documentUri) {
      throw new Error('No active Canvas document for playback reorder.');
    }
    if (documentUri !== this.activeDocument?.uri.toString()) {
      throw new Error('Canvas playback reorder requires the target Canvas editor to be active.');
    }
    const plan = this.getPlaybackPlan(documentUri);
    const targetRoute = this.resolvePlaybackRouteForMutation(plan, request.routeId);
    const orderedUnitIds = [...new Set(request.orderedUnitIds)];
    if (
      orderedUnitIds.length !== targetRoute.unitIds.length ||
      orderedUnitIds.some((unitId) => !targetRoute.unitIds.includes(unitId))
    ) {
      throw new Error('Playback reorder must provide the full selected route unit id set.');
    }
    const unitById = new Map(plan.units.map((unit) => [unit.id, unit]));
    const orderedUnits = orderedUnitIds.map((unitId) => unitById.get(unitId));
    if (orderedUnits.some((unit): unit is undefined => unit === undefined)) {
      throw new Error('Playback reorder references a missing Canvas playback unit.');
    }
    const sceneId = this.resolveSingleSceneShotReorderParent(documentUri, orderedUnits);
    if (!sceneId) {
      throw new Error(
        'Canvas playback reorder currently supports only full shot reordering within one Scene container.',
      );
    }
    if (!this.activeWebviewPanel) {
      throw new Error('No active Canvas editor for playback reorder.');
    }
    await this.sendRequest('nodes.reorderSceneShots', {
      payload: {
        sceneId,
        shotIds: orderedUnits.map((unit) => unit.sourceNodeId),
        autoLayout: true,
      },
    });
    this._onDidChangeCanvas.fire({
      type: 'update',
      nodeIds: orderedUnits.map((unit) => unit.sourceNodeId),
      documentUri,
      entityType: 'node',
      reason: 'playbackUnitsReordered',
      operationType: 'playback.reorderUnits',
    });
    return {
      changed: true,
      routeId: targetRoute.id,
      sourceCanvasUri: documentUri,
      orderedUnitIds,
      plan: this.getPlaybackPlan(documentUri),
    };
  }

  private attachCanvasPlaybackSourceMetadata(
    plan: CanvasPlaybackPlan,
    documentUri: string,
  ): CanvasPlaybackPlan {
    return {
      ...plan,
      metadata: {
        ...plan.metadata,
        sourceCanvasUri: documentUri,
        sourceRevision: this.getCanvasRevision(documentUri),
      },
    };
  }

  private resolvePlaybackRouteForMutation(
    plan: CanvasPlaybackPlan,
    routeId: string | undefined,
  ): CanvasPlaybackRouteCandidate {
    const routes = resolveEffectiveCanvasPlaybackRoutes(plan).routes;
    const route = routeId ? routes.find((candidate) => candidate.id === routeId) : routes[0];
    if (!route) {
      throw new Error(
        routeId
          ? `Canvas playback route "${routeId}" is unavailable.`
          : 'Canvas playback plan has no route.',
      );
    }
    return route;
  }

  private resolveSingleSceneShotReorderParent(
    documentUri: string,
    orderedUnits: readonly CanvasPlaybackUnit[],
  ): string | undefined {
    const parents = new Set<string>();
    for (const unit of orderedUnits) {
      if (unit.kind !== 'shot') return undefined;
      const parentId = this.resolveCanvasNodeParentId(documentUri, unit.sourceNodeId);
      if (!parentId) return undefined;
      parents.add(parentId);
    }
    return parents.size === 1 ? parents.values().next().value : undefined;
  }

  private resolveCanvasNodeParentId(documentUri: string, nodeId: string): string | undefined {
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    const nodes = Array.isArray(canvasData?.nodes) ? canvasData.nodes : [];
    const node = nodes.find((candidate) => candidate.id === nodeId);
    return typeof node?.parentId === 'string' ? node.parentId : undefined;
  }

  private async setGlobalKeyboardEditable(documentUri: string, editable: boolean): Promise<void> {
    try {
      await updateWebviewKeyboardEditableOwner(
        `${CANVAS_KEYBOARD_OWNER_PREFIX}${documentUri}`,
        editable,
      );
    } catch (error) {
      logger.warn('Failed to update Canvas keyboard editable owner', error);
    }
  }

  private async hasGlobalKeyboardEditableOwner(): Promise<boolean> {
    try {
      return await hasWebviewKeyboardEditableOwner();
    } catch (error) {
      logger.warn('Failed to query global Webview keyboard editable owner', error);
      return false;
    }
  }

  private isActiveCanvasDocument(document: vscode.CustomDocument): boolean {
    return this.activeDocument?.uri.toString() === document.uri.toString();
  }

  private rememberCanvasSnapshot(
    document: vscode.CustomDocument,
    canvasData: Record<string, unknown>,
  ): void {
    this.updateRememberedCanvasSnapshot(document.uri.toString(), canvasData);
    this.retryPendingEntityBackfills();
  }

  private updateRememberedCanvasSnapshot(
    documentUri: string,
    canvasData: Record<string, unknown>,
  ): void {
    const previousPreviewFingerprint = this.canvasPreviewFingerprintsByDocumentUri.get(documentUri);
    const nextPreviewFingerprint = createCanvasPreviewSemanticFingerprint(canvasData);
    this.canvasSnapshotsByDocumentUri.set(documentUri, canvasData);
    this.canvasRevisionsByDocumentUri.set(documentUri, this.getCanvasRevision(documentUri) + 1);
    this.canvasPreviewFingerprintsByDocumentUri.set(documentUri, nextPreviewFingerprint);
    if (
      previousPreviewFingerprint !== undefined &&
      previousPreviewFingerprint !== nextPreviewFingerprint
    ) {
      this.refreshNarrativePreview(documentUri);
    }
  }

  private getCanvasRevision(documentUri: string): number {
    return this.canvasRevisionsByDocumentUri.get(documentUri) ?? 0;
  }

  applyEntityCandidateBackfill(changedRefs: readonly CreativeEntityChangedRef[]): {
    updated: number;
    pending: boolean;
    diagnostics: readonly CanvasEntityBackfillDiagnostic[];
  } {
    const diagnostics: CanvasEntityBackfillDiagnostic[] = [];
    let updated = 0;

    for (const [documentUri, canvasData] of this.canvasSnapshotsByDocumentUri.entries()) {
      const result = applyCandidateEntityBackfill(canvasData, changedRefs);
      diagnostics.push(...result.diagnostics);
      if (!result.updated) continue;
      updated += result.matchedCount;
      this.updateRememberedCanvasSnapshot(documentUri, result.data);
      const webview = this.webviewPanelsByDocumentUri.get(documentUri)?.webview;
      webview?.postMessage({ type: 'update', data: result.data });
      this.syncOutline(documentUri, result.data);
      this.syncStatusBar(result.data);
    }

    if (updated === 0) {
      const mergeResult = mergePendingCandidateEntityBackfill(this.pendingEntityBackfills, {
        changedRefs: [...changedRefs],
        diagnostics,
      });
      this.pendingEntityBackfills = [...mergeResult.pending];
      return { updated, pending: mergeResult.queued, diagnostics };
    }

    return { updated, pending: false, diagnostics };
  }

  private retryPendingEntityBackfills(): void {
    if (this.pendingEntityBackfills.length === 0) return;
    const pending = this.pendingEntityBackfills.splice(0, this.pendingEntityBackfills.length);
    for (const entry of pending) {
      const result = this.applyEntityCandidateBackfill(entry.changedRefs);
      if (result.pending) {
        continue;
      }
    }
  }

  openNarrativePreview(): Promise<boolean> {
    return this.revealPlaybackWorkspace();
  }

  refreshNarrativePreview(sourceCanvasUri?: string): boolean {
    return this.narrativePreviewBridge.refresh(sourceCanvasUri);
  }

  jumpNarrativePreviewToNode(nodeId: string): boolean {
    return this.narrativePreviewBridge.jumpTo(nodeId);
  }

  setNarrativePreviewVariables(variables: Readonly<Record<string, unknown>>): boolean {
    return this.narrativePreviewBridge.setVariables(variables);
  }

  extractNarrativeGraphSnapshot(): NarrativeGraphSnapshot | undefined {
    const document = this.activeDocument;
    if (!document) return undefined;
    return this.extractNarrativeGraphSnapshotForSource(document.uri.toString());
  }

  extractNarrativeGraphSnapshotForSource(documentUri: string): NarrativeGraphSnapshot | undefined {
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    if (!canvasData) return undefined;
    return createNarrativeGraphSnapshotFromCanvasData(canvasData, {
      revision: this.getCanvasRevision(documentUri),
      sourceCanvasUri: documentUri,
    });
  }

  extractCanvasPlaybackPlan(sourceCanvasUri?: string): CanvasPlaybackPlan | undefined {
    const documentUri = sourceCanvasUri ?? this.activeDocument?.uri.toString();
    if (!documentUri) return undefined;
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    if (!canvasData) return undefined;
    return createCanvasPlaybackPlanFromCanvasData(canvasData, {
      selectedNodeId: this.readCanvasPlaybackSelectedNodeId(canvasData),
    });
  }

  async openCanvasBoardRef(ref: unknown, sourceDocumentUri: vscode.Uri): Promise<void> {
    const boardRef = readCanvasBoardRef(ref);
    if (!boardRef) {
      throw new Error('Invalid Canvas board reference.');
    }
    const diagnostics = validateCanvasBoardRef(boardRef);
    const blocking = diagnostics.find((diagnostic) => diagnostic.severity === 'error');
    if (blocking) {
      throw new Error(blocking.message);
    }

    switch (boardRef.kind) {
      case 'workspace-path': {
        const fsPath = await this.resolveAssetPath(
          boardRef.path,
          sourceDocumentUri,
          'neko-canvas.open-related-board',
        );
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fsPath));
        return;
      }
      case 'uri': {
        if (isUnsafeCanvasBoardUri(boardRef.uri)) {
          throw new Error('Canvas board URI is not durable.');
        }
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(boardRef.uri));
        return;
      }
      case 'resource': {
        const fsPath = await this.resolveResourceRefLocalPreviewPath(
          boardRef.resourceRef,
          'neko-canvas.open-related-board',
        );
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fsPath));
        return;
      }
      case 'project': {
        const targetUri = findOpenCanvasDocumentUriByProjectRef(
          boardRef,
          this.canvasSnapshotsByDocumentUri,
        );
        if (!targetUri) {
          throw new Error('Related Canvas project board is not open or indexed.');
        }
        await vscode.commands.executeCommand('vscode.open', targetUri);
      }
    }
  }

  async extractCanvasPlaybackPlanForPreview(
    webview: vscode.Webview,
    sourceCanvasUri?: string,
  ): Promise<CanvasPlaybackPlan | undefined> {
    const documentUri = sourceCanvasUri ?? this.activeDocument?.uri.toString();
    if (!documentUri) return undefined;
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    if (!canvasData) return undefined;
    const parsedDocumentUri = vscode.Uri.parse(documentUri);
    const previewCanvasData = await this.prepareCanvasDataForPlaybackPreview(
      canvasData,
      parsedDocumentUri,
      webview,
    );
    const plan = createCanvasPlaybackPlanFromCanvasData(previewCanvasData, {
      selectedNodeId: this.readCanvasPlaybackSelectedNodeId(canvasData),
    });
    return this.enrichCanvasPlaybackPlanForPreview(
      plan,
      previewCanvasData,
      parsedDocumentUri,
      webview,
    );
  }

  private readCanvasPlaybackSelectedNodeId(
    canvasData: Record<string, unknown>,
  ): string | undefined {
    const selection = this.readNestedRecord(canvasData['_selection']);
    const nodeIds = selection?.['nodeIds'];
    if (!Array.isArray(nodeIds)) return undefined;
    return nodeIds.find((nodeId): nodeId is string => typeof nodeId === 'string');
  }

  private async prepareCanvasDataForPlaybackPreview(
    canvasData: Record<string, unknown>,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<Record<string, unknown>> {
    const previewCanvasData = this.cloneCanvasDataForPlaybackPreview(canvasData);
    await this.localResourceAccess.configureWebview(webview, {
      enableScripts: true,
      extraRoots: this.getCanvasLocalResourceRoots(documentUri),
    });
    return previewCanvasData;
  }

  private cloneCanvasDataForPlaybackPreview(
    canvasData: Record<string, unknown>,
  ): Record<string, unknown> {
    const parsed: unknown = JSON.parse(JSON.stringify(canvasData));
    const cloned = this.readNestedRecord(parsed);
    if (!cloned) {
      throw new Error('Preview canvas snapshot clone failed.');
    }
    return cloned;
  }

  postNarrativePreviewCanvasMessage(message: PreviewToCanvasMessage): boolean {
    switch (message.type) {
      case 'canvas:highlightNode':
        return this.postNarrativePreviewKeyboardAction(message, `selectNode:${message.nodeId}`);
      case 'canvas:highlightPath':
        return this.postNarrativeHighlightMessage(message);
      case 'canvas:choiceMade':
        return this.postNarrativeHighlightMessage(message);
    }
    return false;
  }

  async handleNarrativePreviewMediaMessage(
    message: Record<string, unknown>,
    webviewPanel: vscode.WebviewPanel,
    sourceCanvasUri?: string,
  ): Promise<void> {
    const documentUri = sourceCanvasUri
      ? vscode.Uri.parse(sourceCanvasUri)
      : this.activeDocument?.uri;
    logger.debug(
      `Canvas Preview media host request: ${JSON.stringify({
        type: typeof message.type === 'string' ? message.type : undefined,
        nodeId: typeof message.nodeId === 'string' ? message.nodeId : undefined,
        assetPath: typeof message.assetPath === 'string' ? message.assetPath : undefined,
        sourceCanvasUri,
        documentUri: documentUri?.toString(),
      })}`,
    );
    if (!documentUri) {
      const response = {
        nodeId: message.nodeId,
        ...this.readNarrativePreviewSessionEnvelope(message),
      };
      if (message.type === 'media:probe') {
        await this.postMediaPlaybackResponse(webviewPanel, {
          type: 'media:probeResult',
          ...response,
          error: 'Preview media playback requires an active Canvas document or source Canvas URI.',
        });
        return;
      }
      if (message.type === 'media:play') {
        await this.postMediaPlaybackResponse(webviewPanel, {
          type: 'media:streamReady',
          ...response,
          error: 'Preview media playback requires an active Canvas document or source Canvas URI.',
        });
      }
      return;
    }
    await this.handleMediaPlaybackMessage(message, webviewPanel, documentUri);
  }

  async resolveNarrativePreviewVariant(
    message: Record<string, unknown>,
    webviewPanel: vscode.WebviewPanel,
    sourceCanvasUri?: string,
  ): Promise<boolean> {
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    const documentUri = sourceCanvasUri
      ? vscode.Uri.parse(sourceCanvasUri)
      : this.activeDocument?.uri;
    if (!documentUri) {
      if (requestId) {
        return webviewPanel.webview.postMessage({
          type: 'preview:variantResolved',
          requestId,
          ...this.readNarrativePreviewSessionEnvelope(message),
          error:
            'Preview variant resolution requires an active Canvas document or source Canvas URI.',
        });
      }
      return false;
    }
    return this.handlePreviewVariantMessage(message, webviewPanel, documentUri);
  }

  private readNarrativePreviewSessionEnvelope(
    message: Record<string, unknown>,
  ): Record<string, string | number> {
    const sessionId = typeof message['sessionId'] === 'string' ? message['sessionId'] : undefined;
    const sourceCanvasUri =
      typeof message['sourceCanvasUri'] === 'string' ? message['sourceCanvasUri'] : undefined;
    const revision = typeof message['revision'] === 'number' ? message['revision'] : undefined;
    return {
      ...(sessionId ? { sessionId } : {}),
      ...(sourceCanvasUri ? { sourceCanvasUri } : {}),
      ...(revision !== undefined ? { revision } : {}),
    };
  }

  async disposeNarrativePreviewMediaPanel(webviewPanel: vscode.WebviewPanel): Promise<void> {
    await this.disposeMediaPlaybackPanel(webviewPanel);
  }

  private postNarrativeKeyboardAction(action: string): boolean {
    if (!this.activeWebviewPanel) return false;
    this.activeWebviewPanel.webview.postMessage({
      type: 'keyboardAction',
      action,
    });
    return true;
  }

  private postNarrativeHighlightMessage(message: PreviewToCanvasMessage): boolean {
    const targetPanel = this.getNarrativePreviewTargetPanel(message);
    if (!targetPanel) return false;
    targetPanel.webview.postMessage({
      type: 'narrativePreviewCanvasMessage',
      message,
    });
    return true;
  }

  private postNarrativePreviewKeyboardAction(
    message: PreviewToCanvasMessage,
    action: string,
  ): boolean {
    const targetPanel = this.getNarrativePreviewTargetPanel(message);
    if (!targetPanel) return false;
    targetPanel.webview.postMessage({
      type: 'keyboardAction',
      action,
    });
    return true;
  }

  private getNarrativePreviewTargetPanel(
    message: PreviewToCanvasMessage,
  ): vscode.WebviewPanel | undefined {
    return message.sourceCanvasUri
      ? (this.webviewPanelsByDocumentUri.get(message.sourceCanvasUri) ?? this.activeWebviewPanel)
      : this.activeWebviewPanel;
  }

  private syncActiveCanvasChrome(documentUri: string): void {
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    if (!canvasData) {
      this.outlineProvider?.updateData(null);
      return;
    }

    this.syncOutline(documentUri, canvasData);
    this.syncStatusBar(canvasData);
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const documentUri = document.uri.toString();
    this.webviewPanelsByDocumentUri.set(documentUri, webviewPanel);
    this.documentsByDocumentUri.set(documentUri, document);
    this.canvasDataReadyDocumentUris.delete(documentUri);
    this._onDidChangeDocumentLifecycle.fire({ type: 'opened', documentUri });
    const focusedRegistration = this.focusedWebviews.register({
      id: documentUri,
      viewType: CanvasEditorProvider.viewType,
      documentUri,
      panel: webviewPanel,
      visible: webviewPanel.visible,
      active: webviewPanel.active,
    });
    this.context.subscriptions.push(focusedRegistration);

    await this.localResourceAccess.configureWebview(webviewPanel.webview, {
      enableScripts: true,
      extraRoots: this.getCanvasLocalResourceRoots(document.uri),
    });

    webviewPanel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message, webviewPanel, document),
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

    if (webviewPanel.active) {
      this.setActiveCanvasEditor(webviewPanel, document);
    }

    webviewPanel.onDidChangeViewState(
      (event) => {
        const panelId = document.uri.toString();
        this.focusedWebviews.markVisible(panelId, event.webviewPanel.visible);
        if (!event.webviewPanel.visible) {
          void this.setGlobalKeyboardEditable(panelId, false);
        }
        if (event.webviewPanel.active) {
          this.setActiveCanvasEditor(event.webviewPanel, document);
        } else if (this.activeWebviewPanel === event.webviewPanel) {
          this.focusedWebviews.markInactive(panelId);
          void this.setGlobalKeyboardEditable(panelId, false);
          this.clearActiveCanvasEditor(event.webviewPanel);
        } else {
          this.focusedWebviews.markInactive(panelId);
          void this.setGlobalKeyboardEditable(panelId, false);
        }
      },
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidDispose(async () => {
      focusedRegistration.dispose();
      await this.setGlobalKeyboardEditable(documentUri, false);
      this._onDidChangeDocumentLifecycle.fire({ type: 'closed', documentUri });
      this.webviewPanelsByDocumentUri.delete(documentUri);
      this.documentsByDocumentUri.delete(documentUri);
      this.canvasSnapshotsByDocumentUri.delete(documentUri);
      this.canvasRevisionsByDocumentUri.delete(documentUri);
      this.dirtyCanvasDocumentUris.delete(documentUri);
      this.canvasPreviewFingerprintsByDocumentUri.delete(documentUri);
      this.canvasDataReadyDocumentUris.delete(documentUri);
      this.narrativePreviewBridge.handleCanvasEditorClosed(documentUri);
      await this.disposeMediaPlaybackPanel(webviewPanel);
      if (this.activeWebviewPanel === webviewPanel) {
        this.clearActiveCanvasEditor(webviewPanel);
      }
    });

    if (webviewPanel.active) {
      this.statusBar?.show();
    }
  }

  async saveCustomDocument(
    document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const webviewPanel = this.getWebviewPanelForDocument(document);
    if (!webviewPanel) return;
    const snapshot = await this.normalizeCanvasSnapshotForSave(
      await requestCanvasProjectSnapshot(webviewPanel.webview, 'vscode-save'),
      document.uri,
    );
    const result = await this.projectFileSession.save({
      targetUri: document.uri,
      sourceUri: document.uri,
      document: snapshot,
      saveReason: 'vscode-save',
      defaultMessage: 'Failed to save NKC',
    });
    this.afterCanvasProjectSaved(document, result.document ?? null);
    webviewPanel.webview.postMessage({ type: 'saved' });
  }

  async saveCustomDocumentAs(
    document: vscode.CustomDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const webviewPanel = this.getWebviewPanelForDocument(document);
    if (!webviewPanel) return;
    const snapshot = await this.normalizeCanvasSnapshotForSave(
      await requestCanvasProjectSnapshot(webviewPanel.webview, 'save-as'),
      document.uri,
    );
    const result = await this.projectFileSession.save({
      targetUri: destination,
      sourceUri: document.uri,
      document: snapshot,
      saveReason: 'save-as',
      defaultMessage: 'Failed to save NKC',
      useSaveAs: true,
    });
    this.afterCanvasProjectSaved(document, result.document ?? null);
    webviewPanel.webview.postMessage({ type: 'saved' });
  }

  async revertCustomDocument(
    document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const documentUri = document.uri.toString();
    this.dirtyCanvasDocumentUris.delete(documentUri);
    this._onDidChangeDocumentLifecycle.fire({ type: 'reverted', documentUri });
    this.getWebviewPanelForDocument(document)?.webview.postMessage({ type: 'revert' });
  }

  async backupCustomDocument(
    _document: vscode.CustomDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    return {
      id: context.destination.toString(),
      delete: () => {},
    };
  }

  // Keyboard action forwarding
  async postKeyboardAction(action: string, documentUri?: vscode.Uri): Promise<boolean> {
    const request = {
      viewType: CanvasEditorProvider.viewType,
      documentUri: documentUri?.toString(),
      allowRecentVisibleFallback: false,
      allowSingleVisibleFallback: true,
    };
    if (
      isCanvasEditorLevelKeyboardAction(action) &&
      (this.focusedWebviews.hasKeyboardEditable(request) ||
        (await this.hasGlobalKeyboardEditableOwner()))
    ) {
      return false;
    }
    return this.focusedWebviews.postKeyboardAction(action, request);
  }

  // API Methods
  async addShape(shape: ShapeConfig): Promise<string> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active canvas editor');
    }
    const result = await this.sendRequest<{ id: string }>('addShape', shape);
    this._onDidChangeCanvas.fire({ type: 'add', shapeId: result.id });
    return result.id;
  }

  async updateShape(shapeId: string, updates: Partial<ShapeConfig>): Promise<void> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active canvas editor');
    }
    await this.sendRequest('updateShape', { shapeId, updates });
    this._onDidChangeCanvas.fire({ type: 'update', shapeId });
  }

  async deleteShape(shapeId: string): Promise<void> {
    if (!this.activeWebviewPanel) {
      throw new Error('No active canvas editor');
    }
    await this.sendRequest('deleteShape', { shapeId });
    this._onDidChangeCanvas.fire({ type: 'delete', shapeId });
  }

  // ===========================================================================
  // Node API — used by neko-agent Canvas MCP tools
  // ===========================================================================

  async listNodes(type?: CanvasNodeType): Promise<CanvasNode[]> {
    if (!this.activeWebviewPanel) return [];
    assertCanvasNodeType(type);
    const result = await this.sendRequest<{ nodes: CanvasNode[] }>('nodes.list', {
      nodeType: type,
    });
    return result.nodes;
  }

  async getNode(nodeId: string): Promise<CanvasNode | undefined> {
    if (!this.activeWebviewPanel) return undefined;
    const result = await this.sendRequest<{ node: CanvasNode | null }>('nodes.get', { nodeId });
    return result.node ?? undefined;
  }

  async updateNode(nodeId: string, data: Record<string, unknown>): Promise<void> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    await this.sendRequest('nodes.update', { nodeId, data });
    this._onDidChangeCanvas.fire({ type: 'update' });
  }

  async createNode(
    type: CanvasNodeType,
    position: { x: number; y: number },
    data: object,
    preset?: string,
  ): Promise<string> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    assertCanvasNodeType(type);
    const result = await this.sendRequest<{ nodeId: string }>('nodes.create', {
      payload: { type, position, data, preset },
    });
    this._onDidChangeCanvas.fire({ type: 'add' });
    return result.nodeId;
  }

  async deriveNode(request: CanvasDeriveNodeRequest): Promise<CanvasDeriveNodeResult> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    assertCanvasNodeType(request.targetType);
    const result = await this.sendRequest<CanvasDeriveNodeResult>('nodes.derive', {
      payload: request,
    });
    this._onDidChangeCanvas.fire({
      type: 'add',
      nodeId: result.nodeId,
      entityType: 'node',
      reason: 'nodeDerived',
      operationType: 'nodes.derive',
    });
    return result;
  }

  async createComposite(
    request: CanvasCreateCompositeRequest,
  ): Promise<CanvasCreateCompositeResult> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    assertCanvasNodeType(request.containerType);
    for (const child of request.children) {
      assertCanvasNodeType(child.type);
    }
    const payload = await this.materializeCompositeRequestRuntimePaths(request);
    const result = await this.sendRequest<CanvasCreateCompositeResult>('nodes.createComposite', {
      payload,
    });
    this._onDidChangeCanvas.fire({
      type: 'add',
      nodeId: result.containerId,
      nodeIds: [result.containerId, ...result.childIds],
      entityType: 'node',
      reason: 'compositeCreated',
      operationType: 'nodes.createComposite',
    });
    return result;
  }

  async createConnection(
    request: CanvasCreateConnectionRequest,
  ): Promise<CanvasCreateConnectionResult> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    const result = await this.sendRequest<CanvasCreateConnectionResult>('nodes.createConnection', {
      payload: request,
    });
    this._onDidChangeCanvas.fire({
      type: 'add',
      nodeId: request.sourceId,
      entityType: 'connection',
      reason: 'connectionCreated',
      operationType: 'nodes.createConnection',
    });
    return result;
  }

  async updateBlock(request: CanvasUpdateBlockRequest): Promise<CanvasUpdateBlockResult> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    const result = await this.sendRequest<CanvasUpdateBlockResult>('nodes.updateBlock', {
      payload: request,
    });
    this._onDidChangeCanvas.fire({
      type: 'update',
      nodeId: result.nodeId,
      entityType: 'node',
      reason: 'blockUpdated',
      operationType: 'nodes.updateBlock',
    });
    return result;
  }

  async extractStructuredContent(
    request: CanvasExtractStructuredContentRequest,
  ): Promise<CanvasExtractStructuredContentResult> {
    if (!this.activeWebviewPanel) {
      return {
        format: request.format,
        nodeIds: [],
        nodes: [],
        content: request.format === 'json' ? [] : '',
      };
    }
    return this.sendRequest<CanvasExtractStructuredContentResult>(
      'nodes.extractStructuredContent',
      {
        payload: request,
      },
    );
  }

  async getActiveContext(
    request: CanvasAgentActiveContextRequest = {},
  ): Promise<CanvasAgentActiveContextResult> {
    if (!this.activeWebviewPanel) {
      return {
        documentUri: this.activeDocument?.uri.toString(),
        selectedNodeIds: [],
        selectedNodes: [],
      };
    }
    return this.sendRequest<CanvasAgentActiveContextResult>('nodes.getActiveContext', {
      payload: request,
    });
  }

  async applyAgentContent(
    payload: CanvasAgentContentPayload,
  ): Promise<CanvasAgentApplyContentResult> {
    if (!this.activeWebviewPanel) throw new Error('No active canvas editor');
    const result = await this.sendRequest<CanvasAgentApplyContentResult>(
      'nodes.applyAgentContent',
      {
        payload,
      },
    );
    this._onDidChangeCanvas.fire({
      type: result.createdNodeIds?.length ? 'add' : 'update',
      nodeId: result.nodeId,
      nodeIds: result.createdNodeIds,
      entityType: 'node',
      reason: 'agentContentApplied',
      operationType: 'nodes.applyAgentContent',
    });
    return result;
  }

  registerProjectionAdapter(adapter: ProjectionAdapter): ProjectionDisposable {
    const registration = this.projectionAdapters.register(adapter);
    const key = createProjectionSourceKey({ kind: adapter.kind, uri: adapter.sourceUri });
    const existing = this.projectionSubscriptions.get(key);
    existing?.dispose();
    this.projectionSubscriptions.set(
      key,
      adapter.onSourceChanged((event) => this.handleProjectionSourceChanged(event)),
    );
    return {
      dispose: () => {
        registration.dispose();
        const subscription = this.projectionSubscriptions.get(key);
        subscription?.dispose();
        this.projectionSubscriptions.delete(key);
      },
    };
  }

  async openProjectedCanvas(source: ProjectedCanvasSource): Promise<ProjectedCanvasData> {
    const adapter = this.getProjectionAdapter(source);
    const projected = await adapter.project();
    const cacheUri = this.getProjectionCacheUri(source);
    const data: ProjectedCanvasData = {
      ...projected,
      projected: true,
      projectionSource: source,
      projectionStatus: {
        ...(projected.projectionStatus ?? { state: 'clean' }),
        state: 'clean',
        cacheUri: cacheUri.toString(),
        updatedAt: Date.now(),
      },
    };
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(cacheUri.fsPath)));
    await vscode.workspace.fs.writeFile(
      cacheUri,
      Buffer.from(JSON.stringify(data, null, 2), 'utf-8'),
    );
    return data;
  }

  async writeProjectionBack(
    source: ProjectedCanvasSource,
    changes: readonly ProjectionWriteBack[],
  ): Promise<ProjectionWriteBackResult> {
    const adapter = this.getProjectionAdapter(source);
    return adapter.writeBack(changes);
  }

  private getProjectionAdapter(source: ProjectedCanvasSource): ProjectionAdapter {
    const adapter = this.projectionAdapters.get(source.kind, source.uri);
    if (!adapter) {
      throw new Error(`No ${source.kind} projection adapter registered for ${source.uri}`);
    }
    return adapter;
  }

  private getProjectionCacheUri(source: ProjectedCanvasSource): vscode.Uri {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri;
    const root = workspace
      ? vscode.Uri.joinPath(workspace, '.neko', '.cache')
      : vscode.Uri.joinPath(this.context.globalStorageUri, 'projected-canvas-cache');
    return vscode.Uri.joinPath(root, `${source.kind}-${hashProjectionSource(source.uri)}.nkc`);
  }

  private handleProjectionSourceChanged(event: ProjectionSourceChangeEvent): void {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'projectionSourceChanged',
      event,
    });
    this._onDidChangeCanvas.fire({
      type: 'update',
      entityType: 'operation',
      reason: 'projectionSourceChanged',
      operationType: 'projection.source.changed',
      documentUri: this.activeDocument?.uri.toString(),
    });
  }

  private async tryRegenerateProjectedCanvas(
    data: ProjectedCanvasData,
    webview: vscode.Webview,
    document: vscode.CustomDocument,
  ): Promise<void> {
    const adapter = this.projectionAdapters.get(
      data.projectionSource.kind,
      data.projectionSource.uri,
    );
    if (!adapter) {
      return;
    }

    try {
      const projected = await adapter.project();
      const cacheUri = this.getProjectionCacheUri(data.projectionSource);
      const nextData: ProjectedCanvasData = {
        ...projected,
        projected: true,
        projectionSource: data.projectionSource,
        viewport: data.viewport ?? projected.viewport,
        projectionStatus: {
          state: 'clean',
          cacheUri: cacheUri.toString(),
          updatedAt: Date.now(),
        },
      };
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(cacheUri.fsPath)));
      await vscode.workspace.fs.writeFile(
        cacheUri,
        Buffer.from(JSON.stringify(nextData, null, 2), 'utf-8'),
      );
      webview.postMessage({ type: 'update', data: nextData });
      const canvasRecord = nextData as unknown as Record<string, unknown>;
      this.rememberCanvasSnapshot(document, canvasRecord);
      if (this.isActiveCanvasDocument(document)) {
        this.syncOutline(document.uri.toString(), canvasRecord);
        this.syncStatusBar(canvasRecord);
      }
    } catch (error) {
      webview.postMessage({
        type: 'projectionStatus',
        status: {
          state: 'writeback-error',
          message: error instanceof Error ? error.message : String(error),
          updatedAt: Date.now(),
        },
      });
    }
  }

  async getStoryboardExecutionSummary(
    request: CanvasStoryboardExecutionSummaryRequest = {},
  ): Promise<CanvasStoryboardExecutionSummary> {
    if (!this.activeWebviewPanel) {
      return {
        sourceScriptUri: request.sourceScriptUri,
        canvasFileUri: request.canvasFileUri,
        status: 'not-available',
        scenes: [],
        error: 'No active canvas editor',
      };
    }

    const nodes = await this.listNodes();
    const canvasSnapshot = this.activeDocument
      ? this.canvasSnapshotsByDocumentUri.get(this.activeDocument.uri.toString())
      : undefined;
    return createCanvasStoryboardExecutionSummary({
      nodes,
      request,
      canvasFileUri: this.activeDocument?.uri.toString() ?? request.canvasFileUri,
      ...readCanvasBoardSummaryInput(canvasSnapshot),
    });
  }

  async generateImageForNode(nodeId: string, _childNodeId?: string): Promise<void> {
    const node = await this.getNode(nodeId);
    if (!node) {
      throw new Error(`Cannot generate Canvas node "${nodeId}": node not found.`);
    }
    const webview = this.activeWebviewPanel?.webview;
    if (!webview) throw new Error('Cannot generate Canvas media without an active Canvas Webview.');
    await this.routeCanvasCreativeAiAction({ node, actionId: 'generate-image', webview });
  }

  async generateBatchForNodes(nodeIds: string[]): Promise<void> {
    for (const nodeId of nodeIds) {
      await this.generateImageForNode(nodeId);
    }
  }

  private async routeCanvasCreativeAiAction(input: {
    readonly node: CanvasNode;
    readonly actionId: CanvasCreativeAiActionId;
    readonly webview: vscode.Webview;
  }): Promise<void> {
    const documentIdentity = this.createCreativeAiDocumentIdentity();
    if (!documentIdentity) {
      const diagnostics = [
        createCanvasCreativeAiEditorDiagnostic(
          'canvas-creative-ai-missing-document',
          'Cannot start Canvas creative AI action without an active .nkc document.',
          'documentRef',
        ),
      ];
      input.webview.postMessage({
        type: 'canvasCreativeAiActionResult',
        nodeId: input.node.id,
        actionId: input.actionId,
        ok: false,
        diagnostics,
      });
      return;
    }

    const built = buildCanvasCreativeActionExternalInvocation({
      document: documentIdentity,
      node: input.node,
      actionId: input.actionId,
      requestedAt: new Date().toISOString(),
    });
    if (!built.ok) {
      input.webview.postMessage({
        type: 'canvasCreativeAiActionResult',
        nodeId: input.node.id,
        actionId: input.actionId,
        ok: false,
        diagnostics: built.diagnostics,
      });
      return;
    }

    const result = await this.invokeExternalCreativeAiDetailed(built.invocation);
    input.webview.postMessage({
      type: 'canvasCreativeAiActionResult',
      nodeId: input.node.id,
      actionId: input.actionId,
      ok: result.ok,
      diagnostics: result.diagnostics,
      ...(result.ok ? { status: result.status } : {}),
    });
  }

  private async routeCanvasCreativeAiCandidateAction(input: {
    readonly nodeId: string;
    readonly candidateId: string;
    readonly candidateAction: 'accept' | 'reject' | 'delete' | 'inspect';
    readonly actionId?: CanvasCreativeAiActionId;
    readonly webview: vscode.Webview;
  }): Promise<void> {
    if (!this.creativeAiApplyAdapter) {
      input.webview.postMessage({
        type: 'canvasCreativeAiActionResult',
        nodeId: input.nodeId,
        actionId: input.actionId,
        ok: false,
        diagnostics: [
          createCanvasCreativeAiEditorDiagnostic(
            'canvas-creative-ai-apply-adapter-unavailable',
            'Canvas creative AI candidate actions require the Canvas apply adapter.',
          ),
        ],
      });
      return;
    }

    const requestedAt = new Date().toISOString();
    if (input.candidateAction === 'inspect') {
      input.webview.postMessage({
        type: 'canvasCreativeAiActionResult',
        nodeId: input.nodeId,
        actionId: input.actionId,
        ok: true,
        diagnostics: [
          createCreativeAiDiagnostic(
            'info',
            'canvas-creative-ai-candidate-inspect',
            'Canvas candidate details are available in the shot overlay.',
            'candidateId',
          ),
        ],
      });
      return;
    }

    if (input.candidateAction === 'accept') {
      const result = await this.creativeAiApplyAdapter.promoteStoredCandidate({
        nodeId: input.nodeId,
        candidateId: input.candidateId,
        actor: 'user',
        requestedAt,
      });
      input.webview.postMessage({
        type: 'canvasCreativeAiActionResult',
        nodeId: input.nodeId,
        actionId: input.actionId,
        ok: result.ok,
        diagnostics: result.diagnostics,
        promotion: result,
      });
      return;
    }

    const result = await this.creativeAiApplyAdapter.markStoredCandidateDisposition({
      nodeId: input.nodeId,
      candidateId: input.candidateId,
      disposition: input.candidateAction === 'reject' ? 'rejected' : 'deleted',
      requestedAt,
    });
    input.webview.postMessage({
      type: 'canvasCreativeAiActionResult',
      nodeId: input.nodeId,
      actionId: input.actionId,
      ok: result.ok,
      diagnostics: result.diagnostics,
      disposition: result,
    });
  }

  private createCreativeAiDocumentIdentity(): CanvasCreativeAiDocumentIdentity | null {
    const document = this.activeDocument;
    if (!document) return null;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const projectRelativePath =
      workspaceFolder && document.uri.scheme === 'file'
        ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath).replace(/\\/g, '/')
        : undefined;
    const normalizedProjectRelativePath =
      projectRelativePath &&
      !projectRelativePath.startsWith('..') &&
      !path.isAbsolute(projectRelativePath)
        ? projectRelativePath
        : undefined;
    const canvasSnapshot = this.canvasSnapshotsByDocumentUri.get(document.uri.toString());
    return {
      documentId: `canvas-document:${hashProjectionSource(document.uri.toString())}`,
      ...(normalizedProjectRelativePath
        ? { projectRelativePath: normalizedProjectRelativePath }
        : {}),
      label: path.basename(document.uri.fsPath || document.uri.path),
      revision: canvasSnapshot
        ? createCanvasDocumentRevision(canvasSnapshot)
        : `canvas-doc-revision:${this.getCanvasRevision(document.uri.toString())}`,
    };
  }

  private async invokeExternalCreativeAi(
    invocation: ExternalCreativeAiInvocation,
  ): Promise<boolean> {
    const result = await this.invokeExternalCreativeAiDetailed(invocation);
    if (result.ok) {
      return true;
    }
    const message =
      result.diagnostics.map((diagnostic) => diagnostic.message).join('; ') ??
      'Canvas creative AI execution returned no result.';
    await handleError(new Error(message), { showToUser: true, severity: 'warning' });
    return false;
  }

  private async invokeExternalCreativeAiDetailed(
    invocation: ExternalCreativeAiInvocation,
  ): Promise<CanvasCreativeAiHostInvocationResult> {
    try {
      const result = await vscode.commands.executeCommand<
        CanvasCreativeAiHostInvocationResult | undefined
      >(CANVAS_CREATIVE_AI_INVOKE_EXTERNAL_COMMAND, invocation);
      return (
        result ?? {
          ok: false,
          diagnostics: [
            createCanvasCreativeAiEditorDiagnostic(
              'canvas-creative-ai-host-no-result',
              'Canvas creative AI execution returned no result.',
            ),
          ],
        }
      );
    } catch (error) {
      return {
        ok: false,
        diagnostics: [
          createCanvasCreativeAiEditorDiagnostic(
            'canvas-creative-ai-host-command-failed',
            error instanceof Error ? error.message : String(error),
          ),
        ],
      };
    }
  }

  reportStoryboardImport(payload: CanvasStoryboardPayload, created: CreatedCanvasStoryboard): void {
    const nodeIds = created.scenes.flatMap((scene) => [scene.sceneNodeId, ...scene.shotIds]);
    this._onDidChangeCanvas.fire({
      type: 'update',
      nodeIds,
      documentUri: this.activeDocument?.uri.toString(),
      entityType: 'import',
      reason: 'storyboardImported',
      operationType: 'storyboard.import',
      sourceScriptUri: payload.sourceScriptUri,
      storyboardImport: created,
    });
  }

  private reportCanvasReady(documentUri: vscode.Uri, data: Record<string, unknown> | null): void {
    const nodeIds = Array.isArray(data?.['nodes'])
      ? (data['nodes'] as unknown[])
          .map((node) => {
            if (typeof node !== 'object' || node === null) {
              return null;
            }
            return typeof (node as { id?: unknown }).id === 'string'
              ? (node as { id: string }).id
              : null;
          })
          .filter((nodeId): nodeId is string => nodeId !== null)
      : [];

    this._onDidChangeCanvas.fire({
      type: 'update',
      nodeIds,
      documentUri: documentUri.toString(),
      entityType: 'operation',
      reason: 'editorReady',
      operationType: 'canvas.editor.ready',
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, documentUri: vscode.Uri): string {
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob: https:; font-src ${webview.cspSource}; media-src ${webview.cspSource} data: blob: https:; connect-src ws://127.0.0.1:* http://127.0.0.1:*;">
  <title>Canvas Editor</title>
  <link rel="stylesheet" href="${webviewUri}/assets/index.css">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.documentUri = "${documentUri.toString()}";
  </script>
  <script nonce="${nonce}" type="module" src="${webviewUri}/assets/index.js"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private async loadCanvasProject(uri: vscode.Uri): Promise<{
    readonly ok: boolean;
    readonly data: CanvasData | null;
    readonly diagnostics: readonly ProjectFileDiagnostic[];
  }> {
    const result = await this.projectFileStore.load<CanvasData>({
      filePath: uri.fsPath,
      formatId: 'nkc',
      sourcePolicy: nkcSourcePathPolicy,
      sourcePolicyOptions: {
        context: this.createCanvasProjectFileContext(uri),
      },
    });
    return {
      ok: result.ok,
      data: result.document ?? null,
      diagnostics: result.diagnostics,
    };
  }

  private async requestDocumentSave(
    document: vscode.CustomDocument,
    message: { readonly data?: unknown; readonly saveReason?: unknown },
  ): Promise<void> {
    if (message.data && typeof message.data === 'object') {
      this.rememberCanvasSnapshot(document, message.data as Record<string, unknown>);
    }

    const saveReason =
      typeof message.saveReason === 'string' && isCanvasProjectSaveReason(message.saveReason)
        ? message.saveReason
        : 'manual';

    if (saveReason === 'autosave') {
      logger.debug('canvas.save.request', {
        uri: document.uri.toString(),
        saveReason,
      });
    }

    this.dirtyCanvasDocumentUris.add(document.uri.toString());
    this._onDidChangeDocumentLifecycle.fire({
      type: 'dirty',
      documentUri: document.uri.toString(),
    });
    this._onDidChangeCustomDocument.fire({ document });
    const savedUri = await vscode.workspace.save(document.uri);
    if (!savedUri) {
      throw new Error(`VS Code did not save Canvas document ${document.uri.toString()}.`);
    }
  }

  private async normalizeCanvasSnapshotForSave(
    canvasData: CanvasData,
    documentUri: vscode.Uri,
  ): Promise<CanvasData> {
    const data = canvasData as unknown as Record<string, unknown>;
    this.normalizeCanvasContentBindingsForSave(data);
    await this.normalizeCanvasPathsForSave(data, documentUri);
    return data as unknown as CanvasData;
  }

  private normalizeCanvasContentBindingsForSave(data: Record<string, unknown>): void {
    const nodes = data['nodes'] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      const nodeData = isPlainRecord(node['data']) ? node['data'] : undefined;
      const content = isPlainRecord(node['content']) ? node['content'] : undefined;
      if (!nodeData || !content) continue;

      if (node['type'] === 'media') {
        normalizeCanvasAssetPreviewBindings(content, '/assetPath');
      } else if (node['type'] === 'project') {
        normalizeCanvasAssetPreviewBindings(content, '/projectPath');
      }
    }
  }

  private afterCanvasProjectSaved(
    document: vscode.CustomDocument,
    canvasData: CanvasData | Record<string, unknown> | null,
  ): void {
    if (!canvasData) return;
    this.dirtyCanvasDocumentUris.delete(document.uri.toString());
    const data = canvasData as unknown as Record<string, unknown>;
    this.rememberCanvasSnapshot(document, data);
    this._onDidChangeDocumentLifecycle.fire({
      type: 'saved',
      documentUri: document.uri.toString(),
    });
    if (this.isActiveCanvasDocument(document)) {
      this.syncOutline(document.uri.toString(), data);
      this.syncStatusBar(data);
    }
  }

  private createCanvasProjectFileContext(uri: vscode.Uri) {
    return this.projectFileAdapter.createWorkspaceMediaPathContext({
      documentUri: uri,
      allowedRoots: [
        path.dirname(uri.fsPath),
        ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      ],
    });
  }

  private async handleWebviewMessage(
    message: { type: string; [key: string]: unknown },
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        this.focusedWebviews.syncFocus(document.uri.toString());
        this.canvasDataReadyDocumentUris.delete(document.uri.toString());
        try {
          const result = await this.loadCanvasProject(document.uri);
          const data = result.data;
          if (!result.ok || !data) {
            const diagnostic =
              result.diagnostics.find((entry) => entry.severity === 'error') ??
              createProjectFileDiagnostic({
                code: 'invalid-document',
                message: 'Canvas project could not be loaded.',
              });
            webviewPanel.webview.postMessage({
              type: 'canvas.loadFailed',
              diagnostic: {
                code: `canvas.project.${diagnostic.code}`,
                message: diagnostic.message,
              },
            });
            break;
          }
          const canvasRecord = data as unknown as Record<string, unknown>;
          await this.normalizeCanvasPathsForLoad(canvasRecord, document.uri, webviewPanel.webview);
          if (isProjectedCanvasData(data)) {
            await this.tryRegenerateProjectedCanvas(data, webviewPanel.webview, document);
          }
          webviewPanel.webview.postMessage({ type: 'update', data });
          this.rememberCanvasSnapshot(document, canvasRecord);
          this._onDidChangeDocumentLifecycle.fire({
            type: 'ready',
            documentUri: document.uri.toString(),
          });
          if (this.isActiveCanvasDocument(document)) {
            this.syncOutline(document.uri.toString(), canvasRecord);
            this.syncStatusBar(canvasRecord);
          }
          this.reportCanvasReady(document.uri, canvasRecord);
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'canvas.loadFailed',
            diagnostic: {
              code: 'canvas.project.read-failed',
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
        break;
      }
      case 'canvasDataReady': {
        const documentUri = document.uri.toString();
        this.canvasDataReadyDocumentUris.add(documentUri);
        if (webviewPanel.active) {
          this.setActiveCanvasEditor(webviewPanel, document);
        }
        break;
      }
      case 'webviewKeyboardFocus': {
        if (typeof message.focused !== 'boolean') {
          break;
        }
        this.focusedWebviews.markKeyboardFocused(document.uri.toString(), message.focused);
        if (message.focused && webviewPanel.visible) {
          this.setActiveCanvasEditor(webviewPanel, document);
        }
        break;
      }
      case 'webviewKeyboardEditable': {
        if (typeof message.editable !== 'boolean') {
          break;
        }
        const editable = message.editable && webviewPanel.visible;
        this.focusedWebviews.markKeyboardEditable(document.uri.toString(), editable);
        void this.setGlobalKeyboardEditable(document.uri.toString(), editable);
        break;
      }
      case 'canvasAction': {
        if (message.action === 'openExport') {
          await vscode.commands.executeCommand('neko.neko-canvas.slashCommand.export');
        } else if (message.action === 'revealPlaybackWorkspace') {
          this.setActiveCanvasEditor(webviewPanel, document);
          await this.revealPlaybackWorkspace({ sourceCanvasUri: document.uri.toString() });
        } else if (message.action === 'openPackage') {
          const data =
            message.data && typeof message.data === 'object'
              ? (message.data as Record<string, unknown>)
              : undefined;
          if (data) {
            await this.normalizeCanvasPathsForSave(data, document.uri);
            this.rememberCanvasSnapshot(document, data);
          }
          await createProjectSnapshotPackage({
            packageId: 'neko-canvas',
            title: 'Package Canvas Project',
            sourceUri: document.uri,
            sourceBytes: data ? Buffer.from(JSON.stringify(data, null, 2), 'utf-8') : undefined,
            metadata: {
              kind: 'canvas',
              viewType: CanvasEditorProvider.viewType,
            },
          });
        }
        break;
      }
      case 'playback:getPreviewPlan': {
        const requestId = message.requestId;
        if (typeof requestId !== 'string') {
          break;
        }
        const documentUri = document.uri.toString();
        const requestedRevision =
          typeof message.sourceRevision === 'number' && Number.isFinite(message.sourceRevision)
            ? message.sourceRevision
            : undefined;
        const currentRevision = this.getCanvasRevision(documentUri);
        if (requestedRevision !== undefined && requestedRevision < currentRevision) {
          await webviewPanel.webview.postMessage({
            type: 'playback:previewPlanResult',
            requestId,
            sourceCanvasUri: documentUri,
            sourceRevision: currentRevision,
            stale: true,
            error: 'Canvas playback plan request is stale.',
          });
          break;
        }
        const plan = await this.extractCanvasPlaybackPlanForPreview(
          webviewPanel.webview,
          documentUri,
        );
        await webviewPanel.webview.postMessage({
          type: 'playback:previewPlanResult',
          requestId,
          sourceCanvasUri: documentUri,
          sourceRevision: currentRevision,
          ...(plan ? { plan } : { error: 'Canvas playback plan is unavailable.' }),
        });
        break;
      }
      case 'playback:createCutDraftFromRoute': {
        const requestId =
          typeof message._requestId === 'number' && Number.isFinite(message._requestId)
            ? message._requestId
            : undefined;
        try {
          const routeId = typeof message.routeId === 'string' ? message.routeId : undefined;
          const documentUri = document.uri.toString();
          const requestedRevision =
            typeof message.sourceRevision === 'number' && Number.isFinite(message.sourceRevision)
              ? message.sourceRevision
              : undefined;
          const currentRevision = this.getCanvasRevision(documentUri);
          if (requestedRevision !== undefined && requestedRevision < currentRevision) {
            throw new Error(
              'Canvas playback route matrix is stale; refresh before sending to Cut.',
            );
          }
          const draft = this.createCutDraftFromRoute({
            sourceCanvasUri: documentUri,
            ...(routeId ? { routeId } : {}),
          });
          const cutTarget = await selectExistingCutProjectTarget();
          const importResult = await vscode.commands.executeCommand<CutCanvasDraftImportResult>(
            'neko.cut.authoring.importCanvasDraft',
            {
              payload: draft,
              target: cutTarget.target,
              expectedProjectRevision: cutTarget.expectedProjectRevision,
            },
          );
          if (!importResult) {
            throw new Error(
              'neko.cut.authoring.importCanvasDraft did not return an import result.',
            );
          }
          if (requestId !== undefined) {
            await webviewPanel.webview.postMessage({
              type: '_response',
              _requestId: requestId,
              draft,
              importResult,
            });
          }
        } catch (error) {
          if (requestId !== undefined) {
            await webviewPanel.webview.postMessage({
              type: '_response',
              _requestId: requestId,
              error: error instanceof Error ? error.message : String(error),
            });
          } else {
            vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
          }
        }
        break;
      }
      case 'save': {
        // Legacy webview builds used to write the .nkc file directly from this message.
        // Keep the message fail-closed into the VS Code custom editor lifecycle so there is
        // only one durable save path for Canvas documents.
        try {
          await this.requestDocumentSave(document, message);
        } catch (error) {
          logger.error(`Failed to request save: ${error}`);
        }
        break;
      }
      case 'requestSave': {
        try {
          await this.requestDocumentSave(document, message);
        } catch (error) {
          logger.error(`Failed to request save: ${error}`);
        }
        break;
      }
      case 'canvasStatus': {
        // Webview reports status update (selection change, viewport change, etc.)
        const data = message.data as Record<string, unknown>;
        this.rememberCanvasSnapshot(document, data);
        if (this.isActiveCanvasDocument(document)) {
          this.syncStatusBar(data);
          this.syncOutline(document.uri.toString(), data);
        }
        break;
      }
      case 'projection.writeBack': {
        const requestId = message._requestId as number | undefined;
        if (requestId === undefined) break;
        try {
          const source = message.source;
          const changes = Array.isArray(message.changes)
            ? (message.changes as ProjectionWriteBack[])
            : [];
          if (!isProjectedCanvasSource(source)) {
            throw new Error('Invalid projected Canvas source');
          }
          const result = await this.writeProjectionBack(source, changes);
          webviewPanel.webview.postMessage({ type: '_response', _requestId: requestId, result });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: '_response',
            _requestId: requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        break;
      }
      case 'entity.summary':
      case 'entity.confirmCandidate':
      case 'entity.inspect': {
        const requestId = message._requestId as number | undefined;
        if (requestId === undefined) break;
        if (!isCanvasEntityRouteMessage(message)) {
          webviewPanel.webview.postMessage({
            type: '_response',
            _requestId: requestId,
            ok: false,
            message: vscode.l10n.t('Invalid Canvas entity route payload.'),
          });
          break;
        }
        const result = await handleCanvasEntityRoute(
          message,
          {
            projectRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            contextUri: document.uri.toString(),
          },
          {
            executeCommand: vscode.commands.executeCommand,
            translate: (text, ...args) => vscode.l10n.t(text, ...args),
          },
        );
        const backfill =
          message.type === 'entity.confirmCandidate' &&
          result.ok &&
          result.entityRef &&
          result.candidateId
            ? this.applyEntityCandidateBackfill([
                { kind: 'candidate', id: result.candidateId, entityRef: result.entityRef },
              ])
            : undefined;
        webviewPanel.webview.postMessage({
          type: '_response',
          _requestId: requestId,
          ...result,
          ...(backfill ? { backfill } : {}),
        });
        break;
      }
      case 'openMediaPreview': {
        // Open media in neko-preview's customEditor.
        const mediaTypeHint = message.mediaType as string | undefined;

        try {
          const fsPath = await this.resolveCanvasMaterialLocalFilePath(
            message,
            document.uri,
            'neko-canvas.open-media-preview',
          );
          const fileUri = vscode.Uri.file(fsPath);

          const ext = fsPath.split('.').pop()?.toLowerCase() ?? '';
          const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'];
          const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];
          const panoramicRoute = getPanoramicPreviewRoute({
            filePath: fsPath,
            mediaType: mediaTypeHint,
          });

          if (panoramicRoute) {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              fileUri,
              panoramicRoute.viewType,
            );
          } else if (videoExts.includes(ext) || mediaTypeHint === 'video') {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoPreview');
          } else if (audioExts.includes(ext) || mediaTypeHint === 'audio') {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.audioPreview');
          } else {
            await vscode.commands.executeCommand('vscode.open', fileUri);
          }
        } catch (error) {
          logger.error(`Failed to open media preview: ${error}`);
          void handleError(error instanceof Error ? error : new Error(String(error)), {
            showToUser: true,
          });
        }
        break;
      }

      case 'saveCanvasMaterialToAssetLibrary': {
        try {
          const fsPath = await this.resolveCanvasMaterialLocalFilePath(
            message,
            document.uri,
            'neko-canvas.save-material-to-asset-library',
          );
          await vscode.commands.executeCommand('neko.assets.importFile', vscode.Uri.file(fsPath));
          void vscode.window.showInformationMessage(
            vscode.l10n.t('neko.canvas.material.save.success', path.basename(fsPath)),
          );
        } catch (error) {
          logger.error(`Failed to save Canvas material to asset library: ${error}`);
          void handleError(error instanceof Error ? error : new Error(String(error)), {
            showToUser: true,
          });
        }
        break;
      }

      case 'preview:resolveVariant': {
        await this.handlePreviewVariantMessage(message, webviewPanel, document.uri);
        break;
      }
      case 'preview:delegateAction': {
        const action = message.action as
          { target?: string; command?: string; route?: string } | undefined;
        const asset = message.asset as
          { path?: string; uri?: string; mediaType?: string } | undefined;
        const assetPath = asset?.path ?? asset?.uri;

        if (action?.command) {
          await vscode.commands.executeCommand(action.command, assetPath);
          break;
        }

        if (!assetPath) break;

        if (action?.target === 'project') {
          const fsPath = await this.resolveAssetPath(assetPath, document.uri);
          const fileUri = vscode.Uri.file(fsPath);
          const ext = assetPath.split('.').pop()?.toLowerCase() ?? '';
          const editorIdMap: Record<string, string> = {
            nkv: 'neko.nekocut.editor',
          };
          const editorId = editorIdMap[ext];
          if (editorId) {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, editorId);
          } else {
            await vscode.commands.executeCommand('vscode.open', fileUri);
          }
        } else if (
          action?.target === 'preview' ||
          action?.target === 'model' ||
          action?.target === 'cut' ||
          action?.target === 'audio'
        ) {
          const fsPath = await this.resolveAssetPath(assetPath, document.uri);
          const fileUri = vscode.Uri.file(fsPath);
          const panoramicRoute = getPanoramicPreviewRoute({
            filePath: fsPath,
            mediaType: asset?.mediaType,
          });
          if (panoramicRoute) {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              fileUri,
              panoramicRoute.viewType,
            );
          } else {
            await vscode.commands.executeCommand('vscode.open', fileUri);
          }
        } else {
          const fsPath = await this.resolveAssetPath(assetPath, document.uri);
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fsPath));
        }
        break;
      }
      case 'canvasChanged':
        this._onDidChangeCanvas.fire({
          type: message.changeType as 'add' | 'update' | 'delete',
          shapeId: message.shapeId as string | undefined,
        });
        break;

      case 'operationApplied':
        // EditOperation sync from webview — fire dirty event
        this.dirtyCanvasDocumentUris.add(document.uri.toString());
        this._onDidChangeDocumentLifecycle.fire({
          type: 'dirty',
          documentUri: document.uri.toString(),
        });
        this._onDidChangeCustomDocument.fire({ document });
        this._onDidChangeCanvas.fire(
          mapOperationToCanvasChangeEvent(
            message.operation as {
              type?: string;
              payload?: Record<string, unknown>;
            },
          ),
        );
        break;

      // =================================================================
      // Cross-extension drag-and-drop (ADR-5 P1)
      // =================================================================

      case 'dnd:drop': {
        try {
          const payload = await vscode.commands.executeCommand<{
            path: string;
            mediaType: 'image' | 'video' | 'audio';
            name: string;
          } | null>('neko.agent.getDndPayload');

          if (payload) {
            if (!this.headlessAssetImporter) {
              throw new Error('Canvas headless asset importer is not registered.');
            }
            const result = await this.headlessAssetImporter({
              path: payload.path,
              type: payload.mediaType,
              name: payload.name,
              target: { documentUri: document.uri.toString() },
            });
            await vscode.commands.executeCommand('neko.agent.clearDndPayload');
            logger.info(`DnD drop accepted: ${payload.name} -> ${result.nodeId}`);
          }
        } catch (error) {
          logger.warn(`DnD drop failed (agent extension may not be installed): ${error}`);
        }
        break;
      }

      // =================================================================
      // Media playback via MediaPlaybackService (direct engine)
      // =================================================================

      case 'media:probe': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:play': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:seek': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:pause': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:resume': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:stop': {
        await this.handleMediaPlaybackMessage(message, webviewPanel, document.uri);
        break;
      }

      case 'media:captureFrame': {
        const resourceRef = isResourceRef(message.resourceRef) ? message.resourceRef : undefined;
        const assetPath = this.resolveDocumentResourceAssetPath(
          message.assetPath as string | undefined,
        );
        const time = (message.time as number) ?? 0;
        if (!assetPath && !resourceRef) break;
        try {
          const filePath = resourceRef
            ? await this.resolveResourceRefLocalPreviewPath(
                resourceRef,
                'neko-canvas.media-capture-frame',
              )
            : await this.resolveCanvasMediaLocalFilePath(
                assetPath!,
                document.uri,
                'neko-canvas.media-capture-frame',
              );
          const playback = await this.getMediaPlayback();
          if (!playback) {
            webviewPanel.webview.postMessage({
              type: 'media:captureFrameResult',
              nodeId: message.nodeId,
              error: 'Media engine not available',
            });
            break;
          }
          const dataUrl = await playback.captureFrame(filePath, time);
          webviewPanel.webview.postMessage({
            type: 'media:captureFrameResult',
            nodeId: message.nodeId,
            dataUrl,
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'media:captureFrameResult',
            nodeId: message.nodeId,
            error: error instanceof Error ? error.message : 'Capture failed',
          });
        }
        break;
      }

      case 'media:requestPanoramicThumbnail': {
        const assetPath = message.assetPath as string;
        if (!assetPath) break;
        let assetId: string | null = null;
        try {
          const filePath = await this.resolveCanvasMediaLocalFilePath(
            assetPath,
            document.uri,
            'neko-canvas.media-panoramic-thumbnail',
          );
          const route = getPanoramicPreviewRoute({
            filePath,
            mediaType: message.mediaType as string | undefined,
          });
          if (!route) break;
          const variantApi = await this.getPreviewVariantApi();
          if (!variantApi) {
            webviewPanel.webview.postMessage({
              type: 'media:panoramicThumbnailResult',
              nodeId: message.nodeId,
              error: 'Preview variant API not available',
            });
            break;
          }
          const manifest = await variantApi.registerPreviewAsset({
            source: filePath,
            kind: route.kind,
            expectedProjection: 'equirectangular',
          });
          assetId = manifest.assetId;
          const variant = await variantApi.requestPreviewVariant(manifest.assetId, {
            role: route.kind === 'image' ? 'proxy' : 'thumbnail',
            width: 640,
            height: 320,
          });
          webviewPanel.webview.postMessage({
            type: 'media:panoramicThumbnailResult',
            nodeId: message.nodeId,
            url: variant.url ?? manifest.variants.find((item) => item.role === 'source')?.url,
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'media:panoramicThumbnailResult',
            nodeId: message.nodeId,
            error: error instanceof Error ? error.message : 'Panoramic thumbnail failed',
          });
        } finally {
          if (assetId) {
            const variantApi = await this.getPreviewVariantApi();
            await variantApi?.unregisterPreviewAsset(assetId).catch(() => {});
          }
        }
        break;
      }

      case 'project:resolveThumbnail': {
        const projectPath = message.projectPath as string;
        const projectType = message.projectType as string;
        const nodeId = message.nodeId as string;
        if (!projectPath || !nodeId) break;
        try {
          const filePath = await this.resolveAssetPath(projectPath, document.uri);
          const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
          const projectData = JSON.parse(Buffer.from(raw).toString('utf-8')) as Record<
            string,
            unknown
          >;

          let assetSrc: string | undefined;
          if (projectType === 'nkv') {
            const tracks = projectData['tracks'] as
              Array<{ elements?: Array<{ src?: string }> }> | undefined;
            assetSrc = tracks?.[0]?.elements?.[0]?.src;
          }

          if (!assetSrc) {
            webviewPanel.webview.postMessage({
              type: 'project:thumbnailResult',
              nodeId,
              error: 'No primary asset found in project file',
            });
            break;
          }

          const projectDir = filePath.replace(/[/\\][^/\\]+$/, '');
          const resolvedAssetPath = assetSrc.startsWith('/')
            ? assetSrc
            : `${projectDir}/${assetSrc}`;

          const playback = await this.getMediaPlayback();
          if (!playback) {
            webviewPanel.webview.postMessage({
              type: 'project:thumbnailResult',
              nodeId,
              error: 'Media engine not available',
            });
            break;
          }

          const dataUrl = await playback.captureFrame(resolvedAssetPath, 1);
          webviewPanel.webview.postMessage({
            type: 'project:thumbnailResult',
            nodeId,
            dataUrl,
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'project:thumbnailResult',
            nodeId,
            error: error instanceof Error ? error.message : 'Thumbnail generation failed',
          });
        }
        break;
      }

      case 'project:openInEditor': {
        const projectPath = message.projectPath as string;
        const projectType = message.projectType as string;
        if (!projectPath) break;
        try {
          const filePath = await this.resolveAssetPath(projectPath, document.uri);
          const uri = vscode.Uri.file(filePath);
          const editorIdMap: Record<string, string> = {
            nkv: 'neko.nekocut.editor',
          };
          const editorId = editorIdMap[projectType];
          if (editorId) {
            await vscode.commands.executeCommand('vscode.openWith', uri, editorId);
          } else {
            await vscode.commands.executeCommand('vscode.open', uri);
          }
        } catch (error) {
          logger.warn(`Failed to open project: ${error}`);
        }
        break;
      }

      case 'project:addSource': {
        await this.handleCanvasProjectAddSource(
          (message as { request?: ProjectSourceAddRequest }).request,
          webviewPanel.webview,
          document.uri,
        );
        break;
      }

      case 'canvasCreativeAiAction': {
        const nodeId = typeof message.nodeId === 'string' ? message.nodeId : undefined;
        const actionId = message.actionId;
        if (!nodeId || !isCanvasCreativeAiActionId(actionId)) {
          webviewPanel.webview.postMessage({
            type: 'canvasCreativeAiActionResult',
            nodeId,
            actionId,
            ok: false,
            diagnostics: [
              createCanvasCreativeAiEditorDiagnostic(
                'canvas-creative-ai-invalid-webview-request',
                'Canvas creative AI action message requires nodeId and a valid actionId.',
              ),
            ],
          });
          break;
        }
        let node = await this.getNode(nodeId);
        if (!node) {
          webviewPanel.webview.postMessage({
            type: 'canvasCreativeAiActionResult',
            nodeId,
            actionId,
            ok: false,
            diagnostics: [
              createCanvasCreativeAiEditorDiagnostic(
                'canvas-creative-ai-node-not-found',
                `Canvas node "${nodeId}" was not found.`,
                'nodeId',
              ),
            ],
          });
          break;
        }
        if (message.storyboardPrompt !== undefined) {
          if (!isCanvasStoryboardPromptState(message.storyboardPrompt)) {
            webviewPanel.webview.postMessage({
              type: 'canvasCreativeAiActionResult',
              nodeId,
              actionId,
              ok: false,
              diagnostics: [
                createCanvasCreativeAiEditorDiagnostic(
                  'canvas-creative-ai-invalid-prompt-state',
                  'Canvas creative AI action received an invalid storyboard prompt state.',
                  'storyboardPrompt',
                ),
              ],
            });
            break;
          }
          await this.updateNode(nodeId, { storyboardPrompt: message.storyboardPrompt });
          node = {
            ...node,
            data: { ...node.data, storyboardPrompt: message.storyboardPrompt },
          };
        }
        await this.routeCanvasCreativeAiAction({
          node,
          actionId,
          webview: webviewPanel.webview,
        });
        break;
      }

      case 'canvasCreativeAiCandidateAction': {
        const nodeId = typeof message.nodeId === 'string' ? message.nodeId : undefined;
        const candidateId =
          typeof message.candidateId === 'string' ? message.candidateId : undefined;
        const candidateAction =
          message.candidateAction === 'accept' ||
          message.candidateAction === 'reject' ||
          message.candidateAction === 'delete' ||
          message.candidateAction === 'inspect'
            ? message.candidateAction
            : undefined;
        const actionId = isCanvasCreativeAiActionId(message.actionId)
          ? message.actionId
          : undefined;
        if (!nodeId || !candidateId || !candidateAction) {
          webviewPanel.webview.postMessage({
            type: 'canvasCreativeAiActionResult',
            nodeId,
            actionId,
            ok: false,
            diagnostics: [
              createCanvasCreativeAiEditorDiagnostic(
                'canvas-creative-ai-invalid-candidate-action-request',
                'Canvas creative AI candidate action requires nodeId, candidateId, and a valid candidateAction.',
              ),
            ],
          });
          break;
        }
        await this.routeCanvasCreativeAiCandidateAction({
          nodeId,
          candidateId,
          candidateAction,
          actionId,
          webview: webviewPanel.webview,
        });
        break;
      }

      case 'storyboardActionIntent': {
        const intent = message.intent as CanvasStoryboardActionIntent | undefined;
        const validation = validateCanvasStoryboardActionIntent(intent);
        if (!validation.valid || !intent) {
          logger.warn(
            `storyboardActionIntent rejected: ${validation.diagnostics
              .map((diagnostic) => diagnostic.message)
              .join('; ')}`,
          );
          void handleError(new Error('Invalid storyboard action intent.'), {
            showToUser: true,
            severity: 'warning',
          });
          break;
        }
        try {
          await vscode.commands.executeCommand('neko.agent.sendContext', {
            type: 'canvas-storyboard-action-intent',
            id: intent.requestId ?? `${intent.target.nodeId}:${intent.actionId}`,
            label: `Storyboard action: ${intent.actionId}`,
            summary: `Canvas storyboard action ${intent.actionId} for ${intent.target.nodeId}`,
            data: { intent },
            intent: intent.actionId,
          });
        } catch (err) {
          logger.error(`storyboardActionIntent failed: ${err}`);
          void handleError(err instanceof Error ? err : new Error(String(err)), {
            showToUser: true,
            severity: 'warning',
          });
        }
        break;
      }

      case 'getScriptIndex': {
        const scriptPath = message.scriptPath as string;
        const requestNodeId = message.nodeId as string;
        try {
          const resolvedScriptPath = await this.resolveAssetPath(scriptPath, document.uri);
          const content = await vscode.workspace.fs.readFile(vscode.Uri.file(resolvedScriptPath));
          const index = buildFountainScriptIndex({ uri: resolvedScriptPath, content });

          webviewPanel.webview.postMessage({
            type: 'scriptIndexResult',
            nodeId: requestNodeId,
            scenes: mapStoryScriptIndexToCanvasScenes(index),
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            type: 'scriptIndexResult',
            nodeId: requestNodeId,
            scenes: null,
            error: error instanceof Error ? error.message : 'Fountain source could not be parsed',
          });
        }
        break;
      }

      case 'textDocument:read': {
        if (!isCanvasTextDocumentReadRequest(message)) {
          logger.warn('Rejected invalid Canvas textDocument:read message');
          break;
        }

        let result: CanvasTextDocumentReadResult;
        try {
          const resolvedPath = await this.resolveAssetPath(message.docPath, document.uri);
          result = await readCanvasTextDocumentProjection(message, resolvedPath, {
            stat: async (filePath) => {
              const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
              return {
                size: stat.size,
                isFile: (stat.type & vscode.FileType.File) !== 0,
              };
            },
            readFile: (filePath) => vscode.workspace.fs.readFile(vscode.Uri.file(filePath)),
          });
        } catch {
          result = {
            type: 'textDocument:readResult',
            requestId: message.requestId,
            nodeId: message.nodeId,
            docPath: message.docPath,
            docType: message.docType,
            status: 'error',
            code: 'read-failed',
            error: 'The text source path could not be resolved.',
          };
        }
        await webviewPanel.webview.postMessage(result);
        break;
      }

      case 'openDocument': {
        // Open a document file using VSCode's default handler
        const docPath = message.docPath as string;
        if (!docPath) break;
        try {
          const fsPath = await this.resolveAssetPath(docPath, document.uri);
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fsPath));
        } catch (error) {
          logger.error(`Failed to open document: ${error}`);
          void handleError(error instanceof Error ? error : new Error(String(error)), {
            showToUser: true,
          });
        }
        break;
      }

      case 'openCanvasBoardRef': {
        try {
          await this.openCanvasBoardRef(message.ref, document.uri);
        } catch (error) {
          logger.error(`Failed to open related canvas board: ${error}`);
          void handleError(error instanceof Error ? error : new Error(String(error)), {
            showToUser: true,
          });
        }
        break;
      }

      case 'importToTimeline': {
        // Forward storyboard shots to neko-cut for timeline import
        const { projectName, shots } = message as unknown as {
          projectName: string;
          shots: unknown[];
        };
        try {
          const cutTarget = await selectExistingCutProjectTarget();
          await vscode.commands.executeCommand('neko.cut.authoring.importStoryboard', {
            target: cutTarget.target,
            expectedProjectRevision: cutTarget.expectedProjectRevision,
            projectName,
            shots,
          });
          const shotIds = shots
            .map((shot) =>
              typeof shot === 'object' &&
              shot !== null &&
              typeof (shot as { id?: unknown }).id === 'string'
                ? (shot as { id: string }).id
                : null,
            )
            .filter((shotId): shotId is string => shotId !== null);
          const importedAt = Date.now();
          const payload: CanvasTimelineSyncPayload = buildStoryboardImportTimelineSyncPayload(
            shotIds,
            projectName,
            importedAt,
          );
          webviewPanel.webview.postMessage({
            type: 'timelineSync',
            payload,
          });
          this._onDidChangeCanvas.fire({
            type: 'update',
            nodeIds: shotIds,
            entityType: 'import',
            reason: 'importToTimeline',
            operationType: 'timeline.import',
          });
        } catch {
          void handleError(
            new Error(
              'neko-cut is not available. Install neko-cut to import storyboard to timeline.',
            ),
            { showToUser: true, severity: 'warning' },
          );
        }
        break;
      }

      case 'exportArtboard': {
        const artboardData = message.data as Record<string, unknown>;
        const artboardName = (artboardData.name as string) || 'Untitled Artboard';
        const safeName = artboardName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
        const format = (artboardData.format as string) || 'png';
        const imageData = artboardData.data as string | undefined;

        // 如果 webview 报告导出错误
        if (artboardData.error) {
          void handleError(new Error('Failed to capture artboard'), { showToUser: true });
          break;
        }

        if (!imageData) {
          void handleError(new Error('No image data received'), { showToUser: true });
          break;
        }

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.joinPath(
            vscode.Uri.file(document.uri.fsPath).with({
              path: document.uri.fsPath.replace(/[^/\\]+$/, ''),
            }),
            `${safeName}.${format}`,
          ),
          filters: {
            [format.toUpperCase()]: [format],
            'All Files': ['*'],
          },
        });

        if (saveUri) {
          try {
            const buffer = Buffer.from(imageData, 'base64');
            await vscode.workspace.fs.writeFile(saveUri, buffer);
            vscode.window.showInformationMessage(`Artboard exported: ${saveUri.fsPath}`);
          } catch (error) {
            logger.error(`Failed to export artboard: ${error}`);
            void handleError(error instanceof Error ? error : new Error(String(error)), {
              showToUser: true,
            });
          }
        }
        break;
      }
      case 'sendToAgent':
      case 'sendNodeToAgent': {
        const nodeIds = (message.nodeIds ?? []) as string[];
        const action = message.action as string;
        const intent = (message.intent as string | undefined) ?? undefined;

        if (action === 'generate') {
          // Generate images through the Canvas-owned creative action path.
          const nodeId = nodeIds[0];
          if (nodeId) await this.generateImageForNode(nodeId);
        } else if (action === 'batch') {
          // Batch-generate all selected ShotNodes
          await this.generateBatchForNodes(nodeIds);
        } else {
          // Send selected node as context to the Agent panel
          const nodeId = nodeIds[0];
          if (!nodeId) break;
          const node = await this.getNode(nodeId);
          if (!node) {
            logger.warn(`sendToAgent: node ${nodeId} not found`);
            void handleError(new Error('Cannot send to Agent: node not found'), {
              showToUser: true,
              severity: 'warning',
            });
            break;
          }
          const d = node.data as Record<string, unknown>;
          const payload = {
            type: 'canvas-node' as const,
            id: node.id,
            label:
              node.type === 'shot'
                ? `Shot #${String(d.shotNumber ?? '?').padStart(3, '0')}`
                : ((d.characterName as string | undefined) ?? node.type),
            summary: String(d.visualDescription ?? d.sceneTitle ?? ''),
            data: { nodes: nodeIds },
            intent,
          };
          try {
            await vscode.commands.executeCommand('neko.agent.sendContext', payload);
          } catch (err) {
            logger.error(`sendToAgent failed: ${err}`);
            void handleError(err instanceof Error ? err : new Error(String(err)), {
              showToUser: true,
              severity: 'warning',
            });
          }
        }
        break;
      }

      case 'selectionChange': {
        const nodes = (message.nodes ?? []) as CanvasNode[];
        if (this.isActiveCanvasDocument(document)) {
          this._onSelectionChange.fire(nodes);
          this._onDidChangeCanvas.fire({
            type: 'update',
            entityType: 'selection',
            reason: 'selectionChange',
            nodeIds: nodes.map((node) => node.id),
            documentUri: document.uri.toString(),
          });
        }
        break;
      }

      case '_response': {
        // Resolve a pending sendRequest() promise from the webview
        const id = message._requestId as number;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.resolve(message);
        }
        break;
      }
    }
  }

  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  /** Resolve asset path (PathVariable, webview URI, relative, or absolute) to absolute filesystem path */
  private async resolveAssetPath(assetPath: string, documentUri: vscode.Uri): Promise<string> {
    const source = assetPath.trim();
    // Handle webview URIs (https://file+.vscode-resource.vscode-cdn.net/path/to/file)
    const vscodeResourcePath = this.resolveVSCodeResourceUriPath(source);
    if (vscodeResourcePath) {
      return vscodeResourcePath;
    }
    try {
      const uri = vscode.Uri.parse(source);
      if (uri.scheme === 'file') {
        return uri.fsPath;
      }
      if (uri.scheme && !/^[A-Za-z]$/.test(uri.scheme)) {
        return source;
      }
    } catch {
      // Fall through to local path handling.
    }

    if (source.startsWith('${') && !isWorkspaceScopedVariablePath(source)) {
      return resolveHostContentMediaPath(source, {
        documentUri,
        workspaceFolders: vscode.workspace.workspaceFolders ?? [],
        allowedRoots: this.getCanvasLocalResourceRoots(documentUri).map((root) => root.fsPath),
        getExtension: vscode.extensions.getExtension,
        fileExists: (filePath) => this.isExistingLocalFile(filePath),
      });
    }

    const resolved = resolveWorkspaceMediaPath({
      source,
      context: this.createCanvasWorkspaceMediaPathContext(documentUri),
      fileExists: (filePath) => this.isExistingLocalFile(filePath),
    });
    if (resolved.status === 'resolved-local') {
      return resolved.path;
    }

    const planned = createWorkspaceMediaPathCandidates(
      source,
      this.createCanvasWorkspaceMediaPathContext(documentUri),
    );
    const candidate = planned.candidates[0]?.path;
    if (
      candidate &&
      (planned.classification.kind === 'variable' ||
        (planned.classification.kind === 'workspace-relative' &&
          !source.startsWith('../') &&
          source !== '..'))
    ) {
      return candidate;
    }
    if (planned.classification.kind === 'absolute-local') {
      return source;
    }
    // Legacy fallback: older Canvas files stored paths relative to the .nkc directory.
    const docDir = vscode.Uri.joinPath(documentUri, '..');
    return vscode.Uri.joinPath(docDir, source).fsPath;
  }

  private resolveWorkspaceVariableAssetPath(
    assetPath: string,
    documentUri: vscode.Uri,
  ): string | undefined {
    return this.resolveWorkspaceVariableAssetPathCandidates(assetPath, documentUri)[0];
  }

  private resolveWorkspaceVariableAssetPathCandidates(
    assetPath: string,
    documentUri: vscode.Uri,
  ): readonly string[] {
    if (!isWorkspaceScopedVariablePath(assetPath)) return [];
    return createWorkspaceMediaPathCandidates(
      assetPath,
      this.createCanvasWorkspaceMediaPathContext(documentUri),
    ).candidates.map((candidate) => candidate.path);
  }

  private resolveVSCodeResourceUriPath(value: string): string | undefined {
    const source = value.trim();
    try {
      const url = new URL(source);
      if (/vscode-resource\.vscode-cdn\.net$/i.test(url.hostname)) {
        return decodeURIComponent(url.pathname);
      }
    } catch {
      // Fall through to permissive parsing for VSCode's historical URI shapes.
    }

    const cdnMatch = source.match(/vscode-resource\.vscode-cdn\.net(\/[^?#]*)/i);
    if (cdnMatch?.[1]) {
      return decodeURIComponent(cdnMatch[1]);
    }

    try {
      const uri = vscode.Uri.parse(source);
      if (
        (uri.scheme === 'vscode-resource' || uri.scheme === 'vscode-webview-resource') &&
        uri.path
      ) {
        return uri.fsPath || uri.path;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private resolveDocumentResourceAssetPath(assetPath: string | undefined): string | undefined {
    return assetPath || undefined;
  }

  private async handleMediaPlaybackMessage(
    message: Record<string, unknown>,
    webviewPanel: vscode.WebviewPanel,
    documentUri: vscode.Uri,
  ): Promise<void> {
    switch (message.type) {
      case 'media:probe': {
        const mediaType = readPlaybackMediaType(message.mediaType);
        try {
          const filePath = await this.resolveMediaPlaybackFilePath(
            message,
            documentUri,
            'neko-canvas.media-probe',
          );
          if (!filePath) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:probeResult',
              nodeId: message.nodeId,
              ...this.readNarrativePreviewSessionEnvelope(message),
              error: 'Media source could not be resolved to a local file path.',
            });
            break;
          }
          const playback = await this.getMediaPlayback();
          if (!playback) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:probeResult',
              nodeId: message.nodeId,
              ...this.readNarrativePreviewSessionEnvelope(message),
              error: 'Media engine not available',
            });
            break;
          }
          const mediaInfo = await playback.probeMedia(filePath, mediaType);
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:probeResult',
            nodeId: message.nodeId,
            ...this.readNarrativePreviewSessionEnvelope(message),
            mediaInfo,
            port: playback.port,
          });
        } catch (error) {
          logger.error(`Probe failed: ${error}`);
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:probeResult',
            nodeId: message.nodeId,
            ...this.readNarrativePreviewSessionEnvelope(message),
            error: error instanceof Error ? error.message : 'Probe failed',
          });
        }
        break;
      }

      case 'media:play': {
        const mediaInfo = message.mediaInfo as Record<string, unknown> | undefined;
        const startTime = (message.startTime as number) ?? 0;
        const speed = (message.speed as number) ?? 1.0;
        const mediaType = readPlaybackMediaType(message.mediaType);
        if (!mediaInfo) {
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:streamReady',
            nodeId: message.nodeId,
            ...this.readNarrativePreviewSessionEnvelope(message),
            error: 'Media playback requires probe metadata before stream creation.',
          });
          break;
        }
        try {
          const filePath = await this.resolveMediaPlaybackFilePath(
            message,
            documentUri,
            'neko-canvas.media-play',
          );
          if (!filePath) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:streamReady',
              nodeId: message.nodeId,
              ...this.readNarrativePreviewSessionEnvelope(message),
              error: 'Media source could not be resolved to a local file path.',
            });
            break;
          }
          const playback = await this.getMediaPlayback();
          if (!playback) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:streamReady',
              nodeId: message.nodeId,
              ...this.readNarrativePreviewSessionEnvelope(message),
              error: 'Media engine not available',
            });
            break;
          }
          const nodeId = (message.nodeId as string) ?? filePath;
          let panelStreams = this._activeStreams.get(webviewPanel);
          if (!panelStreams) {
            panelStreams = new Map();
            this._activeStreams.set(webviewPanel, panelStreams);
          }
          const prev = panelStreams.get(nodeId);
          if (prev) {
            await playback.stopPlayback(prev).catch(() => {});
          }
          const hasAudio = (mediaInfo.hasAudio as boolean) ?? true;
          const handle = await playback.startPlayback(filePath, {
            hasAudio,
            mediaType,
            startTime,
            speed,
          });
          if (!handle.videoStreamUrl && !handle.audioStreamUrl) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:streamReady',
              nodeId: message.nodeId,
              ...this.readNarrativePreviewSessionEnvelope(message),
              error: 'Media stream could not be created for this source.',
            });
            break;
          }
          panelStreams.set(nodeId, handle);
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:streamReady',
            nodeId: message.nodeId,
            ...this.readNarrativePreviewSessionEnvelope(message),
            videoStreamUrl: handle.videoStreamUrl,
            audioStreamUrl: handle.audioStreamUrl,
            videoStreamId: handle.videoStreamId,
            audioStreamId: handle.audioStreamId,
            mediaInfo,
          });
        } catch (error) {
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:streamReady',
            nodeId: message.nodeId,
            ...this.readNarrativePreviewSessionEnvelope(message),
            error: error instanceof Error ? error.message : 'Play failed',
          });
        }
        break;
      }

      case 'media:seek': {
        const nodeId = (message.nodeId as string) ?? '';
        const handle = this._activeStreams.get(webviewPanel)?.get(nodeId);
        if (!handle) break;
        const playback = await this.getMediaPlayback();
        await playback?.seekPlayback(handle, message.time as number);
        break;
      }

      case 'media:pause': {
        const nodeId = (message.nodeId as string) ?? '';
        const handle = this._activeStreams.get(webviewPanel)?.get(nodeId);
        if (!handle) break;
        const playback = await this.getMediaPlayback();
        await playback?.pausePlayback(handle);
        break;
      }

      case 'media:resume': {
        const nodeId = (message.nodeId as string) ?? '';
        const handle = this._activeStreams.get(webviewPanel)?.get(nodeId);
        if (!handle) break;
        const playback = await this.getMediaPlayback();
        await playback?.resumePlayback(handle);
        break;
      }

      case 'media:stop': {
        const nodeId = (message.nodeId as string) ?? '';
        const panelStreams = this._activeStreams.get(webviewPanel);
        const handle = panelStreams?.get(nodeId);
        if (!handle) break;
        const playback = await this.getMediaPlayback();
        await playback?.stopPlayback(handle);
        panelStreams?.delete(nodeId);
        if (panelStreams?.size === 0) {
          this._activeStreams.delete(webviewPanel);
        }
        break;
      }
    }
  }

  private async postMediaPlaybackResponse(
    webviewPanel: vscode.WebviewPanel,
    message: Record<string, unknown>,
  ): Promise<void> {
    logger.debug(
      `Canvas Preview media host response: ${JSON.stringify({
        type: message.type,
        nodeId: message.nodeId,
        error: message.error,
        hasMediaInfo: Boolean(message.mediaInfo),
        hasVideoStreamUrl: Boolean(message.videoStreamUrl),
        hasAudioStreamUrl: Boolean(message.audioStreamUrl),
      })}`,
    );
    const delivered = await webviewPanel.webview.postMessage(message);
    if (!delivered) {
      throw new Error('Media playback response could not be delivered to the Preview webview.');
    }
  }

  private async resolveMediaPlaybackFilePath(
    message: Record<string, unknown>,
    documentUri: vscode.Uri,
    caller: string,
  ): Promise<string | undefined> {
    const documentResourceRef = isDocumentArchiveResourceRef(message.documentResourceRef)
      ? message.documentResourceRef
      : undefined;
    const resourceRef = this.resolvePreviewResourceRef(message.resourceRef, documentResourceRef);
    const assetPath = this.resolveDocumentResourceAssetPath(
      message.assetPath as string | undefined,
    );
    if (!assetPath && !resourceRef) {
      return undefined;
    }
    if (resourceRef) {
      try {
        return await this.resolveResourceRefLocalPreviewPath(resourceRef, caller);
      } catch (error) {
        logger.warn(
          'Media playback resource local path resolution failed; falling back to asset path',
          {
            caller,
            resourceId: resourceRef.id,
            entryPath:
              resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
    if (!assetPath || this.isReusableCanvasPlaybackPreviewSource(assetPath)) {
      return undefined;
    }
    const candidates = await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
      assetPath,
      documentUri,
    );
    return candidates[0];
  }

  private async resolveCanvasMediaLocalFilePath(
    assetPath: string,
    documentUri: vscode.Uri,
    caller: string,
  ): Promise<string> {
    const candidates = await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
      assetPath,
      documentUri,
    );
    const existing = candidates[0];
    if (existing) {
      return existing;
    }

    throw new Error(
      `Media source could not be resolved to an existing local file for ${caller}: ${assetPath}`,
    );
  }

  private async resolveCanvasMaterialLocalFilePath(
    message: Record<string, unknown>,
    documentUri: vscode.Uri,
    caller: string,
  ): Promise<string> {
    const documentResourceRef = isDocumentArchiveResourceRef(message.documentResourceRef)
      ? message.documentResourceRef
      : undefined;
    const resourceRef = this.resolvePreviewResourceRef(message.resourceRef, documentResourceRef);
    if (resourceRef) {
      return this.resolveResourceRefLocalPreviewPath(resourceRef, caller);
    }
    const assetPath = this.resolveDocumentResourceAssetPath(
      typeof message.assetPath === 'string' ? message.assetPath : undefined,
    );
    if (assetPath) {
      return this.resolveCanvasMediaLocalFilePath(assetPath, documentUri, caller);
    }
    throw new Error('Canvas material action requires a stable resource reference or asset path.');
  }

  private resolvePreviewResourceRef(
    resourceRef: unknown,
    documentResourceRef?: DocumentArchiveResourceRef,
  ): ResourceRef | undefined {
    if (isResourceRef(resourceRef)) {
      return resourceRef;
    }
    return documentResourceRef
      ? createDocumentResourceRefFromArchiveRef(documentResourceRef, 'project')
      : undefined;
  }

  private async handlePreviewVariantMessage(
    message: Record<string, unknown>,
    webviewPanel: vscode.WebviewPanel,
    documentUri: vscode.Uri,
  ): Promise<boolean> {
    const requestId = message.requestId as string | undefined;
    const documentResourceRef = isDocumentArchiveResourceRef(message.documentResourceRef)
      ? message.documentResourceRef
      : undefined;
    const resourceRef = this.resolvePreviewResourceRef(message.resourceRef, documentResourceRef);
    const assetPath = this.resolveDocumentResourceAssetPath(
      message.assetPath as string | undefined,
    );
    const role = message.role as ResourceVariantRole | undefined;
    const mediaTypeHint = message.mediaType as string | undefined;
    if (!requestId) return false;
    const context: PreviewResourceVariantRequestContext = {
      requestId,
      ...(typeof message.sourceId === 'string' ? { sourceId: message.sourceId } : {}),
    };
    if (!assetPath && !resourceRef) {
      return webviewPanel.webview.postMessage({
        type: 'preview:variantResolved',
        requestId,
        error: 'Preview variant request did not include a resolvable asset or resource reference.',
      });
    }

    try {
      const projectedDocumentResource = await this.projectDocumentResourcePreviewUrl({
        webview: webviewPanel.webview,
        resourceRef: assetPath ? undefined : resourceRef,
        documentResourceRef,
        documentUri,
        assetPath,
        caller: 'neko-canvas.document-resource-variant',
        role,
        requestContext: context,
      });
      if (projectedDocumentResource) {
        if (resourceRef) {
          this.logPreviewVariantResolved(
            resourceRef,
            'neko-canvas.document-resource-variant',
            context,
          );
        }
        return webviewPanel.webview.postMessage({
          type: 'preview:variantResolved',
          requestId,
          url: projectedDocumentResource,
        });
      }
      if (!assetPath) {
        throw new Error(
          'Resource cache variant could not be materialized for this document reference.',
        );
      }
      const fsPath = await this.resolvePreviewVariantAssetPath(assetPath, documentUri);
      if (!fsPath) {
        throw new Error('Preview variant source could not be resolved to a local file.');
      }
      if (role === 'source') {
        const projection = await this.localResourceAccess.toWebviewUri(
          webviewPanel.webview,
          fsPath,
          {
            caller: 'neko-canvas.source-image-preview',
            extraRoots: [
              ...(webviewPanel.webview.options.localResourceRoots ?? []),
              ...this.getCanvasLocalResourceRoots(documentUri),
            ],
          },
        );
        if (projection.ok) {
          return webviewPanel.webview.postMessage({
            type: 'preview:variantResolved',
            requestId,
            url: projection.uri,
          });
        }
      }
      const variantApi = await this.getPreviewVariantApi();
      if (variantApi) {
        const panoramicRoute = getPanoramicPreviewRoute({
          filePath: fsPath,
          mediaType: mediaTypeHint,
        });
        const manifest = await variantApi.registerPreviewAsset({
          source: fsPath,
          kind:
            panoramicRoute?.kind ??
            (mediaTypeHint === 'image' || mediaTypeHint === 'video' || mediaTypeHint === 'audio'
              ? mediaTypeHint
              : 'unknown'),
          expectedProjection: panoramicRoute ? 'equirectangular' : undefined,
        });
        const variant = await variantApi.requestPreviewVariant(manifest.assetId, {
          role: role ?? 'thumbnail',
          width: 640,
          height: 360,
        });
        const sourceFallbackUrl =
          role === 'thumbnail' && mediaTypeHint === 'video'
            ? undefined
            : manifest.variants.find((item) => item.role === 'source')?.url;
        return webviewPanel.webview.postMessage({
          type: 'preview:variantResolved',
          requestId,
          url: variant.url ?? sourceFallbackUrl,
        });
      }

      throw new Error(
        'Media path is outside authorized Webview roots. Add its folder as a media library or move it into the workspace.',
      );
    } catch (error) {
      logger.warn('Preview variant resolution failed', {
        requestId,
        sourceId: context.sourceId,
        resourceId: resourceRef?.id,
        entryPath:
          resourceRef?.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      return webviewPanel.webview.postMessage({
        type: 'preview:variantResolved',
        requestId,
        error: error instanceof Error ? error.message : 'Preview variant resolution failed',
      });
    }
  }

  private async materializeCompositeRequestRuntimePaths(
    request: CanvasCreateCompositeRequest,
  ): Promise<CanvasCreateCompositeRequest> {
    const webview = this.activeWebviewPanel?.webview;
    const documentUri = this.activeDocument?.uri;
    if (!webview) return request;

    const children = await Promise.all(
      request.children.map(async (child) => {
        if (child.type !== 'shot' || !child.data) {
          return child;
        }
        const data = { ...child.data };
        if (documentUri) {
          await this.materializeShotReferencePreview(data, webview, documentUri);
        }
        return { ...child, data };
      }),
    );

    return {
      ...request,
      children,
    };
  }

  /** Convert stored asset paths to webview URIs so the webview can display them */
  private async normalizeCanvasPathsForLoad(
    data: Record<string, unknown>,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<void> {
    const nodes = data['nodes'] as Array<Record<string, unknown>> | undefined;
    if (!nodes) return;

    for (const node of nodes) {
      const nodeData = node['data'] as Record<string, unknown> | undefined;
      if (!nodeData) continue;

      if (node['type'] === 'shot') {
        await this.materializeShotReferencePreview(nodeData, webview, documentUri);
        continue;
      }

      if (node['type'] !== 'media') continue;

      for (const [key, runtimeKey] of [
        ['assetPath', 'runtimeAssetPath'],
        ['thumbnailPath', 'runtimeThumbnailPath'],
      ] as const) {
        const value = nodeData[key];
        if (typeof value !== 'string' || !value) continue;
        try {
          const uri = await this.projectCanvasMediaLocalFile(
            webview,
            value,
            documentUri,
            'neko-canvas.load-node-media',
          );
          if (uri) {
            nodeData[runtimeKey] = uri;
          }
        } catch {
          // leave as-is if resolution fails
        }
      }
      await this.materializeDocumentResourcePreview(nodeData, webview, documentUri);
    }
  }

  private async projectCanvasMediaLocalFile(
    webview: vscode.Webview,
    source: string,
    documentUri: vscode.Uri,
    caller: string,
  ): Promise<string | undefined> {
    for (const fsPath of await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
      source,
      documentUri,
    )) {
      const projection = await this.localResourceAccess.toWebviewUri(webview, fsPath, {
        caller,
        extraRoots: [
          ...(webview.options.localResourceRoots ?? []),
          ...this.getCanvasLocalResourceRoots(documentUri),
          vscode.Uri.file(path.dirname(fsPath)),
        ],
      });
      if (projection.ok) {
        return projection.uri;
      }
    }
    return undefined;
  }

  private async handleCanvasProjectAddSource(
    request: ProjectSourceAddRequest | undefined,
    webview: vscode.Webview,
    documentUri: vscode.Uri,
  ): Promise<void> {
    if (!request) {
      return;
    }
    let sourceRequest: ProjectSourceAddRequest | undefined;
    try {
      sourceRequest = await this.resolveCanvasProjectSourceAddRequest(request, documentUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Canvas source selection failed.';
      void vscode.window.showWarningMessage(message);
      await postProjectSourceAddResult(
        {
          requestId: request.requestId,
          ok: false,
          diagnostics: [
            createProjectFileDiagnostic({
              code: 'unsupported-canvas-source-selection',
              message,
              recoverability: 'retry',
            }),
          ],
        },
        {
          postMessage: (result) => webview.postMessage(result),
          logger,
        },
      );
      return;
    }
    if (!sourceRequest) {
      await postProjectSourceAddResult(this.createCanvasProjectSourceAddCancelledResult(request), {
        postMessage: (message) => webview.postMessage(message),
        logger,
      });
      return;
    }
    await handleProjectSourceAddHostRequest(sourceRequest, {
      addSource: (sourceRequest) =>
        this.addCanvasProjectSource(
          normalizeVSCodeProjectSourceAddRequest(sourceRequest),
          webview,
          documentUri,
        ),
      postMessage: (message) => webview.postMessage(message),
      logger,
    });
  }

  private async resolveCanvasProjectSourceAddRequest(
    request: ProjectSourceAddRequest,
    documentUri: vscode.Uri,
  ): Promise<ProjectSourceAddRequest | undefined> {
    if (request.kind !== 'file-picker' || request.sourcePath || request.sourceUri) {
      return request;
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: this.createCanvasProjectSourcePickerFilters(request),
    });
    const uri = uris?.[0];
    if (!uri) {
      return undefined;
    }

    return this.createCanvasPickerSourceAddRequest(uri, documentUri, {
      request,
      caller: request.caller ?? 'neko-canvas.project-add-source.file-picker',
    });
  }

  private createCanvasProjectSourcePickerFilters(
    request: ProjectSourceAddRequest,
  ): Record<string, string[]> {
    const assetKind = readCanvasProjectSourceAddAssetKind(
      request,
      readCanvasProjectSourceAddFileName(request),
    );
    switch (assetKind) {
      case 'media':
        return {
          Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
          Videos: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
          Audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
          'All Files': ['*'],
        };
      case 'script':
      case 'text':
        return { 'Text Files': ['md', 'markdown', 'txt', 'log', 'fountain'] };
      case 'document':
        return {
          Documents: ['pdf', 'docx', 'epub', 'cbz'],
          'All Files': ['*'],
        };
      case 'model':
        return { Models: ['safetensors', 'ckpt', 'pt', 'pth', 'bin'], 'All Files': ['*'] };
      case 'canvas':
        return { 'Neko Canvas': ['nkc'], 'All Files': ['*'] };
      case 'project':
        return { 'Neko Projects': ['nkv'], 'All Files': ['*'] };
      default:
        return {
          Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
          Videos: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
          Audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
          'Text Files': ['md', 'markdown', 'txt', 'log', 'fountain'],
          Documents: ['pdf', 'docx', 'epub', 'cbz'],
          Models: ['safetensors', 'ckpt', 'pt', 'pth', 'bin'],
          'Neko Canvas': ['nkc'],
          'Neko Projects': ['nkv'],
          'All Files': ['*'],
        };
    }
  }

  private createCanvasProjectSourceAddCancelledResult(
    request: ProjectSourceAddRequest,
  ): ProjectSourceAddResult {
    return {
      requestId: request.requestId,
      ok: false,
      diagnostics: [
        createProjectFileDiagnostic({
          code: 'add-source-cancelled',
          message: 'Canvas source selection was cancelled.',
          recoverability: 'retry',
        }),
      ],
    };
  }

  private createCanvasPickerSourceAddRequest(
    uri: vscode.Uri,
    documentUri: vscode.Uri,
    options: {
      readonly request: ProjectSourceAddRequest;
      readonly caller: string;
    },
  ): ProjectSourceAddRequest {
    const fileName =
      path.basename(uri.fsPath) || readCanvasProjectSourceAddFileName(options.request);
    const requestedAssetKind = readCanvasProjectSourceAddAssetKind(
      options.request,
      readCanvasProjectSourceAddFileName(options.request),
    );
    const assetKind = resolveCanvasPickerAssetKind(requestedAssetKind, fileName);
    const mediaType = assetKind === 'media' ? inferCanvasMediaType(fileName) : undefined;
    const textFormat = assetKind === 'text' ? inferCanvasTextFileFormat(fileName) : undefined;
    const docType = assetKind === 'document' ? inferCanvasDocumentType(fileName) : undefined;
    const modelType = assetKind === 'model' ? inferCanvasModelType(fileName) : undefined;
    const projectType = assetKind === 'project' ? inferNkProjectType(fileName) : undefined;
    const metadata = {
      ...(options.request.metadata ?? {}),
      canvasAdd: true,
      ...(assetKind ? { canvasAssetKind: assetKind } : {}),
      name: fileName,
      title: fileName.replace(/\.[^.]+$/, '') || fileName,
      ...(mediaType ? { mediaType } : {}),
      ...(textFormat ? { textFormat } : {}),
      ...(docType ? { docType } : {}),
      ...(modelType ? { modelType } : {}),
      ...(projectType ? { projectType } : {}),
    };
    return createVSCodeProjectSourceAddRequest({
      requestId: options.request.requestId,
      kind: 'file-picker',
      formatId: 'nkc',
      sourceUri: uri,
      role:
        assetKind === 'project'
          ? 'project'
          : assetKind === 'document' || assetKind === 'script' || assetKind === 'text'
            ? 'document'
            : assetKind === 'model'
              ? 'model'
              : mediaType === 'audio'
                ? 'audio'
                : mediaType === 'image'
                  ? 'image'
                  : assetKind === 'media'
                    ? 'media'
                    : 'other',
      destination: {
        kind: 'project',
        directory: mediaType ? 'media' : 'assets',
        copyMode: 'link',
      },
      caller: options.caller,
      metadata,
    });
  }

  private async addCanvasProjectSource(
    request: ProjectSourceAddRequest,
    webview: vscode.Webview,
    documentUri: vscode.Uri,
  ): Promise<ProjectSourceAddResult> {
    const descriptor = readCanvasProjectSourceAddDescriptor(request);
    if (!descriptor) {
      const fileName =
        request.browserFile?.name ?? request.sourcePath ?? request.sourceUri ?? 'source';
      return {
        requestId: request.requestId,
        ok: false,
        diagnostics: [
          {
            code: 'invalid-document',
            severity: 'error',
            message: `Unsupported Canvas source: ${fileName}`,
            recoverability: 'manual',
          },
        ],
      };
    }

    return await handleProjectSourceAddRequest(
      {
        ...request,
        caller: request.caller ?? 'neko-canvas.project-add-source',
        metadata: {
          ...(request.metadata ?? {}),
          ...descriptor.metadata,
        },
      },
      {
        ingest: async (ingestRequest) => {
          const ingest = await ingestProjectSourceAddRequest(ingestRequest, {
            documentPath: documentUri.fsPath,
            assetDirectory: request.destination.directory ?? 'media',
            workspaceContext: this.createCanvasWorkspaceMediaPathContext(documentUri),
            fileOps: this.createCanvasSourceAssetFileOps(),
            contractPath: (absolutePath) => this.contractExternalAssetPath(absolutePath),
            unmanagedSourceMessage:
              'Canvas media must be moved into the project, asset library, or a configured media root before saving.',
          });

          if (ingest.status !== 'ready') {
            return ingest;
          }

          const runtimeSourcePath = ingest.outputPath ?? request.sourcePath;
          let runtimeAssetPath: string | undefined;
          let textContent: string | undefined;
          if (descriptor.mediaType && runtimeSourcePath) {
            runtimeAssetPath = await this.projectCanvasMediaLocalFile(
              webview,
              runtimeSourcePath,
              documentUri,
              'neko-canvas.project-add-source',
            );
          }
          if (descriptor.textFormat) {
            if (!runtimeSourcePath) {
              return {
                ...ingest,
                status: 'failed',
                error: 'Canvas text import did not produce a readable source path.',
              };
            }
            const resolvedTextPath = path.isAbsolute(runtimeSourcePath)
              ? runtimeSourcePath
              : await this.resolveAssetPath(runtimeSourcePath, documentUri);
            const textResult = await readCanvasTextDocumentProjection(
              {
                type: 'textDocument:read',
                requestId: request.requestId,
                nodeId: `text-import:${request.requestId}`,
                docPath: descriptor.fileName,
                docType: descriptor.textFormat === 'markdown' ? 'markdown' : 'text',
              },
              resolvedTextPath,
              {
                stat: async (filePath) => {
                  const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
                  return { size: stat.size, isFile: stat.type === vscode.FileType.File };
                },
                readFile: async (filePath) =>
                  vscode.workspace.fs.readFile(vscode.Uri.file(filePath)),
              },
            );
            if (textResult.status === 'error') {
              return { ...ingest, status: 'failed', error: textResult.error };
            }
            textContent = textResult.text;
          }

          return {
            ...ingest,
            metadata: {
              ...(ingest.metadata ?? {}),
              ...(request.metadata ?? {}),
              ...descriptor.metadata,
              ...(runtimeAssetPath ? { runtimeAssetPath } : {}),
              ...(textContent !== undefined ? { textContent } : {}),
            },
          };
        },
      },
    );
  }

  private createCanvasSourceAssetFileOps() {
    return {
      createDirectory: async (dirPath: string) =>
        vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
      fileExists: async (filePath: string) => {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
          return true;
        } catch {
          return false;
        }
      },
      writeFile: async (filePath: string, bytes: Uint8Array) =>
        vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes),
    };
  }

  private async projectDocumentResourcePreviewUrl(input: {
    readonly webview: vscode.Webview;
    readonly resourceRef?: ResourceRef;
    readonly documentResourceRef?: DocumentArchiveResourceRef;
    readonly documentUri?: vscode.Uri;
    readonly assetPath?: string;
    readonly caller: string;
    readonly role?: ResourceVariantRole;
    readonly requestContext?: PreviewResourceVariantRequestContext;
  }): Promise<string | undefined> {
    if (input.resourceRef) {
      try {
        const projected = await this.projectResourceCacheVariant(
          input.webview,
          input.resourceRef,
          input.caller,
          input.role,
          input.requestContext,
        );
        if (projected) {
          return projected;
        }
      } catch (error) {
        logger.warn('Document resource cache Preview projection failed', {
          caller: input.caller,
          requestId: input.requestContext?.requestId,
          sourceId: input.requestContext?.sourceId,
          resourceId: input.resourceRef.id,
          entryPath:
            input.resourceRef.locator?.kind === 'document'
              ? input.resourceRef.locator.entryPath
              : undefined,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const fallbackPath = this.resolveDocumentResourceAssetPath(input.assetPath);
    if (!fallbackPath) {
      return undefined;
    }
    try {
      const fsPaths = input.documentUri
        ? await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
            fallbackPath,
            input.documentUri,
          )
        : this.isExistingLocalFile(fallbackPath)
          ? [fallbackPath]
          : [];
      for (const fsPath of fsPaths) {
        const projection = await this.localResourceAccess.toWebviewUri(input.webview, fsPath, {
          caller: input.caller,
          extraRoots: input.documentUri
            ? [
                ...(input.webview.options.localResourceRoots ?? []),
                ...this.getCanvasLocalResourceRoots(input.documentUri),
              ]
            : input.webview.options.localResourceRoots,
        });
        if (projection.ok) {
          return projection.uri;
        }
      }
    } catch (error) {
      logger.warn(`Document resource Preview fallback projection failed: ${error}`);
    }
    return undefined;
  }

  private async materializeDocumentResourcePreview(
    nodeData: Record<string, unknown>,
    webview: vscode.Webview,
    documentUri: vscode.Uri,
  ): Promise<void> {
    const documentResourceRef = isDocumentArchiveResourceRef(nodeData['documentResourceRef'])
      ? nodeData['documentResourceRef']
      : undefined;
    const unifiedResourceRef = this.resolvePreviewResourceRef(
      nodeData['resourceRef'],
      documentResourceRef,
    );
    const projected = await this.projectDocumentResourcePreviewUrl({
      webview,
      resourceRef: unifiedResourceRef,
      documentResourceRef,
      documentUri,
      caller: 'neko-canvas.document-resource-preview',
    });
    if (projected) {
      nodeData['runtimeAssetPath'] = projected;
      delete nodeData['documentResourceStatus'];
      return;
    }
    if (isResourceRef(unifiedResourceRef)) {
      this.markDocumentResourceUnavailable(nodeData, 'cache-missing');
      return;
    }

    if (documentResourceRef) {
      this.markDocumentResourceUnavailable(nodeData, 'cache-missing');
    }
  }

  private async materializeShotReferencePreview(
    nodeData: Record<string, unknown>,
    webview: vscode.Webview,
    documentUri: vscode.Uri,
  ): Promise<void> {
    const referenceImageResourceRef = isDocumentArchiveResourceRef(
      nodeData['referenceImageResourceRef'],
    )
      ? nodeData['referenceImageResourceRef']
      : undefined;
    const unifiedResourceRef = this.resolvePreviewResourceRef(
      nodeData['referenceResourceRef'],
      referenceImageResourceRef,
    );
    delete nodeData['runtimeReferenceImagePath'];
    delete nodeData['documentResourceStatus'];

    const projected = await this.projectDocumentResourcePreviewUrl({
      webview,
      resourceRef: unifiedResourceRef,
      documentResourceRef: referenceImageResourceRef,
      documentUri,
      caller: 'neko-canvas.shot-reference-preview',
    });
    if (projected) {
      nodeData['runtimeReferenceImagePath'] = projected;
      delete nodeData['documentResourceStatus'];
      return;
    }
    if (isResourceRef(unifiedResourceRef)) {
      this.markDocumentResourceUnavailable(nodeData, 'cache-missing');
      return;
    }

    if (referenceImageResourceRef) {
      this.markDocumentResourceUnavailable(nodeData, 'cache-missing');
    }
  }

  private async enrichCanvasPlaybackPlanForPreview(
    plan: CanvasPlaybackPlan,
    canvasData: Record<string, unknown>,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<CanvasPlaybackPlan> {
    const nodeById = this.createCanvasNodeLookup(canvasData);
    const units = await Promise.all(
      plan.units.map(async (unit) => {
        const node = nodeById.get(unit.sourceNodeId);
        if (!node) return unit;
        const previewSource = await this.resolveCanvasPlaybackUnitPreviewSource(
          node,
          documentUri,
          webview,
        );
        if (!previewSource) return unit;
        return {
          ...unit,
          metadata: {
            ...(unit.metadata ?? {}),
            previewUrl: previewSource.url,
            previewSourceKind: previewSource.kind,
            ...(previewSource.label ? { previewSourceLabel: previewSource.label } : {}),
            ...(previewSource.mediaType ? { previewMediaType: previewSource.mediaType } : {}),
            ...(previewSource.refId ? { previewSourceRefId: previewSource.refId } : {}),
            ...(previewSource.playableAssetPath
              ? { previewPlayableAssetPath: previewSource.playableAssetPath }
              : {}),
            ...(previewSource.source?.source
              ? { previewSourceAssetPath: previewSource.source.source }
              : {}),
            ...(previewSource.source?.resourceRef
              ? { previewSourceResourceRef: previewSource.source.resourceRef }
              : {}),
            ...(previewSource.source?.documentResourceRef
              ? { previewSourceDocumentResourceRef: previewSource.source.documentResourceRef }
              : {}),
          },
        };
      }),
    );
    return { ...plan, units };
  }

  private createCanvasNodeLookup(canvasData: Record<string, unknown>): Map<string, CanvasNode> {
    const nodes = canvasData['nodes'];
    const lookup = new Map<string, CanvasNode>();
    if (!Array.isArray(nodes)) {
      return lookup;
    }
    for (const node of nodes) {
      if (
        node &&
        typeof node === 'object' &&
        !Array.isArray(node) &&
        typeof (node as { id?: unknown }).id === 'string'
      ) {
        const candidate = node as CanvasNode;
        lookup.set(candidate.id, candidate);
      }
    }
    return lookup;
  }

  private async resolveCanvasPlaybackUnitPreviewSource(
    node: CanvasNode,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<CanvasPlaybackPreviewSourceProjection | undefined> {
    if (node.type === 'shot') {
      return this.resolveShotPlaybackPreviewSource(node, documentUri, webview);
    }
    if (node.type === 'media') {
      return this.resolveMediaPlaybackPreviewSource(node, documentUri, webview);
    }
    return undefined;
  }

  private async resolveShotPlaybackPreviewSource(
    node: CanvasNode,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<CanvasPlaybackPreviewSourceProjection | undefined> {
    const data = node.data as Record<string, unknown>;
    const selectedGeneration = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readSelectedGenerationCandidatePreviewSource(data),
      documentUri,
      webview,
      'neko-canvas.preview-playback-selected-generation',
    );
    if (selectedGeneration) {
      return {
        url: selectedGeneration.url,
        kind: 'generated-image',
        mediaType: 'image',
        source: selectedGeneration.source,
        playableAssetPath: selectedGeneration.playableAssetPath,
      };
    }

    const generatedImage = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readPreviewSourceCandidate(data['generatedImage']),
      documentUri,
      webview,
      'neko-canvas.preview-playback-generated-image',
    );
    if (generatedImage) {
      return {
        url: generatedImage.url,
        kind: 'generated-image',
        mediaType: 'image',
        source: generatedImage.source,
        playableAssetPath: generatedImage.playableAssetPath,
      };
    }
    const generatedAsset = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readPreviewSourceCandidate(data['generatedAsset']),
      documentUri,
      webview,
      'neko-canvas.preview-playback-generated-asset',
    );
    if (generatedAsset) {
      return {
        url: generatedAsset.url,
        kind: 'generated-image',
        mediaType: 'image',
        source: generatedAsset.source,
        playableAssetPath: generatedAsset.playableAssetPath,
      };
    }

    const generatedMediaUrl = await this.resolveShotMediaRefsPlaybackPreviewSource(
      this.readStoryboardMediaRefArray(data['generatedMediaRefs']),
      documentUri,
      webview,
      'generated-media',
      'neko-canvas.preview-playback-shot-generated-media-ref',
    );
    if (generatedMediaUrl) {
      return generatedMediaUrl;
    }

    const prepOutputMediaUrl = await this.resolveShotMediaRefsPlaybackPreviewSource(
      this.readStoryboardMediaRefArray(
        this.readNestedRecord(data['shotImagePrepPlan'])?.['outputMediaRefs'],
      ),
      documentUri,
      webview,
      'generated-media',
      'neko-canvas.preview-playback-shot-prep-output-media-ref',
    );
    if (prepOutputMediaUrl) {
      return prepOutputMediaUrl;
    }

    const runtimeReferenceImage = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readPreviewSourceCandidate(data['runtimeReferenceImagePath']),
      documentUri,
      webview,
      'neko-canvas.preview-playback-runtime-reference',
    );
    if (runtimeReferenceImage) {
      return {
        url: runtimeReferenceImage.url,
        kind: 'reference-image',
        mediaType: 'image',
        source: runtimeReferenceImage.source,
        playableAssetPath: runtimeReferenceImage.playableAssetPath,
      };
    }

    const referenceImageResourceRef = isDocumentArchiveResourceRef(
      data['referenceImageResourceRef'],
    )
      ? data['referenceImageResourceRef']
      : undefined;
    const resourceRef = this.resolvePreviewResourceRef(
      data['referenceResourceRef'],
      referenceImageResourceRef,
    );
    const projected = await this.projectDocumentResourcePreviewUrl({
      resourceRef,
      documentResourceRef: referenceImageResourceRef,
      webview,
      documentUri,
      caller: 'neko-canvas.preview-playback-shot-reference',
    });
    if (projected) {
      const referenceImagePath = this.readPreviewSourceString(data['referenceImagePath']);
      const playableAssetPath = await this.resolveCanvasPlaybackPreviewPlayableAssetPath(
        {
          ...(referenceImagePath ? { source: referenceImagePath } : {}),
          ...(referenceImageResourceRef ? { documentResourceRef: referenceImageResourceRef } : {}),
          ...(resourceRef ? { resourceRef } : {}),
        },
        resourceRef,
        documentUri,
        'neko-canvas.preview-playback-shot-reference',
      );
      return {
        url: projected,
        kind: 'reference-image',
        mediaType: 'image',
        source: {
          ...(resourceRef ? { resourceRef } : {}),
          ...(referenceImageResourceRef ? { documentResourceRef: referenceImageResourceRef } : {}),
        },
        playableAssetPath,
      };
    }

    const referenceImage = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readPreviewSourceCandidate(data['referenceImagePath']),
      documentUri,
      webview,
      'neko-canvas.preview-playback-shot-reference-path',
    );
    if (referenceImage) {
      return {
        url: referenceImage.url,
        kind: 'reference-image',
        mediaType: 'image',
        source: referenceImage.source,
        playableAssetPath: referenceImage.playableAssetPath,
      };
    }

    return this.resolveShotMediaRefsPlaybackPreviewSource(
      [
        ...this.readStoryboardMediaRefArray(data['sourceMediaRefs']),
        ...this.readStoryboardMediaRefArray(data['mediaRefs']),
      ],
      documentUri,
      webview,
      'source-media',
      'neko-canvas.preview-playback-shot-media-ref',
    );
  }

  private async resolveShotMediaRefsPlaybackPreviewSource(
    mediaRefs: readonly Record<string, unknown>[],
    documentUri: vscode.Uri,
    webview: vscode.Webview,
    sourceKind: CanvasPlaybackPreviewSourceKind,
    caller: string,
  ): Promise<CanvasPlaybackPreviewSourceProjection | undefined> {
    for (const mediaRef of this.sortStoryboardPreviewMediaRefs(mediaRefs)) {
      const candidate = this.readStoryboardMediaRefPreviewSource(mediaRef);
      const projected = await this.resolveCanvasPlaybackPreviewSourceCandidate(
        candidate,
        documentUri,
        webview,
        caller,
      );
      if (projected) {
        return {
          url: projected.url,
          kind: sourceKind,
          label: this.readPreviewSourceString(mediaRef['label']),
          mediaType: this.resolveStoryboardMediaRefMediaType(mediaRef, projected.url),
          refId: this.readPreviewSourceString(mediaRef['refId']),
          source: projected.source,
          playableAssetPath: projected.playableAssetPath,
        };
      }
    }
    return undefined;
  }

  private sortStoryboardPreviewMediaRefs(
    mediaRefs: readonly Record<string, unknown>[],
  ): readonly Record<string, unknown>[] {
    const refs = mediaRefs.filter((ref) =>
      this.hasCanvasPlaybackPreviewSourceCandidate(this.readStoryboardMediaRefPreviewSource(ref)),
    );
    const imageRefs = refs.filter((ref) => this.isStoryboardImageMediaRef(ref));
    return imageRefs.length > 0 ? imageRefs : refs;
  }

  private readStoryboardMediaRefArray(value: unknown): readonly Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
      : [];
  }

  private isStoryboardImageMediaRef(ref: Record<string, unknown>): boolean {
    const mimeType = this.readPreviewSourceString(ref['mimeType']);
    if (mimeType?.toLowerCase().startsWith('image/')) {
      return true;
    }
    const pathValue = this.readStoryboardMediaRefPreviewSource(ref);
    const source = pathValue?.source;
    return Boolean(
      source && /\.(avif|gif|jpe?g|png|webp)$/i.test(source.split(/[?#]/)[0] ?? source),
    );
  }

  private readStoryboardMediaRefPreviewSource(
    ref: Record<string, unknown>,
  ): CanvasPlaybackPreviewSourceCandidate | undefined {
    const directCandidate = this.readPreviewSourceCandidate(ref);
    if (this.hasCanvasPlaybackPreviewSourceCandidate(directCandidate)) {
      return directCandidate;
    }

    const locator = this.readNestedRecord(ref['locator']);
    if (!locator) {
      return undefined;
    }
    return this.readPreviewSourceCandidate(locator);
  }

  private resolveStoryboardMediaRefMediaType(
    mediaRef: Record<string, unknown>,
    source: string,
  ): string | undefined {
    const mimeType = this.readPreviewSourceString(mediaRef['mimeType']);
    if (mimeType?.startsWith('image/')) return 'image';
    if (mimeType?.startsWith('video/')) return 'video';
    if (mimeType?.startsWith('audio/')) return 'audio';
    const clean = source.split(/[?#]/)[0]?.toLowerCase() ?? source.toLowerCase();
    if (/\.(avif|gif|jpe?g|png|webp)$/.test(clean)) return 'image';
    if (/\.(m4v|mkv|mov|mp4|webm)$/.test(clean)) return 'video';
    if (/\.(aac|flac|m4a|mp3|ogg|wav)$/.test(clean)) return 'audio';
    return undefined;
  }

  private async resolveMediaPlaybackPreviewSource(
    node: CanvasNode,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<CanvasPlaybackPreviewSourceProjection | undefined> {
    const data = node.data as Record<string, unknown>;
    const documentResourceRef = isDocumentArchiveResourceRef(data['documentResourceRef'])
      ? data['documentResourceRef']
      : undefined;
    const resourceRef = this.resolvePreviewResourceRef(data['resourceRef'], documentResourceRef);
    const projected = await this.projectDocumentResourcePreviewUrl({
      resourceRef,
      documentResourceRef,
      webview,
      documentUri,
      caller: 'neko-canvas.preview-playback-media-resource',
    });
    if (projected) {
      const mediaAssetPath = this.readPreviewSourceString(data['assetPath']);
      const playableAssetPath = await this.resolveCanvasPlaybackPreviewPlayableAssetPath(
        {
          ...(mediaAssetPath ? { source: mediaAssetPath } : {}),
          ...(documentResourceRef ? { documentResourceRef } : {}),
          ...(resourceRef ? { resourceRef } : {}),
        },
        resourceRef,
        documentUri,
        'neko-canvas.preview-playback-media-resource',
      );
      return {
        url: projected,
        kind: 'media-asset',
        mediaType: this.readPreviewSourceString(data['mediaType']),
        source: {
          ...(resourceRef ? { resourceRef } : {}),
          ...(documentResourceRef ? { documentResourceRef } : {}),
        },
        playableAssetPath,
      };
    }
    const asset = await this.resolveCanvasPlaybackPreviewSourceCandidate(
      this.readPreviewSourceCandidate({
        assetPath: this.resolveDocumentResourceAssetPath(
          this.readPreviewSourceString(data['assetPath']),
        ),
      }),
      documentUri,
      webview,
      'neko-canvas.preview-playback-media-path',
    );
    return asset
      ? {
          url: asset.url,
          kind: 'media-asset',
          mediaType: this.readPreviewSourceString(data['mediaType']),
          source: asset.source,
          playableAssetPath: asset.playableAssetPath,
        }
      : undefined;
  }

  private readSelectedGenerationCandidatePreviewSource(
    data: Record<string, unknown>,
  ): CanvasPlaybackPreviewSourceCandidate | undefined {
    const history = data['generationHistory'];
    if (!Array.isArray(history)) {
      return undefined;
    }
    const selected = history.find(
      (candidate): candidate is Record<string, unknown> =>
        Boolean(candidate) &&
        typeof candidate === 'object' &&
        !Array.isArray(candidate) &&
        candidate['selected'] === true,
    );
    if (!selected) {
      return undefined;
    }
    return this.readPreviewSourceCandidate(selected);
  }

  private async resolveCanvasPlaybackPreviewSourceCandidate(
    candidate: CanvasPlaybackPreviewSourceCandidate | undefined,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
    caller: string,
  ): Promise<CanvasPlaybackPreviewSourceResolution | undefined> {
    if (!this.hasCanvasPlaybackPreviewSourceCandidate(candidate)) {
      return undefined;
    }
    const resourceRef = this.resolvePreviewResourceRef(
      candidate.resourceRef,
      candidate.documentResourceRef,
    );

    if (!resourceRef && !candidate.documentResourceRef) {
      const localSource = await this.resolveCanvasPlaybackLocalPreviewSource(
        candidate.source,
        documentUri,
        webview,
        caller,
      );
      return localSource
        ? { url: localSource.url, source: candidate, playableAssetPath: localSource.fsPath }
        : undefined;
    }

    const projectedResource = await this.projectDocumentResourcePreviewUrl({
      webview,
      resourceRef,
      documentResourceRef: candidate.documentResourceRef,
      documentUri,
      assetPath: candidate.source,
      caller,
    });
    const playableAssetPath = await this.resolveCanvasPlaybackPreviewPlayableAssetPath(
      candidate,
      resourceRef,
      documentUri,
      caller,
    );
    if (projectedResource) {
      return { url: projectedResource, source: candidate, playableAssetPath };
    }
    const localSource = await this.resolveCanvasPlaybackLocalPreviewSource(
      this.resolveDocumentResourceAssetPath(candidate.source),
      documentUri,
      webview,
      caller,
    );
    return localSource
      ? { url: localSource.url, source: candidate, playableAssetPath: localSource.fsPath }
      : undefined;
  }

  private async resolveCanvasPlaybackLocalPreviewSource(
    value: string | undefined,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
    caller: string,
  ): Promise<{ readonly url: string; readonly fsPath?: string } | undefined> {
    const source = this.readPreviewSourceString(value);
    if (!source) return undefined;
    if (this.isReusableCanvasPlaybackPreviewSource(source)) {
      return { url: source };
    }
    for (const fsPath of await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
      source,
      documentUri,
    )) {
      const projected = await this.localResourceAccess.toWebviewUri(webview, fsPath, {
        caller,
        extraRoots: [
          ...(webview.options.localResourceRoots ?? []),
          ...this.getCanvasLocalResourceRoots(documentUri),
        ],
      });
      if (projected.ok) {
        return { url: projected.uri, fsPath };
      }
    }
    return undefined;
  }

  private async resolveCanvasPlaybackPreviewPlayableAssetPath(
    candidate: CanvasPlaybackPreviewSourceCandidate,
    resourceRef: ResourceRef | undefined,
    documentUri: vscode.Uri,
    caller: string,
  ): Promise<string | undefined> {
    const assetPath = this.resolveDocumentResourceAssetPath(candidate.source);
    if (assetPath && !this.isReusableCanvasPlaybackPreviewSource(assetPath)) {
      const localCandidates = await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
        assetPath,
        documentUri,
      );
      for (const fsPath of localCandidates) {
        if (
          await this.localResourceAccess.isAuthorizedPath(fsPath, {
            extraRoots: this.getCanvasLocalResourceRoots(documentUri),
          })
        ) {
          return fsPath;
        }
      }
    }

    if (!resourceRef) {
      return undefined;
    }
    try {
      return await this.resolveResourceRefLocalPreviewPath(resourceRef, caller);
    } catch (error) {
      logger.warn('Preview playback resource local path resolution failed', {
        caller,
        resourceId: resourceRef.id,
        entryPath:
          resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private async resolveCanvasPlaybackLocalPreviewPathCandidates(
    source: string,
    documentUri: vscode.Uri,
  ): Promise<readonly string[]> {
    const candidates: string[] = [];
    for (const resolved of this.resolveWorkspaceMediaPathExistingCandidates(source, documentUri)) {
      this.appendExistingCanvasPlaybackPreviewPathCandidate(candidates, resolved);
    }
    try {
      this.appendExistingCanvasPlaybackPreviewPathCandidate(
        candidates,
        await this.resolveAssetPath(source, documentUri),
      );
    } catch (error) {
      logger.warn(`Preview playback source path resolution failed: ${error}`);
    }
    const workspaceRelativePath = this.readWorkspaceRelativeCanvasAssetPath(source);
    if (workspaceRelativePath) {
      for (const resolved of this.resolveRootRelativeCanvasAssetPathCandidates(
        workspaceRelativePath,
        documentUri,
      )) {
        this.appendExistingCanvasPlaybackPreviewPathCandidate(candidates, resolved);
      }
    }
    const projectRelativePath = this.readRootRelativeCanvasAssetPath(source);
    if (projectRelativePath) {
      for (const resolved of this.resolveRootRelativeCanvasAssetPathCandidates(
        projectRelativePath,
        documentUri,
      )) {
        this.appendExistingCanvasPlaybackPreviewPathCandidate(candidates, resolved);
      }
      const normalizedProjectRelativePath =
        this.normalizeWorkspaceRelativeCanvasAssetPath(projectRelativePath);
      if (normalizedProjectRelativePath && normalizedProjectRelativePath !== projectRelativePath) {
        for (const resolved of this.resolveRootRelativeCanvasAssetPathCandidates(
          normalizedProjectRelativePath,
          documentUri,
        )) {
          this.appendExistingCanvasPlaybackPreviewPathCandidate(candidates, resolved);
        }
      }
    }
    const documentRelativePath = this.readSlashPrefixedDocumentRelativeCanvasAssetPath(source);
    if (documentRelativePath) {
      for (const resolved of this.resolveDocumentRelativeCanvasAssetPathCandidates(
        documentRelativePath,
        documentUri,
      )) {
        this.appendExistingCanvasPlaybackPreviewPathCandidate(candidates, resolved);
      }
    }
    return candidates;
  }

  private async resolvePreviewVariantAssetPath(
    assetPath: string,
    documentUri: vscode.Uri,
  ): Promise<string | undefined> {
    if (this.isReusableCanvasPlaybackPreviewSource(assetPath)) {
      return undefined;
    }
    const candidates = await this.resolveCanvasPlaybackLocalPreviewPathCandidates(
      assetPath,
      documentUri,
    );
    return candidates[0];
  }

  private resolveRootRelativeCanvasAssetPathCandidates(
    projectRelativePath: string,
    documentUri: vscode.Uri,
  ): readonly string[] {
    return createWorkspaceMediaPathCandidates(
      projectRelativePath,
      this.createCanvasWorkspaceMediaPathContext(documentUri),
    ).candidates.map((candidate) => candidate.path);
  }

  private resolveDocumentRelativeCanvasAssetPathCandidates(
    documentRelativePath: string,
    documentUri: vscode.Uri,
  ): readonly string[] {
    if (documentUri.scheme !== 'file') {
      return [];
    }
    return [path.normalize(path.join(path.dirname(documentUri.fsPath), documentRelativePath))];
  }

  private createCanvasWorkspaceMediaPathContext(documentUri: vscode.Uri) {
    return createVSCodeWorkspaceMediaPathContext({
      documentUri,
      workspaceFolders: vscode.workspace.workspaceFolders ?? [],
      allowedRoots: this.getCanvasLocalResourceRoots(documentUri).map((root) => root.fsPath),
    });
  }

  private resolveWorkspaceMediaPathExistingCandidates(
    source: string,
    documentUri: vscode.Uri,
  ): readonly string[] {
    const planned = createWorkspaceMediaPathCandidates(
      source,
      this.createCanvasWorkspaceMediaPathContext(documentUri),
    );
    return planned.candidates
      .map((candidate) => candidate.path)
      .filter((candidate) => this.isExistingLocalFile(candidate));
  }

  private appendExistingCanvasPlaybackPreviewPathCandidate(
    candidates: string[],
    fsPath: string,
  ): void {
    if (!this.isExistingLocalFile(fsPath) || candidates.includes(fsPath)) {
      return;
    }
    candidates.push(fsPath);
  }

  private isExistingLocalFile(fsPath: string): boolean {
    try {
      return fs.statSync(fsPath).isFile();
    } catch {
      return false;
    }
  }

  private readRootRelativeCanvasAssetPath(source: string): string | undefined {
    if (!source.startsWith('/') || source.startsWith('//')) {
      return undefined;
    }
    if (fs.existsSync(source)) {
      return undefined;
    }
    const trimmed = source.replace(/^\/+/, '');
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private readSlashPrefixedDocumentRelativeCanvasAssetPath(source: string): string | undefined {
    if (!source.startsWith('/') || source.startsWith('//') || fs.existsSync(source)) {
      return undefined;
    }
    const trimmed = source.replace(/^\/+/, '');
    return trimmed.startsWith('../') || trimmed === '..' ? trimmed : undefined;
  }

  private getDocumentLocalResourceRoots(documentUri: vscode.Uri): readonly vscode.Uri[] {
    return documentUri.scheme === 'file' ? [vscode.Uri.file(path.dirname(documentUri.fsPath))] : [];
  }

  private getCanvasLocalResourceRoots(documentUri: vscode.Uri): readonly vscode.Uri[] {
    const roots: vscode.Uri[] = [];
    for (const root of this.getCanvasWorkspaceRoots(documentUri)) {
      roots.push(root);
    }
    for (const root of this.getDocumentLocalResourceRoots(documentUri)) {
      if (!roots.some((item) => item.fsPath === root.fsPath)) {
        roots.push(root);
      }
    }
    return roots;
  }

  private getCanvasWorkspaceRoots(documentUri: vscode.Uri): readonly vscode.Uri[] {
    const roots: vscode.Uri[] = [];
    const append = (root: vscode.Uri | undefined): void => {
      if (!root || root.scheme !== 'file') return;
      if (!roots.some((item) => item.fsPath === root.fsPath)) {
        roots.push(root);
      }
    };

    append(this.getOwningCanvasWorkspaceRoot(documentUri));
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      append(folder.uri);
    }
    return roots;
  }

  private getOwningCanvasWorkspaceRoot(documentUri: vscode.Uri): vscode.Uri | undefined {
    return vscode.workspace.getWorkspaceFolder(documentUri)?.uri;
  }

  private getNarrativePreviewLocalResourceRoots(
    sourceCanvasUri: string | undefined,
  ): readonly vscode.Uri[] {
    const roots = [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')];
    if (sourceCanvasUri) {
      roots.push(...this.getCanvasLocalResourceRoots(vscode.Uri.parse(sourceCanvasUri)));
    }
    return roots;
  }

  private readPreviewSourceString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readPreviewSourceCandidate(
    value: unknown,
  ): CanvasPlaybackPreviewSourceCandidate | undefined {
    const direct = this.readPreviewSourceString(value);
    if (direct) {
      return { source: direct };
    }

    const record = this.readNestedRecord(value);
    if (!record) {
      return undefined;
    }

    const nestedAssetRef = this.readNestedRecord(record['assetRef']);
    const nestedMetadata = this.readNestedRecord(record['metadata']);
    const resourceRef =
      this.readPreviewResourceRef(record) ??
      this.readPreviewResourceRef(nestedAssetRef) ??
      this.readPreviewResourceRef(nestedMetadata);
    const documentResourceRef =
      this.readPreviewDocumentResourceRef(record) ??
      this.readPreviewDocumentResourceRef(nestedAssetRef) ??
      this.readPreviewDocumentResourceRef(nestedMetadata);
    const source =
      this.readFirstPreviewSourceString(record, [
        'dataUrl',
        'sourcePath',
        'localPath',
        'path',
        'assetPath',
        'uri',
        'filePath',
        'previewUrl',
        'url',
        'src',
        'webviewUri',
        'webviewUrl',
      ]) ??
      this.readFirstPreviewSourceString(nestedAssetRef, [
        'dataUrl',
        'sourcePath',
        'localPath',
        'path',
        'assetPath',
        'uri',
        'filePath',
        'previewUrl',
        'url',
        'src',
        'webviewUri',
        'webviewUrl',
      ]);
    return this.hasCanvasPlaybackPreviewSourceCandidate({
      ...(source ? { source } : {}),
      ...(resourceRef ? { resourceRef } : {}),
      ...(documentResourceRef ? { documentResourceRef } : {}),
    })
      ? {
          ...(source ? { source } : {}),
          ...(resourceRef ? { resourceRef } : {}),
          ...(documentResourceRef ? { documentResourceRef } : {}),
        }
      : undefined;
  }

  private readPreviewResourceRef(
    record: Record<string, unknown> | undefined,
  ): ResourceRef | undefined {
    if (!record) {
      return undefined;
    }
    if (isResourceRef(record['resourceRef'])) {
      return record['resourceRef'];
    }
    return undefined;
  }

  private readWorkspaceRelativeCanvasAssetPath(source: string): string | undefined {
    if (
      !source ||
      source.startsWith('/') ||
      source.startsWith('//') ||
      source.startsWith('${') ||
      /^[A-Za-z]:[\\/]/.test(source) ||
      /^[A-Za-z][A-Za-z\d+.-]*:/.test(source)
    ) {
      return undefined;
    }
    return this.normalizeWorkspaceRelativeCanvasAssetPath(source);
  }

  private normalizeWorkspaceRelativeCanvasAssetPath(source: string): string | undefined {
    const normalized = source.replace(/\\/g, '/').replace(/^\.\/+/, '');
    const workspaceRelative = normalized.replace(/^(?:\.\.\/)+/, '');
    return workspaceRelative.length > 0 ? workspaceRelative : undefined;
  }

  private readPreviewDocumentResourceRef(
    record: Record<string, unknown> | undefined,
  ): DocumentArchiveResourceRef | undefined {
    if (!record) {
      return undefined;
    }
    for (const key of ['documentResourceRef', 'referenceImageResourceRef', 'resourceRef']) {
      const value = record[key];
      if (isDocumentArchiveResourceRef(value)) {
        return value;
      }
    }
    return undefined;
  }

  private hasCanvasPlaybackPreviewSourceCandidate(
    candidate: CanvasPlaybackPreviewSourceCandidate | undefined,
  ): candidate is CanvasPlaybackPreviewSourceCandidate {
    return Boolean(candidate?.source || candidate?.resourceRef || candidate?.documentResourceRef);
  }

  private readFirstPreviewSourceString(
    record: Record<string, unknown> | undefined,
    fields: readonly string[],
  ): string | undefined {
    if (!record) {
      return undefined;
    }
    for (const field of fields) {
      const source = this.readPreviewSourceString(record[field]);
      if (source) {
        return source;
      }
    }
    return undefined;
  }

  private readNestedRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private isReusableCanvasPlaybackPreviewSource(value: string | undefined): value is string {
    if (!value) return false;
    if (/^data:/i.test(value)) {
      return true;
    }
    return /^https:/i.test(value) && !/vscode-resource\.vscode-cdn\.net/i.test(value);
  }

  private async projectResourceCacheVariant(
    webview: vscode.Webview,
    resourceRef: unknown,
    caller: string,
    preferredRole?: ResourceVariantRole,
    requestContext?: PreviewResourceVariantRequestContext,
  ): Promise<string | undefined> {
    const contentAccess = this.contentAccess;
    if (!contentAccess || !isResourceRef(resourceRef)) {
      return undefined;
    }
    const role = resolveCanvasPreviewVariantRole(resourceRef, preferredRole);
    const startedAtMs = Date.now();
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        logger.warn('Preview resource variant resolution timed out', {
          caller,
          requestId: requestContext?.requestId,
          sourceId: requestContext?.sourceId,
          resourceId: resourceRef.id,
          entryPath:
            resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
          timeoutMs: PREVIEW_RESOURCE_VARIANT_TIMEOUT_MS,
        });
        reject(
          new Error(
            `Preview resource variant resolution timed out after ${PREVIEW_RESOURCE_VARIANT_TIMEOUT_MS}ms.`,
          ),
        );
      }, PREVIEW_RESOURCE_VARIANT_TIMEOUT_MS);
    });
    const result = await Promise.race([
      this.withContentAccessWebview(webview, (webviewResolverToken) =>
        contentAccess.resolve({
          ref: resourceRef,
          intent: 'interactive-preview',
          target: 'webview-uri',
          variant: { role },
          materialization: 'if-missing',
          caller,
          signal: abortController.signal,
          metadata: { [CONTENT_ACCESS_WEBVIEW_RESOLVER_TOKEN_METADATA_KEY]: webviewResolverToken },
        }),
      ),
      timeout,
    ]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
    const elapsedMs = Date.now() - startedAtMs;
    if (abortController.signal.aborted) {
      logger.warn('Preview resource variant resolution aborted by timeout', {
        caller,
        requestId: requestContext?.requestId,
        sourceId: requestContext?.sourceId,
        resourceId: resourceRef.id,
        entryPath:
          resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
        elapsedMs,
      });
    }
    if (result.status === 'ready' && result.uri) {
      logger.debug('Resource cache variant projected for Preview', {
        caller,
        requestId: requestContext?.requestId,
        sourceId: requestContext?.sourceId,
        resourceId: resourceRef.id,
        entryPath:
          resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
        elapsedMs,
      });
      return result.uri;
    }
    this.logResourceCacheVariantMiss(
      resourceRef,
      caller,
      result.status,
      result.error,
      requestContext,
      elapsedMs,
    );
    if (result.status === 'missing-cache' || result.status === 'stale-source') {
      return undefined;
    }
    if (result.status === 'unauthorized') {
      logger.warn('Content access projection was unauthorized', {
        resourceId: resourceRef.id,
        caller,
        error: result.error,
        requestId: requestContext?.requestId,
        sourceId: requestContext?.sourceId,
        elapsedMs,
      });
    }
    return undefined;
  }

  private logResourceCacheVariantMiss(
    resourceRef: ResourceRef,
    caller: string,
    status: string,
    error: string | undefined,
    requestContext?: PreviewResourceVariantRequestContext,
    elapsedMs?: number,
  ): void {
    const entryPath =
      resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined;
    logger.warn('Resource cache variant resolution missed', {
      caller,
      status,
      error,
      provider: resourceRef.provider,
      resourceId: resourceRef.id,
      sourcePath: resourceRef.source.document?.filePath ?? resourceRef.source.filePath,
      entryPath,
      requestId: requestContext?.requestId,
      sourceId: requestContext?.sourceId,
      elapsedMs,
    });
  }

  private logPreviewVariantResolved(
    resourceRef: ResourceRef,
    caller: string,
    requestContext: PreviewResourceVariantRequestContext,
  ): void {
    logger.debug('Preview variant resolved', {
      caller,
      requestId: requestContext.requestId,
      sourceId: requestContext.sourceId,
      resourceId: resourceRef.id,
      entryPath:
        resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
    });
  }

  private async resolveResourceRefLocalPreviewPath(
    resourceRef: ResourceRef,
    caller: string,
    preferredRole?: ResourceVariantRole,
  ): Promise<string> {
    if (!this.contentAccess) {
      throw new Error('Resource cache is unavailable for this workspace.');
    }
    const role = resolveCanvasPreviewVariantRole(resourceRef, preferredRole);
    const result = await this.contentAccess.resolve({
      ref: resourceRef,
      intent: 'interactive-preview',
      target: 'local-path',
      variant: { role },
      materialization: 'if-missing',
      caller,
    });
    if (result.status === 'ready' && result.localPath) {
      return result.localPath;
    }
    throw new Error(
      result.error ??
        'Resource cache variant could not be materialized for this document reference.',
    );
  }

  private markDocumentResourceUnavailable(
    nodeData: Record<string, unknown>,
    reason: DocumentResourceStatusReason,
  ): void {
    if (!isDocumentResourceStatusReason(reason)) {
      return;
    }
    delete nodeData['runtimeAssetPath'];
    delete nodeData['runtimeThumbnailPath'];
    delete nodeData['runtimeReferenceImagePath'];
    nodeData['documentResourceStatus'] = {
      state: 'unavailable',
      reason,
      message:
        reason === 'cache-missing'
          ? 'Document cache expired. Reopen the source document to regenerate the preview.'
          : 'Document cache is outside the allowed project or VS Code cache roots.',
    };
  }

  /** Normalize all media node asset paths in canvas data for portable storage */
  private async normalizeCanvasPathsForSave(
    data: Record<string, unknown>,
    documentUri: vscode.Uri,
  ): Promise<void> {
    const nodes = data['nodes'] as Array<Record<string, unknown>> | undefined;
    if (!nodes) return;

    for (const node of nodes) {
      const nodeData = node['data'] as Record<string, unknown> | undefined;
      if (!nodeData) continue;

      if (node['type'] === 'shot') {
        delete nodeData['runtimeReferenceImagePath'];
        delete nodeData['documentResourceStatus'];
        if (
          isResourceRef(nodeData['referenceResourceRef']) ||
          isDocumentArchiveResourceRef(nodeData['referenceImageResourceRef'])
        ) {
          delete nodeData['referenceImagePath'];
        }
        continue;
      }

      if (node['type'] !== 'media') continue;

      const assetPath = typeof nodeData['assetPath'] === 'string' ? nodeData['assetPath'] : '';
      const runtimeAssetPath =
        typeof nodeData['runtimeAssetPath'] === 'string' ? nodeData['runtimeAssetPath'] : '';
      delete nodeData['runtimeAssetPath'];
      delete nodeData['runtimeThumbnailPath'];
      delete nodeData['documentResourceStatus'];
      if (isDocumentArchiveResourceRef(nodeData['documentResourceRef'])) {
        continue;
      }

      if (!assetPath && !runtimeAssetPath) continue;
      if (this.isReusableCanvasPlaybackPreviewSource(assetPath)) continue;

      const absolutePath = await this.resolveCanvasMediaPathForSave(
        assetPath,
        runtimeAssetPath,
        documentUri,
      );
      if (!absolutePath) continue;
      // Contract to portable path
      const contractedPath = await this.contractAssetPath(absolutePath, documentUri);
      if (contractedPath) {
        nodeData['assetPath'] = contractedPath;
      }
    }
  }

  private async resolveCanvasMediaPathForSave(
    assetPath: string,
    runtimeAssetPath: string,
    documentUri: vscode.Uri,
  ): Promise<string | undefined> {
    const assetCandidates = assetPath
      ? await this.resolveCanvasPlaybackLocalPreviewPathCandidates(assetPath, documentUri)
      : [];
    if (assetCandidates[0]) {
      return assetCandidates[0];
    }

    const runtimeCandidates = runtimeAssetPath
      ? await this.resolveCanvasPlaybackLocalPreviewPathCandidates(runtimeAssetPath, documentUri)
      : [];
    if (runtimeCandidates[0]) {
      return runtimeCandidates[0];
    }

    return assetPath ? this.resolveAssetPath(assetPath, documentUri) : undefined;
  }

  /** Contract absolute path to portable path for storage */
  private async contractAssetPath(
    absolutePath: string,
    documentUri: vscode.Uri,
  ): Promise<string | undefined> {
    const contractedWorkspacePath = contractWorkspaceMediaPath(
      absolutePath,
      this.createCanvasWorkspaceMediaPathContext(documentUri),
    );
    if (contractedWorkspacePath.format === 'workspace-relative') {
      return contractedWorkspacePath.path;
    }
    if (
      contractedWorkspacePath.format === 'variable' &&
      !isWorkspaceScopedVariablePath(contractedWorkspacePath.path)
    ) {
      return contractedWorkspacePath.path;
    }

    const contracted = await contractHostContentMediaPath(absolutePath, {
      documentUri,
      workspaceFolders: vscode.workspace.workspaceFolders ?? [],
      allowedRoots: this.getCanvasLocalResourceRoots(documentUri).map((root) => root.fsPath),
      getExtension: vscode.extensions.getExtension,
    });
    if (contracted && contracted.startsWith('${') && !isWorkspaceScopedVariablePath(contracted)) {
      return contracted;
    }

    logger.warn(
      `Canvas asset path is not portable; move it into the workspace, asset library, or a configured media root before saving: ${absolutePath}`,
    );
    return undefined;
  }

  private async contractExternalAssetPath(absolutePath: string): Promise<string | undefined> {
    const contracted = await contractHostContentMediaPath(absolutePath, {
      workspaceFolders: vscode.workspace.workspaceFolders ?? [],
      getExtension: vscode.extensions.getExtension,
    });
    if (contracted && contracted.startsWith('${') && !isWorkspaceScopedVariablePath(contracted)) {
      return contracted;
    }
    return undefined;
  }

  private contractWorkspaceAssetPath(
    absolutePath: string,
    documentUri: vscode.Uri,
  ): string | undefined {
    const owningRoot = this.getOwningCanvasWorkspaceRoot(documentUri);
    if (!owningRoot) {
      return undefined;
    }
    const rootPath = owningRoot.fsPath;
    if (absolutePath !== rootPath && !absolutePath.startsWith(`${rootPath}${path.sep}`)) {
      return undefined;
    }
    const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/');
    return relativePath || undefined;
  }

  // ===========================================================================
  // Data sync helpers for VSCode integration (outline, timeline, status bar)
  // ===========================================================================

  /** Extract outline data from raw canvas JSON and push to outline provider */
  private syncOutline(documentUri: string, canvasData: Record<string, unknown>): void {
    if (!this.outlineProvider) return;

    const nodes = (canvasData.nodes ?? []) as Array<Record<string, unknown>>;
    const connections = (canvasData.connections ?? []) as Array<Record<string, unknown>>;

    // Build node label lookup for connection display
    const nodeLabelMap = new Map<string, string>();
    const outlineNodes = nodes.map((n) => {
      const data = (n.data ?? {}) as Record<string, unknown>;
      const type = String(n.type ?? 'unknown');
      let label = 'Untitled';
      let detail: string | undefined;

      switch (type) {
        case 'media': {
          const path = String(data.assetPath ?? '');
          label = path.split('/').pop() || 'Media';
          detail = String(data.mediaType ?? 'media');
          break;
        }
        case 'storyboard':
          label = String(data.title || 'Scene');
          detail = data.description ? String(data.description).slice(0, 40) : undefined;
          break;
        case 'annotation':
          label = String(data.content || 'Note').slice(0, 30) || 'Note';
          detail = 'annotation';
          break;
        case 'group':
          label = String(data.label || 'Group');
          break;
        case 'text':
          label = String(data.content || 'Text').slice(0, 30) || 'Text';
          detail = 'text';
          break;
        case 'artboard':
          label = String(data.title || data.name || 'Artboard');
          detail = data.preset ? String(data.preset) : undefined;
          break;
        case 'shot': {
          const num = String(data.shotNumber ?? '?');
          const scale = data.shotScale ? ` [${String(data.shotScale)}]` : '';
          label = `#${num.padStart(3, '0')}${scale}`;
          detail = data.visualDescription ? String(data.visualDescription).slice(0, 40) : undefined;
          break;
        }
        case 'scene':
          label = String(data.sceneTitle || 'Scene');
          detail = data.location
            ? `${String(data.location)} · ${String(data.timeOfDay ?? '')}`
            : undefined;
          break;
        case 'gallery':
          label = String(data.characterName || '角色画廊');
          detail = data.preset ? String(data.preset) : undefined;
          break;
        case 'script':
          label = String(data.scriptTitle ?? 'Script');
          detail = data.scriptPath ? String(data.scriptPath).split('/').pop() : undefined;
          break;
        case 'document':
          label = String(data.title ?? 'Document');
          detail = data.docType ? String(data.docType).toUpperCase() : undefined;
          break;
        case 'model':
          label = String(data.modelName ?? 'Model');
          detail = data.modelType ? String(data.modelType) : undefined;
          break;
        case 'canvas-embed':
          label = String(data.canvasTitle ?? 'Canvas');
          detail = 'embed';
          break;
      }

      const id = String(n.id ?? '');
      nodeLabelMap.set(id, label);

      return {
        id,
        type,
        label,
        detail,
        locked: Boolean(n.locked),
        ...(type === 'scene' ? { childIds: readCanvasNodeContainerChildIds(n) } : {}),
      };
    });

    const outlineConnections = connections.map((c) => ({
      id: String(c.id ?? ''),
      sourceLabel: nodeLabelMap.get(String(c.sourceId ?? '')) ?? '?',
      targetLabel: nodeLabelMap.get(String(c.targetId ?? '')) ?? '?',
      label: c.label ? String(c.label) : undefined,
    }));

    const outlineData: CanvasOutlineData = {
      documentUri,
      name: String(canvasData.name ?? 'Canvas'),
      nodes: outlineNodes,
      connections: outlineConnections,
    };

    this.outlineProvider.updateData(outlineData);
  }

  /** Update VSCode status bar with canvas info */
  private syncStatusBar(canvasData: Record<string, unknown>): void {
    if (!this.statusBar) return;

    const nodes = (canvasData.nodes ?? []) as unknown[];
    const connections = (canvasData.connections ?? []) as unknown[];
    const viewport = (canvasData.viewport ?? { zoom: 1 }) as Record<string, unknown>;
    const selection = (canvasData._selection ?? {}) as Record<string, unknown>;
    const selectedNodeIds = (selection.nodeIds ?? []) as unknown[];
    const subsystemSummary = readCanvasSubsystemSummary(canvasData, nodes);
    const projectionSummary = readCanvasProjectionSummary(canvasData);

    this.statusBar.update({
      nodeCount: nodes.length,
      connectionCount: connections.length,
      zoom: Number(viewport.zoom ?? 1),
      selectedCount: selectedNodeIds.length,
      subsystemSummary,
      projectionSummary,
    });
  }

  private sendRequest<T>(type: string, data?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.activeWebviewPanel) {
        reject(new Error('No active webview'));
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          if (
            typeof value === 'object' &&
            value !== null &&
            typeof (value as { error?: unknown }).error === 'string'
          ) {
            reject(new Error((value as { error: string }).error));
            return;
          }
          resolve(value as T);
        },
        reject,
      });

      this.activeWebviewPanel.webview.postMessage({
        type,
        _requestId: id,
        ...(data as Record<string, unknown>),
      });

      setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.reject(new Error(`Request timeout: ${type}`));
        }
      }, 30000);
    });
  }
}

function isCanvasProjectSaveReason(value: string): value is ProjectFileSaveReason {
  return (
    value === 'manual' ||
    value === 'autosave' ||
    value === 'vscode-save' ||
    value === 'import' ||
    value === 'migration' ||
    value === 'add-source' ||
    value === 'save-as'
  );
}

function createCanvasCreativeAiEditorDiagnostic(
  code: string,
  message: string,
  target?: string,
): CreativeAiDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    ...(target ? { target } : {}),
  };
}

function readCanvasProjectSourceAddMediaType(
  request: ProjectSourceAddRequest,
): 'image' | 'video' | 'audio' | undefined {
  const metadataType = request.metadata?.['mediaType'];
  if (metadataType === 'image' || metadataType === 'video' || metadataType === 'audio') {
    return metadataType;
  }
  const role = request.target?.role;
  if (role === 'image' || role === 'audio') {
    return role;
  }
  if (role === 'media') {
    const fileName = request.browserFile?.name ?? request.sourcePath ?? '';
    return inferCanvasMediaType(fileName) ?? undefined;
  }
  const fileName = request.browserFile?.name ?? request.sourcePath ?? '';
  return inferCanvasMediaType(fileName) ?? undefined;
}

function readCanvasProjectSourceAddDescriptor(request: ProjectSourceAddRequest):
  | {
      readonly mediaType?: 'image' | 'video' | 'audio';
      readonly fileName: string;
      readonly textFormat?: 'plain' | 'markdown';
      readonly metadata: Record<string, unknown>;
    }
  | undefined {
  const fileName = readCanvasProjectSourceAddFileName(request);
  const assetKind = readCanvasProjectSourceAddAssetKind(request, fileName);
  if (!assetKind) return undefined;

  const mediaType = readCanvasProjectSourceAddMediaType(request);
  const textFormat = assetKind === 'text' ? inferCanvasTextFileFormat(fileName) : undefined;
  const title = fileName.replace(/\.[^.]+$/, '') || fileName;
  const metadata: Record<string, unknown> = {
    canvasAssetKind: assetKind,
    name: fileName,
    title,
    ...(mediaType ? { mediaType } : {}),
    ...(textFormat ? { textFormat } : {}),
  };

  if (assetKind === 'document') {
    const docType = inferCanvasDocumentType(fileName);
    if (!docType) return undefined;
    metadata['docType'] = docType;
  }
  if (assetKind === 'model') {
    const modelType = inferCanvasModelType(fileName);
    if (!modelType) return undefined;
    metadata['modelType'] = modelType;
  }
  if (assetKind === 'project') {
    const projectType = inferNkProjectType(fileName);
    if (!projectType) return undefined;
    metadata['projectType'] = projectType;
  }

  return {
    fileName,
    ...(mediaType ? { mediaType } : {}),
    ...(textFormat ? { textFormat } : {}),
    metadata,
  };
}

function readCanvasProjectSourceAddAssetKind(
  request: ProjectSourceAddRequest,
  fileName: string,
): ReturnType<typeof inferCanvasDroppedAssetKind> {
  const metadataKind = request.metadata?.['canvasAssetKind'];
  if (
    metadataKind === 'media' ||
    metadataKind === 'text' ||
    metadataKind === 'script' ||
    metadataKind === 'document' ||
    metadataKind === 'model' ||
    metadataKind === 'canvas' ||
    metadataKind === 'project'
  ) {
    return metadataKind;
  }
  return inferCanvasDroppedAssetKind(fileName);
}

function readCanvasProjectSourceAddFileName(request: ProjectSourceAddRequest): string {
  const metadataName = request.metadata?.['name'];
  if (typeof metadataName === 'string' && metadataName.length > 0) {
    return metadataName;
  }
  const source = request.browserFile?.name ?? request.sourcePath ?? request.sourceUri ?? 'source';
  const withoutQuery = source.split(/[?#]/, 1)[0] ?? source;
  const normalized = withoutQuery.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop();
  return fileName && fileName.length > 0 ? decodeURIComponentSafe(fileName) : 'source';
}

async function selectExistingCutProjectTarget(): Promise<{
  readonly target: { readonly kind: 'file'; readonly documentUri: string };
  readonly expectedProjectRevision: string;
}> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { 'Neko Cut Project': ['nkv'] },
    openLabel: 'Select Cut Project',
  });
  const documentUri = selected?.[0];
  if (!documentUri) {
    throw new Error('Cut authoring was cancelled before an explicit .nkv target was selected.');
  }
  const cutExtension = resolveNekoExtension('neko.neko-cut', (id) =>
    vscode.extensions.getExtension(id),
  );
  if (!cutExtension) {
    throw new Error('Neko Cut is unavailable for explicit project authoring.');
  }
  const cutApiValue = cutExtension.isActive ? cutExtension.exports : await cutExtension.activate();
  if (!isNekoCutAPI(cutApiValue)) {
    throw new Error('Neko Cut API contract mismatch.');
  }
  const cutApi: NekoCutAPI = cutApiValue;
  const targetUri = documentUri.toString();
  const info = await cutApi.timeline.getInfo({ documentUri: targetUri });
  return {
    target: { kind: 'file', documentUri: targetUri },
    expectedProjectRevision: info.projectRevision,
  };
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
