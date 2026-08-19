import { validateContentLocator, type ContentLocator } from '@neko/content';
import {
  isThreeReferenceStagingSnapshot,
  type ThreeReferenceStagingSnapshot,
  type ThreeReferenceSubject,
} from './three-reference.js';

export * from './engine-preview.js';
export * from './model-preview.js';
export * from './three-reference.js';

export const PREVIEW_HOST_RUNTIME_ROUTES = {
  snapshotGet: 'snapshot.get',
  viewOpen: 'view.open',
  viewPin: 'view.pin',
  viewClose: 'view.close',
  contentResolve: 'content.resolve',
} as const;

export type PreviewHostRuntimeRoute =
  (typeof PREVIEW_HOST_RUNTIME_ROUTES)[keyof typeof PREVIEW_HOST_RUNTIME_ROUTES];
export type PreviewContentKind = 'image' | 'video' | 'audio' | 'document' | 'model' | 'text';
export type PreviewViewPresentation = 'temporary' | 'pinned' | 'side';

export function createSourceModelStaging(
  sessionId: string,
  subject: Extract<ThreeReferenceSubject, { readonly kind: 'source-model' }>,
): ThreeReferenceStagingSnapshot & {
  readonly subject: Extract<ThreeReferenceSubject, { readonly kind: 'source-model' }>;
} {
  const staging: ThreeReferenceStagingSnapshot & {
    readonly subject: Extract<ThreeReferenceSubject, { readonly kind: 'source-model' }>;
  } = {
    sessionId,
    subject,
    selectedPurposes: ['appearance', 'camera'],
    camera: {
      cameraId: 'camera-front',
      position: { x: 0, y: 0.15, z: 3.5 },
      target: { x: 0, y: 0, z: 0 },
      fieldOfViewDeg: 45,
      aspectRatio: 1,
    },
  };
  if (!isThreeReferenceStagingSnapshot(staging)) {
    throw new Error('Invalid initial 3D Reference staging for source-model.');
  }
  return staging;
}

const PREVIEW_FILE_KINDS = {
  image: new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif']),
  video: new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'm4v', 'wmv']),
  audio: new Set(['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma', 'opus']),
  document: new Set(['pdf', 'docx', 'epub', 'cbz']),
  model: new Set(['glb', 'gltf', 'obj', 'stl', 'ply']),
  text: new Set([
    'txt',
    'md',
    'json',
    'yaml',
    'yml',
    'csv',
    'xml',
    'html',
    'htm',
    'css',
    'js',
    'jsx',
    'ts',
    'tsx',
    'srt',
    'vtt',
    'ass',
    'ssa',
    'sub',
    'fountain',
  ]),
} as const;

const PREVIEW_MIME_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  flv: 'video/x-flv',
  m4v: 'video/x-m4v',
  wmv: 'video/x-ms-wmv',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  wma: 'audio/x-ms-wma',
  opus: 'audio/opus',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  cbz: 'application/x-cbz',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  obj: 'model/obj',
  stl: 'model/stl',
  ply: 'model/ply',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  yaml: 'application/x-yaml',
  yml: 'application/x-yaml',
  csv: 'text/csv',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  jsx: 'text/jsx',
  ts: 'text/typescript',
  tsx: 'text/tsx',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  ass: 'text/x-ssa',
  ssa: 'text/x-ssa',
  sub: 'text/x-sub',
  fountain: 'text/plain',
};

const EPUB_RESOURCE_MIME_TYPES: Readonly<Record<string, string>> = {
  xml: 'application/xml',
  opf: 'application/oebps-package+xml',
  ncx: 'application/x-dtbncx+xml',
  xhtml: 'application/xhtml+xml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export interface PreviewRuntimeIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly documentId: string;
  readonly sessionId: string;
  readonly rendererSessionId: string;
}

export interface PreviewMediaDescriptor {
  readonly descriptorId: string;
  readonly sourceFingerprint: string;
  readonly contentLocator?: ContentLocator;
  readonly url: string;
  readonly resourceUris?: Readonly<Record<string, string>>;
  readonly contentKind: PreviewContentKind;
  readonly mediaType: string;
  readonly displayName: string;
  readonly byteLength: number;
}

