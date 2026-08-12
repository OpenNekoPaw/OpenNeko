import path from 'node:path';
import { createNodeHostContentReadService } from '@neko/content/node';
import {
  ProjectEntityBindingAvailabilityService,
  type ProjectEntityProjectionRepository,
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
      readonly projections: ProjectEntityProjectionRepository;
      readonly now?: () => string;
      readonly createMetadataBinding?: typeof createNodeWorkspaceSemanticEntityMetadataBinding;
      readonly createSemanticRuntime?: typeof createNodeWorkspaceSemanticEntityRuntime;
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
          domain: 'project-entity-projection',
        },
      },
      (this.options.now ?? (() => new Date().toISOString()))(),
    );
  }

  private async resolveState(
    workspace: NodeProjectEntityProjectionWorkspace,
  ): Promise<ProjectEntityProjectionState> {
    this.requireActive();
    const workspacePath = path.resolve(workspace.workspacePath);
    const current = this.states.get(workspace.workspaceId);
    if (current?.workspacePath === workspacePath) return current;
    if (current) {
      current.semantic.dispose();
      await current.binding.dispose();
      this.states.delete(workspace.workspaceId);
    }
    const createMetadataBinding =
      this.options.createMetadataBinding ?? createNodeWorkspaceSemanticEntityMetadataBinding;
    const binding = await createMetadataBinding({
      homedir: this.options.homedir,
      workDir: workspacePath,
      metadataStore: this.options.metadataStore,
      ...(this.options.now ? { now: this.options.now } : {}),
    });
    if (this.disposed) {
      await binding.dispose();
      this.requireActive();
    }
    if (binding.workspaceId !== workspace.workspaceId) {
      await binding.dispose();
      throw new Error('Project Entity projection resolved a different Workspace identity.');
    }
    const repository = new NodeProjectEntityRepository({
      workspacePath,
      projectId: workspace.workspaceId,
    });
    const createSemanticRuntime =
      this.options.createSemanticRuntime ?? createNodeWorkspaceSemanticEntityRuntime;
    let semantic: NodeWorkspaceSemanticEntityRuntime;
    try {
      semantic = await createSemanticRuntime({
        workspace: { workspaceId: workspace.workspaceId, workspacePath },
        projection: binding,
        getEntitySnapshot: async () => {
          const result = await repository.readAvailable();
          return { entities: result.document.entities };
        },
        ...(this.options.now ? { now: this.options.now } : {}),
      });
    } catch (error: unknown) {
      await binding.dispose();
      throw error;
    }
    if (this.disposed) {
      semantic.dispose();
      await binding.dispose();
      this.requireActive();
    }
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
