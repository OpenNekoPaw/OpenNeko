import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  contentLocatorKey,
  type ContentReadService,
  type WorkspaceFileContentLocator,
} from '@neko/content-domain';
import { createCharacterAuthoringFileRepository } from '@neko/chara-node';
import { createWorldAuthoringFileRepository } from '@neko/world-node';
import {
  deriveProjectDependencySnapshot,
  type ProjectContentReferenceCatalog,
} from '@neko/project-domain/application';
import {
  projectPublicationDependencyKey,
  type ProjectDependencySnapshot,
} from '@neko/project-domain/contracts';
import {
  parsePortableMediaLibrarySnapshotPlan,
  parsePortableMediaLibrarySnapshotProgress,
  type PortableMediaLibrarySnapshotPlan,
  type PortableMediaLibrarySnapshotProgress,
  type WorkspaceMediaLibrarySyncDiagnosticCode,
} from '@neko/assets-domain/contracts';
import { decideProjectTraversal, type LocalMetadataRepositories } from '@neko/local-metadata';
import {
  createWorkspaceMediaLibrarySyncMetadataBinding,
  type WorkspaceMediaLibrarySyncMetadataBinding,
} from './workspace-media-library-sync-binding';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  rewriteProjectContentReferences,
  type ProjectContentReferenceSnapshot,
} from './project-content-reference-readers';
import {
  inspectProjectMediaLibraryPortability,
  type ProjectMediaLibraryPortabilityInspection,
} from './project-media-library-portability';
import { createProjectContentReadService } from './project-content-read-service';

const COPY_CHUNK_BYTE_LENGTH = 8 * 1024 * 1024;
const EXCLUDED_PROJECT_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.vite',
  'build',
  'cache',
  'caches',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'scratch',
  'temp',
  'tmp',
]);

interface PortableSnapshotEntry {
  readonly key: string;
  readonly libraryName: string;
  readonly source: WorkspaceFileContentLocator;
  readonly destinationPath: string;
  readonly byteLength: number;
  readonly fingerprint: string;
  readonly modifiedAt: string;
}

interface InternalPortableSnapshotPlan {
  readonly publicPlan: PortableMediaLibrarySnapshotPlan;
  readonly projectId: string;
  readonly workspacePath: string;
  readonly destinationPath: string;
  readonly stagingPath: string;
  readonly entries: readonly PortableSnapshotEntry[];
  readonly replacements: ReadonlyMap<string, string>;
  readonly projectTreeByteLength: number;
  readonly dependencyFingerprint: string;
}

export interface PortableMediaLibrarySnapshotResult {
  readonly status: 'completed';
  readonly snapshotId: string;
  readonly workspaceId: string;
  readonly requirementFingerprint: string;
  readonly metadataDiagnostic?: 'snapshot-checkpoint-unavailable';
}

export class PortableMediaLibrarySnapshotError extends Error {
  constructor(
    readonly code: WorkspaceMediaLibrarySyncDiagnosticCode,
    message: string,
  ) {
    super(message);
    this.name = 'PortableMediaLibrarySnapshotError';
  }
}

export class PortableMediaLibrarySnapshotService {
  private readonly plans = new Map<string, InternalPortableSnapshotPlan>();
  private readonly progress = new Map<string, PortableMediaLibrarySnapshotProgress>();
  private readonly activeControllers = new Map<string, AbortController>();
  private readonly createReader: (workspacePath: string, projectId: string) => ContentReadService;

  constructor(
    private readonly options: {
      readonly metadataRepositories: LocalMetadataRepositories;
      readonly globalMediaLibraryRoot: string;
      readonly createReader?: (workspacePath: string, projectId: string) => ContentReadService;
    },
  ) {
    this.createReader =
      options.createReader ??
      ((workspacePath, projectId) => {
        return createProjectContentReadService({
          projectId,
          workspaceRoot: workspacePath,
          globalMediaLibraryRoot: options.globalMediaLibraryRoot,
          defaultMaxBytes: COPY_CHUNK_BYTE_LENGTH,
        });
      });
  }

  async plan(input: {
    readonly projectId: string;
    readonly workspace: AssetWorkspaceResolution;
    readonly destinationPath: string;
  }): Promise<PortableMediaLibrarySnapshotPlan> {
    return this.buildPlan({
      ...input,
      snapshotId: randomUUID(),
      allowExistingStaging: false,
      writePlannedTask: true,
    });
  }

