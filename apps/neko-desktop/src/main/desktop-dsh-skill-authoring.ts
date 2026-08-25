import { constants as fsConstants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { AgentConversationContext } from '@neko/agent-contracts';
import type {
  CreateDshSkillInput,
  DshSkillAuthoringLayout,
} from '@neko/agent-contracts/dsh-skill-authoring';
import type {
  DshAcpSkillObservationProjection,
  DshAcpStagedSkillValidationProjection,
} from '@neko/agent-contracts/dsh-acp';
import {
  DshSkillAuthoringService,
  type DshSkillAuthoringStagingPort,
  type DshSkillAuthoringStagingRef,
  type DshSkillAuthoringTarget,
  type DshSkillAuthoringTargetPort,
  type DshSkillAuthoringValidationPort,
} from '@neko/agent-runtime/application';
import type { DesktopWorkspaceGrantAuthorityPort } from '@neko/host/desktop-workspace-grant-authority';

export interface DesktopDshSkillAuthoringBridgePort {
  validateStagedSkill(input: {
    readonly stagingRoot: string;
    readonly layout: DshSkillAuthoringLayout;
    readonly entry: string;
  }): Promise<DshAcpStagedSkillValidationProjection>;
  observeSkill(input: {
    readonly sessionId: string;
    readonly name: string;
  }): Promise<DshAcpSkillObservationProjection>;
}

interface DesktopStagedSkill {
  readonly stagingId: string;
  readonly root: string;
  readonly validationRoot: string;
  readonly resourceRoot: string;
  readonly entry: string;
  readonly layout: DshSkillAuthoringLayout;
  readonly candidateMain: string;
  readonly resources: readonly string[];
}

export function createDesktopDshSkillAuthoringService(options: {
  readonly assistantSpaceId: string;
  readonly personalSkillRoot: string;
  readonly workspaceGrants: Pick<DesktopWorkspaceGrantAuthorityPort, 'resolveAuthorizedWorkspace'>;
  readonly bridge: DesktopDshSkillAuthoringBridgePort;
}): DshSkillAuthoringService {
  const files = new DesktopDshSkillAuthoringFiles(options);
  return new DshSkillAuthoringService({
    targets: files,
    staging: files,
    validation: files,
    catalog: {
      async observe(sessionId, name, signal) {
        signal.throwIfAborted();
        const observation = await options.bridge.observeSkill({ sessionId, name });
        signal.throwIfAborted();
        return observation;
      },
    },
  });
}

class DesktopDshSkillAuthoringFiles
  implements
    DshSkillAuthoringTargetPort,
    DshSkillAuthoringStagingPort,
    DshSkillAuthoringValidationPort
{
  private readonly staged = new Map<string, DesktopStagedSkill>();

  constructor(
    private readonly options: {
      readonly assistantSpaceId: string;
      readonly personalSkillRoot: string;
      readonly workspaceGrants: Pick<
        DesktopWorkspaceGrantAuthorityPort,
        'resolveAuthorizedWorkspace'
      >;
      readonly bridge: DesktopDshSkillAuthoringBridgePort;
    },
  ) {
    if (!isAbsolute(options.personalSkillRoot)) {
      throw new Error('Desktop personal DSH Skill root must be absolute.');
    }
  }

  async resolve(context: AgentConversationContext): Promise<DshSkillAuthoringTarget> {
    if (context.kind === 'assistant') {
      if (context.assistantSpaceId !== this.options.assistantSpaceId) {
        throw diagnostic(
          'SKILL_AUTHORING_ASSISTANT_UNAUTHORIZED',
          `Assistant Space '${context.assistantSpaceId}' is not authorized for Skill creation.`,
        );
      }
      return {
        kind: 'personal',
        assistantSpaceId: context.assistantSpaceId,
        expectedSource: 'user-dsh',
      };
    }
    if (context.kind === 'workspace' || context.kind === 'authoring') {
      const resolution = await this.options.workspaceGrants.resolveAuthorizedWorkspace(
        context.workspaceGrantId,
        context.workspaceId,
      );
      if (resolution.workspace.workspaceId !== context.workspaceId) {
        throw diagnostic(
          'SKILL_AUTHORING_WORKSPACE_MISMATCH',
          'Skill authoring Workspace authority does not match the Conversation binding.',
        );
      }
      return {
        kind: 'workspace',
        workspaceId: context.workspaceId,
        workspaceGrantId: context.workspaceGrantId,
        expectedSource: 'project-agents',
      };
    }
    throw diagnostic(
      'SKILL_AUTHORING_CONTEXT_UNSUPPORTED',
      `CreateSkill is unavailable for ${context.kind} Conversation context.`,
    );
  }

  async stage(
    target: DshSkillAuthoringTarget,
    input: CreateDshSkillInput,
    signal: AbortSignal,
  ): Promise<DshSkillAuthoringStagingRef> {
    signal.throwIfAborted();
    const resources = normalizeResourcePaths(input);
    const stagingParent = await this.resolveStagingParent(target);
    const root = await mkdtemp(join(stagingParent, '.openneko-skill-authoring-'));
    const stagingId = randomUUID();
    const validationRoot = input.layout === 'directory' ? root : join(root, 'validation');
    const entry =
      input.layout === 'directory'
        ? 'candidate/SKILL.md'
        : allocateFlatValidationEntry(stagingId, resources);
    const candidateMain = join(validationRoot, ...entry.split('/'));
    const resourceRoot =
      input.layout === 'directory' ? join(validationRoot, 'candidate') : validationRoot;
    try {
      await mkdir(dirname(candidateMain), { recursive: true });
      await writeFile(candidateMain, input.skillMarkdown, { encoding: 'utf8', flag: 'wx' });
      await mkdir(resourceRoot, { recursive: true });
      for (const resource of resources) {
        signal.throwIfAborted();
        const path = join(resourceRoot, ...resource.path.split('/'));
        assertContained(resourceRoot, path, 'staged Skill resource');
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, resource.content, { encoding: 'utf8', flag: 'wx' });
      }
      const record: DesktopStagedSkill = {
        stagingId,
        root,
        validationRoot,
        resourceRoot,
        entry,
        layout: input.layout,
        candidateMain,
        resources: resources.map((resource) => resource.path),
      };
      this.staged.set(stagingId, record);
      return { stagingId };
    } catch (error) {
      return rethrowAfterCleanup(
        error,
        () => rm(root, { recursive: true, force: true }),
        'DSH Skill staging failed and staging cleanup also failed.',
      );
    }
  }

  async validate(
    staging: DshSkillAuthoringStagingRef,
    layout: DshSkillAuthoringLayout,
    signal: AbortSignal,
  ): Promise<{ readonly name: string }> {
    signal.throwIfAborted();
    const record = this.requireStaged(staging);
    if (record.layout !== layout) {
      throw diagnostic(
        'SKILL_AUTHORING_STAGING_MISMATCH',
        'Staged Skill layout does not match the validation request.',
      );
    }
    const validated = await this.options.bridge.validateStagedSkill({
      stagingRoot: record.validationRoot,
      layout,
      entry: record.entry,
    });
    signal.throwIfAborted();
    return validated;
  }

  async publish(
    input: {
      readonly staging: DshSkillAuthoringStagingRef;
      readonly target: DshSkillAuthoringTarget;
      readonly name: string;
      readonly layout: DshSkillAuthoringLayout;
    },
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const staged = this.requireStaged(input.staging);
    if (staged.layout !== input.layout) {
      throw diagnostic(
        'SKILL_AUTHORING_STAGING_MISMATCH',
        'Staged Skill layout does not match the publication request.',
      );
    }
    const root = await this.resolvePublicationRoot(input.target);
    const release = await acquirePublicationLock(root, input.name);
    let publicationFailure: unknown;
    try {
      signal.throwIfAborted();
      if (input.layout === 'directory') {
        const destination = join(root, input.name);
        await requireMissing(destination, input.name);
        await assertTreeHasNoSymlinks(dirname(staged.candidateMain));
        signal.throwIfAborted();
        await rename(dirname(staged.candidateMain), destination);
      } else if (staged.resources.includes(`${input.name}.md`)) {
        throw diagnostic(
          'SKILL_AUTHORING_RESOURCE_PATH_INVALID',
          'A flat Skill resource cannot target the published main Markdown file.',
        );
      } else {
        await publishFlatSkill({ staged, root, name: input.name, signal });
      }
    } catch (error) {
      publicationFailure = error;
    }
    try {
      await release();
    } catch (cleanupFailure) {
      if (publicationFailure !== undefined) {
        throw new AggregateError(
          [publicationFailure, cleanupFailure],
          'DSH Skill publication failed and publication-lock cleanup also failed.',
        );
      }
      throw cleanupFailure;
    }
    if (publicationFailure !== undefined) throw publicationFailure;
  }

  async discard(staging: DshSkillAuthoringStagingRef): Promise<void> {
    const record = this.requireStaged(staging);
    await rm(record.root, { recursive: true, force: true });
    this.staged.delete(staging.stagingId);
  }

  private requireStaged(staging: DshSkillAuthoringStagingRef): DesktopStagedSkill {
    const record = this.staged.get(staging.stagingId);
    if (record === undefined) {
      throw diagnostic(
        'SKILL_AUTHORING_STAGING_MISSING',
        `Skill staging '${staging.stagingId}' is unknown or already disposed.`,
      );
    }
    return record;
  }

  private async resolvePublicationRoot(target: DshSkillAuthoringTarget): Promise<string> {
    if (target.kind === 'personal') {
      if (target.assistantSpaceId !== this.options.assistantSpaceId) {
        throw diagnostic(
          'SKILL_AUTHORING_ASSISTANT_UNAUTHORIZED',
          'Personal Skill target no longer matches the authorized Assistant Space.',
        );
      }
      const parent = dirname(this.options.personalSkillRoot);
      return ensureDirectoryChain(parent, [basename(this.options.personalSkillRoot)]);
    }
    const resolution = await this.options.workspaceGrants.resolveAuthorizedWorkspace(
      target.workspaceGrantId,
      target.workspaceId,
    );
    if (resolution.workspace.workspaceId !== target.workspaceId) {
      throw diagnostic(
        'SKILL_AUTHORING_WORKSPACE_MISMATCH',
        'Skill publication Workspace authority changed before commit.',
      );
    }
    return ensureDirectoryChain(resolution.workspace.workspacePath, ['.agents', 'skills']);
  }

  private async resolveStagingParent(target: DshSkillAuthoringTarget): Promise<string> {
    if (target.kind === 'personal') {
      if (target.assistantSpaceId !== this.options.assistantSpaceId) {
        throw diagnostic(
          'SKILL_AUTHORING_ASSISTANT_UNAUTHORIZED',
          'Personal Skill staging target no longer matches the authorized Assistant Space.',
        );
      }
      return realpath(dirname(this.options.personalSkillRoot));
    }
    const resolution = await this.options.workspaceGrants.resolveAuthorizedWorkspace(
      target.workspaceGrantId,
      target.workspaceId,
    );
    if (resolution.workspace.workspaceId !== target.workspaceId) {
      throw diagnostic(
        'SKILL_AUTHORING_WORKSPACE_MISMATCH',
        'Skill staging Workspace authority changed before validation.',
      );
    }
    return realpath(resolution.workspace.workspacePath);
  }
}

