import type { ProviderConfig } from '@neko/ai-contracts';

export interface GenerationExecutionProviderResolver {
  resolveProvider(providerId: string): Promise<ProviderConfig | undefined>;
}
