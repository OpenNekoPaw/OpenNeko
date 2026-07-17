import type { AssetEntity } from '@neko/shared';

export interface IAssetEntityReader {
  listEntities(): Promise<AssetEntity[]>;
  getEntity(entityId: string): Promise<AssetEntity | null>;
}
