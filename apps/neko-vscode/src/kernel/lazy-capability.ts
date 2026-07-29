import { DisposableStore } from './disposable-store.ts';
import type {
  CapabilityDiagnostic,
  CapabilityId,
  CapabilityState,
  CapabilityStateListener,
  LazyCapability,
  RegistrationOwner,
} from './types.ts';

export type CapabilityDependencyRefs = Readonly<Record<string, LazyCapability<unknown>>>;

export type ResolveCapabilityDependencies<TDependencies extends CapabilityDependencyRefs> = {
  readonly [K in keyof TDependencies]: TDependencies[K] extends LazyCapability<infer TValue>
    ? TValue
    : never;
};

export interface LazyCapabilityOptions<TDependencies extends CapabilityDependencyRefs, TValue> {
  readonly id: CapabilityId;
  readonly dependencies: TDependencies;
  readonly retryPolicy?: 'never' | 'manual';
  start(
    owner: RegistrationOwner,
    signal: AbortSignal,
    dependencies: ResolveCapabilityDependencies<TDependencies>,
  ): Promise<TValue>;
}

export class CapabilityUnavailableError extends Error {
  readonly diagnostic: CapabilityDiagnostic;

  constructor(diagnostic: CapabilityDiagnostic, options?: ErrorOptions) {
    super(diagnostic.message, options);
    this.name = 'CapabilityUnavailableError';
    this.diagnostic = diagnostic;
  }
}

export function createLazyCapability<const TDependencies extends CapabilityDependencyRefs, TValue>(
  options: LazyCapabilityOptions<TDependencies, TValue>,
): LazyCapability<TValue> {
  let lifecycle:
    | { readonly kind: 'idle' }
    | { readonly kind: 'starting'; readonly promise: Promise<TValue> }
    | { readonly kind: 'ready'; readonly value: TValue }
    | {
        readonly kind: 'unavailable';
        readonly error: CapabilityUnavailableError;
        readonly diagnostic: CapabilityDiagnostic;
      }
    | { readonly kind: 'disposed' } = { kind: 'idle' };
  let owner: DisposableStore | undefined;
  let controller: AbortController | undefined;
  const listeners = new Set<CapabilityStateListener>();
  const dependencyEntries = Object.entries(options.dependencies) as [
    keyof TDependencies & string,
    LazyCapability<unknown>,
  ][];

  const start = (externalSignal?: AbortSignal): Promise<TValue> => {
    if (externalSignal?.aborted) {
      return Promise.reject(abortReason(externalSignal, options.id));
    }
    if (lifecycle.kind === 'ready') return Promise.resolve(lifecycle.value);
    if (lifecycle.kind === 'starting') return lifecycle.promise;
    if (lifecycle.kind === 'unavailable') return Promise.reject(lifecycle.error);
    if (lifecycle.kind === 'disposed') {
      return Promise.reject(new Error(`Capability ${options.id} is disposed.`));
    }

    const nextOwner = new DisposableStore();
    const nextController = new AbortController();
    owner = nextOwner;
    controller = nextController;
    const onExternalAbort = () => nextController.abort(abortReason(externalSignal, options.id));
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
    const promise = initialize(nextOwner, nextController).finally(() => {
      externalSignal?.removeEventListener('abort', onExternalAbort);
    });
    lifecycle = { kind: 'starting', promise };
    emit();
    return promise;
  };

  const initialize = async (
    nextOwner: DisposableStore,
    nextController: AbortController,
  ): Promise<TValue> => {
    try {
      const resolvedDependencies: Record<string, unknown> = {};
      for (const [name, dependency] of dependencyEntries) {
        try {
          resolvedDependencies[name] = await dependency.get(nextController.signal);
        } catch (error) {
          throw dependencyUnavailable(options.id, dependency.id, error);
        }
      }
      nextController.signal.throwIfAborted();
      const value = await options.start(
        nextOwner,
        nextController.signal,
        resolvedDependencies as ResolveCapabilityDependencies<TDependencies>,
      );
      nextController.signal.throwIfAborted();
      if (lifecycle.kind === 'disposed') {
        throw new Error(`Capability ${options.id} was disposed during initialization.`);
      }
      lifecycle = { kind: 'ready', value };
      emit();
      return value;
    } catch (error) {
      let rollbackError: unknown;
      try {
        await nextOwner.dispose();
      } catch (caught) {
        rollbackError = caught;
      }
      if (owner === nextOwner) owner = undefined;
      if (controller === nextController) controller = undefined;
      if (lifecycle.kind === 'disposed') {
        if (rollbackError !== undefined) {
          throw new AggregateError(
            [error, rollbackError],
            `Capability ${options.id} disposal during initialization failed.`,
          );
        }
        throw normalizeError(error, `Capability ${options.id} was disposed.`);
      }
      const unavailable = toUnavailableError(
        options.id,
        error,
        nextController.signal.aborted,
        rollbackError,
      );
      lifecycle = {
        kind: 'unavailable',
        error: unavailable,
        diagnostic: unavailable.diagnostic,
      };
      emit();
      throw unavailable;
    }
  };

  const emit = (): void => {
    const snapshot = readState(options.id, lifecycle);
    for (const listener of listeners) listener(snapshot);
  };

  return {
    id: options.id,
    dependencies: Object.freeze(dependencyEntries.map(([, dependency]) => dependency.id)),
    state: () => readState(options.id, lifecycle),
    onDidChange(listener) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
    get: start,
    retry(externalSignal) {
      if (lifecycle.kind !== 'unavailable') return start(externalSignal);
      if (options.retryPolicy !== 'manual') {
        return Promise.reject(
          new Error(
            `Capability ${options.id} does not support retry after initialization failure.`,
          ),
        );
      }
      lifecycle = { kind: 'idle' };
      emit();
      return start(externalSignal);
    },
    async dispose() {
      if (lifecycle.kind === 'disposed') return;
      const startingPromise = lifecycle.kind === 'starting' ? lifecycle.promise : undefined;
      const activeOwner = owner;
      owner = undefined;
      controller?.abort(new Error(`Capability ${options.id} is disposing.`));
      controller = undefined;
      lifecycle = { kind: 'disposed' };
      emit();
      try {
        await startingPromise;
      } catch {
        // Initialization owns its failure and partial-resource rollback.
      }
      await activeOwner?.dispose();
      listeners.clear();
    },
  };
}

