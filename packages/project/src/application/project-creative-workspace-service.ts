import {
  parseProjectCreativeWorkspaceProjection,
  type ProjectCreativeWorkspaceProjection,
} from '../contracts/project-composition';
import type { ProjectCompositionService } from './project-composition-service';
import type { ProjectGlobalReferenceMutation } from '../contracts/project-composition';
import type { ProjectGlobalReferenceMutationService } from './project-global-reference-mutation-service';

export class ProjectCreativeWorkspaceService {
  constructor(
    private readonly ports: {
      readonly composition: Pick<ProjectCompositionService, 'read'>;
      readonly mutations?: Pick<ProjectGlobalReferenceMutationService, 'execute'>;
    },
  ) {}

  async read(input: {
    readonly projectId: string;
    readonly signal?: AbortSignal;
  }): Promise<ProjectCreativeWorkspaceProjection> {
    input.signal?.throwIfAborted();
    return parseProjectCreativeWorkspaceProjection({
      composition: await this.ports.composition.read(input),
    });
  }

  async mutate(input: {
    readonly projectId: string;
    readonly mutation: ProjectGlobalReferenceMutation;
    readonly signal?: AbortSignal;
  }): Promise<ProjectCreativeWorkspaceProjection> {
    input.signal?.throwIfAborted();
    if (!this.ports.mutations) {
      throw new Error('Project Creative Workspace mutation capability is unavailable.');
    }
    await this.ports.mutations.execute(input);
    return this.read(input);
  }
}
