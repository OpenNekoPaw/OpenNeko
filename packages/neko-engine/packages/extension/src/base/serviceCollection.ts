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
