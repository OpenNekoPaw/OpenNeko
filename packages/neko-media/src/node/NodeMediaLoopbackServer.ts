import { randomUUID } from 'node:crypto';
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

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

type ParsedRange =
  | { readonly status: 'full' }
  | { readonly status: 'partial'; readonly range: ByteRange }
  | { readonly status: 'invalid' };

const HOST = '127.0.0.1';
const FILE_PREFIX = '/v1/cut-media/file/';
const PCM_PREFIX = '/v1/cut-media/pcm/';
export class NodeMediaLoopbackServer {
  private readonly files = new Map<string, RegisteredFile>();
  private readonly pcmStreams = new Map<string, PcmRegistration>();
  private server: Server | undefined;
  private startPromise: Promise<number> | undefined;

  constructor(private readonly logger: ILogger = new ConsoleLogger('NekoMedia:Loopback')) {}

  async registerFile(path: string, contentType: string): Promise<RegisteredMediaFile> {
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error('Cut media registration requires a file.');
    const port = await this.ensureStarted();
    const token = this.createToken();
    this.files.set(token, { path, contentType });
    return { token, url: `http://${HOST}:${port}${FILE_PREFIX}${token}` };
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
    };
  }

  unregister(token: string): void {
    this.files.delete(token);
    const pcm = this.pcmStreams.get(token);
    if (!pcm) return;
    this.pcmStreams.delete(token);
    pcm.abortController.abort(new Error('Media PCM session was stopped.'));
    pcm.priming.resolve();
  }

  async dispose(): Promise<void> {
    for (const token of [...this.pcmStreams.keys()]) this.unregister(token);
    this.files.clear();
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
    let token = randomUUID();
    while (this.files.has(token) || this.pcmStreams.has(token)) token = randomUUID();
    return token;
  }

  private ensureStarted(): Promise<number> {
    this.startPromise ??= this.start();
    return this.startPromise;
  }

  private start(): Promise<number> {
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
    setNetworkHeaders(response);
    if (request.method === 'OPTIONS') {
      writeResponse(response, 204);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD, OPTIONS');
      writeResponse(response, 405, 'method not allowed');
      return;
    }
    const requestUrl = new URL(request.url ?? '/', `http://${HOST}`);
    if (requestUrl.pathname.startsWith(FILE_PREFIX)) {
      await this.serveFile(request, response, requestUrl.pathname.slice(FILE_PREFIX.length));
      return;
    }
    if (requestUrl.pathname.startsWith(PCM_PREFIX)) {
      await this.servePcm(request, response, requestUrl.pathname.slice(PCM_PREFIX.length));
      return;
    }
    writeResponse(response, 404, 'cut media route not found');
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
    const metadata = await stat(registration.path);
    if (!metadata.isFile()) {
      writeResponse(response, 404, 'cut media file not found');
      return;
    }
    const parsedRange = parseRange(request.headers.range, metadata.size);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Type', registration.contentType);
    response.setHeader('Cache-Control', 'no-store');
    if (parsedRange.status === 'invalid') {
      response.setHeader('Content-Range', `bytes */${metadata.size}`);
      writeResponse(response, 416);
      return;
    }
    const range = parsedRange.status === 'partial' ? parsedRange.range : undefined;
    const length = range ? range.end - range.start + 1 : metadata.size;
    response.statusCode = range ? 206 : 200;
    if (range)
      response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${metadata.size}`);
    response.setHeader('Content-Length', String(length));
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    await pipeline(createReadStream(registration.path, range), response);
  }

  private async servePcm(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
  ): Promise<void> {
    const registration = token.includes('/') ? undefined : this.pcmStreams.get(token);
    if (!registration) {
      writeResponse(response, 404, 'Cut PCM session not found');
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
    response.setHeader('Cache-Control', 'no-store');
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

function setNetworkHeaders(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Range');
  response.setHeader('Access-Control-Allow-Private-Network', 'true');
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
