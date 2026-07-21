import type * as vscode from 'vscode';

export interface ScopedExtensionContextOptions {
  readonly featureId: string;
  readonly featureUri: vscode.Uri;
  readonly joinPath: (base: vscode.Uri, ...pathSegments: string[]) => vscode.Uri;
}

export interface ScopedExtensionContext {
  readonly context: vscode.ExtensionContext;
  dispose(): void;
}

export function createScopedExtensionContext(
  baseContext: vscode.ExtensionContext,
  options: ScopedExtensionContextOptions,
): ScopedExtensionContext {
  const subscriptions: vscode.Disposable[] = [];
  const namespace = `${options.featureId}:`;
  const workspaceState = new NamespacedMemento(baseContext.workspaceState, namespace);
  const globalState = new NamespacedMemento(baseContext.globalState, namespace);
  const secrets = new NamespacedSecretStorage(baseContext.secrets, namespace);
  const globalStorageUri = options.joinPath(
    baseContext.globalStorageUri,
    'features',
    options.featureId,
  );
  const storageUri = baseContext.storageUri
    ? options.joinPath(baseContext.storageUri, 'features', options.featureId)
    : undefined;
  const logUri = options.joinPath(baseContext.logUri, 'features', options.featureId);

  const context: vscode.ExtensionContext = {
    subscriptions,
    workspaceState,
    globalState,
    secrets,
    extensionUri: options.featureUri,
    extensionPath: options.featureUri.fsPath,
    environmentVariableCollection: baseContext.environmentVariableCollection,
    asAbsolutePath: (relativePath: string) =>
      options.joinPath(options.featureUri, relativePath).fsPath,
    storageUri,
    storagePath: storageUri?.fsPath,
    globalStorageUri,
    globalStoragePath: globalStorageUri.fsPath,
    logUri,
    logPath: logUri.fsPath,
    extensionMode: baseContext.extensionMode,
    extension: baseContext.extension,
    languageModelAccessInformation: baseContext.languageModelAccessInformation,
  };

  return {
    context,
    dispose() {
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
        throw new AggregateError(
          errors,
          `Failed to dispose embedded feature context ${options.featureId}`,
        );
      }
    },
  };
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

  update(key: string, value: unknown): Promise<void> {
    return this.base.update(this.key(key), value);
  }

  setKeysForSync(keys: readonly string[]): void {
    this.base.setKeysForSync(keys.map((key) => this.key(key)));
  }

  private key(key: string): string {
    return `${this.namespace}${key}`;
  }
}

class NamespacedSecretStorage implements vscode.SecretStorage {
  readonly onDidChange: vscode.Event<vscode.SecretStorageChangeEvent>;
  private readonly base: vscode.SecretStorage;
  private readonly namespace: string;

  constructor(base: vscode.SecretStorage, namespace: string) {
    this.base = base;
    this.namespace = namespace;
    this.onDidChange = base.onDidChange;
  }

  get(key: string): Promise<string | undefined> {
    return this.base.get(this.key(key));
  }

  store(key: string, value: string): Promise<void> {
    return this.base.store(this.key(key), value);
  }

  delete(key: string): Promise<void> {
    return this.base.delete(this.key(key));
  }

  keys(): Promise<string[]> {
    return this.base
      .keys()
      .then((keys) =>
        keys
          .filter((key) => key.startsWith(this.namespace))
          .map((key) => key.slice(this.namespace.length)),
      );
  }

  private key(key: string): string {
    return `${this.namespace}${key}`;
  }
}
