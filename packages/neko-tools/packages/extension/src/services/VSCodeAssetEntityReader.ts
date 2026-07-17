import * as vscode from 'vscode';
import { NEKO_EXTENSION_IDS, type AssetEntity, type NekoAssetsAPI } from '@neko/shared';
import type { IAssetEntityReader } from '../contracts/IAssetEntityReader';

export class VSCodeAssetEntityReader implements IAssetEntityReader {
  async listEntities(): Promise<AssetEntity[]> {
    return this.getAssetsApi().then((api) => api.getAllEntities());
  }

  async getEntity(entityId: string): Promise<AssetEntity | null> {
    const entities = await this.listEntities();
    return entities.find((entity) => entity.id === entityId) ?? null;
  }

  private async getAssetsApi(): Promise<NekoAssetsAPI> {
    const extension = vscode.extensions.getExtension<NekoAssetsAPI>(NEKO_EXTENSION_IDS.NEKO_ASSETS);
    if (!extension) {
      throw new Error('Neko Assets extension API is unavailable.');
    }
    if (!extension.isActive) {
      await extension.activate();
    }
    if (!extension.exports || typeof extension.exports.getAllEntities !== 'function') {
      throw new Error('Neko Assets extension API does not expose getAllEntities().');
    }
    return extension.exports;
  }
}
