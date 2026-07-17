import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  createNodeDocumentLowLevelAccess,
  DEFAULT_DOCUMENT_WHOLE_FILE_MAX_BYTES,
  type NodeDocumentLowLevelAccess,
} from '@neko/content/document/node';
import { getLogger } from '../../utils/logger';

export type DocumentPreviewFormat = 'pdf' | 'epub' | 'docx' | 'cbz';

export interface DocumentPreviewRegistration {
  readonly token: string;
  readonly url: string;
}

export interface NodeDocumentPreviewServerOptions {
  readonly documentAccess?: Pick<NodeDocumentLowLevelAccess, 'readEntry'>;
  readonly createToken?: () => string;
  readonly maxWholeFileBytes?: number;
}

interface RegisteredDocument {
  readonly filePath: string;
  readonly format: DocumentPreviewFormat;
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
const RAW_FILE_PREFIX = '/v1/document-preview/file/';
const EPUB_PREFIX = '/v1/document-preview/epub/';
const logger = getLogger('NodeDocumentPreviewServer');

/** Preview-owned Node HTTP transport for document Webviews. */
export class NodeDocumentPreviewServer {
  private readonly registrations = new Map<string, RegisteredDocument>();
  private readonly documentAccess: Pick<NodeDocumentLowLevelAccess, 'readEntry'>;
  private readonly createToken: () => string;
  private readonly maxWholeFileBytes: number;
  private server: Server | null = null;
  private startPromise: Promise<number> | null = null;

  constructor(options: NodeDocumentPreviewServerOptions = {}) {
    this.documentAccess = options.documentAccess ?? createNodeDocumentLowLevelAccess();
    this.createToken = options.createToken ?? randomUUID;
    this.maxWholeFileBytes = validatePositiveByteLimit(
      options.maxWholeFileBytes ?? DEFAULT_DOCUMENT_WHOLE_FILE_MAX_BYTES,
      'maxWholeFileBytes',
    );
  }

  async register(
    filePath: string,
    format: DocumentPreviewFormat,
  ): Promise<DocumentPreviewRegistration> {
    const metadata = await stat(filePath);
    if (!metadata.isFile()) {
      throw new Error(`Document preview source is not a file: ${filePath}`);
    }
    this.assertWholeFileLimit(filePath, format, metadata.size);
    const port = await this.ensureStarted();
    const token = this.createUniqueToken();
    this.registrations.set(token, { filePath, format });
    const route = format === 'epub' ? `${EPUB_PREFIX}${token}/` : `${RAW_FILE_PREFIX}${token}`;
    return { token, url: `http://${HOST}:${port}${route}` };
  }

  async unregister(token: string): Promise<void> {
    this.registrations.delete(token);
  }

