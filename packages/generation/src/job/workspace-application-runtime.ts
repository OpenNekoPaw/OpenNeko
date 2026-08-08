import type { GenerationJobPort } from './contracts';

export interface WorkspaceGenerationBinding {
  readonly workspaceId: string;
  readonly workspaceRoot: string;
}

export interface WorkspaceGenerationJobOwner {
  readonly jobs: GenerationJobPort;
  dispose(): Promise<void>;
}

export interface WorkspaceGenerationApplicationRuntimeOptions {
  readonly createOwner: (
    binding: WorkspaceGenerationBinding,
  ) => WorkspaceGenerationJobOwner | Promise<WorkspaceGenerationJobOwner>;
}

export type WorkspaceGenerationRuntimeErrorCode =
  | 'workspace-generation-binding-invalid'
  | 'workspace-generation-identity-conflict'
  | 'workspace-generation-runtime-disposed';

export class WorkspaceGenerationRuntimeError extends Error {
  constructor(
    readonly code: WorkspaceGenerationRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceGenerationRuntimeError';
  }
}

interface WorkspaceGenerationOwnerEntry {
  readonly binding: WorkspaceGenerationBinding;
  readonly owner: Promise<WorkspaceGenerationJobOwner>;
}

export class WorkspaceGenerationApplicationRuntime {
  private readonly owners = new Map<string, WorkspaceGenerationOwnerEntry>();
  private disposal: Promise<void> | undefined;
  private disposed = false;

  constructor(private readonly options: WorkspaceGenerationApplicationRuntimeOptions) {}

  async getWorkspaceJobs(binding: WorkspaceGenerationBinding): Promise<GenerationJobPort> {
    this.requireActive();
    const exactBinding = freezeBinding(binding);
    const existing = this.owners.get(exactBinding.workspaceId);
    if (existing) {
      assertSameBinding(existing.binding, exactBinding);
      const owner = await existing.owner;
      this.requireActive();
      return owner.jobs;
    }

    const entry: WorkspaceGenerationOwnerEntry = {
      binding: exactBinding,
      owner: Promise.resolve(this.options.createOwner(exactBinding)),
    };
    this.owners.set(exactBinding.workspaceId, entry);
    try {
      const owner = await entry.owner;
      this.requireActive();
      return owner.jobs;
    } catch (error) {
      if (this.owners.get(exactBinding.workspaceId) === entry && !this.disposed) {
        this.owners.delete(exactBinding.workspaceId);
      }
      throw error;
    }
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    const entries = [...this.owners.values()];
    this.disposal = disposeOwners(entries);
    return this.disposal;
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new WorkspaceGenerationRuntimeError(
        'workspace-generation-runtime-disposed',
        'Workspace Generation application runtime is disposed.',
      );
    }
  }
}

function freezeBinding(binding: WorkspaceGenerationBinding): WorkspaceGenerationBinding {
  const workspaceId = requireNonEmpty(binding.workspaceId, 'Workspace identity');
  const workspaceRoot = requireNonEmpty(binding.workspaceRoot, 'Workspace authorized root');
  return Object.freeze({ workspaceId, workspaceRoot });
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WorkspaceGenerationRuntimeError(
      'workspace-generation-binding-invalid',
      `${label} must be a non-empty string.`,
    );
  }
  return value;
}

function assertSameBinding(
  existing: WorkspaceGenerationBinding,
  requested: WorkspaceGenerationBinding,
): void {
  if (existing.workspaceRoot !== requested.workspaceRoot) {
    throw new WorkspaceGenerationRuntimeError(
      'workspace-generation-identity-conflict',
      `Workspace '${requested.workspaceId}' is already bound to another authorized root.`,
    );
  }
}

async function disposeOwners(entries: readonly WorkspaceGenerationOwnerEntry[]): Promise<void> {
  const initialized = await Promise.allSettled(entries.map((entry) => entry.owner));
  const owners = initialized.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const disposed = await Promise.allSettled(owners.map((owner) => owner.dispose()));
  const failures = disposed.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'One or more Workspace Generation owners failed to dispose.',
    );
  }
}
