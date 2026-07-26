import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeMediaGenerationOutputs } from '../media-generation-output-finalizer';
import { createStableGeneratedOutputId } from '../media-generated-asset';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('finalizeMediaGenerationOutputs', () => {
  it('materializes terminal outputs under operation identity and registers stable assets', async () => {
    const root = await createTemporaryDirectory();
    const sourcePath = path.join(root, 'source.png');
    const outputDir = path.join(root, 'generated');
    await fs.writeFile(sourcePath, 'image bytes');
    const assetIndex = { add: vi.fn(), remove: vi.fn() };
    const assetId = createStableGeneratedOutputId('operation-1', 0, 'sha256:image');

    const result = await finalizeMediaGenerationOutputs({
      workspaceRoot: root,
      operationId: 'operation-1',
      generationType: 'text-to-image',
      mediaKind: 'image',
      outputs: [{ type: 'image', url: sourcePath, mimeType: 'image/png' }],
      providerId: 'openai',
      modelId: 'gpt-image',
      request: { prompt: 'cat' },
      outputDir,
      assetIndex,
      computeContentDigest: vi.fn().mockResolvedValue('sha256:image'),
    });

    expect(result.resultUrls).toEqual([`generated-assets/${assetId}.png`]);
    expect(result.generatedAssets).toEqual([
      expect.objectContaining({
        id: assetId,
        lifecycle: expect.objectContaining({
          generation: expect.objectContaining({
            operationId: 'operation-1',
            providerId: 'openai',
          }),
        }),
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('taskId');
  });

  it('fails visibly for missing operation identity or terminal outputs', async () => {
    const assetIndex = { add: vi.fn(), remove: vi.fn() };
    const base = {
      workspaceRoot: '/tmp',
      operationId: 'operation-1',
      generationType: 'text-to-image',
      mediaKind: 'image' as const,
      outputs: [{ type: 'image' as const, url: '/tmp/source.png' }],
      providerId: 'openai',
      modelId: 'gpt-image',
      request: { prompt: 'cat' },
      outputDir: '/tmp/generated',
      assetIndex,
    };

    await expect(finalizeMediaGenerationOutputs({ ...base, operationId: '' })).rejects.toThrow(
      'operationId',
    );
    await expect(finalizeMediaGenerationOutputs({ ...base, outputs: [] })).rejects.toThrow(
      'without outputs',
    );
    expect(assetIndex.add).not.toHaveBeenCalled();
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-media-result-'));
  temporaryDirectories.push(directory);
  return directory;
}
