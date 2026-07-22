import {
  classifyWorkspaceMediaPath,
  resolveWorkspaceMediaPath,
  type WorkspaceMediaPathContext,
  type WorkspaceMediaPathDiagnostic,
} from '../path/workspace-media-path';
import { createProjectFileDiagnostic, type ProjectFileDiagnostic } from './diagnostics';

export type ProjectSourceRole =
  'media' | 'audio' | 'model' | 'image' | 'document' | 'generated' | 'bundle' | 'project' | 'other';

export interface ProjectSourceDescriptor {
  readonly id: string;
  readonly role: ProjectSourceRole;
  readonly path: string;
  readonly fieldPath: readonly (string | number)[];
  readonly allowRemote?: boolean;
}

export interface ProjectSourceReplacement {
  readonly descriptor: ProjectSourceDescriptor;
  readonly path: string;
}

export interface PortableSourcePathPolicy<TDocument> {
  listSources(document: TDocument): readonly ProjectSourceDescriptor[];
  replaceSources(document: TDocument, replacements: readonly ProjectSourceReplacement[]): TDocument;
}

export interface ApplyPortableSourcePolicyOptions {
  readonly context: WorkspaceMediaPathContext;
  readonly fileExists?: (filePath: string) => boolean;
  readonly isPathAuthorized?: (filePath: string) => boolean;
  readonly strict?: boolean;
}

export interface ApplyPortableSourcePolicyResult<TDocument> {
  readonly document: TDocument;
  readonly diagnostics: readonly ProjectFileDiagnostic[];
  readonly replacements: readonly ProjectSourceReplacement[];
}

export interface ResolveProjectSourcesResult {
  readonly diagnostics: readonly ProjectFileDiagnostic[];
}

export function applyPortableSourcePathPolicy<TDocument>(
  document: TDocument,
  policy: PortableSourcePathPolicy<TDocument> | undefined,
  options: ApplyPortableSourcePolicyOptions,
): ApplyPortableSourcePolicyResult<TDocument> {
  if (!policy) {
    return { document, diagnostics: [], replacements: [] };
  }

  const diagnostics: ProjectFileDiagnostic[] = [];
  const replacements: ProjectSourceReplacement[] = [];

  for (const descriptor of policy.listSources(document)) {
    const runtimeDiagnostic = detectRuntimeOrCacheSourceHandle(descriptor);
    if (runtimeDiagnostic) {
      diagnostics.push(runtimeDiagnostic);
      continue;
    }

    if (hasUnsupportedUriScheme(descriptor.path)) {
      diagnostics.push(createNonPortableSourceDiagnostic(descriptor));
      continue;
    }

    if (isRemoteUrl(descriptor.path)) {
      if (!descriptor.allowRemote) {
        diagnostics.push(
          createProjectFileDiagnostic({
            code: 'non-portable-path',
            message: `Remote source is not allowed for ${descriptor.id}.`,
            path: descriptor.fieldPath,
            sourceId: descriptor.id,
            recoverability: 'manual',
          }),
        );
      }
      continue;
    }

    const classification = classifyWorkspaceMediaPath(descriptor.path);
    if (classification.kind === 'workspace-relative' && hasParentTraversal(descriptor.path)) {
      diagnostics.push(createNonPortableSourceDiagnostic(descriptor));
      continue;
    }
    if (classification.kind === 'variable') {
      if (!isKnownPathVariable(classification.variable, options.context)) {
        diagnostics.push(createMigrationRequiredDiagnostic(descriptor, classification.variable));
      }
      continue;
    }
    if (classification.kind === 'workspace-relative') {
      continue;
    }

    diagnostics.push(createMigrationRequiredDiagnostic(descriptor));
  }

  return {
    document: replacements.length > 0 ? policy.replaceSources(document, replacements) : document,
    diagnostics,
    replacements,
  };
}

export function resolveProjectSourceDiagnostics<TDocument>(
  document: TDocument,
  policy: PortableSourcePathPolicy<TDocument> | undefined,
  options: ApplyPortableSourcePolicyOptions,
): ResolveProjectSourcesResult {
  if (!policy) return { diagnostics: [] };

  const diagnostics: ProjectFileDiagnostic[] = [];
  for (const descriptor of policy.listSources(document)) {
    const runtimeDiagnostic = detectRuntimeOrCacheSourceHandle(descriptor);
    if (runtimeDiagnostic) {
      diagnostics.push(runtimeDiagnostic);
      continue;
    }
    if (hasUnsupportedUriScheme(descriptor.path)) {
      diagnostics.push(createNonPortableSourceDiagnostic(descriptor));
      continue;
    }
    if (isRemoteUrl(descriptor.path)) {
      if (!descriptor.allowRemote) {
        diagnostics.push(
          createProjectFileDiagnostic({
            code: 'non-portable-path',
            message: `Remote source is not allowed for ${descriptor.id}.`,
            path: descriptor.fieldPath,
            sourceId: descriptor.id,
            recoverability: 'manual',
          }),
        );
      }
      continue;
    }
    if (hasParentTraversal(descriptor.path)) {
      diagnostics.push(createNonPortableSourceDiagnostic(descriptor));
      continue;
    }

    const classification = classifyWorkspaceMediaPath(descriptor.path);
    if (classification.kind === 'absolute-local') {
      diagnostics.push(createMigrationRequiredDiagnostic(descriptor));
      continue;
    }
    if (
      classification.kind === 'variable' &&
      !isKnownPathVariable(classification.variable, options.context)
    ) {
      diagnostics.push(createMigrationRequiredDiagnostic(descriptor, classification.variable));
      continue;
    }

    const resolved = resolveWorkspaceMediaPath({
      source: descriptor.path,
      context: options.context,
      fileExists: options.fileExists,
      isPathAuthorized: options.isPathAuthorized,
    });

    diagnostics.push(
      ...resolved.diagnostics.map((diagnostic) => mapWorkspaceDiagnostic(diagnostic, descriptor)),
    );
  }

  return { diagnostics };
}

