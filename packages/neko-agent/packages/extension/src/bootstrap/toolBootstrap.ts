/**
 * Tool Bootstrap — Register neko-agent's own meta-tools.
 *
 * All domain tools have been migrated to their respective sub-packages via
 * AgentCapabilityProvider protocol. Sub-packages register their own tools
 * at activation time via `neko.agent.registerCapabilities` command.
 *
 * This module now only registers:
 * - SkillProvider (meta-tool: enumerates skills from all installed extensions)
 *
 * Migrated sub-packages (2026-04-08):
 * - neko-cut → timeline tools
 * - neko-engine → effects + retained media analysis tools
 * - neko-canvas → canvas node/generation tools
 */

import type { Platform } from '@neko/platform';
import type { OpenNekoCredentialStore } from '@neko/agent/pi';
import { executeTextEmbedding } from '../ai/textEmbeddingRuntime';

/**
 * Register neko-agent's own meta-tools.
 * Domain tools are now registered by sub-packages via CapabilityProvider.
 */
/**
 * Builds an embed function backed by an exact text.embed binding.
 * Used by capabilityBootstrap to inject into AgentCapabilityContext.
 */
export function buildEmbedFn(
  config: Platform['config'],
  credentials: OpenNekoCredentialStore,
): (texts: string[]) => Promise<number[][]> {
  return async (texts: string[]) => {
    const ref = config.resolveModelRefForPurpose('text.embed');
    if (!ref) throw new Error('No explicit model binding is configured for text.embed.');
    const provider = config.getProvider(ref.providerId);
    const model = config.getModel(ref.modelId);
    if (!provider || !model) {
      throw new Error(
        `Configured embedding model ${ref.providerId}/${ref.modelId} is unavailable.`,
      );
    }
    if (provider.apiKey) {
      await credentials.replace(
        provider.id,
        { type: 'api_key', key: provider.apiKey },
        'user-config-import',
      );
    }
    return executeTextEmbedding(
      Object.freeze({
        purpose: 'text.embed',
        provider: Object.freeze(structuredClone(provider)),
        model: Object.freeze(structuredClone(model)),
        credential: await credentials.read(provider.id),
      }),
      texts,
    );
  };
}