export type PreviewProjection =
  | {
      readonly identity: PreviewRuntimeIdentity;
      readonly presentation: PreviewViewPresentation;
      readonly status: 'loading';
    }
  | {
      readonly identity: PreviewRuntimeIdentity;
      readonly presentation: PreviewViewPresentation;
      readonly status: 'ready';
      readonly descriptor: PreviewMediaDescriptor;
    }
  | {
      readonly identity: PreviewRuntimeIdentity;
      readonly presentation: PreviewViewPresentation;
      readonly status: 'unsupported' | 'unavailable';
      readonly diagnostic: PreviewDiagnostic;
    };

export interface PreviewDiagnostic {
  readonly code:
    | 'preview-unsupported-kind'
    | 'preview-source-unavailable'
    | 'preview-stale-owner'
    | 'preview-descriptor-released';
  readonly message: string;
}

export interface PreviewRuntimeRequest {
  readonly requestId: string;
  readonly route: PreviewHostRuntimeRoute;
  readonly identity: PreviewRuntimeIdentity;
}

export interface PreviewMediaRange {
  readonly start: number;
  readonly endInclusive?: number;
}

export interface PreviewProjectionEvent {
  readonly sequence: number;
  readonly projection: PreviewProjection;
}

export interface PreviewHostRuntime {
  readonly identity: PreviewRuntimeIdentity;
  getSnapshot(): Promise<PreviewProjection>;
  execute(request: PreviewRuntimeRequest): Promise<PreviewProjection>;
  subscribe(listener: (event: PreviewProjectionEvent) => void): () => void;
}

export class PreviewContractError extends Error {
  readonly code: 'invalid-preview-payload' | 'preview-stale-identity';

  constructor(code: PreviewContractError['code'], message: string) {
    super(message);
    this.name = 'PreviewContractError';
    this.code = code;
  }
}

export function parsePreviewRuntimeIdentity(value: unknown): PreviewRuntimeIdentity {
  const record = requireRecord(value, 'Preview identity must be an object.');
  if (Object.keys(record).length !== 8) {
    throw invalidPayload('Preview identity contains an unknown field.');
  }
  return {
    projectId: requireOpaqueIdentity(record['projectId'], 'Preview Project identity is required.'),
    workspaceId: requireOpaqueIdentity(
      record['workspaceId'],
      'Preview Workspace identity is required.',
    ),
    windowId: requireOpaqueIdentity(record['windowId'], 'Preview Window identity is required.'),
    viewId: requireOpaqueIdentity(record['viewId'], 'Preview View identity is required.'),
    viewInstanceId: requireOpaqueIdentity(
      record['viewInstanceId'],
      'Preview View instance identity is required.',
    ),
    documentId: requireOpaqueIdentity(
      record['documentId'],
      'Preview document identity is required.',
    ),
    sessionId: requireOpaqueIdentity(record['sessionId'], 'Preview session identity is required.'),
    rendererSessionId: requireOpaqueIdentity(
      record['rendererSessionId'],
      'Preview renderer session identity is required.',
    ),
  };
}

export function parsePreviewMediaDescriptor(value: unknown): PreviewMediaDescriptor {
  const record = requireRecord(value, 'Preview media descriptor must be an object.');
  const contentLocator =
    record['contentLocator'] === undefined
      ? undefined
      : validateContentLocator(record['contentLocator']);
  if (contentLocator && !contentLocator.ok) {
    throw invalidPayload(
      `Preview media descriptor contentLocator is invalid: ${contentLocator.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('; ')}`,
    );
  }
  const descriptor = {
    descriptorId: requireOpaqueIdentity(
      record['descriptorId'],
      'Preview descriptor identity is required.',
    ),
    sourceFingerprint: requireOpaqueIdentity(
      record['sourceFingerprint'],
      'Preview descriptor source fingerprint is required.',
    ),
    ...(contentLocator?.ok ? { contentLocator: contentLocator.locator } : {}),
    url: requireOpenNekoResourceUrl(record['url']),
    ...(record['resourceUris'] === undefined
      ? {}
      : { resourceUris: requireResourceUris(record['resourceUris']) }),
    contentKind: requirePreviewContentKind(record['contentKind']),
    mediaType: requireMediaType(record['mediaType']),
    displayName: requireNonEmptyString(record['displayName'], 'Preview display name is required.'),
    byteLength: requireNonNegativeInteger(
      record['byteLength'],
      'Preview byte length must be a non-negative integer.',
    ),
  };
  return descriptor;
}

