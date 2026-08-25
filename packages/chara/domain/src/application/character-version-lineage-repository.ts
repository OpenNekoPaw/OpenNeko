import type { CharacterVersionLineage } from '@neko/chara-domain/contracts';

export interface CharacterVersionLineageRepository {
  readLineage(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersionLineage | undefined>;
  saveLineage(lineage: CharacterVersionLineage, signal?: AbortSignal): Promise<void>;
}
