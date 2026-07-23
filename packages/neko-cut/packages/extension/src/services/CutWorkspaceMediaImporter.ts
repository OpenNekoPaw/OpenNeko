import { randomUUID } from 'node:crypto';
import { constants as nodeFsConstants } from 'node:fs';
import * as nodePath from 'node:path';
import * as nodeFs from 'node:fs/promises';

export interface PreparedCutMedia {
  readonly copied: boolean;
  readonly filePath: string;
  readonly workspaceRelativePath: string;
}

export class CutMediaImportError extends Error {
  readonly code: 'invalid-source' | 'workspace-escape' | 'copy-failed';

  constructor(code: CutMediaImportError['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CutMediaImportError';
    this.code = code;
  }
}

export interface CutMediaImportFileSystem {
  realpath(filePath: string): Promise<string>;
  stat(filePath: string): Promise<{ isFile(): boolean }>;
  mkdir(filePath: string, options: { recursive: true }): Promise<unknown>;
  copyFile(source: string, destination: string, mode: number): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  rm(filePath: string, options: { force: true }): Promise<void>;
}

const nodeFileSystem: CutMediaImportFileSystem = {
  realpath: (filePath) => nodeFs.realpath(filePath),
  stat: (filePath) => nodeFs.stat(filePath),
  mkdir: (filePath, options) => nodeFs.mkdir(filePath, options),
  copyFile: (source, destination, mode) => nodeFs.copyFile(source, destination, mode),
  link: (existingPath, newPath) => nodeFs.link(existingPath, newPath),
  rm: (filePath, options) => nodeFs.rm(filePath, options),
};

const IMPORT_DIRECTORY_NAME = 'media';
const MAX_CONFLICT_SUFFIX = 999;

export class CutWorkspaceMediaImporter {
  private constructor(
    private readonly workspaceRoot: string,
    private readonly realWorkspaceRoot: string,
    private readonly fileSystem: CutMediaImportFileSystem,
  ) {}

  static async create(
    workspaceRoot: string,
    fileSystem: CutMediaImportFileSystem = nodeFileSystem,
  ): Promise<CutWorkspaceMediaImporter> {
    const lexicalRoot = nodePath.resolve(workspaceRoot);
    const realRoot = nodePath.resolve(await fileSystem.realpath(lexicalRoot));
    return new CutWorkspaceMediaImporter(lexicalRoot, realRoot, fileSystem);
  }

  async prepare(documentPath: string, sourcePath: string): Promise<PreparedCutMedia> {
    const documentDirectory = await this.resolveDocumentDirectory(documentPath);
    const realSource = nodePath.resolve(await this.fileSystem.realpath(sourcePath));
    const sourceStat = await this.fileSystem.stat(realSource);
    if (!sourceStat.isFile()) {
      throw new CutMediaImportError('invalid-source', 'Cut media import requires a regular file.');
    }

    if (isContained(this.realWorkspaceRoot, realSource)) {
      return {
        copied: false,
        filePath: realSource,
        workspaceRelativePath: toWorkspaceRelative(this.realWorkspaceRoot, realSource),
      };
    }

    const importDirectory = nodePath.resolve(documentDirectory, IMPORT_DIRECTORY_NAME);
    assertContained(this.realWorkspaceRoot, importDirectory);
    await this.fileSystem.mkdir(importDirectory, { recursive: true });
    const realImportDirectory = nodePath.resolve(await this.fileSystem.realpath(importDirectory));
    assertContained(this.realWorkspaceRoot, realImportDirectory);

    const portableName = portableFileName(nodePath.basename(realSource));
    const stagingPath = nodePath.join(realImportDirectory, `.${portableName}.${randomUUID()}.tmp`);
    let target: string | undefined;
    let operationError: unknown;
    try {
      await this.fileSystem.copyFile(realSource, stagingPath, nodeFsConstants.COPYFILE_EXCL);
      target = await this.publishWithoutOverwrite(stagingPath, realImportDirectory, portableName);
    } catch (error) {
      operationError = error;
    }

    const cleanupErrors: unknown[] = [];
    try {
      await this.fileSystem.rm(stagingPath, { force: true });
    } catch (error) {
      cleanupErrors.push(error);
      if (target !== undefined) {
        try {
          await this.fileSystem.rm(target, { force: true });
          target = undefined;
        } catch (rollbackError) {
          cleanupErrors.push(rollbackError);
        }
      }
      try {
        await this.fileSystem.rm(stagingPath, { force: true });
      } catch (retryError) {
        cleanupErrors.push(retryError);
      }
    }

    if (cleanupErrors.length > 0) {
      throw new CutMediaImportError(
        'copy-failed',
        `Unable to clean the staged Cut media copy in ${IMPORT_DIRECTORY_NAME}/.`,
        {
          cause: new AggregateError(
            operationError === undefined ? cleanupErrors : [operationError, ...cleanupErrors],
          ),
        },
      );
    }

    if (operationError !== undefined) {
      if (operationError instanceof CutMediaImportError) throw operationError;
      throw new CutMediaImportError(
        'copy-failed',
        `Unable to copy Cut media into ${IMPORT_DIRECTORY_NAME}/.`,
        { cause: operationError },
      );
    }
    if (target === undefined) {
      throw new CutMediaImportError(
        'copy-failed',
        'Cut media publication completed without a destination path.',
      );
    }
    return {
      copied: true,
      filePath: target,
      workspaceRelativePath: toWorkspaceRelative(this.realWorkspaceRoot, target),
    };
  }

