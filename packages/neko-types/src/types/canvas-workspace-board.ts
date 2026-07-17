import type { DocumentArchiveResourceRef } from './document-reading';
import { validateDurableResourceRef } from './durable-resource-ref';
import type { GeneratedAsset, GeneratedAssetMediaKind } from './generated-asset';
import type { ResourceRef } from './resource-cache';
import { isCanvasMaterialGenerationContext, type CanvasMaterialGenerationContext } from './canvas';

export const CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION = 1 as const;
export const CANVAS_WORKSPACE_BOARD_PATH = 'neko/boards/workspace.nkc' as const;

export type CanvasWorkspaceProjectionKind = 'markdown' | 'file-reference' | GeneratedAssetMediaKind;

export interface CanvasWorkspaceProjectionTarget {
  /** Stable local workspace URI selected by the Host session. */
  readonly workspaceUri: string;
  /** Optional explicit ordinary Canvas document. Omit for the canonical Workspace Board. */
  readonly documentUri?: string;
}

export interface CanvasWorkspaceProjectionProvenance {
  readonly version: typeof CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION;
  readonly projectionId: string;
  readonly artifactId: string;
  readonly revision: string;
  readonly kind: CanvasWorkspaceProjectionKind;
  readonly sourceId: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly createdAt: string;
}

export type CanvasWorkspaceProjectionArtifact =
  | {
      readonly kind: 'markdown';
      readonly title: string;
      readonly markdown: string;
    }
  | {
      readonly kind: Exclude<CanvasWorkspaceProjectionKind, 'markdown'>;
      readonly title: string;
      readonly mimeType?: string;
      readonly resourceRef?: ResourceRef;
      readonly documentResourceRef?: DocumentArchiveResourceRef;
      readonly generationContext?: CanvasMaterialGenerationContext;
    };

export interface CanvasWorkspaceProjectionRequest {
  readonly version: typeof CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION;
  readonly target: CanvasWorkspaceProjectionTarget;
  readonly provenance: CanvasWorkspaceProjectionProvenance;
  readonly artifact: CanvasWorkspaceProjectionArtifact;
}

export interface CanvasWorkspaceProjectionResolvedTarget {
  readonly kind: 'workspace' | 'explicit';
  readonly documentUri: string;
}

export type CanvasWorkspaceProjectionDiagnosticCode =
  | 'invalid-contract-version'
  | 'workspace-required'
  | 'invalid-canvas-target'
  | 'invalid-canvas-extension'
  | 'missing-projection-identity'
  | 'unsupported-projection-kind'
  | 'invalid-resource-ref'
  | 'runtime-value-forbidden'
  | 'legacy-routing-forbidden'
  | 'projection-conflict'
  | 'projection-write-failed';

export interface CanvasWorkspaceProjectionDiagnostic {
  readonly code: CanvasWorkspaceProjectionDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export interface CanvasWorkspaceProjectionResult {
  readonly version: typeof CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION;
  readonly status: 'projected' | 'noop' | 'blocked';
  readonly target?: CanvasWorkspaceProjectionResolvedTarget;
  readonly revision?: string;
  readonly nodeIds?: readonly string[];
  readonly diagnostics: readonly CanvasWorkspaceProjectionDiagnostic[];
}

export function createGeneratedAssetWorkspaceProjectionRequest(
  asset: GeneratedAsset,
  workspaceUri: string,
): CanvasWorkspaceProjectionRequest {
  if (!asset.lifecycle) {
    throw new Error(`Generated output ${asset.id} has no durable lifecycle reference.`);
  }
  const generationContext = createCanvasMaterialGenerationContext(asset);
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    target: { workspaceUri },
    provenance: {
      version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
      projectionId: `generated-output:${asset.id}`,
      artifactId: asset.id,
      revision: asset.lifecycle.revision,
      kind: asset.lifecycle.mediaKind,
      sourceId: asset.lifecycle.resourceRef.id,
      taskId: asset.lifecycle.generation.taskId,
      ...(asset.lifecycle.generation.runId ? { runId: asset.lifecycle.generation.runId } : {}),
      createdAt: asset.generatedAt,
    },
    artifact: {
      kind: asset.lifecycle.mediaKind,
      title: asset.prompt?.trim() || `Generated ${asset.lifecycle.mediaKind}`,
      mimeType: asset.mimeType,
      resourceRef: asset.lifecycle.resourceRef,
      ...(generationContext ? { generationContext } : {}),
    },
  };
}