  async dispose(): Promise<void> {
    this.registrations.clear();
    const starting = this.startPromise;
    if (starting) {
      await starting.catch(() => undefined);
    }
    const server = this.server;
    this.server = null;
    this.startPromise = null;
    if (!server?.listening) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      server.closeAllConnections();
    });
  }

  private createUniqueToken(): string {
    let token = this.createToken();
    while (this.registrations.has(token)) {
      token = this.createToken();
    }
    return token;
  }

  private async ensureStarted(): Promise<number> {
    if (!this.startPromise) {
      this.startPromise = this.start();
    }
    return this.startPromise;
  }

  private async start(): Promise<number> {
    const server = createServer((request, response) => {
      void this.handleRequest(request, response).catch((error: unknown) => {
        logger.error('Document preview HTTP request failed', error);
        if (response.headersSent) {
          response.destroy(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        writeResponse(response, 500, 'document preview request failed');
      });
    });
    this.server = server;
    return new Promise<number>((resolve, reject) => {
      const handleError = (error: Error): void => {
        server.close();
        if (this.server === server) this.server = null;
        this.startPromise = null;
        reject(error);
      };
      server.once('error', handleError);
      server.listen(0, HOST, () => {
        server.off('error', handleError);
        const address = server.address();
        if (!address || typeof address === 'string') {
          handleError(new Error('Node document preview server did not expose a TCP port.'));
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
    if (requestUrl.pathname.startsWith(RAW_FILE_PREFIX)) {
      await this.handleRawFile(request, response, requestUrl.pathname);
      return;
    }
    if (requestUrl.pathname.startsWith(EPUB_PREFIX)) {
      await this.handleEpubEntry(request, response, requestUrl.pathname);
      return;
    }
    writeResponse(response, 404, 'document route not found');
  }

  private async handleRawFile(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const token = pathname.slice(RAW_FILE_PREFIX.length);
    if (!token || token.includes('/')) {
      writeResponse(response, 404, 'document token not found');
      return;
    }
    const registration = this.registrations.get(token);
    if (!registration || registration.format === 'epub') {
      writeResponse(response, 404, 'document token not found');
      return;
    }

    const metadata = await stat(registration.filePath);
    if (!metadata.isFile()) {
      writeResponse(response, 404, 'document file not found');
      return;
    }
    if (registration.format === 'docx' && metadata.size > this.maxWholeFileBytes) {
      writeResponse(response, 413, 'DOCX document exceeds whole-file limit');
      return;
    }
    const fileSize = metadata.size;
    const parsedRange = parseRange(request.headers.range, fileSize);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Type', documentMime(registration.format));
    response.setHeader('Cache-Control', 'no-store');

    if (parsedRange.status === 'invalid') {
      response.setHeader('Content-Range', `bytes */${fileSize}`);
      response.setHeader('Content-Length', '0');
      writeResponse(response, 416);
      return;
    }

    const range = parsedRange.status === 'partial' ? parsedRange.range : undefined;
    const contentLength = range ? range.end - range.start + 1 : fileSize;
    if (range) {
      response.statusCode = 206;
      response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${fileSize}`);
    } else {
      response.statusCode = 200;
    }
    response.setHeader('Content-Length', String(contentLength));
    if (request.method === 'HEAD' || contentLength === 0) {
      response.end();
      return;
    }

    const stream = createReadStream(registration.filePath, range);
    await pipeline(stream, response);
  }

  private assertWholeFileLimit(
    filePath: string,
    format: DocumentPreviewFormat,
    fileSize: number,
  ): void {
    if (format === 'docx' && fileSize > this.maxWholeFileBytes) {
      throw new Error(
        `DOCX document exceeds the ${this.maxWholeFileBytes}-byte whole-file limit: ${filePath}`,
      );
    }
  }

  private async handleEpubEntry(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const remainder = pathname.slice(EPUB_PREFIX.length);
    const separatorIndex = remainder.indexOf('/');
    if (separatorIndex <= 0) {
      writeResponse(response, 404, 'document token not found');
      return;
    }
    const token = remainder.slice(0, separatorIndex);
    const registration = this.registrations.get(token);
    if (!registration || registration.format !== 'epub') {
      writeResponse(response, 404, 'document token not found');
      return;
    }

    let entryPath: string;
    try {
      entryPath = decodeURIComponent(remainder.slice(separatorIndex + 1));
    } catch {
      writeResponse(response, 400, 'invalid EPUB entry path');
      return;
    }
    if (!entryPath) {
      writeResponse(response, 404, 'EPUB entry not found');
      return;
    }

    try {
      const bytes = await this.documentAccess.readEntry(registration.filePath, entryPath);
      response.statusCode = 200;
      response.setHeader('Content-Type', epubEntryMime(entryPath));
      response.setHeader('Content-Length', String(bytes.byteLength));
      response.setHeader('Cache-Control', 'no-store');
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      response.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('does not exist')) {
        writeResponse(response, 404, 'EPUB entry not found');
      } else if (
        message.includes('invalid') ||
        message.includes('escapes') ||
        message.includes('relative') ||
        message.includes('null byte')
      ) {
        writeResponse(response, 400, 'invalid EPUB entry path');
      } else if (message.includes('limit')) {
        writeResponse(response, 413, 'EPUB entry exceeds limit');
      } else {
        throw error;
      }
    }
  }
}

function parseRange(header: string | undefined, fileSize: number): ParsedRange {
  if (header === undefined) return { status: 'full' };
  if (fileSize <= 0 || header.includes(',')) return { status: 'invalid' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { status: 'invalid' };
  const startText = match[1] ?? '';
  const endText = match[2] ?? '';
  if (!startText && !endText) return { status: 'invalid' };

  if (!startText) {
    const suffixLength = parseNonNegativeInteger(endText);
    if (suffixLength === null || suffixLength === 0) return { status: 'invalid' };
    const boundedLength = Math.min(suffixLength, fileSize);
    return {
      status: 'partial',
      range: { start: fileSize - boundedLength, end: fileSize - 1 },
    };
  }

  const start = parseNonNegativeInteger(startText);
  if (start === null || start >= fileSize) return { status: 'invalid' };
  if (!endText) {
    return { status: 'partial', range: { start, end: fileSize - 1 } };
  }
  const requestedEnd = parseNonNegativeInteger(endText);
  if (requestedEnd === null || requestedEnd < start) return { status: 'invalid' };
  return {
    status: 'partial',
    range: { start, end: Math.min(requestedEnd, fileSize - 1) },
  };
}

function parseNonNegativeInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validatePositiveByteLimit(value: number, optionName: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive safe integer.`);
  }
  return value;
}

function setNetworkHeaders(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  response.setHeader('Access-Control-Allow-Private-Network', 'true');
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  response.setHeader(
    'Vary',
    'Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network',
  );
}

function writeResponse(response: ServerResponse, statusCode: number, body?: string): void {
  response.statusCode = statusCode;
  if (body === undefined) {
    response.end();
    return;
  }
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Content-Length', String(Buffer.byteLength(body)));
  response.end(body);
}

function documentMime(format: Exclude<DocumentPreviewFormat, 'epub'>): string {
  switch (format) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'cbz':
      return 'application/vnd.comicbook+zip';
  }
}

function epubEntryMime(entryPath: string): string {
  if (path.posix.basename(entryPath).toLowerCase() === 'mimetype') {
    return 'text/plain; charset=utf-8';
  }
  switch (path.posix.extname(entryPath).toLowerCase()) {
    case '.xml':
      return 'application/xml';
    case '.opf':
      return 'application/oebps-package+xml';
    case '.ncx':
      return 'application/x-dtbncx+xml';
    case '.xhtml':
      return 'application/xhtml+xml';
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    case '.mp3':
      return 'audio/mpeg';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}
