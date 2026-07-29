import { DisposableStore } from './disposable-store.ts';
import type {
  CapabilityId,
  FeatureDefinition,
  FeatureDependencyRefs,
  FeatureId,
  FeatureRef,
  LazyCapability,
} from './types.ts';

type AnyFeatureDefinition = FeatureDefinition<FeatureDependencyRefs, unknown>;

interface RegisteredFeature {
  readonly id: FeatureId;
  readonly exports: unknown;
  readonly owner: DisposableStore;
  readonly controller: AbortController;
}

export interface HostKernelOptions {
  readonly capabilities?: readonly LazyCapability<unknown>[];
}

export class HostKernel {
  readonly #definitions: readonly AnyFeatureDefinition[];
  readonly #definitionsById: ReadonlyMap<FeatureId, AnyFeatureDefinition>;
  readonly #registered = new Map<FeatureId, RegisteredFeature>();
  readonly #registrationOrder: FeatureId[] = [];
  readonly #capabilities: readonly LazyCapability<unknown>[];
  #disposed = false;

  constructor(definitions: readonly AnyFeatureDefinition[], options: HostKernelOptions = {}) {
    this.#definitions = definitions;
    this.#definitionsById = validateFeaturePlan(definitions);
    this.#capabilities = validateCapabilityPlan(options.capabilities ?? []);
  }

  async registerAll(): Promise<void> {
    this.#assertActive();
    try {
      for (const definition of this.#definitions) {
        await this.#register(definition.ref.id);
      }
    } catch (error) {
      try {
        await this.dispose();
      } catch (disposeError) {
        throw new AggregateError(
          [error, disposeError],
          'OpenNeko registration and rollback both failed.',
        );
      }
      throw error;
    }
  }

  get<TExports>(ref: FeatureRef<TExports>): TExports {
    const registered = this.#registered.get(ref.id);
    if (!registered) {
      throw new Error(`Feature ${ref.id} is not registered.`);
    }
    return registered.exports as TExports;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const failures: unknown[] = [];
    for (const id of this.#registrationOrder.reverse()) {
      const registered = this.#registered.get(id);
      if (!registered) continue;
      registered.controller.abort(new Error(`Feature ${id} is disposing.`));
      try {
        await registered.owner.dispose();
      } catch (error) {
        failures.push(new Error(`Failed to dispose ${id}.`, { cause: error }));
      }
    }
    this.#registrationOrder.length = 0;
    this.#registered.clear();
    for (const capability of [...this.#capabilities].reverse()) {
      try {
        await capability.dispose();
      } catch (error) {
        failures.push(
          new Error(`Failed to dispose capability ${capability.id}.`, { cause: error }),
        );
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'OpenNeko feature disposal failed.');
    }
  }

  async #register(id: FeatureId): Promise<void> {
    if (this.#registered.has(id)) return;
    const definition = this.#definitionsById.get(id);
    if (!definition) throw new Error(`Feature definition is missing: ${id}`);
    const resolvedDependencies: Record<string, unknown> = {};
    for (const [name, ref] of Object.entries(definition.dependencies)) {
      await this.#register(ref.id);
      resolvedDependencies[name] = this.get(ref);
    }
    const owner = new DisposableStore();
    const controller = new AbortController();
    try {
      const registration = await definition.register(
        { featureId: id, signal: controller.signal, owner },
        resolvedDependencies,
      );
      this.#registered.set(id, {
        id,
        exports: registration.exports,
        owner,
        controller,
      });
      this.#registrationOrder.push(id);
    } catch (error) {
      controller.abort(error);
      try {
        await owner.dispose();
      } catch (disposeError) {
        throw new AggregateError(
          [error, disposeError],
          `Feature ${id} registration and rollback failed.`,
        );
      }
      throw error;
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Host Kernel is disposed.');
  }
}

function validateCapabilityPlan(
  capabilities: readonly LazyCapability<unknown>[],
): readonly LazyCapability<unknown>[] {
  const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
  if (byId.size !== capabilities.length) {
    const seen = new Set<string>();
    const duplicate = capabilities.find((capability) => {
      if (seen.has(capability.id)) return true;
      seen.add(capability.id);
      return false;
    });
    throw new Error(`Duplicate capability definition: ${duplicate?.id ?? '<unknown>'}`);
  }
  for (const capability of capabilities) {
    for (const dependencyId of capability.dependencies) {
      if (!byId.has(dependencyId)) {
        throw new Error(`Capability ${capability.id} requires missing dependency ${dependencyId}.`);
      }
    }
  }
  const visiting = new Set<CapabilityId>();
  const visited = new Set<CapabilityId>();
  const stack: CapabilityId[] = [];
  const visit = (id: CapabilityId): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id);
      throw new Error(
        `Capability dependency cycle: ${[...stack.slice(cycleStart), id].join(' -> ')}`,
      );
    }
    visiting.add(id);
    stack.push(id);
    const capability = byId.get(id);
    if (!capability) throw new Error(`Capability definition is missing: ${id}`);
    for (const dependencyId of capability.dependencies) visit(dependencyId);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const capability of capabilities) visit(capability.id);
  return Object.freeze([...capabilities]);
}

function validateFeaturePlan(
  definitions: readonly AnyFeatureDefinition[],
): ReadonlyMap<FeatureId, AnyFeatureDefinition> {
  const definitionsById = new Map<FeatureId, AnyFeatureDefinition>();
  for (const definition of definitions) {
    if (definitionsById.has(definition.ref.id)) {
      throw new Error(`Duplicate feature definition: ${definition.ref.id}`);
    }
    definitionsById.set(definition.ref.id, definition);
  }
  for (const definition of definitions) {
    for (const dependency of Object.values(definition.dependencies)) {
      if (!definitionsById.has(dependency.id)) {
        throw new Error(
          `Feature ${definition.ref.id} requires missing dependency ${dependency.id}.`,
        );
      }
    }
  }
  const visiting = new Set<FeatureId>();
  const visited = new Set<FeatureId>();
  const stack: FeatureId[] = [];
  const visit = (id: FeatureId) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id);
      throw new Error(`Feature dependency cycle: ${[...stack.slice(cycleStart), id].join(' -> ')}`);
    }
    visiting.add(id);
    stack.push(id);
    const definition = definitionsById.get(id);
    if (!definition) throw new Error(`Feature definition is missing: ${id}`);
    for (const dependency of Object.values(definition.dependencies)) visit(dependency.id);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const definition of definitions) visit(definition.ref.id);
  return definitionsById;
}
