import type { CreateCharacterProjectInput } from '@neko/chara/application';
import type { CharacterProject } from '@neko/chara/contracts';
import type { WorldAuthoringService } from '@neko/world/application';
import type { WorldProject } from '@neko/world/contracts';
import type { ContentProjectId, ProjectLocalTargetRef } from '../contracts/project-composition';
import type { ProjectCompositionService } from './project-composition-service';

export interface ProjectWorkspaceAuthority {
  readonly contentProjectId: ContentProjectId;
  readonly workspaceId: string;
}

export interface ProjectLocalCharacterAuthoringPort {
  createProject(
    input: CreateCharacterProjectInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject>;
  deleteUnlinkedProject(characterProjectId: string, signal?: AbortSignal): Promise<void>;
}

export interface ProjectLocalWorldAuthoringPort {
  createProject(
    input: Parameters<WorldAuthoringService['createProject']>[0],
    signal?: AbortSignal,
  ): Promise<WorldProject>;
  deleteUnlinkedProject(worldProjectId: string, signal?: AbortSignal): Promise<void>;
}

export class ProjectLocalTargetLinkError extends Error {
  readonly code = 'project-local-target-unlinked';

  constructor(
    readonly authority: ProjectWorkspaceAuthority,
    readonly target: ProjectLocalTargetRef,
    readonly repairActions: readonly ['retry-link', 'delete-through-owner'],
    options: ErrorOptions,
  ) {
    super(
      `Target '${targetIdentity(target)}' was created in Workspace '${authority.workspaceId}' but could not be linked to Content Project '${authority.contentProjectId}'.`,
      options,
    );
    this.name = 'ProjectLocalTargetLinkError';
  }
}

export class ProjectLocalAuthoringService {
  constructor(
    private readonly options: {
      readonly compositions: ProjectCompositionService;
      readonly characters: ProjectLocalCharacterAuthoringPort;
      readonly worlds: ProjectLocalWorldAuthoringPort;
    },
  ) {}

  async createCharacter(
    authority: ProjectWorkspaceAuthority,
    input: CreateCharacterProjectInput,
    signal?: AbortSignal,
  ): Promise<{ readonly project: CharacterProject; readonly target: ProjectLocalTargetRef }> {
    signal?.throwIfAborted();
    const project = await this.options.characters.createProject(input, signal);
    const target: ProjectLocalTargetRef = {
      kind: 'character-project',
      characterProjectId: project.characterProjectId,
    };
    await this.linkCreatedTarget(authority, target, signal);
    return { project, target };
  }

  async createWorld(
    authority: ProjectWorkspaceAuthority,
    input: Parameters<WorldAuthoringService['createProject']>[0],
    signal?: AbortSignal,
  ): Promise<{ readonly project: WorldProject; readonly target: ProjectLocalTargetRef }> {
    signal?.throwIfAborted();
    const project = await this.options.worlds.createProject(input, signal);
    const target: ProjectLocalTargetRef = {
      kind: 'world-project',
      worldProjectId: project.worldProjectId,
    };
    await this.linkCreatedTarget(authority, target, signal);
    return { project, target };
  }

  retryLink(
    authority: ProjectWorkspaceAuthority,
    target: ProjectLocalTargetRef,
    signal?: AbortSignal,
  ) {
    return this.options.compositions.addLocalTarget(authority.contentProjectId, target, signal);
  }

  deleteUnlinkedTarget(target: ProjectLocalTargetRef, signal?: AbortSignal): Promise<void> {
    return target.kind === 'character-project'
      ? this.options.characters.deleteUnlinkedProject(target.characterProjectId, signal)
      : this.options.worlds.deleteUnlinkedProject(target.worldProjectId, signal);
  }

  private async linkCreatedTarget(
    authority: ProjectWorkspaceAuthority,
    target: ProjectLocalTargetRef,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.options.compositions.addLocalTarget(authority.contentProjectId, target, signal);
    } catch (cause) {
      throw new ProjectLocalTargetLinkError(
        authority,
        target,
        ['retry-link', 'delete-through-owner'],
        {
          cause,
        },
      );
    }
  }
}

function targetIdentity(target: ProjectLocalTargetRef): string {
  return target.kind === 'character-project' ? target.characterProjectId : target.worldProjectId;
}
