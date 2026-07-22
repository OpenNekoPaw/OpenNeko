import {
  CreativeEntityService,
  createCreativeEntityHeadlessCapabilityProvider,
  createCreativeEntityProjectSearchAdapter,
  type EntityRuntimePorts,
} from '@neko/entity';
import type { HostWorkspaceSnapshot, NekoHostPorts } from '@neko/host';
import {
  ProjectCacheSearchService,
  createProjectSearchHeadlessCapabilityProvider,
} from '@neko/search';
import type { AgentCapabilityProvider } from '@neko/shared';
import { createNodeMediaLibrarySearchAdapter } from './node-media-library-search-adapter';

export interface CreateNodeEntitySearchCapabilityProvidersOptions {
  readonly host: NekoHostPorts;
}

export function createNodeEntitySearchCapabilityProviders(
  options: CreateNodeEntitySearchCapabilityProvidersOptions,
): readonly AgentCapabilityProvider[] {
  const workspace = readSynchronousWorkspace(options.host);
  if (!workspace.workspaceRoot) {
    throw new Error('TUI entity/search providers require a workspace root.');
  }
  const projectRoot = workspace.workspaceRoot;

  const entityRuntime = new CreativeEntityService({
    projectRoot,
    ports: createEntityRuntimePorts(options.host),
  });
  const searchRuntime = ProjectCacheSearchService.create({
    resolveContext: async (query) => ({
      projectRoot: query.projectRoot ?? projectRoot,
      ...(query.contextFilePath ? { resolvedContextFilePath: query.contextFilePath } : {}),
      ...(query.contextUri ? { contextUri: query.contextUri } : {}),
      fallbackDerived: !query.projectRoot,
    }),
    getWorkspaceRoots: () => [projectRoot],
    logger: {
      warn: (message, metadata) => {
        options.host.diagnostics?.report({
          code: 'tui-project-search-warning',
          severity: 'warning',
          message,
          metadata,
        });
      },
    },
  });
  searchRuntime.registerAdapter(
    createCreativeEntityProjectSearchAdapter({
      runtime: entityRuntime,
      projectRoot,
      now: () => new Date().toISOString(),
    }),
  );
  searchRuntime.registerAdapter(createNodeMediaLibrarySearchAdapter(options.host));

  return [
    createCreativeEntityHeadlessCapabilityProvider(entityRuntime),
    createProjectSearchHeadlessCapabilityProvider(searchRuntime),
  ];
}

function readSynchronousWorkspace(host: NekoHostPorts): HostWorkspaceSnapshot {
  const workspace = host.workspace.getWorkspace();
  if (isPromiseLike(workspace)) {
    throw new Error(
      'TUI entity/search provider registration requires synchronous workspace ports.',
    );
  }
  return workspace;
}

function createEntityRuntimePorts(host: NekoHostPorts): EntityRuntimePorts {
  return {
    files: {
      readJson: async (filePath) => {
        try {
          const raw = await host.files.readText(filePath);
          return JSON.parse(raw) as unknown;
        } catch (error) {
          if (isMissingFileError(error)) {
            return undefined;
          }
          throw error;
        }
      },
      writeJson: async (filePath, value) => {
        await host.files.createDirectory(host.paths.dirname(filePath));
        await host.files.writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
      },
    },
    logger: {
      warn: (message, metadata) => {
        host.diagnostics?.report({
          code: 'tui-entity-runtime-warning',
          severity: 'warning',
          message,
          metadata,
        });
      },
      error: (message, metadata) => {
        host.diagnostics?.report({
          code: 'tui-entity-runtime-error',
          severity: 'error',
          message,
          metadata,
        });
      },
    },
    clock: {
      now: () => new Date().toISOString(),
    },
  };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { readonly then?: unknown }).then === 'function'
  );
}
