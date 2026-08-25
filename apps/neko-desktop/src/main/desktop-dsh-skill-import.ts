import { copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

import type { DesktopDshAgentClient } from './desktop-dsh-agent-runtime';

export async function importPersonalDshSkill(options: {
  readonly selectedDirectory: string;
  readonly personalSkillRoot: string;
  readonly disabledSkillRoot: string;
  readonly bridge: Pick<DesktopDshAgentClient, 'validateStagedSkill'>;
}): Promise<string> {
  if (
    !isAbsolute(options.selectedDirectory) ||
    !isAbsolute(options.personalSkillRoot) ||
    !isAbsolute(options.disabledSkillRoot)
  ) {
    throw new Error('DSH Skill import paths must be absolute.');
  }
  const selectedDirectory = await realpath(options.selectedDirectory);
  const selectedStats = await lstat(selectedDirectory);
  if (!selectedStats.isDirectory() || selectedStats.isSymbolicLink()) {
    throw new Error('Selected DSH Skill must be a real directory.');
  }

  const stagingParent = dirname(options.personalSkillRoot);
  await mkdir(stagingParent, { recursive: true });
  const stagingRoot = await mkdtemp(join(stagingParent, '.openneko-skill-import-'));
  const candidateRoot = join(stagingRoot, 'candidate');
  try {
    await copyRealTree(selectedDirectory, candidateRoot, stagingRoot);
    const validated = await options.bridge.validateStagedSkill({
      stagingRoot,
      layout: 'directory',
      entry: 'candidate/SKILL.md',
    });
    await mkdir(options.personalSkillRoot, { recursive: true });
    const destination = join(options.personalSkillRoot, validated.name);
    assertContained(options.personalSkillRoot, destination);
    await requireSkillNameAvailable(
      options.personalSkillRoot,
      options.disabledSkillRoot,
      validated.name,
    );
    await rename(candidateRoot, destination);
    return validated.name;
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

async function copyRealTree(source: string, destination: string, boundary: string): Promise<void> {
  const stats = await lstat(source);
  if (stats.isSymbolicLink()) throw new Error('DSH Skill imports cannot contain symbolic links.');
  if (stats.isDirectory()) {
    await mkdir(destination, { recursive: false });
    for (const entry of await readdir(source)) {
      const sourceChild = join(source, entry);
      const destinationChild = join(destination, entry);
      assertContained(boundary, destinationChild);
      await copyRealTree(sourceChild, destinationChild, boundary);
    }
    return;
  }
  if (!stats.isFile()) throw new Error('DSH Skill imports may contain only files and directories.');
  await copyFile(source, destination);
}

function assertContained(root: string, target: string): void {
  const child = relative(root, target);
  if (child.length === 0 || child.startsWith('..') || isAbsolute(child)) {
    throw new Error('DSH Skill import escaped its authorized staging root.');
  }
}

async function requireSkillNameAvailable(
  personalSkillRoot: string,
  disabledSkillRoot: string,
  name: string,
): Promise<void> {
  for (const root of [personalSkillRoot, disabledSkillRoot]) {
    for (const entry of [name, `${name}.md`]) {
      try {
        await lstat(join(root, entry));
      } catch (error) {
        if (hasNodeErrorCode(error, 'ENOENT')) continue;
        throw error;
      }
      throw new Error(`Personal Skill '${name}' is already installed.`);
    }
  }
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
