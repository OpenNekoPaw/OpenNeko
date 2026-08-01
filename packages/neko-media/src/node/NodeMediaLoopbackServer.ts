import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { RunningProcess } from './NodeFfmpegProcess';
import { ConsoleLogger, type ILogger } from '@neko/shared';

interface RegisteredFile {
  readonly path: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly revision: string;
  readonly statFingerprint: string;
  readonly abortController: AbortController;
}

interface PcmRegistration {
  readonly createStream: (signal: AbortSignal) => RunningProcess;
  readonly priming: Deferred<void>;
  readonly abortController: AbortController;
  consumed: boolean;
}

export interface RegisteredMediaFile {
  readonly token: string;
  readonly url: string;
  release(): void;
}

export interface RegisteredPcmStream extends RegisteredMediaFile {
  prime(): void;
}

export interface PcmPacketTransformOptions {
  readonly sampleRate: number;
  readonly channels: number;
  readonly startTimeSeconds: number;
  readonly playbackRate: number;
  readonly framesPerPacket?: number;
}

export interface NodeMediaResourceSetEntry {
  readonly virtualPath: string;
  readonly path: string;
  readonly contentType: string;
  readonly revision?: string;
}

export interface RegisteredMediaResourceSet extends RegisteredMediaFile {
  readonly entryUrl: string;
}

export interface NodeMediaPublisher {
  registerFile(path: string, contentType: string, revision?: string): Promise<RegisteredMediaFile>;
  registerPcm(createStream: (signal: AbortSignal) => RunningProcess): Promise<RegisteredPcmStream>;
  registerResourceSet(
    entries: readonly NodeMediaResourceSetEntry[],
    entryPath: string,
  ): Promise<RegisteredMediaResourceSet>;
  unregister(token: string): void;
}

export interface NodeMediaLoopbackServerOptions {
  readonly allowedOrigins?: readonly string[];
  readonly logger?: ILogger;
}

interface RegisteredResourceSet {
  readonly entries: ReadonlyMap<string, RegisteredFile>;
  readonly abortController: AbortController;
}

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

type ParsedRange =
  | { readonly status: 'full' }
  | { readonly status: 'partial'; readonly range: ByteRange }
  | { readonly status: 'invalid' };

const HOST = '127.0.0.1';
const FILE_PREFIX = '/v1/resources/';
const PCM_PREFIX = '/v1/streams/';
const RESOURCE_SET_PREFIX = '/v1/resource-sets/';
export class NodeMediaLoopbackServer implements NodeMediaPublisher {
  private readonly files = new Map<string, RegisteredFile>();
  private readonly pcmStreams = new Map<string, PcmRegistration>();
  private readonly resourceSets = new Map<string, RegisteredResourceSet>();
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly logger: ILogger;
  private server: Server | undefined;
  private startPromise: Promise<number> | undefined;

  constructor(options: NodeMediaLoopbackServerOptions | ILogger = {}) {
    if (isLogger(options)) {
      this.logger = options;
      this.allowedOrigins = new Set();
    } else {
      this.logger = options.logger ?? new ConsoleLogger('NekoMedia:Loopback');
      this.allowedOrigins = new Set(options.allowedOrigins ?? []);
    }
  }

  async start(): Promise<string> {
    const port = await this.ensureStarted();
    return `http://${HOST}:${port}`;
  }

  async registerFile(
    path: string,
    contentType: string,
    revision?: string,
  ): Promise<RegisteredMediaFile> {
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error('HTTP resource registration requires a file.');
    const sourceRevision = revision ?? `${metadata.mtimeMs}:${metadata.size}`;
    if (sourceRevision.trim().length === 0) {
      throw new Error('HTTP resource registration requires a source revision.');
    }
    const port = await this.ensureStarted();
    const token = this.createToken();
    this.files.set(token, {
      path,
      contentType: requireContentType(contentType),
      byteLength: metadata.size,
      revision: sourceRevision,
      statFingerprint: `${metadata.mtimeMs}:${metadata.size}`,
      abortController: new AbortController(),
    });
    return this.createRegistration(token, `http://${HOST}:${port}${FILE_PREFIX}${token}`);
  }

