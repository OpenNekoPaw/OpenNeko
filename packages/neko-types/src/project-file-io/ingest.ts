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
  /** Domain-owned directory used only when bytes must be copied into the project. */
  readonly assetDirectory: string;
  readonly mimeType?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ProjectSourceAddResult {
  readonly requestId: string;
  readonly ok: boolean;
  readonly durablePath?: string;
  readonly metadata?: Record<string, unknown>;
  readonly diagnostics: readonly ProjectFileDiagnostic[];
}

export type ProjectSourceStorageResult =
  | {
      readonly status: 'ready';
      readonly storage: 'referenced' | 'copied';
      readonly durablePath: string;
      readonly metadata?: Record<string, unknown>;
    }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: ProjectFileDiagnostic;
    };

export interface ProjectSourceStoragePort {
  store(request: ProjectSourceAddRequest): Promise<ProjectSourceStorageResult>;
}

export async function handleProjectSourceAddRequest(
  request: ProjectSourceAddRequest,
  storagePort: ProjectSourceStoragePort,
): Promise<ProjectSourceAddResult> {
  const preflightDiagnostics = validateProjectSourceAddRequest(request);
  if (preflightDiagnostics.length > 0) {
    return {
      requestId: request.requestId,
      ok: false,
      diagnostics: preflightDiagnostics,
    };
  }

  const stored = await storagePort.store(request);
  if (stored.status === 'unavailable') {
    return {
      requestId: request.requestId,
      ok: false,
      diagnostics: [stored.diagnostic],
    };
  }

  return {
    requestId: request.requestId,
    ok: true,
    durablePath: stored.durablePath,
    ...(stored.metadata ? { metadata: stored.metadata } : {}),
    diagnostics: [],
  };
}

export function validateProjectSourceAddRequest(
  request: ProjectSourceAddRequest,
): readonly ProjectFileDiagnostic[] {
  const diagnostics: ProjectFileDiagnostic[] = [];
  if (!isSafeProjectAssetDirectory(request.assetDirectory)) {
    diagnostics.push(
      createProjectFileDiagnostic({
        code: 'unauthorized-root',
        message: 'Project source asset directory must be a normalized project-relative path.',
        recoverability: 'manual',
      }),
    );
  }
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

function isSafeProjectAssetDirectory(value: string): boolean {
  if (!value || value !== value.trim() || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/u.test(value)) return false;
  return value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
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
