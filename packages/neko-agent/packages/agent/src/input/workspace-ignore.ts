export interface WorkspaceFileIgnoreRules {
  readonly gitignoreRules?: readonly string[];
  readonly managedDirectorySegments?: readonly string[];
}

export interface WorkspaceFileIgnoreDecision {
  readonly ignored: boolean;
  readonly reason?: WorkspaceFileIgnoreReason;
  readonly rule?: string;
}

export type WorkspaceFileIgnoreReason = 'managed-directory' | 'gitignore';

export function createWorkspaceFileIgnoreRules(
  input: WorkspaceFileIgnoreRules = {},
): WorkspaceFileIgnoreRules {
  return {
    ...(input.gitignoreRules ? { gitignoreRules: [...input.gitignoreRules] } : {}),
    ...(input.managedDirectorySegments
      ? { managedDirectorySegments: [...input.managedDirectorySegments] }
      : {}),
  };
}

export function shouldIgnoreWorkspaceFile(
  filePath: string,
  rules: WorkspaceFileIgnoreRules = {},
): WorkspaceFileIgnoreDecision {
  const normalizedPath = normalizeRelativePath(filePath);
  if (!normalizedPath) return { ignored: false };

  if (matchesManagedDirectoryRule(normalizedPath, rules.managedDirectorySegments)) {
    return { ignored: true, reason: 'managed-directory' };
  }

  for (const rule of rules.gitignoreRules ?? []) {
    if (matchesGitignoreRule(normalizedPath, rule)) {
      return { ignored: true, reason: 'gitignore', rule };
    }
  }

  return { ignored: false };
}

export function parseGitignoreRules(content: string): readonly string[] {
  // This is a conservative Agent visibility filter, not a full gitignore interpreter:
  // negation rules do not re-authorize paths that another rule or managed dir hides.
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('!'));
}

export function matchesGitignoreRules(filePath: string, rules: readonly string[]): boolean {
  const normalizedPath = normalizeRelativePath(filePath);
  return rules.some((rule) => matchesGitignoreRule(normalizedPath, rule));
}

export function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

const DEFAULT_WORKSPACE_MANAGED_DIRECTORY_SEGMENTS = [
  '.neko',
  '.neko/.cache',
  '.neko/.runtime',
  '.neko/logs',
  '.neko/tmp',
  '.neko/drafts',
  '.neko/plans',
  '.neko/tasks',
  '.cache',
] as const;

function matchesGitignoreRule(filePath: string, rawRule: string): boolean {
  const directoryOnly = rawRule.endsWith('/');
  const anchored = rawRule.startsWith('/');
  const normalizedRule = normalizeRelativePath(rawRule.replace(/^\/+/, '').replace(/\/+$/, ''));
  if (!normalizedRule) {
    return false;
  }

  if (directoryOnly) {
    return matchesDirectoryRule(filePath, normalizedRule, anchored);
  }

  if (!normalizedRule.includes('/') && !hasGlobSyntax(normalizedRule)) {
    return filePath.split('/').includes(normalizedRule);
  }

  return globToRegExp(normalizedRule, anchored).test(filePath);
}

function matchesManagedDirectoryRule(
  filePath: string,
  configuredRules: readonly string[] | undefined,
): boolean {
  const rules = configuredRules ?? DEFAULT_WORKSPACE_MANAGED_DIRECTORY_SEGMENTS;
  for (const rawRule of rules) {
    const rule = normalizeRelativePath(rawRule).replace(/\/+$/, '');
    if (!rule) continue;
    if (rule.includes('/')) {
      if (matchesDirectoryRule(filePath, rule, false)) {
        return true;
      }
      continue;
    }
    if (filePath.split('/').includes(rule)) {
      return true;
    }
  }
  return false;
}

function matchesDirectoryRule(filePath: string, rule: string, anchored: boolean): boolean {
  if (anchored) {
    return filePath === rule || filePath.startsWith(`${rule}/`);
  }

  const segments = filePath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    const suffix = segments.slice(index).join('/');
    if (suffix === rule || suffix.startsWith(`${rule}/`)) {
      return true;
    }
  }
  return false;
}

function globToRegExp(pattern: string, anchored: boolean): RegExp {
  const prefix = anchored ? '^' : '(^|.*/)';
  return new RegExp(`${prefix}${globSegmentToRegExp(pattern)}($|/.*)`);
}

function globSegmentToRegExp(pattern: string): string {
  return pattern
    .split('')
    .map((char) => {
      if (char === '*') return '[^/]*';
      if (char === '?') return '[^/]';
      return escapeRegExp(char);
    })
    .join('');
}

function hasGlobSyntax(value: string): boolean {
  return value.includes('*') || value.includes('?');
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}
