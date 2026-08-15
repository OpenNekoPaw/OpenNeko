export type ResourceBrowserProjectStorageOwner = 'project-facts' | 'project-local-state';

export interface ResourceBrowserProjectStorageMutationDiagnostic {
  readonly code: 'package-owned-project-storage';
  readonly owner: ResourceBrowserProjectStorageOwner;
  readonly path: string;
}

export function inspectResourceBrowserProjectStorageMutation(
  workspacePath: string,
): ResourceBrowserProjectStorageMutationDiagnostic | undefined {
  if (!isNormalizedWorkspaceMutationPath(workspacePath)) return undefined;
  const normalized = workspacePath;
  const root = normalized.split('/')[0]?.toLocaleLowerCase('en-US');
  if (root === 'neko') {
    return { code: 'package-owned-project-storage', owner: 'project-facts', path: normalized };
  }
  if (root === '.neko') {
    return {
      code: 'package-owned-project-storage',
      owner: 'project-local-state',
      path: normalized,
    };
  }
  return undefined;
}

function isNormalizedWorkspaceMutationPath(value: string): boolean {
  if (
    !value ||
    value !== value.normalize('NFC') ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('${') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
  ) {
    return false;
  }
  return value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

export function assertResourceBrowserProjectStorageMutable(workspacePath: string): void {
  const diagnostic = inspectResourceBrowserProjectStorageMutation(workspacePath);
  if (!diagnostic) return;
  throw new Error(
    `Resource Browser cannot mutate ${diagnostic.owner} through generic file operations.`,
  );
}
