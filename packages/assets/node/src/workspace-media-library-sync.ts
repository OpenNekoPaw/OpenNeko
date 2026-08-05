import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  WORKSPACE_MEDIA_LIBRARY_DIRECTORY,
  type WorkspaceMediaLibraryPortabilityProjection,
  type WorkspaceMediaLibraryRecoveryPlan,
  type WorkspaceMediaLibraryRequirement,
  type WorkspaceMediaLibraryStatus,
  type WorkspaceMediaLibrarySyncDiagnosticCode,
} from '@neko/assets-domain/contracts';
import { type LocalMetadataRepositories } from '@neko/local-metadata';
import { createWorkspaceMediaLibrarySyncMetadataBinding } from './workspace-media-library-sync-binding';
import {
  createWorkspaceLinkedMediaLibrary,
  listWorkspaceLinkedMediaLibraries,
  removeWorkspaceLinkedMediaLibrary,
  replaceWorkspaceLinkedMediaLibrary,
} from './workspace-linked-media-libraries';
import type { GlobalMediaLibraryLocationKind } from '@neko/assets-domain/global-library/contract';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  createGlobalMediaLibraryConnection,
  listGlobalMediaLibraryConnections,
  removeGlobalMediaLibraryConnection,
  replaceGlobalMediaLibraryConnection,
  rollbackGlobalMediaLibraryConnection,
  type GlobalMediaLibraryConnection,
} from './global-media-library-files';
import {
  readProjectContentReferences,
  type ProjectContentReferenceSnapshot,
} from './project-content-reference-readers';

export interface WorkspaceMediaLibrarySyncProjection {
  readonly requirementRevision: string;
  readonly operationRevision: string;
  readonly coverage: ProjectContentReferenceSnapshot['requirements']['coverage'];
  readonly statuses: readonly WorkspaceMediaLibraryStatus[];
  readonly portability: WorkspaceMediaLibraryPortabilityProjection;
  readonly metadataDiagnostic?: 'local-metadata-write-failed';
}

interface InternalRecoveryPlan {
  readonly publicPlan: WorkspaceMediaLibraryRecoveryPlan;
  readonly candidatePath: string;
  readonly pendingGlobalConnection?: {
    readonly locationKind: GlobalMediaLibraryLocationKind;
    readonly sourceDirectory: string;
    readonly replaceLibraryId?: string;
  };
}

export class WorkspaceMediaLibrarySyncError extends Error {
  constructor(
    readonly code: WorkspaceMediaLibrarySyncDiagnosticCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceMediaLibrarySyncError';
  }
}

export class WorkspaceMediaLibrarySyncService {
  private readonly plans = new Map<string, InternalRecoveryPlan>();

  constructor(
    private readonly globalMediaLibraryRoot: string,
    private readonly metadataRepositories?: LocalMetadataRepositories,
  ) {}

