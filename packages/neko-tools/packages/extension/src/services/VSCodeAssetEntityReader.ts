import * as vscode from 'vscode';
import {
  isNekoAssetsAPI,
  NEKO_EXTENSION_IDS,
  type AssetEntity,
  type NekoAssetsAPI,
} from '@neko/shared';
import { resolveNekoExtension } from '@neko/shared/vscode/extension';
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
    const extension = resolveNekoExtension(NEKO_EXTENSION_IDS.NEKO_ASSETS, (id) =>
      vscode.extensions.getExtension(id),
    );
    if (!extension) {
      throw new Error('Neko Assets extension API is unavailable.');
    }
    const api = extension.isActive ? extension.exports : await extension.activate();
    if (!isNekoAssetsAPI(api)) {
      throw new Error('Neko Assets extension API does not expose getAllEntities().');
    }
    return api;
  }
}