  async registerPcm(
    createStream: (signal: AbortSignal) => RunningProcess,
  ): Promise<RegisteredPcmStream> {
    const port = await this.ensureStarted();
    const token = this.createToken();
    const registration: PcmRegistration = {
      createStream,
      priming: deferred(),
      abortController: new AbortController(),
      consumed: false,
    };
    this.pcmStreams.set(token, registration);
    return {
      token,
      url: `http://${HOST}:${port}${PCM_PREFIX}${token}`,
      prime: () => registration.priming.resolve(),
      release: () => this.unregister(token),
    };
  }

  async registerResourceSet(
    entries: readonly NodeMediaResourceSetEntry[],
    entryPath: string,
  ): Promise<RegisteredMediaResourceSet> {
    if (entries.length === 0) {
      throw new Error('HTTP resource set requires at least one entry.');
    }
    const normalizedEntryPath = normalizeVirtualPath(entryPath);
    const records = new Map<string, RegisteredFile>();
    for (const entry of entries) {
      const virtualPath = normalizeVirtualPath(entry.virtualPath);
      if (records.has(virtualPath)) {
        throw new Error(`HTTP resource set contains duplicate path '${virtualPath}'.`);
      }
      const metadata = await stat(entry.path);
      if (!metadata.isFile()) {
        throw new Error(`HTTP resource set entry '${virtualPath}' is not a file.`);
      }
      const revision = entry.revision ?? `${metadata.mtimeMs}:${metadata.size}`;
      if (revision.trim().length === 0) {
        throw new Error(`HTTP resource set entry '${virtualPath}' requires a revision.`);
      }
      records.set(virtualPath, {
        path: entry.path,
        contentType: requireContentType(entry.contentType),
        byteLength: metadata.size,
        revision,
        statFingerprint: `${metadata.mtimeMs}:${metadata.size}`,
        abortController: new AbortController(),
      });
    }
    if (!records.has(normalizedEntryPath)) {
      throw new Error(`HTTP resource set entry point '${normalizedEntryPath}' is not registered.`);
    }
    const port = await this.ensureStarted();
    const token = this.createToken();
    this.resourceSets.set(token, {
      entries: records,
      abortController: new AbortController(),
    });
    const baseUrl = `http://${HOST}:${port}${RESOURCE_SET_PREFIX}${token}/`;
    return {
      token,
      url: baseUrl,
      entryUrl: `${baseUrl}${encodeVirtualPath(normalizedEntryPath)}`,
      release: () => this.unregister(token),
    };
  }

  unregister(token: string): void {
    const file = this.files.get(token);
    if (file) {
      this.files.delete(token);
      file.abortController.abort(new Error('Media file session was stopped.'));
    }
    const pcm = this.pcmStreams.get(token);
    if (pcm) {
      this.pcmStreams.delete(token);
      pcm.abortController.abort(new Error('Media PCM session was stopped.'));
      pcm.priming.resolve();
    }
    const resourceSet = this.resourceSets.get(token);
    if (!resourceSet) return;
    this.resourceSets.delete(token);
    resourceSet.abortController.abort(new Error('Media resource set was stopped.'));
    for (const entry of resourceSet.entries.values()) {
      entry.abortController.abort(new Error('Media resource set was stopped.'));
    }
  }

  async dispose(): Promise<void> {
    for (const token of [...this.files.keys()]) this.unregister(token);
    for (const token of [...this.pcmStreams.keys()]) this.unregister(token);
    for (const token of [...this.resourceSets.keys()]) this.unregister(token);
    await this.startPromise?.catch(() => undefined);
    const server = this.server;
    this.server = undefined;
    this.startPromise = undefined;
    if (!server?.listening) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }

