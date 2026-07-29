/**
 * Service Collection - VS Code style DI container
 *
 * Migrated from @neko/platform to local extension implementation.
 * This provides a simple service locator pattern for VS Code extensions.
 */

import * as vscode from 'vscode';
import { getRootLogger } from './logger';

// =============================================================================
// Service Identifier
// =============================================================================

/**
 * Service identifier interface
 */
export interface ServiceIdentifier<T> {
  (...args: unknown[]): void;
  type: T;
}

/**
 * Create a service identifier
 * @param serviceId Service ID string
 */
export function createServiceId<T>(serviceId: string): ServiceIdentifier<T> {
  const id = function (_target: unknown, _key: string, _index: number): void {
    // Decorator implementation (placeholder)
  } as ServiceIdentifier<T>;

  id.toString = () => serviceId;
  return id;
}

// =============================================================================
// Service Collection
// =============================================================================

/**
 * Service collection - a simple service container
 */
export class ServiceCollection implements vscode.Disposable {
  private readonly _services = new Map<ServiceIdentifier<unknown>, unknown>();
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * Register a service
   * @param id Service identifier
   * @param instance Service instance
   */
  set<T>(id: ServiceIdentifier<T>, instance: T): void {
    this._services.set(id as ServiceIdentifier<unknown>, instance);

    // Track disposables
    if (instance && typeof (instance as unknown as vscode.Disposable).dispose === 'function') {
      this._disposables.push(instance as unknown as vscode.Disposable);
    }
  }

  /**
   * Get a service by identifier
   * @param id Service identifier
   */
  get<T>(id: ServiceIdentifier<T>): T | undefined {
    return this._services.get(id as ServiceIdentifier<unknown>) as T | undefined;
  }

  /**
   * Check if a service is registered
   * @param id Service identifier
   */
  has<T>(id: ServiceIdentifier<T>): boolean {
    return this._services.has(id as ServiceIdentifier<unknown>);
  }

  /**
   * Dispose all services
   */
  dispose(): void {
    for (const disposable of this._disposables) {
      try {
        disposable.dispose();
      } catch (error) {
        getRootLogger().error('[ServiceCollection] Error disposing service:', error);
      }
    }
    this._disposables.length = 0;
    this._services.clear();
  }
}

// =============================================================================
// Global Service Access
// =============================================================================

let _globalServices: ServiceCollection | undefined;

/**
 * Set the global service collection
 * @param services Service collection instance
 */
export function setGlobalServices(services: ServiceCollection): void {
  _globalServices = services;
}

/**
 * Get a service from the global collection
 * @param id Service identifier
 */
export function getService<T>(id: ServiceIdentifier<T>): T | undefined {
  return _globalServices?.get(id);
}

/**
 * Get the global service collection
 */
export function getGlobalServices(): ServiceCollection | undefined {
  return _globalServices;
}
