import type { CreateCharacterFromSourcesInput } from '@neko/chara/application';
import type { CharacterProject } from '@neko/chara/contracts';
import type { CreateProjectEntityRequest } from '@neko/entity-domain';
import type { WorldAuthoringService } from '@neko/world/application';
import type { WorldProject } from '@neko/world/contracts';
import type { ProjectLocalTargetRef } from '../contracts/project-target';
import type {
  ProjectLocalCharacterCreationReceipt,
  ProjectLocalCharacterCreationStep,
  ProjectLocalCharacterEntitySelection,
  ProjectWorkspaceAuthority,
} from '../contracts/project-local-authoring';
import type { ProjectEntityCharacterAssociationWriterPort } from './project-fact-ports';

export interface ProjectLocalCharacterAuthoringPort {
  createProject(
    input: CreateCharacterFromSourcesInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject>;
}

export interface ProjectLocalWorldAuthoringPort {
  createProject(
    input: Parameters<WorldAuthoringService['createProject']>[0],
    signal?: AbortSignal,
  ): Promise<WorldProject>;
}

export interface ProjectLocalEntityAuthoringPort {
  createCharacterEntity(request: CreateProjectEntityRequest, signal?: AbortSignal): Promise<void>;
  requireCharacterEntity(entityId: string, signal?: AbortSignal): Promise<void>;
}

export class ProjectLocalCharacterCreationError extends Error {
  readonly code = 'project-local-character-creation-incomplete';
  readonly repairActions = ['retry-missing-step'] as const;

  constructor(
    readonly receipt: ProjectLocalCharacterCreationReceipt,
    options: ErrorOptions,
  ) {
    super(
      `Project-local Character '${receipt.target.characterProjectId}' remains valid, but creation stopped before '${receipt.nextStep ?? 'completion'}'.`,
      options,
    );
    this.name = 'ProjectLocalCharacterCreationError';
  }
}

export class ProjectLocalAuthoringService {
  constructor(
    private readonly options: {
      readonly associations: ProjectEntityCharacterAssociationWriterPort;
      readonly characters: ProjectLocalCharacterAuthoringPort;
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
    readonly receipt: ProjectLocalCharacterCreationReceipt;
  }> {
    signal?.throwIfAborted();
    requireEntitySelection(entity);
    const project = await this.options.characters.createProject(input, signal);
    const target = {
      kind: 'character-project',
      characterProjectId: project.characterProjectId,
    } as const;
    const receipt = await this.continueCharacterCreation(
      {
        authority,
        target,
        entityId: entityIdentity(entity),
        completedSteps: ['character-project'],
        nextStep: 'project-entity',
      },
      entity,
      signal,
    );
    return { project, target, receipt };
  }

  async retryCharacterCreation(
    receipt: ProjectLocalCharacterCreationReceipt,
    entity: ProjectLocalCharacterEntitySelection,
    signal?: AbortSignal,
  ): Promise<ProjectLocalCharacterCreationReceipt> {
    requireEntitySelection(entity);
    requireRetryReceipt(receipt, entity);
    return await this.continueCharacterCreation(receipt, entity, signal);
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
    return { project, target };
  }

  private async continueCharacterCreation(
    receipt: ProjectLocalCharacterCreationReceipt,
    entity: ProjectLocalCharacterEntitySelection,
    signal?: AbortSignal,
  ): Promise<ProjectLocalCharacterCreationReceipt> {
    let current = receipt;
    try {
      if (current.nextStep === 'project-entity') {
        if (entity.kind === 'create') {
          await this.options.entities.createCharacterEntity(
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
          );
        } else {
          await this.options.entities.requireCharacterEntity(entity.entityId, signal);
        }
        current = advanceCharacterReceipt(
          current,
          'project-entity',
          'entity-character-association',
        );
      }
      if (current.nextStep === 'entity-character-association') {
        await this.options.associations.save({
          projectId: current.authority.contentProjectId,
          entityId: current.entityId,
          characterProjectId: current.target.characterProjectId,
        });
        current = advanceCharacterReceipt(current, 'entity-character-association');
      }
      return current;
    } catch (cause) {
      throw new ProjectLocalCharacterCreationError(current, { cause });
    }
  }
}

function entityIdentity(entity: ProjectLocalCharacterEntitySelection): string {
  return entity.entityId;
}

function requireEntitySelection(entity: ProjectLocalCharacterEntitySelection): void {
  if (entity.entityId.trim().length === 0) {
    throw new Error('Project-local Character creation requires an exact Entity identity.');
  }
  if (entity.kind === 'create' && entity.name.trim().length === 0) {
    throw new Error('Project-local Character Entity creation requires a name.');
  }
}

function advanceCharacterReceipt(
  receipt: ProjectLocalCharacterCreationReceipt,
  completed: Exclude<ProjectLocalCharacterCreationStep, 'character-project'>,
  nextStep?: Exclude<ProjectLocalCharacterCreationStep, 'character-project'>,
): ProjectLocalCharacterCreationReceipt {
  return {
    authority: receipt.authority,
    target: receipt.target,
    entityId: receipt.entityId,
    completedSteps: [...receipt.completedSteps, completed],
    ...(nextStep === undefined ? {} : { nextStep }),
  };
}

function requireRetryReceipt(
  receipt: ProjectLocalCharacterCreationReceipt,
  entity: ProjectLocalCharacterEntitySelection,
): void {
  for (const [label, identity] of [
    ['Workspace', receipt.authority.workspaceId],
    ['Content Project', receipt.authority.contentProjectId],
    ['CharacterProject', receipt.target.characterProjectId],
    ['Project Entity', receipt.entityId],
  ] as const) {
    if (identity.trim().length === 0) {
      throw new Error(`Project-local Character retry receipt requires an exact ${label} identity.`);
    }
  }
  if (receipt.entityId !== entityIdentity(entity)) {
    throw new Error('Project-local Character retry Entity identity mismatch.');
  }
  const validSteps: readonly ProjectLocalCharacterCreationStep[] = [
    'character-project',
    'project-entity',
    'entity-character-association',
  ];
  const expectedCompleted =
    receipt.nextStep === undefined
      ? validSteps
      : validSteps.slice(0, validSteps.indexOf(receipt.nextStep));
  if (receipt.nextStep !== undefined && !validSteps.includes(receipt.nextStep)) {
    throw new Error('Project-local Character retry receipt has an unknown next step.');
  }
  if (receipt.nextStep === undefined) {
    throw new Error('Project-local Character creation receipt is already complete.');
  }
  if (
    expectedCompleted.length !== receipt.completedSteps.length ||
    expectedCompleted.some((step, index) => receipt.completedSteps[index] !== step)
  ) {
    throw new Error('Project-local Character retry receipt is not a canonical step prefix.');
  }
}
