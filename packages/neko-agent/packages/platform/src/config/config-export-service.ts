/**
 * Config Export Service
 *
 * Handles configuration import/export operations
 */

import type { Model, Provider } from '../types/provider';

/**
 * Config export data structure
 */
export interface ConfigExportData {
  version: string;
  exportedAt: string;
  providers?: Array<{
    id: string;
    name: string;
    type: string;
    connectionKind?: string;
    protocolProfile?: string;
    supportLevel?: string;
    requiresApiKey?: boolean;
    apiKey?: string;
    apiUrl?: string;
    enabled?: boolean;
  }>;
  models: Array<{
    id: string;
    name: string;
    providerId: string;
    enabled?: boolean;
  }>;
  secrets?: boolean;
}

/**
 * Config import result
 */
export interface ConfigImportResult {
  success: boolean;
  message: string;
  importedCount: number;
}

/**
 * Custom provider configuration for adding new providers
 */
export interface CustomProviderConfig {
  id: string;
  name: string;
  displayName?: string;
  type?: string;
  connectionKind?: Provider['connectionKind'];
  protocolProfile?: Provider['protocolProfile'];
  requiresApiKey?: boolean;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Config operations interface for dependency injection
 */
export interface IConfigOperations {
  updateProviderOverride(providerId: string, override: Partial<Provider>): Promise<void>;
  updateModelOverride(modelId: string, override: Partial<Model>): Promise<void>;
  setProvider(provider: Provider): Promise<void>;
}

/**
 * Config export options
 */
export interface ExportOptions {
  includeSecrets?: boolean;
}

/**
 * Config import options
 */
export interface ImportOptions {
  overwrite?: boolean;
  includeSecrets?: boolean;
}

/**
 * Config export service interface
 */
export interface IConfigExportService {
  /**
   * Export configuration to data structure
   */
  exportConfig(
    providers: Map<string, Provider>,
    models: Map<string, Model>,
    options?: ExportOptions,
  ): ConfigExportData;

  /**
   * Import configuration from export data
   */
  importConfig(
    data: ConfigExportData,
    operations: IConfigOperations,
    options?: ImportOptions,
  ): Promise<ConfigImportResult>;

  /**
   * Add a custom provider configuration
   */
  addCustomProvider(
    config: CustomProviderConfig,
    operations: IConfigOperations,
  ): Promise<ConfigImportResult>;
}

/**
 * Config export service implementation
 */
export class ConfigExportService implements IConfigExportService {
  /**
   * Export configuration
   */
  exportConfig(
    providers: Map<string, Provider>,
    models: Map<string, Model>,
    options: ExportOptions = {},
  ): ConfigExportData {
    const exportData: ConfigExportData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      models: Array.from(models.values()).map((m) => ({
        id: m.id,
        name: m.name,
        providerId: m.providerId,
        enabled: m.enabled,
      })),
    };

    if (options.includeSecrets) {
      exportData.providers = Array.from(providers.values()).map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        connectionKind: p.connectionKind,
        protocolProfile: p.protocolProfile,
        supportLevel: p.supportLevel,
        requiresApiKey: p.requiresApiKey,
        apiKey: p.apiKey,
        apiUrl: p.apiUrl,
        enabled: p.enabled,
      }));
      exportData.secrets = true;
    }

    return exportData;
  }

  /**
   * Import configuration from export data
   */
  async importConfig(
    data: ConfigExportData,
    operations: IConfigOperations,
    options: ImportOptions = {},
  ): Promise<ConfigImportResult> {
    // Validate format
    if (!data.version || !data.exportedAt) {
      return { success: false, message: 'Invalid configuration format', importedCount: 0 };
    }

    let importedCount = 0;

    try {
      // Import provider configurations (with secrets)
      if (options.includeSecrets && data.providers) {
        for (const provider of data.providers) {
          if (provider.apiKey) {
            await operations.updateProviderOverride(provider.id, {
              apiKey: provider.apiKey,
              apiUrl: provider.apiUrl,
              enabled: provider.enabled,
            });
            importedCount++;
          }
        }
      }

      // Import model enabled states
      if (data.models) {
        for (const model of data.models) {
          if (model.enabled !== undefined) {
            await operations.updateModelOverride(model.id, { enabled: model.enabled });
            importedCount++;
          }
        }
      }

      return {
        success: true,
        message: `Imported ${importedCount} configurations`,
        importedCount,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to import: ${error instanceof Error ? error.message : 'Unknown error'}`,
        importedCount,
      };
    }
  }

  /**
   * Add a custom provider configuration
   */
  async addCustomProvider(
    config: CustomProviderConfig,
    operations: IConfigOperations,
  ): Promise<ConfigImportResult> {
    try {
      const providerType = (config.type || 'generic') as Provider['type'];
      const isLocalProvider = providerType === 'ollama';
      await operations.setProvider({
        id: config.id,
        name: config.name,
        displayName: config.displayName || config.name,
        type: providerType,
        connectionKind: config.connectionKind ?? (isLocalProvider ? 'local' : 'direct'),
        protocolProfile: config.protocolProfile ?? (isLocalProvider ? 'ollama' : 'openai-chat'),
        supportLevel: 'custom',
        requiresApiKey: config.requiresApiKey ?? !isLocalProvider,
        apiUrl: config.baseUrl || '',
        apiKey: config.apiKey,
        enabled: true,
      });

      return {
        success: true,
        message: `Custom provider "${config.name}" added successfully`,
        importedCount: 1,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add custom provider',
        importedCount: 0,
      };
    }
  }
}

/**
 * Create a config export service instance
 */
export function createConfigExportService(): IConfigExportService {
  return new ConfigExportService();
}
