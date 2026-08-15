import { createHash } from 'node:crypto';
import { lstat, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { workspaceLinkedMediaLibraryPath } from '@neko/assets-domain/contracts';
import type {
  ProjectMediaLibraryAvailability,
  ProjectMediaLibraryDiagnostic,
  ProjectMediaLibraryRequirement,
  WorkspaceMediaLibraryRequirement,
} from '@neko/assets-domain/contracts';
import { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import {
  listGlobalMediaLibraryConnections,
  resolveGlobalMediaLibraryTarget,
  type GlobalMediaLibraryConnection,
} from './global-media-library-files';
import {
  readProjectContentReferences,
  type ProjectContentReferenceSnapshot,
} from './project-content-reference-readers';

export interface ProjectMediaLibraryAvailabilityProjection {
  readonly projectId: string;
  readonly coverage: ProjectContentReferenceSnapshot['requirements']['coverage'];
  readonly missingOwnerKinds: ProjectContentReferenceSnapshot['requirements']['missingOwnerKinds'];
  readonly requirements: readonly ProjectMediaLibraryRequirement[];
  readonly libraries: readonly ProjectMediaLibraryAvailability[];
  readonly nestedLinkEscapes: readonly {
    readonly libraryName: string;
    readonly relativePaths: readonly string[];
  }[];
  readonly unavailableRelativePaths: readonly {
    readonly libraryName: string;
    readonly relativePaths: readonly string[];
  }[];
}

export class ProjectMediaLibraryAvailabilityService {
  private readonly bindings: ProjectMediaLibraryBindingRepository;

  constructor(
    private readonly options: {
      readonly projectId: string;
      readonly workspaceRoot: string;
      readonly globalMediaLibraryRoot: string;
      readonly readReferences?: () => Promise<ProjectContentReferenceSnapshot>;
      readonly listConnections?: () => Promise<readonly GlobalMediaLibraryConnection[]>;
      readonly resolveConnectionTarget?: (connectionId: string) => Promise<string>;
    },
  ) {
    this.bindings = new ProjectMediaLibraryBindingRepository(
      options.workspaceRoot,
      options.projectId,
    );
  }

  async inspect(): Promise<ProjectMediaLibraryAvailabilityProjection> {
    const references = await this.readReferences();
    const requirements = references.requirements.requirements.map((requirement) =>
      projectRequirement(this.options.projectId, requirement),
    );
    const requirementByName = new Map(
      requirements.map((requirement) => [requirement.libraryName, requirement]),
    );
    const bindingSnapshot = await this.bindings.list();
    const bindingByName = new Map(
      bindingSnapshot.bindings.map((binding) => [binding.libraryName, binding]),
    );
    const invalidByName = new Map(
      bindingSnapshot.diagnostics.map((diagnostic) => [diagnostic.libraryName, diagnostic]),
    );
    const connections = await this.listConnections();
    const connectionById = new Map(
      connections.map((connection) => [connection.libraryId, connection]),
    );
    const names = new Set([
      ...requirementByName.keys(),
      ...bindingByName.keys(),
      ...invalidByName.keys(),
    ]);
    const libraries: ProjectMediaLibraryAvailability[] = [];
    const nestedLinkEscapes: Array<{
      readonly libraryName: string;
      readonly relativePaths: readonly string[];
    }> = [];
    const unavailableRelativePaths: Array<{
      readonly libraryName: string;
      readonly relativePaths: readonly string[];
    }> = [];
    for (const libraryName of [...names].sort((left, right) =>
      left.localeCompare(right, 'en-US'),
    )) {
      const requirement = requirementByName.get(libraryName);
      const requiredRelativePaths = requirement?.relativePaths ?? [];
      const invalid = invalidByName.get(libraryName);
      if (invalid) {
        unavailableRelativePaths.push({ libraryName, relativePaths: requiredRelativePaths });
        libraries.push(
          unavailable(
            this.options.projectId,
            libraryName,
            'binding-invalid',
            requiredRelativePaths,
            invalid.message,
          ),
        );
        continue;
      }
      const binding = bindingByName.get(libraryName);
      if (!requirement && !binding) continue;
      if (!binding) {
        unavailableRelativePaths.push({ libraryName, relativePaths: requiredRelativePaths });
        const hasWorkspaceEntry = await workspaceProjectionEntryExists(
          this.options.workspaceRoot,
          libraryName,
        );
        libraries.push(
          unavailable(
            this.options.projectId,
            libraryName,
            hasWorkspaceEntry ? 'entry-conflict' : 'required-unlinked',
            requiredRelativePaths,
            hasWorkspaceEntry
              ? 'The Workspace media entry exists but cannot be adopted as one exact global Media Library binding.'
              : 'The project requires this Media Library, but this checkout has no local binding.',
          ),
        );
        continue;
      }
      const connection = connectionById.get(binding.connectionId);
      if (!connection) {
        unavailableRelativePaths.push({ libraryName, relativePaths: requiredRelativePaths });
        libraries.push(
          unavailable(
            this.options.projectId,
            libraryName,
            'connection-missing',
            requiredRelativePaths,
            'The exact user-global Media Library connection no longer exists.',
          ),
        );
        continue;
      }
      if (connection.availability !== 'available') {
        unavailableRelativePaths.push({ libraryName, relativePaths: requiredRelativePaths });
        libraries.push(
          unavailable(
            this.options.projectId,
            libraryName,
            'target-unavailable',
            requiredRelativePaths,
            'The exact user-global Media Library target is unavailable.',
          ),
        );
        continue;
      }
      let target: string;
      try {
        target = await this.resolveConnectionTarget(binding.connectionId);
      } catch {
        unavailableRelativePaths.push({ libraryName, relativePaths: requiredRelativePaths });
        libraries.push(
          unavailable(
            this.options.projectId,
            libraryName,
            'target-unavailable',
            requiredRelativePaths,
            'The exact user-global Media Library target is unavailable.',
          ),
        );
        continue;
      }
      if (!(await hasExactWorkspaceProjection(this.options.workspaceRoot, libraryName, target))) {
        unavailableRelativePaths.push({ libraryName, relativePaths: requiredRelativePaths });
        libraries.push(
          unavailable(
            this.options.projectId,
            libraryName,
            'entry-conflict',
            requiredRelativePaths,
            'The managed Workspace link is missing or does not match the exact project binding.',
          ),
        );
        continue;
      }
      const unavailableDescendants = await findUnavailableDescendants(
        target,
        requiredRelativePaths,
      );
      if (unavailableDescendants.nestedLinkEscapes.length > 0) {
        nestedLinkEscapes.push({
          libraryName,
          relativePaths: unavailableDescendants.nestedLinkEscapes,
        });
      }
      if (unavailableDescendants.paths.length > 0) {
        unavailableRelativePaths.push({
          libraryName,
          relativePaths: unavailableDescendants.paths,
        });
        libraries.push(
          unavailable(
            this.options.projectId,
            libraryName,
            'content-incomplete',
            requiredRelativePaths,
            `The bound Media Library is missing ${unavailableDescendants.paths.length} required content item(s).`,
          ),
        );
        continue;
      }
      libraries.push({
        projectId: this.options.projectId,
        libraryName,
        state: requirement ? 'available' : 'unreferenced-local-binding',
        requiredRelativePaths,
      });
    }
    return {
      projectId: this.options.projectId,
      coverage: references.requirements.coverage,
      missingOwnerKinds: references.requirements.missingOwnerKinds,
      requirements,
      libraries,
      nestedLinkEscapes,
      unavailableRelativePaths,
    };
  }

  async readRequirement(libraryName: string): Promise<ProjectMediaLibraryRequirement | undefined> {
    return (await this.inspect()).requirements.find(
      (requirement) => requirement.libraryName === libraryName,
    );
  }

  private readReferences(): Promise<ProjectContentReferenceSnapshot> {
    return this.options.readReferences
      ? this.options.readReferences()
      : readProjectContentReferences({
          workspacePath: this.options.workspaceRoot,
          projectId: this.options.projectId,
        });
  }

  private listConnections(): Promise<readonly GlobalMediaLibraryConnection[]> {
    return this.options.listConnections
      ? this.options.listConnections()
      : listGlobalMediaLibraryConnections(this.options.globalMediaLibraryRoot);
  }

  private resolveConnectionTarget(connectionId: string): Promise<string> {
    return this.options.resolveConnectionTarget
      ? this.options.resolveConnectionTarget(connectionId)
      : resolveGlobalMediaLibraryTarget({
          mediaLibraryRoot: this.options.globalMediaLibraryRoot,
          libraryId: connectionId,
        });
  }
}

async function workspaceProjectionEntryExists(
  workspaceRoot: string,
  libraryName: string,
): Promise<boolean> {
  const linkPath = path.join(
    workspaceRoot,
    ...workspaceLinkedMediaLibraryPath(libraryName).split('/'),
  );
  try {
    await lstat(linkPath);
    return true;
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === code
  );
}

async function hasExactWorkspaceProjection(
  workspaceRoot: string,
  libraryName: string,
  target: string,
): Promise<boolean> {
  try {
    const linkPath = path.join(
      workspaceRoot,
      ...workspaceLinkedMediaLibraryPath(libraryName).split('/'),
    );
    return (
      (await lstat(linkPath)).isSymbolicLink() &&
      (await realpath(linkPath)) === (await realpath(target))
    );
  } catch {
    return false;
  }
}

function projectRequirement(
  projectId: string,
  requirement: WorkspaceMediaLibraryRequirement,
): ProjectMediaLibraryRequirement {
  const relativePaths = [...requirement.descendants].sort((left, right) =>
    left.localeCompare(right, 'en-US'),
  );
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        projectId,
        requirement.libraryName,
        relativePaths,
        requirement.references.map((reference) => [
          reference.ownerKind,
          reference.ownerId,
          reference.ownerFingerprint,
        ]),
      ]),
    )
    .digest('base64url');
  return {
    projectId,
    libraryName: requirement.libraryName,
    requirementFingerprint: `sha256:${digest}`,
    referenceCount: requirement.references.length,
    relativePaths,
  };
}

