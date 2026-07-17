import { createContentReadCapabilityProvider } from '@neko/content/document';
import { createGeneratedAssetResourceResolver, type GeneratedAssetIndex } from '@neko/platform';
import type { AgentCapabilityProvider } from '@neko/shared';
import type { ResourceCacheManifestStore } from '@neko/shared/content-access';
import { createNodeAssetsCapabilityProvider } from './node-assets-capability';
import { createNodeContentAccessRuntime } from './node-content-access-runtime';
import { createNodeEntitySearchCapabilityProviders } from './node-entity-search-capability';
import { createNodeWorkspaceContentHostAdapter } from './node-workspace-content-host';

export interface CreateTuiDefaultCapabilityProvidersOptions {
  readonly workDir: string;
  readonly resourceCacheManifestStore: ResourceCacheManifestStore;
  readonly generatedAssetIndex: Pick<GeneratedAssetIndex, 'get'>;
}

function createTuiDefaultCapabilityProviders(
  options: CreateTuiDefaultCapabilityProvidersOptions,
): readonly AgentCapabilityProvider[] {
  const host = createNodeWorkspaceContentHostAdapter({ workDir: options.workDir });
  const contentAccessRuntime = createNodeContentAccessRuntime({
    host,
    resourceCacheManifestStore: options.resourceCacheManifestStore,
    resolveGeneratedAsset: createGeneratedAssetResourceResolver(options.generatedAssetIndex),
  });
  return [
    createContentReadCapabilityProvider({
      contentAccessRuntime,
    }),
    createNodeAssetsCapabilityProvider({ host }),
    ...createNodeEntitySearchCapabilityProviders({ host }),
  ];
}

export function withTuiDefaultCapabilityProviders(input: {
  readonly workDir: string;
  readonly resourceCacheManifestStore: ResourceCacheManifestStore;
  readonly generatedAssetIndex: Pick<GeneratedAssetIndex, 'get'>;
  readonly capabilityProviders?: readonly AgentCapabilityProvider[];
}): readonly AgentCapabilityProvider[] {
  return [
    ...createTuiDefaultCapabilityProviders({
      workDir: input.workDir,
      resourceCacheManifestStore: input.resourceCacheManifestStore,
      generatedAssetIndex: input.generatedAssetIndex,
    }),
    ...(input.capabilityProviders ?? []),
  ];
}