export function parsePreviewProjection(value: unknown): PreviewProjection {
  const record = requireRecord(value, 'Preview projection must be an object.');
  const identity = parsePreviewRuntimeIdentity(record['identity']);
  const presentation = requirePresentation(record['presentation']);
  if (record['status'] === 'loading') {
    requireExactKeys(record, ['identity', 'presentation', 'status']);
    return { identity, presentation, status: 'loading' };
  }
  if (record['status'] === 'ready') {
    requireExactKeys(record, ['identity', 'presentation', 'status', 'descriptor']);
    return {
      identity,
      presentation,
      status: 'ready',
      descriptor: parsePreviewMediaDescriptor(record['descriptor']),
    };
  }
  if (record['status'] !== 'unsupported' && record['status'] !== 'unavailable') {
    throw invalidPayload('Preview projection status is invalid.');
  }
  requireExactKeys(record, ['identity', 'presentation', 'status', 'diagnostic']);
  const diagnostic = requireRecord(
    record['diagnostic'],
    'Preview unavailable projection requires a diagnostic.',
  );
  const code = diagnostic['code'];
  if (
    code !== 'preview-unsupported-kind' &&
    code !== 'preview-source-unavailable' &&
    code !== 'preview-stale-owner' &&
    code !== 'preview-descriptor-released'
  ) {
    throw invalidPayload('Preview diagnostic code is invalid.');
  }
  return {
    identity,
    presentation,
    status: record['status'],
    diagnostic: {
      code,
      message: requireNonEmptyString(
        diagnostic['message'],
        'Preview diagnostic message is required.',
      ),
    },
  };
}

export function parsePreviewRuntimeRequest(value: unknown): PreviewRuntimeRequest {
  const record = requireRecord(value, 'Preview runtime request must be an object.');
  requireExactKeys(record, ['requestId', 'route', 'identity']);
  const route = Object.values(PREVIEW_HOST_RUNTIME_ROUTES).find(
    (candidate) => candidate === record['route'],
  );
  if (!route) throw invalidPayload('Preview runtime route is invalid.');
  const request = {
    requestId: requireNonEmptyString(record['requestId'], 'Preview request identity is required.'),
    route,
    identity: parsePreviewRuntimeIdentity(record['identity']),
  };
  assertNoForbiddenTransportValue(request);
  return request;
}

export function parsePreviewMediaRange(value: unknown): PreviewMediaRange {
  const record = requireRecord(value, 'Preview media range must be an object.');
  const start = requireNonNegativeInteger(
    record['start'],
    'Preview media range start must be a non-negative integer.',
  );
  const endInclusive =
    record['endInclusive'] === undefined
      ? undefined
      : requireNonNegativeInteger(
          record['endInclusive'],
          'Preview media range end must be a non-negative integer.',
        );
  if (endInclusive !== undefined && endInclusive < start) {
    throw invalidPayload('Preview media range end cannot precede its start.');
  }
  return endInclusive === undefined ? { start } : { start, endInclusive };
}

export function assertPreviewRuntimeIdentity(
  expected: PreviewRuntimeIdentity,
  actual: PreviewRuntimeIdentity,
): void {
  for (const key of [
    'projectId',
    'workspaceId',
    'windowId',
    'viewId',
    'viewInstanceId',
    'documentId',
    'sessionId',
    'rendererSessionId',
  ] as const) {
    if (expected[key] !== actual[key]) {
      throw new PreviewContractError(
        'preview-stale-identity',
        `Preview ${key} does not match its owning runtime.`,
      );
    }
  }
}

export function assertNoForbiddenTransportValue(value: unknown): void {
  inspectTransportValue(value, 'Preview payload');
}

