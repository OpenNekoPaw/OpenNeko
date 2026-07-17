import { PathResolver, type PathVariableMap } from './resolver';

const VARIABLE_PATTERN = /^\/?\$\{([^}]+)\}(.*)$/;
const URI_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATTERN = /^\\\\/;
const WORKSPACE_VARIABLES = new Set(['WORKSPACE', 'PROJECT']);

export type WorkspaceMediaPathKind =
  'empty' | 'remote-url' | 'variable' | 'absolute-local' | 'workspace-relative';

export type WorkspaceMediaPathCandidateReason =
  'absolute-local' | 'workspace-relative' | 'workspace-variable' | 'custom-variable';

export type WorkspaceMediaPathDiagnosticCode =
  | 'missing-context'
  | 'unknown-variable'
  | 'multi-root-ambiguity'
  | 'unauthorized-path'
  | 'missing-file';

export interface WorkspaceMediaPathContext {
  readonly sourceDocumentUri?: string;
  readonly owningWorkspaceRoot?: string;
  readonly workspaceRoots?: readonly string[];
  readonly documentDir?: string;
  readonly pathVariables?: PathVariableMap | ReadonlyMap<string, string>;
  readonly allowedRoots?: readonly string[];
}

export interface WorkspaceMediaPathClassification {
  readonly kind: WorkspaceMediaPathKind;
  readonly source: string;
  readonly variable?: string;
  readonly variableRest?: string;
}

export interface WorkspaceMediaPathCandidate {
  readonly path: string;
  readonly reason: WorkspaceMediaPathCandidateReason;
  readonly root?: string;
}

export interface WorkspaceMediaPathDiagnostic {
  readonly code: WorkspaceMediaPathDiagnosticCode;
  readonly message: string;
  readonly path?: string;
  readonly variable?: string;
}

export type WorkspaceMediaPathResolution =
  | {
      readonly status: 'remote';
      readonly source: string;
      readonly url: string;
      readonly classification: WorkspaceMediaPathClassification;
      readonly diagnostics: readonly WorkspaceMediaPathDiagnostic[];
      readonly candidates: readonly WorkspaceMediaPathCandidate[];
    }
  | {
      readonly status: 'resolved-local';
      readonly source: string;
      readonly path: string;
      readonly candidate: WorkspaceMediaPathCandidate;
      readonly classification: WorkspaceMediaPathClassification;
      readonly diagnostics: readonly WorkspaceMediaPathDiagnostic[];
      readonly candidates: readonly WorkspaceMediaPathCandidate[];
    }
  | {
      readonly status: 'unauthorized';
      readonly source: string;
      readonly path: string;
      readonly classification: WorkspaceMediaPathClassification;
      readonly diagnostics: readonly WorkspaceMediaPathDiagnostic[];
      readonly candidates: readonly WorkspaceMediaPathCandidate[];
    }
  | {
      readonly status: 'unresolved';
      readonly source: string;
      readonly classification: WorkspaceMediaPathClassification;
      readonly diagnostics: readonly WorkspaceMediaPathDiagnostic[];
      readonly candidates: readonly WorkspaceMediaPathCandidate[];
    };

export interface ResolveWorkspaceMediaPathInput {
  readonly source: string;
  readonly context: WorkspaceMediaPathContext;
  readonly fileExists?: (filePath: string) => boolean;
  readonly isPathAuthorized?: (filePath: string) => boolean;
}

export interface ResolveWorkspaceMediaPathAsyncInput {
  readonly source: string;
  readonly context: WorkspaceMediaPathContext;
  readonly fileExists: (filePath: string) => boolean | Promise<boolean>;
  readonly isPathAuthorized?: (filePath: string) => boolean | Promise<boolean>;
}

export type WorkspaceMediaPathContractionFormat =
  'remote-url' | 'workspace-relative' | 'variable' | 'absolute-local';

export interface WorkspaceMediaPathContractionResult {
  readonly path: string;
  readonly format: WorkspaceMediaPathContractionFormat;
  readonly diagnostics: readonly WorkspaceMediaPathDiagnostic[];
}

export function classifyWorkspaceMediaPath(source: string): WorkspaceMediaPathClassification {
  const trimmed = source.trim();
  if (!trimmed) return { kind: 'empty', source };
  if (isRemoteUrl(trimmed)) return { kind: 'remote-url', source: trimmed };

  const variable = readVariableReference(trimmed);
  if (variable) {
    return {
      kind: 'variable',
      source: trimmed,
      variable: variable.name,
      variableRest: variable.rest,
    };
  }

  if (isAbsoluteLocalPath(trimmed)) {
    return {
      kind: 'absolute-local',
      source: trimmed,
    };
  }

  if (URI_SCHEME_PATTERN.test(trimmed)) {
    return { kind: 'remote-url', source: trimmed };
  }

  return { kind: 'workspace-relative', source: trimmed };
}