async function publishFlatSkill(input: {
  readonly staged: DesktopStagedSkill;
  readonly root: string;
  readonly name: string;
  readonly signal: AbortSignal;
}): Promise<void> {
  const destinations = [
    ...input.staged.resources.map((path) => ({
      relativePath: path,
      source: join(input.staged.resourceRoot, ...path.split('/')),
    })),
    { relativePath: `${input.name}.md`, source: input.staged.candidateMain },
  ];
  for (const destination of destinations) {
    await requireMissing(join(input.root, ...destination.relativePath.split('/')), input.name);
  }
  const createdFiles: string[] = [];
  const createdDirectories: string[] = [];
  try {
    for (const destination of destinations) {
      input.signal.throwIfAborted();
      const target = join(input.root, ...destination.relativePath.split('/'));
      assertContained(input.root, target, 'flat Skill resource');
      createdDirectories.push(
        ...(await ensureRelativeDirectoryChain(
          input.root,
          posix.dirname(destination.relativePath),
        )),
      );
      await copyFile(destination.source, target, fsConstants.COPYFILE_EXCL);
      createdFiles.push(target);
    }
  } catch (error) {
    const cleanupFailures: unknown[] = [];
    for (const path of createdFiles.reverse()) {
      try {
        await rm(path, { force: true });
      } catch (cleanupFailure) {
        cleanupFailures.push(cleanupFailure);
      }
    }
    for (const directory of [...new Set(createdDirectories)].reverse()) {
      try {
        await rmdir(directory);
      } catch (cleanupFailure) {
        if (
          !hasNodeErrorCode(cleanupFailure, 'ENOTEMPTY') &&
          !hasNodeErrorCode(cleanupFailure, 'ENOENT')
        ) {
          cleanupFailures.push(cleanupFailure);
        }
      }
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [error, ...cleanupFailures],
        'Flat DSH Skill publication failed and rollback also failed.',
      );
    }
    throw error;
  }
}

