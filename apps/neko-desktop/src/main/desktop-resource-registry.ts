import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { Readable } from 'node:stream';
import type { Session } from 'electron';
import {
  type NodeMediaPublisher,
  type RegisteredMediaFile,
  type RegisteredPcmStream,
  type RunningProcess,
} from '@neko/media/node';
import { DESKTOP_APP_ORIGIN, DESKTOP_RESOURCE_HOST, DESKTOP_RESOURCE_ORIGIN } from './security';

export interface DesktopResourceOwner {
  readonly windowId: string;
  readonly viewId: string;
  readonly sessionId: string;
  readonly rendererSessionId: string;
  readonly revision: string;
}

export interface DesktopAuthorizedFileSource {
  readonly absolutePath: string;
  readonly mediaType: string;
  readonly revision: string;
}

export interface DesktopResourceLease {
  readonly url: string;
  release(): void;
}

export interface DesktopResourceSetEntry {
  readonly virtualPath: string;
  readonly path: string;
  readonly contentType: string;
  readonly revision?: string;
}

interface RegisteredFileSource {
  readonly absolutePath: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly statFingerprint: string;
}

interface RegistrationBase {
  readonly id: string;
  readonly owner: DesktopResourceOwner;
  readonly webContentsId: number;
  readonly abortController: AbortController;
  readonly publisherId?: number;
}

interface FileRegistration extends RegistrationBase {
  readonly kind: 'file';
  readonly source: RegisteredFileSource;
}

interface PcmRegistration extends RegistrationBase {
  readonly kind: 'pcm';
  readonly createStream: (signal: AbortSignal) => RunningProcess;
  readonly priming: Deferred<void>;
  consumed: boolean;
}

interface ResourceSetRegistration extends RegistrationBase {
  readonly kind: 'resource-set';
  readonly entries: ReadonlyMap<string, RegisteredFileSource>;
}

type ResourceRegistration = FileRegistration | PcmRegistration | ResourceSetRegistration;

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

type ParsedRange =
  | { readonly status: 'full' }
  | { readonly status: 'partial'; readonly range: ByteRange }
  | { readonly status: 'invalid' };

export class DesktopResourceRegistry {
  private readonly registrations = new Map<string, ResourceRegistration>();
  private readonly webContentsByWindow = new Map<string, number>();
  private readonly allowedOrigins: ReadonlySet<string>;
  private nextPublisherId = 1;
  private disposed = false;

  constructor(input: { readonly allowedOrigins?: readonly string[] } = {}) {
    this.allowedOrigins = new Set(input.allowedOrigins ?? [DESKTOP_APP_ORIGIN]);
  }

  bindWindow(windowId: string, webContentsId: number): void {
    this.requireActive();
    requireIdentity(windowId, 'windowId');
    if (!Number.isSafeInteger(webContentsId) || webContentsId <= 0) {
      throw new Error('Desktop resource webContentsId must be a positive integer.');
    }
    const current = this.webContentsByWindow.get(windowId);
    if (current !== undefined && current !== webContentsId) {
      throw new Error(`Desktop resource Window '${windowId}' is already bound.`);
    }
    this.webContentsByWindow.set(windowId, webContentsId);
  }

  unbindWindow(windowId: string): void {
    this.releaseWindow(windowId);
    this.webContentsByWindow.delete(windowId);
  }

  async registerFile(
    owner: DesktopResourceOwner,
    source: DesktopAuthorizedFileSource,
  ): Promise<DesktopResourceLease> {
    this.requireActive();
    const registration = await this.createFileRegistration(owner, source);
    this.registrations.set(registration.id, registration);
    return this.createLease(registration.id, resourceUrl(registration.id));
  }

