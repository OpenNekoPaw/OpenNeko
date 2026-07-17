import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { AssetEntity } from '@neko/shared';
import { VSCodeAssetEntityReader } from '../VSCodeAssetEntityReader';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  extensions: {
    getExtension: vi.fn(),
  },
}));

describe('VSCodeAssetEntityReader', () => {
  beforeEach(() => {
    vi.mocked(vscode.commands.executeCommand).mockReset();
    vi.mocked(vscode.extensions.getExtension).mockReset();
  });

  it('loads entities from the typed Neko Assets API', async () => {
    const entities = [createEntity({ id: 'asset-1', name: 'Asset One' })];
    const getAllEntities = vi.fn(async () => entities);
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: { getAllEntities },
    } as never);

    const reader = new VSCodeAssetEntityReader();

    await expect(reader.listEntities()).resolves.toEqual(entities);
    await expect(reader.getEntity('asset-1')).resolves.toEqual(entities[0]);
    expect(getAllEntities).toHaveBeenCalledTimes(2);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('neko.assets.getAllEntities');
  });

  it('fails visibly when the typed Neko Assets API is unavailable', async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);

    const reader = new VSCodeAssetEntityReader();

    await expect(reader.listEntities()).rejects.toThrow(
      'Neko Assets extension API is unavailable.',
    );
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('neko.assets.getAllEntities');
  });
});

function createEntity(overrides: Pick<AssetEntity, 'id' | 'name'>): AssetEntity {
  const now = Date.now();
  return {
    id: overrides.id,
    name: overrides.name,
    category: 'object',
    metadata: {},
    variants: [],
    tags: [],
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}
