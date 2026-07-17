import type {
  ContentAccessDiagnostic,
  ContentIngestDestinationPolicy,
  ContentIngestMode,
  ContentIngestRequest,
  ContentIngestResult,
} from '../types/content-access';
import type { ProjectFileDiagnostic } from './diagnostics';
import { createProjectFileDiagnostic } from './diagnostics';
import {
  detectRuntimeOrCacheSourceHandle,
  type ProjectSourceDescriptor,
  type ProjectSourceRole,
} from './source-policy';

export type ProjectSourceAddKind =
  'drag-drop' | 'paste' | 'file-picker' | 'generated-output' | 'programmatic';

export interface BrowserFileProjection {
  readonly name: string;
  readonly size?: number;
  readonly type?: string;
  readonly lastModified?: number;
}

export interface ProjectSourceAddRequest {
  readonly requestId: string;
  readonly kind: ProjectSourceAddKind;
  readonly formatId: string;
  readonly documentUri?: string;
  readonly target?: {
    readonly descriptor?: ProjectSourceDescriptor;
    readonly role?: ProjectSourceRole;
    readonly fieldPath?: readonly (string | number)[];
  };
  readonly sourcePath?: string;
  readonly sourceUri?: string;
  readonly browserFile?: BrowserFileProjection;
  readonly bytes?: Uint8Array;
  readonly generatedAssetId?: string;
  readonly destination: ContentIngestDestinationPolicy;
  readonly ingestMode?: ContentIngestMode;
  readonly mimeType?: string;
  readonly caller?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ProjectSourceAddResult {
  readonly requestId: string;
  readonly ok: boolean;
  readonly ingest?: ContentIngestResult;
  readonly durablePath?: string;
  readonly diagnostics: readonly ProjectFileDiagnostic[];
}

export interface ProjectSourceIngestPort {
  ingest(request: ContentIngestRequest): Promise<ContentIngestResult>;
}

export async function handleProjectSourceAddRequest(
  request: ProjectSourceAddRequest,
  ingestPort: ProjectSourceIngestPort,
): Promise<ProjectSourceAddResult> {
  const preflightDiagnostics = validateProjectSourceAddRequest(request);
  if (preflightDiagnostics.length > 0) {
    return {
      requestId: request.requestId,
      ok: false,
      diagnostics: preflightDiagnostics,
    };
  }

  const ingest = await ingestPort.ingest(toContentIngestRequest(request));
  const diagnostics = [
    ...projectDiagnosticsFromContentDiagnostics(ingest.diagnostics ?? []),
    ...(ingest.error
      ? [
          createProjectFileDiagnostic({
            code: ingest.status === 'non-portable' ? 'non-portable-path' : 'missing-source',
            message: ingest.error,
            recoverability: ingest.status === 'non-portable' ? 'create-asset' : 'relink',
          }),
        ]
      : []),
  ];
  const durablePath = extractDurablePathFromIngest(ingest);

  return {
    requestId: request.requestId,
    ok:
      ingest.status === 'ready' &&
      diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    ingest,
    ...(durablePath ? { durablePath } : {}),
    diagnostics,
  };
}

export function toContentIngestRequest(request: ProjectSourceAddRequest): ContentIngestRequest {
  return {
    mode: request.ingestMode ?? inferIngestMode(request),
    ...(request.sourcePath ? { sourcePath: request.sourcePath } : {}),
    ...(request.bytes ? { bytes: request.bytes } : {}),
    destination: request.destination,
    ...((request.mimeType ?? request.browserFile?.type)
      ? { mimeType: request.mimeType ?? request.browserFile?.type }
      : {}),
    ...(request.browserFile?.name ? { fileName: request.browserFile.name } : {}),
    ...(request.caller ? { caller: request.caller } : {}),
    metadata: {
      ...(request.metadata ?? {}),
      projectFormatId: request.formatId,
      projectSourceAddKind: request.kind,
      ...(request.documentUri ? { documentUri: request.documentUri } : {}),
      ...(request.sourceUri ? { sourceUri: request.sourceUri } : {}),
      ...(request.generatedAssetId ? { generatedAssetId: request.generatedAssetId } : {}),
    },
  };
}

export function extractDurablePathFromIngest(result: ContentIngestResult): string | undefined {
  if (result.contractedPath) return result.contractedPath;
  if (result.source && 'kind' in result.source && result.source.kind === 'file') {
    return result.source.path;
  }
  if (result.source && 'kind' in result.source && result.source.kind === 'generated-asset') {
    return result.source.path;
  }
  return result.outputPath;
}

export function validateProjectSourceAddRequest(
  request: ProjectSourceAddRequest,
): readonly ProjectFileDiagnostic[] {
  const diagnostics: ProjectFileDiagnostic[] = [];
  if (
    !request.sourcePath &&
    !request.bytes &&
    !request.generatedAssetId &&
    request.kind !== 'file-picker'
  ) {
    diagnostics.push(
      createProjectFileDiagnostic({
        code: 'missing-source',
        message: request.browserFile?.name
          ? `Dropped file ${request.browserFile.name} does not expose a durable source path.`
          : 'Add-source request does not include a durable source, bytes, or generated asset id.',
        recoverability: 'create-asset',
        context: request.browserFile?.name ? { fileName: request.browserFile.name } : undefined,
      }),
    );
  }
  diagnostics.push(...detectRuntimeOrCacheAddSourceHandles(request));
  return diagnostics;
}

function detectRuntimeOrCacheAddSourceHandles(
  request: ProjectSourceAddRequest,
): readonly ProjectFileDiagnostic[] {
  const diagnostics: ProjectFileDiagnostic[] = [];
  for (const [field, value] of [
    ['sourcePath', request.sourcePath],
    ['sourceUri', request.sourceUri],
  ] as const) {
    if (!value) continue;
    const diagnostic = detectRuntimeOrCacheSourceHandle({
      id: `addSource.${field}`,
      role: request.target?.role ?? 'other',
      path: value,
      fieldPath: [field],
    });
    if (diagnostic) {
      diagnostics.push(
        createProjectFileDiagnostic({
          code: diagnostic.code,
          message:
            diagnostic.code === 'runtime-handle-persisted'
              ? 'Add-source request contains a runtime-only handle instead of a durable source.'
              : 'Add-source request contains a cache or preview artifact instead of a durable source.',
          path: diagnostic.path,
          sourceId: diagnostic.sourceId,
          recoverability: diagnostic.recoverability,
        }),
      );
    }
  }
  return diagnostics;
}

function projectDiagnosticsFromContentDiagnostics(
  diagnostics: readonly ContentAccessDiagnostic[],
): readonly ProjectFileDiagnostic[] {
  return diagnostics.map((diagnostic) =>
    createProjectFileDiagnostic({
      code: mapContentDiagnosticCode(diagnostic.code),
      severity: diagnostic.severity,
      message: diagnostic.message,
      sourceId: diagnostic.sourceId,
      recoverability: diagnostic.code.includes('non-portable') ? 'create-asset' : 'manual',
    }),
  );
}

function mapContentDiagnosticCode(code: string): ProjectFileDiagnostic['code'] {
  if (code.includes('runtime')) return 'runtime-handle-persisted';
  if (code.includes('cache')) return 'cache-source-persisted';
  if (code.includes('unauthorized')) return 'unauthorized-root';
  if (code.includes('non-portable')) return 'non-portable-path';
  if (code.includes('missing')) return 'missing-source';
  return 'invalid-document';
}

function inferIngestMode(request: ProjectSourceAddRequest): ContentIngestMode {
  if (request.generatedAssetId || request.kind === 'generated-output') return 'create-asset';
  if (request.bytes) return 'create-asset';
  return 'link';
}