  async registerResourceSet(
    owner: DesktopResourceOwner,
    entries: readonly DesktopResourceSetEntry[],
    entryPath: string,
  ): Promise<DesktopResourceLease> {
    this.requireActive();
    const base = this.createBase(owner);
    if (entries.length === 0) {
      throw new Error('Desktop resource set requires at least one entry.');
    }
    const normalizedEntryPath = normalizeVirtualPath(entryPath);
    const records = new Map<string, RegisteredFileSource>();
    for (const entry of entries) {
      const virtualPath = normalizeVirtualPath(entry.virtualPath);
      if (records.has(virtualPath)) {
        throw new Error(`Desktop resource set contains duplicate path '${virtualPath}'.`);
      }
      records.set(
        virtualPath,
        await registerFileSource({
          absolutePath: entry.path,
          mediaType: entry.contentType,
          revision: entry.revision ?? base.owner.revision,
        }),
      );
    }
    if (!records.has(normalizedEntryPath)) {
      throw new Error(
        `Desktop resource set entry point '${normalizedEntryPath}' is not registered.`,
      );
    }
    const registration: ResourceSetRegistration = {
      ...base,
      kind: 'resource-set',
      entries: records,
    };
    this.registrations.set(registration.id, registration);
    return this.createLease(
      registration.id,
      `${resourceUrl(registration.id)}/${encodeVirtualPath(normalizedEntryPath)}`,
    );
  }

  createMediaPublisher(owner: DesktopResourceOwner): NodeMediaPublisher {
    this.requireActive();
    assertPartialOwner(owner);
    const publisherId = this.nextPublisherId;
    this.nextPublisherId += 1;
    return {
      registerFile: async (absolutePath, mediaType) => {
        const registration = await this.createFileRegistration(
          owner,
          {
            absolutePath,
            mediaType,
            revision: owner.revision,
          },
          publisherId,
        );
        this.registrations.set(registration.id, registration);
        return this.createPublishedFile(registration);
      },
      registerPcm: async (createStream): Promise<RegisteredPcmStream> => {
        const base = this.createBase(owner, publisherId);
        const registration: PcmRegistration = {
          ...base,
          kind: 'pcm',
          createStream,
          priming: deferred(),
          consumed: false,
        };
        this.registrations.set(registration.id, registration);
        const published = this.createPublishedFile(registration);
        return {
          ...published,
          prime: () => registration.priming.resolve(),
        };
      },
      unregister: (id) => this.releasePublisherRegistration(publisherId, id),
    };
  }

  authorizeRequest(url: string, webContentsId: number): boolean {
    if (this.disposed || !Number.isSafeInteger(webContentsId) || webContentsId <= 0) return false;
    const id = tryReadResourceId(url);
    if (!id) return false;
    return this.registrations.get(id)?.webContentsId === webContentsId;
  }

  async handle(request: Request): Promise<Response> {
    this.requireActive();
    const url = new URL(request.url);
    if (
      url.protocol !== 'openneko:' ||
      url.host !== DESKTOP_RESOURCE_HOST ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return response(404, 'Resource not found');
    }
    const originHeaders = this.createOriginHeaders(request);
    if (originHeaders instanceof Response) return originHeaders;
    if (request.method === 'OPTIONS') {
      return this.handlePreflight(request, originHeaders);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return response(405, 'Method Not Allowed', {
        ...originHeaders,
        Allow: 'GET, HEAD, OPTIONS',
      });
    }
    const route = parseResourceRoute(url.pathname);
    if (!route) return response(404, 'Resource not found', originHeaders);
    const registration = this.registrations.get(route.id);
    if (!registration) return response(404, 'Resource not found', originHeaders);
    if (registration.kind === 'file') {
      if (route.virtualPath !== undefined) {
        return response(404, 'Resource not found', originHeaders);
      }
      return this.serveFile(request, registration, registration.source, originHeaders);
    }
    if (registration.kind === 'pcm') {
      if (route.virtualPath !== undefined) {
        return response(404, 'Resource not found', originHeaders);
      }
      return this.servePcm(request, registration, originHeaders);
    }
    if (route.virtualPath === undefined) {
      return response(404, 'Resource not found', originHeaders);
    }
    let virtualPath: string;
    try {
      virtualPath = decodeVirtualPath(route.virtualPath);
    } catch {
      return response(400, 'Resource path is invalid', originHeaders);
    }
    const source = registration.entries.get(virtualPath);
    if (!source) return response(404, 'Resource not found', originHeaders);
    return this.serveFile(request, registration, source, originHeaders);
  }

  releaseSession(sessionId: string): void {
    this.releaseWhere((record) => record.owner.sessionId === sessionId);
  }

  releaseView(windowId: string, viewId: string): void {
    assertPartialOwner({ windowId, viewId });
    this.releaseWhere(
      (record) => record.owner.windowId === windowId && record.owner.viewId === viewId,
    );
  }

