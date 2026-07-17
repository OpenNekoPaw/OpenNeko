import * as os from 'node:os';
import * as path from 'node:path';

export interface RootPathAccessDecision {
  readonly allowed: boolean;
  readonly reason?: 'forbidden-unmanaged-path' | 'outside-authorized-roots';
}

export function authorizePathInsideRoots(
  filePath: string,
  roots: readonly string[],
): RootPathAccessDecision {
  if (isForbiddenUnmanagedPath(filePath)) {
    return { allowed: false, reason: 'forbidden-unmanaged-path' };
  }
  if (!roots.some((root) => isPathInsideRoot(filePath, root))) {
    return { allowed: false, reason: 'outside-authorized-roots' };
  }
  return { allowed: true };
}

export function normalizeAccessRoots(roots: readonly string[]): readonly string[] {
  return roots.map((root) => path.resolve(root));
}

export function isPathInsideRoot(filePath: string, root: string): boolean {
  const normalizedPath = path.normalize(filePath);
  const normalizedRoot = path.normalize(root);
  return (
    normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

export function isForbiddenUnmanagedPath(filePath: string): boolean {
  const normalized = path.normalize(filePath).replace(/\\/g, '/');
  const home = os.homedir();
  const homeDownloads = home ? path.join(home, 'Downloads').replace(/\\/g, '/') : undefined;
  const homeDesktop = home ? path.join(home, 'Desktop').replace(/\\/g, '/') : undefined;

  return (
    normalized === '/tmp' ||
    normalized.startsWith('/tmp/') ||
    normalized === '/private/tmp' ||
    normalized.startsWith('/private/tmp/') ||
    normalized === '/var/tmp' ||
    normalized.startsWith('/var/tmp/') ||
    normalized === '/private/var/tmp' ||
    normalized.startsWith('/private/var/tmp/') ||
    /^\/(?:private\/)?var\/folders\/[^/]+\/[^/]+(?:\/[^/]+)?\/T(?:\/|$)/.test(normalized) ||
    normalized.startsWith('/dev/shm/') ||
    /\/AppData\/Local\/Temp(?:\/|$)/i.test(normalized) ||
    matchesUserSpecialDir(normalized, homeDownloads) ||
    matchesUserSpecialDir(normalized, homeDesktop)
  );
}

function matchesUserSpecialDir(filePath: string, root: string | undefined): boolean {
  if (!root) return false;
  return filePath === root || filePath.startsWith(`${root}/`);
}
