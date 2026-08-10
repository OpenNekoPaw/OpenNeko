import { parseWorldFoundationSnapshot, type WorldFoundationSnapshot } from '@neko/world/contracts';
import type { WorldDurableCatalogPort } from './world-durable-catalog';

export class WorldFoundationService {
  constructor(
    private readonly options: {
      readonly catalog: WorldDurableCatalogPort;
    },
  ) {}

  async getSnapshot(signal?: AbortSignal): Promise<WorldFoundationSnapshot> {
    signal?.throwIfAborted();
    const catalog = await this.options.catalog.readCatalog(signal);
    return parseWorldFoundationSnapshot({
      world: {
        projects: catalog.projects,
        versions: catalog.versions,
        runtimes: catalog.runtimes,
      },
      diagnostics: catalog.diagnostics.map((diagnostic) => ({ owner: 'world', ...diagnostic })),
    });
  }
}