  private createToken(): string {
    let token = randomBytes(24).toString('base64url');
    while (this.files.has(token) || this.pcmStreams.has(token) || this.resourceSets.has(token)) {
      token = randomBytes(24).toString('base64url');
    }
    return token;
  }

  private createRegistration(token: string, url: string): RegisteredMediaFile {
    return { token, url, release: () => this.unregister(token) };
  }

  private ensureStarted(): Promise<number> {
    this.startPromise ??= this.startServer();
    return this.startPromise;
  }

  private startServer(): Promise<number> {
    const server = createServer((request, response) => {
      void this.handleRequest(request, response).catch((error: unknown) => {
        if (isClientResponseCancellation(error, request, response)) return;
        this.logger.error('Media loopback request failed.', error);
        if (response.headersSent) {
          response.destroy(asError(error));
          return;
        }
        writeResponse(response, 500, 'cut media request failed');
      });
    });
    this.server = server;
    return new Promise<number>((resolve, reject) => {
      const onError = (error: Error): void => {
        if (this.server === server) this.server = undefined;
        this.startPromise = undefined;
        reject(error);
      };
      server.once('error', onError);
      server.listen(0, HOST, () => {
        server.off('error', onError);
        const address = server.address();
        if (!address || typeof address === 'string') {
          onError(new Error('Cut media loopback server has no TCP port.'));
          return;
        }
        resolve(address.port);
      });
    });
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    setBaseHeaders(response);
    if (!applyCorsHeaders(request, response, this.allowedOrigins)) return;
    if (request.method === 'OPTIONS') {
      if (request.headers.origin === undefined) {
        writeResponse(response, 403, 'preflight origin is required');
        return;
      }
      handlePreflight(request, response);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD, OPTIONS');
      writeResponse(response, 405, 'method not allowed');
      return;
    }
    const requestUrl = new URL(request.url ?? '/', `http://${HOST}`);
    if (requestUrl.search.length > 0 || requestUrl.hash.length > 0) {
      writeResponse(response, 400, 'resource URL must not contain query or fragment');
      return;
    }
    if (requestUrl.pathname.startsWith(FILE_PREFIX)) {
      await this.serveFile(request, response, requestUrl.pathname.slice(FILE_PREFIX.length));
      return;
    }
    if (requestUrl.pathname.startsWith(PCM_PREFIX)) {
      await this.servePcm(request, response, requestUrl.pathname.slice(PCM_PREFIX.length));
      return;
    }
    if (requestUrl.pathname.startsWith(RESOURCE_SET_PREFIX)) {
      await this.serveResourceSet(
        request,
        response,
        requestUrl.pathname.slice(RESOURCE_SET_PREFIX.length),
      );
      return;
    }
    writeResponse(response, 404, 'media resource route not found');
  }

  private async serveFile(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
  ): Promise<void> {
    const registration = token.includes('/') ? undefined : this.files.get(token);
    if (!registration) {
      writeResponse(response, 404, 'cut media token not found');
      return;
    }
    const metadata = await readCurrentFileMetadata(registration.path);
    if (
      !metadata ||
      !metadata.isFile() ||
      metadata.size !== registration.byteLength ||
      `${metadata.mtimeMs}:${metadata.size}` !== registration.statFingerprint
    ) {
      writeResponse(response, 409, 'media resource revision changed');
      return;
    }
    await this.serveRegisteredFile(request, response, registration);
  }

