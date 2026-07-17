export type ProjectFileDiagnosticCode =
  | 'invalid-json'
  | 'invalid-format'
  | 'invalid-document'
  | 'unsupported-version'
  | 'migration-failed'
  | 'missing-source'
  | 'unresolved-variable'
  | 'unauthorized-root'
  | 'multi-root-ambiguity'
  | 'non-portable-path'
  | 'runtime-handle-persisted'
  | 'cache-source-persisted'
  | 'add-source-timeout'
  | 'add-source-cancelled'
  | 'add-source-failed'
  | 'wrong-domain-field'
  | 'write-conflict'
  | 'backup-failed'
  | 'read-failed'
  | 'write-failed'
  | 'codec-save-failed';

export type ProjectFileDiagnosticSeverity = 'info' | 'warning' | 'error';

export type ProjectFileDiagnosticRecoverability =
  'retry' | 'relink' | 'create-asset' | 'configure' | 'readonly' | 'manual' | 'none';

export type ProjectFileDiagnosticValue =
  | string
  | number
  | boolean
  | null
  | readonly ProjectFileDiagnosticValue[]
  | { readonly [key: string]: ProjectFileDiagnosticValue };

export interface ProjectFileDiagnostic {
  readonly code: ProjectFileDiagnosticCode;
  readonly severity: ProjectFileDiagnosticSeverity;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly recoverability?: ProjectFileDiagnosticRecoverability;
  readonly sourceId?: string;
  readonly context?: Record<string, ProjectFileDiagnosticValue>;
}

export interface ProjectFileDiagnosticInput {
  readonly code: ProjectFileDiagnosticCode;
  readonly severity?: ProjectFileDiagnosticSeverity;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly recoverability?: ProjectFileDiagnosticRecoverability;
  readonly sourceId?: string;
  readonly context?: Record<string, ProjectFileDiagnosticValue>;
}

export function createProjectFileDiagnostic(
  input: ProjectFileDiagnosticInput,
): ProjectFileDiagnostic {
  return {
    code: input.code,
    severity: input.severity ?? 'error',
    message: input.message,
    ...(input.path ? { path: [...input.path] } : {}),
    ...(input.recoverability ? { recoverability: input.recoverability } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.context ? { context: input.context } : {}),
  };
}

export function hasProjectFileErrors(diagnostics: readonly ProjectFileDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