  async resume(input: {
    readonly projectId: string;
    readonly workspace: AssetWorkspaceResolution;
    readonly snapshotId: string;
    readonly destinationPath: string;
  }): Promise<PortableMediaLibrarySnapshotPlan> {
    const binding = this.binding(input.workspace.workspaceId);
    const task = await binding.readSnapshotTask(input.snapshotId);
    if (
      !task ||
      task.workspaceId !== input.workspace.workspaceId ||
      task.status === 'completed' ||
      task.status === 'cancelled'
    ) {
      throw new PortableMediaLibrarySnapshotError(
        'snapshot-source-stale',
        'Portable snapshot task cannot be resumed.',
      );
    }
    return this.buildPlan({
      ...input,
      allowExistingStaging: true,
      writePlannedTask: true,
    });
  }

  getProgress(snapshotId: string): PortableMediaLibrarySnapshotProgress | undefined {
    return this.progress.get(snapshotId);
  }

  async execute(input: {
    readonly projectId: string;
    readonly workspace: AssetWorkspaceResolution;
    readonly snapshotId: string;
    readonly expectedOperationFingerprint: string;
    readonly onProgress?: (progress: PortableMediaLibrarySnapshotProgress) => void;
  }): Promise<PortableMediaLibrarySnapshotResult> {
    const plan = this.plans.get(input.snapshotId);
    if (
      !plan ||
      plan.projectId !== input.projectId ||
      plan.publicPlan.workspaceId !== input.workspace.workspaceId ||
      plan.publicPlan.operationFingerprint !== input.expectedOperationFingerprint
    ) {
      throw staleSnapshot();
    }
    const binding = this.binding(input.workspace.workspaceId);
    const controller = new AbortController();
    this.activeControllers.set(input.snapshotId, controller);
    let published = false;
    try {
      await binding.writeSnapshotTask(taskPayload(plan, 'running', 0), Date.now());
      await this.assertPlanFresh(input.workspace, plan);
      await prepareStaging(plan.stagingPath);
      await copyProjectTree({
        sourceRoot: plan.workspacePath,
        destinationRoot: plan.stagingPath,
        signal: controller.signal,
      });

      const checkpoint = await binding.readSnapshotCheckpoint(input.snapshotId);
      const checkpointKeys =
        checkpoint?.requirementFingerprint === plan.publicPlan.requirementFingerprint
          ? new Set(checkpoint.completedEntryKeys)
          : new Set<string>();
      const completedKeys: string[] = [];
      let completedByteLength = 0;
      const reader = this.createReader(plan.workspacePath, plan.projectId);
      for (const entry of plan.entries) {
        assertNotCancelled(controller.signal);
        const stagedEntryPath = path.join(plan.stagingPath, ...entry.destinationPath.split('/'));
        const canResume =
          checkpointKeys.has(entry.key) && (await matchesStagedEntry(stagedEntryPath, entry));
        if (!canResume) {
          await copySnapshotEntry({
            reader,
            entry,
            destinationPath: stagedEntryPath,
            signal: controller.signal,
          });
        }
        completedKeys.push(entry.key);
        completedByteLength += entry.byteLength;
        try {
          await binding.writeSnapshotCheckpoint(
            {
              workspaceId: input.workspace.workspaceId,
              snapshotId: input.snapshotId,
              requirementFingerprint: plan.publicPlan.requirementFingerprint,
              completedEntryKeys: completedKeys,
            },
            Date.now(),
          );
        } catch {
          throw new PortableMediaLibrarySnapshotError(
            'snapshot-checkpoint-unavailable',
            'Portable snapshot checkpoint could not be committed.',
          );
        }
        this.emitProgress(
          progressFor(plan, 'running', completedKeys.length, completedByteLength),
          input.onProgress,
        );
      }

      assertNotCancelled(controller.signal);
      let stagedReferences: ProjectContentReferenceSnapshot;
      try {
        stagedReferences = await rewriteProjectContentReferences({
          stagedWorkspacePath: plan.stagingPath,
          projectId: plan.projectId,
          replacements: plan.replacements,
        });
      } catch (error: unknown) {
        throw new PortableMediaLibrarySnapshotError(
          'snapshot-rewrite-failed',
          error instanceof Error
            ? `Portable snapshot document rewrite failed: ${error.message}`
            : 'Portable snapshot document rewrite failed.',
        );
      }
      if (
        stagedReferences.requirements.coverage !== 'complete' ||
        stagedReferences.requirements.requirements.length > 0
      ) {
        throw new PortableMediaLibrarySnapshotError(
          'snapshot-rewrite-failed',
          'Portable snapshot still contains linked Media Library requirements.',
        );
      }
      await assertTargetFreeStagedProjectFacts(plan.stagingPath);
      await this.assertPlanFresh(input.workspace, plan);
      if (await optionalLstat(plan.destinationPath)) {
        throw new PortableMediaLibrarySnapshotError(
          'snapshot-publish-conflict',
          'Portable snapshot destination appeared before publication.',
        );
      }
      await fs.rename(plan.stagingPath, plan.destinationPath);
      published = true;

      const completedProgress = progressFor(
        plan,
        'completed',
        plan.entries.length,
        plan.publicPlan.totalByteLength,
      );
      this.emitProgress(completedProgress, input.onProgress);
      try {
        await binding.writeSnapshotTask(
          taskPayload(plan, 'completed', plan.entries.length),
          Date.now(),
        );
      } catch {
        return {
          status: 'completed',
          snapshotId: input.snapshotId,
          workspaceId: input.workspace.workspaceId,
          requirementFingerprint: plan.publicPlan.requirementFingerprint,
          metadataDiagnostic: 'snapshot-checkpoint-unavailable',
        };
      }
      return {
        status: 'completed',
        snapshotId: input.snapshotId,
        workspaceId: input.workspace.workspaceId,
        requirementFingerprint: plan.publicPlan.requirementFingerprint,
      };
    } catch (error: unknown) {
      const snapshotError = normalizeSnapshotError(error);
      if (!published) {
        await fs.rm(plan.stagingPath, { recursive: true, force: true });
        const status = snapshotError.code === 'snapshot-cancelled' ? 'cancelled' : 'failed';
        this.emitProgress(
          progressFor(
            plan,
            status,
            this.progress.get(input.snapshotId)?.completedEntryCount ?? 0,
            this.progress.get(input.snapshotId)?.completedByteLength ?? 0,
            snapshotError.code,
          ),
          input.onProgress,
        );
        try {
          await binding.writeSnapshotTask(
            taskPayload(
              plan,
              status,
              this.progress.get(input.snapshotId)?.completedEntryCount ?? 0,
              snapshotError.code,
            ),
            Date.now(),
          );
        } catch (taskError: unknown) {
          throw new AggregateError(
            [snapshotError, taskError],
            'Portable snapshot failed and its task state could not be committed.',
          );
        }
      }
      throw snapshotError;
    } finally {
      this.activeControllers.delete(input.snapshotId);
      this.plans.delete(input.snapshotId);
    }
  }

