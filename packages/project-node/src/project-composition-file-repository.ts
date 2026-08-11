import { randomUUID } from 'node:crypto';
import { open, mkdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseContentProjectComposition } from '@neko/project/contracts';
import type { ProjectCompositionRepository } from '@neko/project/application';

export const PROJECT_COMPOSITION_RELATIVE_PATH = 'neko/project-composition.json';

export class ProjectCompositionStorageError extends Error {
  constructor(
    readonly code:
      | 'project-workspace-unavailable'
      | 'project-workspace-path-escape'
      | 'project-composition-invalid'
      | 'project-composition-read-failed'
      | 'project-composition-write-failed',
    readonly operation: 'read' | 'save',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProjectCompositionStorageError';
  }
}

export function createProjectCompositionFileRepository(options: {
  readonly workspaceRoot: string;
}): ProjectCompositionRepository {
  if (!isAbsolute(options.workspaceRoot)) {
    throw new ProjectCompositionStorageError(
      'project-workspace-unavailable',
      'read',
      'Project Workspace root must be an absolute Host-authorized path.',
    );
  }
  return {
    async read(signal) {
      signal?.throwIfAborted();
      const target = await resolveTarget(options.workspaceRoot, 'read');
      let source: string;
      try {
        source = await readFile(target, 'utf8');
      } catch (cause) {
        if (isErrorCode(cause, 'ENOENT')) return undefined;
        throw new ProjectCompositionStorageError(
          'project-composition-read-failed',
          'read',
          `Failed to read '${PROJECT_COMPOSITION_RELATIVE_PATH}'.`,
          { cause },
        );
      }
      try {
        return parseContentProjectComposition(JSON.parse(source));
      } catch (cause) {
        throw new ProjectCompositionStorageError(
          'project-composition-invalid',
          'read',
          `Project composition '${PROJECT_COMPOSITION_RELATIVE_PATH}' is invalid.`,
          { cause },
        );
      }
    },
    async save(composition, signal) {
      signal?.throwIfAborted();
      const canonical = parseContentProjectComposition(composition);
      const target = await resolveTarget(options.workspaceRoot, 'save');
      const parent = dirname(target);
      const temporary = join(parent, `.project-composition.${randomUUID()}.tmp`);
      try {
        await mkdir(parent, { recursive: true });
        await assertContainedByRealParent(options.workspaceRoot, parent, 'save');
        const file = await open(temporary, 'wx', 0o600);
        try {
          await file.writeFile(`${JSON.stringify(canonical, null, 2)}\n`, 'utf8');
          await file.sync();
        } finally {
          await file.close();
        }
        signal?.throwIfAborted();
        await rename(temporary, target);
        const directory = await open(parent, 'r');
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      } catch (cause) {
        await rm(temporary, { force: true });
        if (cause instanceof ProjectCompositionStorageError) throw cause;
        throw new ProjectCompositionStorageError(
          'project-composition-write-failed',
          'save',
          `Failed to write '${PROJECT_COMPOSITION_RELATIVE_PATH}'.`,
          { cause },
        );
      }
    },
  };
}

async function resolveTarget(workspaceRoot: string, operation: 'read' | 'save'): Promise<string> {
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(resolve(workspaceRoot));
  } catch (cause) {
    throw new ProjectCompositionStorageError(
      'project-workspace-unavailable',
      operation,
      'The authorized Project Workspace root is unavailable.',
      { cause },
    );
  }
  const target = resolve(canonicalRoot, PROJECT_COMPOSITION_RELATIVE_PATH);
  assertContained(canonicalRoot, target, operation);
  return target;
}

async function assertContainedByRealParent(
  workspaceRoot: string,
  parent: string,
  operation: 'read' | 'save',
): Promise<void> {
  const [canonicalRoot, canonicalParent] = await Promise.all([
    realpath(resolve(workspaceRoot)),
    realpath(parent),
  ]);
  assertContained(canonicalRoot, canonicalParent, operation);
}

function assertContained(root: string, candidate: string, operation: 'read' | 'save'): void {
  const path = relative(root, candidate);
  if (path === '' || (!path.startsWith('..') && !isAbsolute(path))) return;
  throw new ProjectCompositionStorageError(
    'project-workspace-path-escape',
    operation,
    `Project composition path escapes the authorized Workspace root.`,
  );
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
