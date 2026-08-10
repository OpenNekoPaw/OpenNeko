import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const MAX_PACKAGE_FILES = 2_048;
const MAX_PACKAGE_BYTES = 100_000_000;

export async function calculateExtensionPackageTreeSha256(pluginRoot: string): Promise<string> {
  const rootInfo = await lstat(pluginRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('OpenNeko extension package root is invalid.');
  }
  const canonicalRoot = await realpath(pluginRoot);
  const entries: Array<{
    readonly kind: 'directory' | 'file';
    readonly relativePath: string;
    readonly absolutePath: string;
    readonly executableMode: number;
    readonly size: number;
  }> = [];
  const pending = [{ absolutePath: canonicalRoot, relativePath: '' }];
  let byteCount = 0;

  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) throw new Error('OpenNeko extension package traversal failed.');
    const children = (await readdir(directory.absolutePath, { withFileTypes: true })).sort(
      (left, right) => comparePathSegments(left.name, right.name),
    );
    for (const child of children) {
      const absolutePath = resolve(directory.absolutePath, child.name);
      const relativePath = directory.relativePath
        ? `${directory.relativePath}/${child.name}`
        : child.name;
      if (!isInsideOrEqual(canonicalRoot, absolutePath) || child.isSymbolicLink()) {
        throw new Error('OpenNeko extension package contains an unsafe path.');
      }
      const [canonicalPath, info] = await Promise.all([
        realpath(absolutePath),
        lstat(absolutePath),
      ]);
      if (
        canonicalPath !== absolutePath ||
        !isInsideOrEqual(canonicalRoot, canonicalPath) ||
        info.isSymbolicLink()
      ) {
        throw new Error('OpenNeko extension package contains an unsafe path.');
      }
      if (entries.length >= MAX_PACKAGE_FILES) {
        throw new Error('OpenNeko extension package contains too many files.');
      }
      if (info.isDirectory()) {
        entries.push({
          kind: 'directory',
          relativePath,
          absolutePath: canonicalPath,
          executableMode: 0,
          size: 0,
        });
        pending.push({ absolutePath: canonicalPath, relativePath });
        continue;
      }
      if (!info.isFile()) {
        throw new Error('OpenNeko extension package contains an unsupported file type.');
      }
      byteCount += info.size;
      if (byteCount > MAX_PACKAGE_BYTES) {
        throw new Error('OpenNeko extension package is too large.');
      }
      entries.push({
        kind: 'file',
        relativePath,
        absolutePath: canonicalPath,
        executableMode: info.mode & 0o111,
        size: info.size,
      });
    }
  }

  entries.sort((left, right) => comparePathSegments(left.relativePath, right.relativePath));
  const hash = createHash('sha256');
  for (const entry of entries) {
    hash
      .update(entry.kind)
      .update('\0')
      .update(entry.relativePath)
      .update('\0')
      .update(String(entry.executableMode))
      .update('\0')
      .update(String(entry.size))
      .update('\0');
    if (entry.kind === 'file') {
      const bytes = await readFile(entry.absolutePath);
      const currentInfo = await lstat(entry.absolutePath);
      if (
        !currentInfo.isFile() ||
        currentInfo.isSymbolicLink() ||
        currentInfo.size !== entry.size ||
        (currentInfo.mode & 0o111) !== entry.executableMode ||
        bytes.byteLength !== entry.size
      ) {
        throw new Error('OpenNeko extension package changed during integrity inspection.');
      }
      hash.update(bytes);
    }
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function comparePathSegments(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isInsideOrEqual(root: string, target: string): boolean {
  const pathFromRoot = relative(resolve(root), resolve(target));
  return (
    pathFromRoot === '' ||
    (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
}