  async inspect(workspace: AssetWorkspaceResolution): Promise<WorkspaceMediaLibrarySyncProjection> {
    const references = await readProjectContentReferences({
      workspacePath: workspace.workspacePath,
      projectId: workspace.workspaceId,
    });
    const statuses = await inspectStatuses({
      workspacePath: workspace.workspacePath,
      globalMediaLibraryRoot: this.globalMediaLibraryRoot,
      references,
    });
    const operationRevision = revisionFor(references.requirements.revision, statuses);
    const normalizedStatuses = statuses.map((status) => ({
      ...status,
      operationRevision,
    }));
    const linkedPortabilityState =
      references.requirements.coverage === 'incomplete'
        ? 'coverage-incomplete'
        : normalizedStatuses.some(
              (status) => status.referenceCount > 0 && status.state !== 'available',
            )
          ? 'sync-requires-relink'
          : 'linked-ready';
    const baseProjection: WorkspaceMediaLibrarySyncProjection = {
      requirementRevision: references.requirements.revision,
      operationRevision,
      coverage: references.requirements.coverage,
      statuses: normalizedStatuses,
      portability: {
        state: linkedPortabilityState,
        requirementRevision: references.requirements.revision,
        libraries: normalizedStatuses,
      },
    };
    if (!this.metadataRepositories) return baseProjection;
    const binding = createWorkspaceMediaLibrarySyncMetadataBinding({
      workspaceId: workspace.workspaceId,
      repositories: this.metadataRepositories,
    });
    try {
      const completedSnapshot =
        references.requirements.coverage === 'complete'
          ? await binding.findCompletedSnapshot(references.requirements.revision)
          : null;
      const projection: WorkspaceMediaLibrarySyncProjection = completedSnapshot
        ? {
            ...baseProjection,
            portability: {
              ...baseProjection.portability,
              state: 'portable-snapshot-ready',
            },
          }
        : baseProjection;
      await binding.recordProjection({
        freshness: 'fresh',
        diagnostic:
          normalizedStatuses.find((status) => status.diagnostic)?.diagnostic?.code ?? null,
        updatedAt: new Date().toISOString(),
      });
      return projection;
    } catch {
      return { ...baseProjection, metadataDiagnostic: 'local-metadata-write-failed' };
    }
  }

