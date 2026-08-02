import type {
  MediaModelType,
  ModelConfig,
  ModelRefConfig,
  ProviderConfig,
} from '@neko-ai/contracts';

export type MediaProvider = ProviderConfig;
export type MediaModel = ModelConfig;

/**
 * Read-only configuration boundary required by media generation.
 *
 * The owning application may implement this with persisted Host settings, an
 * immutable snapshot, or an isolated test fixture. Generation does not own or
 * mutate user configuration.
 */
export interface MediaGenerationConfigPort {
  getProvider(id: string): MediaProvider | undefined;
  getModel(id: string): MediaModel | undefined;
  getDefaultModelRef(type: MediaModelType): ModelRefConfig | undefined;
}

export interface MediaRoutingResult {
  readonly providerId: string;
  readonly modelId: string;
  readonly score: number;
  readonly reason: string;
}
