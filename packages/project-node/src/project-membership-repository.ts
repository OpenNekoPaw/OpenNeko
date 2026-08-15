import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  decodeProjectRecordName,
  parseProjectGlobalReferenceJson,
  parseProjectTargetMembershipJson,
  projectAuthoringTargetKey,
  projectGlobalObjectKey,
  projectGlobalReferenceRelativePath,
  projectTargetMembershipRelativePath,
  PROJECT_GLOBAL_REFERENCE_DIRECTORY,
  PROJECT_TARGET_MEMBERSHIP_DIRECTORY,
  serializeProjectGlobalReferenceFact,
  serializeProjectTargetMembershipFact,
  type ProjectGlobalReferenceFact,
  type ProjectPersistenceDiagnostic,
  type ProjectTargetMembershipFact,
} from '@neko/project/contracts';

const MAX_RECORD_BYTES = 128 * 1024;
const MAX_RECORDS_PER_KIND = 10_000;

export interface ProjectWorkspaceCommitAuthority {
  readonly workspaceId: string;
  readonly projectId: string;
}

export interface ProjectMembershipRepositoryProjection {
  readonly authority: ProjectWorkspaceCommitAuthority;
  readonly targets: readonly ProjectTargetMembershipFact[];
  readonly globalReferences: readonly ProjectGlobalReferenceFact[];
  readonly diagnostics: readonly ProjectPersistenceDiagnostic[];
}

export class ProjectMembershipRepository {
  private readonly targetDirectory: string;
  private readonly globalReferenceDirectory: string;

  constructor(
    private readonly workspaceRoot: string,
    private readonly authority: ProjectWorkspaceCommitAuthority,
  ) {
    if (!path.isAbsolute(workspaceRoot)) {
      throw new Error('Project membership repository requires an absolute Workspace root.');
    }
    requireIdentity(authority.workspaceId, 'Project Workspace');
    requireIdentity(authority.projectId, 'Project');
    this.targetDirectory = directoryPath(workspaceRoot, PROJECT_TARGET_MEMBERSHIP_DIRECTORY);
    this.globalReferenceDirectory = directoryPath(
      workspaceRoot,
      PROJECT_GLOBAL_REFERENCE_DIRECTORY,
    );
  }

  async read(): Promise<ProjectMembershipRepositoryProjection> {
    const [targets, globalReferences] = await Promise.all([
      this.readRecords({
        directory: this.targetDirectory,
        code: 'invalid-project-target-membership',
        parse: parseProjectTargetMembershipJson,
        identity: (fact) => projectAuthoringTargetKey(fact.target),
      }),
      this.readRecords({
        directory: this.globalReferenceDirectory,
        code: 'invalid-project-global-reference',
        parse: parseProjectGlobalReferenceJson,
        identity: (fact) => projectGlobalObjectKey(fact.reference),
      }),
    ]);
    return {
      authority: this.authority,
      targets: targets.records,
      globalReferences: globalReferences.records,
      diagnostics: [...targets.diagnostics, ...globalReferences.diagnostics],
    };
  }

  async commitTarget(fact: ProjectTargetMembershipFact, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (fact.projectId !== this.authority.projectId) {
      throw new Error('Project target membership belongs to another Project.');
    }
    await this.atomicWrite(
      this.targetDirectory,
      projectTargetMembershipRelativePath(fact.target),
      serializeProjectTargetMembershipFact(fact),
      signal,
    );
  }

  async commitGlobalReference(
    fact: ProjectGlobalReferenceFact,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    this.requireReferenceAuthority(fact);
    const relativePath = projectGlobalReferenceRelativePath(fact.reference);
    await withReferencePathLock(this.resolveReferencePath(relativePath), async () => {
      if ((await this.readExactGlobalReference(relativePath, signal)) !== undefined) {
        throw new Error('Project already contains a reference for this global object.');
      }
      await this.atomicWrite(
        this.globalReferenceDirectory,
        relativePath,
        serializeProjectGlobalReferenceFact(fact),
        signal,
      );
    });
  }