  releaseWindow(windowId: string): void {
    assertPartialOwner({ windowId });
    this.releaseWhere((record) => record.owner.windowId === windowId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of [...this.registrations.keys()]) this.release(id);
    this.webContentsByWindow.clear();
  }

  private async createFileRegistration(
    owner: DesktopResourceOwner,
    source: DesktopAuthorizedFileSource,
    publisherId?: number,
  ): Promise<FileRegistration> {
    return {
      ...this.createBase(owner, publisherId),
      kind: 'file',
      source: await registerFileSource(source),
    };
  }

  private createBase(owner: DesktopResourceOwner, publisherId?: number): RegistrationBase {
    assertOwner(owner);
    const webContentsId = this.webContentsByWindow.get(owner.windowId);
    if (webContentsId === undefined) {
      throw new Error(`Desktop resource Window '${owner.windowId}' is not bound.`);
    }
    return {
      id: this.createId(),
      owner,
      webContentsId,
      abortController: new AbortController(),
      ...(publisherId === undefined ? {} : { publisherId }),
    };
  }

  private async serveFile(
    request: Request,
    registration: RegistrationBase,
    source: RegisteredFileSource,
    originHeaders: Readonly<Record<string, string>>,
  ): Promise<Response> {
    const metadata = await readCurrentFileMetadata(source.absolutePath);
    if (
      !metadata ||
      !metadata.isFile() ||
      metadata.size !== source.byteLength ||
      `${metadata.mtimeMs}:${metadata.size}` !== source.statFingerprint
    ) {
      return response(409, 'Resource revision changed', originHeaders);
    }
    const range = parseRange(request.headers.get('Range') ?? undefined, source.byteLength);
    const headers: Record<string, string> = {
      ...originHeaders,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Type': source.mediaType,
      'X-Content-Type-Options': 'nosniff',
    };
    if (range.status === 'invalid') {
      return response(416, '', {
        ...headers,
        'Content-Range': `bytes */${source.byteLength}`,
      });
    }
    const selected = range.status === 'partial' ? range.range : undefined;
    const byteLength = selected ? selected.end - selected.start + 1 : source.byteLength;
    headers['Content-Length'] = String(byteLength);
    if (selected) {
      headers['Content-Range'] = `bytes ${selected.start}-${selected.end}/${source.byteLength}`;
    }
    if (request.method === 'HEAD') {
      return new Response(null, { status: selected ? 206 : 200, headers });
    }
    const stream = createReadStream(source.absolutePath, selected);
    return new Response(
      nodeReadableBody(stream, [request.signal, registration.abortController.signal]),
      {
        status: selected ? 206 : 200,
        headers,
      },
    );
  }

  private async servePcm(
    request: Request,
    registration: PcmRegistration,
    originHeaders: Readonly<Record<string, string>>,
  ): Promise<Response> {
    const headers = {
      ...originHeaders,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/vnd.openneko.pcm',
      'X-Content-Type-Options': 'nosniff',
    };
    if (request.headers.has('Range')) {
      return response(416, 'PCM streams do not support byte ranges', headers);
    }
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
    if (registration.consumed) {
      return response(409, 'PCM stream already has a consumer', headers);
    }
    registration.consumed = true;
    const primed = await waitForPriming(registration.priming.promise, [
      request.signal,
      registration.abortController.signal,
    ]);
    if (!primed) {
      return response(410, 'PCM stream is no longer available', headers);
    }
    const consumption = new AbortController();
    const signals = [request.signal, registration.abortController.signal];
    const disposeAbortLinks = forwardAbort(signals, consumption);
    const process = registration.createStream(consumption.signal);
    void process.completion.catch((error: unknown) => {
      process.stdout.destroy(asError(error));
    });
    return new Response(
      nodeReadableBody(
        process.stdout,
        [consumption.signal],
        () => {
          consumption.abort(new Error('PCM consumer disconnected.'));
        },
        disposeAbortLinks,
      ),
      { status: 200, headers },
    );
  }