  async planRecovery(input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly libraryName: string;
  }): Promise<WorkspaceMediaLibraryRecoveryPlan> {
    const current = await this.inspect(input.workspace);
    const status = requireRecoverableStatus(current, input.libraryName);
    const references = await readProjectContentReferences({
      workspacePath: input.workspace.workspacePath,
      projectId: input.workspace.workspaceId,
    });
    const requirement = requireRequirement(references, input.libraryName);
    const candidates = (
      await listGlobalMediaLibraryConnections(this.globalMediaLibraryRoot)
    ).filter(
      (connection) =>
        connection.name === input.libraryName && connection.availability === 'available',
    );
    if (candidates.length > 1) {
      throw new WorkspaceMediaLibrarySyncError(
        'recovery-candidate-missing',
        'More than one exact-name global Media Library candidate is available.',
      );
    }
    const candidate = candidates[0];
    if (!candidate) {
      return this.storePlan({
        workspace: input.workspace,
        requirement,
        current,
        status,
        candidatePath: '',
      });
    }
    await validateRequirementAtRoot(candidate.linkPath, requirement);
    return this.storePlan({
      workspace: input.workspace,
      requirement,
      current,
      status,
      candidate,
      candidatePath: candidate.linkPath,
    });
  }

  async planSelectedDirectory(input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly libraryName: string;
    readonly locationKind: GlobalMediaLibraryLocationKind;
    readonly sourceDirectory: string;
  }): Promise<WorkspaceMediaLibraryRecoveryPlan> {
    if (path.basename(input.sourceDirectory) !== input.libraryName) {
      throw new WorkspaceMediaLibrarySyncError(
        'recovery-candidate-missing',
        'Selected Media Library directory must exactly match the required library name.',
      );
    }
    const current = await this.inspect(input.workspace);
    const status = requireRecoverableStatus(current, input.libraryName);
    const references = await readProjectContentReferences({
      workspacePath: input.workspace.workspacePath,
      projectId: input.workspace.workspaceId,
    });
    const requirement = requireRequirement(references, input.libraryName);
    await validateRequirementAtRoot(input.sourceDirectory, requirement);
    const exactConnections = (
      await listGlobalMediaLibraryConnections(this.globalMediaLibraryRoot)
    ).filter((connection) => connection.name === input.libraryName);
    if (exactConnections.length > 1) {
      throw new WorkspaceMediaLibrarySyncError(
        'recovery-candidate-missing',
        'More than one exact-name global Media Library connection exists.',
      );
    }
    const existingConnection = exactConnections[0];
    return this.storePlan({
      workspace: input.workspace,
      requirement,
      current,
      status,
      candidatePath: input.sourceDirectory,
      pendingGlobalConnection: {
        locationKind: existingConnection?.locationKind ?? input.locationKind,
        sourceDirectory: input.sourceDirectory,
        ...(existingConnection ? { replaceLibraryId: existingConnection.libraryId } : {}),
      },
    });
  }

  async applyRecovery(input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly planId: string;
    readonly expectedOperationRevision: string;
  }): Promise<WorkspaceMediaLibrarySyncProjection> {
    const plan = this.plans.get(input.planId);
    if (!plan || plan.publicPlan.workspaceId !== input.workspace.workspaceId) {
      throw stalePlan();
    }
    if (plan.publicPlan.operationRevision !== input.expectedOperationRevision) {
      throw stalePlan();
    }
    const current = await this.inspect(input.workspace);
    if (
      current.operationRevision !== plan.publicPlan.operationRevision ||
      current.requirementRevision !== plan.publicPlan.requirementRevision
    ) {
      this.plans.delete(input.planId);
      throw stalePlan();
    }
    const references = await readProjectContentReferences({
      workspacePath: input.workspace.workspacePath,
      projectId: input.workspace.workspaceId,
    });
    const requirement = requireRequirement(references, plan.publicPlan.libraryName);
    await validateRequirementAtRoot(plan.candidatePath, requirement);

    let createdGlobalLibraryId: string | undefined;
    let replacedGlobalConnection:
      Awaited<ReturnType<typeof replaceGlobalMediaLibraryConnection>> | undefined;
    let targetDirectory = plan.candidatePath;
    try {
      if (plan.pendingGlobalConnection?.replaceLibraryId) {
        replacedGlobalConnection = await replaceGlobalMediaLibraryConnection({
          mediaLibraryRoot: this.globalMediaLibraryRoot,
          libraryId: plan.pendingGlobalConnection.replaceLibraryId,
          sourceDirectory: plan.pendingGlobalConnection.sourceDirectory,
        });
        targetDirectory = requireGlobalConnection(
          await listGlobalMediaLibraryConnections(this.globalMediaLibraryRoot),
          plan.pendingGlobalConnection.replaceLibraryId,
        ).linkPath;
      } else if (plan.pendingGlobalConnection) {
        const created = await createGlobalMediaLibraryConnection({
          mediaLibraryRoot: this.globalMediaLibraryRoot,
          sourceDirectory: plan.pendingGlobalConnection.sourceDirectory,
          locationKind: plan.pendingGlobalConnection.locationKind,
        });
        createdGlobalLibraryId = created.libraryId;
        const connection = (
          await listGlobalMediaLibraryConnections(this.globalMediaLibraryRoot)
        ).find((candidate) => candidate.libraryId === created.libraryId);
        if (!connection || connection.availability !== 'available') {
          throw new Error('New global Media Library connection is unavailable.');
        }
        targetDirectory = connection.linkPath;
      }

      const workspaceEntry = path.join(
        input.workspace.workspacePath,
        ...WORKSPACE_MEDIA_LIBRARY_DIRECTORY.split('/'),
        plan.publicPlan.libraryName,
      );
      const entry = await optionalLstat(workspaceEntry);
      if (!entry) {
        await createWorkspaceLinkedMediaLibrary({
          workspaceRoot: input.workspace.workspacePath,
          name: plan.publicPlan.libraryName,
          targetDirectory,
        });
      } else if (entry.isSymbolicLink()) {
        await replaceWorkspaceLinkedMediaLibrary({
          workspaceRoot: input.workspace.workspacePath,
          name: plan.publicPlan.libraryName,
          targetDirectory,
        });
      } else {
        throw new WorkspaceMediaLibrarySyncError(
          'entry-conflict',
          'Media Library recovery refuses to replace a real workspace entry.',
        );
      }
    } catch (error: unknown) {
      if (replacedGlobalConnection) {
        try {
          await rollbackGlobalMediaLibraryConnection({
            mediaLibraryRoot: this.globalMediaLibraryRoot,
            rollback: replacedGlobalConnection,
          });
        } catch (rollbackError: unknown) {
          throw new AggregateError(
            [error, rollbackError],
            'Media Library recovery failed and global connection rollback also failed.',
          );
        }
      } else if (createdGlobalLibraryId) {
        try {
          await removeGlobalMediaLibraryConnection({
            mediaLibraryRoot: this.globalMediaLibraryRoot,
            libraryId: createdGlobalLibraryId,
          });
        } catch (rollbackError: unknown) {
          throw new AggregateError(
            [error, rollbackError],
            'Media Library recovery failed and global connection rollback also failed.',
          );
        }
      }
      throw error;
    } finally {
      this.plans.delete(input.planId);
    }
    return this.inspect(input.workspace);
  }

  cancelRecovery(input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly planId: string;
  }): void {
    const plan = this.plans.get(input.planId);
    if (!plan || plan.publicPlan.workspaceId !== input.workspace.workspaceId) {
      throw stalePlan();
    }
    this.plans.delete(input.planId);
  }

  async linkGlobalLibrary(input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly libraryId: string;
  }): Promise<void> {
    const connection = requireGlobalConnection(
      await listGlobalMediaLibraryConnections(this.globalMediaLibraryRoot),
      input.libraryId,
    );
    if (connection.availability !== 'available') {
      throw new WorkspaceMediaLibrarySyncError(
        'target-unavailable',
        'The selected global Media Library is unavailable.',
      );
    }
    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: input.workspace.workspacePath,
      name: connection.name,
      targetDirectory: connection.linkPath,
    });
  }

  async addDirectoryLibrary(input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly sourceDirectory: string;
    readonly locationKind: GlobalMediaLibraryLocationKind;
  }): Promise<void> {
    const created = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: this.globalMediaLibraryRoot,
      sourceDirectory: input.sourceDirectory,
      locationKind: input.locationKind,
    });
    try {
      const connection = requireGlobalConnection(
        await listGlobalMediaLibraryConnections(this.globalMediaLibraryRoot),
        created.libraryId,
      );
      if (connection.availability !== 'available') {
        throw new Error('New global Media Library connection is unavailable.');
      }
      await createWorkspaceLinkedMediaLibrary({
        workspaceRoot: input.workspace.workspacePath,
        name: connection.name,
        targetDirectory: connection.linkPath,
      });
    } catch (error: unknown) {
      try {
        await removeGlobalMediaLibraryConnection({
          mediaLibraryRoot: this.globalMediaLibraryRoot,
          libraryId: created.libraryId,
        });
      } catch (rollbackError: unknown) {
        throw new AggregateError(
          [error, rollbackError],
          'Project Media Library setup failed and global connection rollback also failed.',
        );
      }
      throw error;
    }
  }

  async relinkDirectoryLibrary(input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly libraryName: string;
    readonly sourceDirectory: string;
    readonly locationKind: GlobalMediaLibraryLocationKind;
  }): Promise<void> {
    if (path.basename(input.sourceDirectory) !== input.libraryName) {
      throw new WorkspaceMediaLibrarySyncError(
        'recovery-candidate-missing',
        'Selected Media Library directory must exactly match the linked library name.',
      );
    }
    const exactConnections = (
      await listGlobalMediaLibraryConnections(this.globalMediaLibraryRoot)
    ).filter((connection) => connection.name === input.libraryName);
    if (exactConnections.length > 1) {
      throw new WorkspaceMediaLibrarySyncError(
        'recovery-candidate-missing',
        'More than one exact-name global Media Library connection exists.',
      );
    }
    const current = exactConnections[0];
    if (!current) {
      const created = await createGlobalMediaLibraryConnection({
        mediaLibraryRoot: this.globalMediaLibraryRoot,
        sourceDirectory: input.sourceDirectory,
        locationKind: input.locationKind,
      });
      try {
        const connection = requireGlobalConnection(
          await listGlobalMediaLibraryConnections(this.globalMediaLibraryRoot),
          created.libraryId,
        );
        await replaceWorkspaceLinkedMediaLibrary({
          workspaceRoot: input.workspace.workspacePath,
          name: input.libraryName,
          targetDirectory: connection.linkPath,
        });
      } catch (error: unknown) {
        try {
          await removeGlobalMediaLibraryConnection({
            mediaLibraryRoot: this.globalMediaLibraryRoot,
            libraryId: created.libraryId,
          });
        } catch (rollbackError: unknown) {
          throw new AggregateError(
            [error, rollbackError],
            'Media Library relink failed and new global connection rollback also failed.',
          );
        }
        throw error;
      }
      return;
    }

    const rollback = await replaceGlobalMediaLibraryConnection({
      mediaLibraryRoot: this.globalMediaLibraryRoot,
      libraryId: current.libraryId,
      sourceDirectory: input.sourceDirectory,
    });
    try {
      await replaceWorkspaceLinkedMediaLibrary({
        workspaceRoot: input.workspace.workspacePath,
        name: input.libraryName,
        targetDirectory: current.linkPath,
      });
    } catch (error: unknown) {
      try {
        await rollbackGlobalMediaLibraryConnection({
          mediaLibraryRoot: this.globalMediaLibraryRoot,
          rollback,
        });
      } catch (rollbackError: unknown) {
        throw new AggregateError(
          [error, rollbackError],
          'Media Library relink failed and global connection rollback also failed.',
        );
      }
      throw error;
    }
  }

  async removeLink(input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly libraryName: string;
  }): Promise<void> {
    await removeWorkspaceLinkedMediaLibrary({
      workspaceRoot: input.workspace.workspacePath,
      name: input.libraryName,
    });
  }

  private storePlan(input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly requirement: WorkspaceMediaLibraryRequirement;
    readonly current: WorkspaceMediaLibrarySyncProjection;
    readonly status: WorkspaceMediaLibraryStatus;
    readonly candidatePath: string;
    readonly candidate?: GlobalMediaLibraryConnection;
    readonly pendingGlobalConnection?: InternalRecoveryPlan['pendingGlobalConnection'];
  }): WorkspaceMediaLibraryRecoveryPlan {
    const planId = `media-library-recovery:${randomUUID()}`;
    const publicPlan: WorkspaceMediaLibraryRecoveryPlan = {
      planId,
      workspaceId: input.workspace.workspaceId,
      libraryName: input.requirement.libraryName,
      requirementRevision: input.current.requirementRevision,
      operationRevision: input.status.operationRevision,
      candidate: input.candidate
        ? {
            kind: 'global-alias',
            name: input.candidate.name,
            locationKind: input.candidate.locationKind,
          }
        : input.pendingGlobalConnection
          ? {
              kind: 'global-alias',
              name: input.requirement.libraryName,
              locationKind: input.pendingGlobalConnection.locationKind,
            }
          : {
              kind: 'directory-selection-required',
              name: input.requirement.libraryName,
            },
      referencedCount: input.requirement.descendants.length,
      validatedCount:
        input.candidate || input.pendingGlobalConnection ? input.requirement.descendants.length : 0,
    };
    this.plans.set(planId, {
      publicPlan,
      candidatePath: input.candidatePath,
      ...(input.pendingGlobalConnection
        ? { pendingGlobalConnection: input.pendingGlobalConnection }
        : {}),
    });
    return publicPlan;
  }
}

