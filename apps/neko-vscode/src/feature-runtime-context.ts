import type * as vscode from 'vscode';

export type StateNamespaceId = `neko.neko-${string}`;

export interface FeatureRuntimeContext {
  readonly signal: AbortSignal;
  readonly subscriptions: vscode.Disposable[];
  readonly workspaceState: vscode.Memento;
  readonly globalStorageUri: vscode.Uri;
  readonly resourceUri: vscode.Uri;
  readonly extensionMode: vscode.ExtensionMode;
}

export interface FeatureRuntimeScope {
  readonly context: FeatureRuntimeContext;
  dispose(): void;
}

export interface FeatureRuntimeScopeOptions {
  readonly stateNamespaceId: StateNamespaceId;
  readonly resourceUri: vscode.Uri;
  readonly signal: AbortSignal;
  readonly joinPath: (base: vscode.Uri, ...pathSegments: string[]) => vscode.Uri;
}

export function createFeatureRuntimeScope(
  baseContext: Pick<
    vscode.ExtensionContext,
    'workspaceState' | 'globalStorageUri' | 'extensionMode'
  >,
  options: FeatureRuntimeScopeOptions,
): FeatureRuntimeScope {
  const subscriptions: vscode.Disposable[] = [];
  const namespace = `${options.stateNamespaceId}:`;
  const context: FeatureRuntimeContext = {
    signal: options.signal,
    subscriptions,
    workspaceState: new NamespacedMemento(baseContext.workspaceState, namespace),
    globalStorageUri: options.joinPath(
      baseContext.globalStorageUri,
      'features',
      options.stateNamespaceId,
    ),
    resourceUri: options.resourceUri,
    extensionMode: baseContext.extensionMode,
  };

  return {
    context,
    dispose() {
      disposeSubscriptions(subscriptions, `feature scope ${options.stateNamespaceId}`);
    },
  };
}

export function createFeatureRuntimeChildScope(
  parent: FeatureRuntimeContext,
  signal: AbortSignal,
): FeatureRuntimeScope {
  const subscriptions: vscode.Disposable[] = [];
  return {
    context: {
      ...parent,
      signal,
      subscriptions,
    },
    dispose() {
      disposeSubscriptions(subscriptions, 'feature runtime child scope');
    },
  };
}

function disposeSubscriptions(subscriptions: vscode.Disposable[], owner: string): void {
  const errors: unknown[] = [];
  for (const disposable of [...subscriptions].reverse()) {
    try {
      disposable.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  subscriptions.length = 0;
  if (errors.length > 0) {
    throw new AggregateError(errors, `Failed to dispose ${owner}.`);
  }
}

class NamespacedMemento implements vscode.Memento {
  private readonly base: vscode.Memento;
  private readonly namespace: string;

  constructor(base: vscode.Memento, namespace: string) {
    this.base = base;
    this.namespace = namespace;
  }

  keys(): readonly string[] {
    return this.base
      .keys()
      .filter((key) => key.startsWith(this.namespace))
      .map((key) => key.slice(this.namespace.length));
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return defaultValue === undefined
      ? this.base.get<T>(this.key(key))
      : this.base.get<T>(this.key(key), defaultValue);
  }

  update(key: string, value: unknown): Thenable<void> {
    return this.base.update(this.key(key), value);
  }

  private key(key: string): string {
    return `${this.namespace}${key}`;
  }
}
