import type { ContentLocator } from '@neko/content-domain';
import { describe, expect, it, vi } from 'vitest';
import type { CanvasData, CanvasNode } from '../types/canvas';
import { resolveCanvasGenerationInputs } from '../canvas-generation-inputs';
import { createCanvasGenerationNodeData } from '../types/canvas-generation-node';

describe('Canvas Generation input resolution', () => {
  it.each([
    'content-missing',
    'content-unsupported',
    'content-read-failed',
    'content-unauthorized',
  ] as const)('preserves the owning reader diagnostic %s', async (code) => {
    const canvas = canvasWith([media('image-1', 'image'), generation('target', 'image')]);
    canvas.connections = [connect('image-1', 'target')];
    await expect(
      resolveCanvasGenerationInputs({
        canvas,
        nodeId: 'target',
        port: {
          fingerprintText: vi.fn(),
          readText: vi.fn(),
          stat: async (locator) => ({ status: 'unavailable', locator, diagnostic: { code } }),
        },
      }),
    ).rejects.toMatchObject({
      code: 'generation-input-unavailable',
      sourceNodeId: 'image-1',
      message: expect.stringContaining(code),
    });
  });

  it('resolves only explicit connected text and authorized media inputs', async () => {
    const port = {
      fingerprintText: vi.fn((text: string) => `digest:${text}`),
      readText: vi.fn(),
      stat: vi.fn(readyStat),
    };
    const canvas = canvasWith([
      markdown('text-1', 'reference notes'),
      media('image-1', 'image'),
      generation('target', 'image'),
      markdown('nearby-but-unconnected', 'ignore me'),
    ]);
    canvas.connections = [connect('text-1', 'target'), connect('image-1', 'target')];

    await expect(
      resolveCanvasGenerationInputs({ canvas, nodeId: 'target', port }),
    ).resolves.toEqual([
      {
        kind: 'text',
        sourceNodeId: 'text-1',
        text: 'reference notes',
        digest: 'digest:reference notes',
      },
      {
        kind: 'image',
        sourceNodeId: 'image-1',
        locator: { file: { authority: 'workspace', path: 'images/reference.png' } },
      },
    ]);
    expect(port.stat).toHaveBeenCalledTimes(1);
  });

  it('resolves embedded Agent materials and deduplicates a matching connected source', async () => {
    const locator = { file: { authority: 'workspace' as const, path: 'images/reference.png' } };
    const target = generation('target', 'video');
    if (target.type !== 'generation') throw new Error('Expected Generation node fixture.');
    const embeddedTarget = {
      ...target,
      data: {
        ...target.data,
        inputMaterials: [{ mediaKind: 'image' as const, locator }],
      },
    };
    const port = {
      fingerprintText: vi.fn(),
      readText: vi.fn(),
      stat: vi.fn(readyStat),
    };
    const embeddedOnly = canvasWith([embeddedTarget]);

    await expect(
      resolveCanvasGenerationInputs({ canvas: embeddedOnly, nodeId: 'target', port }),
    ).resolves.toEqual([{ kind: 'image', locator }]);

    const connected = canvasWith([media('image-1', 'image'), embeddedTarget]);
    connected.connections = [connect('image-1', 'target')];
    await expect(
      resolveCanvasGenerationInputs({ canvas: connected, nodeId: 'target', port }),
    ).resolves.toEqual([{ kind: 'image', sourceNodeId: 'image-1', locator }]);
  });

  it('rejects an upstream Generation Node without a selected output before authorization', async () => {
    const port = {
      fingerprintText: vi.fn(),
      readText: vi.fn(),
      stat: vi.fn(),
    };
    const canvas = canvasWith([generation('source', 'image'), generation('target', 'video')]);
    canvas.connections = [connect('source', 'target')];

    await expect(
      resolveCanvasGenerationInputs({ canvas, nodeId: 'target', port }),
    ).rejects.toMatchObject({
      code: 'generation-input-output-unavailable',
      sourceNodeId: 'source',
    });
    expect(port.stat).not.toHaveBeenCalled();
  });

  it('rejects unauthorized and incompatible inputs locally', async () => {
    const canvas = canvasWith([media('audio-1', 'audio'), generation('target', 'image')]);
    canvas.connections = [connect('audio-1', 'target')];
    const unauthorizedPort = {
      fingerprintText: vi.fn(),
      readText: vi.fn(),
      stat: vi.fn(async (locator: ContentLocator) => ({
        status: 'unavailable' as const,
        locator,
        diagnostic: { code: 'content-unauthorized' as const },
      })),
    };

    await expect(
      resolveCanvasGenerationInputs({ canvas, nodeId: 'target', port: unauthorizedPort }),
    ).rejects.toMatchObject({ code: 'generation-input-unavailable' });

    const authorizedPort = { ...unauthorizedPort, stat: vi.fn(readyStat) };
    await expect(
      resolveCanvasGenerationInputs({ canvas, nodeId: 'target', port: authorizedPort }),
    ).rejects.toMatchObject({ code: 'generation-input-type-mismatch' });
  });

  it('reads the current generated Prompt file as the only text source', async () => {
    const jobRef = { kind: 'generation' as const, jobId: 'job-text' };
    const prompt = generation('source', 'prompt');
    if (prompt.type !== 'generation') throw new Error('Expected Generation node fixture.');
    const locator = {
      file: { authority: 'workspace' as const, path: 'neko/generated/text/output.md' },
    };
    const canvas = canvasWith([
      {
        ...prompt,
        data: {
          ...prompt.data,
          latestRun: { jobRef, recipeInputFingerprint: 'digest:recipe' },
          outputs: [
            {
              outputId: 'output-text',
              jobRef,
              locator,
              kind: 'prompt',
              recipeInputFingerprint: 'digest:recipe',
            },
          ],
          selectedOutputId: 'output-text',
        },
      },
      generation('target', 'image'),
    ]);
    canvas.connections = [connect('source', 'target')];
    const port = {
      fingerprintText: vi.fn(),
      readText: vi.fn(async () => ({ text: 'user-edited text', digest: 'digest:edited' })),
      stat: vi.fn(readyStat),
    };

    await expect(
      resolveCanvasGenerationInputs({ canvas, nodeId: 'target', port }),
    ).resolves.toEqual([
      {
        kind: 'text',
        sourceNodeId: 'source',
        text: 'user-edited text',
        digest: 'digest:edited',
      },
    ]);
    expect(port.readText).toHaveBeenCalledWith(locator);
    expect(port.fingerprintText).not.toHaveBeenCalled();
  });
});