function createCanvasMaterialGenerationContext(
  asset: GeneratedAsset,
): CanvasMaterialGenerationContext | undefined {
  const prompt = asset.prompt?.trim();
  const model = asset.model?.trim();
  const sourceNodeId = asset.sourceNodeId?.trim();
  const shared = {
    ...(prompt ? { prompt } : {}),
    ...(model ? { model } : {}),
    ...(sourceNodeId ? { sourceNodeId } : {}),
    ...(asset.generatedAt.trim() ? { generatedAt: asset.generatedAt.trim() } : {}),
  };
  const context: CanvasMaterialGenerationContext =
    asset.type === 'generated-image'
      ? {
          ...shared,
          ...(asset.ratio.trim() ? { aspectRatio: asset.ratio.trim() } : {}),
          ...(asset.width > 0 ? { width: asset.width } : {}),
          ...(asset.height > 0 ? { height: asset.height } : {}),
        }
      : asset.type === 'generated-video'
        ? {
            ...shared,
            ...(asset.width > 0 ? { width: asset.width } : {}),
            ...(asset.height > 0 ? { height: asset.height } : {}),
            ...(asset.duration > 0 ? { duration: asset.duration } : {}),
          }
        : asset.type === 'generated-audio'
          ? { ...shared, ...(asset.duration > 0 ? { duration: asset.duration } : {}) }
          : shared;
  return isCanvasMaterialGenerationContext(context) ? context : undefined;
}

const PROJECTION_KINDS = new Set<CanvasWorkspaceProjectionKind>([
  'markdown',
  'file-reference',
  'image',
  'audio',
  'video',
  'storyboard',
  'file',
]);

const LEGACY_ROUTING_KEYS = new Set([
  'activeCanvas',
  'binding',
  'conversationId',
  'exactIndex',
  'filter',
  'professionalCanvas',
  'query',
  'recentCanvas',
  'resolutionSource',
  'scopeKind',
  'suggestedTitle',
]);

const RUNTIME_KEYS = new Set([
  'assetMembership',
  'cachePath',
  'canvasData',
  'processHandle',
  'rawCanvas',
  'renderUri',
  'token',
  'webviewUri',
]);

export function resolveCanvasWorkspaceBoardDocumentUri(workspaceUri: string): string {
  const workspaceUrl = parseLocalFileUri(workspaceUri);
  if (!workspaceUrl) {
    throw new Error('Canvas Workspace Board requires a local file workspace URI.');
  }
  const pathname = workspaceUrl.pathname.endsWith('/')
    ? workspaceUrl.pathname
    : `${workspaceUrl.pathname}/`;
  return new URL(
    CANVAS_WORKSPACE_BOARD_PATH,
    `${workspaceUrl.protocol}//${workspaceUrl.host}${pathname}`,
  ).toString();
}

export function validateCanvasWorkspaceProjectionRequest(
  request: CanvasWorkspaceProjectionRequest,
): readonly CanvasWorkspaceProjectionDiagnostic[] {
  const diagnostics: CanvasWorkspaceProjectionDiagnostic[] = [];
  if (request.version !== CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION) {
    diagnostics.push(
      diagnostic(
        'invalid-contract-version',
        'Unsupported Canvas Workspace Board contract version.',
        ['version'],
      ),
    );
  }

  if (!parseLocalFileUri(request.target.workspaceUri)) {
    diagnostics.push(
      diagnostic(
        'workspace-required',
        'Canvas projection requires one explicit local workspace URI.',
        ['target', 'workspaceUri'],
      ),
    );
  }
  if (request.target.documentUri !== undefined) {
    if (!parseLocalFileUri(request.target.documentUri)) {
      diagnostics.push(
        diagnostic(
          'invalid-canvas-target',
          'Explicit Canvas target must be a durable local file URI.',
          ['target', 'documentUri'],
        ),
      );
    } else if (!uriPathname(request.target.documentUri)?.toLowerCase().endsWith('.nkc')) {
      diagnostics.push(
        diagnostic('invalid-canvas-extension', 'Explicit Canvas target must end with .nkc.', [
          'target',
          'documentUri',
        ]),
      );
    }
  }

  for (const key of ['projectionId', 'artifactId', 'revision', 'sourceId', 'createdAt'] as const) {
    if (!isNonEmptyString(request.provenance[key])) {
      diagnostics.push(
        diagnostic('missing-projection-identity', `Canvas projection ${key} is required.`, [
          'provenance',
          key,
        ]),
      );
    }
  }
  if (!PROJECTION_KINDS.has(request.provenance.kind)) {
    diagnostics.push(
      diagnostic(
        'unsupported-projection-kind',
        'Canvas Workspace Board projection kind is unsupported.',
        ['provenance', 'kind'],
      ),
    );
  }
  if (
    request.artifact.kind !== 'markdown' &&
    request.artifact.generationContext !== undefined &&
    !isCanvasMaterialGenerationContext(request.artifact.generationContext)
  ) {
    diagnostics.push(
      diagnostic(
        'runtime-value-forbidden',
        'Canvas generated material context must contain only portable prompt, model, source, time, and numeric generation metadata.',
        ['artifact', 'generationContext'],
      ),
    );
  }
  if (request.artifact.kind !== request.provenance.kind) {
    diagnostics.push(
      diagnostic(
        'unsupported-projection-kind',
        'Canvas projection artifact kind must match provenance kind.',
        ['artifact', 'kind'],
      ),
    );
  }

  if (request.artifact.kind === 'markdown') {
    if (!isNonEmptyString(request.artifact.title) || !isNonEmptyString(request.artifact.markdown)) {
      diagnostics.push(
        diagnostic(
          'missing-projection-identity',
          'Markdown projection requires a title and non-empty content.',
          ['artifact'],
        ),
      );
    }
  } else if (request.artifact.resourceRef) {
    const validation = validateDurableResourceRef(request.artifact.resourceRef, [
      'artifact',
      'resourceRef',
    ]);
    diagnostics.push(
      ...validation.diagnostics.map((entry) =>
        diagnostic('invalid-resource-ref', entry.message, entry.path),
      ),
    );
  } else if (!request.artifact.documentResourceRef) {
    diagnostics.push(
      diagnostic(
        'invalid-resource-ref',
        'File and media projection requires a stable resource reference.',
        ['artifact'],
      ),
    );
  }

  visitForbiddenValues(request, [], diagnostics);
  return diagnostics;
}

