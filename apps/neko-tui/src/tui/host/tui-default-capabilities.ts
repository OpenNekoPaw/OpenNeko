import { createContentReadCapabilityProvider } from '@neko/content/document';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import type { AgentCapabilityProvider } from '@neko/shared';
import { createNodeContentAccessRuntime } from './node-content-access-runtime';
import { createNodeEntitySearchCapabilityProviders } from './node-entity-search-capability';
import { createNodeWorkspaceContentHostAdapter } from './node-workspace-content-host';

export interface CreateTuiDefaultCapabilityProvidersOptions {
  readonly workDir: string;
  readonly derivedStorageHomedir?: string;
}

export interface TuiDefaultCapabilityRuntime {
  readonly contentAccessRuntime: AgentContentAccessRuntime;
  readonly providers: readonly AgentCapabilityProvider[];
  dispose(): Promise<void>;
}

export function createTuiDefaultCapabilityRuntime(
  options: CreateTuiDefaultCapabilityProvidersOptions,
): TuiDefaultCapabilityRuntime {
  const host = createNodeWorkspaceContentHostAdapter({ workDir: options.workDir });
  const contentAccessRuntime = createNodeContentAccessRuntime({
    host,
    ...(options.derivedStorageHomedir
      ? { derivedStorageHomedir: options.derivedStorageHomedir }
      : {}),
  });
  return {
    contentAccessRuntime,
    providers: [
      createContentReadCapabilityProvider({ contentAccessRuntime }),
      ...createNodeEntitySearchCapabilityProviders({ host }),
    ],
    dispose: () => contentAccessRuntime.dispose(),
  };
}
