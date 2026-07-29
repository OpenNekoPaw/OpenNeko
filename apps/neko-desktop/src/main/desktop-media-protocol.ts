import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { protocol, session } from 'electron';
import { DESKTOP_APP_ORIGIN, DESKTOP_MEDIA_SCHEME } from './security';

export interface DesktopMediaDescriptorRegistration {
  readonly descriptorId?: string;
  readonly webContentsId: number;
  readonly windowId: string;
  readonly viewId: string;
  readonly sessionId: string;
  readonly revision: string;
  readonly absolutePath: string;
  readonly mediaType: string;
}

export interface DesktopUpstreamMediaDescriptorRegistration
  extends Omit<DesktopMediaDescriptorRegistration, 'absolutePath'> {
  readonly upstreamUrl: string;
}

type DesktopMediaDescriptorRecord = (
  | (Omit<DesktopMediaDescriptorRegistration, 'descriptorId'> & {
      readonly source: 'file';
    })
  | (Omit<DesktopUpstreamMediaDescriptorRegistration, 'descriptorId'> & {
      readonly source: 'upstream';
    })
) & {
  readonly descriptorId: string;
  released: boolean;
};

export class DesktopMediaDescriptorRegistry {
  private readonly records = new Map<string, DesktopMediaDescriptorRecord>();

  register(input: DesktopMediaDescriptorRegistration): string {
    const descriptorId = input.descriptorId ?? `media:${randomUUID()}`;
    if (!/^[A-Za-z0-9:_-]+$/u.test(descriptorId)) {
      throw new Error('Desktop media descriptor identity is invalid.');
    }
    if (this.records.has(descriptorId)) {
      throw new Error(`Desktop media descriptor '${descriptorId}' is already registered.`);
    }
    this.records.set(descriptorId, {
      ...input,
      descriptorId,
      source: 'file',
      released: false,
    });
    return descriptorId;
  }

  registerUpstream(input: DesktopUpstreamMediaDescriptorRegistration): string {
    const descriptorId = input.descriptorId ?? `media:${randomUUID()}`;
    if (!/^[A-Za-z0-9:_-]+$/u.test(descriptorId)) {
      throw new Error('Desktop media descriptor identity is invalid.');
    }
    if (this.records.has(descriptorId)) {
      throw new Error(`Desktop media descriptor '${descriptorId}' is already registered.`);
    }
    assertLoopbackMediaUrl(input.upstreamUrl);
    this.records.set(descriptorId, {
      ...input,
      descriptorId,
      source: 'upstream',
      released: false,
    });
    return descriptorId;
  }

  authorize(webContentsId: number, descriptorId: string): boolean {
    const record = this.records.get(descriptorId);
    return Boolean(record && !record.released && record.webContentsId === webContentsId);
  }

  resolve(descriptorId: string): DesktopMediaDescriptorRecord {
    const record = this.records.get(descriptorId);
    if (!record || record.released) {
      throw new Error(`Desktop media descriptor '${descriptorId}' is unavailable.`);
    }
    return record;
  }

  releaseSession(sessionId: string): void {
    for (const record of this.records.values()) {
      if (record.sessionId === sessionId) record.released = true;
    }
  }

  releaseWindow(windowId: string): void {
    for (const record of this.records.values()) {
      if (record.windowId === windowId) record.released = true;
    }
  }

  dispose(): void {
    this.records.clear();
  }
}

export function registerDesktopMediaProtocol(
  registry: DesktopMediaDescriptorRegistry,
): () => void {
  const mediaFilter = { urls: [`${DESKTOP_MEDIA_SCHEME}://*/*`] };
  session.defaultSession.webRequest.onBeforeRequest(mediaFilter, (details, callback) => {
    const descriptorId = readDescriptorId(details.url);
    callback({
      cancel:
        descriptorId === undefined ||
        details.webContentsId === undefined ||
        !registry.authorize(details.webContentsId, descriptorId),
    });
  });
  protocol.handle(DESKTOP_MEDIA_SCHEME, (request) =>
    createDesktopMediaProtocolResponse(registry, request, fetchDesktopUpstreamMedia),
  );
  return () => {
    session.defaultSession.webRequest.onBeforeRequest(mediaFilter, null);
    protocol.unhandle(DESKTOP_MEDIA_SCHEME);
  };
}

export async function createDesktopMediaProtocolResponse(
  registry: DesktopMediaDescriptorRegistry,
  request: Request,
  fetchUpstream?: (request: Request) => Promise<Response>,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }
  const descriptorId = readDescriptorId(request.url);
  if (!descriptorId) return new Response('Not Found', { status: 404 });
  let record: DesktopMediaDescriptorRecord;
  try {
    record = registry.resolve(descriptorId);
  } catch {
    return new Response('Not Found', { status: 404 });
  }
  if (record.source === 'upstream') {
    if (!fetchUpstream) {
      throw new Error('Desktop upstream media fetcher is unavailable.');
    }
    const headers = new Headers();
    const range = request.headers.get('range');
    if (range) headers.set('Range', range);
    const upstream = new Request(record.upstreamUrl, {
      method: request.method,
      headers,
      redirect: 'error',
      signal: request.signal,
    });
    const response = await fetchUpstream(upstream);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', DESKTOP_APP_ORIGIN);
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('Content-Type', record.mediaType);
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }
  const file = await stat(record.absolutePath);
  if (!file.isFile()) return new Response('Not Found', { status: 404 });
  const range = parseByteRange(request.headers.get('range'), file.size);
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${file.size}` },
    });
  }
  const start = range?.start ?? 0;
  const end = range?.endInclusive ?? Math.max(0, file.size - 1);
  const contentLength = file.size === 0 ? 0 : end - start + 1;
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': DESKTOP_APP_ORIGIN,
    'Cache-Control': 'no-store',
    'Content-Length': String(contentLength),
    'Content-Type': record.mediaType,
    'X-Content-Type-Options': 'nosniff',
  });
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
  if (request.method === 'HEAD' || file.size === 0) {
    return new Response(null, { status: range ? 206 : 200, headers });
  }
  const stream = createReadStream(record.absolutePath, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers,
  });
}

export function fetchDesktopUpstreamMedia(request: Request): Promise<Response> {
  return fetch(request, { redirect: 'error' });
}

function assertLoopbackMediaUrl(value: string): void {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password
  ) {
    throw new Error('Desktop upstream media URL must use loopback HTTP.');
  }
}

export function parseDesktopMediaRange(
  value: string | null,
  size: number,
): { readonly start: number; readonly endInclusive: number } | 'unsatisfiable' | undefined {
  return parseByteRange(value, size);
}

function parseByteRange(
  value: string | null,
  size: number,
): { readonly start: number; readonly endInclusive: number } | 'unsatisfiable' | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d+)-(\d*)$/u.exec(value.trim());
  if (!match) return 'unsatisfiable';
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) {
    return 'unsatisfiable';
  }
  return {
    start,
    endInclusive: Math.min(requestedEnd, size - 1),
  };
}

function readDescriptorId(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol !== `${DESKTOP_MEDIA_SCHEME}:` ||
      url.host !== 'desktop' ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    const pathSegments = url.pathname
      .split('/')
      .filter((segment) => segment.length > 0);
    if (pathSegments.length < 1 || pathSegments.length > 2) return undefined;
    const descriptorId = decodeURIComponent(pathSegments[0] ?? '');
    return /^[A-Za-z0-9:_-]+$/u.test(descriptorId) ? descriptorId : undefined;
  } catch {
    return undefined;
  }
}
