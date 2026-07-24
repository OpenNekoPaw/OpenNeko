export const WORKSPACE_MEDIA_LIBRARY_DIRECTORY = 'neko/assets' as const;

export type WorkspaceLinkedMediaLibraryAvailability = 'available' | 'unavailable';

export type WorkspaceLinkedMediaLibraryDiagnosticCode =
  | 'invalid-library-name'
  | 'library-name-conflict'
  | 'library-link-broken'
  | 'library-link-loop'
  | 'library-target-unavailable'
  | 'library-target-not-directory'
  | 'library-permission-denied'
  | 'library-entry-not-link'
  | 'library-link-operation-failed'
  | 'unmanaged-symlink'
  | 'nested-link-escape'
  | 'migration-required';

export interface WorkspaceLinkedMediaLibraryDiagnostic {
  readonly code: WorkspaceLinkedMediaLibraryDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly libraryName?: string;
  readonly workspacePath?: string;
}

/** Runtime projection derived from a direct child of `neko/assets/`. */
export interface WorkspaceLinkedMediaLibrary {
  readonly name: string;
  readonly workspacePath: string;
  readonly availability: WorkspaceLinkedMediaLibraryAvailability;
  readonly diagnostic?: WorkspaceLinkedMediaLibraryDiagnostic;
}

export interface CreateWorkspaceLinkedMediaLibraryInput {
  readonly workspaceRoot: string;
  readonly name: string;
  readonly targetDirectory: string;
}

export interface ReplaceWorkspaceLinkedMediaLibraryInput extends CreateWorkspaceLinkedMediaLibraryInput {}

export interface RemoveWorkspaceLinkedMediaLibraryInput {
  readonly workspaceRoot: string;
  readonly name: string;
}

export interface WorkspaceLinkedMediaLibraryMutationResult {
  readonly library: WorkspaceLinkedMediaLibrary;
}

export function workspaceLinkedMediaLibraryPath(name: string): string {
  assertWorkspaceLinkedMediaLibraryName(name);
  return `${WORKSPACE_MEDIA_LIBRARY_DIRECTORY}/${name}`;
}

export function validateWorkspaceLinkedMediaLibraryName(
  value: string,
): WorkspaceLinkedMediaLibraryDiagnostic | undefined {
  const normalized = value.normalize('NFC');
  const lower = normalized.toLocaleLowerCase('en-US');
  if (
    normalized !== value ||
    normalized.length === 0 ||
    normalized.length > 100 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('.') ||
    /[\\/:*?"<>|\u0000-\u001f]/u.test(normalized) ||
    /[. ]$/u.test(normalized) ||
    lower === 'library.json' ||
    isWindowsReservedSegment(lower)
  ) {
    return {
      code: 'invalid-library-name',
      severity: 'error',
      message: 'Media library name must be one portable directory segment.',
    };
  }
  return undefined;
}

export function assertWorkspaceLinkedMediaLibraryName(value: string): void {
  const diagnostic = validateWorkspaceLinkedMediaLibraryName(value);
  if (diagnostic) throw new Error(diagnostic.message);
}

function isWindowsReservedSegment(lower: string): boolean {
  const stem = lower.split('.')[0] ?? lower;
  return (
    stem === 'con' ||
    stem === 'prn' ||
    stem === 'aux' ||
    stem === 'nul' ||
    /^com[1-9]$/u.test(stem) ||
    /^lpt[1-9]$/u.test(stem)
  );
}