function canvasWith(nodes: CanvasNode[]): CanvasData {
  return { name: 'Inputs', nodes, connections: [] };
}

function generation(id: string, kind: 'prompt' | 'image' | 'audio' | 'video'): CanvasNode {
  return {
    id,
    type: 'generation',
    position: { x: 0, y: 0 },
    size: { width: 320, height: 240 },
    zIndex: 0,
    data: createCanvasGenerationNodeData(kind),
  };
}

function markdown(id: string, content: string): CanvasNode {
  return {
    id,
    type: 'markdown',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 180 },
    zIndex: 0,
    data: { content },
  };
}

function media(id: string, mediaType: 'image' | 'audio' | 'video'): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 200 },
    zIndex: 0,
    data: {
      assetPath: `${mediaType}s/reference.${mediaType === 'image' ? 'png' : 'bin'}`,
      contentLocator: {
        file: {
          authority: 'workspace',
          path: `${mediaType}s/reference.${mediaType === 'image' ? 'png' : 'bin'}`,
        },
      },
      mediaType,
    },
  };
}

function connect(sourceId: string, targetId: string) {
  return {
    id: `${sourceId}-${targetId}`,
    sourceId,
    targetId,
    type: 'reference' as const,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' as const },
    targetEndpoint: { nodeId: targetId, scope: 'node' as const },
  };
}

async function readyStat(locator: ContentLocator) {
  return {
    status: 'ready' as const,
    locator,
    byteLength: 1,
    fingerprint: { strategy: 'sha256' as const, value: 'fixture' },
  };
}
