/**
 * Canvas Editor Provider - Custom editor for .nkc files
 *
 * Supports inline media playback through the shared Node/FFmpeg media runtime.
 */
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'path';
import { createNodeDocumentRasterRepresentationGenerator } from '@neko/content/document/node';
import {
  createDocumentResourceRefFromArchiveRef,
  createHostDerivedContentRuntime,
  createNodeHostContentReadService,
  HostWebviewContentProjectionPort,
  createFocusedWebviewRegistry,
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
  NodeAuthorizedWorkspaceWriter,
  resolveNekoExtension,
  resolveHostContentMediaPath,
  resolveGeneratedAssetResourceRef,
  updateWebviewKeyboardEditableOwner,
  type IFocusedWebviewRegistry,
  type HostDerivedContentRuntime,
  type LocalResourceAccessService,
  type PreviewVariantResourceApi,
} from '@neko/shared/vscode/extension';
import {
  inferCanvasDroppedAssetKind,
  inferCanvasMediaType,
  inferCanvasTextFileFormat,
  isDocumentArchiveResourceRef,
  isResourceRef,
  isDocumentResourceStatusReason,
  isCanvasConnectionType,
  isCanvasNodeType,
  isProjectedCanvasData,
  isProjectedCanvasSource,
  createNkcProjectFormatCodecRegistry,
  storeProjectSourceAddRequest,
  nkcSourcePathPolicy,
  ProjectFileStore,
  projectCanvasPlaybackRouteToCutDraft,
  createProjectionAdapterRegistry,
  NEKO_EXTENSION_IDS,
  isNekoMediaRepresentationAPI,
  createCanvasPlaybackPlan,
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
  validateCanvasBoardRef,
  isCanvasTextDocumentReadRequest,
} from '@neko/shared';
import type {
  CanvasCutDraftPayload,
  CanvasPlaybackPlan,
  CanvasPlaybackRouteCandidate,
  CanvasPlaybackUnit,
  CanvasPlaybackCreateCutDraftRequest,
  CanvasPlaybackReorderUnitsRequest,
  CanvasPlaybackReorderUnitsResult,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasCreateConnectionRequest,
  CanvasCreateConnectionResult,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasData,
  CanvasSerializableValue,
  CanvasBoardRef,
  CanvasCreativeScope,
  CanvasNode,
  CanvasNodeType,
  ContentLocator,
  ContentReadService,
  ContentRepresentationGenerator,
  ContentRepresentationService,
  ContentRepresentationSpec,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
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
  NekoMediaRepresentationAPI,
  ResourceRef,
  ResourceVariantRole,
  CanvasTextDocumentReadResult,
} from '@neko/shared';
import type { CanvasChangeEvent, ShapeConfig } from '../api';
import type { CanvasOutlineProvider, CanvasOutlineData } from '../views/canvasOutlineProvider';
import type { CanvasStatusBar } from '../views/canvasStatusBar';
import { NodeMediaRuntime } from '@neko/media/node';
import type { HtmlVideoDescriptor, MediaProbe, PcmStreamDescriptor } from '@neko/media';
import { getLogger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';
import {
  createCanvasDocumentEntryContentReader,
  readCanvasNativeDocumentEntryPath,
} from '../services/documentEntryReader';
import { readCanvasTextDocumentProjection } from '../services/textDocumentProjection';
import { resolveCanvasPickerAssetKind } from '../services/canvasSourceSelection';
import { parseCanvasPreviewDelegateRequest } from './previewDelegateMessage';
import { selectCanvasPlaybackTracks } from './canvasMediaPlaybackPolicy';
import {
  applyCanvasContentNodeDelta,
  assertCanvasDocumentSnapshotBoundary,
} from './canvasDocumentSnapshotBoundary';

const logger = getLogger('CanvasEditorProvider');
const CANVAS_KEYBOARD_OWNER_PREFIX = 'neko.canvasEditor:';
const PREVIEW_RESOURCE_VARIANT_TIMEOUT_MS = 4500;
const CANVAS_MEDIA_LOOPBACK_SOURCE = 'http://127.0.0.1:*';
const CANVAS_PREVIEW_SEMANTIC_FINGERPRINT_KEYS = [
  'name',
  'nodes',
  'connections',
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
]);

type CanvasHeadlessAssetImporter = (
  asset: CanvasImportAssetRequest,
) => Promise<CanvasImportAssetResult>;

type CanvasPlaybackPreviewSourceKind = 'media-asset';

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

type PlaybackMediaType = 'video' | 'audio' | 'auto';

interface CanvasMediaInfo {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly codec: string;
  readonly format: string;
  readonly bitrate?: number;
  readonly hasAudio: boolean;
  readonly audioCodec?: string;
  readonly audioSampleRate?: number;
  readonly audioChannels?: number;
}

interface CanvasPlaybackHandle {
  readonly sourcePath: string;
  readonly mediaInfo: CanvasMediaInfo;
  readonly mediaType: PlaybackMediaType;
  readonly speed: number;
  readonly videoSessionId?: string;
  readonly video?: HtmlVideoDescriptor;
  readonly audioSessionId?: string;
  readonly audio?: PcmStreamDescriptor;
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

export function isCanvasEditorLevelKeyboardAction(action: string): boolean {
  return CANVAS_EDITOR_LEVEL_KEYBOARD_ACTIONS.has(action);
}

export function readPlaybackMediaType(value: unknown): PlaybackMediaType {
  return value === 'video' || value === 'audio' ? value : 'auto';
}

export function createCanvasWebviewContentSecurityPolicy(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${cspSource} data: blob: https:`,
    `font-src ${cspSource}`,
    `media-src ${cspSource} data: blob: https: ${CANVAS_MEDIA_LOOPBACK_SOURCE}`,
    `connect-src ws://127.0.0.1:* ${CANVAS_MEDIA_LOOPBACK_SOURCE}`,
  ].join('; ');
}

function projectCanvasMediaInfo(probe: MediaProbe): CanvasMediaInfo {
  const video = probe.video;
  const audio = probe.audioStreams[0];
  return {
    duration: probe.durationSeconds,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: video?.framesPerSecond ?? 0,
    codec: video?.codecName ?? audio?.codecName ?? 'unknown',
    format: probe.formatName ?? 'unknown',
    ...(probe.bitRate === undefined ? {} : { bitrate: probe.bitRate }),
    hasAudio: audio !== undefined,
    ...(audio
      ? {
          audioCodec: audio.codecName,
          audioSampleRate: audio.sampleRate,
          audioChannels: audio.channels,
        }
      : {}),
  };
}

function parseCanvasMediaInfo(value: unknown): CanvasMediaInfo | undefined {
  if (!isPlainRecord(value)) return undefined;
  const duration = value['duration'];
  const width = value['width'];
  const height = value['height'];
  const fps = value['fps'];
  const codec = value['codec'];
  const format = value['format'];
  const hasAudio = value['hasAudio'];
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    typeof fps !== 'number' ||
    typeof codec !== 'string' ||
    typeof format !== 'string' ||
    typeof hasAudio !== 'boolean'
  ) {
    return undefined;
  }
  return {
    duration,
    width,
    height,
    fps,
    codec,
    format,
    hasAudio,
    ...(typeof value['bitrate'] === 'number' ? { bitrate: value['bitrate'] } : {}),
    ...(typeof value['audioCodec'] === 'string' ? { audioCodec: value['audioCodec'] } : {}),
    ...(typeof value['audioSampleRate'] === 'number'
      ? { audioSampleRate: value['audioSampleRate'] }
      : {}),
    ...(typeof value['audioChannels'] === 'number'
      ? { audioChannels: value['audioChannels'] }
      : {}),
  };
}

function finitePlaybackNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function isWorkspaceScopedVariablePath(value: string): boolean {
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

export function assertCanvasNodeType(type: CanvasNodeType | undefined): void {
  if (type !== undefined && !isCanvasNodeType(type)) {
    throw new Error(`Unsupported Canvas node type "${type}"`);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function requireCanvasSerializableValue(
  value: unknown,
  label: string,
): CanvasSerializableValue {
  if (isCanvasSerializableValue(value)) return value;
  throw new Error(`${label} is not Canvas-serializable.`);
}

export function isCanvasSerializableValue(value: unknown): value is CanvasSerializableValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isCanvasSerializableValue);
  return isPlainRecord(value) && Object.values(value).every(isCanvasSerializableValue);
}

export function isCanvasDataSnapshot(value: unknown): value is CanvasData {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value['version'] === 'string' &&
    typeof value['name'] === 'string' &&
    Array.isArray(value['nodes']) &&
    value['nodes'].every(isCanonicalCanvasNodeSnapshot) &&
    Array.isArray(value['connections']) &&
    value['connections'].every(isCanonicalCanvasConnectionSnapshot)
  );
}

function isCanonicalCanvasNodeSnapshot(value: unknown): value is CanvasNode {
  if (!isPlainRecord(value) || !isCanvasNodeType(value['type'])) return false;
  const position = value['position'];
  const size = value['size'];
  return (
    typeof value['id'] === 'string' &&
    isPlainRecord(value['data']) &&
    isPlainRecord(position) &&
    typeof position['x'] === 'number' &&
    Number.isFinite(position['x']) &&
    typeof position['y'] === 'number' &&
    Number.isFinite(position['y']) &&
    isPlainRecord(size) &&
    typeof size['width'] === 'number' &&
    Number.isFinite(size['width']) &&
    typeof size['height'] === 'number' &&
    Number.isFinite(size['height']) &&
    typeof value['zIndex'] === 'number' &&
    Number.isFinite(value['zIndex'])
  );
}

function isCanonicalCanvasConnectionSnapshot(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['sourceId'] === 'string' &&
    typeof value['targetId'] === 'string' &&
    isCanvasConnectionType(value['type']) &&
    isPlainRecord(value['sourceEndpoint']) &&
    value['sourceEndpoint']['nodeId'] === value['sourceId'] &&
    isPlainRecord(value['targetEndpoint']) &&
    value['targetEndpoint']['nodeId'] === value['targetId']
  );
}

export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0)
  );
}