async function findUnavailableDescendants(
  target: string,
  relativePaths: readonly string[],
): Promise<{
  readonly paths: readonly string[];
  readonly nestedLinkEscapes: readonly string[];
}> {
  let root: string;
  try {
    root = await realpath(target);
  } catch {
    return { paths: relativePaths, nestedLinkEscapes: [] };
  }
  const missing: string[] = [];
  const nestedLinkEscapes: string[] = [];
  for (const relativePath of relativePaths) {
    try {
      const candidate = path.resolve(root, ...relativePath.split('/'));
      if (!isInside(candidate, root)) throw new Error('Media Library descendant escapes its root.');
      const resolved = await realpath(candidate);
      if (!isInside(resolved, root)) {
        nestedLinkEscapes.push(relativePath);
        throw new Error('Media Library descendant escapes through a nested link.');
      }
      if (!(await stat(resolved)).isFile()) {
        throw new Error('Media Library descendant is unavailable.');
      }
    } catch {
      missing.push(relativePath);
    }
  }
  return { paths: missing, nestedLinkEscapes };
}

function unavailable(
  projectId: string,
  libraryName: string,
  code: ProjectMediaLibraryDiagnostic['code'],
  requiredRelativePaths: readonly string[],
  message: string,
): ProjectMediaLibraryAvailability {
  return {
    projectId,
    libraryName,
    state: code,
    requiredRelativePaths,
    diagnostic: { code, projectId, libraryName, message },
  };
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`))
  );
}
