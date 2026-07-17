import type {
  IArtifactProfileRegistry,
  IOperationToolAdapterRegistry,
  IProviderCardRegistry,
  IProviderExpressionProfileRegistry,
} from '@neko/shared';
import type { ToolCategoryRegistry } from '../../tools/tool-category-registry';
import type { AgentExternalProcessorRuntime } from './external-processor-runtime';
import type { AgentContentAccessRuntime } from './agent-content-access-runtime';

const CAPABILITY_RUNTIME_BINDING_KEYS = [
  'toolCategoryRegistry',
  'providerCardRegistry',
  'artifactProfileRegistry',
  'providerExpressionProfileRegistry',
  'operationToolAdapterRegistry',
  'externalProcessorRuntime',
  'contentAccessRuntime',
] as const;

export interface CapabilityRuntimeBindings {
  toolCategoryRegistry?: ToolCategoryRegistry;
  providerCardRegistry?: IProviderCardRegistry;
  artifactProfileRegistry?: IArtifactProfileRegistry;
  providerExpressionProfileRegistry?: IProviderExpressionProfileRegistry;
  operationToolAdapterRegistry?: IOperationToolAdapterRegistry;
  externalProcessorRuntime?: AgentExternalProcessorRuntime;
  contentAccessRuntime?: AgentContentAccessRuntime;
}

export interface CapabilityRuntimeBindingLogger {
  warn(message: string, details?: unknown): void;
}

export interface CapabilityRuntimeBindingStore {
  get(): Readonly<CapabilityRuntimeBindings>;
  update(next: Partial<CapabilityRuntimeBindings>): Readonly<CapabilityRuntimeBindings>;
}

export function mergeCapabilityRuntimeBindings(
  current: Readonly<CapabilityRuntimeBindings>,
  next: Partial<CapabilityRuntimeBindings>,
  logger?: CapabilityRuntimeBindingLogger,
): CapabilityRuntimeBindings {
  const merged: CapabilityRuntimeBindings = { ...current };

  for (const key of CAPABILITY_RUNTIME_BINDING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      continue;
    }

    const value = next[key];
    const previous = merged[key];
    if (value === undefined) {
      if (previous !== undefined) {
        emitBindingWarning(logger, {
          code: 'extension.capability-runtime.binding-update-ignored',
          reason: 'undefined-value-ignored',
          message:
            'Ignoring undefined capability runtime binding update to avoid clearing shared singleton state.',
          context: {
            binding: key,
          },
        });
      }
      continue;
    }

    if (previous !== undefined && previous !== value) {
      emitBindingWarning(logger, {
        code: 'extension.capability-runtime.binding-replaced',
        reason: 'shared-singleton-replaced',
        message: 'Replacing a shared capability runtime binding reference.',
        context: {
          binding: key,
        },
      });
    }

    assignCapabilityRuntimeBinding(merged, key, value);
  }

  return merged;
}

export function createCapabilityRuntimeBindingStore(
  logger?: CapabilityRuntimeBindingLogger,
): CapabilityRuntimeBindingStore {
  return new DefaultCapabilityRuntimeBindingStore(logger);
}

function assignCapabilityRuntimeBinding<K extends keyof CapabilityRuntimeBindings>(
  bindings: CapabilityRuntimeBindings,
  key: K,
  value: NonNullable<CapabilityRuntimeBindings[K]>,
): void {
  bindings[key] = value;
}

class DefaultCapabilityRuntimeBindingStore implements CapabilityRuntimeBindingStore {
  private bindings: CapabilityRuntimeBindings = {};

  constructor(private readonly logger?: CapabilityRuntimeBindingLogger) {}

  get(): Readonly<CapabilityRuntimeBindings> {
    return this.bindings;
  }

  update(next: Partial<CapabilityRuntimeBindings>): Readonly<CapabilityRuntimeBindings> {
    this.bindings = mergeCapabilityRuntimeBindings(this.bindings, next, this.logger);
    return this.bindings;
  }

}

function emitBindingWarning(
  logger: CapabilityRuntimeBindingLogger | undefined,
  diagnostic: {
    readonly code: string;
    readonly reason: string;
    readonly message: string;
    readonly context: Record<string, unknown>;
  },
): void {
  logger?.warn(diagnostic.message, {
    code: diagnostic.code,
    reason: diagnostic.reason,
    context: diagnostic.context,
  });
}