export function createWorkspaceMediaPathCandidates(
  source: string,
  context: WorkspaceMediaPathContext,
): {
  readonly classification: WorkspaceMediaPathClassification;
  readonly candidates: readonly WorkspaceMediaPathCandidate[];
  readonly diagnostics: readonly WorkspaceMediaPathDiagnostic[];
} {
  const classification = classifyWorkspaceMediaPath(source);
  const diagnostics: WorkspaceMediaPathDiagnostic[] = [];
  const candidates: WorkspaceMediaPathCandidate[] = [];

  switch (classification.kind) {
    case 'empty':
      diagnostics.push(createDiagnostic('missing-file', 'Media path is empty.'));
      return { classification, candidates, diagnostics };
    case 'remote-url':
      return { classification, candidates, diagnostics };
    case 'variable':
      addVariableCandidates(candidates, diagnostics, classification, context);
      break;
    case 'absolute-local':
      addCandidate(candidates, {
        path: normalizeSlashes(classification.source),
        reason: 'absolute-local',
      });
      break;
    case 'workspace-relative':
      addPortableCandidates(candidates, diagnostics, classification.source, context);
      break;
    default:
      assertNever(classification.kind);
  }

  if (candidates.length === 0) {
    diagnostics.push(
      createDiagnostic(
        'missing-context',
        'Media path could not be planned because no workspace or document context is available.',
      ),
    );
  }

  return { classification, candidates, diagnostics };
}

export function resolveWorkspaceMediaPath({
  source,
  context,
  fileExists,
  isPathAuthorized,
}: ResolveWorkspaceMediaPathInput): WorkspaceMediaPathResolution {
  const planned = createWorkspaceMediaPathCandidates(source, context);
  const diagnostics = [...planned.diagnostics];

  if (planned.classification.kind === 'remote-url') {
    return {
      status: 'remote',
      source,
      url: planned.classification.source,
      classification: planned.classification,
      diagnostics,
      candidates: planned.candidates,
    };
  }

  const existingCandidates = planned.candidates.filter((candidate) =>
    fileExists ? fileExists(candidate.path) : true,
  );

  if (existingCandidates.length > 1) {
    const firstPath = existingCandidates[0]?.path;
    diagnostics.push(
      createDiagnostic(
        'multi-root-ambiguity',
        `Multiple media path candidates exist; using ${firstPath ?? 'the first candidate'}.`,
        firstPath,
      ),
    );
  }

  const selected = existingCandidates[0];
  if (!selected) {
    diagnostics.push(
      createDiagnostic('missing-file', 'No existing local file matched the media path candidates.'),
    );
    return {
      status: 'unresolved',
      source,
      classification: planned.classification,
      diagnostics,
      candidates: planned.candidates,
    };
  }

  if (isPathAuthorized && !isPathAuthorized(selected.path)) {
    diagnostics.push(
      createDiagnostic(
        'unauthorized-path',
        'Resolved media path is outside authorized roots.',
        selected.path,
      ),
    );
    return {
      status: 'unauthorized',
      source,
      path: selected.path,
      classification: planned.classification,
      diagnostics,
      candidates: planned.candidates,
    };
  }

  return {
    status: 'resolved-local',
    source,
    path: selected.path,
    candidate: selected,
    classification: planned.classification,
    diagnostics,
    candidates: planned.candidates,
  };
}

