/**
 * Minimal Service Collection
 *
 * Provides a lightweight service identifier factory for dependency injection.
 * This is a simplified version — just enough to support serviceIds.ts.
 */

/**
 * Service identifier type.
 * Used as a typed key for service registration and lookup.
 */
export interface ServiceIdentifier<T> {
  readonly id: string;
  readonly _brand: T;
}

/**
 * Create a typed service identifier
 *
 * @param id - Unique string identifier for the service
 * @returns A typed ServiceIdentifier that can be used as a DI key
 *
 * @example
 * ```typescript
 * const IMyService = createServiceId<MyService>('myService');
 * ```
 */
export function createServiceId<T>(id: string): ServiceIdentifier<T> {
  return { id, _brand: undefined as unknown as T };
}
