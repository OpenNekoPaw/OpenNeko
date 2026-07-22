import { createHash } from 'node:crypto';
import * as path from 'node:path';
import {
  ExplicitContentReadService,
  type ContentReadHandler,
} from '../../content-access/content-read-service';
import type {
  ContentBytes,
  ContentIoDiagnosticCode,
  ContentReadOptions,
  ContentReadService,
  ContentStat,
} from '../../types/content-io';
import type {
  ContentFingerprint,
  ContentLocator,
  DocumentEntryContentLocator,
  GeneratedOutputContentLocator,
  PackageResourceContentLocator,
} from '../../types/content-locator';
import { NodeWorkspaceContentReadHandler } from './workspace-content-read-handler';

export interface NodeDocumentEntryReader {
  readEntry(sourcePath: string, entryPath: string): Promise<Uint8Array>;
}

export interface CreateNodeHostContentReadServiceOptions {
  readonly workspaceRoot: string;
  readonly documentEntryReader?: NodeDocumentEntryReader;
  readonly packageResourceHandler?: ContentReadHandler<PackageResourceContentLocator>;
  readonly defaultMaxBytes?: number;
}

export function createNodeHostContentReadService(
  options: CreateNodeHostContentReadServiceOptions,
): ContentReadService {
  const workspaceFile = new NodeWorkspaceContentReadHandler({
    workspaceRoot: options.workspaceRoot,
    ...(options.defaultMaxBytes !== undefined ? { defaultMaxBytes: options.defaultMaxBytes } : {}),
  });
  return new ExplicitContentReadService({
    workspaceFile,
    documentEntry: options.documentEntryReader
      ? new NodeDocumentEntryContentReadHandler(
          options.workspaceRoot,
          workspaceFile,
          options.documentEntryReader,
        )
      : new UnavailableContentReadHandler(),
    generatedOutput: new NodeGeneratedOutputContentReadHandler(workspaceFile),
    packageResource: options.packageResourceHandler ?? new UnavailableContentReadHandler(),
  });
}

export class NodeDocumentEntryContentReadHandler implements ContentReadHandler<DocumentEntryContentLocator> {
  constructor(
    private readonly workspaceRoot: string,
    private readonly workspaceFile: NodeWorkspaceContentReadHandler,
    private readonly entryReader: NodeDocumentEntryReader,
  ) {}

  async stat(
    locator: DocumentEntryContentLocator,
    options: ContentReadOptions,
  ): Promise<ContentStat> {
    const loaded = await this.load(locator, options);
    if (loaded.status === 'unavailable') return loaded;
    return {
      status: 'ready',
      locator,
      byteLength: loaded.bytes.byteLength,
      fingerprint: loaded.fingerprint,
    };
  }

  async read(
    locator: DocumentEntryContentLocator,
    options: ContentReadOptions,
  ): Promise<ContentBytes> {
    const loaded = await this.load(locator, options);
    if (loaded.status === 'unavailable') return loaded;
    const range = sliceRange(loaded.bytes, options);
    if (range.ok === false) return unavailable(locator, range.code);
    return {
      status: 'ready',
      locator,
      bytes: range.bytes,
      offset: range.offset,
      totalByteLength: loaded.bytes.byteLength,
      fingerprint: loaded.fingerprint,
    };
  }

  private async load(
    locator: DocumentEntryContentLocator,
    options: ContentReadOptions,
  ): Promise<
    | {
        readonly status: 'ready';
        readonly bytes: Uint8Array;
        readonly fingerprint: ContentFingerprint;
      }
    | Extract<ContentStat, { status: 'unavailable' }>
  > {
    const source = await this.workspaceFile.stat(locator.source, {
      ...(locator.source.fingerprint ? { expectedFingerprint: locator.source.fingerprint } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (source.status === 'unavailable') return unavailable(locator, source.diagnostic.code);
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');

    const sourcePath = path.join(this.workspaceRoot, ...locator.source.path.split('/'));
    try {
      const bytes = await this.entryReader.readEntry(sourcePath, locator.entryPath);
      if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');
      return {
        status: 'ready',
        bytes,
        fingerprint: sha256Fingerprint(bytes),
      };
    } catch (error) {
      return unavailable(locator, diagnosticCodeForReadError(error));
    }
  }
}

export class NodeGeneratedOutputContentReadHandler implements ContentReadHandler<GeneratedOutputContentLocator> {
  constructor(private readonly workspaceFile: NodeWorkspaceContentReadHandler) {}

  async stat(
    locator: GeneratedOutputContentLocator,
    options: ContentReadOptions,
  ): Promise<ContentStat> {
    return mapWorkspaceResult(
      locator,
      await this.workspaceFile.stat(generatedWorkspaceLocator(locator), {
        ...options,
        expectedFingerprint: { strategy: 'sha256', value: locator.digest },
      }),
    );
  }

  async read(
    locator: GeneratedOutputContentLocator,
    options: ContentReadOptions,
  ): Promise<ContentBytes> {
    return mapWorkspaceResult(
      locator,
      await this.workspaceFile.read(generatedWorkspaceLocator(locator), {
        ...options,
        expectedFingerprint: { strategy: 'sha256', value: locator.digest },
      }),
    );
  }
}

export class UnavailableContentReadHandler<
  TLocator extends ContentLocator,
> implements ContentReadHandler<TLocator> {
  async stat(locator: TLocator, _options: ContentReadOptions): Promise<ContentStat> {
    return unavailable(locator, 'content-unsupported');
  }

  async read(locator: TLocator, _options: ContentReadOptions): Promise<ContentBytes> {
    return unavailable(locator, 'content-unsupported');
  }
}

function generatedWorkspaceLocator(locator: GeneratedOutputContentLocator) {
  return {
    kind: 'workspace-file' as const,
    path: locator.path,
    fingerprint: { strategy: 'sha256' as const, value: locator.digest },
  };
}

function mapWorkspaceResult<T extends ContentStat | ContentBytes>(
  locator: GeneratedOutputContentLocator,
  result: T,
): T {
  return { ...result, locator };
}

function sliceRange(
  bytes: Uint8Array,
  options: ContentReadOptions,
):
  | { readonly ok: true; readonly bytes: Uint8Array; readonly offset: number }
  | { readonly ok: false; readonly code: 'content-range-invalid' | 'content-too-large' } {
  const offset = options.range?.offset ?? 0;
  if (offset > bytes.byteLength) return { ok: false, code: 'content-range-invalid' };
  const length = Math.min(options.range?.length ?? bytes.byteLength, bytes.byteLength - offset);
  if (options.maxBytes !== undefined && length > options.maxBytes) {
    return { ok: false, code: 'content-too-large' };
  }
  return { ok: true, bytes: bytes.slice(offset, offset + length), offset };
}

function sha256Fingerprint(bytes: Uint8Array) {
  return {
    strategy: 'sha256' as const,
    value: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
}

function diagnosticCodeForReadError(error: unknown): ContentIoDiagnosticCode {
  if (error instanceof Error && error.name === 'AbortError') return 'content-cancelled';
  if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) return 'content-missing';
  if (isNodeError(error, 'EACCES') || isNodeError(error, 'EPERM')) {
    return 'content-unauthorized';
  }
  return 'content-read-failed';
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === code
  );
}

function unavailable(
  locator: ContentLocator,
  code: ContentIoDiagnosticCode,
): Extract<ContentStat, { status: 'unavailable' }> {
  return { status: 'unavailable', locator, diagnostic: { code } };
}
