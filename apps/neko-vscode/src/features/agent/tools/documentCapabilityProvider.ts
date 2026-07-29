import { createContentDocumentReadCapabilityProvider } from '@neko/content/document';
import type { AgentCapabilityProvider } from '@neko/shared';
import { getCapabilityRuntimeBindings } from '../bootstrap/capabilityBootstrap';

export function createDocumentReadCapabilityProvider(): AgentCapabilityProvider {
  return createContentDocumentReadCapabilityProvider({
    getContentAccessRuntime: () => getCapabilityRuntimeBindings().contentAccessRuntime,
  });
}