export function detectPreviewContentKind(fileName: string): PreviewContentKind | undefined {
  const extension = fileExtension(fileName);
  for (const kind of ['image', 'video', 'audio', 'document', 'model', 'text'] as const) {
    if (PREVIEW_FILE_KINDS[kind].has(extension)) return kind;
  }
  return undefined;
}

export function getPreviewMediaType(fileName: string): string | undefined {
  return PREVIEW_MIME_TYPES[fileExtension(fileName)];
}

export function getEpubResourceMediaType(entryPath: string): string {
  if (entryPath === 'mimetype') return 'application/epub+zip';
  return EPUB_RESOURCE_MIME_TYPES[fileExtension(entryPath)] ?? 'application/octet-stream';
}

function inspectTransportValue(value: unknown, label: string): void {
  if (typeof value === 'string') {
    if (
      value.startsWith('/') ||
      /^[A-Za-z]:[\\/]/u.test(value) ||
      /(?:file:\/\/|https?:\/\/(?:localhost|127\.0\.0\.1)|(?:^|[?&])token=)/iu.test(value)
    ) {
      throw invalidPayload(`${label} contains a forbidden path, URL or token.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectTransportValue(entry, `${label}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (/(?:absolutePath|filePath|cachePath|resourceUrl|providerSecret|clientToken)/iu.test(key)) {
      throw invalidPayload(`${label} contains forbidden field '${key}'.`);
    }
    inspectTransportValue(entry, `${label}.${key}`);
  }
}

function fileExtension(fileName: string): string {
  const normalized = fileName.replaceAll('\\', '/');
  const baseName = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = baseName.lastIndexOf('.');
  return dot < 0 || dot === baseName.length - 1 ? '' : baseName.slice(dot + 1).toLocaleLowerCase();
}

function requirePreviewContentKind(value: unknown): PreviewContentKind {
  if (
    value === 'image' ||
    value === 'video' ||
    value === 'audio' ||
    value === 'document' ||
    value === 'model' ||
    value === 'text'
  ) {
    return value;
  }
  throw invalidPayload('Preview content kind is unsupported.');
}

function requirePresentation(value: unknown): PreviewViewPresentation {
  if (value === 'temporary' || value === 'pinned' || value === 'side') return value;
  throw invalidPayload('Preview presentation is invalid.');
}

function requireMediaType(value: unknown): string {
  const mediaType = requireNonEmptyString(value, 'Preview media type is required.');
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu.test(mediaType)) {
    throw invalidPayload('Preview media type is invalid.');
  }
  return mediaType;
}

function requireOpenNekoResourceUrl(value: unknown): string {
  if (typeof value !== 'string') throw invalidPayload('Preview media URL is required.');
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'openneko:' ||
      url.hostname !== 'resource' ||
      !/^\/[A-Za-z0-9_-]{32}(?:\/.*)?$/u.test(url.pathname) ||
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
    throw invalidPayload('Preview media URL must use an authorized OpenNeko resource.');
  }
}

function requireResourceUris(value: unknown): Readonly<Record<string, string>> {
  const record = requireRecord(value, 'Preview resource URI map must be an object.');
  const result: Record<string, string> = {};
  for (const [reference, uri] of Object.entries(record)) {
    if (reference.trim().length === 0 || reference.includes('\0')) {
      throw invalidPayload('Preview resource URI reference is invalid.');
    }
    result[reference] = requireOpenNekoResourceUrl(uri);
  }
  if (Object.keys(result).length === 0) {
    throw invalidPayload('Preview resource URI map must not be empty.');
  }
  return result;
}

function requireOpaqueIdentity(value: unknown, message: string): string {
  const identity = requireNonEmptyString(value, message);
  if (identity.startsWith('/') || identity.includes('\\') || identity.includes('://')) {
    throw invalidPayload(message);
  }
  return identity;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw invalidPayload(message);
  return value;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw invalidPayload(message);
  return value as number;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw invalidPayload(message);
  return value;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw invalidPayload('Preview payload contains unsupported fields.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidPayload(message: string): PreviewContractError {
  return new PreviewContractError('invalid-preview-payload', message);
}
export * from './session-registry';
