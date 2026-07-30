/**
 * Provider Types
 *
 * Re-export from shared package for unified type definitions
 */

// Re-export types from shared package
export type {
  ProviderType,
  ProviderConfig as Provider,
  ModelCapability,
  ModelConfig as Model,
  ProtocolVariant,
  AuthType,
  StreamFormat,
} from '@neko/shared';

/**
 * Provider status
 */
export interface ProviderStatus {
  providerId: string;
  available: boolean;
  latency?: number;
  lastChecked: Date;
  error?: string;
}