function normalizeError(error: unknown, message: string): Error {
  return error instanceof Error ? error : new Error(message, { cause: error });
}

function abortReason(signal: AbortSignal | undefined, id: CapabilityId): Error {
  const reason = signal?.reason;
  return reason instanceof Error
    ? reason
    : new Error(`Capability ${id} initialization was cancelled.`, { cause: reason });
}

function dependencyUnavailable(
  capabilityId: CapabilityId,
  dependencyId: CapabilityId,
  error: unknown,
): CapabilityUnavailableError {
  const dependencyChain =
    error instanceof CapabilityUnavailableError
      ? error.diagnostic.causalChain
      : ([dependencyId] as const);
  const diagnostic: CapabilityDiagnostic = {
    capabilityId,
    code: 'dependency-unavailable',
    message: `Capability ${capabilityId} is unavailable because ${dependencyId} failed.`,
    causalChain: Object.freeze([capabilityId, ...dependencyChain]),
  };
  return new CapabilityUnavailableError(diagnostic, { cause: error });
}

function toUnavailableError(
  capabilityId: CapabilityId,
  error: unknown,
  cancelled: boolean,
  rollbackError: unknown,
): CapabilityUnavailableError {
  if (error instanceof CapabilityUnavailableError && rollbackError === undefined) return error;
  const normalized = normalizeError(
    error,
    `Capability ${capabilityId} failed with a non-Error value.`,
  );
  const cause =
    rollbackError === undefined
      ? normalized
      : new AggregateError(
          [normalized, rollbackError],
          `Capability ${capabilityId} initialization and rollback failed.`,
        );
  const diagnostic: CapabilityDiagnostic = {
    capabilityId,
    code: cancelled ? 'initialization-cancelled' : 'initialization-failed',
    message: cancelled
      ? `Capability ${capabilityId} initialization was cancelled: ${normalized.message}`
      : `Capability ${capabilityId} failed to initialize: ${normalized.message}`,
    causalChain: Object.freeze([capabilityId]),
  };
  return new CapabilityUnavailableError(diagnostic, { cause });
}

function readState(
  id: CapabilityId,
  lifecycle:
    | { readonly kind: 'idle' }
    | { readonly kind: 'starting'; readonly promise: Promise<unknown> }
    | { readonly kind: 'ready'; readonly value: unknown }
    | {
        readonly kind: 'unavailable';
        readonly error: CapabilityUnavailableError;
        readonly diagnostic: CapabilityDiagnostic;
      }
    | { readonly kind: 'disposed' },
): CapabilityState {
  return Object.freeze({
    id,
    status: lifecycle.kind,
    ...(lifecycle.kind === 'unavailable' ? { diagnostic: lifecycle.diagnostic } : {}),
  });
}
