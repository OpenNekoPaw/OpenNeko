import * as vscode from 'vscode';
import { getRootLogger } from '../utils/logger';

export interface ServiceIdentifier<T> {
  (...args: unknown[]): void;
  type: T;
}

export function createServiceId<T>(serviceId: string): ServiceIdentifier<T> {
  const id = function (_target: unknown, _key: string, _index: number): void {
    // Decorator placeholder for future compatibility with VS Code style service IDs.
  } as ServiceIdentifier<T>;

  id.toString = () => serviceId;
  return id;
}

export class ServiceCollection implements vscode.Disposable {
  private readonly services = new Map<ServiceIdentifier<unknown>, unknown>();
  private readonly disposables: vscode.Disposable[] = [];

  set<T>(id: ServiceIdentifier<T>, instance: T): void {
    this.services.set(id as ServiceIdentifier<unknown>, instance);

    if (isDisposable(instance)) {
      this.disposables.push(instance);
    }
  }

  get<T>(id: ServiceIdentifier<T>): T | undefined {
    return this.services.get(id as ServiceIdentifier<unknown>) as T | undefined;
  }

  has<T>(id: ServiceIdentifier<T>): boolean {
    return this.services.has(id as ServiceIdentifier<unknown>);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      try {
        disposable.dispose();
      } catch (error) {
        getRootLogger().error('[ServiceCollection] Failed to dispose service:', error);
      }
    }

    this.disposables.length = 0;
    this.services.clear();
  }
}

function isDisposable(value: unknown): value is vscode.Disposable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dispose' in value &&
    typeof value.dispose === 'function'
  );
}
