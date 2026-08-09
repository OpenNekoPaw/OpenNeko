import type { WorldProject, WorldRun, WorldSave, WorldVersion } from '@neko/world/contracts';

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