  private async serveRegisteredFile(
    request: IncomingMessage,
    response: ServerResponse,
    registration: RegisteredFile,
  ): Promise<void> {
    const parsedRange = parseRange(request.headers.range, registration.byteLength);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Type', registration.contentType);
    if (parsedRange.status === 'invalid') {
      response.setHeader('Content-Range', `bytes */${registration.byteLength}`);
      writeResponse(response, 416);
      return;
    }
    const range = parsedRange.status === 'partial' ? parsedRange.range : undefined;
    const length = range ? range.end - range.start + 1 : registration.byteLength;
    response.statusCode = range ? 206 : 200;
    if (range)
      response.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${registration.byteLength}`,
      );
    response.setHeader('Content-Length', String(length));
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    try {
      await pipeline(createReadStream(registration.path, range), response, {
        signal: registration.abortController.signal,
      });
    } catch (error) {
      if (registration.abortController.signal.aborted) {
        if (!response.destroyed) response.destroy();
        return;
      }
      throw error;
    }
  }

  private async servePcm(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
  ): Promise<void> {
    const registration = token.includes('/') ? undefined : this.pcmStreams.get(token);
    if (!registration) {
      writeResponse(response, 404, 'PCM stream not found');
      return;
    }
    if (request.headers.range !== undefined) {
      writeResponse(response, 416, 'PCM streams do not support byte ranges');
      return;
    }
    if (request.method === 'HEAD') {
      response.setHeader('Content-Type', 'application/vnd.openneko.pcm');
      writeResponse(response, 200);
      return;
    }
    if (registration.consumed) {
      writeResponse(response, 409, 'Cut PCM session already has a consumer');
      return;
    }
    registration.consumed = true;
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/vnd.openneko.pcm');
    response.setHeader('Transfer-Encoding', 'chunked');
    response.flushHeaders();
    await registration.priming.promise;
    if (registration.abortController.signal.aborted) {
      response.end();
      return;
    }
    const process = registration.createStream(registration.abortController.signal);
    const close = (): void => {
      if (response.writableEnded) return;
      registration.abortController.abort(new Error('Media PCM consumer disconnected.'));
    };
    response.once('close', close);
    try {
      await pipeline(process.stdout, response);
      await process.completion;
    } catch (error) {
      if (!registration.abortController.signal.aborted) throw error;
      await process.completion.catch(() => undefined);
      if (!response.writableEnded) response.end();
    } finally {
      response.off('close', close);
    }
  }

  private async serveResourceSet(
    request: IncomingMessage,
    response: ServerResponse,
    route: string,
  ): Promise<void> {
    const separator = route.indexOf('/');
    if (separator <= 0) {
      writeResponse(response, 404, 'media resource set route not found');
      return;
    }
    const token = route.slice(0, separator);
    const set = token.includes('/') ? undefined : this.resourceSets.get(token);
    if (!set) {
      writeResponse(response, 404, 'media resource set token not found');
      return;
    }
    let virtualPath: string;
    try {
      virtualPath = decodeVirtualPath(route.slice(separator + 1));
    } catch {
      writeResponse(response, 400, 'media resource set path is invalid');
      return;
    }
    const entry = set.entries.get(virtualPath);
    if (!entry) {
      writeResponse(response, 404, 'media resource set entry not found');
      return;
    }
    const metadata = await readCurrentFileMetadata(entry.path);
    if (
      !metadata ||
      !metadata.isFile() ||
      metadata.size !== entry.byteLength ||
      `${metadata.mtimeMs}:${metadata.size}` !== entry.statFingerprint
    ) {
      writeResponse(response, 409, 'media resource set revision changed');
      return;
    }
    await this.serveRegisteredFile(request, response, entry);
  }
}

export function createPcmPacketTransform(options: PcmPacketTransformOptions): Transform {
  const framesPerPacket = options.framesPerPacket ?? 960;
  const bytesPerFrame = options.channels * Float32Array.BYTES_PER_ELEMENT;
  const packetBytes = framesPerPacket * bytesPerFrame;
  let buffered: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let emittedFrames = 0;
  const transform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      buffered = buffered.byteLength === 0 ? chunk : Buffer.concat([buffered, chunk]);
      while (buffered.byteLength >= packetBytes) {
        const packet = buffered.subarray(0, packetBytes);
        buffered = buffered.subarray(packetBytes);
        this.push(framePcmPacket(packet, framesPerPacket, emittedFrames, options));
        emittedFrames += framesPerPacket;
      }
      callback();
    },
    flush(callback) {
      const completeFrames = Math.floor(buffered.byteLength / bytesPerFrame);
      if (completeFrames > 0) {
        const bytes = buffered.subarray(0, completeFrames * bytesPerFrame);
        this.push(framePcmPacket(bytes, completeFrames, emittedFrames, options));
      }
      callback();
    },
  });
  return transform;
}

function framePcmPacket(
  pcm: Buffer,
  frameCount: number,
  emittedFrames: number,
  options: PcmPacketTransformOptions,
): Buffer {
  const header = Buffer.alloc(22);
  const elapsedOutputSeconds = emittedFrames / options.sampleRate;
  const ptsMicroseconds = Math.round(
    (options.startTimeSeconds + elapsedOutputSeconds * options.playbackRate) * 1_000_000,
  );
  const durationMicroseconds = Math.round((frameCount / options.sampleRate) * 1_000_000);
  header.writeBigInt64LE(BigInt(ptsMicroseconds), 0);
  header.writeBigInt64LE(BigInt(durationMicroseconds), 8);
  header.writeUInt32LE(options.sampleRate, 16);
  header.writeUInt16LE(options.channels, 20);
  return Buffer.concat([header, pcm]);
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
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { status: 'invalid' };
    return {
      status: 'partial',
      range: { start: Math.max(0, size - suffix), end: Math.max(0, size - 1) },
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
  return { status: 'partial', range: { start, end: Math.min(end, size - 1) } };
}

function setBaseHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function applyCorsHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  if (!allowedOrigins.has(origin)) {
    writeResponse(response, 403, 'origin is not authorized');
    return false;
  }
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader(
    'Access-Control-Expose-Headers',
    'Accept-Ranges, Content-Length, Content-Range, Content-Type',
  );
  response.setHeader('Vary', 'Origin');
  return true;
}

function handlePreflight(request: IncomingMessage, response: ServerResponse): void {
  const method = request.headers['access-control-request-method'];
  if (method !== 'GET' && method !== 'HEAD') {
    writeResponse(response, 405, 'preflight method is not authorized');
    return;
  }
  const requestedHeaders = String(request.headers['access-control-request-headers'] ?? '')
    .split(',')
    .map((value) => value.trim().toLocaleLowerCase())
    .filter((value) => value.length > 0);
  if (requestedHeaders.some((value) => value !== 'range')) {
    writeResponse(response, 403, 'preflight header is not authorized');
    return;
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (requestedHeaders.length > 0) response.setHeader('Access-Control-Allow-Headers', 'Range');
  if (request.headers['access-control-request-private-network'] === 'true') {
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  writeResponse(response, 204);
}

function writeResponse(response: ServerResponse, status: number, body = ''): void {
  response.statusCode = status;
  response.setHeader('Content-Length', String(Buffer.byteLength(body)));
  response.end(body);
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

function isClientResponseCancellation(
  error: unknown,
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  return (
    error instanceof Error &&
    Reflect.get(error, 'code') === 'ERR_STREAM_PREMATURE_CLOSE' &&
    (response.destroyed || request.socket.destroyed)
  );
}

function requireContentType(value: string): string {
  const contentType = value.trim();
  if (contentType.length === 0 || /[\r\n]/u.test(contentType)) {
    throw new Error('HTTP resource content type is invalid.');
  }
  return contentType;
}

async function readCurrentFileMetadata(
  path: string,
): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}

function normalizeVirtualPath(value: string): string {
  if (
    value.length === 0 ||
    value.startsWith('/') ||
    value.startsWith('\\') ||
    value.includes('\0') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  ) {
    throw new Error('HTTP resource set path must be relative.');
  }
  const segments = value.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === '.' || segment === '..' || segment.includes('\\'),
    )
  ) {
    throw new Error('HTTP resource set path contains an unsafe segment.');
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
        throw new Error('Encoded resource set separators are invalid.');
      }
      return result;
    })
    .join('/');
  return normalizeVirtualPath(decoded);
}

function isLogger(value: NodeMediaLoopbackServerOptions | ILogger): value is ILogger {
  return 'source' in value && typeof value.error === 'function';
}
