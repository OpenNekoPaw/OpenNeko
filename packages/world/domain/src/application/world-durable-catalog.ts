import type { WorldProject, WorldRun, WorldSave, WorldVersion } from '@neko/world-domain/contracts';

export type WorldAuthoringCatalogScope = {
  readonly kind: 'project';
  readonly projectId: string;
};

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

export interface WorldRuntimeCatalog {
  readonly runtimes: readonly {
    readonly run: WorldRun;
    readonly save: WorldSave;
  }[];
  readonly diagnostics: readonly WorldDurableRecordDiagnostic[];
}

export interface WorldRuntimeCatalogPort {
  readRuntimeCatalog(signal?: AbortSignal): Promise<WorldRuntimeCatalog>;
}