  async discard(prepared: PreparedCutMedia): Promise<void> {
    if (!prepared.copied) return;
    assertContained(this.realWorkspaceRoot, prepared.filePath);
    await this.fileSystem.rm(prepared.filePath, { force: true });
  }

  private async resolveDocumentDirectory(documentPath: string): Promise<string> {
    const lexicalDirectory = nodePath.dirname(nodePath.resolve(documentPath));
    assertContained(this.workspaceRoot, lexicalDirectory);
    const realDirectory = nodePath.resolve(await this.fileSystem.realpath(lexicalDirectory));
    assertContained(this.realWorkspaceRoot, realDirectory);
    return realDirectory;
  }

  private async publishWithoutOverwrite(
    stagingPath: string,
    directory: string,
    portableName: string,
  ): Promise<string> {
    const extension = nodePath.extname(portableName);
    const stem = extension ? portableName.slice(0, -extension.length) : portableName;
    for (let suffix = 1; suffix <= MAX_CONFLICT_SUFFIX; suffix += 1) {
      const candidateName = suffix === 1 ? portableName : `${stem}-${suffix}${extension}`;
      const candidate = nodePath.join(directory, candidateName);
      try {
        await this.fileSystem.link(stagingPath, candidate);
        return candidate;
      } catch (error) {
        if (isNodeError(error, 'EEXIST')) continue;
        throw error;
      }
    }
    throw new CutMediaImportError(
      'copy-failed',
      `Unable to allocate a non-conflicting Cut media name for ${portableName}.`,
    );
  }
}

function portableFileName(sourceName: string): string {
  const normalized = sourceName.normalize('NFC');
  const extension = nodePath.extname(normalized).replace(/[^A-Za-z0-9.]+/gu, '');
  const originalStem = extension
    ? normalized.slice(0, -nodePath.extname(normalized).length)
    : normalized;
  const stem = originalStem
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/gu, '-')
    .replace(/[. ]+$/gu, '')
    .trim();
  return `${stem || 'media'}${extension}`;
}

function toWorkspaceRelative(workspaceRoot: string, filePath: string): string {
  assertContained(workspaceRoot, filePath);
  return nodePath.relative(workspaceRoot, filePath).split(nodePath.sep).join('/');
}

function assertContained(root: string, candidate: string): void {
  if (!isContained(root, candidate)) {
    throw new CutMediaImportError('workspace-escape', 'Cut media path escapes the workspace.');
  }
}

function isContained(root: string, candidate: string): boolean {
  const relative = nodePath.relative(nodePath.resolve(root), nodePath.resolve(candidate));
  return (
    relative === '' ||
    (!nodePath.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${nodePath.sep}`))
  );
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}
