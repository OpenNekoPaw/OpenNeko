import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ContentIngestRequest, ContentIngestResult } from '@neko/shared';
import { sendGeneratedAssetToPlugin, type PluginTransferBridgeDeps } from './pluginTransferBridge';

vi.mock('vscode', async () => await import('../__mocks__/vscode'));

describe('PluginTransferBridge', () => {
  it('materializes legacy assetPath Canvas transfers as stable generated outputs', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    await sendGeneratedAssetToPlugin(
      'canvas',
      '/tmp/legacy-frame.png',
      'image',
      undefined,
      createDeps({
        ingest: async (request) =>
          createGeneratedIngestResult(request, {
            outputPath: '/workspace/neko/generated/image/legacy-frame.png',
            contractedPath: '${WORKSPACE}/neko/generated/image/legacy-frame.png',
          }),
        executeCommand,
      }),
    );

    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/legacy-frame.png',
        type: 'image',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/neko/generated/image/legacy-frame.png',
          }),
        }),
      }),
    );
  });

  it('materializes Agent generated images before sending them to Canvas', async () => {
    const ingestCalls: ContentIngestRequest[] = [];
    const executeCommand = vi.fn().mockResolvedValue({ ok: true });

    const result = await sendGeneratedAssetToPlugin(
      'canvas',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/tmp/agent-private/shot.png',
          mediaType: 'image',
          name: 'shot.png',
        },
        target: { kind: 'file', documentUri: 'file:///workspace/edit.nkv' },
      },
      createDeps({
        ingest: async (request) => {
          ingestCalls.push(request);
          return createGeneratedIngestResult(request, {
            outputPath: '/workspace/neko/generated/image/shot.png',
            contractedPath: '${WORKSPACE}/neko/generated/image/shot.png',
          });
        },
        executeCommand,
      }),
    );

    expect(result.success).toBe(true);
    expect(ingestCalls).toHaveLength(1);
    expect(ingestCalls[0]).toMatchObject({
      mode: 'generated-output',
      sourcePath: '/tmp/agent-private/shot.png',
      destination: {
        kind: 'generated-assets',
        directory: '/workspace/neko/generated/image',
      },
      fileName: 'shot.png',
      mimeType: 'image/png',
    });
    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/shot.png',
        resourceRef: expect.objectContaining({
          provider: 'generated-asset',
          kind: 'generated',
          source: expect.objectContaining({
            kind: 'generated-asset',
            filePath: '${WORKSPACE}/neko/generated/image/shot.png',
          }),
        }),
      }),
    );
  });

  it('fails closed when Canvas transfer cannot persist a generated output', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    const result = await sendGeneratedAssetToPlugin(
      'canvas',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/tmp/agent-private/shot.png',
          mediaType: 'image',
          name: 'shot.png',
        },
        target: {
          kind: 'file',
          documentUri: 'file:///workspace/edit.nkv',
          expectedProjectRevision: 'revision-1',
        },
      },
      createDeps({
        ingest: async (request) => ({
          status: 'unsupported-destination',
          request,
          providerId: 'generated-output-content-ingest',
          error: 'Generated output path must be contracted before persistence.',
        }),
        executeCommand,
      }),
    );

    expect(result).toMatchObject({
      success: false,
      executed: 0,
      error: expect.stringContaining('generated-output-persistence-failed'),
    });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('materializes every selected output in a Canvas batch transfer independently', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const materializedPaths: string[] = [];

    await sendGeneratedAssetToPlugin(
      'canvas',
      undefined,
      undefined,
      {
        kind: 'assetBatch',
        assets: [
          { path: '/tmp/shot-1.png', mediaType: 'image', name: 'shot-1.png' },
          { path: '/tmp/shot-2.png', mediaType: 'image', name: 'shot-2.png' },
        ],
      },
      createDeps({
        ingest: async (request) => {
          const outputPath = `/workspace/neko/generated/image/${request.fileName}`;
          materializedPaths.push(outputPath);
          return createGeneratedIngestResult(request, {
            outputPath,
            contractedPath: `\${WORKSPACE}/neko/generated/image/${request.fileName}`,
          });
        },
        executeCommand,
      }),
    );

    expect(materializedPaths).toEqual([
      '/workspace/neko/generated/image/shot-1.png',
      '/workspace/neko/generated/image/shot-2.png',
    ]);
    expect(executeCommand).toHaveBeenCalledTimes(2);
    expect(executeCommand).toHaveBeenNthCalledWith(
      1,
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/shot-1.png',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/neko/generated/image/shot-1.png',
          }),
        }),
      }),
    );
    expect(executeCommand).toHaveBeenNthCalledWith(
      2,
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/shot-2.png',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/neko/generated/image/shot-2.png',
          }),
        }),
      }),
    );
  });

  it('keeps existing stable refs without rematerializing', async () => {
    const ingest = vi.fn();
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const existingResourceRef = {
      id: 'res_existing',
      scope: 'project' as const,
      provider: 'generated-asset',
      kind: 'generated',
      source: {
        kind: 'generated-asset' as const,
        generatedAssetId: 'asset-existing',
        filePath: '${WORKSPACE}/neko/generated/image/existing.png',
      },
      fingerprint: {
        strategy: 'provider' as const,
        value: 'asset-existing',
      },
    };

    await sendGeneratedAssetToPlugin(
      'canvas',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/workspace/neko/generated/image/existing.png',
          mediaType: 'image',
          resourceRef: existingResourceRef,
        },
      },
      createDeps({ ingest, executeCommand }),
    );

    expect(ingest).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/existing.png',
        resourceRef: existingResourceRef,
      }),
    );
  });

  it('does not treat cache-backed generated resource refs as durable Canvas inputs', async () => {
    const ingest = vi.fn(async (request: ContentIngestRequest) =>
      createGeneratedIngestResult(request, {
        outputPath: '/workspace/neko/generated/image/existing.png',
        contractedPath: '${WORKSPACE}/neko/generated/image/existing.png',
      }),
    );
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const cacheResourceRef = {
      id: 'res_cache',
      scope: 'project' as const,
      provider: 'generated-asset',
      kind: 'generated',
      source: {
        kind: 'generated-asset' as const,
        generatedAssetId: 'asset-existing',
        filePath: '/workspace/.neko/.cache/generated/image/existing.png',
      },
      fingerprint: {
        strategy: 'provider' as const,
        value: 'asset-existing',
      },
    };

    await sendGeneratedAssetToPlugin(
      'canvas',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/workspace/.neko/.cache/generated/image/existing.png',
          mediaType: 'image',
          resourceRef: cacheResourceRef,
        },
      },
      createDeps({ ingest, executeCommand }),
    );

    expect(ingest).toHaveBeenCalledOnce();
    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/existing.png',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/neko/generated/image/existing.png',
          }),
        }),
      }),
    );
  });

  it('sends generated clips to the Cut authoring command without Canvas materialization', async () => {
    const ingest = vi.fn();
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    const result = await sendGeneratedAssetToPlugin(
      'cut',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/tmp/agent-private/shot.png',
          mediaType: 'image',
          name: 'shot.png',
        },
        target: {
          kind: 'file',
          documentUri: 'file:///workspace/edit.nkv',
          expectedProjectRevision: 'revision-1',
        },
      },
      createDeps({ ingest, executeCommand }),
    );

    expect(result.success).toBe(true);
    expect(ingest).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith('neko.cut.authoring.importGeneratedClip', {
      assetPath: '/tmp/agent-private/shot.png',
      mediaType: 'image',
      name: 'shot.png',
      target: { kind: 'file', documentUri: 'file:///workspace/edit.nkv' },
      expectedProjectRevision: 'revision-1',
    });
  });

  it('sends generated image assets to the Sketch authoring import command', async () => {
    const ingest = vi.fn();
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    const result = await sendGeneratedAssetToPlugin(
      'sketch',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/tmp/agent-private/frame.png',
          mediaType: 'image',
          name: 'frame.png',
        },
      },
      createDeps({ ingest, executeCommand }),
    );

    expect(result.success).toBe(true);
    expect(ingest).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith('neko.sketch.authoring.importImageSource', {
      path: '/tmp/agent-private/frame.png',
      name: 'frame.png',
    });
  });

  it('passes package authoring target and provenance without hitting legacy command ids', async () => {
    const ingest = vi.fn();
    const executeCommand = vi.fn(async (command: string) => {
      if (
        command === 'neko.cut.importGeneratedClip' ||
        command === 'neko.sketch.importAsset' ||
        command === 'neko.model.importAsset'
      ) {
        throw new Error(`legacy command called: ${command}`);
      }
      return { ok: true };
    });

    const result = await sendGeneratedAssetToPlugin(
      'model',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/tmp/agent-private/character.glb',
          mediaType: 'model',
          name: 'Character',
        },
        target: {
          kind: 'file',
          documentUri: 'file:///workspace/characters/character.nkm',
          reveal: true,
        },
        provenance: {
          source: 'agent',
          conversationId: 'conv-1',
          messageId: 'msg-1',
        },
      },
      createDeps({ ingest, executeCommand }),
    );

    expect(result.success).toBe(true);
    expect(ingest).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith('neko.model.authoring.importAsset', {
      path: '/tmp/agent-private/character.glb',
      name: 'Character',
      target: {
        kind: 'file',
        documentUri: 'file:///workspace/characters/character.nkm',
        reveal: true,
      },
      reveal: true,
      provenance: {
        source: 'agent',
        conversationId: 'conv-1',
        messageId: 'msg-1',
      },
    });
  });

  it('reports canonical authoring diagnostics instead of treating command completion as delivery', async () => {
    const ingest = vi.fn();
    const executeCommand = vi.fn().mockResolvedValue({
      version: 1,
      ok: false,
      diagnostics: [
        {
          code: 'missing-authoring-target',
          severity: 'error',
          message: 'Sketch image import authoring requires documentUri.',
        },
      ],
    });

    const result = await sendGeneratedAssetToPlugin(
      'sketch',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/tmp/agent-private/frame.png',
          mediaType: 'image',
          name: 'frame.png',
        },
      },
      createDeps({ ingest, executeCommand }),
    );

    expect(result).toEqual({
      success: false,
      executed: 1,
      results: [
        {
          version: 1,
          ok: false,
          diagnostics: [
            {
              code: 'missing-authoring-target',
              severity: 'error',
              message: 'Sketch image import authoring requires documentUri.',
            },
          ],
        },
      ],
      unsupported: [
        {
          target: 'sketch',
          reason: 'missing-authoring-target: Sketch image import authoring requires documentUri.',
        },
      ],
    });
    expect(executeCommand).toHaveBeenCalledWith('neko.sketch.authoring.importImageSource', {
      path: '/tmp/agent-private/frame.png',
      name: 'frame.png',
    });
  });

  it.each([
    ['canvasStoryboard', { kind: 'canvasStoryboard', storyboard: {} }],
    ['canvasPrompt', { kind: 'canvasPrompt', prompt: 'legacy prompt' }],
    ['canvasText', { kind: 'canvasText', text: '| visual |\\n| --- |\\n| open |' }],
    ['canvasStructuredContent', { kind: 'canvasStructuredContent', content: { beats: ['open'] } }],
    [
      'canvasAuthoringHandoff',
      { kind: 'canvasAuthoringHandoff', content: '{"kind":"storyboard-draft"}' },
    ],
  ])('does not execute removed Canvas authoring transfer payload %s', async (kind, payload) => {
    const executeCommand = vi.fn();

    const result = await sendGeneratedAssetToPlugin(
      'canvas',
      undefined,
      undefined,
      payload as never,
      {
        workspaceRoot: '/workspace',
        executeCommand,
      },
    );

    expect(result).toEqual({
      success: false,
      executed: 0,
      results: [],
      unsupported: [],
      error: `Unsupported plugin transfer payload kind: ${kind}`,
    });
    expect(executeCommand).not.toHaveBeenCalled();
  });
});

function createDeps(input: {
  readonly ingest: (request: ContentIngestRequest) => Promise<ContentIngestResult>;
  readonly executeCommand: typeof vscode.commands.executeCommand;
}): PluginTransferBridgeDeps {
  return {
    workspaceRoot: '/workspace',
    ingestService: {
      registerProvider: vi.fn(),
      ingest: input.ingest,
    },
    executeCommand: input.executeCommand,
  };
}

function createGeneratedIngestResult(
  request: ContentIngestRequest,
  paths: { readonly outputPath: string; readonly contractedPath: string },
): ContentIngestResult {
  const assetId = String(request.metadata?.['assetId'] ?? 'asset');
  return {
    status: 'ready',
    request,
    providerId: 'generated-output-content-ingest',
    source: {
      kind: 'generated-asset',
      assetId,
      path: paths.contractedPath,
      promoted: true,
    },
    outputPath: paths.outputPath,
    contractedPath: paths.contractedPath,
  };
}