  async cancel(input: {
    readonly projectId: string;
    readonly workspace: AssetWorkspaceResolution;
    readonly snapshotId: string;
  }): Promise<void> {
    const plan = this.plans.get(input.snapshotId);
    if (
      !plan ||
      plan.projectId !== input.projectId ||
      plan.publicPlan.workspaceId !== input.workspace.workspaceId
    ) {
      throw staleSnapshot();
    }
    const controller = this.activeControllers.get(input.snapshotId);
    if (controller) {
      controller.abort();
      return;
    }
    await fs.rm(plan.stagingPath, { recursive: true, force: true });
    const cancelled = progressFor(plan, 'cancelled', 0, 0, 'snapshot-cancelled');
    this.progress.set(input.snapshotId, cancelled);
    await this.binding(input.workspace.workspaceId).writeSnapshotTask(
      taskPayload(plan, 'cancelled', 0, 'snapshot-cancelled'),
      Date.now(),
    );
    this.plans.delete(input.snapshotId);
  }

  private async buildPlan(input: {
    readonly projectId: string;
    readonly workspace: AssetWorkspaceResolution;
    readonly destinationPath: string;
    readonly snapshotId: string;
    readonly allowExistingStaging: boolean;
    readonly writePlannedTask: boolean;
  }): Promise<PortableMediaLibrarySnapshotPlan> {
    const { destinationPath, stagingPath } = await validateDestination({
      workspacePath: input.workspace.workspacePath,
      destinationPath: input.destinationPath,
      snapshotId: input.snapshotId,
      allowExistingStaging: input.allowExistingStaging,
    });
    const inspection = await inspectProjectMediaLibraryPortability({
      projectId: input.projectId,
      workspace: input.workspace,
      globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
    });
    const references = inspection.references;
    requireSnapshotReady(inspection);
    const dependencies = await inspectPortableProjectDependencies({
      projectId: input.projectId,
      workspacePath: input.workspace.workspacePath,
      references,
    });
    requirePortableDependenciesReady(dependencies);
    const reader = this.createReader(input.workspace.workspacePath, input.projectId);
    const entries = await buildSnapshotEntries({
      references,
      reader,
      workspacePath: input.workspace.workspacePath,
    });
    const projectTreeByteLength = await measureProjectTree(input.workspace.workspacePath);
    const totalByteLength = entries.reduce((total, entry) => total + entry.byteLength, 0);
    await requireCapacity(path.dirname(destinationPath), projectTreeByteLength + totalByteLength);

    const libraries = [...new Set(entries.map((entry) => entry.libraryName))]
      .sort((left, right) => left.localeCompare(right, 'en-US'))
      .map((libraryName) => {
        const libraryEntries = entries.filter((entry) => entry.libraryName === libraryName);
        return {
          libraryName,
          entryCount: libraryEntries.length,
          totalByteLength: libraryEntries.reduce((total, entry) => total + entry.byteLength, 0),
        };
      });
    const publicPlan = parsePortableMediaLibrarySnapshotPlan({
      snapshotId: input.snapshotId,
      workspaceId: input.workspace.workspaceId,
      requirementFingerprint: references.requirements.fingerprint,
      operationFingerprint: combinedOperationFingerprint(
        inspection.operationFingerprint,
        dependencies.fingerprint,
      ),
      entryCount: entries.length,
      totalByteLength,
      libraries,
    });
    const plan: InternalPortableSnapshotPlan = {
      publicPlan,
      projectId: input.projectId,
      workspacePath: input.workspace.workspacePath,
      destinationPath,
      stagingPath,
      entries,
      replacements: new Map(
        entries.map((entry) => [contentLocatorKey(entry.source), entry.destinationPath]),
      ),
      projectTreeByteLength,
      dependencyFingerprint: dependencies.fingerprint,
    };
    if (input.writePlannedTask) {
      try {
        await this.binding(input.workspace.workspaceId).writeSnapshotTask(
          taskPayload(plan, 'planned', 0),
          Date.now(),
        );
      } catch {
        throw new PortableMediaLibrarySnapshotError(
          'snapshot-checkpoint-unavailable',
          'Portable snapshot plan could not be committed to the task ledger.',
        );
      }
    }
    this.plans.set(input.snapshotId, plan);
    this.progress.set(input.snapshotId, progressFor(plan, 'planned', 0, 0));
    return publicPlan;
  }