async function inspectStatuses(input: {
  readonly workspacePath: string;
  readonly globalMediaLibraryRoot: string;
  readonly references: ProjectContentReferenceSnapshot;
}): Promise<readonly WorkspaceMediaLibraryStatus[]> {
  const linkedLibraries = await listWorkspaceLinkedMediaLibraries(input.workspacePath);
  const requirements = new Map(
    input.references.requirements.requirements.map((requirement) => [
      requirement.libraryName,
      requirement,
    ]),
  );
  const names = new Set([
    ...requirements.keys(),
    ...linkedLibraries.map((library) => library.name),
  ]);
  const statuses: WorkspaceMediaLibraryStatus[] = [];
  for (const libraryName of [...names].sort((left, right) => left.localeCompare(right, 'en-US'))) {
    const requirement = requirements.get(libraryName);
    if (!requirement) {
      statuses.push(status(libraryName, 'unreferenced-linked', 0, 0));
      continue;
    }
    statuses.push(
      await inspectRequiredLibrary({
        workspacePath: input.workspacePath,
        globalMediaLibraryRoot: input.globalMediaLibraryRoot,
        requirement,
      }),
    );
  }
  return statuses;
}

async function inspectRequiredLibrary(input: {
  readonly workspacePath: string;
  readonly globalMediaLibraryRoot: string;
  readonly requirement: WorkspaceMediaLibraryRequirement;
}): Promise<WorkspaceMediaLibraryStatus> {
  const entryPath = path.join(
    input.workspacePath,
    ...WORKSPACE_MEDIA_LIBRARY_DIRECTORY.split('/'),
    input.requirement.libraryName,
  );
  const entry = await optionalLstat(entryPath);
  if (!entry) {
    return status(
      input.requirement.libraryName,
      'required-unlinked',
      input.requirement.references.length,
      input.requirement.descendants.length,
    );
  }
  if (!entry.isSymbolicLink()) {
    return status(
      input.requirement.libraryName,
      'entry-conflict',
      input.requirement.references.length,
      input.requirement.descendants.length,
      'entry-conflict',
      'A real workspace entry occupies the required Media Library path.',
    );
  }
  const linkTarget = await fs.readlink(entryPath);
  const resolvedLinkTarget = path.resolve(path.dirname(entryPath), linkTarget);
  if (isInsideLexically(resolvedLinkTarget, input.globalMediaLibraryRoot)) {
    const alias = await optionalLstat(resolvedLinkTarget);
    if (!alias) {
      return status(
        input.requirement.libraryName,
        'global-connection-missing',
        input.requirement.references.length,
        input.requirement.descendants.length,
        'global-connection-missing',
        'The project Media Library global connection is missing.',
      );
    }
  }
  try {
    const missingCount = await countMissingRequirementEntries(entryPath, input.requirement);
    if (missingCount > 0) {
      return status(
        input.requirement.libraryName,
        'content-incomplete',
        input.requirement.references.length,
        missingCount,
        'content-incomplete',
        'The Media Library does not contain every referenced entry.',
      );
    }
    return status(
      input.requirement.libraryName,
      'available',
      input.requirement.references.length,
      0,
    );
  } catch (error: unknown) {
    if (error instanceof WorkspaceMediaLibrarySyncError) throw error;
    return status(
      input.requirement.libraryName,
      'target-unavailable',
      input.requirement.references.length,
      input.requirement.descendants.length,
      'target-unavailable',
      'The Media Library target is unavailable.',
    );
  }
}

