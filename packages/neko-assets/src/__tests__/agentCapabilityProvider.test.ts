import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityContext, AssetEntity, NekoAssetsAPI } from '@neko/shared';
import { TOOL_NAMES_ASSETS } from '@neko/shared';
import { createNekoAssetsCapabilityProvider } from '../agentCapabilityProvider';

describe('createNekoAssetsCapabilityProvider', () => {
  it('registers compact query and import tools with safety metadata', () => {
    const provider = createNekoAssetsCapabilityProvider(createApi());
    const tools = provider.getTools(createContext());
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect([...byName.keys()]).toEqual([
      TOOL_NAMES_ASSETS.LIST_ASSETS,
      TOOL_NAMES_ASSETS.GET_ASSET,
      TOOL_NAMES_ASSETS.IMPORT_ASSET,
    ]);
    expect(byName.get(TOOL_NAMES_ASSETS.LIST_ASSETS)).toMatchObject({
      isReadOnly: true,
      isConcurrencySafe: true,
      safetyKind: 'read-only-query',
    });
    expect(byName.get(TOOL_NAMES_ASSETS.GET_ASSET)).toMatchObject({
      isReadOnly: true,
      isConcurrencySafe: true,
      safetyKind: 'read-only-query',
    });
    expect(byName.get(TOOL_NAMES_ASSETS.IMPORT_ASSET)).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
      targetRequirements: { required: ['filePath'] },
    });
  });

  it('lists filtered bounded asset summaries', async () => {
    const provider = createNekoAssetsCapabilityProvider(
      createApi({
        entities: [
          createEntity({
            id: 'asset-1',
            name: 'Hero',
            category: 'character',
            tags: ['lead'],
            fileMediaType: 'image',
            characterAsset: {
              assetDimension: 'model',
              mediaKind: 'puppet-model',
              storageMode: 'bundle-memory',
            },
          }),
          createEntity({
            id: 'asset-2',
            name: 'Theme',
            category: 'audio',
            tags: ['music'],
            fileMediaType: 'audio',
          }),
        ],
      }),
    );
    const listTool = provider
      .getTools(createContext())
      .find((tool) => tool.name === TOOL_NAMES_ASSETS.LIST_ASSETS);

    const result = await listTool?.execute({ query: 'hero', limit: 1 });

    expect(result).toMatchObject({
      success: true,
      data: {
        total: 1,
        returned: 1,
        truncated: false,
        assets: [
          {
            id: 'asset-1',
            name: 'Hero',
            category: 'character',
            variantCount: 1,
            fileCount: 1,
            mediaTypes: ['image'],
            assetDimensions: ['model'],
            mediaKinds: ['puppet-model'],
            storageModes: ['bundle-memory'],
          },
        ],
      },
    });
  });

  it('gets and imports assets through NekoAssetsAPI', async () => {
    const importFile = vi.fn(async () =>
      createEntity({ id: 'asset-new', name: 'New Asset', category: 'object' }),
    );
    const provider = createNekoAssetsCapabilityProvider(
      createApi({
        entities: [createEntity({ id: 'asset-1', name: 'Hero', category: 'character' })],
        importFile,
      }),
    );
    const tools = provider.getTools(createContext());
    const getTool = tools.find((tool) => tool.name === TOOL_NAMES_ASSETS.GET_ASSET);
    const importTool = tools.find((tool) => tool.name === TOOL_NAMES_ASSETS.IMPORT_ASSET);

    await expect(getTool?.execute({ assetId: 'asset-1' })).resolves.toMatchObject({
      success: true,
      data: { asset: { id: 'asset-1' } },
    });
    await expect(importTool?.execute({ filePath: '/tmp/new.png' })).resolves.toMatchObject({
      success: true,
      data: { asset: { id: 'asset-new' } },
    });
    expect(importFile).toHaveBeenCalledWith({ fsPath: '/tmp/new.png' });
  });
});

function createContext(): AgentCapabilityContext {
  return { extensionContext: {} };
}

function createApi(
  overrides: {
    readonly entities?: readonly AssetEntity[];
    readonly importFile?: NekoAssetsAPI['importFile'];
  } = {},
): NekoAssetsAPI {
  return {
    getAllEntities: vi.fn(async () => [...(overrides.entities ?? [])]),
    importFile: overrides.importFile ?? vi.fn(async () => undefined),
    getThumbnailPath: vi.fn(async () => undefined),
    getMediaLibraryRoots: vi.fn(async () => []),
    resolveEntityUri: vi.fn(async () => undefined),
    getCharacterThumbnail: vi.fn(async () => undefined),
    getBindingCandidate: vi.fn(async () => undefined),
    getRepresentationPackageDetail: vi.fn(async () => undefined),
    onDidChangeEntities: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeMediaLibraryRoots: vi.fn(() => ({ dispose: vi.fn() })),
  };
}

function createEntity(input: {
  readonly id: string;
  readonly name: string;
  readonly category: AssetEntity['category'];
  readonly tags?: readonly string[];
  readonly fileMediaType?: AssetEntity['variants'][number]['files'][number]['mediaType'];
  readonly characterAsset?: AssetEntity['variants'][number]['files'][number]['characterAsset'];
}): AssetEntity {
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    metadata: {},
    variants: [
      {
        id: `${input.id}-variant`,
        entityId: input.id,
        name: 'Default',
        attributes: {},
        files: [
          {
            id: `${input.id}-file`,
            variantId: `${input.id}-variant`,
            name: input.name,
            path: `/assets/${input.id}`,
            mediaType: input.fileMediaType ?? 'image',
            metadata: {},
            createdAt: 1,
            ...(input.characterAsset ? { characterAsset: input.characterAsset } : {}),
          },
        ],
        createdAt: 1,
      },
    ],
    tags: [...(input.tags ?? [])],
    usageCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}