  private createOriginHeaders(request: Request): Readonly<Record<string, string>> | Response {
    const origin = request.headers.get('Origin');
    if (origin === null) return {};
    if (!this.allowedOrigins.has(origin)) return response(403, 'Origin is not authorized');
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type',
      Vary: 'Origin',
    };
  }

  private handlePreflight(
    request: Request,
    originHeaders: Readonly<Record<string, string>>,
  ): Response {
    const method = request.headers.get('Access-Control-Request-Method');
    if (method !== 'GET' && method !== 'HEAD') {
      return response(405, 'Preflight method is not authorized', originHeaders);
    }
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') ?? '')
      .split(',')
      .map((value) => value.trim().toLocaleLowerCase())
      .filter((value) => value.length > 0);
    if (requestedHeaders.some((value) => value !== 'range')) {
      return response(403, 'Preflight header is not authorized', originHeaders);
    }
    return response(204, '', {
      ...originHeaders,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      ...(requestedHeaders.length > 0 ? { 'Access-Control-Allow-Headers': 'Range' } : {}),
    });
  }

  private createLease(id: string, url: string): DesktopResourceLease {
    return {
      url,
      release: () => this.release(id),
    };
  }

  private createPublishedFile(registration: ResourceRegistration): RegisteredMediaFile {
    return {
      token: registration.id,
      url: resourceUrl(registration.id),
      release: () => this.release(registration.id),
    };
  }

  private releasePublisherRegistration(publisherId: number, id: string): void {
    const registration = this.registrations.get(id);
    if (!registration) return;
    if (registration.publisherId !== publisherId) {
      throw new Error('Desktop media publisher cannot release another owner registration.');
    }
    this.release(id);
  }

  private releaseWhere(predicate: (record: ResourceRegistration) => boolean): void {
    for (const [id, registration] of this.registrations) {
      if (predicate(registration)) this.release(id);
    }
  }

  private release(id: string): void {
    const registration = this.registrations.get(id);
    if (!registration) return;
    this.registrations.delete(id);
    registration.abortController.abort(new Error('Desktop resource registration was released.'));
    if (registration.kind === 'pcm') registration.priming.resolve();
  }

  private createId(): string {
    let id = randomBytes(24).toString('base64url');
    while (this.registrations.has(id)) id = randomBytes(24).toString('base64url');
    return id;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop resource registry is disposed.');
  }
}

export function registerDesktopResourceRequestAuthorization(
  targetSession: Pick<Session, 'webRequest'>,
  registry: Pick<DesktopResourceRegistry, 'authorizeRequest'>,
): () => void {
  targetSession.webRequest.onBeforeRequest(
    { urls: [`${DESKTOP_RESOURCE_ORIGIN}/*`] },
    (details, callback) => {
      callback({
        cancel: !registry.authorizeRequest(details.url, details.webContentsId ?? -1),
      });
    },
  );
  return () => {
    targetSession.webRequest.onBeforeRequest(null);
  };
}

async function registerFileSource(
  source: DesktopAuthorizedFileSource,
): Promise<RegisteredFileSource> {
  requireIdentity(source.revision, 'revision');
  if (!isAbsolute(source.absolutePath)) {
    throw new Error('Desktop resource registration requires an absolute file path.');
  }
  const metadata = await stat(source.absolutePath);
  if (!metadata.isFile()) throw new Error('Desktop resource registration requires a file.');
  return {
    absolutePath: source.absolutePath,
    mediaType: requireMediaType(source.mediaType),
    byteLength: metadata.size,
    statFingerprint: `${metadata.mtimeMs}:${metadata.size}`,
  };
}

function resourceUrl(id: string): string {
  return `${DESKTOP_RESOURCE_ORIGIN}/${id}`;
}

function tryReadResourceId(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'openneko:' ||
      url.host !== DESKTOP_RESOURCE_HOST ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return parseResourceRoute(url.pathname)?.id;
  } catch {
    return undefined;
  }
}

function parseResourceRoute(
  pathname: string,
): { readonly id: string; readonly virtualPath?: string } | undefined {
  if (!pathname.startsWith('/')) return undefined;
  const route = pathname.slice(1);
  const separator = route.indexOf('/');
  const id = separator < 0 ? route : route.slice(0, separator);
  if (!/^[A-Za-z0-9_-]{32}$/u.test(id)) return undefined;
  if (separator < 0) return { id };
  const virtualPath = route.slice(separator + 1);
  return virtualPath.length > 0 ? { id, virtualPath } : undefined;
}