async function validateRequirementAtRoot(
  rootPath: string,
  requirement: WorkspaceMediaLibraryRequirement,
): Promise<void> {
  if (!rootPath) {
    throw new WorkspaceMediaLibrarySyncError(
      'recovery-candidate-missing',
      'Media Library recovery requires an explicit directory selection.',
    );
  }
  const missingCount = await countMissingRequirementEntries(rootPath, requirement);
  if (missingCount > 0) {
    throw new WorkspaceMediaLibrarySyncError(
      'recovery-candidate-incomplete',
      `Media Library recovery candidate is missing ${String(missingCount)} referenced entries.`,
    );
  }
}

async function countMissingRequirementEntries(
  rootPath: string,
  requirement: WorkspaceMediaLibraryRequirement,
): Promise<number> {
  const resolvedRoot = await fs.realpath(rootPath);
  const rootStat = await fs.stat(resolvedRoot);
  if (!rootStat.isDirectory()) throw new Error('Media Library root is not a directory.');
  let missingCount = 0;
  for (const descendant of requirement.descendants) {
    const candidate = path.join(resolvedRoot, ...descendant.split('/'));
    try {
      const resolvedCandidate = await fs.realpath(candidate);
      if (!isInside(resolvedCandidate, resolvedRoot)) {
        throw new WorkspaceMediaLibrarySyncError(
          'nested-link-escape',
          'Media Library descendant escapes its authorized root.',
        );
      }
      const candidateStat = await fs.stat(resolvedCandidate);
      if (!candidateStat.isFile()) missingCount += 1;
    } catch (error: unknown) {
      if (error instanceof WorkspaceMediaLibrarySyncError) throw error;
      if (isNodeError(error, 'ENOENT')) {
        missingCount += 1;
        continue;
      }
      throw error;
    }
  }
  return missingCount;
}