  private async assertPlanFresh(
    workspace: AssetWorkspaceResolution,
    plan: InternalPortableSnapshotPlan,
  ): Promise<void> {
    const inspection = await inspectProjectMediaLibraryPortability({
      projectId: plan.projectId,
      workspace,
      globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
    });
    const dependencies = await inspectPortableProjectDependencies({
      projectId: plan.projectId,
      workspacePath: workspace.workspacePath,
      references: inspection.references,
    });
    requirePortableDependenciesReady(dependencies);
    if (
      inspection.references.requirements.fingerprint !== plan.publicPlan.requirementFingerprint ||
      dependencies.fingerprint !== plan.dependencyFingerprint ||
      combinedOperationFingerprint(inspection.operationFingerprint, dependencies.fingerprint) !==
        plan.publicPlan.operationFingerprint
    ) {
      throw staleSnapshot();
    }
  }

  private binding(workspaceId: string): WorkspaceMediaLibrarySyncMetadataBinding {
    return createWorkspaceMediaLibrarySyncMetadataBinding({
      workspaceId,
      repositories: this.options.metadataRepositories,
    });
  }

  private emitProgress(
    progress: PortableMediaLibrarySnapshotProgress,
    listener: ((progress: PortableMediaLibrarySnapshotProgress) => void) | undefined,
  ): void {
    this.progress.set(progress.snapshotId, progress);
    listener?.(progress);
  }
}