export async function resolveWorkspaceMediaPathAsync({
  source,
  context,
  fileExists,
  isPathAuthorized,
}: ResolveWorkspaceMediaPathAsyncInput): Promise<WorkspaceMediaPathResolution> {
  const planned = createWorkspaceMediaPathCandidates(source, context);
  const diagnostics = [...planned.diagnostics];

  if (planned.classification.kind === 'remote-url') {
    return {
      status: 'remote',
      source,
      url: planned.classification.source,
      classification: planned.classification,
      diagnostics,
      candidates: planned.candidates,
    };
  }

  const existingCandidates: WorkspaceMediaPathCandidate[] = [];
  for (const candidate of planned.candidates) {
    if (await fileExists(candidate.path)) {
      existingCandidates.push(candidate);
    }
  }

  if (existingCandidates.length > 1) {
    const firstPath = existingCandidates[0]?.path;
    diagnostics.push(
      createDiagnostic(
        'multi-root-ambiguity',
        `Multiple media path candidates exist; using ${firstPath ?? 'the first candidate'}.`,
        firstPath,
      ),
    );
  }

  const selected = existingCandidates[0];
  if (!selected) {
    diagnostics.push(
      createDiagnostic('missing-file', 'No existing local file matched the media path candidates.'),
    );
    return {
      status: 'unresolved',
      source,
      classification: planned.classification,
      diagnostics,
      candidates: planned.candidates,
    };
  }

  if (isPathAuthorized && !(await isPathAuthorized(selected.path))) {
    diagnostics.push(
      createDiagnostic(
        'unauthorized-path',
        'Resolved media path is outside authorized roots.',
        selected.path,
      ),
    );
    return {
      status: 'unauthorized',
      source,
      path: selected.path,
      classification: planned.classification,
      diagnostics,
      candidates: planned.candidates,
    };
  }

  return {
    status: 'resolved-local',
    source,
    path: selected.path,
    candidate: selected,
    classification: planned.classification,
    diagnostics,
    candidates: planned.candidates,
  };
}

export function contractWorkspaceMediaPath(
  absoluteOrRemotePath: string,
  context: WorkspaceMediaPathContext,
): WorkspaceMediaPathContractionResult {
  const source = absoluteOrRemotePath.trim();
  const diagnostics: WorkspaceMediaPathDiagnostic[] = [];
  if (!source || isRemoteUrl(source)) {
    return { path: source, format: 'remote-url', diagnostics };
  }

  const normalizedSource = normalizeSlashes(source);
  const owningRoot = normalizeOptionalRoot(context.owningWorkspaceRoot);
  if (owningRoot && isPathInsideOrEqual(normalizedSource, owningRoot)) {
    return {
      path: toRelativePath(owningRoot, normalizedSource),
      format: 'workspace-relative',
      diagnostics,
    };
  }

  const variablePath = contractWithCustomVariable(normalizedSource, context.pathVariables);
  if (variablePath) {
    return { path: variablePath, format: 'variable', diagnostics };
  }

  return { path: normalizedSource, format: 'absolute-local', diagnostics };
}

export function isWorkspaceMediaPathResolvedLocal(
  result: WorkspaceMediaPathResolution,
): result is Extract<WorkspaceMediaPathResolution, { readonly status: 'resolved-local' }> {
  return result.status === 'resolved-local';
}

function addVariableCandidates(
  candidates: WorkspaceMediaPathCandidate[],
  diagnostics: WorkspaceMediaPathDiagnostic[],
  classification: WorkspaceMediaPathClassification,
  context: WorkspaceMediaPathContext,
): void {
  const variable = classification.variable;
  if (!variable) return;
  const rest = stripLeadingPathSeparator(classification.variableRest ?? '');

  if (WORKSPACE_VARIABLES.has(variable)) {
    addWorkspaceRootCandidates(candidates, rest, context, 'workspace-variable');
    return;
  }

  const variables = context.pathVariables;
  const basePath = variables?.get(variable);
  if (!basePath) {
    diagnostics.push(
      createDiagnostic(
        'unknown-variable',
        `Path variable ${variable} is not defined.`,
        classification.source,
        variable,
      ),
    );
    return;
  }

  addCandidate(candidates, {
    path: joinPath(basePath, rest),
    reason: 'custom-variable',
    root: normalizeSlashes(basePath),
  });
}

function addPortableCandidates(
  candidates: WorkspaceMediaPathCandidate[],
  diagnostics: WorkspaceMediaPathDiagnostic[],
  portablePath: string,
  context: WorkspaceMediaPathContext,
  reason: WorkspaceMediaPathCandidateReason = 'workspace-relative',
): void {
  const normalizedPortable = stripLeadingCurrentDir(normalizeSlashes(portablePath));
  addWorkspaceRootCandidates(candidates, normalizedPortable, context, reason);

  if (
    candidates.length === 0 &&
    !context.owningWorkspaceRoot &&
    (!context.workspaceRoots || context.workspaceRoots.length === 0)
  ) {
    diagnostics.push(
      createDiagnostic(
        'missing-context',
        'Workspace-relative media path has no owning workspace or document directory.',
      ),
    );
  }
}

function addWorkspaceRootCandidates(
  candidates: WorkspaceMediaPathCandidate[],
  relativePath: string,
  context: WorkspaceMediaPathContext,
  reason: WorkspaceMediaPathCandidateReason,
): void {
  for (const root of getOrderedWorkspaceRoots(context)) {
    addCandidate(candidates, {
      path: joinPath(root, relativePath),
      reason,
      root: normalizeSlashes(root),
    });
  }
}

