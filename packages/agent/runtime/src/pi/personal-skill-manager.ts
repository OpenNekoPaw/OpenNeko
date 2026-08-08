import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readdir, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { createNodePiSkillHost, type SkillHostRecord } from './skill-host';

const MAX_SKILL_FILES = 2_000;
const MAX_SKILL_BYTES = 20_000_000;

export interface PersonalSkillManager {
  install(
    windowId: string,
  ): Promise<
    { readonly status: 'cancelled' } | { readonly status: 'installed'; readonly name: string }
  >;
  remove(
    managementId: string,
    records: readonly SkillHostRecord[],
  ): Promise<{ readonly name: string }>;
  resolveManagementId(record: SkillHostRecord): Promise<string | undefined>;
}

export function createPersonalSkillManager(options: {
  readonly personalSkillRoot: string;
  readonly selectDirectory: (windowId: string) => Promise<string | undefined>;
  readonly trashItem: (absolutePath: string) => Promise<void>;
}): PersonalSkillManager {
  return new DefaultPersonalSkillManager(options);
}

class DefaultPersonalSkillManager implements PersonalSkillManager {
  private readonly personalSkillRoot: string;

  constructor(
    private readonly options: {
      readonly personalSkillRoot: string;
      readonly selectDirectory: (windowId: string) => Promise<string | undefined>;
      readonly trashItem: (absolutePath: string) => Promise<void>;
    },
  ) {
    if (!isAbsolute(options.personalSkillRoot)) {
      throw new Error('Personal Skill root must be absolute.');
    }
    this.personalSkillRoot = resolve(options.personalSkillRoot);
  }

  async install(
    windowId: string,
  ): Promise<
    { readonly status: 'cancelled' } | { readonly status: 'installed'; readonly name: string }
  > {
    if (windowId.trim().length === 0) throw new Error('Desktop Window id is required.');
    const selected = await this.options.selectDirectory(windowId);
    if (selected === undefined) return { status: 'cancelled' };
    if (!isAbsolute(selected)) throw new Error('Selected Skill directory must be absolute.');
    const sourceRoot = await requireContainedDirectory(selected);
    await mkdir(dirname(this.personalSkillRoot), { recursive: true });
    const stagingRoot = join(
      dirname(this.personalSkillRoot),
      `.openneko-skill-staging-${randomUUID()}`,
    );
    const stagedPackage = join(stagingRoot, basename(sourceRoot));
    try {
      await mkdir(stagingRoot, { recursive: false });
      await cp(sourceRoot, stagedPackage, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
      });
      await validatePackageTree(stagedPackage);
      const snapshot = await createNodePiSkillHost({
        cwd: stagingRoot,
        policy: {
          isTrusted: () => true,
          isEnabled: () => true,
        },
      }).discover([{ path: stagingRoot, source: { kind: 'personal' }, entryPointKind: 'skill' }]);
      if (
        snapshot.records.length !== 1 ||
        snapshot.diagnostics.length > 0 ||
        snapshot.warnings.length > 0
      ) {
        throw new Error('Selected directory must contain exactly one valid Skill package.');
      }
      const record = snapshot.records[0];
      if (!record || !isSafeSkillDirectoryName(record.name)) {
        throw new Error('Selected Skill has an invalid package name.');
      }
      await mkdir(this.personalSkillRoot, { recursive: true });
      const canonicalPersonalRoot = await requireRegularDirectory(this.personalSkillRoot);
      const target = join(canonicalPersonalRoot, record.name);
      try {
        await lstat(target);
        throw new Error(`Personal Skill '${record.name}' is already installed.`);
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
      }
      await rename(stagedPackage, target);
      return { status: 'installed', name: record.name };
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }

  async remove(
    managementId: string,
    records: readonly SkillHostRecord[],
  ): Promise<{ readonly name: string }> {
    requireManagementId(managementId);
    const candidates = records.filter(
      (record) =>
        record.source.kind === 'personal' &&
        createPersonalSkillManagementId(record) === managementId,
    );
    if (candidates.length !== 1) {
      throw new Error('Personal Skill management identity is stale or unknown.');
    }
    const record = candidates[0];
    if (!record) throw new Error('Personal Skill management identity is stale or unknown.');
    const target = await this.resolveManagedDirectory(record);
    if (!target) throw new Error('Personal Skill package is not safely removable.');
    await this.options.trashItem(target);
    return { name: record.name };
  }

  async resolveManagementId(record: SkillHostRecord): Promise<string | undefined> {
    if (record.source.kind !== 'personal') return undefined;
    return (await this.resolveManagedDirectory(record))
      ? createPersonalSkillManagementId(record)
      : undefined;
  }

  private async resolveManagedDirectory(record: SkillHostRecord): Promise<string | undefined> {
    if (!isSafeSkillDirectoryName(record.name)) return undefined;
    const configured = join(this.personalSkillRoot, record.name);
    try {
      const [canonicalRoot, canonicalTarget, info, rootInfo] = await Promise.all([
        realpath(this.personalSkillRoot),
        realpath(configured),
        lstat(configured),
        lstat(this.personalSkillRoot),
      ]);
      if (
        rootInfo.isSymbolicLink() ||
        !rootInfo.isDirectory() ||
        !isInside(canonicalRoot, canonicalTarget) ||
        !info.isDirectory() ||
        info.isSymbolicLink()
      ) {
        return undefined;
      }
      return canonicalTarget;
    } catch {
      return undefined;
    }
  }
}

export function createPersonalSkillManagementId(
  record: Pick<SkillHostRecord, 'name' | 'fingerprint' | 'source'>,
): string {
  if (record.source.kind !== 'personal') {
    throw new Error('Only personal Skills have a management identity.');
  }
  return `skill:${createHash('sha256')
    .update(`${record.name}\0${record.fingerprint}`)
    .digest('hex')}`;
}

async function requireContainedDirectory(path: string): Promise<string> {
  const [canonical, info] = await Promise.all([realpath(path), lstat(path)]);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Selected Skill package must be a regular directory.');
  }
  return canonical;
}

async function requireRegularDirectory(path: string): Promise<string> {
  const [canonical, info] = await Promise.all([realpath(path), lstat(path)]);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Personal Skill root must be a regular directory.');
  }
  return canonical;
}

async function validatePackageTree(root: string): Promise<void> {
  let fileCount = 0;
  let totalBytes = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error('Skill packages cannot contain symbolic links.');
      if (info.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!info.isFile()) throw new Error('Skill packages can contain only files and directories.');
      fileCount += 1;
      totalBytes += info.size;
      if (fileCount > MAX_SKILL_FILES || totalBytes > MAX_SKILL_BYTES) {
        throw new Error('Skill package exceeds the supported size limit.');
      }
    }
  }
}

function requireManagementId(value: string): void {
  if (!/^skill:[0-9a-f]{64}$/u.test(value)) {
    throw new Error('Personal Skill management identity is invalid.');
  }
}

function isSafeSkillDirectoryName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value) && value !== '.' && value !== '..';
}

function isInside(root: string, target: string): boolean {
  const fromRoot = relative(resolve(root), resolve(target));
  return fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
