/**
 * @neko/ai-sdk - AI SDK Integration Layer
 *
 * Provides AI SDK provider resolution and provider-specific AI SDK model contracts.
 */

export { resolveProvider } from './resolve';
export type { ResolveProviderOptions } from './resolve';
export type { ProviderConfig, ResolvedProvider, ResolvedProviderSource } from './types';
export { createNewAPIProvider } from './providers/newapi';
export {
  createVideoTaskOperation,
  decodeVideoTaskOperation,
  type VideoTaskOperation,
} from './video-task-operation';