export function detectRuntimeOrCacheSourceHandle(
  descriptor: ProjectSourceDescriptor,
): ProjectFileDiagnostic | undefined {
  const value = descriptor.path.trim();
  const lower = value.toLowerCase();

  if (
    lower.startsWith('blob:') ||
    lower.startsWith('vscode-resource:') ||
    lower.startsWith('vscode-webview-resource:') ||
    lower.startsWith('http://127.0.0.1') ||
    lower.startsWith('http://localhost') ||
    lower.includes('engineToken=') ||
    lower.includes('engine_token=') ||
    lower.includes('streamid=') ||
    lower.includes('stream_id=') ||
    lower.includes('access_token=') ||
    lower.includes('/range/')
  ) {
    return createProjectFileDiagnostic({
      code: 'runtime-handle-persisted',
      message: `Source ${descriptor.id} contains a runtime-only handle.`,
      path: descriptor.fieldPath,
      sourceId: descriptor.id,
      recoverability: 'relink',
    });
  }

  if (
    hasPathSegmentSequence(lower, ['.neko', '.cache']) ||
    hasPathSegment(lower, 'cache') ||
    hasPathSegment(lower, 'proxy') ||
    hasPathSegment(lower, 'thumbnail') ||
    lower.includes('cachepath')
  ) {
    return createProjectFileDiagnostic({
      code: 'cache-source-persisted',
      message: `Source ${descriptor.id} points to a cache or preview artifact.`,
      path: descriptor.fieldPath,
      sourceId: descriptor.id,
      recoverability: 'relink',
    });
  }

  return undefined;
}

function createNonPortableSourceDiagnostic(
  descriptor: ProjectSourceDescriptor,
): ProjectFileDiagnostic {
  return createProjectFileDiagnostic({
    code: 'non-portable-path',
    message: `Source ${descriptor.id} escapes the project or workspace root.`,
    path: descriptor.fieldPath,
    sourceId: descriptor.id,
    recoverability: 'create-asset',
  });
}

function createMigrationRequiredDiagnostic(
  descriptor: ProjectSourceDescriptor,
  variable?: string,
): ProjectFileDiagnostic {
  return createProjectFileDiagnostic({
    code: 'migration-required',
    message: `Source ${descriptor.id} uses a retired local path shape and requires explicit migration.`,
    path: descriptor.fieldPath,
    sourceId: descriptor.id,
    recoverability: 'relink',
    ...(variable ? { context: { variable } } : {}),
  });
}

function isKnownPathVariable(
  variable: string | undefined,
  context: WorkspaceMediaPathContext,
): boolean {
  return Boolean(variable && context.pathVariables?.has(variable));
}

function hasParentTraversal(value: string): boolean {
  const normalized = normalizePathForSegmentChecks(value);
  return normalized === '..' || normalized.startsWith('../') || normalized.includes('/../');
}

function hasPathSegment(value: string, segment: string): boolean {
  return normalizePathForSegmentChecks(value).split('/').includes(segment);
}

function hasPathSegmentSequence(value: string, sequence: readonly string[]): boolean {
  const segments = normalizePathForSegmentChecks(value).split('/');
  return segments.some((_, index) =>
    sequence.every((segment, offset) => segments[index + offset] === segment),
  );
}

function normalizePathForSegmentChecks(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function mapWorkspaceDiagnostic(
  diagnostic: WorkspaceMediaPathDiagnostic,
  descriptor: ProjectSourceDescriptor,
): ProjectFileDiagnostic {
  switch (diagnostic.code) {
    case 'unknown-variable':
      return createProjectFileDiagnostic({
        code: 'unresolved-variable',
        message: diagnostic.message,
        path: descriptor.fieldPath,
        sourceId: descriptor.id,
        recoverability: 'configure',
        context: diagnostic.variable ? { variable: diagnostic.variable } : undefined,
      });
    case 'unauthorized-path':
      return createProjectFileDiagnostic({
        code: 'unauthorized-root',
        message: diagnostic.message,
        path: descriptor.fieldPath,
        sourceId: descriptor.id,
        recoverability: 'configure',
      });
    case 'missing-file':
      return createProjectFileDiagnostic({
        code: 'missing-source',
        message: diagnostic.message,
        path: descriptor.fieldPath,
        sourceId: descriptor.id,
        recoverability: 'relink',
      });
    case 'multi-root-ambiguity':
      return createProjectFileDiagnostic({
        code: 'multi-root-ambiguity',
        severity: 'warning',
        message: diagnostic.message,
        path: descriptor.fieldPath,
        sourceId: descriptor.id,
        recoverability: 'configure',
      });
    case 'missing-context':
    default:
      return createProjectFileDiagnostic({
        code: 'missing-source',
        message: diagnostic.message,
        path: descriptor.fieldPath,
        sourceId: descriptor.id,
        recoverability: 'configure',
      });
  }
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function hasUnsupportedUriScheme(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value.trim()) && !isRemoteUrl(value.trim());
}