function parseRange(value: string | undefined, size: number): ParsedRange {
  if (!value) return { status: 'full' };
  if (!value.startsWith('bytes=') || value.includes(',')) return { status: 'invalid' };
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (!match) return { status: 'invalid' };
  const startText = match[1] ?? '';
  const endText = match[2] ?? '';
  if (!startText && !endText) return { status: 'invalid' };
  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) {
      return { status: 'invalid' };
    }
    return {
      status: 'partial',
      range: { start: Math.max(0, size - suffix), end: size - 1 },
    };
  }
  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return { status: 'invalid' };
  }
  return {
    status: 'partial',
    range: { start, end: Math.min(end, size - 1) },
  };
}

function nodeReadableBody(
  readable: Readable,
  signals: readonly AbortSignal[],
  onCancel?: () => void,
  onSettled?: () => void,
): ReadableStream<Uint8Array> {
  const iterator = readable[Symbol.asyncIterator]();
  let settled = false;
  const cleanup = (): void => {
    if (settled) return;
    settled = true;
    for (const signal of signals) signal.removeEventListener('abort', abort);
    onSettled?.();
  };
  const abort = (): void => {
    cleanup();
    readable.destroy(new Error('Desktop resource response was cancelled.'));
  };
  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next();
        if (result.done) {
          cleanup();
          controller.close();
          return;
        }
        const chunk = result.value;
        controller.enqueue(
          chunk instanceof Uint8Array
            ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
            : new TextEncoder().encode(String(chunk)),
        );
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    cancel() {
      cleanup();
      onCancel?.();
      readable.destroy();
    },
  });
}

function waitForPriming(priming: Promise<void>, signals: readonly AbortSignal[]): Promise<boolean> {
  if (signals.some((signal) => signal.aborted)) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (primed: boolean): void => {
      if (settled) return;
      settled = true;
      for (const signal of signals) signal.removeEventListener('abort', onAbort);
      resolve(primed);
    };
    const onAbort = (): void => finish(false);
    for (const signal of signals) signal.addEventListener('abort', onAbort, { once: true });
    void priming.then(() => finish(true));
  });
}

function forwardAbort(signals: readonly AbortSignal[], controller: AbortController): () => void {
  const onAbort = (event: Event): void => {
    const signal = event.currentTarget;
    controller.abort(signal instanceof AbortSignal ? signal.reason : undefined);
  };
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return () => {
    for (const signal of signals) signal.removeEventListener('abort', onAbort);
  };
}

function response(
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(status === 204 ? null : body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Length': String(Buffer.byteLength(body)),
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function normalizeVirtualPath(value: string): string {
  if (
    value.length === 0 ||
    value.startsWith('/') ||
    value.startsWith('\\') ||
    value.includes('\0') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  ) {
    throw new Error('Desktop resource-set path must be relative.');
  }
  const segments = value.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === '.' || segment === '..' || segment.includes('\\'),
    )
  ) {
    throw new Error('Desktop resource-set path contains an unsafe segment.');
  }
  return segments.join('/');
}

function encodeVirtualPath(value: string): string {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function decodeVirtualPath(value: string): string {
  const decoded = value
    .split('/')
    .map((segment) => {
      const result = decodeURIComponent(segment);
      if (result.includes('/') || result.includes('\\')) {
        throw new Error('Encoded resource-set separators are invalid.');
      }
      return result;
    })
    .join('/');
  return normalizeVirtualPath(decoded);
}

async function readCurrentFileMetadata(
  absolutePath: string,
): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    return await stat(absolutePath);
  } catch {
    return undefined;
  }
}

function assertOwner(owner: DesktopResourceOwner): void {
  assertPartialOwner(owner);
}

function assertPartialOwner<T extends object>(owner: T): void {
  for (const [label, value] of Object.entries(owner)) {
    requireIdentity(value, label);
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Desktop resource owner ${label} is required.`);
  }
  return value;
}

function requireMediaType(value: string): string {
  const mediaType = value.trim();
  if (mediaType.length === 0 || /[\r\n]/u.test(mediaType)) {
    throw new Error('Desktop resource media type is invalid.');
  }
  return mediaType;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