export function validateCanvasWorkspaceProjectionResult(
  result: CanvasWorkspaceProjectionResult,
): readonly CanvasWorkspaceProjectionDiagnostic[] {
  const diagnostics: CanvasWorkspaceProjectionDiagnostic[] = [];
  if (result.version !== CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION) {
    diagnostics.push(
      diagnostic('invalid-contract-version', 'Unsupported Canvas Workspace Board result version.', [
        'version',
      ]),
    );
  }
  if (result.status === 'blocked' && result.target) {
    diagnostics.push(
      diagnostic(
        'invalid-canvas-target',
        'Blocked Canvas projection results must not expose a writable target.',
        ['target'],
      ),
    );
  }
  if (result.status !== 'blocked' && !result.target) {
    diagnostics.push(
      diagnostic(
        'invalid-canvas-target',
        'Successful Canvas projection results require a resolved target.',
        ['target'],
      ),
    );
  }
  return diagnostics;
}

function visitForbiddenValues(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasWorkspaceProjectionDiagnostic[],
): void {
  if (typeof value === 'string') {
    if (isRuntimeValue(value)) {
      diagnostics.push(
        diagnostic(
          'runtime-value-forbidden',
          'Canvas projection contracts must not contain runtime or cache identities.',
          path,
        ),
      );
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitForbiddenValues(entry, [...path, index], diagnostics));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (LEGACY_ROUTING_KEYS.has(key)) {
      diagnostics.push(
        diagnostic(
          'legacy-routing-forbidden',
          `Canvas projection contracts must not contain legacy routing field ${key}.`,
          [...path, key],
        ),
      );
      continue;
    }
    if (RUNTIME_KEYS.has(key)) {
      diagnostics.push(
        diagnostic(
          'runtime-value-forbidden',
          `Canvas projection contracts must not contain runtime field ${key}.`,
          [...path, key],
        ),
      );
      continue;
    }
    visitForbiddenValues(entry, [...path, key], diagnostics);
  }
}

function parseLocalFileUri(value: string | undefined): URL | undefined {
  if (!isNonEmptyString(value)) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'file:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function uriPathname(value: string): string | undefined {
  return parseLocalFileUri(value)?.pathname;
}

function isRuntimeValue(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, '/');
  return (
    normalized.includes('/.neko/.cache/') ||
    normalized.startsWith('.neko/.cache/') ||
    /^(?:blob|data|vscode-webview|render|preview):/i.test(normalized)
  );
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function diagnostic(
  code: CanvasWorkspaceProjectionDiagnosticCode,
  message: string,
  path?: readonly (string | number)[],
): CanvasWorkspaceProjectionDiagnostic {
  return {
    code,
    severity: 'error',
    message,
    ...(path ? { path } : {}),
  };
}
