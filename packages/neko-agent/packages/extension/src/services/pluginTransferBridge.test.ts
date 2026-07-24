import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  sendGeneratedAssetToPlugin,
  type PersistGeneratedOutputInput,
  type PluginTransferBridgeDeps,
} from './pluginTransferBridge';

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
        persist: async () => ({
          kind: 'workspace-file',
          path: 'neko/generated/image/legacy-frame.png',
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
    const persistCalls: PersistGeneratedOutputInput[] = [];
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
        persist: async (input) => {
          persistCalls.push(input);
          return { kind: 'workspace-file', path: 'neko/generated/image/shot.png' };
        },
        executeCommand,
      }),
    );

    expect(result.success).toBe(true);
    expect(persistCalls).toHaveLength(1);
    expect(persistCalls[0]).toMatchObject({
      sourcePath: '/tmp/agent-private/shot.png',
      outputDirectory: 'neko/generated/image',
      fileNameHint: 'shot.png',
      mediaType: 'image/png',
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
        persist: async () => undefined,
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
        persist: async (input) => {
          const relativePath = `neko/generated/image/${input.fileNameHint}`;
          materializedPaths.push(`/workspace/${relativePath}`);
          return { kind: 'workspace-file', path: relativePath };
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
    const persist = vi.fn();
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
      createDeps({ persist, executeCommand }),
    );

    expect(persist).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/existing.png',
        resourceRef: existingResourceRef,
      }),
    );
  });

  it('does not treat cache-backed generated resource refs as durable Canvas inputs', async () => {
    const persist = vi.fn(async () => ({
      kind: 'workspace-file' as const,
      path: 'neko/generated/image/existing.png',
    }));
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
      createDeps({ persist, executeCommand }),
    );

    expect(persist).toHaveBeenCalledOnce();
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

  it('rejects generated-asset Cut transfer until the OTIO target contract exists', async () => {
    const persist = vi.fn();
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
      },
      createDeps({ persist, executeCommand }),
    );

    expect(result.success).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it.each(['sketch', 'model'] as const)(
    'rejects removed %s authoring transfers without executing a command',
    async (target) => {
      const persist = vi.fn();
      const executeCommand = vi.fn();

      const result = await sendGeneratedAssetToPlugin(
        target,
        undefined,
        undefined,
        {
          kind: 'singleAsset',
          asset: {
            path: '/tmp/agent-private/output.bin',
            mediaType: target === 'sketch' ? 'image' : 'model',
            name: 'output.bin',
          },
        },
        createDeps({ persist, executeCommand }),
      );

      expect(result).toEqual({
        success: false,
        executed: 0,
        results: [],
        unsupported: [{ target, reason: undefined }],
      });
      expect(persist).not.toHaveBeenCalled();
      expect(executeCommand).not.toHaveBeenCalled();
    },
  );

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
  readonly persist: (
    input: PersistGeneratedOutputInput,
  ) => Promise<{ readonly kind: 'workspace-file'; readonly path: string } | undefined>;
  readonly executeCommand: typeof vscode.commands.executeCommand;
}): PluginTransferBridgeDeps {
  return {
    workspaceRoot: '/workspace',
    persistGeneratedOutput: input.persist,
    executeCommand: input.executeCommand,
  };
}
