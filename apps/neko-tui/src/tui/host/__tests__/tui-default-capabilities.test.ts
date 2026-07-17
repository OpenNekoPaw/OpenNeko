import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProviderCardRegistry, ToolRegistry } from '@neko/agent';
import {
  createGeneratedAssetRevisionRef,
  TOOL_NAMES_ASSETS,
  TOOL_NAMES_ENTITY,
  TOOL_NAMES_SEARCH,
  TOOL_NAMES_SYSTEM,
  type GeneratedAsset,
} from '@neko/shared';
import type { ResourceCacheManifestStore } from '@neko/shared/content-access';
import { GeneratedAssetIndex } from '@neko/platform';
import { createTuiCapabilityLoader } from '../../core/tui-capability-loader';
import { withTuiDefaultCapabilityProviders } from '../tui-default-capabilities';

const createdPaths: string[] = [];

afterEach(() => {
  for (const target of createdPaths.splice(0).reverse()) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('withTuiDefaultCapabilityProviders', () => {
  it('reads generated output resources through the SQLite-backed content capability', async () => {
    const workDir = createTempDir();
    const outputPath = path.join(workDir, 'neko', 'generated', 'image', 'generated-1.png');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'generated-1',
      contentDigest: 'sha256:generated-1',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { taskId: 'task-1' },
    });
    const generatedAssetIndex = createMemoryGeneratedAssetIndex();
    await generatedAssetIndex.add({
      type: 'generated-image',
      id: 'generated-1',
      path: outputPath,
      lifecycle,
      mimeType: 'image/png',
      generatedAt: '2026-07-14T00:00:00.000Z',
      width: 1,
      height: 1,
      ratio: '1:1',
    });
    const toolRegistry = new ToolRegistry();
    createTuiCapabilityLoader({
      toolRegistry,
      providerCardRegistry: new ProviderCardRegistry(),
    }).registerProviders(
      withTuiDefaultCapabilityProviders({
        workDir,
        resourceCacheManifestStore: createMemoryManifestStore(),
        generatedAssetIndex,
      }),
    );
    const resourceRef = lifecycle.resourceRef;

    expect(resourceRef.source).not.toHaveProperty('filePath');
    expect(resourceRef.source.metadata).not.toHaveProperty('path');

    const result = await toolRegistry.execute(TOOL_NAMES_SYSTEM.READ_IMAGE, {
      mode: 'metadata',
      images: [{ resourceRef }],
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        imageCount: 1,
        images: [expect.objectContaining({ resourceRef })],
      },
    });
  });

  it('loads asset summaries through the asset-owned runtime without exposing .neko files', async () => {
    const workDir = createTempDir();
    const assetLibraryPath = path.join(workDir, 'neko', 'assets', 'library.json');
    fs.mkdirSync(path.dirname(assetLibraryPath), { recursive: true });
    fs.writeFileSync(
      assetLibraryPath,
      JSON.stringify({
        version: 1,
        entities: [
          {
            id: 'asset-hero',
            name: 'Hero Concept',
            category: 'character',
            description: 'Main character key art',
            metadata: {},
            variants: [
              {
                id: 'asset-hero-variant',
                entityId: 'asset-hero',
                name: 'Default',
                attributes: {},
                files: [
                  {
                    id: 'asset-hero-file',
                    variantId: 'asset-hero-variant',
                    name: 'Hero Concept',
                    path: '${A}/assets/hero.png',
                    mediaType: 'image',
                    metadata: {},
                    createdAt: 1,
                  },
                ],
                createdAt: 1,
              },
            ],
            tags: ['lead'],
            usageCount: 0,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
      'utf8',
    );
    const toolRegistry = new ToolRegistry();
    createTuiCapabilityLoader({
      toolRegistry,
      providerCardRegistry: new ProviderCardRegistry(),
    }).registerProviders(
      withTuiDefaultCapabilityProviders({
        workDir,
        resourceCacheManifestStore: createMemoryManifestStore(),
        generatedAssetIndex: createMemoryGeneratedAssetIndex(),
      }),
    );

    const result = await toolRegistry.execute(TOOL_NAMES_ASSETS.LIST_ASSETS, {
      query: 'Hero',
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        assets: [
          expect.objectContaining({
            id: 'asset-hero',
            name: 'Hero Concept',
            category: 'character',
          }),
        ],
      },
    });
    expect(JSON.stringify(result.data)).not.toContain('neko/assets/library.json');
  });

  it('loads entity and search projections without exposing backing managed files', async () => {
    const workDir = createTempDir();
    fs.writeFileSync(
      path.join(workDir, 'characters.json'),
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'char_xiaoju',
            canonicalName: '小橘',
            displayName: '小橘',
            aliases: ['Xiaoju'],
            status: 'confirmed',
          },
        ],
      }),
      'utf8',
    );
    fs.mkdirSync(path.join(workDir, '.neko', 'semantic-index'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, '.neko', 'semantic-index', 'index.json'),
      JSON.stringify({ internal: true }),
      'utf8',
    );

    const toolRegistry = new ToolRegistry();
    createTuiCapabilityLoader({
      toolRegistry,
      providerCardRegistry: new ProviderCardRegistry(),
    }).registerProviders(
      withTuiDefaultCapabilityProviders({
        workDir,
        resourceCacheManifestStore: createMemoryManifestStore(),
        generatedAssetIndex: createMemoryGeneratedAssetIndex(),
      }),
    );

    const entities = await toolRegistry.execute(TOOL_NAMES_ENTITY.LIST_CREATIVE_ENTITIES, {
      query: '小橘',
    });
    const search = await toolRegistry.execute(TOOL_NAMES_SEARCH.QUERY_PROJECT_SEARCH, {
      query: '小橘',
      partitions: ['creative-entities'],
    });

    expect(entities).toMatchObject({
      success: true,
      data: {
        entities: [
          expect.objectContaining({
            id: 'char_xiaoju',
            kind: 'character',
            label: '小橘',
          }),
        ],
      },
    });
    expect(search).toMatchObject({
      success: true,
      data: {
        items: [
          expect.objectContaining({
            id: 'creative-entity:char_xiaoju',
            kind: 'creative-entity',
            label: '小橘',
          }),
        ],
      },
    });
    expect(JSON.stringify(entities.data)).not.toContain('.neko');
    expect(JSON.stringify(search.data)).not.toContain('.neko');
    expect(JSON.stringify(search.data)).not.toContain('semantic-index');
  });
});

function readContextToolNames(data: unknown): string[] {
  if (!isRecord(data) || !Array.isArray(data['tools'])) {
    return [];
  }
  return data['tools'].flatMap((category) => {
    if (!isRecord(category) || !Array.isArray(category['tools'])) {
      return [];
    }
    return category['tools'].filter((toolName): toolName is string => typeof toolName === 'string');
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-tui-capabilities-'));
  createdPaths.push(dir);
  return dir;
}

function createMemoryManifestStore(): ResourceCacheManifestStore {
  let manifest = {
    version: 1 as const,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    entries: {},
  };
  return {
    load: async () => manifest,
    save: async (next) => {
      manifest = next;
    },
    update: async (operation) => {
      manifest = await operation(manifest);
      return manifest;
    },
    invalidateCache: () => undefined,
  };
}

function createMemoryGeneratedAssetIndex(): GeneratedAssetIndex {
  let assets: readonly GeneratedAsset[] = [];
  return new GeneratedAssetIndex({
    load: async () => assets,
    update: async (operation) => {
      assets = operation(assets);
      return assets;
    },
  });
}
