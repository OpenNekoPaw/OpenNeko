export const DEFAULT_MENTION_EXCLUDED_DIRECTORIES = [
  'node_modules',
  '.git',
  '.neko',
  '.cache',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
] as const;

export const DEFAULT_MENTION_EXCLUDE_GLOB = `**/{${DEFAULT_MENTION_EXCLUDED_DIRECTORIES.join(',')}}/**`;

export function isMentionExcludedPath(
  filePath: string,
  excludedDirectories: readonly string[] = DEFAULT_MENTION_EXCLUDED_DIRECTORIES,
): boolean {
  const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.some((segment) => excludedDirectories.includes(segment));
}
