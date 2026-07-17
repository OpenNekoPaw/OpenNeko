import { createContentMediaReadCapabilityProvider } from '@neko/content/document';
import type { AgentCapabilityProvider } from '@neko/shared';
import { getCapabilityRuntimeBindings } from '../bootstrap/capabilityBootstrap';

export function createMediaReadCapabilityProvider(): AgentCapabilityProvider {
  return createContentMediaReadCapabilityProvider({
    getContentAccessRuntime: () => getCapabilityRuntimeBindings().contentAccessRuntime,
  });
}