function getOrderedWorkspaceRoots(context: WorkspaceMediaPathContext): string[] {
  const roots: string[] = [];
  if (context.owningWorkspaceRoot) roots.push(context.owningWorkspaceRoot);
  for (const root of context.workspaceRoots ?? []) {
    roots.push(root);
  }
  return uniqueNormalized(roots);
}

function addCandidate(
  candidates: WorkspaceMediaPathCandidate[],
  candidate: WorkspaceMediaPathCandidate,
): void {
  const normalized = normalizeSlashes(candidate.path);
  if (candidates.some((existing) => existing.path === normalized)) return;
  candidates.push({ ...candidate, path: normalized });
}

function createDiagnostic(
  code: WorkspaceMediaPathDiagnosticCode,
  message: string,
  path?: string,
  variable?: string,
): WorkspaceMediaPathDiagnostic {
  return {
    code,
    message,
    ...(path ? { path } : {}),
    ...(variable ? { variable } : {}),
  };
}

function readVariableReference(
  source: string,
): { readonly name: string; readonly rest: string } | undefined {
  const match = source.match(VARIABLE_PATTERN);
  if (!match) return undefined;
  return { name: match[1]!, rest: match[2] ?? '' };
}

function contractWithCustomVariable(
  absolutePath: string,
  variables: PathVariableMap | ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (!variables) return undefined;
  const customVariables = new Map<string, string>();
  for (const [variable, basePath] of variables.entries()) {
    if (WORKSPACE_VARIABLES.has(variable)) continue;
    customVariables.set(variable, normalizeSlashes(basePath));
  }
  const contracted = new PathResolver(customVariables).contract(absolutePath);
  return contracted === absolutePath ? undefined : contracted;
}

function normalizeOptionalRoot(root: string | undefined): string | undefined {
  if (!root) return undefined;
  return normalizeSlashes(root).replace(/\/$/, '');
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function joinPath(root: string, child: string): string {
  const normalizedRoot = normalizeSlashes(root).replace(/\/$/, '');
  const normalizedChild = normalizeSlashes(child);
  if (!normalizedChild || normalizedChild === '.') return normalizedRoot;
  return normalizePathSegments(`${normalizedRoot}/${normalizedChild}`);
}

function normalizePathSegments(input: string): string {
  const normalized = normalizeSlashes(input);
  const prefix = readPathPrefix(normalized);
  const rest = normalized.slice(prefix.length);
  const parts: string[] = [];
  for (const part of rest.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      const last = parts[parts.length - 1];
      if (last && last !== '..') {
        parts.pop();
      } else if (!prefix) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }
  return `${prefix}${parts.join('/')}` || '.';
}

function readPathPrefix(normalized: string): string {
  if (WINDOWS_DRIVE_PATTERN.test(normalized)) {
    return normalized.slice(0, 3);
  }
  if (normalized.startsWith('//')) return '//';
  if (normalized.startsWith('/')) return '/';
  return '';
}

function isRemoteUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

function isAbsoluteLocalPath(source: string): boolean {
  return (
    source.startsWith('/') || WINDOWS_DRIVE_PATTERN.test(source) || WINDOWS_UNC_PATTERN.test(source)
  );
}

function stripLeadingPathSeparator(source: string): string {
  return normalizeSlashes(source).replace(/^\/+/, '');
}

function stripLeadingCurrentDir(source: string): string {
  return source.replace(/^\.\//, '');
}

function uniqueNormalized(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of paths) {
    const normalized = normalizeOptionalRoot(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const candidate = normalizePathSegments(candidatePath);
  const root = normalizePathSegments(rootPath).replace(/\/$/, '');
  return candidate === root || candidate.startsWith(`${root}/`);
}

function toRelativePath(rootPath: string, candidatePath: string): string {
  const rootParts = normalizePathSegments(rootPath).replace(/\/$/, '').split('/');
  const candidateParts = normalizePathSegments(candidatePath).split('/');
  while (rootParts.length > 0 && rootParts[0] === '') rootParts.shift();
  while (candidateParts.length > 0 && candidateParts[0] === '') candidateParts.shift();
  let common = 0;
  while (
    common < rootParts.length &&
    common < candidateParts.length &&
    rootParts[common] === candidateParts[common]
  ) {
    common += 1;
  }
  const up = rootParts.slice(common).map(() => '..');
  const down = candidateParts.slice(common);
  const relative = [...up, ...down].join('/');
  return relative || '.';
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace media path kind: ${String(value)}`);
}
