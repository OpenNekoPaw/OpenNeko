import { link, lstat, realpath, unlink } from 'node:fs/promises';
import * as path from 'node:path';

export interface GlobalLibraryFileMoveSource {
  readonly itemId: string;
  readonly absolutePath: string;
}

export interface GlobalLibraryFileMoveCommitEntry extends GlobalLibraryFileMoveSource {
  readonly destinationPath: string;
}

export async function moveGlobalLibraryFiles(input: {
  readonly allowedRoot: string;
  readonly destinationDirectory: string;
  readonly sources: readonly GlobalLibraryFileMoveSource[];
  readonly commit?: (entries: readonly GlobalLibraryFileMoveCommitEntry[]) => Promise<void>;
}): Promise<void> {
  if (input.sources.length === 0) {
    throw new Error('Asset Center file move requires at least one item.');
  }
  const itemIds = new Set<string>();
  const targetNames = new Set<string>();
  const [allowedRoot, destinationDirectory, destinationStat] = await Promise.all([
    realpath(input.allowedRoot),
    realpath(input.destinationDirectory),
    lstat(input.destinationDirectory),
  ]);
  if (!destinationStat.isDirectory() || !isWithinRoot(destinationDirectory, allowedRoot, true)) {
    throw new Error('Asset Center move destination is outside the authorized owner root.');
  }
  const plan: GlobalLibraryFileMoveCommitEntry[] = [];
  for (const source of input.sources) {
    if (itemIds.has(source.itemId)) {
      throw new Error(`Asset Center move contains duplicate item '${source.itemId}'.`);
    }
    const [absolutePath, sourceStat] = await Promise.all([
      realpath(source.absolutePath),
      lstat(source.absolutePath),
    ]);
    if (
      !sourceStat.isFile() ||
      sourceStat.isSymbolicLink() ||
      !isWithinRoot(absolutePath, allowedRoot, false)
    ) {
      throw new Error(`Asset Center move item '${source.itemId}' is not an authorized file.`);
    }
    const fileName = path.basename(absolutePath);
    if (targetNames.has(fileName)) {
      throw new Error(`Asset Center move target name '${fileName}' is duplicated.`);
    }
    const destinationPath = path.join(destinationDirectory, fileName);
    if (destinationPath === absolutePath) {
      throw new Error(`Asset Center move item '${source.itemId}' is already in that directory.`);
    }
    await requireMissingTarget(destinationPath, source.itemId);
    itemIds.add(source.itemId);
    targetNames.add(fileName);
    plan.push({ itemId: source.itemId, absolutePath, destinationPath });
  }

  const executed: Array<{
    readonly entry: GlobalLibraryFileMoveCommitEntry;
    sourceRemoved: boolean;
  }> = [];
  try {
    for (const entry of plan) {
      try {
        await link(entry.absolutePath, entry.destinationPath);
        const execution = { entry, sourceRemoved: false };
        executed.push(execution);
        await unlink(entry.absolutePath);
        execution.sourceRemoved = true;
      } catch {
        throw new Error(`Asset Center could not move item '${entry.itemId}'.`);
      }
    }
    await input.commit?.(plan);
  } catch (error: unknown) {
    const rollbackFailures: string[] = [];
    for (const execution of [...executed].reverse()) {
      const { entry } = execution;
      try {
        if (execution.sourceRemoved) {
          await link(entry.destinationPath, entry.absolutePath);
        }
        await unlink(entry.destinationPath);
      } catch {
        rollbackFailures.push(entry.itemId);
      }
    }
    if (rollbackFailures.length > 0) {
      throw new Error(
        `Asset Center move failed and rollback could not restore: ${rollbackFailures.join(', ')}.`,
      );
    }
    throw error;
  }
}

function isWithinRoot(candidate: string, root: string, allowRoot: boolean): boolean {
  const relative = path.relative(root, candidate);
  if (relative === '') return allowRoot;
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function requireMissingTarget(targetPath: string, itemId: string): Promise<void> {
  try {
    await lstat(targetPath);
  } catch (error: unknown) {
    if (readErrorCode(error) === 'ENOENT') return;
    throw new Error(`Asset Center could not inspect the target for item '${itemId}'.`);
  }
  throw new Error(`Asset Center move target already exists for item '${itemId}'.`);
}

function readErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(Reflect.get(error, 'code'))
    : undefined;
}