async function inspectPortableProjectDependencies(input: {
  readonly projectId: string;
  readonly workspacePath: string;
  readonly references: ProjectContentReferenceSnapshot;
}): Promise<{
  readonly snapshot: ProjectDependencySnapshot;
  readonly fingerprint: string;
  readonly characterVersionIds: ReadonlySet<string>;
  readonly worldVersionIds: ReadonlySet<string>;
}> {
  const characters = createCharacterAuthoringFileRepository({
    workspaceRoot: input.workspacePath,
    scope: { kind: 'project', projectId: input.projectId },
  });
  const worlds = createWorldAuthoringFileRepository({
    workspaceRoot: input.workspacePath,
    scope: { kind: 'project', projectId: input.projectId },
  });
  const [characterCatalog, worldCatalog] = await Promise.all([
    characters.readAuthoringCatalog(),
    worlds.readAuthoringCatalog(),
  ]);
  const content: ProjectContentReferenceCatalog = {
    owners: input.references.owners,
    coveredOwnerKinds: (['canvas', 'cut', 'entity-representation'] as const).filter(
      (kind) => !input.references.requirements.missingOwnerKinds.includes(kind),
    ),
    diagnostics: input.references.diagnostics.map((diagnostic) => ({
      ownerKind: diagnostic.ownerKind,
      ownerId: diagnostic.ownerId,
      message: `Project document '${diagnostic.ownerId}' is invalid.`,
    })),
  };
  const snapshot = deriveProjectDependencySnapshot({
    projectId: input.projectId,
    content,
    characters: characterCatalog,
    worlds: worldCatalog,
  });
  const fingerprint = `sha256:${createHash('sha256')
    .update(
      JSON.stringify([
        snapshot.coverage,
        snapshot.missingOwnerKinds,
        snapshot.dependencies.map((item) => [
          projectPublicationDependencyKey(item.dependency),
          item.occurrences.map((occurrence) => [
            occurrence.ownerKind,
            occurrence.ownerId,
            occurrence.ownerFingerprint,
          ]),
        ]),
        snapshot.diagnostics.map((diagnostic) => [
          diagnostic.ownerKind,
          diagnostic.ownerId,
          diagnostic.message,
        ]),
      ]),
    )
    .digest('hex')}`;
  return {
    snapshot,
    fingerprint,
    characterVersionIds: new Set(
      characterCatalog.versions.map((version) => version.characterVersionId),
    ),
    worldVersionIds: new Set(worldCatalog.versions.map((version) => version.worldVersionId)),
  };
}

function requirePortableDependenciesReady(
  input: Awaited<ReturnType<typeof inspectPortableProjectDependencies>>,
): void {
  if (input.snapshot.coverage !== 'complete') {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-source-stale',
      `Portable snapshot reference coverage is incomplete for: ${input.snapshot.missingOwnerKinds.join(', ')}.`,
    );
  }
  for (const item of input.snapshot.dependencies) {
    const dependency = item.dependency;
    if (
      dependency.kind === 'character-version' &&
      !input.characterVersionIds.has(dependency.characterVersionId)
    ) {
      throw new PortableMediaLibrarySnapshotError(
        'snapshot-source-stale',
        `Referenced CharacterVersion '${dependency.characterVersionId}' is unavailable.`,
      );
    }
    if (
      dependency.kind === 'world-experience-version' &&
      !input.worldVersionIds.has(dependency.worldExperienceVersionId)
    ) {
      throw new PortableMediaLibrarySnapshotError(
        'snapshot-source-stale',
        `Referenced WorldVersion '${dependency.worldExperienceVersionId}' is unavailable.`,
      );
    }
  }
  const packageDependency = input.snapshot.dependencies.find(
    (item) =>
      item.dependency.kind === 'asset-revision' || item.dependency.kind === 'package-resource',
  );
  if (packageDependency) {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-content-unavailable',
      `Referenced Asset/package dependency '${projectPublicationDependencyKey(packageDependency.dependency)}' cannot be collected because the exact package export owner is unavailable.`,
    );
  }
}

