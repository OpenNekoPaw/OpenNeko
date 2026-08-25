import type {
  CreateCharacterFromSourcesInput,
  PrepareCharacterWorkspaceCopyInput,
} from '@neko/chara-domain/application';
import type { CharacterProject } from '@neko/chara-domain/contracts';
import type { CreateProjectEntityRequest, ProjectEntityDocument } from '@neko/entity-domain';
import type {
  PrepareWorldWorkspaceCopyInput,
  WorldAuthoringService,
} from '@neko/world-domain/application';
import type { WorldProject } from '@neko/world-domain/contracts';
import type { ProjectEntityCharacterAssociationFact } from '../contracts/project-entity-character-association';
import type {
  ProjectLocalCharacterEntitySelection,
  ProjectWorkspaceAuthority,
} from '../contracts/project-local-authoring';
import type { ProjectTargetMembershipFact } from '../contracts/project-persistence';
import type { ProjectLocalTargetRef } from '../contracts/project-target';

export interface ProjectLocalCharacterAuthoringPort {
  prepareProject(
    input: CreateCharacterFromSourcesInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject>;
  prepareWorkspaceCopy(
    input: PrepareCharacterWorkspaceCopyInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject>;
}

export interface ProjectLocalWorldAuthoringPort {
  prepareProject(
    input: Parameters<WorldAuthoringService['prepareProject']>[0],
    signal?: AbortSignal,
  ): Promise<WorldProject>;
  prepareWorkspaceCopy(
    input: PrepareWorldWorkspaceCopyInput,
    signal?: AbortSignal,
  ): Promise<WorldProject>;
}

export interface ProjectLocalEntityAuthoringPort {
  prepareCharacterEntity(
    request: CreateProjectEntityRequest,
    signal?: AbortSignal,
  ): Promise<{
    readonly previous: ProjectEntityDocument;
    readonly next: ProjectEntityDocument;
  }>;
  readCharacterEntityDocument(
    entityId: string,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument>;
}

export interface ProjectLocalCharacterCommit {
  readonly authority: ProjectWorkspaceAuthority;
  readonly project: CharacterProject;
  readonly entityDocument: {
    readonly previous: ProjectEntityDocument;
    readonly next?: ProjectEntityDocument;
  };
  readonly association: ProjectEntityCharacterAssociationFact;
  readonly membership: ProjectTargetMembershipFact;
}

export interface ProjectLocalWorldCommit {
  readonly authority: ProjectWorkspaceAuthority;
  readonly project: WorldProject;
  readonly membership: ProjectTargetMembershipFact;
}

export interface ProjectLocalAuthoringCommitPort {
  commitCharacter(input: ProjectLocalCharacterCommit, signal?: AbortSignal): Promise<void>;
  commitWorld(input: ProjectLocalWorldCommit, signal?: AbortSignal): Promise<void>;
}

export class ProjectLocalAuthoringService {
  constructor(
    private readonly options: {
      readonly characters: ProjectLocalCharacterAuthoringPort;
      readonly commit: ProjectLocalAuthoringCommitPort;
      readonly entities: ProjectLocalEntityAuthoringPort;
      readonly worlds: ProjectLocalWorldAuthoringPort;
      readonly now: () => string;
    },
  ) {}

  async createCharacter(
    authority: ProjectWorkspaceAuthority,
    input: CreateCharacterFromSourcesInput,
    entity: ProjectLocalCharacterEntitySelection,
    signal?: AbortSignal,
  ): Promise<{
    readonly project: CharacterProject;
    readonly target: Extract<ProjectLocalTargetRef, { readonly kind: 'character-project' }>;
  }> {
    signal?.throwIfAborted();
    requireAuthority(authority);
    requireEntitySelection(entity);
    const project = await this.options.characters.prepareProject(input, signal);
    return this.commitCharacter(authority, project, entity, signal);
  }

  async copyCharacter(
    authority: ProjectWorkspaceAuthority,
    input: PrepareCharacterWorkspaceCopyInput,
    entity: ProjectLocalCharacterEntitySelection,
    signal?: AbortSignal,
  ): Promise<{
    readonly project: CharacterProject;
    readonly target: Extract<ProjectLocalTargetRef, { readonly kind: 'character-project' }>;
  }> {
    signal?.throwIfAborted();
    requireAuthority(authority);
    requireEntitySelection(entity);
    const project = await this.options.characters.prepareWorkspaceCopy(input, signal);
    return this.commitCharacter(authority, project, entity, signal);
  }

  async createWorld(
    authority: ProjectWorkspaceAuthority,
    input: Parameters<WorldAuthoringService['prepareProject']>[0],
    signal?: AbortSignal,
  ): Promise<{
    readonly project: WorldProject;
    readonly target: Extract<ProjectLocalTargetRef, { readonly kind: 'world-project' }>;
  }> {
    signal?.throwIfAborted();
    requireAuthority(authority);
    const project = await this.options.worlds.prepareProject(input, signal);
    const target = { kind: 'world-project', worldProjectId: project.worldProjectId } as const;
    await this.options.commit.commitWorld(
      {
        authority,
        project,
        membership: { projectId: authority.projectId, target },
      },
      signal,
    );
    return { project, target };
  }

  async copyWorld(
    authority: ProjectWorkspaceAuthority,
    input: PrepareWorldWorkspaceCopyInput,
    signal?: AbortSignal,
  ): Promise<{
    readonly project: WorldProject;
    readonly target: Extract<ProjectLocalTargetRef, { readonly kind: 'world-project' }>;
  }> {
    signal?.throwIfAborted();
    requireAuthority(authority);
    const project = await this.options.worlds.prepareWorkspaceCopy(input, signal);
    const target = { kind: 'world-project', worldProjectId: project.worldProjectId } as const;
    await this.options.commit.commitWorld(
      {
        authority,
        project,
        membership: { projectId: authority.projectId, target },
      },
      signal,
    );
    return { project, target };
  }

  private async commitCharacter(
    authority: ProjectWorkspaceAuthority,
    project: CharacterProject,
    entity: ProjectLocalCharacterEntitySelection,
    signal?: AbortSignal,
  ): Promise<{
    readonly project: CharacterProject;
    readonly target: Extract<ProjectLocalTargetRef, { readonly kind: 'character-project' }>;
  }> {
    const entityDocument =
      entity.kind === 'create'
        ? await this.options.entities.prepareCharacterEntity(
            {
              entityId: entity.entityId,
              semantic: {
                kind: 'character',
                names: {
                  canonical: entity.name,
                  display: entity.name,
                  aliases: [],
                },
                representations: [],
              },
              createdAt: this.options.now(),
            },
            signal,
          )
        : {
            previous: await this.options.entities.readCharacterEntityDocument(
              entity.entityId,
              signal,
            ),
          };
    const target = {
      kind: 'character-project',
      characterProjectId: project.characterProjectId,
    } as const;
    await this.options.commit.commitCharacter(
      {
        authority,
        project,
        entityDocument,
        association: {
          projectId: authority.projectId,
          entityId: entity.entityId,
          characterProjectId: project.characterProjectId,
        },
        membership: { projectId: authority.projectId, target },
      },
      signal,
    );
    return { project, target };
  }
}

function requireAuthority(authority: ProjectWorkspaceAuthority): void {
  for (const [label, identity] of [
    ['Workspace', authority.workspaceId],
    ['Project', authority.projectId],
  ] as const) {
    if (identity.trim().length === 0) {
      throw new Error(`Project-local creation requires an exact ${label} identity.`);
    }
  }
}

function requireEntitySelection(entity: ProjectLocalCharacterEntitySelection): void {
  if (entity.entityId.trim().length === 0) {
    throw new Error('Project-local Character creation requires an exact Entity identity.');
  }
  if (entity.kind === 'create' && entity.name.trim().length === 0) {
    throw new Error('Project-local Character Entity creation requires a name.');
  }
}
