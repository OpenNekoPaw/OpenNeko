import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { characterProjectPath } from '@neko/chara-node';
import { parseCharacterProject } from '@neko/chara/contracts';
import {
  PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH,
  assertProjectEntityDocument,
  decodeProjectEntityDocument,
  encodeProjectEntityDocument,
} from '@neko/entity-domain';
import type {
  ProjectLocalAuthoringCommitPort,
  ProjectLocalCharacterCommit,
  ProjectLocalWorldCommit,
} from '@neko/project/application';
import {
  parseProjectEntityCharacterAssociationFact,
  parseProjectTargetMembershipFact,
  projectEntityCharacterAssociationRelativePath,
  projectTargetMembershipRelativePath,
  serializeProjectEntityCharacterAssociationFact,
  serializeProjectTargetMembershipFact,
} from '@neko/project/contracts';
import { worldProjectPath } from '@neko/world-node';
import { parseWorldProject } from '@neko/world/contracts';

export class ProjectLocalAuthoringCommitRepository implements ProjectLocalAuthoringCommitPort {
  private readonly workspaceRoot: string;

  constructor(
    workspaceRoot: string,
    private readonly authority: { readonly workspaceId: string; readonly projectId: string },
  ) {
    if (!path.isAbsolute(workspaceRoot)) {
      throw new Error('Project local authoring commit requires an absolute Workspace root.');
    }
    requireIdentity(authority.workspaceId, 'Project Workspace');
    requireIdentity(authority.projectId, 'Project');
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  async commitCharacter(input: ProjectLocalCharacterCommit, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.requireAuthority(input.authority);
    const project = parseCharacterProject(input.project);
    const previousEntityDocument = assertProjectEntityDocument(input.entityDocument.previous);
    const nextEntityDocument =
      input.entityDocument.next === undefined
        ? undefined
        : assertProjectEntityDocument(input.entityDocument.next);
    const association = parseProjectEntityCharacterAssociationFact(input.association);
    const membership = parseProjectTargetMembershipFact(input.membership);
    if (
      previousEntityDocument.projectId !== this.authority.projectId ||
      nextEntityDocument?.projectId !== this.authority.projectId ||
      association.projectId !== this.authority.projectId ||
      association.characterProjectId !== project.characterProjectId ||
      membership.projectId !== this.authority.projectId ||
      membership.target.kind !== 'character-project' ||
      membership.target.characterProjectId !== project.characterProjectId
    ) {
      throw new Error('Project-local Character commit crosses exact Project or object authority.');
    }
    await this.commit(
      {
        expectedEntityDocument: previousEntityDocument,
        files: [
          {
            relativePath: characterProjectPath(project.characterProjectId),
            content: serialize(project),
          },
          ...(nextEntityDocument
            ? [
                {
                  relativePath: PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH,
                  content: encodeProjectEntityDocument(nextEntityDocument),
                  replaceExisting: true as const,
                },
              ]
            : []),
          {
            relativePath: projectEntityCharacterAssociationRelativePath(association.entityId),
            content: serializeProjectEntityCharacterAssociationFact(association),
          },
          {
            relativePath: projectTargetMembershipRelativePath(membership.target),
            content: serializeProjectTargetMembershipFact(membership),
          },
        ],
      },
      signal,
    );
  }

  async commitWorld(input: ProjectLocalWorldCommit, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.requireAuthority(input.authority);
    const project = parseWorldProject(input.project);
    const membership = parseProjectTargetMembershipFact(input.membership);
    if (
      membership.projectId !== this.authority.projectId ||
      membership.target.kind !== 'world-project' ||
      membership.target.worldProjectId !== project.worldProjectId
    ) {
      throw new Error('Project-local World commit crosses exact Project or object authority.');
    }
    await this.commit(
      {
        files: [
          { relativePath: worldProjectPath(project.worldProjectId), content: serialize(project) },
          {
            relativePath: projectTargetMembershipRelativePath(membership.target),
            content: serializeProjectTargetMembershipFact(membership),
          },
        ],
      },
      signal,
    );
  }

  private requireAuthority(authority: {
    readonly workspaceId: string;
    readonly projectId: string;
  }): void {
    if (
      authority.workspaceId !== this.authority.workspaceId ||
      authority.projectId !== this.authority.projectId
    ) {
      throw new Error('Project local authoring commit belongs to another Workspace or Project.');
    }
  }

  private async commit(
    input: {
      readonly expectedEntityDocument?: ProjectLocalCharacterCommit['entityDocument']['previous'];
      readonly files: readonly {
        readonly relativePath: string;
        readonly content: string;
        readonly replaceExisting?: true;
      }[];
    },
    signal?: AbortSignal,
  ): Promise<void> {
    await withWorkspaceCommitLock(
      `${this.workspaceRoot}\0${this.authority.projectId}`,
      async () => {
        signal?.throwIfAborted();
        const workspaceRealPath = await fs.realpath(this.workspaceRoot);
        if (input.expectedEntityDocument) {
          await this.requireEntityDocumentUnchanged(
            workspaceRealPath,
            input.expectedEntityDocument,
            signal,
          );
        }
        const destinations = await Promise.all(
          input.files.map(async (file) => ({
            ...file,
            destination: await this.authorizeDestination(
              workspaceRealPath,
              file.relativePath,
              file.replaceExisting === true,
            ),
          })),
        );
        const stagingRoot = await fs.mkdtemp(
          path.join(workspaceRealPath, '.project-local-authoring-'),
        );
        const published: { readonly destination: string; readonly backup?: string }[] = [];
        try {
          const staged = await Promise.all(
            destinations.map(async (file, index) => {
              const stagedPath = path.join(stagingRoot, `fact-${String(index)}-${randomUUID()}`);
              await fs.writeFile(stagedPath, file.content, { flag: 'wx', mode: 0o600, signal });
              return { ...file, stagedPath };
            }),
          );
          signal?.throwIfAborted();
          for (const file of staged) {
            let backup: string | undefined;
            if (file.replaceExisting && (await pathExists(file.destination))) {
              backup = path.join(stagingRoot, `backup-${randomUUID()}`);
              await fs.rename(file.destination, backup);
            }
            try {
              await fs.rename(file.stagedPath, file.destination);
              published.push({ destination: file.destination, ...(backup ? { backup } : {}) });
            } catch (error) {
              if (backup) await fs.rename(backup, file.destination);
              throw error;
            }
          }
        } catch (error) {
          await rollbackPublished(published);
          throw error;
        } finally {
          await fs.rm(stagingRoot, { recursive: true, force: true });
        }
      },
    );
  }

  private async requireEntityDocumentUnchanged(
    workspaceRealPath: string,
    expected: ProjectLocalCharacterCommit['entityDocument']['previous'],
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const destination = resolveContainedPath(
      workspaceRealPath,
      PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH,
    );
    let current;
    try {
      const stat = await fs.lstat(destination);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error('Project Entity document must be one regular file.');
      }
      const decoded = decodeProjectEntityDocument(
        JSON.parse(await fs.readFile(destination, 'utf8')),
      );
      if (!decoded.ok || decoded.diagnostics.length > 0) {
        throw new Error('Project Entity document is invalid at commit time.');
      }
      current = decoded.document;
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
      current = { projectId: this.authority.projectId, entities: [] };
    }
    if (!isDeepStrictEqual(current, expected)) {
      throw new Error('Project Entity document changed before Project-local creation commit.');
    }
  }