function normalizeResourcePaths(input: CreateDshSkillInput): readonly {
  readonly path: string;
  readonly content: string;
}[] {
  const seen = new Set<string>();
  return input.resources.map((resource) => {
    const path = resource.path.trim();
    if (
      path.length === 0 ||
      path.includes('\\') ||
      path.startsWith('/') ||
      path.endsWith('/') ||
      posix.normalize(path) !== path ||
      path.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
    ) {
      throw diagnostic(
        'SKILL_AUTHORING_RESOURCE_PATH_INVALID',
        `Skill resource path '${resource.path}' is not a safe relative path.`,
      );
    }
    if (seen.has(path)) {
      throw diagnostic(
        'SKILL_AUTHORING_RESOURCE_DUPLICATE',
        `Skill resource path '${path}' is duplicated.`,
      );
    }
    if (input.layout === 'directory' && path === 'SKILL.md') {
      throw diagnostic(
        'SKILL_AUTHORING_RESOURCE_PATH_INVALID',
        `Skill resource path '${path}' conflicts with the staged main file.`,
      );
    }
    seen.add(path);
    return { path, content: resource.content };
  });
}

function allocateFlatValidationEntry(
  stagingId: string,
  resources: readonly { readonly path: string }[],
): string {
  const prefix = `.openneko-${stagingId}`;
  let suffix = 0;
  while (true) {
    const entry = suffix === 0 ? `${prefix}.md` : `${prefix}-${suffix}.md`;
    if (!resources.some((resource) => resource.path === entry)) return entry;
    suffix += 1;
  }
}

