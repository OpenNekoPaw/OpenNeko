import type { ContentProjectComposition } from '../contracts/project-composition';
import type { ProjectCompositionRepository } from '../application/project-composition-service';

export class InMemoryProjectCompositionRepository implements ProjectCompositionRepository {
  private composition: ContentProjectComposition | undefined;

  constructor(initial?: ContentProjectComposition) {
    this.composition = initial === undefined ? undefined : structuredClone(initial);
  }

  async read(signal?: AbortSignal): Promise<ContentProjectComposition | undefined> {
    signal?.throwIfAborted();
    return this.composition === undefined ? undefined : structuredClone(this.composition);
  }

  async save(composition: ContentProjectComposition, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.composition = structuredClone(composition);
  }
}
