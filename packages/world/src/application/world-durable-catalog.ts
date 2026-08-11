import type { WorldProject, WorldRun, WorldSave, WorldVersion } from '@neko/world/contracts';

export type WorldAuthoringCatalogScope =
  | { readonly kind: 'standalone-library' }
  | { readonly kind: 'content-project'; readonly contentProjectId: string };

export interface WorldAuthoringCatalog {
  readonly scope: WorldAuthoringCatalogScope;
  readonly projects: readonly WorldProject[];
  readonly versions: readonly WorldVersion[];
  readonly diagnostics: readonly WorldDurableRecordDiagnostic[];
}

export interface WorldAuthoringCatalogPort {
  readAuthoringCatalog(signal?: AbortSignal): Promise<WorldAuthoringCatalog>;
}

export interface WorldDurableRecordDiagnostic {
  readonly recordKind: 'world-project' | 'world-version' | 'world-runtime';
  readonly recordId: string;
  readonly message: string;
}

export interface WorldDurableCatalog {
  readonly projects: readonly WorldProject[];
  readonly versions: readonly WorldVersion[];
  readonly runtimes: readonly {
    readonly run: WorldRun;
    readonly save: WorldSave;
  }[];
  readonly diagnostics: readonly WorldDurableRecordDiagnostic[];
}

export interface WorldDurableCatalogPort {
  readCatalog(signal?: AbortSignal): Promise<WorldDurableCatalog>;
}

export interface WorldRuntimeCatalog {
  readonly runtimes: WorldDurableCatalog['runtimes'];
  readonly diagnostics: readonly WorldDurableRecordDiagnostic[];
}

export interface WorldRuntimeCatalogPort {
  readRuntimeCatalog(signal?: AbortSignal): Promise<WorldRuntimeCatalog>;
}

export function createWorldDurableCatalogPort(options: {
  readonly authoring: WorldAuthoringCatalogPort;
  readonly runtime: WorldRuntimeCatalogPort;
}): WorldDurableCatalogPort {
  return Object.freeze({
    async readCatalog(signal?: AbortSignal): Promise<WorldDurableCatalog> {
      signal?.throwIfAborted();
      const [authoring, runtime] = await Promise.all([
        options.authoring.readAuthoringCatalog(signal),
        options.runtime.readRuntimeCatalog(signal),
      ]);
      return {
        projects: authoring.projects,
        versions: authoring.versions,
        runtimes: runtime.runtimes,
        diagnostics: [...authoring.diagnostics, ...runtime.diagnostics],
      };
    },
  });
}