export function normalizeCanvasAssetPreviewBindings(value: unknown, bindingPath: string): void {
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

export function createCanvasPreviewSemanticFingerprint(
  canvasData: Record<string, unknown>,
): string {
  const previewState: Record<string, unknown> = {};
  for (const key of CANVAS_PREVIEW_SEMANTIC_FINGERPRINT_KEYS) {
    previewState[key] = canvasData[key];
  }
  return stableCanvasPreviewStringify(previewState);
}

export function stableCanvasPreviewStringify(value: unknown): string {
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

export function resolveCanvasPreviewVariantRole(
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

export function createCanvasRepresentationSpec(
  role: ResourceVariantRole,
): ContentRepresentationSpec | undefined {
  switch (role) {
    case 'thumbnail':
      return { kind: 'thumbnail', maxWidth: 640, maxHeight: 360, format: 'jpeg' };
    case 'preview':
      return { kind: 'preview', maxWidth: 1280, maxHeight: 720, format: 'jpeg' };
    case 'proxy':
      return { kind: 'proxy', profile: 'canvas-preview' };
    case 'fov-crop':
      return {
        kind: 'fov-crop',
        yaw: 0,
        pitch: 0,
        horizontalFov: 75,
        width: 640,
        height: 360,
        format: 'jpeg',
      };
    case 'page-image':
      return { kind: 'raster-page', page: 1, scale: 1, format: 'png' };
    default:
      return undefined;
  }
}

export function inferCanvasRepresentationMimeType(spec: ContentRepresentationSpec): string {
  if (spec.kind === 'proxy') return 'application/octet-stream';
  const format = 'format' in spec ? spec.format : undefined;
  return format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
}

export function readCanvasPreviewVariantLocalPath(value: string | undefined): string | undefined {
  if (!value || /^(?:https?|data|blob):/iu.test(value)) return undefined;
  if (!value.startsWith('file://')) return value;
  try {
    return vscode.Uri.parse(value).fsPath;
  } catch {
    return undefined;
  }
}

export function readCanvasProjectionSummary(
  canvasData: Record<string, unknown>,
): string | undefined {
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

export function readCanonicalCanvasNodePresentation(node: CanvasNode): {
  readonly label: string;
  readonly summary: string;
} {
  switch (node.type) {
    case 'markdown':
      return {
        label: node.data.title ?? 'Markdown',
        summary: node.data.content.slice(0, 240),
      };
    case 'media':
      return {
        label: node.data.title ?? (path.basename(node.data.assetPath) || 'Media'),
        summary: node.data.mediaType ?? 'media',
      };
    case 'group':
      return {
        label: node.data.label ?? 'Group',
        summary: `${node.container?.childIds.length ?? 0} items`,
      };
    case 'job':
      return {
        label: node.data.title,
        summary: node.data.objective ?? node.data.status,
      };
    case 'file':
      return {
        label: node.data.title || path.basename(node.data.path) || 'File',
        summary: node.data.path,
      };
    case 'canvas-embed':
      return {
        label: node.data.canvasTitle || 'Canvas',
        summary: node.data.canvasPath,
      };
  }
}

export function isCanvasCreativeScopeLike(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { kind?: unknown }).kind === 'string'
  );
}

export function readCanvasBoardRef(value: unknown): CanvasBoardRef | undefined {
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

export function isUnsafeCanvasBoardUri(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length === 0 ||
    /^vscode-webview:\/\//i.test(trimmed) ||
    /^vscode-resource:\/\//i.test(trimmed) ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed) ||
    /^file:\/\//i.test(trimmed)
  );
}

export function findOpenCanvasDocumentUriByProjectRef(
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

export function createProjectionSourceKey(source: ProjectedCanvasSource): string {
  return `${source.kind}:${source.uri}`;
}

export function hashProjectionSource(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

export function readCanvasNodeContainerChildIds(node: Record<string, unknown>): string[] {
  const container = node.container;
  if (typeof container !== 'object' || container === null || Array.isArray(container)) {
    return [];
  }

  const childIds = (container as { childIds?: unknown }).childIds;
  return Array.isArray(childIds)
    ? childIds.filter((childId): childId is string => typeof childId === 'string')
    : [];
}

export function mapOperationToCanvasChangeEvent(operation: {
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
  ): ReturnType<PreviewVariantResourceApi['requestPreviewVariant']>;
  unregisterPreviewAsset(assetIdOrToken: string): Promise<void>;
}

export function isPreviewVariantAPI(api: unknown): api is NekoPreviewVariantAPI {
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
  private readonly authoritativeCanvasSnapshotsByDocumentUri = new Map<string, CanvasData>();
  private readonly confirmedRemovedNodeIdsByDocumentUri = new Map<string, Set<string>>();
  private readonly canvasRevisionsByDocumentUri = new Map<string, number>();
  private readonly dirtyCanvasDocumentUris = new Set<string>();
  private readonly canvasPreviewFingerprintsByDocumentUri = new Map<string, string>();
  private readonly canvasDataReadyDocumentUris = new Set<string>();

  // External providers for VSCode integration
  private outlineProvider: CanvasOutlineProvider | undefined;
  private statusBar: CanvasStatusBar | undefined;

  private readonly mediaRuntime = new NodeMediaRuntime();
  private _activeStreams = new Map<vscode.WebviewPanel, Map<string, CanvasPlaybackHandle>>();
  private localResourceAccess!: LocalResourceAccessService;
  private derivedRuntime!: HostDerivedContentRuntime;
  private contentRepresentation!: ContentRepresentationService;
  private contentRead!: ContentReadService;
  private readonly projectionAdapters: ProjectionAdapterRegistry =
    createProjectionAdapterRegistry();
  private readonly projectionSubscriptions = new Map<string, ProjectionDisposable>();
  private readonly focusedWebviews: IFocusedWebviewRegistry;
  private readonly projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  private readonly projectFileStore = new ProjectFileStore({
    registry: createNkcProjectFormatCodecRegistry(),
    fileOps: this.projectFileAdapter.fileOps,
    resolveAuthorizedWrite: (filePath) => ({
      writer: new NodeAuthorizedWorkspaceWriter({ workspaceRoot: path.dirname(filePath) }),
      locator: { kind: 'workspace-file', path: path.basename(filePath) },
    }),
    logger,
  });
  private readonly projectFileSession = new ProjectFileSaveSession<CanvasData>({
    formatId: 'nkc',
    store: this.projectFileStore,
    sourcePolicy: nkcSourcePathPolicy,
    createSourcePolicyOptions: (uri) => ({
      context: this.createCanvasProjectFileContext(vscode.Uri.file(uri.fsPath)),
    }),
    logger,
  });
  private headlessAssetImporter: CanvasHeadlessAssetImporter | undefined;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    focusedWebviews: IFocusedWebviewRegistry = createFocusedWebviewRegistry(),
  ) {
    this.focusedWebviews = focusedWebviews;
  }

  static async create(
    context: vscode.ExtensionContext,
    focusedWebviews: IFocusedWebviewRegistry = createFocusedWebviewRegistry(),
  ): Promise<CanvasEditorProvider> {
    const provider = new CanvasEditorProvider(context, focusedWebviews);
    await provider.initializeContentRuntime();
    return provider;
  }

  dispose(): void {
    for (const subscription of this.projectionSubscriptions.values()) {
      subscription.dispose();
    }
    this.projectionSubscriptions.clear();
    this._onSelectionChange.dispose();
    this._onDidChangeCanvas.dispose();
    this._onDidChangeDocumentLifecycle.dispose();
    this._onDidChangeCustomDocument.dispose();
    void this.derivedRuntime
      .dispose()
      .catch((error) => logger.warn('Failed to dispose Canvas derived content runtime', { error }));
    void this.mediaRuntime
      .dispose()
      .catch((error) => logger.warn('Failed to dispose Canvas media runtime', { error }));
  }

  private async initializeContentRuntime(): Promise<void> {
    const context = this.context;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const documentEntryReader = createCanvasDocumentEntryContentReader();
    const contentRead = workspaceRoot
      ? createNodeHostContentReadService({ workspaceRoot, documentEntryReader })
      : createUnavailableCanvasContentReadService();
    const runtime = await createHostDerivedContentRuntime({
      target: workspaceRoot ? { kind: 'workspace', workspaceRoot } : { kind: 'extension-private' },
      context,
      extensionUri: context.extensionUri,
      representationGenerators: workspaceRoot
        ? [this.createCanvasRepresentationGenerator(workspaceRoot, contentRead)]
        : [],
      logger,
    });
    if (!runtime.localResourceAccess) {
      throw new Error('Canvas content access runtime requires LocalResourceAccessService.');
    }
    this.derivedRuntime = runtime;
    this.localResourceAccess = runtime.localResourceAccess;
    this.contentRepresentation = runtime.contentRepresentation;
    this.contentRead = contentRead;
  }

  private createCanvasRepresentationGenerator(
    workspaceRoot: string,
    contentRead: ContentReadService,
  ): ContentRepresentationGenerator {
    const documentRaster = createNodeDocumentRasterRepresentationGenerator({
      workspaceRoot,
      contentRead,
    });
    return {
      id: 'neko-canvas-media-representation',
      revision: '1',
      kinds: ['thumbnail', 'preview', 'proxy', 'fov-crop', 'raster-page'],
      generate: async (input) => {
        const { source, spec } = input;
        if (spec.kind === 'raster-page') return documentRaster.generate(input);
        const sourcePath = this.resolveContentLocatorLocalPath(source, workspaceRoot);
        if (spec.kind === 'thumbnail' || spec.kind === 'preview') {
          const api = await this.getMediaRepresentationApi();
          const generated = await api?.generateThumbnail(sourcePath, {
            role: spec.kind,
            width: spec.maxWidth,
            height: spec.maxHeight,
            format: spec.format,
            mimeType: spec.format ? `image/${spec.format}` : 'image/jpeg',
          });
          if (!generated) {
            throw new Error(`Canvas ${spec.kind} generator is unavailable.`);
          }
          return {
            bytes: generated.bytes,
            metadata: {
              mimeType: generated.mimeType,
              byteLength: generated.bytes.byteLength,
              width: generated.width,
              height: generated.height,
            },
          };
        }

        const preview = await this.getPreviewVariantApi();
        if (!preview) throw new Error('Canvas Preview representation generator is unavailable.');
        const manifest = await preview.registerPreviewAsset({
          source: sourcePath,
          kind: 'unknown',
          explicitOpen: false,
        });
        try {
          const variant = await preview.requestPreviewVariant(manifest.assetId, {
            role: spec.kind === 'proxy' ? 'proxy' : 'fov-crop',
            ...(spec.kind === 'fov-crop'
              ? {
                  width: spec.width,
                  height: spec.height,
                  format: spec.format,
                  viewState: {
                    mode: 'sphere',
                    yawDeg: spec.yaw,
                    pitchDeg: spec.pitch,
                    rollDeg: 0,
                    fovDeg: spec.horizontalFov,
                    exposure: 0,
                    toneMapping: 'aces',
                  } as const,
                }
              : {}),
          });
          const variantPath = readCanvasPreviewVariantLocalPath(variant.url);
          if (!variantPath) {
            throw new Error('Canvas Preview representation did not return a local artifact.');
          }
          const bytes = await fs.promises.readFile(variantPath);
          return {
            bytes,
            metadata: {
              ...(variant.mimeType ? { mimeType: variant.mimeType } : {}),
              byteLength: bytes.byteLength,
              ...(variant.dimensions?.width !== undefined
                ? { width: variant.dimensions.width }
                : {}),
              ...(variant.dimensions?.height !== undefined
                ? { height: variant.dimensions.height }
                : {}),
            },
          };
        } finally {
          await preview.unregisterPreviewAsset?.(manifest.assetId);
        }
      },
    };
  }

  private resolveContentLocatorLocalPath(locator: ContentLocator, workspaceRoot: string): string {
    const sourcePath =
      locator.kind === 'workspace-file'
        ? locator.path
        : locator.kind === 'generated-output'
          ? locator.path
          : locator.kind === 'document-entry'
            ? locator.source.path
            : undefined;
    if (!sourcePath) {
      throw new Error(`Canvas does not support ${locator.kind} representation sources.`);
    }
    const resolver = createWorkspacePathResolver(workspaceRoot);
    const resolved = resolver.resolveSource(sourcePath, workspaceRoot);
    if (resolved.type !== 'local' || resolver.hasVariable(resolved.path)) {
      throw new Error('Canvas representation source did not resolve to a local workspace path.');
    }
    return resolved.path;
  }

  private async getMediaRepresentationApi(): Promise<NekoMediaRepresentationAPI | null> {
    try {
      const ext = resolveNekoExtension(NEKO_EXTENSION_IDS.NEKO_ASSETS, (id) =>
        vscode.extensions.getExtension(id),
      );
      if (!ext) return null;
      const api = ext.isActive ? ext.exports : await ext.activate();
      return isNekoMediaRepresentationAPI(api) ? api : null;
    } catch {
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
    for (const handle of panelStreams.values()) {
      await this.stopCanvasPlayback(handle).catch(() => {});
    }
    this._activeStreams.delete(webviewPanel);
  }

  private async startCanvasPlayback(
    sourcePath: string,
    mediaInfo: CanvasMediaInfo,
    mediaType: PlaybackMediaType,
    startTime: number,
    speed: number,
  ): Promise<CanvasPlaybackHandle> {
    const duration = Math.max(0, mediaInfo.duration - startTime);
    if (duration <= 0) throw new Error('Canvas playback start is outside the media duration.');
    const tracks = selectCanvasPlaybackTracks(mediaType, mediaInfo);
    const video = tracks.video ? await this.mediaRuntime.prepareVideo(sourcePath) : undefined;
    try {
      const audio = tracks.audio
        ? await this.mediaRuntime.startPcm(sourcePath, {
            startTimeSeconds: startTime,
            durationSeconds: duration,
            playbackRate: speed,
          })
        : undefined;
      return {
        sourcePath,
        mediaInfo,
        mediaType,
        speed,
        ...(video ? { videoSessionId: video.sessionId, video: video.video } : {}),
        ...(audio ? { audioSessionId: audio.sessionId, audio: audio.stream } : {}),
      };
    } catch (error) {
      if (video) await this.mediaRuntime.stop(video.sessionId);
      throw error;
    }
  }

  private async stopCanvasPlayback(handle: CanvasPlaybackHandle): Promise<void> {
    const sessionIds = [handle.videoSessionId, handle.audioSessionId].filter(
      (value): value is string => value !== undefined,
    );
    await Promise.all(sessionIds.map((sessionId) => this.mediaRuntime.stop(sessionId)));
  }

  /** Wire up external providers after construction */
  setProviders(opts: { outline?: CanvasOutlineProvider; statusBar?: CanvasStatusBar }): void {
    this.outlineProvider = opts.outline;
    this.statusBar = opts.statusBar;
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

  async applyHostCanvasData(uri: vscode.Uri, canvasData: CanvasData): Promise<void> {
    const documentUri = uri.toString();
    const canvasRecord = canvasData as unknown as Record<string, unknown>;
    this.updateRememberedCanvasSnapshot(documentUri, canvasRecord);
    this.setAuthoritativeCanvasSnapshot(documentUri, canvasData);
    this.dirtyCanvasDocumentUris.delete(documentUri);
    const panel = this.webviewPanelsByDocumentUri.get(documentUri);
    if (panel) {
      const displayData = await this.projectCanvasDataForDisplay(canvasData, uri, panel.webview);
      const message: CanvasHostAppliedDocumentMessage = {
        type: 'canvas.hostAppliedDocument',
        documentUri,
        data: displayData,
        reason: 'headless-authoring',
      };
      const delivered = await panel.webview.postMessage(message);
      if (!delivered) {
        logger.warn('Canvas Host-applied display snapshot was not delivered', {
          documentUri,
        });
      }
    }
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
    const snapshot = this.authoritativeCanvasSnapshotsByDocumentUri.get(documentUri);
    if (!snapshot) return undefined;
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
    const orderedUnits: CanvasPlaybackUnit[] = [];
    for (const unitId of orderedUnitIds) {
      const unit = unitById.get(unitId);
      if (!unit) {
        throw new Error('Playback reorder references a missing Canvas playback unit.');
      }
      orderedUnits.push(unit);
    }
    const groupId = this.resolveSingleGroupReorderParent(documentUri, orderedUnits);
    if (!groupId) {
      throw new Error('Canvas playback reorder requires the complete child set of one Group.');
    }
    if (!this.activeWebviewPanel) {
      throw new Error('No active Canvas editor for playback reorder.');
    }
    await this.sendRequest('nodes.reorderGroupChildren', {
      payload: {
        groupId,
        childIds: orderedUnits.map((unit) => unit.sourceNodeId),
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

  private resolveSingleGroupReorderParent(
    documentUri: string,
    orderedUnits: readonly CanvasPlaybackUnit[],
  ): string | undefined {
    const parents = new Set<string>();
    for (const unit of orderedUnits) {
      const parentId = this.resolveCanvasNodeParentId(documentUri, unit.sourceNodeId);
      if (!parentId) return undefined;
      parents.add(parentId);
    }
    if (parents.size !== 1) return undefined;
    const groupId = parents.values().next().value;
    if (!groupId) return undefined;
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    const nodes = Array.isArray(canvasData?.nodes) ? canvasData.nodes : [];
    const group = nodes.find((candidate) => candidate.id === groupId);
    if (group?.type !== 'group') return undefined;
    const childIds = readCanvasNodeContainerChildIds(group);
    const orderedChildIds = orderedUnits.map((unit) => unit.sourceNodeId);
    return childIds.length === orderedChildIds.length &&
      childIds.every((childId) => orderedChildIds.includes(childId))
      ? groupId
      : undefined;
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
  }

  private updateRememberedCanvasSnapshot(
    documentUri: string,
    canvasData: Record<string, unknown>,
  ): void {
    if (!isCanvasDataSnapshot(canvasData)) {
      throw new Error('Canvas snapshot violates the canonical six-node/three-connection contract.');
    }
    const nextPreviewFingerprint = createCanvasPreviewSemanticFingerprint(canvasData);
    this.canvasSnapshotsByDocumentUri.set(documentUri, canvasData);
    this.canvasRevisionsByDocumentUri.set(documentUri, this.getCanvasRevision(documentUri) + 1);
    this.canvasPreviewFingerprintsByDocumentUri.set(documentUri, nextPreviewFingerprint);
  }

  private setAuthoritativeCanvasSnapshot(documentUri: string, canvasData: CanvasData): void {
    this.authoritativeCanvasSnapshotsByDocumentUri.set(documentUri, canvasData);
    this.confirmedRemovedNodeIdsByDocumentUri.delete(documentUri);
  }

  private applyConfirmedCanvasContentNodeDelta(
    documentUri: string,
    removedNodeIds: readonly string[],
    restoredNodeIds: readonly string[],
  ): void {
    const confirmed = applyCanvasContentNodeDelta(
      this.confirmedRemovedNodeIdsByDocumentUri.get(documentUri) ?? [],
      { removedNodeIds, restoredNodeIds },
    );
    if (confirmed.size === 0) {
      this.confirmedRemovedNodeIdsByDocumentUri.delete(documentUri);
      return;
    }
    this.confirmedRemovedNodeIdsByDocumentUri.set(documentUri, new Set(confirmed));
  }

  private assertCanvasSnapshotCanBeSaved(documentUri: vscode.Uri, candidate: CanvasData): void {
    const key = documentUri.toString();
    const authoritative = this.authoritativeCanvasSnapshotsByDocumentUri.get(key);
    if (!authoritative) {
      throw new Error(
        'missing-authoritative-canvas-snapshot: Canvas document must finish loading before save.',
      );
    }
    const confirmedRemovedNodeIds = this.confirmedRemovedNodeIdsByDocumentUri.get(key) ?? [];
    logger.debug('canvas.save.snapshotBoundary', {
      authoritativeNodeCount: authoritative.nodes.length,
      candidateNodeCount: candidate.nodes.length,
      confirmedRemovalCount: Array.from(confirmedRemovedNodeIds).length,
    });
    assertCanvasDocumentSnapshotBoundary({
      authoritative,
      candidate,
      confirmedRemovedNodeIds,
    });
  }

  private getCanvasRevision(documentUri: string): number {
    return this.canvasRevisionsByDocumentUri.get(documentUri) ?? 0;
  }

  extractCanvasPlaybackPlan(sourceCanvasUri?: string): CanvasPlaybackPlan | undefined {
    const documentUri = sourceCanvasUri ?? this.activeDocument?.uri.toString();
    if (!documentUri) return undefined;
    const canvasData = this.canvasSnapshotsByDocumentUri.get(documentUri);
    if (!canvasData) return undefined;
    if (!isCanvasDataSnapshot(canvasData)) return undefined;
    return createCanvasPlaybackPlan({
      canvas: canvasData,
      selectedNodeId: this.readCanvasPlaybackSelectedNodeId(canvasData),
      adapterId: 'auto',
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
        const fsPath = await this.resolveAssetPath(boardRef.path, sourceDocumentUri);
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
    if (!isCanvasDataSnapshot(previewCanvasData)) {
      throw new Error('Canvas playback preview requires a valid canonical Canvas snapshot.');
    }
    const plan = createCanvasPlaybackPlan({
      canvas: previewCanvasData,
      selectedNodeId: this.readCanvasPlaybackSelectedNodeId(canvasData),
      adapterId: 'auto',
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

  private readPreviewSessionEnvelope(
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
    this.confirmedRemovedNodeIdsByDocumentUri.delete(documentUri);
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
      this.authoritativeCanvasSnapshotsByDocumentUri.delete(documentUri);
      this.confirmedRemovedNodeIdsByDocumentUri.delete(documentUri);
      this.canvasRevisionsByDocumentUri.delete(documentUri);
      this.dirtyCanvasDocumentUris.delete(documentUri);
      this.canvasPreviewFingerprintsByDocumentUri.delete(documentUri);
      this.canvasDataReadyDocumentUris.delete(documentUri);
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
    const candidate = await requestCanvasProjectSnapshot(webviewPanel.webview, 'vscode-save');
    this.assertCanvasSnapshotCanBeSaved(document.uri, candidate);
    const snapshot = await this.normalizeCanvasSnapshotForSave(candidate, document.uri);
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
    const candidate = await requestCanvasProjectSnapshot(webviewPanel.webview, 'save-as');
    this.assertCanvasSnapshotCanBeSaved(document.uri, candidate);
    const snapshot = await this.normalizeCanvasSnapshotForSave(candidate, document.uri);
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
    this.confirmedRemovedNodeIdsByDocumentUri.delete(documentUri);
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
    const result = await this.sendRequest<CanvasCreateCompositeResult>('nodes.createComposite', {
      payload: request,
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
    const contentSecurityPolicy = createCanvasWebviewContentSecurityPolicy(
      webview.cspSource,
      nonce,
    );

    return `<!DOCTYPE html>
<html ${injectLocaleAttribute()}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy};">
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
    message: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const data = message['data'];
    if (isPlainRecord(data)) {
      this.rememberCanvasSnapshot(document, data);
    }

    const requestedSaveReason = message['saveReason'];
    const saveReason =
      typeof requestedSaveReason === 'string' && isCanvasProjectSaveReason(requestedSaveReason)
        ? requestedSaveReason
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
    if (!isCanvasDataSnapshot(data)) {
      throw new Error(
        'Canvas save rejected a snapshot outside the canonical six-node/three-connection contract.',
      );
    }
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
      }
    }
  }

  private afterCanvasProjectSaved(
    document: vscode.CustomDocument,
    canvasData: CanvasData | Record<string, unknown> | null,
  ): void {
    if (!canvasData) return;
    const data = canvasData as unknown as Record<string, unknown>;
    if (!isCanvasDataSnapshot(data)) {
      throw new Error('Saved Canvas document does not satisfy the Canvas data contract.');
    }
    this.dirtyCanvasDocumentUris.delete(document.uri.toString());
    this.rememberCanvasSnapshot(document, data);
    this.setAuthoritativeCanvasSnapshot(document.uri.toString(), data);
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
          this.rememberCanvasSnapshot(document, canvasRecord);
          this.setAuthoritativeCanvasSnapshot(document.uri.toString(), data);
          const displayData = await this.projectCanvasDataForDisplay(
            data,
            document.uri,
            webviewPanel.webview,
          );
          if (isProjectedCanvasData(displayData)) {
            await this.tryRegenerateProjectedCanvas(displayData, webviewPanel.webview, document);
          }
          webviewPanel.webview.postMessage({ type: 'update', data: displayData });
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
      case 'canvasContentNodeDeltaApplied': {
        const removedNodeIds = message.removedNodeIds;
        const restoredNodeIds = message.restoredNodeIds;
        if (
          !isStringArray(removedNodeIds) ||
          !isStringArray(restoredNodeIds) ||
          (removedNodeIds.length === 0 && restoredNodeIds.length === 0)
        ) {
          throw new Error('Invalid Canvas content node delta evidence.');
        }
        const restoredNodeIdSet = new Set(restoredNodeIds);
        if (removedNodeIds.some((nodeId) => restoredNodeIdSet.has(nodeId))) {
          throw new Error('Canvas content node delta cannot remove and restore the same node.');
        }
        this.applyConfirmedCanvasContentNodeDelta(
          document.uri.toString(),
          removedNodeIds,
          restoredNodeIds,
        );
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
          if (videoExts.includes(ext) || mediaTypeHint === 'video') {
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

      case 'copyCanvasMaterialToMediaLibrary': {
        try {
          const fsPath = await this.resolveCanvasMaterialLocalFilePath(
            message,
            document.uri,
            'neko-canvas.copy-material-to-media-library',
          );
          const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
          if (!workspaceRoot) {
            throw new Error('Canvas material copy requires an owning workspace.');
          }
          const workspacePath = path.relative(workspaceRoot, fsPath).replace(/\\/gu, '/');
          if (
            workspacePath.length === 0 ||
            path.isAbsolute(workspacePath) ||
            workspacePath === '..' ||
            workspacePath.startsWith('../')
          ) {
            throw new Error('Canvas material copy requires a workspace-relative content source.');
          }
          await vscode.commands.executeCommand('neko.assets.copyToMediaLibrary', {
            kind: 'workspace-file',
            path: workspacePath,
          });
        } catch (error) {
          logger.error(`Failed to copy Canvas material to Media Library: ${error}`);
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
        const request = parseCanvasPreviewDelegateRequest(message);
        if (request.target === 'preview') {
          const fsPath = await this.resolveAssetPath(request.assetPath, document.uri);
          const fileUri = vscode.Uri.file(fsPath);
          const extension = path.extname(fsPath).slice(1).toLowerCase();
          if (
            request.mediaType === 'video' ||
            ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'].includes(extension)
          ) {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoPreview');
          } else if (
            request.mediaType === 'audio' ||
            ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'].includes(extension)
          ) {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.audioPreview');
          } else {
            await vscode.commands.executeCommand('vscode.open', fileUri);
          }
        } else {
          const fsPath = await this.resolveAssetPath(request.assetPath, document.uri);
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
        // CanvasEditOperation sync from webview — fire dirty event
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
      // Media playback via the canonical Node/FFmpeg runtime
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
          const dataUrl = await this.mediaRuntime.captureFrame(filePath, time);
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

      case 'project:addSource': {
        await this.handleCanvasProjectAddSource(
          (message as { request?: ProjectSourceAddRequest }).request,
          webviewPanel.webview,
          document.uri,
        );
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
            readFile: async (filePath) => vscode.workspace.fs.readFile(vscode.Uri.file(filePath)),
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

      case 'sendToAgent': {
        if (
          !Array.isArray(message.nodeIds) ||
          !message.nodeIds.every((nodeId) => typeof nodeId === 'string')
        ) {
          throw new Error('Canvas sendToAgent requires explicit node IDs.');
        }
        const nodeIds = message.nodeIds;
        const action = message.action as string;

        if (nodeIds.length === 0) {
          throw new Error('Canvas sendToAgent requires at least one node ID.');
        }
        if (action === 'generate') {
          const nodes: CanvasNode[] = [];
          for (const nodeId of nodeIds) {
            const node = await this.getNode(nodeId);
            if (!node) {
              throw new Error(`Cannot start Canvas generation: node "${nodeId}" was not found.`);
            }
            nodes.push(node);
          }
          const presentations = nodes.map(readCanonicalCanvasNodePresentation);
          const requestedPrompt =
            typeof message.prompt === 'string' && message.prompt.trim()
              ? message.prompt.trim()
              : undefined;
          const requestedMediaType =
            message.mediaType === 'image' ||
            message.mediaType === 'video' ||
            message.mediaType === 'audio'
              ? message.mediaType
              : undefined;
          const payload = {
            type: 'canvas-node' as const,
            id: nodes.length === 1 ? nodes[0]!.id : `canvas-selection:${nodes[0]!.id}`,
            label: nodes.length === 1 ? presentations[0]!.label : `${nodes.length} Canvas nodes`,
            summary: presentations.map((presentation) => presentation.summary).join('; '),
            data: {
              nodes: nodeIds,
              requestedAction: 'create-job',
              ...(requestedPrompt ? { prompt: requestedPrompt } : {}),
              ...(requestedMediaType ? { mediaType: requestedMediaType } : {}),
            },
          };
          const instruction = [
            'Create and run an AI Job for the selected Canvas nodes.',
            'Use the selected nodes as explicit input references and keep Job lifecycle outside Canvas.',
            requestedPrompt
              ? `Creative request: ${requestedPrompt}`
              : 'Determine the appropriate output from the selected content and preserve provenance.',
            requestedMediaType ? `Requested output modality: ${requestedMediaType}.` : undefined,
          ]
            .filter((line): line is string => line !== undefined)
            .join('\n');
          try {
            await vscode.commands.executeCommand('neko.agent.sendContext', payload);
            await vscode.commands.executeCommand('neko.ai.sendMessage', instruction);
          } catch (error) {
            logger.error(`Canvas quick generation failed: ${error}`);
            void handleError(error instanceof Error ? error : new Error(String(error)), {
              showToUser: true,
              severity: 'warning',
            });
          }
        } else if (action === 'batch') {
          throw new Error('Canvas batch generation requires an explicit Job workflow.');
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
          const presentation = readCanonicalCanvasNodePresentation(node);
          const payload = {
            type: 'canvas-node' as const,
            id: node.id,
            label: presentation.label,
            summary: presentation.summary,
            data: { nodes: nodeIds },
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
        if (!Array.isArray(message.nodes) || !message.nodes.every(isCanonicalCanvasNodeSnapshot)) {
          throw new Error('Canvas selection payload contains a non-canonical node.');
        }
        const nodes = message.nodes;
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
              ...this.readPreviewSessionEnvelope(message),
              error: 'Media source could not be resolved to a local file path.',
            });
            break;
          }
          const mediaInfo = projectCanvasMediaInfo(await this.mediaRuntime.probe(filePath));
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:probeResult',
            nodeId: message.nodeId,
            ...this.readPreviewSessionEnvelope(message),
            mediaInfo,
          });
        } catch (error) {
          logger.error(`Probe failed: ${error}`);
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:probeResult',
            nodeId: message.nodeId,
            ...this.readPreviewSessionEnvelope(message),
            error: error instanceof Error ? error.message : 'Probe failed',
          });
        }
        break;
      }

      case 'media:play': {
        const mediaInfo = parseCanvasMediaInfo(message.mediaInfo);
        const startTime = finitePlaybackNumber(message.startTime, 0);
        const speed = finitePlaybackNumber(message.speed, 1);
        const mediaType = readPlaybackMediaType(message.mediaType);
        if (!mediaInfo) {
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:streamReady',
            nodeId: message.nodeId,
            ...this.readPreviewSessionEnvelope(message),
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
              ...this.readPreviewSessionEnvelope(message),
              error: 'Media source could not be resolved to a local file path.',
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
            await this.stopCanvasPlayback(prev).catch(() => {});
          }
          const handle = await this.startCanvasPlayback(
            filePath,
            mediaInfo,
            mediaType,
            startTime,
            speed,
          );
          if (!handle.video && !handle.audio) {
            await this.postMediaPlaybackResponse(webviewPanel, {
              type: 'media:streamReady',
              nodeId: message.nodeId,
              ...this.readPreviewSessionEnvelope(message),
              error: 'Media stream could not be created for this source.',
            });
            break;
          }
          panelStreams.set(nodeId, handle);
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:streamReady',
            nodeId: message.nodeId,
            ...this.readPreviewSessionEnvelope(message),
            ...(handle.video ? { video: handle.video } : {}),
            ...(handle.audio ? { audio: handle.audio } : {}),
            mediaInfo,
            startTime,
            playbackRate: speed,
          });
        } catch (error) {
          await this.postMediaPlaybackResponse(webviewPanel, {
            type: 'media:streamReady',
            nodeId: message.nodeId,
            ...this.readPreviewSessionEnvelope(message),
            error: error instanceof Error ? error.message : 'Play failed',
          });
        }
        break;
      }

      case 'media:seek': {
        const nodeId = (message.nodeId as string) ?? '';
        const panelStreams = this._activeStreams.get(webviewPanel);
        const handle = panelStreams?.get(nodeId);
        if (!handle) break;
        const time = finitePlaybackNumber(message.time, 0);
        await this.stopCanvasPlayback(handle);
        const replacement = await this.startCanvasPlayback(
          handle.sourcePath,
          handle.mediaInfo,
          handle.mediaType,
          time,
          handle.speed,
        );
        panelStreams?.set(nodeId, replacement);
        await this.postMediaPlaybackResponse(webviewPanel, {
          type: 'media:streamReady',
          nodeId,
          ...this.readPreviewSessionEnvelope(message),
          ...(replacement.video ? { video: replacement.video } : {}),
          ...(replacement.audio ? { audio: replacement.audio } : {}),
          mediaInfo: replacement.mediaInfo,
          startTime: time,
          playbackRate: replacement.speed,
        });
        break;
      }

      case 'media:pause':
      case 'media:resume':
        break;

      case 'media:stop': {
        const nodeId = (message.nodeId as string) ?? '';
        const panelStreams = this._activeStreams.get(webviewPanel);
        const handle = panelStreams?.get(nodeId);
        if (!handle) break;
        await this.stopCanvasPlayback(handle);
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
        hasVideoDescriptor: Boolean(message.video),
        hasAudioDescriptor: Boolean(message.audio),
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
        const manifest = await variantApi.registerPreviewAsset({
          source: fsPath,
          kind:
            mediaTypeHint === 'image' || mediaTypeHint === 'video' || mediaTypeHint === 'audio'
              ? mediaTypeHint
              : 'unknown',
        });
        const variant = await variantApi.requestPreviewVariant(manifest.assetId, {
          role:
            role === 'thumbnail' || role === 'proxy' || role === 'fov-crop' ? role : 'thumbnail',
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

  /** Convert stored asset paths to webview URIs so the webview can display them */
  private async projectCanvasDataForDisplay(
    canvasData: CanvasData,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<CanvasData> {
    const displayData = structuredClone(canvasData);
    await this.normalizeCanvasPathsForLoad(
      displayData as unknown as Record<string, unknown>,
      documentUri,
      webview,
    );
    return displayData;
  }

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

  private async projectCanvasContentLocator(
    webview: vscode.Webview,
    locator: ContentLocator,
    documentUri: vscode.Uri,
    caller: string,
  ): Promise<string | undefined> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return undefined;
    const projection = new HostWebviewContentProjectionPort({
      contentRead: this.contentRead,
      resolver: {
        resolve: async (resolvedLocator) => {
          if (
            resolvedLocator.kind === 'document-entry' ||
            resolvedLocator.kind === 'package-resource'
          ) {
            const loaded = await this.contentRead.read(resolvedLocator, {
              maxBytes: 64 * 1024 * 1024,
            });
            return loaded.status === 'ready'
              ? `data:${loaded.mimeType ?? 'application/octet-stream'};base64,${Buffer.from(
                  loaded.bytes,
                ).toString('base64')}`
              : undefined;
          }
          const sourcePath = this.resolveContentLocatorLocalPath(resolvedLocator, workspaceRoot);
          const projected = await this.localResourceAccess.toWebviewUri(webview, sourcePath, {
            caller,
            extraRoots: [
              ...(webview.options.localResourceRoots ?? []),
              ...this.getCanvasLocalResourceRoots(documentUri),
            ],
          });
          return projected.ok ? projected.uri : undefined;
        },
      },
    });
    const result = await projection.project(locator);
    if (result.status === 'ready') return result.uri;
    logger.warn('Canvas content locator projection failed', {
      caller,
      locatorKind: locator.kind,
      diagnostic: result.diagnostic.code,
    });
    return undefined;
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
              code: 'add-source-failed',
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

    return this.createCanvasPickerSourceAddRequest(uri, documentUri, { request });
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
      case 'text':
        return { 'Text Files': ['md', 'markdown', 'txt', 'log', 'fountain'] };
      case 'file':
        return { 'All Files': ['*'] };
      case 'canvas':
        return { 'Neko Canvas': ['nkc'], 'All Files': ['*'] };
      default:
        return {
          Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
          Videos: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
          Audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
          'Text Files': ['md', 'markdown', 'txt', 'log', 'fountain'],
          'Neko Canvas': ['nkc'],
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
    const metadata = {
      ...(options.request.metadata ?? {}),
      canvasAdd: true,
      ...(assetKind ? { canvasAssetKind: assetKind } : {}),
      name: fileName,
      title: fileName.replace(/\.[^.]+$/, '') || fileName,
      ...(mediaType ? { mediaType } : {}),
      ...(textFormat ? { textFormat } : {}),
    };
    return createVSCodeProjectSourceAddRequest({
      requestId: options.request.requestId,
      kind: 'file-picker',
      formatId: 'nkc',
      sourceUri: uri,
      role:
        assetKind === 'canvas'
          ? 'project'
          : assetKind === 'file' || assetKind === 'text'
            ? 'document'
            : mediaType === 'audio'
              ? 'audio'
              : mediaType === 'image'
                ? 'image'
                : assetKind === 'media'
                  ? 'media'
                  : 'other',
      assetDirectory: mediaType ? 'media' : 'assets',
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
        metadata: {
          ...(request.metadata ?? {}),
          ...descriptor.metadata,
        },
      },
      {
        store: async (storageRequest) => {
          const projectRoot = path.dirname(documentUri.fsPath);
          const stored = await storeProjectSourceAddRequest(storageRequest, {
            documentPath: documentUri.fsPath,
            assetDirectory: request.assetDirectory,
            workspaceContext: this.createCanvasWorkspaceMediaPathContext(documentUri),
            fileOps: this.createCanvasSourceAssetFileOps(),
            writer: new NodeAuthorizedWorkspaceWriter({ workspaceRoot: projectRoot }),
            contractPath: (absolutePath) => this.contractExternalAssetPath(absolutePath),
            unmanagedSourceMessage:
              'Canvas media must use an authorized workspace or linked Media Library path before saving.',
          });

          if (stored.status !== 'ready') {
            return stored;
          }

          const runtimeSourcePath =
            stored.storage === 'copied'
              ? path.join(projectRoot, ...stored.durablePath.split('/'))
              : request.sourcePath;
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
                status: 'unavailable',
                diagnostic: createProjectFileDiagnostic({
                  code: 'missing-source',
                  message: 'Canvas text import did not produce a readable source path.',
                  recoverability: 'relink',
                }),
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
              return {
                status: 'unavailable',
                diagnostic: createProjectFileDiagnostic({
                  code: 'read-failed',
                  message: textResult.error,
                  recoverability: 'retry',
                }),
              };
            }
            textContent = textResult.text;
          }

          return {
            ...stored,
            metadata: {
              ...(stored.metadata ?? {}),
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
        const projected = await this.projectContentRepresentation(
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
        logger.warn('Document representation Preview projection failed', {
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
              ? {
                  previewSourceResourceRef: requireCanvasSerializableValue(
                    previewSource.source.resourceRef,
                    'Canvas preview ResourceRef',
                  ),
                }
              : {}),
            ...(previewSource.source?.documentResourceRef
              ? {
                  previewSourceDocumentResourceRef: requireCanvasSerializableValue(
                    previewSource.source.documentResourceRef,
                    'Canvas preview document resource ref',
                  ),
                }
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
    if (node.type === 'media') {
      return this.resolveMediaPlaybackPreviewSource(node, documentUri, webview);
    }
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

  private createCanvasContentLocator(resourceRef: ResourceRef): ContentLocator | undefined {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return undefined;
    const workspacePath = this.resolveResourceRefWorkspacePath(resourceRef, workspaceRoot);
    if (!workspacePath) return undefined;
    if (resourceRef.source.kind === 'generated-asset' || resourceRef.kind === 'generated') {
      const outputId =
        resourceRef.source.generatedAssetId ??
        (resourceRef.locator?.kind === 'generated-asset' ? resourceRef.locator.assetId : undefined);
      if (!outputId) return undefined;
      return {
        kind: 'generated-output',
        outputId,
        revision: resourceRef.fingerprint.value,
        digest: resourceRef.fingerprint.value,
        path: workspacePath,
      };
    }
    return {
      kind: 'workspace-file',
      path: workspacePath,
      ...(resourceRef.fingerprint.strategy === 'none'
        ? {}
        : {
            fingerprint: {
              strategy:
                resourceRef.fingerprint.strategy === 'hash'
                  ? ('sha256' as const)
                  : resourceRef.fingerprint.strategy === 'mtime-size'
                    ? ('mtime-size' as const)
                    : ('provider' as const),
              value: resourceRef.fingerprint.value,
            },
          }),
    };
  }

  private resolveResourceRefSourceLocalPath(resourceRef: ResourceRef): string | undefined {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return undefined;
    if (resourceRef.source.kind === 'generated-asset') {
      return resolveGeneratedAssetResourceRef(
        resourceRef,
        createWorkspacePathResolver(workspaceRoot),
        workspaceRoot,
      )?.path;
    }
    const workspacePath = this.resolveResourceRefWorkspacePath(resourceRef, workspaceRoot);
    return workspacePath ? path.resolve(workspaceRoot, workspacePath) : undefined;
  }

  private resolveResourceRefWorkspacePath(
    resourceRef: ResourceRef,
    workspaceRoot: string,
  ): string | undefined {
    const candidate =
      resourceRef.source.projectRelativePath ??
      resourceRef.source.filePath ??
      resourceRef.source.document?.filePath ??
      (resourceRef.locator?.kind === 'file' ? resourceRef.locator.path : undefined);
    if (!candidate) return undefined;
    const resolver = createWorkspacePathResolver(workspaceRoot);
    const resolved = resolver.resolveSource(candidate, workspaceRoot);
    if (resolved.type !== 'local' || resolver.hasVariable(resolved.path)) return undefined;
    const relative = path.relative(workspaceRoot, resolved.path).replace(/\\/gu, '/');
    return relative && relative !== '..' && !relative.startsWith('../') ? relative : undefined;
  }

  private async projectContentRepresentation(
    webview: vscode.Webview,
    resourceRef: unknown,
    caller: string,
    preferredRole?: ResourceVariantRole,
    requestContext?: PreviewResourceVariantRequestContext,
  ): Promise<string | undefined> {
    if (!isResourceRef(resourceRef)) {
      return undefined;
    }
    const documentEntryPath = readCanvasNativeDocumentEntryPath(resourceRef);
    if (documentEntryPath) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const workspacePath = workspaceRoot
        ? this.resolveResourceRefWorkspacePath(resourceRef, workspaceRoot)
        : undefined;
      const source = workspacePath
        ? ({ kind: 'workspace-file', path: workspacePath } as const)
        : undefined;
      const direct =
        source?.kind === 'workspace-file'
          ? await this.contentRead.read(
              { kind: 'document-entry', source, entryPath: documentEntryPath },
              { maxBytes: 64 * 1024 * 1024 },
            )
          : undefined;
      if (!direct || direct.status !== 'ready' || !direct.bytes) {
        logger.warn('Native document entry read failed', {
          caller,
          requestId: requestContext?.requestId,
          sourceId: requestContext?.sourceId,
          resourceId: resourceRef.id,
          entryPath: documentEntryPath,
          status: direct?.status ?? 'unavailable',
        });
        return undefined;
      }
      const mimeType = inferNativeDocumentImageMimeType(documentEntryPath);
      if (!mimeType) {
        logger.warn('Native document entry image type is unsupported', {
          caller,
          requestId: requestContext?.requestId,
          sourceId: requestContext?.sourceId,
          resourceId: resourceRef.id,
          entryPath: documentEntryPath,
        });
        return undefined;
      }
      return `data:${mimeType};base64,${Buffer.from(direct.bytes).toString('base64')}`;
    }
    const role = resolveCanvasPreviewVariantRole(resourceRef, preferredRole);
    if (role === 'source') {
      const source = this.createCanvasContentLocator(resourceRef);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!source || !workspaceRoot) return undefined;
      const projection = new HostWebviewContentProjectionPort({
        contentRead: this.contentRead,
        resolver: {
          resolve: async (locator) => {
            const sourcePath = this.resolveContentLocatorLocalPath(locator, workspaceRoot);
            const projected = await this.localResourceAccess.toWebviewUri(webview, sourcePath, {
              caller,
              extraRoots: webview.options.localResourceRoots ?? [],
            });
            return projected.ok ? projected.uri : undefined;
          },
        },
      });
      const projected = await projection.project(source);
      return projected.status === 'ready' ? projected.uri : undefined;
    }
    const source = this.createCanvasContentLocator(resourceRef);
    const spec = createCanvasRepresentationSpec(role);
    if (!source || !spec) return undefined;
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
      this.contentRepresentation.getRepresentation({
        source,
        spec,
        signal: abortController.signal,
      }),
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
    if (result.status === 'ready') {
      const loaded = await this.contentRepresentation.readRepresentation(result.locator, {
        maxBytes: 64 * 1024 * 1024,
        signal: abortController.signal,
      });
      if (loaded.status !== 'ready') {
        logger.warn('Canvas representation read failed', {
          caller,
          resourceId: resourceRef.id,
          diagnostic: loaded.diagnostic.code,
        });
        return undefined;
      }
      const mimeType = loaded.metadata.mimeType ?? inferCanvasRepresentationMimeType(spec);
      logger.debug('Content representation projected for Preview', {
        caller,
        requestId: requestContext?.requestId,
        sourceId: requestContext?.sourceId,
        resourceId: resourceRef.id,
        entryPath:
          resourceRef.locator?.kind === 'document' ? resourceRef.locator.entryPath : undefined,
        elapsedMs,
      });
      return `data:${mimeType};base64,${Buffer.from(loaded.bytes).toString('base64')}`;
    }
    logger.warn('Canvas representation unavailable', {
      caller,
      resourceId: resourceRef.id,
      diagnostic: result.diagnostic.code,
      requestId: requestContext?.requestId,
      sourceId: requestContext?.sourceId,
      elapsedMs,
    });
    return undefined;
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
    _preferredRole?: ResourceVariantRole,
  ): Promise<string> {
    const sourcePath = this.resolveResourceRefSourceLocalPath(resourceRef);
    if (sourcePath) return sourcePath;
    throw new Error(`Resource source could not be resolved to a local path for ${caller}.`);
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
          : reason === 'unauthorized-cache-root'
            ? 'Document cache is outside the allowed project or VS Code cache roots.'
            : 'Canvas content could not be projected for this view.',
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
      'Canvas media path is not portable; move it into the workspace or a linked Media Library before saving.',
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
        case 'markdown':
          label = String(data.title || 'Markdown');
          detail = String(data.content || '').slice(0, 40) || undefined;
          break;
        case 'media': {
          const assetPath = String(data.assetPath ?? '');
          label = String(data.title || assetPath.split('/').pop() || 'Media');
          detail = String(data.mediaType ?? 'media');
          break;
        }
        case 'group':
          label = String(data.label || 'Group');
          detail = `${readCanvasNodeContainerChildIds(n).length} items`;
          break;
        case 'job':
          label = String(data.title || 'JobCard');
          detail = String(data.status || 'draft');
          break;
        case 'file': {
          const filePath = String(data.path ?? '');
          label = String(data.title || filePath.split('/').pop() || 'File');
          detail = data.mediaType ? String(data.mediaType) : undefined;
          break;
        }
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
        ...(type === 'group' ? { childIds: readCanvasNodeContainerChildIds(n) } : {}),
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
    const projectionSummary = readCanvasProjectionSummary(canvasData);

    this.statusBar.update({
      nodeCount: nodes.length,
      connectionCount: connections.length,
      zoom: Number(viewport.zoom ?? 1),
      selectedCount: selectedNodeIds.length,
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
    metadataKind === 'file' ||
    metadataKind === 'canvas'
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

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function inferNativeDocumentImageMimeType(entryPath: string): string | undefined {
  switch (path.extname(entryPath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.bmp':
      return 'image/bmp';
    default:
      return undefined;
  }
}

function createUnavailableCanvasContentReadService(): ContentReadService {
  return {
    stat: async (locator) => ({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-unsupported' },
    }),
    read: async (locator) => ({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-unsupported' },
    }),
  };
}
