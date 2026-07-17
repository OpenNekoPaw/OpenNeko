/**
 * Configuration Adapter Interface
 *
 * Defines a unified interface for converting between UnifiedConfig
 * and environment-specific configuration formats (CLI, Assistant settings, etc.).
 *
 * This enables:
 * 1. Type-safe configuration conversion
 * 2. Consistent validation across environments
 * 3. Bidirectional transformation (for config editing UIs)
 */

import type { UnifiedConfig } from './types';

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation error for a specific field
 */
export interface ValidationError {
  /** Field path (e.g., 'providers[0].apiKey') */
  field: string;
  /** Error message */
  message: string;
  /** Error severity */
  severity: 'error' | 'warning';
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** List of validation errors */
  errors: ValidationError[];
  /** List of warnings (non-blocking) */
  warnings: ValidationError[];
}

// =============================================================================
// Adapter Interface
// =============================================================================

/**
 * Configuration adapter interface
 *
 * Adapts UnifiedConfig to environment-specific formats.
 *
 * @typeParam T - Target configuration type (e.g., CLIConfig, SettingsState)
 *
 * @example
 * ```typescript
 * class CLIConfigAdapter implements IConfigAdapter<CLIConfig> {
 *   fromUnified(config: UnifiedConfig): CLIConfig {
 *     return {
 *       provider: config.defaultProvider ?? 'anthropic',
 *       model: config.defaultModel ?? 'claude-sonnet-4-20250514',
 *       // ... map other fields
 *     };
 *   }
 *
 *   toUnified(config: CLIConfig): UnifiedConfig {
 *     return {
 *       defaultProvider: config.provider,
 *       defaultModel: config.model,
 *       // ... map other fields
 *     };
 *   }
 * }
 * ```
 */
export interface IConfigAdapter<T> {
  /**
   * Convert from UnifiedConfig to target format
   *
   * @param config - Unified configuration
   * @returns Target configuration format
   */
  fromUnified(config: UnifiedConfig): T;

  /**
   * Convert from target format to UnifiedConfig
   *
   * @param config - Target configuration
   * @returns Unified configuration
   */
  toUnified(config: T): UnifiedConfig;

  /**
   * Validate target configuration
   *
   * @param config - Configuration to validate
   * @returns Validation result with errors and warnings
   */
  validate(config: T): ValidationResult;

  /**
   * Merge configurations (target format)
   *
   * @param base - Base configuration
   * @param override - Override configuration (partial)
   * @returns Merged configuration
   */
  merge(base: T, override: Partial<T>): T;
}

// =============================================================================
// Abstract Base Adapter
// =============================================================================

/**
 * Abstract base class for configuration adapters
 *
 * Provides default implementations for common operations.
 */
export abstract class BaseConfigAdapter<T> implements IConfigAdapter<T> {
  /**
   * Convert from UnifiedConfig to target format
   * Must be implemented by subclasses.
   */
  abstract fromUnified(config: UnifiedConfig): T;

  /**
   * Convert from target format to UnifiedConfig
   * Must be implemented by subclasses.
   */
  abstract toUnified(config: T): UnifiedConfig;

  /**
   * Validate target configuration
   * Default implementation returns valid result.
   * Override for custom validation.
   */
  validate(config: T): ValidationResult {
    // Default: no validation
    void config;
    return { valid: true, errors: [], warnings: [] };
  }

  /**
   * Merge configurations
   * Default implementation uses shallow merge.
   * Override for custom merge logic.
   */
  merge(base: T, override: Partial<T>): T {
    return { ...base, ...override };
  }

  /**
   * Helper: Create validation error
   */
  protected error(field: string, message: string): ValidationError {
    return { field, message, severity: 'error' };
  }

  /**
   * Helper: Create validation warning
   */
  protected warning(field: string, message: string): ValidationError {
    return { field, message, severity: 'warning' };
  }

  /**
   * Helper: Create validation result
   */
  protected result(errors: ValidationError[], warnings: ValidationError[] = []): ValidationResult {
    return {
      valid: errors.length === 0,
      errors: errors.filter((e) => e.severity === 'error'),
      warnings: [...warnings, ...errors.filter((e) => e.severity === 'warning')],
    };
  }
}

// =============================================================================
// Config Change Event
// =============================================================================

/**
 * Configuration change event types
 */
export type ConfigChangeType = 'provider' | 'model' | 'mcp' | 'skill' | 'hook' | 'full';

/**
 * Configuration change event
 */
export interface ConfigChangeEvent {
  /** Type of change */
  type: ConfigChangeType;
  /** Changed item ID (if applicable) */
  id?: string;
  /** Previous configuration */
  before?: UnifiedConfig;
  /** New configuration */
  after: UnifiedConfig;
  /** Changed field paths */
  changedFields?: string[];
}

/**
 * Configuration change listener
 */
export type ConfigChangeListener = (event: ConfigChangeEvent) => void;

// =============================================================================
// Disposable Interface
// =============================================================================

/**
 * Disposable interface for cleanup
 */
export interface Disposable {
  dispose(): void;
}

// =============================================================================
// Config Manager Interface
// =============================================================================

/**
 * Unified configuration manager interface
 *
 * Provides unified access to configuration across environments.
 * Different from IConfigManager in platform.ts which is a simpler key-value store.
 */
export interface IUnifiedConfigManager {
  /**
   * Get current configuration
   */
  getConfig(): UnifiedConfig;

  /**
   * Update configuration
   *
   * @param updates - Partial configuration to merge
   */
  updateConfig(updates: Partial<UnifiedConfig>): Promise<void>;

  /**
   * Subscribe to configuration changes
   *
   * @param listener - Change listener
   * @returns Disposable to unsubscribe
   */
  onConfigChange(listener: ConfigChangeListener): Disposable;

  /**
   * Get provider by ID
   */
  getProvider(id: string): import('../types/config').ProviderConfig | undefined;

  /**
   * Get model by ID
   */
  getModel(id: string): import('../types/config').ModelConfig | undefined;

  /**
   * Get MCP server by ID
   */
  getMCPServer(id: string): import('../types/config').MCPServerConfig | undefined;
}
