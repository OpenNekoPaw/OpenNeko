import path from 'node:path';
import { createNodeHostContentReadService } from '@neko/content/node';
import {
  ProjectEntityBindingAvailabilityService,
  type EntityAssetProjectionRepository,
} from '@neko/entity-domain';
import type { LocalMetadataStore } from '@neko/local-metadata';
import {
  createNodeWorkspaceSemanticEntityMetadataBinding,
  createNodeWorkspaceSemanticEntityRuntime,
  type NodeWorkspaceSemanticEntityMetadataBinding,
  type NodeWorkspaceSemanticEntityRuntime,
} from '@neko/search-local-metadata';
import { NodeProjectEntityRepository } from './node-project-entity-repository';
import { refreshProjectEntityBindingAvailability } from './node-project-entity-binding-availability';

export interface NodeProjectEntityProjectionWorkspace {
  readonly workspaceId: string;
  readonly workspacePath: string;
}

export class NodeProjectEntityProjectionRuntime {
  private readonly states = new Map<string, ProjectEntityProjectionState>();
  private readonly refreshes = new Map<string, Promise<void>>();
  private disposed = false;

  constructor(
    private readonly options: {
      readonly homedir: string;
      readonly metadataStore: LocalMetadataStore;
      readonly projections: EntityAssetProjectionRepository;
      readonly now?: () => string;
    },
  ) {}

  async refresh(workspace: NodeProjectEntityProjectionWorkspace): Promise<void> {
    this.requireActive();
    const previous = this.refreshes.get(workspace.workspaceId) ?? Promise.resolve();
    const current = previous.then(
      () => this.refreshUnshared(workspace),
      () => this.refreshUnshared(workspace),
    );
    this.refreshes.set(workspace.workspaceId, current);
    try {
      await current;
    } finally {
      if (this.refreshes.get(workspace.workspaceId) === current) {
        this.refreshes.delete(workspace.workspaceId);
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const states = [...this.states.values()];
    for (const state of states) state.semantic.dispose();
    await Promise.allSettled(this.refreshes.values());
    this.refreshes.clear();
    this.states.clear();
    for (const state of states) {
      await state.binding.dispose();
    }
  }

  private async refreshUnshared(workspace: NodeProjectEntityProjectionWorkspace): Promise<void> {
    const state = await this.resolveState(workspace);
    await state.semantic.refresh();
    await refreshProjectEntityBindingAvailability(
      {
        documentRepository: state.repository,
        availability: state.availability,
        projections: this.options.projections,
        partition: {
          scope: 'workspace',
          workspaceId: workspace.workspaceId,
          domain: 'entity-asset-projection',
        },
      },
      (this.options.now ?? (() => new Date().toISOString()))(),
    );
  }

  private async resolveState(
    workspace: NodeProjectEntityProjectionWorkspace,
  ): Promise<ProjectEntityProjectionState> {
    const workspacePath = path.resolve(workspace.workspacePath);
    const current = this.states.get(workspace.workspaceId);
    if (current?.workspacePath === workspacePath) return current;
    if (current) {
      current.semantic.dispose();
      await current.binding.dispose();
      this.states.delete(workspace.workspaceId);
    }
    const binding = await createNodeWorkspaceSemanticEntityMetadataBinding({
      homedir: this.options.homedir,
      workDir: workspacePath,
      metadataStore: this.options.metadataStore,
      ...(this.options.now ? { now: this.options.now } : {}),
    });
    if (binding.workspaceId !== workspace.workspaceId) {
      await binding.dispose();
      throw new Error('Project Entity projection resolved a different Workspace identity.');
    }
    const repository = new NodeProjectEntityRepository({
      workspacePath,
      projectId: workspace.workspaceId,
    });
    const semantic = await createNodeWorkspaceSemanticEntityRuntime({
      workspace: { workspaceId: workspace.workspaceId, workspacePath },
      projection: binding,
      getEntitySnapshot: async () => {
        const document = await repository.load();
        return { revision: document.revision, entities: document.entities };
      },
      ...(this.options.now ? { now: this.options.now } : {}),
    });
    const contentRead = createNodeHostContentReadService({ workspaceRoot: workspacePath });
    const stat = {
      stat: (
        locator: Parameters<typeof contentRead.stat>[0],
        options: Parameters<typeof contentRead.stat>[1],
      ) => contentRead.stat(locator, options),
    };
    const state: ProjectEntityProjectionState = {
      workspacePath,
      binding,
      semantic,
      repository,
      availability: new ProjectEntityBindingAvailabilityService({
        workspaceFile: stat,
        documentEntry: stat,
        generatedOutput: stat,
        packageResource: stat,
      }),
    };
    this.states.set(workspace.workspaceId, state);
    return state;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Project Entity projection runtime is disposed.');
  }
}

interface ProjectEntityProjectionState {
  readonly workspacePath: string;
  readonly binding: NodeWorkspaceSemanticEntityMetadataBinding;
  readonly semantic: NodeWorkspaceSemanticEntityRuntime;
  readonly repository: NodeProjectEntityRepository;
  readonly availability: ProjectEntityBindingAvailabilityService;
}
