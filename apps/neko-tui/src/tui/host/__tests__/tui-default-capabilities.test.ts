import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProviderCardRegistry, ToolRegistry } from '@neko/agent';
import {
  createGeneratedAssetRevisionRef,
  TOOL_NAMES_ENTITY,
  TOOL_NAMES_SEARCH,
  TOOL_NAMES_SYSTEM,
  type GeneratedAsset,
} from '@neko/shared';
import { GeneratedAssetIndex } from '@neko/platform';
import { createTuiCapabilityLoader } from '../../core/tui-capability-loader';
import {
  createTuiDefaultCapabilityRuntime,
  type TuiDefaultCapabilityRuntime,
} from '../tui-default-capabilities';

const createdPaths: string[] = [];
const runtimes: TuiDefaultCapabilityRuntime[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
  for (const target of createdPaths.splice(0).reverse()) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('TUI default capability providers', () => {
  it('reads a linked Media Library image from its canonical workspace locator', async () => {
    const workDir = createTempDir();
    const targetDir = createTempDir();
    fs.mkdirSync(path.join(workDir, 'neko', 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, 'library-image.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    fs.symlinkSync(targetDir, path.join(workDir, 'neko', 'assets', 'Reference'));
    const toolRegistry = new ToolRegistry();
    createTuiCapabilityLoader({
      toolRegistry,
      providerCardRegistry: new ProviderCardRegistry(),
    }).registerProviders(createTestRuntime(workDir, createMemoryGeneratedAssetIndex()).providers);
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Reference/library-image.png',
    };

    const result = await toolRegistry.execute(TOOL_NAMES_SYSTEM.READ_IMAGE, {
      images: [{ locator }],
      mode: 'metadata',
      max_images: 1,
    });

    expect(result.success, result.error).toBe(true);
    expect(result).toMatchObject({
      data: {
        imageCount: 1,
        images: [expect.objectContaining({ locator, mimeType: 'image/png' })],
      },
    });
    expect(JSON.stringify(result.data)).not.toContain(targetDir);
    expect(JSON.stringify(result.data)).not.toContain('.neko/.cache');
  });

  it('reads generated output resources through the SQLite-backed content capability', async () => {
    const workDir = createTempDir();
    const outputPath = path.join(workDir, 'neko', 'generated', 'image', 'generated-1.png');
    const outputBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, outputBytes);
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'generated-1',
      contentDigest: `sha256:${createHash('sha256').update(outputBytes).digest('hex')}`,
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
    }).registerProviders(createTestRuntime(workDir, generatedAssetIndex).providers);
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

  it('binds a generated output representation through the Entity owner', async () => {
    const workDir = createTempDir();
    fs.writeFileSync(
      path.join(workDir, 'characters.json'),
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'char_rin',
            canonicalName: 'Rin',
            displayName: 'Rin',
            aliases: [],
            status: 'confirmed',
          },
        ],
      }),
      'utf8',
    );
    const toolRegistry = new ToolRegistry();
    createTuiCapabilityLoader({
      toolRegistry,
      providerCardRegistry: new ProviderCardRegistry(),
    }).registerProviders(createTestRuntime(workDir, createMemoryGeneratedAssetIndex()).providers);
    const representation = {
      kind: 'generated-output' as const,
      outputId: 'generated-rin-portrait',
      revision: 'revision-1',
      digest: 'sha256:generated-rin-portrait',
      path: 'neko/generated/image/rin-portrait.png',
    };

    const result = await toolRegistry.execute(TOOL_NAMES_ENTITY.BIND_ENTITY_REPRESENTATION, {
      entityId: 'char_rin',
      entityKind: 'character',
      role: 'portrait',
      isDefault: true,
      representation,
    });
    const stored = JSON.parse(
      fs.readFileSync(path.join(workDir, 'neko', 'entity-representation-bindings.json'), 'utf8'),
    ) as unknown;

    expect(result).toMatchObject({
      success: true,
      data: {
        binding: {
          entityId: 'char_rin',
          role: 'portrait',
          status: 'confirmed',
          availability: 'active',
          source: 'agent',
          representation,
        },
      },
    });
    expect(stored).toMatchObject({
      version: 2,
      bindings: [expect.objectContaining({ entityId: 'char_rin', representation })],
    });
    expect(JSON.stringify(stored)).not.toMatch(/assetRef|project:\/\/assets|\.neko\/\.cache/);
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
    }).registerProviders(createTestRuntime(workDir, createMemoryGeneratedAssetIndex()).providers);

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

function createTestRuntime(
  workDir: string,
  generatedAssetIndex: GeneratedAssetIndex,
): TuiDefaultCapabilityRuntime {
  const runtime = createTuiDefaultCapabilityRuntime({
    workDir,
    generatedAssetIndex,
    derivedStorageHomedir: workDir,
  });
  runtimes.push(runtime);
  return runtime;
}
