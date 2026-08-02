/**
 * Provider Types
 *
 * Re-export AI-owned provider and model contracts.
 */

export type {
  ProviderType,
  ProviderConfig as Provider,
  ModelCapability,
  ModelConfig as Model,
  ProtocolVariant,
  AuthType,
  StreamFormat,
} from '@neko/ai-contracts';

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