function requireRequirement(
  references: ProjectContentReferenceSnapshot,
  libraryName: string,
): WorkspaceMediaLibraryRequirement {
  const requirement = references.requirements.requirements.find(
    (candidate) => candidate.libraryName === libraryName,
  );
  if (!requirement) {
    throw new WorkspaceMediaLibrarySyncError(
      'stale-recovery-plan',
      'Required Media Library identity is stale.',
    );
  }
  return requirement;
}

function requireRecoverableStatus(
  projection: WorkspaceMediaLibrarySyncProjection,
  libraryName: string,
): WorkspaceMediaLibraryStatus {
  const status = projection.statuses.find((candidate) => candidate.libraryName === libraryName);
  if (
    !status ||
    status.referenceCount === 0 ||
    status.state === 'available' ||
    status.state === 'unreferenced-linked' ||
    status.state === 'entry-conflict'
  ) {
    throw new WorkspaceMediaLibrarySyncError(
      status?.state === 'entry-conflict' ? 'entry-conflict' : 'stale-recovery-plan',
      'Media Library is not in a recoverable state.',
    );
  }
  return status;
}

function status(
  libraryName: string,
  state: WorkspaceMediaLibraryStatus['state'],
  referenceCount: number,
  missingCount: number,
  diagnosticCode?: WorkspaceMediaLibrarySyncDiagnosticCode,
  message?: string,
): WorkspaceMediaLibraryStatus {
  return {
    libraryName,
    state,
    referenceCount,
    missingCount,
    operationRevision: 'pending',
    ...(diagnosticCode && message
      ? { diagnostic: { code: diagnosticCode, severity: 'error', message, missingCount } }
      : {}),
  };
}