async function ensureDirectoryChain(root: string, segments: readonly string[]): Promise<string> {
  const canonicalRoot = await realpath(root);
  const rootStats = await lstat(canonicalRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw diagnostic(
      'SKILL_AUTHORING_ROOT_INVALID',
      'Skill authority root must be a real directory.',
    );
  }
  let current = canonicalRoot;
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.' || segment === '..' || segment.includes('/')) {
      throw diagnostic('SKILL_AUTHORING_ROOT_INVALID', 'Skill root segment is invalid.');
    }
    current = join(current, segment);
    try {
      const stats = await lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw diagnostic(
          'SKILL_AUTHORING_ROOT_INVALID',
          'Skill root contains a non-directory or symbolic-link entry.',
        );
      }
    } catch (error) {
      if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
      await mkdir(current);
    }
  }
  return current;
}

async function ensureRelativeDirectoryChain(root: string, directory: string): Promise<string[]> {
  if (directory === '.') return [];
  const created: string[] = [];
  try {
    let current = root;
    for (const segment of directory.split('/')) {
      current = join(current, segment);
      try {
        const stats = await lstat(current);
        if (!stats.isDirectory() || stats.isSymbolicLink()) {
          throw diagnostic(
            'SKILL_AUTHORING_RESOURCE_PATH_INVALID',
            'Flat Skill resource parent is not a real directory.',
          );
        }
      } catch (error) {
        if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
        await mkdir(current);
        created.push(current);
      }
    }
    return created;
  } catch (error) {
    const cleanupFailures: unknown[] = [];
    for (const path of created.reverse()) {
      try {
        await rmdir(path);
      } catch (cleanupError) {
        if (
          !hasNodeErrorCode(cleanupError, 'ENOTEMPTY') &&
          !hasNodeErrorCode(cleanupError, 'ENOENT')
        ) {
          cleanupFailures.push(cleanupError);
        }
      }
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [error, ...cleanupFailures],
        'Skill directory creation failed and rollback also failed.',
      );
    }
    throw error;
  }
}