  private async authorizeDestination(
    workspaceRealPath: string,
    relativePath: string,
    allowExisting: boolean,
  ): Promise<string> {
    const destination = resolveContainedPath(workspaceRealPath, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const parentRealPath = await fs.realpath(path.dirname(destination));
    if (!isInside(parentRealPath, workspaceRealPath)) {
      throw new Error('Project local authoring destination escaped its Workspace.');
    }
    try {
      const stat = await fs.lstat(destination);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error('Project local authoring destination must be one regular file.');
      }
      if (!allowExisting) {
        throw new Error('Project local authoring target already exists.');
      }
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
    }
    return destination;
  }
}

async function rollbackPublished(
  published: readonly { readonly destination: string; readonly backup?: string }[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const item of [...published].reverse()) {
    try {
      await fs.rm(item.destination, { force: true });
      if (item.backup) await fs.rename(item.backup, item.destination);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Project local authoring rollback failed.');
  }
}

function resolveContainedPath(workspaceRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new Error('Project local authoring path must be Workspace-relative.');
  }
  const destination = path.resolve(workspaceRoot, ...relativePath.split('/'));
  if (!isInside(destination, workspaceRoot)) {
    throw new Error('Project local authoring path escaped its Workspace.');
  }
  return destination;
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.lstat(candidate);
    return true;
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return false;
    throw error;
  }
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

const workspaceCommitLocks = new Map<string, Promise<void>>();

async function withWorkspaceCommitLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = workspaceCommitLocks.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => undefined).then(() => gate);
  workspaceCommitLocks.set(key, next);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release?.();
    if (workspaceCommitLocks.get(key) === next) workspaceCommitLocks.delete(key);
  }
}
