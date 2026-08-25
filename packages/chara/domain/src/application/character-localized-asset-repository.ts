import type { CharacterLocalizedAssetBindingCatalog } from '@neko/chara-domain/contracts';

export interface CharacterLocalizedAssetDescriptor {
  readonly characterProjectId: string;
  readonly relativeAssetPath: string;
  readonly byteLength: number;
}

export interface CharacterLocalizedAssetRepository {
  readLocalizedAssetBindingCatalog(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterLocalizedAssetBindingCatalog | undefined>;
  saveLocalizedAssetBindingCatalog(
    catalog: CharacterLocalizedAssetBindingCatalog,
    signal?: AbortSignal,
  ): Promise<void>;
  listLocalizedAssets(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<readonly CharacterLocalizedAssetDescriptor[]>;
  readLocalizedAsset(
    characterProjectId: string,
    relativeAssetPath: string,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<Uint8Array | undefined>;
  storeLocalizedAsset(
    characterProjectId: string,
    relativeAssetPath: string,
    bytes: Uint8Array,
    signal?: AbortSignal,
  ): Promise<void>;
}