async function acquirePublicationLock(root: string, name: string): Promise<() => Promise<void>> {
  const path = join(root, `.openneko-create-${name}.lock`);
  let handle;
  try {
    handle = await open(path, 'wx');
  } catch (error) {
    if (hasNodeErrorCode(error, 'EEXIST')) {
      throw diagnostic(
        'SKILL_AUTHORING_BUSY',
        `Skill '${name}' already has a publication in progress.`,
      );
    }
    throw error;
  }
  return async () => {
    let closeFailure: unknown;
    try {
      await handle.close();
    } catch (error) {
      closeFailure = error;
    }
    try {
      await rm(path, { force: true });
    } catch (removeFailure) {
      if (closeFailure !== undefined) {
        throw new AggregateError(
          [closeFailure, removeFailure],
          'Skill publication lock close and removal both failed.',
        );
      }
      throw removeFailure;
    }
    if (closeFailure !== undefined) throw closeFailure;
  };
}

async function rethrowAfterCleanup(
  operationFailure: unknown,
  cleanup: () => Promise<void>,
  message: string,
): Promise<never> {
  try {
    await cleanup();
  } catch (cleanupFailure) {
    throw new AggregateError([operationFailure, cleanupFailure], message);
  }
  throw operationFailure;
}

async function requireMissing(path: string, name: string): Promise<void> {
  try {
    await lstat(path);
    throw diagnostic(
      'SKILL_AUTHORING_ALREADY_EXISTS',
      `Skill '${name}' conflicts with an existing target.`,
    );
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return;
    throw error;
  }
}

async function assertTreeHasNoSymlinks(root: string): Promise<void> {
  const stats = await lstat(root);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw diagnostic('SKILL_AUTHORING_STAGING_INVALID', 'Staged Skill package is invalid.');
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw diagnostic('SKILL_AUTHORING_STAGING_INVALID', 'Staged Skill contains a symbolic link.');
    }
    if (entry.isDirectory()) await assertTreeHasNoSymlinks(path);
  }
}

function assertContained(root: string, target: string, label: string): void {
  const child = relative(root, target);
  if (child.length === 0 || child.startsWith('..') || isAbsolute(child)) {
    throw diagnostic('SKILL_AUTHORING_RESOURCE_PATH_INVALID', `${label} escapes its root.`);
  }
}

function diagnostic(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
