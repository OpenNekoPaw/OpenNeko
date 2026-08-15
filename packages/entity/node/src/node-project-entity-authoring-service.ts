import {
  ProjectEntityContractError,
  ProjectEntityOperationService,
  requireActiveProjectEntity,
  type CreateProjectEntityRequest,
  type ProjectEntityCandidateWorkflowPort,
  type ProjectEntityDocument,
  type ProjectEntityOperationCommitPort,
} from '@neko/entity-domain';
import { NodeProjectEntityRepository } from './node-project-entity-repository';

export interface NodeProjectEntityAuthoringServiceOptions {
  readonly workspace: {
    readonly workspaceId: string;
    readonly workspacePath: string;
  };
}

export class NodeProjectEntityAuthoringService {
  private readonly repository: NodeProjectEntityRepository;
  private readonly operations: ProjectEntityOperationService;

  constructor(options: NodeProjectEntityAuthoringServiceOptions) {
    this.repository = new NodeProjectEntityRepository({
      workspacePath: options.workspace.workspacePath,
      projectId: options.workspace.workspaceId,
    });
    const commits: ProjectEntityOperationCommitPort = {
      commit: (mutation, signal) =>
        this.repository.mutate(async (current) => {
          const request = await mutation(current);
          if (request.candidateDecision || request.referencePlan) {
            throw authoringError(
              'Project-local Entity authoring cannot commit candidate or reference effects.',
            );
          }
          return request.next;
        }, signal),
    };
    this.operations = new ProjectEntityOperationService({
      candidates: unavailableCandidateWorkflow,
      references: [],
      commits,
    });
  }

  async createCharacterEntity(
    request: CreateProjectEntityRequest,
    signal?: AbortSignal,
  ): Promise<void> {
    if (request.semantic.kind !== 'character') {
      throw authoringError('Project-local Character creation requires a character-kind Entity.');
    }
    await this.operations.create(request, signal);
  }

  async prepareCharacterEntity(
    request: CreateProjectEntityRequest,
    signal?: AbortSignal,
  ): Promise<{
    readonly previous: ProjectEntityDocument;
    readonly next: ProjectEntityDocument;
  }> {
    if (request.semantic.kind !== 'character') {
      throw authoringError('Project-local Character creation requires a character-kind Entity.');
    }
    const previous = await this.repository.load(signal);
    let next: ProjectEntityDocument | undefined;
    const operations = new ProjectEntityOperationService({
      candidates: unavailableCandidateWorkflow,
      references: [],
      commits: {
        commit: async (mutation) => {
          const prepared = await mutation(previous);
          if (prepared.candidateDecision || prepared.referencePlan) {
            throw authoringError(
              'Project-local Entity authoring cannot commit candidate or reference effects.',
            );
          }
          next = prepared.next;
          return prepared.next;
        },
      },
    });
    await operations.create(request, signal);
    if (!next) throw authoringError('Project-local Entity preparation produced no document.');
    return { previous, next };
  }

  async readCharacterEntityDocument(
    entityId: string,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    const document = await this.repository.load(signal);
    const entity = requireActiveProjectEntity(document, entityId);
    if (entity.kind !== 'character') {
      throw authoringError(`Project Entity '${entityId}' is not character-kind.`, entityId);
    }
    return document;
  }

  async requireCharacterEntity(entityId: string, signal?: AbortSignal): Promise<void> {
    const entity = requireActiveProjectEntity(await this.repository.load(signal), entityId);
    if (entity.kind !== 'character') {
      throw authoringError(`Project Entity '${entityId}' is not character-kind.`, entityId);
    }
  }
}

const unavailableCandidateWorkflow: ProjectEntityCandidateWorkflowPort = {
  getCandidate: async () => {
    throw authoringError('Project-local Entity authoring does not consume Entity candidates.');
  },
  dismiss: async () => {
    throw authoringError('Project-local Entity authoring does not dismiss Entity candidates.');
  },
};

function authoringError(message: string, entityId?: string): ProjectEntityContractError {
  return new ProjectEntityContractError([
    {
      code: 'project-entity-operation-invalid',
      message,
      ...(entityId === undefined ? {} : { entityId }),
    },
  ]);
}
