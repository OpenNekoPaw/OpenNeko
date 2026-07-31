import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  createGlobalLibraryOpaqueId,
  type GlobalAssetImportOutcome,
} from 'neko-assets/global-library/contract';
import { isSupportedDesktopGlobalAssetPath } from './desktop-resource-browser-source';

export async function importDesktopGlobalAssetFiles(input: {
  readonly globalAssetRoot: string;
  readonly sourcePaths: readonly string[];
}): Promise<readonly GlobalAssetImportOutcome[]> {
  await fs.mkdir(input.globalAssetRoot, { recursive: true });
  const operationRoot = path.join(input.globalAssetRoot, '.imports', randomUUID());
  await fs.mkdir(operationRoot, { recursive: true });
  try {
    const outcomes: GlobalAssetImportOutcome[] = [];
    for (const sourcePath of input.sourcePaths) {
      outcomes.push(await importAssetFile(input.globalAssetRoot, operationRoot, sourcePath));
    }
    return outcomes;
  } finally {
    await fs.rm(operationRoot, { recursive: true, force: true });
  }
}

export async function removeDesktopGlobalAssetFile(input: {
  readonly globalAssetRoot: string;
  readonly assetPath: string;
  readonly trash: (assetPath: string) => Promise<void>;
}): Promise<void> {
  const root = await fs.realpath(input.globalAssetRoot);
  const entry = await fs.lstat(input.assetPath);
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new Error('Desktop global Asset removal requires an owned regular file.');
  }
  const resolved = await fs.realpath(input.assetPath);
  if (!isInside(resolved, root) || isHiddenRelativePath(path.relative(root, resolved))) {
    throw new Error('Desktop global Asset removal target is outside the owned catalog.');
  }
  await input.trash(resolved);
}

async function importAssetFile(
  globalAssetRoot: string,
  operationRoot: string,
  sourcePath: string,
): Promise<GlobalAssetImportOutcome> {
  const label = path.basename(sourcePath).normalize('NFC');
  if (!isSafeVisibleFileName(label) || !isSupportedDesktopGlobalAssetPath(label)) {
    return rejected(label || 'unsupported', 'Selected material is unsupported.');
  }
  try {
    const source = await fs.lstat(sourcePath);
    if (!source.isFile() || source.isSymbolicLink()) {
      return rejected(label, 'Selected material must be a regular file.');
    }
    const stagingPath = path.join(operationRoot, label);
    const destinationPath = path.join(globalAssetRoot, label);
    await fs.copyFile(sourcePath, stagingPath);
    try {
      await fs.link(stagingPath, destinationPath);
    } catch (error: unknown) {
      if (isFileExistsError(error)) {
        return {
          status: 'conflict',
          label,
          diagnostic: 'An Asset Library item with this name already exists.',
        };
      }
      throw error;
    } finally {
      await fs.rm(stagingPath, { force: true });
    }
    return {
      status: 'added',
      label,
      assetId: createGlobalLibraryOpaqueId('asset-library', label),
    };
  } catch (error: unknown) {
    if (isMissingPathError(error)) {
      return rejected(label, 'Selected material is no longer available.');
    }
    return rejected(label, 'Desktop could not import this material.');
  }
}

function rejected(label: string, diagnostic: string): GlobalAssetImportOutcome {
  return { status: 'rejected', label, diagnostic };
}

function isSafeVisibleFileName(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith('.') &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\')
  );
}

function isHiddenRelativePath(relativePath: string): boolean {
  return relativePath.split(path.sep).some((segment) => segment.startsWith('.'));
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !path.isAbsolute(relative) &&
    !relative.startsWith(`..${path.sep}`)
  );
}

function isFileExistsError(error: unknown): boolean {
  return readErrorCode(error) === 'EEXIST';
}

function isMissingPathError(error: unknown): boolean {
  return readErrorCode(error) === 'ENOENT';
}

function readErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(Reflect.get(error, 'code'))
    : undefined;
}
