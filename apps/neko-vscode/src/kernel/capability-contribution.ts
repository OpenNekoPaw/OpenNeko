import { invokeCapability, type CapabilityUnavailableReporter } from './capability-invocation.ts';
import type {
  CapabilityState,
  LazyCapability,
  OwnedDisposable,
  RegistrationOwner,
} from './types.ts';

export interface CapabilityAvailabilityProjection {
  project(state: CapabilityState): void | Promise<void>;
  reportProjectionFailure(error: unknown, state: CapabilityState): void | Promise<void>;
}

export interface CapabilityContribution<TValue> extends OwnedDisposable {
  invoke<TResult>(
    operation: (value: TValue, signal: AbortSignal | undefined) => TResult | Promise<TResult>,
    signal?: AbortSignal,
  ): Promise<TResult>;
}

export interface CapabilityContributionOptions<TValue> {
  readonly capability: LazyCapability<TValue>;
  readonly owner: RegistrationOwner;
  readonly availability: CapabilityAvailabilityProjection;
  readonly reportUnavailable: CapabilityUnavailableReporter;
}

export async function createCapabilityContribution<TValue>(
  options: CapabilityContributionOptions<TValue>,
): Promise<CapabilityContribution<TValue>> {
  await options.availability.project(options.capability.state());
  let projection = Promise.resolve();
  const subscription = options.owner.add(
    options.capability.onDidChange((state) => {
      projection = projection
        .then(() => options.availability.project(state))
        .catch((error) => options.availability.reportProjectionFailure(error, state));
    }),
  );
  let disposed = false;

  const invoke = async <TResult>(
    operation: (value: TValue, signal: AbortSignal | undefined) => TResult | Promise<TResult>,
    signal?: AbortSignal,
  ): Promise<TResult> => {
    if (disposed) {
      throw new Error(`Capability contribution ${options.capability.id} is disposed.`);
    }
    return invokeCapability(options.capability, operation, options.reportUnavailable, signal);
  };
  const contribution: CapabilityContribution<TValue> = {
    invoke,
    async dispose() {
      if (disposed) return;
      disposed = true;
      subscription.dispose();
      await projection;
    },
  };
  return options.owner.add(contribution);
}