function combinedOperationFingerprint(
  mediaFingerprint: string,
  dependencyFingerprint: string,
): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify([mediaFingerprint, dependencyFingerprint]))
    .digest('hex')}`;
}

async function buildSnapshotEntries(input: {
  readonly references: ProjectContentReferenceSnapshot;
  readonly reader: ContentReadService;
  readonly workspacePath: string;
}): Promise<readonly PortableSnapshotEntry[]> {
  const entries: PortableSnapshotEntry[] = [];
  for (const requirement of input.references.requirements.requirements) {
    for (const descendant of requirement.descendants) {
      const matchingReferences = requirement.references.filter(
        (reference) => reference.descendantPath === descendant,
      );
      const source = matchingReferences[0]?.locator;
      if (!source) {
        throw new PortableMediaLibrarySnapshotError(
          'snapshot-source-stale',
          'Portable snapshot requirement has no authoritative source locator.',
        );
      }
      const destinationPath = `media/collected/${requirement.libraryName}/${descendant}`;
      if (await optionalLstat(path.join(input.workspacePath, ...destinationPath.split('/')))) {
        throw new PortableMediaLibrarySnapshotError(
          'snapshot-destination-conflict',
          'A project-owned path conflicts with a collected media destination.',
        );
      }
      const content = await fingerprintSnapshotSource(input.reader, source);
      if (!Number.isSafeInteger(content.byteLength)) {
        throw new PortableMediaLibrarySnapshotError(
          'snapshot-content-unavailable',
          'Referenced linked media byte length exceeds the supported range.',
        );
      }
      entries.push({
        key: destinationPath,
        libraryName: requirement.libraryName,
        source,
        destinationPath,
        byteLength: content.byteLength,
        fingerprint: content.fingerprint,
        modifiedAt: content.modifiedAt,
      });
    }
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key, 'en-US'));
}

async function fingerprintSnapshotSource(
  reader: ContentReadService,
  source: WorkspaceFileContentLocator,
): Promise<{
  readonly byteLength: number;
  readonly fingerprint: string;
  readonly modifiedAt: string;
}> {
  const initial = await reader.stat(source);
  if (initial.status !== 'ready' || !initial.modifiedAt) {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-content-unavailable',
      'Referenced linked media is unavailable for portable collection.',
    );
  }
  const hash = createHash('sha256');
  let offset = 0;
  while (offset < initial.byteLength) {
    const length = Math.min(COPY_CHUNK_BYTE_LENGTH, initial.byteLength - offset);
    const content = await reader.read(source, {
      expectedFingerprint: initial.fingerprint,
      range: { offset, length },
      maxBytes: COPY_CHUNK_BYTE_LENGTH,
    });
    if (content.status !== 'ready' || content.bytes.byteLength !== length) {
      throw new PortableMediaLibrarySnapshotError(
        'snapshot-content-unavailable',
        'Referenced linked media changed while planning portable collection.',
      );
    }
    hash.update(content.bytes);
    offset += content.bytes.byteLength;
  }
  const final = await reader.stat(source, { expectedFingerprint: initial.fingerprint });
  if (
    final.status !== 'ready' ||
    final.byteLength !== initial.byteLength ||
    final.modifiedAt !== initial.modifiedAt
  ) {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-content-unavailable',
      'Referenced linked media changed while planning portable collection.',
    );
  }
  return {
    byteLength: initial.byteLength,
    fingerprint: `sha256:${hash.digest('hex')}`,
    modifiedAt: initial.modifiedAt,
  };
}

async function validateDestination(input: {
  readonly workspacePath: string;
  readonly destinationPath: string;
  readonly snapshotId: string;
  readonly allowExistingStaging: boolean;
}): Promise<{ readonly destinationPath: string; readonly stagingPath: string }> {
  if (!path.isAbsolute(input.destinationPath)) {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-destination-conflict',
      'Portable snapshot destination must be selected by Desktop Main.',
    );
  }
  const workspaceRealPath = await fs.realpath(input.workspacePath);
  const destinationParent = await fs.realpath(path.dirname(input.destinationPath));
  const destinationPath = path.join(destinationParent, path.basename(input.destinationPath));
  if (isInside(destinationPath, workspaceRealPath)) {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-destination-conflict',
      'Portable snapshot destination must be outside the source workspace.',
    );
  }
  if (await optionalLstat(destinationPath)) {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-destination-conflict',
      'Portable snapshot destination already exists.',
    );
  }
  const stagingPath = path.join(
    destinationParent,
    `.${path.basename(destinationPath)}.${input.snapshotId}.staging`,
  );
  const staging = await optionalLstat(stagingPath);
  if (
    staging &&
    (!input.allowExistingStaging || !staging.isDirectory() || staging.isSymbolicLink())
  ) {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-destination-conflict',
      'Portable snapshot staging destination conflicts with an existing entry.',
    );
  }
  return { destinationPath, stagingPath };
}

async function prepareStaging(stagingPath: string): Promise<void> {
  const existing = await optionalLstat(stagingPath);
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      throw new PortableMediaLibrarySnapshotError(
        'snapshot-destination-conflict',
        'Portable snapshot staging entry is invalid.',
      );
    }
    return;
  }
  await fs.mkdir(stagingPath);
}

async function copyProjectTree(input: {
  readonly sourceRoot: string;
  readonly destinationRoot: string;
  readonly signal: AbortSignal;
}): Promise<void> {
  await copyDirectory(input.sourceRoot, input.destinationRoot);

  async function copyDirectory(
    sourceDirectory: string,
    destinationDirectory: string,
  ): Promise<void> {
    assertNotCancelled(input.signal);
    const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });
    for (const entry of entries) {
      assertNotCancelled(input.signal);
      const sourcePath = path.join(sourceDirectory, entry.name);
      const relativePath = path.relative(input.sourceRoot, sourcePath).split(path.sep).join('/');
      const decision = decideProjectTraversal(
        relativePath,
        entry.isSymbolicLink() ? 'symbolic-link' : entry.isDirectory() ? 'directory' : 'file',
        'package',
      );
      if (decision.action === 'exclude-project-local') continue;
      if (entry.name.startsWith('.') || EXCLUDED_PROJECT_DIRECTORIES.has(entry.name)) continue;
      const destinationPath = path.join(destinationDirectory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await fs.mkdir(destinationPath, { recursive: true });
        await copyDirectory(sourcePath, destinationPath);
      } else if (entry.isFile()) {
        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        await fs.copyFile(sourcePath, destinationPath);
      }
    }
  }
}

async function measureProjectTree(workspacePath: string): Promise<number> {
  let byteLength = 0;
  await visit(workspacePath);
  return byteLength;

  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      const relativePath = path.relative(workspacePath, entryPath).split(path.sep).join('/');
      const decision = decideProjectTraversal(
        relativePath,
        entry.isSymbolicLink() ? 'symbolic-link' : entry.isDirectory() ? 'directory' : 'file',
        'package',
      );
      if (decision.action === 'exclude-project-local') continue;
      if (entry.name.startsWith('.') || EXCLUDED_PROJECT_DIRECTORIES.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(entryPath);
        byteLength += stat.size;
        if (!Number.isSafeInteger(byteLength)) {
          throw new PortableMediaLibrarySnapshotError(
            'snapshot-insufficient-capacity',
            'Portable snapshot project size exceeds the supported range.',
          );
        }
      }
    }
  }
}

async function requireCapacity(directory: string, requiredByteLength: number): Promise<void> {
  const stats = await fs.statfs(directory);
  const available = BigInt(stats.bavail) * BigInt(stats.bsize);
  if (available < BigInt(requiredByteLength)) {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-insufficient-capacity',
      'Portable snapshot destination does not have enough available capacity.',
    );
  }
}

const FORBIDDEN_PROJECT_FACT_KEYS = new Set([
  'absolutePath',
  'authorizationHandle',
  'connectionId',
  'credential',
  'credentials',
  'nativePath',
  'physicalTarget',
  'resolvedPath',
  'runtimeUrl',
]);

async function assertTargetFreeStagedProjectFacts(stagingRoot: string): Promise<void> {
  const factsRoot = path.join(stagingRoot, 'neko');
  const root = await optionalLstat(factsRoot);
  if (!root) return;
  if (!root.isDirectory() || root.isSymbolicLink()) {
    throw invalidStagedFacts('Portable snapshot Project facts root is invalid.');
  }
  await visit(factsRoot);

  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw invalidStagedFacts('Portable snapshot Project facts cannot contain symbolic links.');
      }
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLocaleLowerCase() !== '.json') continue;
      let value: unknown;
      try {
        value = JSON.parse(await fs.readFile(entryPath, 'utf8')) as unknown;
      } catch {
        throw invalidStagedFacts('Portable snapshot contains an invalid Project fact record.');
      }
      inspect(value);
    }
  }

  function inspect(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) inspect(item);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const record = value as Readonly<Record<string, unknown>>;
    for (const [key, item] of Object.entries(record)) {
      if (FORBIDDEN_PROJECT_FACT_KEYS.has(key)) {
        throw invalidStagedFacts(
          `Portable snapshot Project facts contain forbidden machine-local field '${key}'.`,
        );
      }
      inspect(item);
    }
    if (record['kind'] === 'workspace-file' && typeof record['path'] === 'string') {
      const normalized = record['path'].replaceAll('\\', '/');
      if (
        normalized === '.neko' ||
        normalized.startsWith('.neko/') ||
        normalized === 'neko/assets' ||
        normalized.startsWith('neko/assets/')
      ) {
        throw invalidStagedFacts(
          'Portable snapshot Project facts contain a retired machine-local content locator.',
        );
      }
    }
  }
}

function invalidStagedFacts(message: string): PortableMediaLibrarySnapshotError {
  return new PortableMediaLibrarySnapshotError('snapshot-rewrite-failed', message);
}

async function copySnapshotEntry(input: {
  readonly reader: ContentReadService;
  readonly entry: PortableSnapshotEntry;
  readonly destinationPath: string;
  readonly signal: AbortSignal;
}): Promise<void> {
  const before = await input.reader.stat(input.entry.source, { signal: input.signal });
  if (
    before.status !== 'ready' ||
    before.byteLength !== input.entry.byteLength ||
    before.modifiedAt !== input.entry.modifiedAt
  ) {
    throw staleSnapshot();
  }
  await fs.mkdir(path.dirname(input.destinationPath), { recursive: true });
  const handle = await fs.open(input.destinationPath, 'w');
  const hash = createHash('sha256');
  let offset = 0;
  try {
    while (offset < input.entry.byteLength) {
      assertNotCancelled(input.signal);
      const length = Math.min(COPY_CHUNK_BYTE_LENGTH, input.entry.byteLength - offset);
      const content = await input.reader.read(input.entry.source, {
        range: { offset, length },
        maxBytes: COPY_CHUNK_BYTE_LENGTH,
        signal: input.signal,
      });
      if (content.status !== 'ready' || content.bytes.byteLength !== length) {
        throw new PortableMediaLibrarySnapshotError(
          'snapshot-content-unavailable',
          'Referenced linked media became unavailable during collection.',
        );
      }
      await handle.write(content.bytes, 0, content.bytes.byteLength, offset);
      hash.update(content.bytes);
      offset += content.bytes.byteLength;
    }
  } finally {
    await handle.close();
  }
  const after = await input.reader.stat(input.entry.source, { signal: input.signal });
  if (
    after.status !== 'ready' ||
    after.byteLength !== input.entry.byteLength ||
    after.modifiedAt !== input.entry.modifiedAt
  ) {
    throw staleSnapshot();
  }
  const fingerprint = `sha256:${hash.digest('hex')}`;
  if (fingerprint !== input.entry.fingerprint) {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-content-unavailable',
      'Referenced linked media fingerprint changed during collection.',
    );
  }
}

async function matchesStagedEntry(
  stagedPath: string,
  entry: PortableSnapshotEntry,
): Promise<boolean> {
  const stat = await optionalLstat(stagedPath);
  if (!stat?.isFile() || stat.size !== entry.byteLength) return false;
  const bytes = await fs.readFile(stagedPath);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}` === entry.fingerprint;
}