  async replaceGlobalReference(
    input: {
      readonly previous: ProjectGlobalReferenceFact;
      readonly next: ProjectGlobalReferenceFact;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    this.requireReferenceAuthority(input.previous);
    this.requireReferenceAuthority(input.next);
    const previousPath = projectGlobalReferenceRelativePath(input.previous.reference);
    const nextPath = projectGlobalReferenceRelativePath(input.next.reference);
    if (previousPath !== nextPath) {
      throw new Error('Project global reference update must retain the exact global object.');
    }
    await withReferencePathLock(this.resolveReferencePath(previousPath), async () => {
      const current = await this.readExactGlobalReference(previousPath, signal);
      if (!current || !isDeepStrictEqual(current, input.previous)) {
        throw new Error('Project global reference changed before the requested update.');
      }
      await this.atomicWrite(
        this.globalReferenceDirectory,
        previousPath,
        serializeProjectGlobalReferenceFact(input.next),
        signal,
      );
    });
  }

  async removeGlobalReference(
    fact: ProjectGlobalReferenceFact,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    this.requireReferenceAuthority(fact);
    const relativePath = projectGlobalReferenceRelativePath(fact.reference);
    const destination = this.resolveReferencePath(relativePath);
    await withReferencePathLock(destination, async () => {
      const current = await this.readExactGlobalReference(relativePath, signal);
      if (!current || !isDeepStrictEqual(current, fact)) {
        throw new Error('Project global reference changed before the requested removal.');
      }
      await fs.unlink(destination);
    });
  }

  private requireReferenceAuthority(fact: ProjectGlobalReferenceFact): void {
    if (fact.projectId !== this.authority.projectId) {
      throw new Error('Project global reference belongs to another Project.');
    }
  }

  private resolveReferencePath(relativePath: string): string {
    const destination = path.join(this.workspaceRoot, ...relativePath.split('/'));
    if (path.dirname(destination) !== this.globalReferenceDirectory) {
      throw new Error('Project global reference destination escaped its canonical directory.');
    }
    return destination;
  }

  private async readExactGlobalReference(
    relativePath: string,
    signal?: AbortSignal,
  ): Promise<ProjectGlobalReferenceFact | undefined> {
    signal?.throwIfAborted();
    try {
      return parseProjectGlobalReferenceJson(
        await fs.readFile(this.resolveReferencePath(relativePath), 'utf8'),
      );
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return undefined;
      throw error;
    }
  }

  private async readRecords<T>(input: {
    readonly directory: string;
    readonly code: ProjectPersistenceDiagnostic['code'];
    readonly parse: (json: string) => T;
    readonly identity: (value: T) => string;
  }): Promise<{
    readonly records: readonly T[];
    readonly diagnostics: readonly ProjectPersistenceDiagnostic[];
  }> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(input.directory, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return { records: [], diagnostics: [] };
      throw error;
    }
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((left, right) => left.name.localeCompare(right.name, 'en-US'));
    if (files.length > MAX_RECORDS_PER_KIND) {
      throw new Error(`Project record count exceeds ${MAX_RECORDS_PER_KIND}.`);
    }
    const records: T[] = [];
    const diagnostics: ProjectPersistenceDiagnostic[] = [];
    for (const file of files) {
      const recordName = file.name.slice(0, -'.json'.length);
      try {
        const expectedIdentity = decodeProjectRecordName(recordName);
        const filePath = path.join(input.directory, file.name);
        const stat = await fs.lstat(filePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RECORD_BYTES) {
          throw new Error('Project fact must be one bounded regular file.');
        }
        const record = input.parse(await fs.readFile(filePath, 'utf8'));
        if (input.identity(record) !== expectedIdentity) {
          throw new Error('Project fact identity does not match its record path.');
        }
        if (
          typeof record !== 'object' ||
          record === null ||
          !('projectId' in record) ||
          Reflect.get(record, 'projectId') !== this.authority.projectId
        ) {
          throw new Error('Project fact belongs to another Project.');
        }
        records.push(record);
      } catch (error) {
        diagnostics.push({
          code: input.code,
          projectId: this.authority.projectId,
          recordName,
          message: String(error),
        });
      }
    }
    return { records, diagnostics };
  }

  private async atomicWrite(
    directory: string,
    relativePath: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const destination = path.join(this.workspaceRoot, ...relativePath.split('/'));
    if (path.dirname(destination) !== directory) {
      throw new Error('Project fact destination escaped its canonical directory.');
    }
    await fs.mkdir(directory, { recursive: true });
    signal?.throwIfAborted();
    const temporary = path.join(directory, `.${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, content, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
        signal,
      });
      signal?.throwIfAborted();
      await fs.rename(temporary, destination);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

const referencePathLocks = new Map<string, Promise<void>>();

async function withReferencePathLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = referencePathLocks.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => undefined).then(() => gate);
  referencePathLocks.set(key, next);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release?.();
    if (referencePathLocks.get(key) === next) referencePathLocks.delete(key);
  }
}

function directoryPath(workspaceRoot: string, relativeDirectory: string): string {
  return path.join(workspaceRoot, ...relativeDirectory.split('/'));
}

function requireIdentity(value: string, label: string): void {
  if (!value.trim() || value.includes('\0')) throw new Error(`${label} identity is required.`);
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === code
  );
}
