export const PROJECT_FACTS_ROOT_NAME = 'neko';
export const PROJECT_LOCAL_ROOT_NAME = '.neko';

export type ProjectPortableOperation = 'sync' | 'package' | 'enumerate';
export type ProjectTraversalEntryKind = 'file' | 'directory' | 'symbolic-link';

export type ProjectTraversalDecision =
  | {
      readonly action: 'exclude-project-local';
      readonly relativePath: string;
      readonly traverse: false;
      readonly followSymbolicLink: false;
    }
  | {
      readonly action: 'visit';
      readonly relativePath: string;
      readonly traverse: boolean;
      readonly followSymbolicLink: false;
    };

function normalizeProjectRelativePath(value: string): string {
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    throw new TypeError(`Project storage path must be relative: ${value}`);
  }

  const normalized = value.replace(/\\/g, '/').replace(/\/+$/g, '');
  if (normalized === '') return normalized;

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new TypeError(`Project storage path contains an invalid segment: ${value}`);
  }
  return normalized;
}

/**
 * Produces the common traversal decision used by product sync, portable packaging, and project
 * enumeration. The lexical root check happens before entry-kind handling, so a `.neko` directory or
 * symlink is excluded without opening or following it. Git ignore state is intentionally not an input.
 */
export function decideProjectTraversal(
  relativePath: string,
  entryKind: ProjectTraversalEntryKind,
  _operation: ProjectPortableOperation,
): ProjectTraversalDecision {
  const normalized = normalizeProjectRelativePath(relativePath);
  const rootSegment = normalized.split('/')[0]?.toLocaleLowerCase('en-US');

  if (rootSegment === PROJECT_LOCAL_ROOT_NAME) {
    return {
      action: 'exclude-project-local',
      relativePath: normalized,
      traverse: false,
      followSymbolicLink: false,
    };
  }

  return {
    action: 'visit',
    relativePath: normalized,
    traverse: entryKind === 'directory',
    followSymbolicLink: false,
  };
}

export function assertProjectPortablePath(relativePath: string): string {
  const decision = decideProjectTraversal(relativePath, 'file', 'package');
  if (decision.action === 'exclude-project-local') {
    throw new TypeError(
      `Project-local path cannot enter synchronized or packaged output: ${relativePath}`,
    );
  }
  return decision.relativePath;
}