function revisionFor(
  requirementRevision: string,
  statuses: readonly WorkspaceMediaLibraryStatus[],
): string {
  return `sha256:${createHash('sha256')
    .update(
      JSON.stringify([
        requirementRevision,
        statuses.map(({ libraryName, state, referenceCount, missingCount }) => [
          libraryName,
          state,
          referenceCount,
          missingCount,
        ]),
      ]),
    )
    .digest('hex')}`;
}

function stalePlan(): WorkspaceMediaLibrarySyncError {
  return new WorkspaceMediaLibrarySyncError(
    'stale-recovery-plan',
    'Media Library recovery plan is stale.',
  );
}

async function optionalLstat(filePath: string) {
  try {
    return await fs.lstat(filePath);
  } catch (error: unknown) {
    if (isNodeError(error, 'ENOENT')) return undefined;
    throw error;
  }
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`))
  );
}

function isInsideLexically(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === '' ||
    (relative !== '..' && !path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`))
  );
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function requireGlobalConnection(
  connections: readonly GlobalMediaLibraryConnection[],
  libraryId: string,
): GlobalMediaLibraryConnection {
  const connection = connections.find((candidate) => candidate.libraryId === libraryId);
  if (!connection) {
    throw new WorkspaceMediaLibrarySyncError(
      'recovery-candidate-missing',
      'The selected global Media Library identity is stale.',
    );
  }
  return connection;
}
