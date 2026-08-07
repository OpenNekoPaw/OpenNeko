import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GlobalAssetImportOutcome } from '@neko/assets-domain/global-library/contract';
import type { AssetLibraryMembershipRepository } from '@neko/assets-domain/global-library/membership';
import {
  detectGlobalAssetMediaType,
  isSupportedGlobalAssetPath,
} from './resource-browser-node-source';

export async function importGlobalAssetFiles(input: {
  readonly globalAssetRoot: string;
  readonly sourcePaths: readonly string[];
  readonly memberships: AssetLibraryMembershipRepository;
  readonly now?: () => string;
  readonly createMembershipId?: () => string;
}): Promise<readonly GlobalAssetImportOutcome[]> {
  await fs.mkdir(input.globalAssetRoot, { recursive: true });
  const operationRoot = path.join(input.globalAssetRoot, '.imports', randomUUID());
  await fs.mkdir(operationRoot, { recursive: true });
  try {
    const outcomes: GlobalAssetImportOutcome[] = [];
    for (const sourcePath of input.sourcePaths) {
      outcomes.push(
        await importAssetFile({
          globalAssetRoot: input.globalAssetRoot,
          operationRoot,
          sourcePath,
          memberships: input.memberships,
          now: input.now ?? (() => new Date().toISOString()),
          createMembershipId: input.createMembershipId ?? randomUUID,
        }),
      );
    }
    return outcomes;
  } finally {
    await fs.rm(operationRoot, { recursive: true, force: true });
  }
}

async function importAssetFile(input: {
  readonly globalAssetRoot: string;
  readonly operationRoot: string;
  readonly sourcePath: string;
  readonly memberships: AssetLibraryMembershipRepository;
  readonly now: () => string;
  readonly createMembershipId: () => string;
}): Promise<GlobalAssetImportOutcome> {
  const { globalAssetRoot, operationRoot, sourcePath } = input;
  const label = path.basename(sourcePath).normalize('NFC');
  if (!isSafeVisibleFileName(label) || !isSupportedGlobalAssetPath(label)) {
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
    let createdDestination = false;
    try {
      await fs.link(stagingPath, destinationPath);
      createdDestination = true;
    } catch (error: unknown) {
      if (isFileExistsError(error)) {
        const existing = await input.memberships.findBySourceRelativePath(label);
        if (
          existing?.state === 'active' ||
          !(await filesHaveSameContent(stagingPath, destinationPath))
        ) {
          return {
            status: 'conflict',
            label,
            diagnostic: 'An Asset Library item with this name already exists.',
          };
        }
      } else {
        throw error;
      }
    } finally {
      await fs.rm(stagingPath, { force: true });
    }
    const destination = await fs.lstat(destinationPath);
    if (!destination.isFile() || destination.isSymbolicLink()) {
      if (createdDestination) await fs.rm(destinationPath, { force: true });
      return rejected(label, 'Selected material must resolve to a regular file.');
    }
    let membership;
    try {
      membership = await input.memberships.activate({
        membershipId: input.createMembershipId(),
        sourceRelativePath: label,
        label,
        mediaType: detectGlobalAssetMediaType(label) ?? null,
        byteLength: destination.size,
        modifiedAt: destination.mtime.toISOString(),
        registeredAt: input.now(),
      });
    } catch (error: unknown) {
      if (createdDestination) await fs.rm(destinationPath, { force: true });
      throw error;
    }
    return {
      status: 'added',
      label,
      assetId: membership.membershipId,
    };
  } catch (error: unknown) {
    if (isMissingPathError(error)) {
      return rejected(label, 'Selected material is no longer available.');
    }
    if (isExpectedFileAccessError(error)) {
      return rejected(label, 'Desktop could not import this material.');
    }
    throw error;
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

function isFileExistsError(error: unknown): boolean {
  return readErrorCode(error) === 'EEXIST';
}

function isExpectedFileAccessError(error: unknown): boolean {
  const code = readErrorCode(error);
  return code === 'EACCES' || code === 'EPERM' || code === 'EISDIR' || code === 'ENOTDIR';
}

function isMissingPathError(error: unknown): boolean {
  return readErrorCode(error) === 'ENOENT';
}

function readErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(Reflect.get(error, 'code'))
    : undefined;
}

async function filesHaveSameContent(left: string, right: string): Promise<boolean> {
  const [leftStat, rightStat] = await Promise.all([fs.lstat(left), fs.lstat(right)]);
  if (
    !leftStat.isFile() ||
    leftStat.isSymbolicLink() ||
    !rightStat.isFile() ||
    rightStat.isSymbolicLink() ||
    leftStat.size !== rightStat.size
  ) {
    return false;
  }
  const [leftDigest, rightDigest] = await Promise.all([digestFile(left), digestFile(right)]);
  return leftDigest === rightDigest;
}

async function digestFile(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest('hex');
}