function requireSnapshotReady(inspection: ProjectMediaLibraryPortabilityInspection): void {
  if (inspection.references.requirements.coverage !== 'complete') {
    throw new PortableMediaLibrarySnapshotError(
      'coverage-incomplete',
      'Portable snapshot requires complete project-document owner coverage.',
    );
  }
  if (inspection.nestedLinkEscapeCount > 0) {
    throw new PortableMediaLibrarySnapshotError(
      'nested-link-escape',
      'Portable snapshot rejects referenced content that escapes through a nested link.',
    );
  }
  if (
    inspection.portability.requirementFingerprint !==
      inspection.references.requirements.fingerprint ||
    inspection.portability.libraries.some(
      (status) => status.referenceCount > 0 && status.state !== 'available',
    )
  ) {
    throw new PortableMediaLibrarySnapshotError(
      'snapshot-content-unavailable',
      'Every referenced Media Library must be readable before collection.',
    );
  }
}

function taskPayload(
  plan: InternalPortableSnapshotPlan,
  status: 'planned' | 'running' | 'completed' | 'failed' | 'cancelled',
  completedEntryCount: number,
  diagnosticCode?: WorkspaceMediaLibrarySyncDiagnosticCode,
) {
  return {
    workspaceId: plan.publicPlan.workspaceId,
    snapshotId: plan.publicPlan.snapshotId,
    requirementFingerprint: plan.publicPlan.requirementFingerprint,
    status,
    completedEntryCount,
    totalEntryCount: plan.entries.length,
    ...(diagnosticCode ? { diagnosticCode } : {}),
  } as const;
}

