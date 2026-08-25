import type { GenerationJobPort } from './contracts';

export type GenerationOwner =
  | { readonly kind: 'workspace'; readonly workspaceId: string }
  | { readonly kind: 'assistant'; readonly assistantSpaceId: string };

export interface GenerationBinding {
  readonly owner: GenerationOwner;
  readonly root: string;
}

export interface GenerationJobOwner {
  readonly jobs: GenerationJobPort;
  dispose(): Promise<void>;
}

export interface GenerationApplicationRuntimeOptions {
  readonly createOwner: (
    binding: GenerationBinding,
  ) => GenerationJobOwner | Promise<GenerationJobOwner>;
}

export type GenerationRuntimeErrorCode =
  'generation-binding-invalid' | 'generation-owner-conflict' | 'generation-runtime-disposed';

export class GenerationRuntimeError extends Error {
  constructor(
    readonly code: GenerationRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GenerationRuntimeError';
  }
}

interface GenerationOwnerEntry {
  readonly binding: GenerationBinding;
  readonly owner: Promise<GenerationJobOwner>;
}

export class GenerationApplicationRuntime {
  private readonly owners = new Map<string, GenerationOwnerEntry>();
  private disposal: Promise<void> | undefined;
  private disposed = false;

  constructor(private readonly options: GenerationApplicationRuntimeOptions) {}

  async getJobs(binding: GenerationBinding): Promise<GenerationJobPort> {
    this.requireActive();
    const exactBinding = freezeBinding(binding);
    const key = ownerKey(exactBinding.owner);
    const existing = this.owners.get(key);
    if (existing) {
      assertSameBinding(existing.binding, exactBinding);
      const owner = await existing.owner;
      this.requireActive();
      return owner.jobs;
    }

    const entry: GenerationOwnerEntry = {
      binding: exactBinding,
      owner: Promise.resolve(this.options.createOwner(exactBinding)),
    };
    this.owners.set(key, entry);
    try {
      const owner = await entry.owner;
      this.requireActive();
      return owner.jobs;
    } catch (error) {
      if (this.owners.get(key) === entry && !this.disposed) {
        this.owners.delete(key);
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
      throw new GenerationRuntimeError(
        'generation-runtime-disposed',
        'Generation application runtime is disposed.',
      );
    }
  }
}

function freezeBinding(binding: GenerationBinding): GenerationBinding {
  const owner = freezeOwner(binding.owner);
  const root = requireNonEmpty(binding.root, 'Generation owner root');
  return Object.freeze({ owner, root });
}

function freezeOwner(owner: GenerationOwner): GenerationOwner {
  switch (owner.kind) {
    case 'workspace':
      return Object.freeze({
        kind: owner.kind,
        workspaceId: requireNonEmpty(owner.workspaceId, 'Workspace identity'),
      });
    case 'assistant':
      return Object.freeze({
        kind: owner.kind,
        assistantSpaceId: requireNonEmpty(owner.assistantSpaceId, 'Assistant Space identity'),
      });
  }
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GenerationRuntimeError(
      'generation-binding-invalid',
      `${label} must be a non-empty string.`,
    );
  }
  return value;
}

function ownerKey(owner: GenerationOwner): string {
  return owner.kind === 'workspace'
    ? `workspace:${owner.workspaceId}`
    : `assistant:${owner.assistantSpaceId}`;
}

function assertSameBinding(existing: GenerationBinding, requested: GenerationBinding): void {
  if (existing.root !== requested.root) {
    throw new GenerationRuntimeError(
      'generation-owner-conflict',
      `Generation owner '${ownerKey(requested.owner)}' is already bound to another authorized root.`,
    );
  }
}

async function disposeOwners(entries: readonly GenerationOwnerEntry[]): Promise<void> {
  const initialized = await Promise.allSettled(entries.map((entry) => entry.owner));
  const owners = initialized.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const disposed = await Promise.allSettled(owners.map((owner) => owner.dispose()));
  const failures = disposed.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, 'One or more Generation owners failed to dispose.');
  }
}
