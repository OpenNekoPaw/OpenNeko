import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityContext, AssetEntity, NekoAssetsAPI } from '@neko/shared';
import { TOOL_NAMES_ASSETS } from '@neko/shared';
import { createNekoAssetsHeadlessCapabilityProvider } from '../agentHeadlessCapabilityProvider.mts';

describe('createNekoAssetsHeadlessCapabilityProvider', () => {
  it('declares terminal hosts and tool runtime requirements', () => {
    const provider = createNekoAssetsHeadlessCapabilityProvider(createApi());
    const tools = provider.getTools(createContext());
    const importTool = tools.find((tool) => tool.name === TOOL_NAMES_ASSETS.IMPORT_ASSET) as
      | ((typeof tools)[number] & {
          readonly requirements?: { readonly writableProject?: boolean };
        })
      | undefined;

    expect(provider.hostRequirements).toEqual([
      { host: 'tui' },
      { host: 'cli' },
      { host: 'vscode' },
    ]);
    expect(provider.requirements).toEqual({ contentAccess: true });
    expect(importTool?.requirements).toEqual({ writableProject: true });
  });

  it('returns terminal-safe asset reference candidates', async () => {
    const provider = createNekoAssetsHeadlessCapabilityProvider(
      createApi({
        entities: [
          createEntity({
            id: 'asset-hero',
            name: 'Hero Concept',
            category: 'character',
            description: 'Main character key art',
            tags: ['lead', 'cover'],
            aliases: ['protagonist'],
          }),
          createEntity({
            id: 'asset-theme',
            name: 'Theme Song',
            category: 'audio',
            tags: ['music'],
          }),
        ],
      }),
    );

    const [contributor] = provider.getReferenceContributors?.(createContext()) ?? [];
    const result = await contributor?.search({ query: 'cover', limit: 5 });

    expect(result?.diagnostics).toEqual([]);
    expect(result?.candidates).toEqual([
      {
        id: 'asset:asset-hero',
        label: 'Hero Concept',
        source: 'assets',
        kind: 'asset',
        insertText: '@asset:asset-hero',
        description: 'character · Main character key art · lead, cover',
        metadata: {
          assetId: 'asset-hero',
          category: 'character',
          tags: ['lead', 'cover'],
          variantCount: 1,
          fileCount: 1,
          mediaTypes: ['image'],
        },
      },
    ]);
  });

  it('keeps generated outputs outside AssetLibrary until explicit import', async () => {
    const entities: AssetEntity[] = [];
    const promoted = createEntity({
      id: 'asset-promoted',
      name: 'Promoted Image',
      category: 'object',
    });
    const importFile = vi.fn(async () => {
      entities.push(promoted);
      return promoted;
    });
    const provider = createNekoAssetsHeadlessCapabilityProvider(
      createApi({ entities, importFile }),
    );
    const tools = provider.getTools(createContext());
    const getTool = tools.find((tool) => tool.name === TOOL_NAMES_ASSETS.GET_ASSET);
    const importTool = tools.find((tool) => tool.name === TOOL_NAMES_ASSETS.IMPORT_ASSET);

    await expect(getTool?.execute({ assetId: 'generated-output-1' })).resolves.toEqual({
      success: false,
      error: 'Asset not found: generated-output-1',
    });

    await expect(
      importTool?.execute({ filePath: '/workspace/neko/generated/image/output-1.png' }),
    ).resolves.toMatchObject({
      success: true,
      data: { asset: { id: 'asset-promoted' } },
    });
    await expect(getTool?.execute({ assetId: 'asset-promoted' })).resolves.toMatchObject({
      success: true,
      data: { asset: { id: 'asset-promoted' } },
    });
    await expect(getTool?.execute({ assetId: 'generated-output-1' })).resolves.toMatchObject({
      success: false,
    });
  });

  it('does not import vscode from headless provider source', () => {
    const source = readFileSync(join(__dirname, '../agentHeadlessCapabilityProvider.mts'), 'utf8');

    expect(source).not.toContain("from 'vscode'");
    expect(source).not.toContain('from "vscode"');
    expect(source).not.toContain('vscode.commands');
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
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly aliases?: readonly string[];
}): AssetEntity {
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    ...(input.description ? { description: input.description } : {}),
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
            path: `assets/${input.id}.png`,
            mediaType: 'image',
            metadata: {},
            createdAt: 1,
          },
        ],
        createdAt: 1,
      },
    ],
    tags: [...(input.tags ?? [])],
    ...(input.aliases ? { aliases: [...input.aliases] } : {}),
    usageCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}