function progressFor(
  plan: InternalPortableSnapshotPlan,
  status: PortableMediaLibrarySnapshotProgress['status'],
  completedEntryCount: number,
  completedByteLength: number,
  diagnosticCode?: WorkspaceMediaLibrarySyncDiagnosticCode,
): PortableMediaLibrarySnapshotProgress {
  return parsePortableMediaLibrarySnapshotProgress({
    snapshotId: plan.publicPlan.snapshotId,
    workspaceId: plan.publicPlan.workspaceId,
    requirementFingerprint: plan.publicPlan.requirementFingerprint,
    status,
    completedEntryCount,
    totalEntryCount: plan.entries.length,
    completedByteLength,
    totalByteLength: plan.publicPlan.totalByteLength,
    ...(diagnosticCode ? { diagnosticCode } : {}),
  });
}

function normalizeSnapshotError(error: unknown): PortableMediaLibrarySnapshotError {
  if (error instanceof PortableMediaLibrarySnapshotError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new PortableMediaLibrarySnapshotError(
      'snapshot-cancelled',
      'Portable snapshot was cancelled.',
    );
  }
  return new PortableMediaLibrarySnapshotError(
    'snapshot-content-unavailable',
    error instanceof Error ? error.message : 'Portable snapshot failed.',
  );
}

function staleSnapshot(): PortableMediaLibrarySnapshotError {
  return new PortableMediaLibrarySnapshotError(
    'snapshot-source-stale',
    'Portable snapshot plan is stale.',
  );
}

function assertNotCancelled(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw new PortableMediaLibrarySnapshotError(
    'snapshot-cancelled',
    'Portable snapshot was cancelled.',
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

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === code
  );
}
