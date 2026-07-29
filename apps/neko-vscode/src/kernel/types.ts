export type FeatureId = `neko.${string}`;
export type CapabilityId = `neko.capability.${string}`;
export type CapabilityStatus = 'idle' | 'starting' | 'ready' | 'unavailable' | 'disposed';

declare const featureReferenceType: unique symbol;

export interface FeatureRef<TExports> {
  readonly id: FeatureId;
  readonly [featureReferenceType]?: TExports;
}

export type FeatureDependencyRefs = Readonly<Record<string, FeatureRef<unknown>>>;

export type ResolveFeatureDependencies<TDependencies extends FeatureDependencyRefs> = {
  readonly [K in keyof TDependencies]: TDependencies[K] extends FeatureRef<infer TExports>
    ? TExports
    : never;
};

export interface OwnedDisposable {
  dispose(): void | Promise<void>;
}

export interface RegistrationOwner {
  add<TDisposable extends OwnedDisposable>(disposable: TDisposable): TDisposable;
}

export interface FeatureRegistrationContext {
  readonly featureId: FeatureId;
  readonly signal: AbortSignal;
  readonly owner: RegistrationOwner;
}

export interface FeatureRegistration<TExports> {
  readonly exports: TExports;
}

export interface FeatureDefinition<TDependencies extends FeatureDependencyRefs, TExports> {
  readonly ref: FeatureRef<TExports>;
  readonly dependencies: TDependencies;
  register(
    context: FeatureRegistrationContext,
    dependencies: ResolveFeatureDependencies<TDependencies>,
  ): Promise<FeatureRegistration<TExports>>;
}

export interface CapabilityDiagnostic {
  readonly capabilityId: CapabilityId;
  readonly code: 'initialization-failed' | 'dependency-unavailable' | 'initialization-cancelled';
  readonly message: string;
  readonly causalChain: readonly CapabilityId[];
}

export interface CapabilityState {
  readonly id: CapabilityId;
  readonly status: CapabilityStatus;
  readonly diagnostic?: CapabilityDiagnostic;
}

export type CapabilityStateListener = (state: CapabilityState) => void;

export interface LazyCapability<TValue> extends OwnedDisposable {
  readonly id: CapabilityId;
  readonly dependencies: readonly CapabilityId[];
  state(): CapabilityState;
  onDidChange(listener: CapabilityStateListener): OwnedDisposable;
  get(signal?: AbortSignal): Promise<TValue>;
  retry(signal?: AbortSignal): Promise<TValue>;
  dispose(): Promise<void>;
}

export function defineFeature<const TDependencies extends FeatureDependencyRefs, TExports>(
  definition: FeatureDefinition<TDependencies, TExports>,
): FeatureDefinition<TDependencies, TExports> {
  return definition;
}

export function featureRef<TExports>(id: FeatureId): FeatureRef<TExports> {
  return Object.freeze({ id });
}
