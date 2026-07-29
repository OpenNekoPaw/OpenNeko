/**
 * Base Registry - Generic base class for adapter registries
 *
 * Provides common functionality for managing builtin and custom adapters.
 * Eliminates code duplication between AdapterRegistry and MediaAdapterRegistry.
 */

/**
 * Interface for registry operations
 */
export interface IRegistry<TKey extends string, TValue> {
  /** Get a builtin item by key */
  get(key: TKey): TValue | undefined;
  /** Get a custom item by key */
  getCustom(key: string): TValue | undefined;
  /** Register a custom item */
  register(key: string, value: TValue): void;
  /** Unregister a custom item */
  unregister(key: string): void;
  /** Get item by key, checking both builtin and custom */
  getForType(key: string): TValue | undefined;
  /** List all available keys */
  listTypes(): string[];
  /** Check if a key exists */
  has(key: string): boolean;
}

/**
 * Abstract base class for adapter registries
 *
 * @template TKey - The type of keys for builtin items (e.g., ProviderType)
 * @template TValue - The type of values stored in the registry (e.g., Adapter)
 */
export abstract class BaseRegistry<TKey extends string, TValue> implements IRegistry<TKey, TValue> {
  /** Map of builtin items */
  protected builtinItems: Map<TKey, TValue> = new Map();
  /** Map of custom items */
  protected customItems: Map<string, TValue> = new Map();

  /**
   * Get a builtin item by key
   */
  get(key: TKey): TValue | undefined {
    return this.builtinItems.get(key);
  }

  /**
   * Get a custom item by key
   */
  getCustom(key: string): TValue | undefined {
    return this.customItems.get(key);
  }

  /**
   * Register a custom item
   */
  register(key: string, value: TValue): void {
    this.customItems.set(key, value);
  }

  /**
   * Unregister a custom item
   */
  unregister(key: string): void {
    this.customItems.delete(key);
  }

  /**
   * Get item by key, checking custom first then builtin
   * (custom overrides builtin)
   */
  getForType(key: string): TValue | undefined {
    return this.customItems.get(key) || this.builtinItems.get(key as TKey);
  }

  /**
   * List all available keys (builtin + custom, deduplicated)
   */
  listTypes(): string[] {
    const types = new Set<string>();
    for (const key of this.builtinItems.keys()) {
      types.add(key);
    }
    for (const key of this.customItems.keys()) {
      types.add(key);
    }
    return Array.from(types);
  }

  /**
   * Check if a key exists in either builtin or custom items
   */
  has(key: string): boolean {
    return this.builtinItems.has(key as TKey) || this.customItems.has(key);
  }

  /**
   * Get all builtin items
   */
  getAllBuiltin(): Map<TKey, TValue> {
    return new Map(this.builtinItems);
  }

  /**
   * Get all custom items
   */
  getAllCustom(): Map<string, TValue> {
    return new Map(this.customItems);
  }

  /**
   * Get total count of items
   */
  size(): number {
    return this.builtinItems.size + this.customItems.size;
  }

  /**
   * Clear all custom items (builtin items are preserved)
   */
  clearCustom(): void {
    this.customItems.clear();
  }
}
